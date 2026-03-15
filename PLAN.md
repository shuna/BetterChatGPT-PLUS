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

## リスク

1. **大規模会話 (200件超) でのパフォーマンス** — 初期は `content-visibility: auto` で対処。問題が出れば `@tanstack/react-virtual` を導入
2. **ストリーミング中の auto-scroll** — Virtuoso の `followOutput` が担っていた挙動を正確に再現する必要あり。`MutationObserver` or `useEffect` + `scrollHeight` 監視で実現
3. **スクロール位置復元の精度** — Virtuoso の `scrollToIndex` は内部で要素の遅延レンダリングを考慮していた。プレーン構成では全件レンダリングのため、むしろ精度は上がる可能性が高い
