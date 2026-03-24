# 実装指示書: メッセージ単位の Omit/Protect 機能

## 概要

チャットメッセージごとに「送信から省略(Omit)」「削除保護(Protect)」フラグを付けられる機能を実装する。
これにより、ユーザーはAPI送信時に不要なメッセージを除外したり、重要なメッセージの誤削除を防止できる。

---

## 変更対象ファイル一覧 (18ファイル)

### 1. 型定義
- `src/types/chat.ts`

### 2. ストア
- `src/store/chat-slice.ts`
- `src/store/config-slice.ts`
- `src/store/branch-slice.ts`

### 3. 送信ロジック
- `src/hooks/submitHelpers.ts`
- `src/hooks/submitHelpers.test.ts`
- `src/hooks/useSubmit.ts`

### 4. UIコンポーネント
- `src/components/Chat/ChatContent/Message/Message.tsx`
- `src/components/Chat/ChatContent/Message/View/UnifiedMessageView.tsx`
- `src/components/Chat/ChatContent/Message/View/MetaActions.tsx` (新規)
- `src/components/Chat/ChatViewTabs.tsx`

### 5. アイコン (新規)
- `src/assets/icons/OmitIcon.tsx`
- `src/assets/icons/ProtectedIcon.tsx`

### 6. ストリーミング
- `src/utils/streamingBuffer.ts`

### 7. 翻訳
- `public/locales/en-US/main.json`
- `public/locales/en/main.json`
- `public/locales/ja/main.json`

---

## 実装詳細

### Step 1: 型定義の拡張 (`src/types/chat.ts`)

#### 1a. `ToolCallContentInterface` と `ToolResultContentInterface` を追加

```ts
export interface ToolCallContentInterface {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResultContentInterface {
  type: 'tool_result';
  tool_call_id: string;
  content: string;
}
```

#### 1b. 型ガード関数を追加

```ts
export function isToolCallContent(ob: ContentInterface | undefined): ob is ToolCallContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'tool_call';
}

export function isToolResultContent(ob: ContentInterface | undefined): ob is ToolResultContentInterface {
  return ob !== undefined && ob !== null && ob.type === 'tool_result';
}
```

#### 1c. `ContentInterface` ユニオン型に上記2型を追加

```ts
export type ContentInterface =
  | TextContentInterface
  | ImageContentInterface
  | ReasoningContentInterface
  | ToolCallContentInterface
  | ToolResultContentInterface;
```

#### 1d. `ChatInterface` に omit/protect ノードマップを追加

```ts
// ChatInterface に以下2フィールドを追加
omittedNodes?: Record<string, boolean>;
protectedNodes?: Record<string, boolean>;
```

---

### Step 2: ストアの拡張

#### 2a. `chat-slice.ts`

**スライス型に追加するフィールド:**
- `omittedNodeMaps: Record<string, Record<string, boolean>>`
- `protectedNodeMaps: Record<string, Record<string, boolean>>`

**スライス型に追加するアクション:**
- `toggleOmitNode: (chatIndex: number, messageIndex: number) => void`
- `toggleProtectNode: (chatIndex: number, messageIndex: number) => void`
- `setAllOmitted: (chatIndex: number, omitted: boolean) => void`

**ヘルパー関数のリファクタリング:**
- `getCollapsedMapKey` → `getMapKey` にリネーム
- `getCollapsedNodesForChat` → `getNodesForChat` にリネーム。第4引数 `field: 'collapsedNodes' | 'omittedNodes' | 'protectedNodes'` を追加
- `buildCollapsedNodeMaps` → `buildNodeMaps` にリネーム。第2引数 `field` を追加

**setChats 内:**
- `omittedNodeMaps` と `protectedNodeMaps` も `collapsedNodeMaps` と同様に `hasSameChatOrder` をチェックして更新する

**toggleOmitNode / toggleProtectNode の実装:**
- `toggleCollapseNode` と同じパターン。対象の `omittedNodeMaps` / `protectedNodeMaps` をトグルする

