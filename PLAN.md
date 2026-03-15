# Virtuoso 廃止プラン

## 概要
`react-virtuoso` を廃止し、プレーンな `overflow-y: auto` コンテナ + ネイティブスクロールに置き換える。
仮想化が必要になった場合は `@tanstack/react-virtual` を後日導入する。

---

## Step 1: ChatContent.tsx — Virtuoso をプレーン div に置き換え

### 1a. インポートの変更
- `react-virtuoso` のインポート (`Virtuoso`, `VirtuosoHandle`, `ListRange`) を削除
- `VirtuosoHandle` の ref → 通常の `HTMLDivElement` ref に変更

### 1b. レンダリング部分の書き換え
現在の `<Virtuoso>` コンポーネントを以下のようなプレーン構造に置き換え：

```tsx
<div ref={scrollerRef} className="h-full overflow-y-auto">
  {items.map((item, index) => (
    <div key={computeItemKey(index)} data-item-index={index}>
      <Message ... />
      {advancedMode && <NewMessageButton ... />}
    </div>
  ))}
  <Footer />
</div>
```

- `data-item-index` 属性はバブルナビゲーション等で使われているため維持
- `Footer` は Virtuoso の `components` prop 経由ではなく、直接リスト末尾にレンダリング
- `computeItemKey` のロジックはそのまま `key` prop に流用

### 1c. スクロール制御の簡素化

| Virtuoso API | 置き換え |
|-------------|---------|
| `virtuosoRef.current?.scrollTo({ top: MAX })` | `scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight` |
| `virtuosoRef.current?.scrollToIndex({ index, align })` | `querySelector('[data-item-index="N"]').scrollIntoView({ block: align })` |
| `followOutput` コールバック | ストリーミング中に `scrollTop = scrollHeight` を定期適用（`MutationObserver` or `useEffect`） |
| `atBottomStateChange` コールバック | `scroll` イベントで `scrollTop + clientHeight >= scrollHeight - threshold` を計算 |
| `rangeChanged` コールバック | `IntersectionObserver` で最初の可視アイテムを追跡、またはスクロール位置から計算 |

### 1d. 削除する Virtuoso 固有ロジック
- `handleFollowOutput` → 新しい auto-scroll ロジックに置き換え
- `handleAtBottomStateChange` → scroll イベントリスナーに統合
- `handleRangeChanged` → スクロール位置ベースのアンカー追跡に簡素化
- `handleScrollerRef` コールバック → 直接 ref を渡す（scroll リスナーの登録はそのまま）
- `bottomLockRef` / `bottomLockTimerRef` → ストリーミング中の auto-scroll として簡素化可能
- `increaseViewportBy` → 不要（全件レンダリング）

---

## Step 2: ビューポートロック (編集時安定化) の簡素化

### 現状
- `getVirtuosoListContainer()` で `[data-test-id="virtuoso-item-list"]` を検索
- `ResizeObserver` で Virtuoso の内部リストコンテナの高さ変化を検知
- `lockTargetRef` でスクロール補正

### 変更
- `getVirtuosoListContainer()` を削除
- `VIRTUOSO_LIST_SELECTOR` 定数を削除
- `ResizeObserver` はスクロールコンテナの直接の子要素（メッセージリスト wrapper）を監視するよう変更
- ロックロジック自体は引き続き有用なので、セレクタのみ更新

---

## Step 3: `isEditingMessageElement` の修正

### 現状
- `VIRTUOSO_ITEM_SELECTOR = '[data-item-index]'` で、textarea が Virtuoso アイテム内かを判定
- Footer textarea と区別するためのワークアラウンド

### 変更
- `data-item-index` 属性は維持するため、基本ロジックはそのまま動作する
- `VIRTUOSO_ITEM_SELECTOR` 定数名を `MESSAGE_ITEM_SELECTOR` にリネーム
- `VIRTUOSO_LIST_SELECTOR` は削除

---

## Step 4: `useIosStatusBarScroll.ts` の更新

### 現状
```ts
const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
```

### 変更
スクロールコンテナに独自の data 属性（例: `data-chat-scroller`）を付与し、それをセレクタに使用：
```ts
const scroller = document.querySelector('[data-chat-scroller]');
```

---

## Step 5: `main.css` の更新

