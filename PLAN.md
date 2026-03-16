# Virtuoso 廃止プラン

## 概要
`react-virtuoso` を廃止し、プレーンな `overflow-y: auto` コンテナ + ネイティブスクロールに置き換える。
仮想化が必要になった場合は `@tanstack/react-virtual` を後日導入する。

Virtuoso 廃止に伴い、Virtuoso の API に合わせて構築されていたスクロール管理ロジックを
scroll イベント + ResizeObserver で置き換え、大幅に簡素化する。

---

## 設計方針: スクロール管理の簡素化

### 現行の問題

現行実装では以下の 4 つの独立した仕組みが絡み合っている：

1. **Bottom Lock** (`bottomLockRef` + `bottomLockTimerRef` + `handleFollowOutput` + `handleAtBottomStateChange`) — Virtuoso の `followOutput` API に合わせた追従制御
2. **Viewport Lock** (`lockTargetRef` + `ResizeObserver` + `getViewportLockTarget` / `getEditingLockTarget`) — コンテンツ高さ変化時のスクロール位置補正
3. **Anchor Tracking** (`anchorRef` + `handleRangeChanged` + `refreshAnchorOffsetWithinItem`) — Virtuoso の `rangeChanged` に依存したアンカー追跡
4. **Dual Ref** (`scrollerRef` + `scrollerElement` + `handleScrollerRef` + `scrollListenerCleanupRef`) — Virtuoso の `scrollerRef` callback に合わせた二重管理

### 簡素化後

| 現行 | 置き換え | 削除量 |
|------|---------|--------|
| Viewport Lock (ResizeObserver + lockTarget + drift 補正) | **一旦全削除**。Virtuoso 廃止後に実測して必要なら再実装 | ~110 行 |
| Bottom Lock (4 つの ref/callback) | `atBottom` state + ResizeObserver auto-follow | ~50 行 |
| Anchor Tracking (rangeChanged + refreshOffset) | scroll イベントで `scrollTop` ベース計算 | ~20 行 |
| Dual Ref (handleScrollerRef + cleanup) | callback ref + element state（簡素化） | ~30 行 |

---

## Step 1: Viewport Lock の全削除

### 方針

ビューポートロック（編集時安定化）は **一旦すべて削除** する。

理由：
- 現行ロジックは Virtuoso の内部 DOM 構造（`[data-test-id="virtuoso-item-list"]`）に依存しており、
  そのまま残しても動かない
- CSS `overflow-anchor` はアンカーノード自体の height 変化で suppression が入るため、
  まさに守りたい「編集中 textarea の自動伸長」に対して信頼できない
- Virtuoso を剥がした後のネイティブスクロールでどの程度ジャンプが発生するかは
  **実測するまで不明**。全件レンダリングでは Virtuoso 起因のジャンプがそもそも消える可能性もある

### 削除するコード

```
getViewportLockTarget()          L100-121  — 22 行
getEditingLockTarget()           L123-137  — 15 行
getLockTarget()                  L139-141  — 3 行
getVirtuosoListContainer()       L143-151  — 9 行
LockTarget 型                    L39-42    — 4 行
lockTargetRef                    L312      — 1 行
shouldLockViewport               L528      — 全削除
ResizeObserver effect            L674-700  — 27 行
scroll→lockTarget 更新 effect    L702-720  — 19 行
lockTarget 設定 effect           L663-672  — 10 行
VIRTUOSO_LIST_SELECTOR 定数       L28       — 1 行
```

### 後続対応

Virtuoso 廃止後に以下を手動テストし、ジャンプが問題になるケースを特定してから対処を決定：
1. メッセージ編集中に他メッセージの高さが変わるケース（コード折りたたみ等）
2. 編集中 textarea の自動伸長
3. ストリーミング中にビューポート中段を見ているケース

問題が確認された場合の選択肢：
- **軽度**: CSS `overflow-anchor: auto` + 問題要素への `overflow-anchor: none` で対処
- **中度**: 編集時のみ ResizeObserver + drift 補正を最小限で再実装
- **重度**: 現行ロジックを `data-message-list` wrapper 向けに書き直して復活

---

## Step 2: ストリーミング追従の簡素化

### 現行（~50 行）

