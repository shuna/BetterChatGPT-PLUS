# SwiftUI ネイティブアプリ移植検討

## 概要

Weavelet Canvas（React + TypeScript + Electron）を SwiftUI ベースのネイティブ macOS/iOS アプリへ移植する際の技術的検討をまとめる。

---

## 1. 現行アーキテクチャの整理

| レイヤー | 現行技術 | 主要ファイル |
|---------|---------|-------------|
| UI フレームワーク | React 18 + Tailwind CSS | `src/components/` |
| 状態管理 | Zustand (8 スライス構成) | `src/store/store.ts` |
| データモデル | TypeScript interfaces | `src/types/chat.ts` |
| API 通信 | fetch + ReadableStream (SSE) | `src/api/api.ts` |
| ブランチロジック | カスタム DAG 操作 | `src/store/branch-domain.ts` |
| コンテンツ重複排除 | ContentStore (FNV-1a ハッシュ) | `src/utils/contentStore.ts` |
| 永続化 | lz-string 圧縮 + localStorage | `src/store/persistence.ts` |
| ブランチエディタ | ReactFlow + Dagre + Web Worker | `src/components/BranchEditor/` |
| デスクトップ | Electron 23 | `electron/index.cjs` |
| 国際化 | i18next (19 言語) | `src/i18n.ts` |

---

## 2. SwiftUI 移植における技術マッピング

### 2.1 状態管理

| React (Zustand) | SwiftUI | 備考 |
|-----------------|---------|------|
| `useStore()` | `@Observable` (Swift 5.9+) | Observation フレームワーク推奨 |
| スライス分割 | `@Observable class` × N | ChatManager, BranchManager 等 |
| `persist` ミドルウェア | `Codable` + FileManager | 後述の永続化戦略参照 |
| `subscribeWithSelector` | Combine `Publisher` / onChange | 選択的監視 |

**推奨構成:**

```swift
@Observable
class AppState {
    var chatManager = ChatManager()
    var branchManager = BranchManager()
    var configManager = ConfigManager()
    var providerManager = ProviderManager()
    var contentStore = ContentStore()
}
```

### 2.2 データモデル

TypeScript → Swift の型変換は比較的ストレートフォワード:

```swift
enum Role: String, Codable { case user, assistant, system }

enum ContentPart: Codable {
    case text(String)
    case imageUrl(url: String, detail: ImageDetail)
}

struct MessageData: Codable, Identifiable {
    let id: String
    let role: Role
    let content: [ContentPart]
}

struct BranchNode: Codable, Identifiable {
    let id: String
    let parentId: String?
    let role: Role
    let contentHash: String
    let createdAt: Date
    var label: String?
}

struct BranchTree: Codable {
    var nodes: [String: BranchNode]
    var rootId: String
    var activePath: [String]
}

struct Chat: Codable, Identifiable {
    let id: String
    var title: String
    var folder: String?
    var messages: [MessageData]
    var config: ChatConfig
    var branchTree: BranchTree?
}
```

**難易度: 低** — 型定義の移植は機械的に行える。

### 2.3 API 通信 (ストリーミング)

| 現行 | SwiftUI ネイティブ |
|-----|------------------|
| `fetch()` | `URLSession` |
| `ReadableStream` (SSE) | `URLSession.bytes(from:)` + `AsyncStream` |
| `AbortController` | `Task.cancel()` |
| `TextDecoder` | `String(data:encoding:)` |

```swift
func streamChatCompletion(
    endpoint: URL,
    messages: [MessageData],
    config: ChatConfig,
    apiKey: String
) -> AsyncThrowingStream<StreamDelta, Error> {
    AsyncThrowingStream { continuation in
        let task = Task {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONEncoder().encode(requestBody)

            let (bytes, response) = try await URLSession.shared.bytes(from: request)
            for try await line in bytes.lines {
                guard line.hasPrefix("data: ") else { continue }
                let json = String(line.dropFirst(6))
                if json == "[DONE]" { break }
                if let delta = parseStreamDelta(json) {
                    continuation.yield(delta)
                }
            }
            continuation.finish()
        }
        continuation.onTermination = { _ in task.cancel() }
    }
}
```