### 現状
```css
.sidebar-swiping [data-virtuoso-scroller='true'] {
  touch-action: none !important;
  pointer-events: none !important;
}
```

### 変更
```css
.sidebar-swiping [data-chat-scroller] {
  touch-action: none !important;
  pointer-events: none !important;
}
```

---

## Step 6: テストの更新

### `ChatContent.test.ts`
- `isEditingMessageElement` のテストはほぼそのまま動作
  - `[data-item-index]` セレクタは維持されるため
- Virtuoso 固有のモックが不要になるため、テストが簡素化される可能性

---

## Step 7: パッケージの削除

```bash
yarn remove react-virtuoso
```

---

## Step 8: スクロールアンカー復元の再実装

### 現状
- Virtuoso の `scrollToIndex` API でチャット切り替え時にスクロール位置を復元
- `saveChatScrollAnchor` / `getChatScrollAnchor` (store) にアンカー情報を保存

### 変更
- store のアンカー保存/復元の仕組みはそのまま維持
- 復元時は `scrollIntoView` または `scrollTop` 計算で代替：
  ```ts
  const item = scrollerRef.current?.querySelector(`[data-item-index="${anchor.firstVisibleItemIndex}"]`);
  item?.scrollIntoView({ block: 'start' });
  scrollerRef.current.scrollTop -= anchor.offsetWithinItem;
  ```
- `pendingChatFocus` の処理も同様に `scrollIntoView` で代替

---

## 影響範囲まとめ

| ファイル | 変更内容 |
|---------|---------|
| `ChatContent.tsx` | Virtuoso → プレーン div、スクロール制御の書き換え（主要変更） |
| `useIosStatusBarScroll.ts` | セレクタを `[data-chat-scroller]` に変更（1行） |
| `main.css` | セレクタを `[data-chat-scroller]` に変更（1行） |
| `ChatContent.test.ts` | 定数名変更に追従（軽微） |
| `package.json` | `react-virtuoso` を削除 |

## Virtuoso 起因のワークアラウンド処遇

Virtuoso 導入に伴い追加されたワークアラウンドを、廃止後にどう扱うか整理する。

### 1. Sticky input フォーカス喪失の回避 → **削除**
- **経緯**: Virtuoso の Footer コンポーネントが再マウントされる際に textarea のフォーカスが失われる問題。Footer textarea が `MESSAGE_EDIT_TEXTAREA_SELECTOR` にマッチしてしまうため、`closest(VIRTUOSO_ITEM_SELECTOR)` で区別するワークアラウンドを追加。
- **場所**: `ChatContent.tsx` L49-67 (`isEditingMessageElement`)、L621-626 (`onFocusIn`)
- **廃止後**: Footer は通常の子要素として描画されるため再マウントが発生しない。ただし `isEditingMessageElement` 自体はメッセージ編集中のビューポートロック判定で引き続き使うため、関数は維持。`closest(VIRTUOSO_ITEM_SELECTOR)` のチェックも `data-item-index` を維持するなら残しておいて問題ない。**ワークアラウンドの動機は消滅するが、防御的チェックとして残存しても害はない。**

### 2. スクロールリバウンド防止 → **削除**
- **経緯**: Virtuoso が内部でスクロール位置を調整する際にリバウンド（意図しない跳ね返り）が発生。アンカー追跡の精緻化で対処。
- **場所**: `ChatContent.tsx` L326-338 (`refreshAnchorOffsetWithinItem`)、L386-390 (`handleRangeChanged`)
- **廃止後**: ネイティブスクロールではリバウンドが発生しない。`handleRangeChanged` は Virtuoso の `rangeChanged` prop 用なので丸ごと削除。アンカー追跡は scroll イベントから `scrollTop` ベースで再実装し、大幅に簡素化。

### 3. サイドバースワイプ時の touch-action ロック → **簡素化**
- **経緯**: Virtuoso がスクロールコンテナを制御するため、サイドバースワイプ中に競合が発生。`[data-virtuoso-scroller='true']` に `touch-action: none` を適用。
- **場所**: `main.css` L104-107
- **廃止後**: セレクタを `[data-chat-scroller]` に変更するのみ。スワイプ中のスクロール抑制自体はネイティブスクロールでも必要なので、ワークアラウンドではなく正当な処理として維持。

