# Branch Editor Metadata / Discovery 機能整理

## 概要

分岐エディタを単なる可視化ではなく、複数案の整理・再訪・比較のための作業面として使えるようにする。

前提:

- データモデルは **tree のまま維持** する
- 会話クライアントであり、DAG 化や merge は行わない
- 追加する機能は「構造の自由化」よりも「整理・検索・比較・保護」を優先する

---

## 目的

現状の branch editor は以下ができる:

- ノード単位の分岐作成
- active path の切り替え
- branch diff（active path vs 代替パス）
- branch sequence の copy / paste / move
- hidden node の prune
- ノード内容の全文検索（BranchSearchBar、scope 切替、履歴対応）
- label の設定（renameBranchNode — ただし undo 不可、UI 未露出）

一方で不足している:

- 重要な枝を後で拾い直す導線（star）
- label / メタデータを一覧・検索する導線（discovery UI）
- subtree を整理対象から守る導線（pin）

この不足を埋める。

---

## 既存実装の把握

以下は既に実装済みであり、本プランではこれらを前提・拡張対象とする:

### データモデル（src/types/chat.ts）

```ts
// 現行の BranchNode（label は実装済み）
interface BranchNode {
  id: string;
  parentId: string | null;
  role: Role;
  contentHash: string;
  createdAt: number;
  label?: string;        // ← 既存。renameBranchNode() で設定可能
}
```

### label の現状

- **データモデル**: `BranchNode.label?: string` — 実装済み
- **Store アクション**: `renameBranchNode()` — 実装済み。ただし `setChats()` 直接呼び出しで **undo 不可**
- **MessageNode 表示**: ヘッダー行に label を truncate 表示 — 実装済み
- **MessageDetailModal**: ヘッダーに label 表示 — 実装済み
- **コンテキストメニュー**: label 編集の項目は **未実装**（現在は Copy/Paste/Compare/Navigate/Delete の 5 項目のみ）
- **インライン編集**: **未実装**

### 検索インフラ

- `branchSearch.ts` — `searchBranchNodes()` でコンテンツ全文検索（scope: all | activePath、DFS 順）
- `BranchSearchBar.tsx` — 検索 UI（履歴、スコープトグル、結果ナビ、Enter/Shift+Enter/Arrow）
- `search-slice.ts` — SearchSlice（query, history, scope, results, matchedNodeIds, currentResultIndex）

### Diff/Compare

- `BranchDiffModal.tsx` — active path vs 代替パスの word-level diff
- pathA / pathB は root からの完全パスを前提に index ベースで並列比較
- コンテキストメニューの「Compare Branches」から起動
- **制約: 任意の 2 ノード間比較は未対応**（現在は active path に対する代替パスのみ）

### MessageNode レイアウト（nodes/MessageNode.tsx）

- 固定幅 `w-[280px]`、`px-3 py-2`
- ヘッダー行: `flex items-center gap-2` に role badge + label（truncate）
- コンテンツ: `line-clamp-2` で本文プレビュー
- ホバー時: 右上に menu button（⋯）を `absolute -top-1 -right-1` で表示
- star / pin アイコンの配置スペースは現状なし

### Persistence

- IndexedDB に chats / contentStore / branchClipboard を保存
- BranchNode の optional フィールド追加は後方互換（migration 不要）
- Export V3 は ChatInterface.branchTree をそのまま含むため、新フィールドは自動的に export される

### Undo/Redo

- `BranchSnapshot = { chats, contentStore }` の全 state snapshot 方式
- `branchHistoryPast[]` / `branchHistoryFuture[]`（上限 50）
- `applyBranchState()` 経由で snapshot を取る
- **注意**: `renameBranchNode()` は `applyBranchState()` を呼ばず `setChats()` 直接のため undo 対象外

### Branch clipboard

- `copyBranchSequenceState()` はノードを `{ ...tree.nodes[id] }` で shallow copy
- `pasteBranchSequenceState()` は `{ ...srcNode, id: newId, parentId: prevId, createdAt: Date.now() }` で新ノード作成
- スプレッド演算子により、`label` / `starred` / `pinned` は**コピー元からコピー先に自動的に引き継がれる**

---

## スコープ

### 今回の対象（Phase 1-3）

1. ノードメタデータ
   - label UI の完成 + undo 対応（データモデルは既存）
   - star
   - pin

2. Discovery UI（現在のチャット内スコープ）
   - starred nodes 一覧
   - 既存検索インフラの拡張（label / star フィルタ追加）
   - 該当ノード一覧表示
   - 一覧からノードへジャンプ

