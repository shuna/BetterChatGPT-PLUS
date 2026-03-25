# Weavelet Canvas — iOS (SwiftUI)

Web版 Weavelet Canvas のネイティブ iOS 移植。SwiftUI + Swift Package で構成。

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  SwiftUI Views (app target)                     │
│  ChatListView, ConversationView, BranchEditor…  │
├─────────────────────────────────────────────────┤
│  ViewModels (@Observable)                       │
│  AppState, ChatListVM, ConversationVM, Settings │
├─────────────────────────────────────────────────┤
│  WeaveletInfra (Swift Package)                  │
│  ├─ ModelFetchService (URLSession, 10 providers)│
│  ├─ LLMClient (SSE streaming)                   │
│  ├─ ChatRepository (Codable + FileManager)       │
│  └─ DefaultProviders                             │
├─────────────────────────────────────────────────┤
│  WeaveletDomain (Swift Package, Foundation only) │
│  ├─ BranchTree (20+ operations)                 │
│  ├─ ContentStore (FNV-1a, delta, GC)            │
│  ├─ TokenBudget + CostCalculation               │
│  ├─ SSEParser + RequestBuilder                   │
│  └─ 全ドメイン型 (Chat, Message, BranchNode…)    │
└─────────────────────────────────────────────────┘
```

## ビルド要件

- Xcode 16+ (iOS 26 SDK)
- Swift 5.10+
- `ios/Weavelet-Canvas.xcworkspace` を開く

## テスト

```bash
cd ios/Packages/WeaveletDomain && swift test
# 142 tests passing
```

## 実装済み機能

### ドメイン層 (WeaveletDomain)
- [x] BranchTree 全操作 (作成/切替/削除/移動/プルーニング/コピー&ペースト)
- [x] ContentStore (FNV-1aハッシュ, デルタ圧縮, 参照カウント, GC)
- [x] TokenBudget + CostCalculation
- [x] SSEParser + RequestBuilder (Azure/OpenRouter対応)
- [x] 全ドメイン型 (Chat, Message, BranchNode, ContentItem, ProviderModel等)
- [x] Web互換 JSON エンコード/デコード (PersistedChat, ExportV3, SyncSnapshot)

### インフラ層 (WeaveletInfra)
- [x] ModelFetchService — 10プロバイダAPIからモデル一覧取得、能力自動検出
- [x] LLMClient — URLSession.bytes SSE ストリーミング、キャンセル対応
- [x] ChatRepository — Codable + FileManager (gzip圧縮、Web互換JSON)
- [x] DefaultProviders — 10社エンドポイント定義

### UI層 (SwiftUI)
- [x] アダプティブレイアウト (iPad 3カラム / iPhone サイドバー+タブ)
- [x] サイドバー: フォルダ(作成/色/展開/削除/並替), チャット(名前変更/クローン/エクスポート/編集モード/ソート)
- [x] メッセージバブル: ブランチスイッチャー, 編集/リジェネ/コピー/削除, 折りたたみ/省略/保護, 上下移動
- [x] チャット入力: ロールセレクタ, 画像添付, / スラッシュコマンド, 保存ボタン
- [x] モデルドロップダウン: お気に入りから選択, プロバイダ管理へ遷移
- [x] ConfigMenu: お気に入りモデル一覧, パラメータスライダー, 推論設定
- [x] プロバイダメニュー: モデル検索/ソート/フィルタ, 能力バッジ, お気に入りチェック
- [x] ブランチエディタ: ツリー可視化, 検索ハイライト, 比較ビュー, 詳細モーダル
- [x] エクスポート: V3 JSON, OpenAI, OpenRouter, Markdown, PNG, gzip, ブランチスコープ切替
- [x] インポート: V3 JSON ファイルピッカー + ContentStore マージ
- [x] トークン/コストバー, メッセージ別トークン表示
- [x] チャット内検索 (ChatFindBar)
- [x] iPadキーボードショートカット (Cmd+N/S/Z/F等)
- [x] デバッグパネル
- [x] サイドバーリサイズハンドル
- [x] オンボーディングウィザード (4ステップ)
- [x] ストリーミングインジケータ + エラーバナー

### 永続化
- [x] Codable + FileManager (Web互換JSON形式)
- [x] バックグラウンド移行時に自動保存, 起動時に自動読み込み
- [x] 設定: UserDefaults

### i18n
- [x] String Catalog (Localizable.xcstrings) — 英語 + 日本語, 45+キー

## Web版 → iOS版 UI パリティ進捗 (2026-03-25)

Web版 (モバイル表示) とiOS版 (iPhone) を画面比較し、差異を一つずつ修正。

### 修正済み

| # | 差異 | 修正内容 | 変更ファイル |
|---|------|---------|------------|
| 1 | 新規チャットにデフォルトシステムメッセージが表示されない | `createNewChat` に `defaultSystemMessage` / `defaultChatConfig` 引数追加。Web版と同じデフォルト文 (`"You are a large language model assistant..."`) を設定 | `ChatListViewModel`, `AppState`, `SettingsViewModel`, `ChatListView`, `KeyboardShortcuts`, `ImportExportView` |
| 2 | メッセージ間の「+」挿入ボタンがない | 各メッセージの前 + 最後のメッセージの後に `insertMessageButton` を追加 | `ConversationView` |
| 3 | トークン/コストバーが非表示 | `displayChatSize` のデフォルトを `true` に変更 (Web版と統一) | `SettingsViewModel` |
| 4 | スクロールナビゲーションボタン (⇈↑↓⇊) がない | Web版と同じ4ボタンを ScrollView 右下に追加 | `ConversationView` |
| 5 | ヘッダーに検索・新規チャットボタンがない | `topBarTrailing` に 🔍 と + ボタンを追加 | `AdaptiveRootView` |
| 6 | `advancedMode` デフォルトが `false` (Web版は `true`) | デフォルトを `true` に変更 → ロールセレクタ・保存ボタン・Omit All トグルが表示 | `SettingsViewModel`, `AppState` |
| 7 | アクションバーが固定配置 (非フローティング) | Web版の `sticky bottom-2` 相当に変更: 半透明カプセル型フローティング + `GeometryReader` でスティッキー位置計算 | `MessageBubbleView` |
| 8 | アクションバーのボタンが中央寄せでない | HStack 内に左右 `Spacer` 追加、ボタン群を中央配置 (Web版 `flex justify-center` と一致) | `MessageBubbleView` |
| 9 | バブル内テキストの左右余白が不均等 | コンテンツ VStack に `.padding(.trailing, 8)` 追加 | `MessageBubbleView` |
| 10 | トークンバーがヘッダー寄りでフッターにない | `TokenCostBar` をツールバー直下 → 入力バーの上 (フッター位置) に移動 | `ConversationView` |

### 確認済み (既に実装されていた機能)

- **ブランチスイッチャー** (`◂ 1/3 ▸` 形式) — `siblingCount > 1` で表示、Web版と同じ条件
- **ブランチ切替** — 前後 sibling ボタンで切替動作
- **メッセージ別トークン数** — `displayChatSize` 時にアクションバー内に `tk` 表示
- **スラッシュコマンドパレット** — `/` 入力で候補表示、Web版と同じ動作

### 残存する意図的なプラットフォーム差異

| 差異 | 理由 |
|------|------|
| 入力方式: Web版はメッセージ直接編集、iOS版は下部入力バー | iOSネイティブUXに準拠 |
| 左下リサイズボタン (↗↙): Web版のみ | デスクトップ専用UI、iOSでは不要 |
| サイドバー開閉: Web版は常時表示可、iOS版はスワイプ/ボタン | iPhoneの画面幅に適応 |
| タブバー (Chat/Branches): iOS版のみ | iOSナビゲーションパターン |

### 変更ファイル一覧 (UIパリティ修正)

```
ViewModels/
  AppState.swift              — loadSettings フォールバック修正, createNewChat 引数追加
  ChatListViewModel.swift     — createNewChat に defaultSystemMessage/defaultChatConfig 引数
  ConversationViewModel.swift — showFindBar プロパティ追加
  SettingsViewModel.swift     — デフォルト値変更 (advancedMode, displayChatSize, defaultSystemMessage)