```
handleFollowOutput()          — Virtuoso callback、条件分岐が複雑
handleAtBottomStateChange()   — 500ms debounce の unlock ロジック
bottomLockRef                 — follow 強制フラグ
bottomLockTimerRef            — debounce タイマー
lastScrollTopRef              — 手動スクロール検知用
scroll listener の一部         — 上方 10px 移動で lock 解除
```

### 簡素化後

```tsx
// --- atBottom を scroll イベントから計算 ---
const BOTTOM_THRESHOLD = 150;

useEffect(() => {
  const scroller = scrollerElement;
  if (!scroller) return;

  const onScroll = () => {
    const isBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < BOTTOM_THRESHOLD;
    setAtBottom(isBottom);
    atBottomRef.current = isBottom;
  };

  scroller.addEventListener('scroll', onScroll, { passive: true });
  return () => scroller.removeEventListener('scroll', onScroll);
}, [scrollerElement]);

// --- ストリーミング中の auto-follow ---
useEffect(() => {
  if (!isCurrentChatGenerating || !atBottom || !autoScroll) return;
  if (isEditingInScroller) return;

  const scroller = scrollerRef.current;
  const messageList = scroller?.querySelector('[data-message-list]');
  if (!scroller || !messageList) return;

  const scrollToEnd = () => {
    scroller.scrollTop = scroller.scrollHeight;
  };

  // 即座に末尾へ
  scrollToEnd();

  // ResizeObserver でコンテンツ高さ変化を検知してスクロール追従
  // MutationObserver では DOM/テキスト変化は拾えるが、layout-only な高さ変化
  // （画像ロード、フォント確定、syntax highlight 後の再レイアウト）を拾えない。
  // ResizeObserver なら最終的な描画サイズ変化を確実に検知する。
  const observer = new ResizeObserver(scrollToEnd);
  observer.observe(messageList);

  return () => observer.disconnect();
}, [isCurrentChatGenerating, atBottom, autoScroll, isEditingInScroller]);
```

### 削除するもの

- `bottomLockRef`, `bottomLockTimerRef`, `lastScrollTopRef`
- `handleFollowOutput`, `handleAtBottomStateChange`
- `scrollListenerCleanupRef` + cleanup effect
- `handleScrollerRef` 内の bottom lock 解除ロジック

### `handleScrollToBottom` の簡素化

```tsx
const handleScrollToBottom = useCallback(() => {
  const scroller = scrollerRef.current;
  if (!scroller) return;
  scroller.scrollTo({
    top: scroller.scrollHeight,
    behavior: animateBubbleNavigation ? 'smooth' : 'auto',
  });
}, [animateBubbleNavigation]);
```

全件レンダリングでは scrollHeight が即座に確定するため、Virtuoso 時代の
3 フレームリトライは不要。ただし smooth スクロール完了前に scrollHeight が
変わる可能性はあるため、auto-follow effect が実行中ならそちらが補完する。

---

## Step 3: Scroller Ref の簡素化

### 現行

```tsx
// Virtuoso の scrollerRef callback に合わせた複雑な構造
const handleScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
  // cleanup, ref/state 設定, scroll listener 登録, editing 判定... (~35行)
}, [...]);
```

### 簡素化後

```tsx
const scrollerRef = useRef<HTMLDivElement>(null);
const [scrollerElement, setScrollerElement] = useState<HTMLDivElement | null>(null);

const scrollerCallbackRef = useCallback((el: HTMLDivElement | null) => {
  scrollerRef.current = el;
  setScrollerElement(el);
}, []);
```

- `scrollerElement` state は維持（focusin/focusout、keyboard viewport の effect が依存）
- scroll listener は `handleScrollerRef` 内ではなく、専用の `useEffect` で登録（Step 2 参照）
- `scrollListenerCleanupRef` は不要（useEffect の cleanup で管理）

---

## Step 4: レンダリングの書き換え

### DOM 構造

```tsx
<div ref={scrollerCallbackRef} className="h-full overflow-y-auto" data-chat-scroller>
  <div data-message-list>
    {items.map((item, index) => (
      <div key={computeItemKey(index)} data-item-index={index}>
        <Message ... />
        {advancedMode && <NewMessageButton ... />}
      </div>
    ))}
  </div>
  <Footer />
</div>
```