3. 比較機能の拡張
   - 任意ノード間比較の対応（BranchDiffModal の拡張）
   - starred ノード同士の比較導線

### 今回は対象外

- DAG 化
- merge
- conflict resolution
- 汎用 rebase
- 任意矩形の高機能グラフィカル複数選択
- tags（Phase 3 以降で検討。star + label で初期ニーズは充足）
- 全チャット横断の Discovery（Phase 3 以降で検討）
- 比較ペア保存（starred ノードからの比較導線で代替）
- 複数選択（別プランとして独立させる）

---

## 基本方針

### 1. label / star / pin の役割を分ける

- `label`: そのノードや枝が何を意図したものかを短く説明する名前
- `star`: 重要・お気に入り・再訪候補であることを示す印
- `pin`: prune や整理から守るための保護フラグ

注意:

- `star` に「重要」「ロック」「採用済み」など複数意味を持たせない
- `pin` は「保護」であり「お気に入り」ではない
- `label` は説明文であり、分類や保護には使わない

### 2. 保存対象は node 基準

メタデータは branch 全体ではなく、node に付与する。

理由:

- 現在の branch editor は node を中心に操作している
- 比較、コンテキストメニュー、ジャンプも node 基準である
- 「どこで分岐した案か」は node 単位の方が扱いやすい

ただし UI では node の所属 branch を分かるように表示する。

### 3. メタデータ操作は Undo 対象にする

star / pin / label の変更は既存の snapshot 方式で undo/redo 対象とする。

現状の問題:

- `renameBranchNode()` は `setChats()` 直接呼び出しで undo 不可
- Phase 1 で `applyBranchState()` 経由に修正し、label / star / pin を一貫して undo 対象にする

実装方針:

- `renameBranchNode()` を `applyBranchState()` 経由に変更（既存動作の breaking change なし）
- 新規の `toggleNodeStar()` / `toggleNodePin()` も同パターン
- メタデータのみの変更でも全 state snapshot となるが、HISTORY_LIMIT=50 で管理

### 4. 検索は既存インフラを拡張する

新規の検索 UI は作らない。既存の `BranchSearchBar` + `searchBranchNodes()` を拡張して、label / star フィルタを追加する。

拡張ポイント:

- `searchBranchNodes()` にフィルタオプション（starredOnly, hasLabel）を追加
- `BranchSearchBar` にフィルタトグルボタンを追加
- `SearchResult` に label / starred / pinned 情報を含める

### 5. メタデータは clipboard 経由でコピーされる

`copyBranchSequenceState` はスプレッド演算子でノードを shallow copy するため、`starred` / `pinned` / `label` はコピー元からコピー先に自動的に引き継がれる。追加実装は不要。ただし paste 時に `createdAt` は新規タイムスタンプに上書きされる（既存動作）。

---

## 実装機能一覧

## A. ノードメタデータ

### A-1. label（UI 完成 + undo 対応）

現状:
- `BranchNode.label` フィールドは既存（`src/types/chat.ts:64`）
- `renameBranchNode()` store アクションは既存（`branch-slice.ts`）— ただし undo 不可
- MessageNode ヘッダーに label truncate 表示は既存（`nodes/MessageNode.tsx:76-80`）
- MessageDetailModal ヘッダーに label 表示は既存（`MessageDetailModal.tsx:42-46`）
- コンテキストメニューに label 編集項目は**未実装**
- インライン編集は**未実装**

追加実装:

- `renameBranchNode()` を `applyBranchState()` 経由に変更（undo 対応）
- コンテキストメニューに「Label を編集」を追加（`NodeContextMenu.tsx`）
- インライン編集 UI（node 上で label をクリックして編集、Enter で確定、Escape でキャンセル）
- 空文字で label 解除

### A-2. star

要件:

- `BranchNode` に `starred?: boolean` を追加
- node カード上から 1 クリックでトグルできる
- starred nodes 一覧に出る（B-1）

store アクション:

- `toggleNodeStar(chatIndex: number, nodeId: string)` を追加
- `applyBranchState()` 経由で undo 対象にする

表示位置（MessageNode レイアウト設計）:

- 280px 固定幅のノードカード内で、ヘッダー行は role badge + label で横幅が逼迫する
- star アイコンは **ホバー時の menu button（⋯）の左隣** に配置する（`absolute -top-1` 行、右から 2 番目）
- starred 時は常時表示、未 star 時はホバー時のみ表示
- アイコンサイズは menu button と同じ `w-5 h-5`
- ヘッダー行内には配置しない（横幅の逼迫を回避）