**難易度: 中** — AsyncStream パターンの理解が必要だが、概念的には同等。

### 2.4 ブランチエディタ (UIKit ベース実装)

現行の ReactFlow ベース DAG ビジュアライゼーションは最も複雑なコンポーネントだが、
**UIKit (`UIScrollView` + Core Graphics) で実装** することにより、SwiftUI Canvas の制約を回避する。

#### 2.4.1 アプローチ比較

| アプローチ | メリット | デメリット |
|-----------|---------|-----------|
| **A. UIKit (UIScrollView + CALayer)** ★推奨 | 高性能、ズーム/パン標準対応、成熟した API | SwiftUI との橋渡しが必要 |
| B. SwiftUI Canvas | 宣言的 UI | 大規模グラフで性能不安、ジェスチャ制約 |
| C. SpriteKit | ゲーム向け高性能 | オーバースペック、学習コスト |
| D. WebView 埋め込み | 既存コード再利用 | ネイティブ感喪失 |
| E. OSS ライブラリ活用 (後述) | 初期コスト削減 | カスタマイズ・追従コスト |

**UIKit スクラッチを選択する理由:**
- `UIScrollView` がズーム (0.1x〜2.0x) とパンを標準サポート
- `CALayer` ベースのノード描画は数百ノードでも高速
- `UIContextMenuInteraction` でネイティブコンテキストメニュー
- `UIKit Dynamics` でアニメーション対応
- SwiftUI からは `UIViewRepresentable` で統合
- 外部依存なしで長期保守が容易

#### 2.4.1.1 OSS ライブラリ (Make or Buy) の検討

Swift/iOS のノードエディタ系ライブラリを調査し、スクラッチ実装と比較検討した。

**調査した主なライブラリ:**