### 4. iOS ステータスバータップ対応 → **簡素化**
- **経緯**: iOS Safari のステータスバータップで `window.scrollY` が 0 になるが、Virtuoso が独自のスクロールコンテナを持つためネイティブの scroll-to-top が効かない。カスタムフック `useIosStatusBarScroll` で Virtuoso のスクロールコンテナを手動で操作。
- **場所**: `useIosStatusBarScroll.ts` L98-103
- **廃止後**: セレクタを `[data-chat-scroller]` に変更。フック自体は `overflow: hidden` のレイアウト構造上引き続き必要（window ではなくコンテナをスクロールする必要があるため）。**Virtuoso 固有の問題ではなく、アプリのレイアウト構造の問題。**

### 5. メッセージ編集時のビューポートジャンプ防止 → **簡素化**
- **経緯**: メッセージ編集で要素の高さが変わると、Virtuoso が内部でスクロール位置を再計算して意図しないジャンプが発生。`ResizeObserver` + `lockTargetRef` でスクロール補正。
- **場所**: `ChatContent.tsx` L663-720 (`ResizeObserver` + ロックロジック)
- **廃止後**: ネイティブスクロールでもコンテンツ高さ変化によるビューポートずれは発生しうるため、ロックロジック自体は維持。ただし `getVirtuosoListContainer()` (L143-151) は削除し、直接スクロールコンテナの子要素を参照するよう簡素化。

### 6. `handleScrollerRef` の二重 ref パターン → **削除**
- **経緯**: Virtuoso は `scrollerRef` コールバックで HTMLElement を渡すが、ref と state の両方で保持する必要があった（同期読み取り用 ref + リアクティブな effect 用 state）。
- **場所**: `ChatContent.tsx` L289-294, L566-599
- **廃止後**: 通常の `useRef<HTMLDivElement>` で直接参照。`scrollerElement` state は不要になり、`handleScrollerRef` コールバック全体を削除。scroll イベントリスナーの登録は `useEffect` で `scrollerRef.current` に対して行う。

### 7. `followOutput` / `bottomLockRef` のストリーミング追従制御 → **再実装**
- **経緯**: Virtuoso の `followOutput` API は「コンテンツが追加されたときに自動スクロールするか」を制御するコールバック。ストリーミング中の追従、手動スクロールアップでの解除、編集中の抑制など複雑なロジックが必要。
- **場所**: `ChatContent.tsx` L530-561 (`handleFollowOutput`, `handleAtBottomStateChange`, `bottomLockRef`)
- **廃止後**: `followOutput` API 自体が消えるため、代替として:
  - ストリーミング中かつ `atBottom` なら、`MutationObserver` or `useEffect` で `scrollTop = scrollHeight` を適用
  - `bottomLockRef` / `bottomLockTimerRef` は不要になる可能性が高い（ネイティブスクロールでは `scrollTop = scrollHeight` が即座に反映される）
  - **最もリスクの高い再実装部分**

### まとめ

| ワークアラウンド | 処遇 | 理由 |
|----------------|------|------|
| Sticky input フォーカス喪失回避 | **そのまま維持** | 防御的チェックとして害なし |
| スクロールリバウンド防止 | **削除** | Virtuoso固有の問題 |
| サイドバースワイプ touch-action | **セレクタ変更のみ** | レイアウト構造上の正当な処理 |
| iOS ステータスバータップ | **セレクタ変更のみ** | レイアウト構造上の正当な処理 |
| 編集時ビューポートジャンプ防止 | **簡素化** | ロック自体は必要、Virtuosoセレクタのみ削除 |
| 二重 ref パターン | **削除** | Virtuoso API 固有 |
| followOutput / bottomLock | **再実装** | ストリーミング追従はネイティブ scroll で再実装 |

## リスク

1. **大規模会話 (200件超) でのパフォーマンス** — 初期は `content-visibility: auto` で対処。問題が出れば `@tanstack/react-virtual` を導入
2. **ストリーミング中の auto-scroll** — Virtuoso の `followOutput` が担っていた挙動を正確に再現する必要あり。`MutationObserver` or `useEffect` + `scrollHeight` 監視で実現
3. **スクロール位置復元の精度** — Virtuoso の `scrollToIndex` は内部で要素の遅延レンダリングを考慮していた。プレーン構成では全件レンダリングのため、むしろ精度は上がる可能性が高い