MessageDetailModal:

- ヘッダーの role badge / label の右に star アイコンを表示
- クリックでトグル可能

### A-3. pin

要件:

- `BranchNode` に `pinned?: boolean` を追加
- pinned node の subtree は `pruneHiddenNodes` の対象外にする
- UI で pin 状態が分かる

store アクション:

- `toggleNodePin(chatIndex: number, nodeId: string)` を追加
- `applyBranchState()` 経由で undo 対象にする

prune の変更（`pruneHiddenNodesState` in `branch-domain.ts`）:

- 現行: activePath 以外の全ノードを削除
- 変更: pinned ノードとその subtree（`collectDescendants()` で取得）を削除対象から除外

pinned subtree の祖先チェーン処理:

- pinned ノードの祖先が activePath 上にない場合、祖先ノードは削除される
- 削除された祖先を指す `parentId` は **root まで保持せず、null に設定** して孤立 subtree とする
- 理由: 祖先チェーン全体を保持すると prune の効果が薄れる。pinned subtree は独立した保護単位として扱う
- prune 後に `parentId` が null で `rootId` でもないノードが存在しうるが、ReactFlow のレイアウトでは問題ない（edge が描画されないだけ）

activePath 上の pinned ノード:

- `pruneHiddenNodes` は activePath 外のノードを削除するため、activePath 上の pinned ノードは元々削除されない
- この場合の pin は prune に対して no-op だが、意図通り（pin は「保護マーク」であり、activePath 上にあっても星と同様に視覚的意味を持つ）

表示:

- MessageNode: pin アイコンは star アイコンの左隣に配置（ホバー行、`absolute -top-1`）
- pinned 時は常時表示、未 pin 時はコンテキストメニューからのみ操作
- コンテキストメニューに「Pin / Unpin」を追加

MessageDetailModal:

- ヘッダーに pin アイコンを表示（star の隣）

---

## B. Discovery UI

### 設計方針

既存の `BranchSearchBar` を拡張する形で実装する。新規パネルやモーダルは作らない。

スコープ: 現在のチャット内。multi-view 時は `entries` 配列に含まれる表示中の全チャットが対象（既存の検索と同じ `entries` ベース）。全チャット横断は Phase 3 以降。

### B-1. starred nodes 一覧

要件:

- `BranchSearchBar` にフィルタボタン（star アイコン）を追加
- star フィルタ ON 時、starred node のみを一覧表示（テキスト検索クエリが空でも結果を返す）
- 一覧から node にジャンプできる（既存の検索結果ナビと同じ動作）

表示項目:

- node label（あれば）
- node 本文先頭の抜粋
- role
- active path 上かどうか
- multi-view 時は chat title も表示（entries に chatIndex が含まれるため識別可能）

最低限必要な挙動:

- クリックでその node を含む path を active にし、view を中央へ移動
- 既存の `branchEditorFocusNodeId` / `switchBranchAtNode` を使用

### B-2. label フィルタ付き検索

要件:

- 既存のテキスト検索に label 検索を統合
- 検索クエリが label に部分一致するノードも結果に含める
- 結果一覧で label を視覚的に区別表示

実装:

- `searchBranchNodes()` を拡張: コンテンツに加えて `node.label` も検索対象にする
- `SearchResult` に `matchType: 'content' | 'label'` を追加
- `BranchSearchBar` の結果表示で matchType に応じたバッジ表示

label マッチ時の snippet 生成:

- label がマッチしたがコンテンツにはマッチしない場合: コンテンツ先頭 80 文字を snippet とする（`contentPreview` と同じロジック）
- label とコンテンツの両方がマッチした場合: コンテンツのマッチ箇所を snippet とし、`matchType: 'content'` とする（コンテンツマッチを優先）

### B-3. 結果一覧の拡張仕様

既存の `SearchResult` を拡張:

```ts
interface SearchResult {
  nodeId: string;
  chatIndex: number;
  snippet: string;
  isOnActivePath: boolean;
  // 追加
  matchType: 'content' | 'label';
  label?: string;
  starred?: boolean;
  pinned?: boolean;
}
```

フィルタ操作:

- star フィルタトグル（starred ノードのみ表示）
- フィルタはテキスト検索と併用可能（starred かつ検索一致）
- star フィルタ ON + 検索クエリ空 = 全 starred ノードを一覧表示
- フィルタ OFF 時は従来どおり全結果表示

---

## C. 比較機能の拡張

### C-1. 任意ノード間比較

現状の制約:

- `BranchDiffModal` は pathA（active path）vs pathB（代替パス）のみ対応
- diff は root からの完全パスを index ベースで並列比較（`pathA[i]` vs `pathB[i]`）
- コンテキストメニューの「Compare Branches」は、選択ノードの代替パスを自動構築

拡張:

- Discovery UI（starred 一覧）から 2 つのノードを選択して比較できる導線を追加
- 「Compare with...」操作: 1 つ目のノードを選択 → 2 つ目を選択 → diff modal を開く

実装方針:

- `BranchDiffModal` の props を拡張: pathA / pathB に加えて nodeIdA / nodeIdB を受け取れるようにする
- ノードが指定された場合、そのノードから leaf までのパスを `buildPathToLeaf()` で構築

共通祖先からの比較:

- 任意の 2 ノード A, B が共通の分岐点（LCA: Lowest Common Ancestor）を持つ場合、root からの完全パスでは共通部分が冗長
- LCA の算出: A と B それぞれの祖先チェーンを root まで辿り、最初に分岐する地点を特定する
- diff に渡す pathA / pathB は **LCA の子ノード以降** に切り詰める
- LCA が存在しない場合（異なる tree のノードなど）: root からの完全パスで比較（fallback）
- この LCA 算出ロジックは `branchUtils.ts` に `findLCA(tree, nodeIdA, nodeIdB): string | null` として追加

### C-2. 比較導線の UI

コンテキストメニュー:

- 「Compare with...」を追加
- 選択すると `compareTarget` にノード ID をセット
- `compareTarget` がセット済みの状態で別ノードの「Compare with...」を選択すると diff modal を開く
- `compareTarget` セット中はそのノードにハイライトを表示
- キャンセルは Escape または別操作で `compareTarget` をクリア

starred 一覧からの比較:

- star フィルタ ON 時、結果一覧の各項目に「Compare」ボタンを表示
- 上記と同じ 2 ステップ選択フロー

---

## データモデル変更

### BranchNode（Phase 1）

```ts
interface BranchNode {
  id: string;
  parentId: string | null;
  role: Role;
  contentHash: string;
  createdAt: number;
  label?: string;      // 既存
  starred?: boolean;   // 新規: Phase 1
  pinned?: boolean;    // 新規: Phase 1
}
```

注意:

- `tags?: string[]` は Phase 1 では追加しない。Phase 3 以降で必要性を再評価する
- optional フィールドのため既存データとの後方互換は自動的に保たれる（migration 不要）

### Store 追加（Phase 3）

```ts
// Phase 3: 比較ターゲット選択状態（UI 一時状態、永続化不要）
compareTarget: string | null;
```

### Persistence

- `starred` / `pinned` は BranchNode の一部として自動的に IndexedDB に保存される（追加の persistence 対応不要）
- `compareTarget` は UI 一時状態のため永続化不要
- Export V3: BranchNode の新フィールドは ChatInterface.branchTree 経由で自動的に含まれる
- clipboard: `copyBranchSequenceState` のスプレッド演算子により `starred` / `pinned` は自動コピーされる（追加対応不要）

---

## 推奨 UI 導線

### Node 本体（MessageNode）

- star toggle: ホバー時の右上ボタン行（menu button の左隣）に配置。starred 時は常時表示
- pin icon: star の左隣に配置。pinned 時は常時表示
- label の省略表示（既存の拡張: クリックでインライン編集）
- ボタン行の並び順（右から）: menu（⋯）→ star → pin

### Node context menu（NodeContextMenu.tsx）

追加:

- Label を編集
- Star / Unstar
- Pin / Unpin
- Compare with...（2 ステップ比較フロー、Phase 3）

### MessageDetailModal

追加:

- ヘッダーに star / pin アイコン表示（クリックでトグル）

### BranchSearchBar

追加:

- star フィルタトグルボタン
- 検索結果に label / starred / pinned 情報を表示
- matchType バッジ（content / label）

---

## 実装順

### Phase 1: メタデータ基盤