- `data-message-list` wrapper: メッセージ群の構造的グルーピング。auto-follow の
  ResizeObserver はこの wrapper を監視する
- `data-item-index`: バブルナビゲーションで引き続き使用
- `data-chat-scroller`: iOS ステータスバー、サイドバースワイプのセレクタ

### インポートの変更

```diff
-import { ListRange, Virtuoso, VirtuosoHandle } from 'react-virtuoso';
```

### 削除する定数

```diff
-const SCROLL_TO_BOTTOM_TOP = Number.MAX_SAFE_INTEGER;
-const VIRTUOSO_LIST_SELECTOR = '[data-test-id="virtuoso-item-list"]';
```

### リネームする定数

```diff
-const VIRTUOSO_ITEM_SELECTOR = '[data-item-index]';
+const MESSAGE_ITEM_SELECTOR = '[data-item-index]';
```

---

## Step 5: アンカー保存/復元の簡素化

### 現行

- `handleRangeChanged` (Virtuoso の `rangeChanged` callback) でアンカーインデックスを更新
- `refreshAnchorOffsetWithinItem` でオフセットを計算
- 復元は `virtuosoRef.current?.scrollToIndex()`

### 簡素化後

アンカーの保存は scroll イベント内で計算:

```tsx
// scroll イベントハンドラ内（Step 2 と統合）
const onScroll = () => {
  // atBottom 計算
  const isBottom = ...;

  // アンカー更新
  if (!isBottom) {
    const scrollerRect = scroller.getBoundingClientRect();
    const items = scroller.querySelectorAll<HTMLElement>('[data-item-index]');
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top) {
        anchorRef.current.firstVisibleItemIndex = Number(item.dataset.itemIndex);
        anchorRef.current.offsetWithinItem = scrollerRect.top - rect.top;
        break;
      }
    }
  }
  anchorRef.current.wasAtBottom = isBottom;
};
```

復元は `scrollIntoView` + `scrollTop` 補正:

```tsx
useEffect(() => {
  if (pendingChatFocus && pendingChatFocus.chatIndex === currentChatIndex) return;
  const anchor = getChatScrollAnchor(currentChatId);
  if (!anchor || anchor.wasAtBottom) return;

  requestAnimationFrame(() => {
    const scroller = scrollerRef.current;
    const item = scroller?.querySelector(`[data-item-index="${anchor.firstVisibleItemIndex}"]`);
    if (!item || !scroller) return;
    item.scrollIntoView({ block: 'start' });
    scroller.scrollTop += anchor.offsetWithinItem;
  });
}, [currentChatIndex]);
```

### 削除するもの

- `handleRangeChanged`
- `refreshAnchorOffsetWithinItem`

---

## Step 6: `isEditingMessageElement` の修正

### 変更

- `VIRTUOSO_ITEM_SELECTOR` → `MESSAGE_ITEM_SELECTOR` にリネーム
- `VIRTUOSO_LIST_SELECTOR` は削除
- 関数ロジックはそのまま（`data-item-index` は維持するため）
- `isEditingInScroller` state + focusin/focusout effect もそのまま維持
  （auto-follow 抑制と keyboard viewport の判定に使用）

---

## Step 7: `useIosStatusBarScroll.ts` の更新

```diff
-const scroller = document.querySelector('[data-virtuoso-scroller="true"]');
+const scroller = document.querySelector('[data-chat-scroller]');
```

---

## Step 8: `main.css` の更新

```diff
-.sidebar-swiping [data-virtuoso-scroller='true'] {
+.sidebar-swiping [data-chat-scroller] {
   touch-action: none !important;
   pointer-events: none !important;
 }
```

---

## Step 9: テストの更新

### 9a. 既存テストの修正 (`ChatContent.test.ts`)
- `VIRTUOSO_ITEM_SELECTOR` → `MESSAGE_ITEM_SELECTOR` に追従
- Virtuoso 固有のモック削除

### 9b. ストリーミング追従テスト（新規 — 最重要）
- **auto-follow**: ストリーミング中に `atBottom` なら、コンテンツ高さ変化で `scrollTop` が追従
- **手動スクロールアップで解除**: 上方スクロールで auto-follow 停止
- **ボトム復帰で再開**: ボトムに戻ると auto-follow 再開
- **編集中の抑制**: `isEditingInScroller` が true なら auto-follow しない