Views/Chat/
  ConversationView.swift      — +ボタン, スクロールナビ, TokenCostBar をフッターに移動
  MessageBubbleView.swift     — フローティングアクションバー, 中央寄せ, 余白修正

Views/Layout/
  AdaptiveRootView.swift      — ヘッダーに検索+新規チャットボタン

Views/Settings/
  ImportExportView.swift      — createNewChat 引数追加

Views/Layout/
  KeyboardShortcuts.swift     — createNewChat 引数追加
```

## 残課題 (優先度順)

### 高優先度
- [ ] **iCloud 同期** — CKSyncEngine + WeaveletSnapshot 互換形式 (Web版とデータ共有)
- [ ] **Google Drive 同期** — Web版と同形式で JSON アップロード/ダウンロード
- [ ] **バックグラウンドURLSession** — アプリ切替時のLLMストリーム継続 + Cloudflare Worker プロキシ復旧

### 中優先度
- [ ] **Keychain 移行** — APIキーを UserDefaults → Keychain (セキュリティ向上)
- [ ] **KaTeX/LaTeX レンダリング** — swift-markdown + 部分的WKWebView ハイブリッド
- [ ] **i18n 完全カバー** — 現在45キー → Web版200+キー分を追加
- [ ] **プロンプトインポート** — ファイルピッカーからのプロンプトJSONインポート

### 低優先度
- [ ] **V1レガシーエクスポート** — 下位互換形式
- [ ] **macOS対応** — ドメイン層はそのまま再利用可能、UI層をmacOS向けに拡張
- [ ] **watchOS対応** — ドメイン層再利用、簡易チャットUI

## ファイル構成

```
ios/
├── .gitignore
├── README.md                          ← このファイル
├── Weavelet-Canvas.xcworkspace/       ← Xcode ワークスペース
├── Weavelet-Canvas/
│   └── Weavelet-Canvas/
│       ├── Weavelet_CanvasApp.swift   ← エントリポイント
│       ├── Localizable.xcstrings      ← i18n String Catalog
│       ├── ViewModels/                ← @Observable ViewModels
│       │   ├── AppState.swift
│       │   ├── ChatListViewModel.swift
│       │   ├── ConversationViewModel.swift
│       │   └── SettingsViewModel.swift
│       └── Views/
│           ├── BranchEditor/          ← ブランチエディタ (6ファイル)
│           ├── Chat/                  ← チャットUI (7ファイル)
│           ├── Layout/                ← レイアウト (3ファイル)
│           ├── Markdown/              ← Markdownレンダラ (2ファイル)
│           ├── Onboarding/            ← ウィザード (1ファイル)
│           └── Settings/              ← 設定画面 (8ファイル)
├── Packages/
│   ├── WeaveletDomain/                ← ドメインロジック (142テスト)
│   │   ├── Sources/WeaveletDomain/
│   │   │   ├── API/                   ← SSEParser, RequestBuilder
│   │   │   ├── BranchTree/            ← ブランチツリー操作
│   │   │   ├── ContentStore/          ← コンテンツストア
│   │   │   ├── Models/                ← ドメイン型定義
│   │   │   └── TokenBudget/           ← トークン/コスト計算
│   │   └── Tests/
│   └── WeaveletInfra/                 ← インフラ層
│       ├── Sources/WeaveletInfra/
│       │   ├── Network/               ← ModelFetch, LLMClient, DefaultProviders
│       │   └── Persistence/           ← ChatRepository
│       └── Tests/
```