**setAllOmitted の実装:**
- `omitted=true` の場合: `activePath` の全ノード(なければ全メッセージindex）を omit に設定
- `omitted=false` の場合: 空オブジェクト `{}` をセット

#### 2b. `config-slice.ts`

**追加フィールド:**
- `globalOmitMode: boolean` (初期値 `false`)
- `setGlobalOmitMode: (globalOmitMode: boolean) => void`

#### 2c. `branch-slice.ts` — `removeMessageAtIndex` の保護

`removeMessageAtIndex` の先頭で、対象メッセージが `protectedNodes` に含まれる場合は即 `return` して削除をブロックする:

```ts
const resolvedNodeId = chat.branchTree?.activePath?.[messageIndex] ?? String(messageIndex);
const mapKey = String(chatIndex);
const protectedNodes = get().protectedNodeMaps[mapKey] ?? chat.protectedNodes ?? {};
if (protectedNodes[resolvedNodeId]) return;
```

---

### Step 3: 送信ロジック

#### 3a. `submitHelpers.ts`

**sanitizeMessageContent:**
- `tool_call` / `tool_result` タイプのコンテンツを常に保持するフィルタを追加

**sanitizeMessagesForSubmit:**
- フィルタ後に `ensureRoleAlternation()` を呼ぶように変更

**新関数 `ensureRoleAlternation`:**
- 連続する同一ロールのメッセージを結合（content配列を連結）
- ただし `tool_call` / `tool_result` を含むメッセージは結合しない（構造的ペアを維持）

**新関数 `hasToolContent`:**
- メッセージが `tool_call` または `tool_result` コンテンツを含むか判定

**新関数 `filterOmittedMessages`:**
- `useStore.getState()` から `omittedNodeMaps` を読み取り、omit フラグが立っているメッセージを除外
- `tool_call` / `tool_result` を含むメッセージは omit しない（構造的に必須）

**`getSubmitContextMessages` の変更:**
- 引数に `chatIndex?: number` を追加
- `chatIndex` が指定されていれば `filterOmittedMessages` を適用

#### 3b. `useSubmit.ts`

`getSubmitContextMessages` の呼び出しに `chatIndex` を渡す。

#### 3c. `submitHelpers.test.ts`

既存テスト修正:
- 連続するuserメッセージが結合される動作に期待値を更新

新規テスト追加:
- 連続するassistantメッセージが結合されることを検証
- tool_call / tool_result を含むメッセージが結合されずに保持されることを検証

---

### Step 4: UIコンポーネント

#### 4a. アイコン (新規ファイル)

**`src/assets/icons/OmitIcon.tsx`:**
- eye-off (目に斜線) SVGアイコン。`props` を受け取り `className` などを外部指定可能にする

**`src/assets/icons/ProtectedIcon.tsx`:**
- shield (盾) SVGアイコン。同上

#### 4b. `MetaActions.tsx` (新規)

メッセージホバー時に右上に表示されるフローティングボタン群:
- Omitボタン: `toggleOmitNode` を呼ぶ。omit中はアンバーカラー
- Protectボタン: `toggleProtectNode` を呼ぶ。protect中はブルーカラー
- コンテナ: `pointer-events-none` + `group-hover:pointer-events-auto` でホバー時のみクリック可能
- 丸みを帯びたピル型のバー。backdrop-blur で半透明

Props: `messageIndex`, `isOmitted`, `isProtected`

#### 4c. `UnifiedMessageView.tsx`

- `MetaActions` をインポートし、非編集モード時のコンテンツ領域内に配置
- `resolvedNodeIdForMeta`, `isOmitted`, `isProtected` を `useStore` から取得
- コンテンツ surface の div に `relative` クラスを追加

#### 4d. `Message.tsx`

- `isOmitted`, `isProtected` を `useStore` から取得
- omit中: メッセージ全体に `opacity-50` を適用
- protect中: `ring-2 ring-inset ring-blue-400/30 dark:ring-blue-500/25` を適用

#### 4e. `ChatViewTabs.tsx`

- 一括Omitトグルボタンを追加（モデルオプションボタンの隣）
- `globalOmitMode`, `setGlobalOmitMode`, `setAllOmitted` をストアから取得
- クリック時: `setGlobalOmitMode(!current)` → `setAllOmitted(currentChatIndex, !current)`
- ON時: アンバー系の背景色 / OFF時: グレー系

---

### Step 5: ストリーミングバッファ修正 (`src/utils/streamingBuffer.ts`)

`cloneContentItem` で `tool_call` / `tool_result` タイプを正しく処理:

```ts
const cloneContentItem = (content: ContentInterface): ContentInterface => {
  if (content.type === 'image_url') return { ...content, image_url: { ...content.image_url } };
  return { ...content } as ContentInterface;
};
```

従来は `text` と `reasoning` を個別チェックし、それ以外を `image_url` として扱っていたが、新しいタイプの追加により汎用的なフォールバックに変更。

---

### Step 6: 翻訳キーの追加

以下のキーを3つのロケールファイルに追加:

| キー | en-US / en | ja |
|---|---|---|
| `omitOn` | Omit from request | 送信から省略 |
| `omitOff` | Include in request | 送信に含める |
| `protectOn` | Protect | 保護する |
| `protectOff` | Unprotect | 保護を解除 |
| `globalOmitOn` | Omit All | 一括省略 |
| `globalOmitOff` | Omit All | 一括省略 |

---

## テスト確認

1. `yarn test` でユニットテストが通ることを確認
2. `yarn build` でビルドエラーがないことを確認
3. 開発サーバーで以下を手動確認:
   - メッセージホバーで Omit / Protect ボタンが表示される
   - Omit したメッセージが半透明になる
   - Protect したメッセージに青い枠が付く
   - Omit したメッセージが API 送信時に除外される
   - Protect したメッセージが削除操作でブロックされる
   - 一括 Omit ボタンが全メッセージの Omit を切り替える
   - tool_call / tool_result を含むメッセージは Omit されない

---

## 設計上の注意点

- **Role alternation**: メッセージを omit すると user/assistant の交互ルールが崩れる。`ensureRoleAlternation` で連続同一ロールを結合して修正する
- **Tool-use ペア不可分**: `tool_call` と `tool_result` は API が構造的に検証するため、omit も結合もしない
- **既存の collapsed 機能との共存**: `collapsedNodeMaps` と同じパターンで `omittedNodeMaps` / `protectedNodeMaps` を管理。ヘルパー関数を汎用化してDRYに