| ライブラリ | 概要 | Stars | 描画方式 |
|-----------|------|-------|---------|
| [AudioKit/Flow](https://github.com/AudioKit/Flow) | SwiftUI Canvas ノードグラフエディタ | 390 | Canvas 一括描画 |
| [ShinpuruNodeUI](https://github.com/FlexMonkey/ShinpuruNodeUI) | UIKit ノード UI | — | CAShapeLayer |
| [EasyNodeEditor](https://github.com/yukiny0811/easy-node-editor) | SwiftUI 宣言的ノードエディタ | — | SwiftUI |
| [Grape](https://github.com/SwiftGraphs/Grape) | 力学シミュレーショングラフ | — | SwiftUI |

最も有力な候補は **AudioKit/Flow** で、Canvas ベースの高速描画・ズーム/パン/ドラッグ・ワイヤー描画を備え MIT ライセンスで改造自由。機能的にはブランチエディタの要件をカバーできる。

**しかし、スクラッチを選択した理由:**

Flow が節約してくれるのはズーム/パン/ドラッグ/エッジ描画だが、これらは UIKit 標準 API (`UIScrollView`, `CAShapeLayer`) でほぼ同等に実現でき、初期コスト差は小さい。一方で:

1. **カスタマイズ深度**: ノード外見 (ロールバッジ、2行プレビュー、アクティブパスハイライト)、マルチツリー表示、クロスツリードラッグ等、ブランチエディタ固有の要件が多い。Flow の内部設計はオーディオパッチ向けに最適化されており、改造が深くなるほど乖離が拡大する
2. **レイアウトエンジン**: いずれのライブラリも Dagre 相当の階層自動レイアウトを持たない。最も工数のかかるレイアウトエンジン (Sugiyama アルゴリズム) は自前実装が必要で、ここはライブラリ採用でも削減できない
3. **追従コスト**: フォーク改造は上流更新への継続的な追従コストが発生する。大幅に書き換えるとフォークの意味が薄れ、保守負担だけが残る
4. **依存の少なさ**: UIKit 標準 API のみで構成すれば外部依存ゼロとなり、OS アップデートへの追従も容易

**結論**: ライブラリが節約する初期コスト < カスタマイズ・追従の継続コスト。スクラッチ実装が適切。

#### 2.4.2 現行レイアウトパラメータ

```
Dagre レイアウト設定:
  rankdir:  TB (上から下)
  nodesep:  80px (横方向ノード間隔)
  ranksep:  100px (縦方向ランク間隔)

ノードサイズ:
  NODE_W:   280px
  NODE_H:   80px
  TREE_GAP: 120px (マルチツリー時の横間隔)

ズーム:
  minZoom:  0.1 (10%)
  maxZoom:  2.0 (200%)
  fitView:  padding 0.2

カメラフォーカス:
  duration: 400ms
  zoom:     1.2x
  center:   (x + 140, y + 40) = ノード中心
```

#### 2.4.3 ノードの仕様

**MessageNode (280×80px):**
- ロールバッジ: user=青, assistant=緑, system=紫
- コンテンツプレビュー: 先頭 80 文字、2行クランプ
- 上下の接続ハンドル (エッジ接続点)
- アクティブ状態: カラーボーダー (2px)、フル不透明
- 非アクティブ状態: グレーボーダー、80% 不透明

**ConversationHeaderNode (マルチビュー時のみ):**
- 最上ノードの 50px 上に配置
- 会話色ドット + タイトル
- 4色パレット: 青 `#3b82f6`, ティール `#14b8a6`, オレンジ `#f97316`, 紫 `#a855f7`

#### 2.4.4 エッジの仕様

- 描画: ベジェ曲線 (親→子、上→下方向)
- アクティブパス: strokeWidth=2, 会話色
- 非アクティブ: strokeWidth=1, グレー `#6b7280`

#### 2.4.5 インタラクション一覧

| 操作 | 動作 |
|-----|------|
| タップ | ノード選択 → MessageDetailModal 表示 |
| ダブルタップ | チャットビューの該当メッセージへナビゲーション |
| ロングプレス / 右クリック | コンテキストメニュー (5 アクション) |
| ドラッグ | ノード移動 (マルチビュー時はクロスツリー移動検出) |
| ピンチ | ズーム (0.1x〜2.0x) |
| パン | スクロール |

**コンテキストメニュー:**
1. メッセージをコピー (このノードからリーフまで)
2. メッセージをペースト (クリップボードがあれば)
3. ブランチを比較 (差分ビューア)
4. メッセージへ移動 (チャットビューへ)
5. ブランチを削除 (サブツリー削除)

#### 2.4.6 UIKit 実装設計

```swift
// SwiftUI から UIKit へのブリッジ
struct BranchEditorRepresentable: UIViewControllerRepresentable {
    let entries: [BranchEditorEntry]
    let contentStore: ContentStore
    @Binding var selectedNodeId: String?

    func makeUIViewController(context: Context) -> BranchEditorViewController {
        BranchEditorViewController()
    }

    func updateUIViewController(_ vc: BranchEditorViewController, context: Context) {
        vc.updateEntries(entries, contentStore: contentStore)
    }
}

// メインビューコントローラ
class BranchEditorViewController: UIViewController {
    private let scrollView = UIScrollView()
    private let canvasView = BranchCanvasView()  // カスタム UIView
    private var nodeViews: [String: MessageNodeView] = [:]
    private var edgeLayers: [String: CAShapeLayer] = [:]
    private let layoutQueue = DispatchQueue(label: "branch.layout", qos: .userInitiated)

    override func viewDidLoad() {
        super.viewDidLoad()
        scrollView.delegate = self
        scrollView.minimumZoomScale = 0.1
        scrollView.maximumZoomScale = 2.0
        scrollView.addSubview(canvasView)
        view.addSubview(scrollView)
    }

    func updateEntries(_ entries: [BranchEditorEntry], contentStore: ContentStore) {
        // GCD でバックグラウンドレイアウト計算
        layoutQueue.async { [weak self] in
            let layout = HierarchicalLayoutEngine.compute(
                entries: entries,
                nodeSize: CGSize(width: 280, height: 80),
                nodeSep: 80,
                rankSep: 100,
                treeGap: 120
            )
            DispatchQueue.main.async {
                self?.applyLayout(layout, contentStore: contentStore)
            }
        }
    }

    private func applyLayout(_ layout: LayoutResult, contentStore: ContentStore) {
        // ノード更新 (差分適用)
        for nodeLayout in layout.nodes {
            let nodeView = nodeViews[nodeLayout.id] ?? createNodeView(nodeLayout)
            UIView.animate(withDuration: 0.3) {
                nodeView.frame = nodeLayout.frame
            }
            nodeView.configure(with: nodeLayout, contentStore: contentStore)
        }

        // エッジ更新 (CAShapeLayer ベジェ曲線)
        for edge in layout.edges {
            let layer = edgeLayers[edge.id] ?? createEdgeLayer(edge)
            let path = UIBezierPath()
            path.move(to: edge.from)
            path.addCurve(to: edge.to,
                          controlPoint1: CGPoint(x: edge.from.x, y: (edge.from.y + edge.to.y) / 2),
                          controlPoint2: CGPoint(x: edge.to.x, y: (edge.from.y + edge.to.y) / 2))
            layer.path = path.cgPath
            layer.strokeColor = edge.isActive ? edge.color.cgColor : UIColor.gray.cgColor
            layer.lineWidth = edge.isActive ? 2 : 1
        }

        // キャンバスサイズ調整
        canvasView.frame.size = layout.canvasSize
        scrollView.contentSize = layout.canvasSize
    }
}

// UIScrollView ズームデリゲート
extension BranchEditorViewController: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        canvasView
    }
}

// メッセージノードビュー
class MessageNodeView: UIView {
    private let roleBadge = UILabel()
    private let contentLabel = UILabel()
    private let labelText = UILabel()

    func configure(with layout: NodeLayout, contentStore: ContentStore) {
        // ロールバッジ
        roleBadge.text = layout.role.rawValue
        roleBadge.backgroundColor = layout.role.badgeColor

        // コンテンツプレビュー (80文字、2行)
        if let content = contentStore.resolve(layout.contentHash) {
            contentLabel.text = String(content.textPreview.prefix(80))
        }
        contentLabel.numberOfLines = 2

        // アクティブ状態
        layer.borderWidth = 2
        layer.borderColor = layout.isActive ? layout.conversationColor.cgColor : UIColor.systemGray4.cgColor
        alpha = layout.isActive ? 1.0 : 0.8
        layer.cornerRadius = 8
    }
}
```

#### 2.4.7 レイアウトエンジン (Dagre 代替)

```swift
/// 階層レイアウトエンジン (Sugiyama アルゴリズムベース)
class HierarchicalLayoutEngine {

    struct LayoutResult {
        let nodes: [NodeLayout]
        let edges: [EdgeLayout]
        let canvasSize: CGSize
    }

    /// Dagre 相当の階層レイアウトを計算
    /// 各ツリーを独立にレイアウトし、横方向にオフセットで配置
    static func compute(
        entries: [BranchEditorEntry],
        nodeSize: CGSize,
        nodeSep: CGFloat,
        rankSep: CGFloat,
        treeGap: CGFloat
    ) -> LayoutResult {
        var allNodes: [NodeLayout] = []
        var allEdges: [EdgeLayout] = []
        var xOffset: CGFloat = 0

        for (index, entry) in entries.enumerated() {
            let color = conversationColors[index % 4]
            let treeResult = layoutTree(
                tree: entry.tree,
                activePath: Set(entry.tree.activePath),
                nodeSize: nodeSize,
                nodeSep: nodeSep,
                rankSep: rankSep,
                color: color
            )

            // X オフセット適用
            let offsetNodes = treeResult.nodes.map { node in
                var n = node
                n.frame.origin.x += xOffset
                return n
            }
            let offsetEdges = treeResult.edges.map { edge in
                var e = edge
                e.from.x += xOffset
                e.to.x += xOffset
                return e
            }

            allNodes.append(contentsOf: offsetNodes)
            allEdges.append(contentsOf: offsetEdges)
            xOffset += treeResult.maxX + treeGap
        }

        let canvasSize = CGSize(
            width: allNodes.map { $0.frame.maxX }.max() ?? 0 + 40,
            height: allNodes.map { $0.frame.maxY }.max() ?? 0 + 40
        )

        return LayoutResult(nodes: allNodes, edges: allEdges, canvasSize: canvasSize)
    }

    /// 個別ツリーのレイアウト (Sugiyama: rank 割当 → 順序最適化 → 座標割当)
    private static func layoutTree(
        tree: BranchTree,
        activePath: Set<String>,
        nodeSize: CGSize,
        nodeSep: CGFloat,
        rankSep: CGFloat,
        color: UIColor
    ) -> TreeLayoutResult {
        // 1. ランク割当 (BFS で深さ計算)
        // 2. 同ランク内の順序最適化 (交差最小化)
        // 3. 座標割当 (中央揃え)
        // ... 実装省略 (Sugiyama アルゴリズム)
    }
}
```

#### 2.4.8 パフォーマンス設計

| 最適化 | 手法 |
|-------|------|
| レイアウト計算 | `DispatchQueue` でバックグラウンドスレッド実行 |
| ノード描画 | `CALayer` ベース、ラスタライズ有効化 |
| エッジ描画 | `CAShapeLayer` で GPU 描画 |
| 差分更新 | ノード追加/削除時のみビュー生成、位置はアニメーション |
| メモリ | 画面外ノードの `CALayer.shouldRasterize` で軽量化 |
| 構造キャッシュ | レイアウトキー = ノードID:parentId:role:label のソート済み結合 |

**難易度: 高** — ただし SwiftUI Canvas 案より大幅に現実的。UIScrollView のズーム/パン標準対応と CAShapeLayer による高速描画により、ReactFlow 相当の操作感を実現可能。

### 2.5 永続化

| 現行 | SwiftUI ネイティブ |
|-----|------------------|
| localStorage + lz-string | FileManager + `Codable` JSON |
| IndexedDB フォールバック | Core Data / SwiftData |
| Google Drive 同期 | Google Drive API (Swift SDK) / CloudKit |
| スキーマ v0-v15 マイグレーション | `Codable` + バージョン付きデコード |

**推奨アプローチ:**

```
┌─────────────────────────────────────────────┐
│           PersistenceManager                │
├─────────────────────────────────────────────┤
│ ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│ │ JSON File│  │ SwiftData │  │ CloudKit  │ │
│ │ (チャット) │  │ (検索/索引)│  │ (同期)    │ │
│ └──────────┘  └───────────┘  └───────────┘ │
└─────────────────────────────────────────────┘
```

- **チャットデータ**: JSON ファイル (Documents ディレクトリ) — 既存フォーマットとの互換性維持
- **検索・インデックス**: SwiftData で高速クエリ対応
- **クラウド同期**: CloudKit (Apple エコシステム) または Google Drive API 継続
- **マイグレーション**: `CodingKeys` + カスタム `init(from:)` でバージョン対応

**難易度: 中〜高** — 16バージョンのマイグレーション移植が主な工数。

### 2.6 コンテンツ重複排除 (ContentStore)

現行の FNV-1a ハッシュベース ContentStore は Swift で忠実に再実装可能:

```swift
@Observable
class ContentStore {
    private var entries: [String: ContentEntry] = [:]

    struct ContentEntry: Codable {
        let content: [ContentPart]
        var refCount: Int
    }

    func add(_ content: [ContentPart]) -> String {
        let hash = computeHash(content)
        if let existing = entries[hash] {
            entries[hash]!.refCount += 1
        } else {
            entries[hash] = ContentEntry(content: content, refCount: 1)
        }
        return hash
    }

    func release(_ hash: String) {
        guard var entry = entries[hash] else { return }
        entry.refCount -= 1
        if entry.refCount <= 0 {
            entries.removeValue(forKey: hash)
        } else {
            entries[hash] = entry
        }
    }

    func resolve(_ hash: String) -> [ContentPart]? {
        entries[hash]?.content
    }

    private func computeHash(_ content: [ContentPart]) -> String {
        let data = try! JSONEncoder().encode(content)
        // FNV-1a ハッシュ
        var hash: UInt32 = 0x811c9dc5
        for byte in data {
            hash ^= UInt32(byte)
            hash &*= 0x01000193
        }
        return String(hash, radix: 16)
    }
}
```

**難易度: 低** — ロジックは単純で移植容易。

### 2.7 国際化

| 現行 | SwiftUI |
|-----|---------|
| i18next + JSON ファイル | `String(localized:)` + `.strings` / `.xcstrings` |
| 19 言語 | Xcode ローカライゼーションカタログ |

- 既存の JSON ファイルをスクリプトで `.xcstrings` に変換可能
- SwiftUI の `LocalizedStringKey` でネイティブ対応
- 動的言語切り替えは `@AppStorage("language")` + Environment で実現

**難易度: 低** — ツールによる自動変換が可能。

---

## 3. 対象プラットフォームと最小要件

| プラットフォーム | 最小バージョン | 理由 |
|---------------|-------------|------|
| **macOS** | 14.0 (Sonoma) | `@Observable` マクロ、SwiftData |
| **iOS** | 17.0 | 同上 |
| **iPadOS** | 17.0 | Split View でのブランチエディタ活用 |
| **visionOS** | 1.0 | 将来拡張（空間コンピューティング） |

Swift 5.9+ / Xcode 15+ を前提とする。

---

## 4. フェーズ別実装計画

### Phase 1: 基盤構築 (推定 4-6 週)

| タスク | 難易度 | 依存 |
|-------|-------|------|
| Swift Package 構成 (SPM) | 低 | — |
| データモデル定義 (`Codable`) | 低 | — |
| ContentStore 実装 | 低 | データモデル |
| 永続化レイヤー (JSON + FileManager) | 中 | データモデル |
| 基本 API クライアント (非ストリーミング) | 中 | データモデル |
| AppState / ObservableObject 構成 | 中 | 全モデル |

### Phase 2: コア機能 (推定 6-8 週)

| タスク | 難易度 | 依存 |
|-------|-------|------|
| チャットリスト UI | 低 | Phase 1 |
| チャットビュー (メッセージ表示) | 中 | Phase 1 |
| メッセージ入力 + 送信 | 中 | API クライアント |
| ストリーミングレスポンス | 高 | API クライアント |
| ブランチドメインロジック (branch-domain 移植) | 高 | ContentStore |
| メッセージ編集 + 再生成 | 中 | ブランチロジック |
| フォルダ管理 | 低 | AppState |
| Markdown + コードハイライト表示 | 中 | — |

#### Markdown レンダリング方針

**要件整理:**
- **必須**: GFM (見出し・リスト・テーブル・太字・斜体・取消線) + コードブロックの基本ハイライト
- **不要**: LaTeX 数式レンダリング、多プログラム言語対応のシンタックスハイライト

**Apple 標準 API の限界:**

`AttributedString(markdown:)` (iOS 15+) はインライン要素 (太字, 斜体, リンク) のみ対応。
見出し・リスト・テーブル・コードブロック等のブロック要素は非対応のため、標準 API だけでは不十分。

**選択: [MarkdownView](https://github.com/nicholasbrandenburg/MarkdownView) ライブラリ**

| 候補 | 評価 |
|------|------|
| **MarkdownView** ★採用 | `apple/swift-markdown` (CommonMark AST) → SwiftUI View ツリー再帰生成。GFM・コードブロック対応。X (Grok), Hugging Face Chat で採用実績あり |
| SwiftyMarkdown | Markdown → `NSAttributedString` 変換。ブロック要素対応だが SwiftUI ネイティブではない |
| 自前実装 (`swift-markdown` AST → View) | 完全な制御が可能だが、ブロック要素の種類が多く初期コスト高。ブランチエディタと異なりカスタマイズ要件が少ないため過剰 |

**ブランチエディタ (スクラッチ) との判断の違い:**

ブランチエディタは固有要件が多くライブラリの節約効果が薄かったが、Markdown レンダリングは CommonMark 仕様に沿った標準的な処理であり、カスタマイズ要件が少ない。ライブラリの恩恵が大きく、Make or Buy の判断が逆になる。

**構成:**

```
パース:   apple/swift-markdown (MarkdownView 内部で使用)
描画:     MarkdownView (SwiftUI View ツリー)
コード:   MarkdownView 標準のコードブロック表示 + 基本的なフォント/背景色スタイリング
```

**対応するビュー:**
- `MarkdownContentView.swift` — MarkdownView ラッパー。テーマ・フォント設定を注入
- `CodeBlockView.swift` — コードブロックのカスタムスタイリング (モノスペースフォント、背景色、コピーボタン)

**Web 版から削減される機能:**
- `rehype-katex` / `remark-math` → 不要 (LaTeX 非対応)
- `rehype-highlight` の多言語対応 → 不要 (基本ハイライトのみ)
- `markdownStreamingPolicy` (ストリーミング中の描画モード切替) → MarkdownView の差分更新で対応。パフォーマンス問題が出た場合のみ debounce を検討

### Phase 3: 高度な機能 (推定 6-9 週)

| タスク | 難易度 | 依存 |
|-------|-------|------|
| ブランチエディタ (UIKit: UIScrollView + CALayer) | 高 | Phase 2 |
| Sugiyama 階層レイアウトアルゴリズム | 中 | — |
| ブランチ差分ビューア | 中 | ブランチエディタ |
| インポート/エクスポート | 中 | データモデル |
| マルチプロバイダー対応 | 中 | API クライアント |
| Google Drive / CloudKit 同期 | 高 | 永続化 |
| 設定画面 | 低 | AppState |
| 多言語対応 | 低 | — |

### Phase 4: 仕上げ (推定 4-6 週)

| タスク | 難易度 | 依存 |
|-------|-------|------|
| macOS メニューバー統合 | 低 | — |
| キーボードショートカット | 低 | — |
| iPad Split View 最適化 | 中 | Phase 3 |
| パフォーマンスチューニング | 中 | 全体 |
| アクセシビリティ (VoiceOver) | 中 | UI 完成後 |
| テスト (XCTest + UI テスト) | 中 | 全体 |
| App Store 申請準備 | 低 | 全体 |

**合計見積: 20-29 週 (1 名フルタイム)**

---

## 5. メリットとリスク

### メリット

| 項目 | 詳細 |
|-----|------|
| **パフォーマンス** | ネイティブ描画による高速 UI、特にブランチエディタ |
| **メモリ効率** | Web ランタイム (V8/Blink) 不要、メモリ使用量 1/3〜1/5 |
| **OS 統合** | Spotlight 検索、共有シート、ウィジェット、Shortcuts |
| **セキュリティ** | Keychain による API キー管理 (localStorage より安全) |
| **バッテリー** | Electron 比で大幅改善 |
| **配信** | App Store / TestFlight での配信・アップデート |
| **visionOS** | 将来的な空間コンピューティング対応 |

### リスク

| リスク | 影響度 | 対策 |
|-------|-------|------|
| ブランチエディタの再実装コスト | 中 | UIKit (UIScrollView + CALayer) で実装、SwiftUI Canvas より現実的 |
| UIKit / SwiftUI 間のブリッジ管理 | 中 | UIViewRepresentable で統合、状態同期に注意 |
| 16 バージョンのマイグレーション移植 | 中 | 最新スキーマのみ対応し、旧バージョンは Web 版で変換 |
| マルチプラットフォーム (macOS + iOS) の UI 分岐 | 中 | `#if os(macOS)` で最小限の分岐 |
| Electron 版との機能パリティ維持 | 中 | 段階的移行、Web 版は当面維持 |
| ストリーミング SSE の iOS バックグラウンド制約 | 中 | `BGProcessingTask` で対応 |

---

## 6. 代替案の比較

| アプローチ | 工数 | ネイティブ感 | 保守性 |
|-----------|-----|------------|-------|
| **A. フル SwiftUI 書き直し** (本案) | 大 | 最高 | 高 |
| **B. Tauri (Rust + WebView)** | 小 | 低 | 中 |
| **C. React Native** | 中 | 中 | 中 (ブリッジコスト) |
| **D. Capacitor (Ionic)** | 小 | 低 | 中 |
| **E. Kotlin Multiplatform + SwiftUI** | 中 | 高 | 高 (ロジック共有) |

**B〜D は WebView ベースのためブランチエディタの性能問題を根本解決できない。**
**E は有力な代替案だが、Kotlin Multiplatform の学習コストを考慮する必要がある。**

---

## 7. 推奨アクション

1. **MVP スコープの定義**: ブランチエディタを除いた基本チャット機能で MVP を構築
2. **プロトタイプ**: Phase 1 を 2-3 週で実装し、SwiftUI の適合性を検証
3. **ブランチエディタ PoC**: UIKit (UIScrollView + CALayer) でのグラフ描画性能を早期検証
4. **データ互換性**: 既存 Web 版とのデータインポート/エクスポート互換を確保
5. **段階的移行**: Web 版 (Electron) は当面維持し、並行開発

---

## 8. プロジェクト構成案

```
WeaveletCanvas/
├── Package.swift
├── Sources/
│   ├── App/
│   │   ├── WeaveletCanvasApp.swift
│   │   └── AppState.swift
│   ├── Models/
│   │   ├── Chat.swift
│   │   ├── Message.swift
│   │   ├── BranchTree.swift
│   │   ├── BranchNode.swift
│   │   ├── Provider.swift
│   │   └── ChatConfig.swift
│   ├── Store/
│   │   ├── ChatManager.swift
│   │   ├── BranchManager.swift
│   │   ├── ContentStore.swift
│   │   ├── ConfigManager.swift
│   │   └── ProviderManager.swift
│   ├── Services/
│   │   ├── APIClient.swift
│   │   ├── StreamingClient.swift
│   │   ├── PersistenceManager.swift
│   │   ├── MigrationService.swift
│   │   └── CloudSyncService.swift
│   ├── Views/
│   │   ├── ChatList/
│   │   │   ├── ChatListView.swift
│   │   │   ├── ChatRowView.swift
│   │   │   └── FolderView.swift
│   │   ├── Chat/
│   │   │   ├── ChatView.swift
│   │   │   ├── MessageView.swift
│   │   │   ├── MessageInputView.swift
│   │   │   └── MarkdownContentView.swift
│   │   ├── BranchEditor/              # UIKit ベース
│   │   │   ├── BranchEditorRepresentable.swift   # SwiftUI ↔ UIKit ブリッジ
│   │   │   ├── BranchEditorViewController.swift  # メイン UIViewController
│   │   │   ├── BranchCanvasView.swift            # カスタム UIView (CALayer)
│   │   │   ├── MessageNodeView.swift             # ノードビュー (UIView)
│   │   │   ├── BranchDiffViewController.swift    # 差分ビューア
│   │   │   └── MessageDetailViewController.swift # メッセージ詳細
│   │   ├── Settings/
│   │   │   ├── SettingsView.swift
│   │   │   ├── ProviderSettingsView.swift
│   │   │   └── ModelSettingsView.swift
│   │   └── Shared/
│   │       ├── CodeBlockView.swift
│   │       └── LaTeXView.swift
│   ├── Layout/
│   │   ├── HierarchicalLayoutEngine.swift  # Sugiyama アルゴリズム (Dagre 代替)
│   │   └── LayoutTypes.swift               # NodeLayout, EdgeLayout 等
│   └── Utils/
│       ├── FNVHash.swift
│       ├── TokenCounter.swift
│       └── ImportExportService.swift
├── Tests/
│   ├── ModelTests/
│   ├── StoreTests/
│   └── ServiceTests/
└── Resources/
    └── Localizable.xcstrings
```

---

*作成日: 2025-03-15*
*対象プロジェクト: Weavelet Canvas v1.27.0*