- `BranchNode` に `starred`, `pinned` を追加（型定義のみ）
- `renameBranchNode()` を `applyBranchState()` 経由に変更（undo 対応）
- `toggleNodeStar()`, `toggleNodePin()` store アクション追加（`applyBranchState()` 経由）
- MessageNode に star / pin アイコン表示（ホバー行、menu button の左隣）
- MessageDetailModal に star / pin アイコン表示
- NodeContextMenu に label 編集 / star / pin を追加
- label のインライン編集 UI
- `pruneHiddenNodesState` の pinned subtree 除外対応（祖先は保持せず parentId=null）

### Phase 2: Discovery UI

- `searchBranchNodes()` に label 検索・star フィルタを追加
- label マッチ時の snippet 生成（コンテンツ先頭 80 文字）
- `SearchResult` に matchType / label / starred / pinned を追加
- `BranchSearchBar` にフィルタ UI を追加
- starred nodes 一覧表示・ジャンプ（star フィルタ ON + クエリ空）
- multi-view 時の chat title 表示

### Phase 3: 比較拡張 + 将来検討

- `compareTarget` state 追加
- 「Compare with...」コンテキストメニュー・2 ステップフロー
- `findLCA()` の実装（共通祖先からの差分比較）
- `BranchDiffModal` の任意ノード間比較対応（LCA 以降のパスで比較）
- starred 一覧からの比較導線
- tags の必要性を再評価し、必要なら `BranchNode.tags` を追加
- 全チャット横断 Discovery の検討

---

## 受け入れ条件

### 最低限（Phase 1-2 完了時）

- node に star, pin を付けて保持できる
- star / pin / label の変更が undo/redo で戻せる
- label をコンテキストメニューおよびインライン編集から設定できる
- pin された subtree が prune 対象から除外される
- star フィルタで starred node を一覧表示できる
- label で検索して node 一覧を出せる
- 一覧から該当 node にジャンプできる

### 望ましい（Phase 3 完了時）

- 任意の 2 ノードを選択して比較できる（LCA 以降の差分）
- tag で絞り込める（Phase 3 で tags を採用した場合）

---

## 非採用事項の理由

### merge を入れない理由

- 会話は時系列と文脈依存が強い
- 2 branch の機械的結合に意味がない
- tree モデルを壊して複雑化するだけ

### DAG 化しない理由

- チャットクライアントとしての利益が薄い
- UI と永続化の複雑さが増えすぎる
- compare / copy / save で大半の運用は足りる

### 高機能 rebase を入れない理由

- 頻度が低い
- copy / paste / move の既存操作で代替しやすい

### tags を Phase 1 に入れない理由

- star + label で「重要マーク」+「自由記述」の初期ニーズは充足する
- free-form tag は管理画面なしだと発散しやすく、実用性が低い
- 使わないフィールドの永続化は migration 負債になる
- 実際のメタデータ利用パターンを Phase 1-2 で観察してから判断する

### 比較ペア保存（SavedBranchCompare）を入れない理由

- 比較はコンテキストメニューから 1-2 クリックで可能
- starred ノードからの比較導線で再訪ニーズは充足する
- 保存・一覧・参照切れ管理のコストに対して利用頻度が低い

### 複数選択を別プランに分離する理由

- Phase 1-2 の受け入れ条件で十分な価値がある
- 複数選択は独立した設計判断が多い（選択 UI、ハイライト、ツールバー）
- このプランに含めると scope creep のリスクがある
- Phase 1-2 の利用パターンを観察してから設計する方が適切

---

## 別エージェントへの補足

- 既存の tree 制約を壊さないこと
- `merge` や DAG 前提の抽象化を持ち込まないこと
- metadata 追加後は persistence と型の整合を優先すること
- discovery UI は「付けられる」だけで終わらせず、「探せる」「飛べる」まで実装すること
- 検索は `branchSearch.ts` / `BranchSearchBar.tsx` / `search-slice.ts` の拡張として実装すること（新規 UI を作らない）
- メタデータ操作は `applyBranchState()` 経由で undo 対象にすること（既存の `renameBranchNode` も修正対象）
- `BranchNode` に `tags` フィールドを Phase 1 で追加しないこと
- star / pin アイコンは MessageNode のヘッダー行内ではなく、ホバー時のボタン行（menu button の左隣）に配置すること（280px 固定幅の横幅逼迫を回避）
- prune 時に pinned subtree の祖先チェーンは保持しない（parentId を null にして孤立させる）
- 任意ノード比較は LCA 以降のパスで比較すること（root からの完全パスでは共通部分が冗長）
- clipboard 経由のメタデータコピーは既存のスプレッド演算子で自動対応（追加実装不要）