### 9c. スクロール復元テスト（新規）
- **pendingChatFocus**: 指定メッセージまでスクロール
- **保存済みアンカー復元**: `scrollTop` が正しく復元
- **アンカー不在時のフォールバック**: 末尾にスクロール

### 9d. ビューポート安定性テスト（手動テスト — Virtuoso 廃止後に実施）
- メッセージ編集中に他メッセージの高さが変わった場合のジャンプ有無
- 編集中 textarea の自動伸長時のジャンプ有無
- ストリーミング中にビューポート中段を見ているときの安定性
- Footer の高さ変化（生成中ボタン、エラー表示）でスクロールが飛ぶかどうか
- 結果に基づいてビューポートロック再実装の要否を判断

### 9e. `useIosStatusBarScroll` テスト
- セレクタ変更後もステータスバータップが動作

---

## Step 10: パッケージの削除

```bash
yarn remove react-virtuoso
```

---

## 削除コードまとめ

| 対象 | 行数 | 理由 |
|------|------|------|
| `getViewportLockTarget` / `getEditingLockTarget` / `getLockTarget` | ~40 行 | Viewport Lock 全削除 |
| `getVirtuosoListContainer` | ~9 行 | Viewport Lock 全削除 |
| `LockTarget` 型 | ~4 行 | Viewport Lock 全削除 |
| `shouldLockViewport` | ~1 行 | Viewport Lock 全削除 |
| ResizeObserver effect (viewport lock) | ~27 行 | Viewport Lock 全削除 |
| scroll→lockTarget 更新 effect | ~19 行 | Viewport Lock 全削除 |
| lockTarget 設定 effect | ~10 行 | Viewport Lock 全削除 |
| `handleFollowOutput` | ~14 行 | ResizeObserver auto-follow で代替 |
| `handleAtBottomStateChange` | ~17 行 | scroll イベントで代替 |
| `handleScrollerRef` | ~35 行 | callback ref に簡素化 |
| `handleRangeChanged` | ~5 行 | scroll イベントに統合 |
| `refreshAnchorOffsetWithinItem` | ~13 行 | scroll イベントに統合 |
| `bottomLockRef` 関連 refs | ~4 行 | 不要 |
| `scrollListenerCleanupRef` + effect | ~10 行 | useEffect cleanup で管理 |
| **合計** | **~208 行** | |

## 新規追加コードまとめ

| 対象 | 行数 |
|------|------|
| scroll イベント effect（atBottom + アンカー） | ~25 行 |
| ResizeObserver auto-follow effect | ~20 行 |
| callback ref | ~5 行 |
| `handleScrollToBottom` 簡素化 | ~7 行 |
| DOM 構造（map + footer） | ~15 行 |
| **合計** | **~72 行** |

**差引: 約 136 行の純減**

---

## 影響範囲まとめ

| ファイル | 変更内容 |
|---------|---------|
| `ChatContent.tsx` | Virtuoso → プレーン div、スクロール管理の大幅簡素化 |
| `useIosStatusBarScroll.ts` | セレクタを `[data-chat-scroller]` に変更（1行） |
| `main.css` | セレクタを `[data-chat-scroller]` に変更（1行） |
| `ChatContent.test.ts` | 定数名変更に追従 + テスト追加 |
| `package.json` | `react-virtuoso` を削除 |

---

## リスク

1. **ビューポート安定性** — Viewport Lock を全削除するため、編集中にジャンプが
   発生する可能性がある。ただし Virtuoso 起因のジャンプが消えることで問題自体が
   軽減/解消する可能性も高い。廃止後に手動テスト（Step 9d）で実測し、
   問題があれば最小限のロジックを追加する
2. **ストリーミング中の auto-scroll** — ResizeObserver で `data-message-list` wrapper の
   高さ変化を監視。画像ロード・フォント確定・syntax highlight 等の layout-only な
   変化も検知できる。パフォーマンスが問題なら `requestAnimationFrame` でスロットル
3. **大規模会話 (200件超) でのパフォーマンス** — `content-visibility: auto` で対処。
   問題が出れば `@tanstack/react-virtual` を後日導入
