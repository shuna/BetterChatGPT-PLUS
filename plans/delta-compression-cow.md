# デルタ圧縮 + コピーオンライト永続化

## 概要

チャットデータの肥大化を抑制するため、以下の2つの手法を組み合わせて実装する：

1. **デルタ圧縮**: 分岐ノード間の差分のみを保存し、ContentStoreのサイズを削減
2. **コピーオンライト遅延gzip圧縮**: 非アクティブチャットをバックグラウンドでgzip圧縮し、IndexedDBの使用量を削減

---

## Part 1: デルタ圧縮

### 1.1 設計

#### BranchNodeの拡張

```ts
interface BranchNode {
  id: string;
  parentId: string | null;
  role: Role;
  contentHash: string;
  createdAt: number;
  label?: string;
  deltaBaseHash?: string;  // 新規: デルタ参照先のcontentHash
}
```

#### ContentStoreの拡張

```ts
interface ContentEntry {
  content: ContentInterface[];  // 全文（デルタの場合はnull的に空配列）
  refCount: number;
  delta?: {
    baseHash: string;          // デルタ元のcontentHash
    patches: string;           // diff-match-patchのパッチテキスト（patch_toText形式）
  };
}
```

`content`（全文）と`delta`は排他。`delta`がある場合、`resolveContent`で`baseHash`の内容にパッチを適用して復元する。パッチはテキスト形式で保存し、ライブラリバージョン依存を低減する。

#### デルタ参照の決定ルール（操作時点で確定 — 全件探索不要）

| 操作 | デルタベース | 処理 |
|------|------------|------|
| `createBranch(fromNodeId, newContent)` | `fromNode.contentHash` | 分岐元との差分を計算。差分率 > 70%なら全文保存 |
| `upsertMessageAtIndex` | 旧`contentHash` | 編集前との差分を保存 |
| `insertMessageAtIndex` | なし | 新規ノードは全文保存（参照先がない） |
| `removeMessageAtIndex` | 削除ノードをdeltaBaseとしていたノードを再リンク | deltaBase → 削除ノードのdeltaBase or 全文昇格 |
| `updateLastNodeContent` | 旧`contentHash` | 編集前との差分 |

**ポイント**: 変更操作の時点でデルタベースが確定するため、ContentStore内の全エントリとの比較（全件探索）は一切不要。parentIdの管理と同様に、構造変更時にリンクを張り替えるだけ。

#### デルタチェーン深度制限

- 最大深度: 5（チェーンが深くなると復元コスト増大）
- 深度超過時: 全文スナップショットに昇格
- `resolveContent`時にチェーンを辿る回数を制限し、無限ループを防止

#### 全文昇格の閾値

- diff適用後のパッチサイズ ÷ 元テキストサイズ > 0.7 → 全文保存
- デルタベースが削除されチェーンが切れた場合 → 全文昇格

### 1.2 懸念事項と対策

| 懸念 | リスク | 対策 |
|------|--------|------|
| デルタチェーンの破損 | ベースエントリが誤って削除されると復元不能 | `releaseContent`でrefCount=0になる前にデルタ依存チェックを行い、依存先を全文昇格してから削除 |
| チェーン深度によるパフォーマンス劣化 | 深いチェーンは復元に複数回のpatch適用が必要 | 最大深度5で全文昇格。`resolveContent`に復元結果キャッシュ追加 |
| diff-match-patchのパッチ不整合 | バージョン間でパッチ形式が変わる可能性 | パッチをテキスト形式で保存（`patch_toText`）。ライブラリバージョンをロック |
| ストリーミング中のノード | SSE受信中はcontentが頻繁に更新される | ストリーミングハッシュ（`isStreamingContentHash`）はデルタ対象外。完了後に初めてデルタ化を検討 |
| Undo/Redo履歴との整合性 | スナップショットにデルタエントリが含まれる | Undo/Redoは現行通り参照ベースのスナップショット。`resolveContent`がデルタ対応していれば透過的に動作 |
| ノード挿入・削除でのデルタベースのずれ | 構造変更で親や兄弟の位置関係が変わる | 操作時点でデルタベースを確定し`deltaBaseHash`として保持。ツリー構造の変更ではなく内容のハッシュで参照するため、ノードの位置移動に影響されない |

### 1.3 実装ステップ

1. `diff-match-patch`ライブラリを導入
2. `ContentEntry`型を拡張（`delta`フィールド追加）
3. `contentStore.ts`に以下を追加:
   - `addContentDelta(store, content, baseHash)` — diff計算、閾値判定、デルタ or 全文で保存
   - `resolveContent`を拡張 — deltaの場合はチェーンを辿って復元
   - `promoteToFull(store, hash)` — デルタエントリを全文に昇格
   - `findDeltaDependents(store, hash)` — 指定ハッシュをdeltaBaseとするエントリを検索
4. `branch-domain.ts`の各操作関数を更新:
   - `createBranchState` → `addContentDelta`を使用
   - `upsertMessageAtIndexState` → 旧hashをベースにデルタ保存
   - `removeMessageAtIndexState` → デルタ参照の再リンク処理
5. マイグレーション: 既存データはそのまま動作（deltaフィールドがなければ全文として扱う）

---

## Part 2: コピーオンライト遅延gzip圧縮

### 2.1 設計

#### IndexedDBキー構造の変更

現在: 単一キー `'chat-data'` に全データを格納（毎回全体を書き込み）

変更後: チャットごとにキーを分離

```
persisted-state/
  meta              → { version, chatIds[], activeChatId }
  chat:{id}         → { chat: ChatInterface, state: 'raw' }
  chat:{id}:packed  → { compressed: Uint8Array, state: 'packed' }
  content-store     → ContentStoreData
  branch-clipboard  → BranchClipboard
```

#### コピーオンライト状態遷移

```
[raw] ──非アクティブ化──→ [raw] + [packed書き込み中]
                              │
                         packed書き込み完了確認
                              │
                         [raw削除] → [packed のみ]
                              │
                         再アクティブ化
                              │
                         [packed展開] → [raw] + [packed削除]
```

#### 読み込み解決ルール（raw優先の原則）

```
1. chat:{id} (raw) が存在 → そのまま使用（最も信頼できる）
2. raw不在 & chat:{id}:packed 存在 → 展開して使用
3. 両方存在 → rawを優先、packedは不整合として破棄
4. どちらも不在 → データなし
```

**どの時点で中断しても安全**:
- packed書き込み途中で中断 → rawが残存。不完全なpackedは無視
- raw削除途中で中断 → 両方存在 → raw優先ルールで安全
- 展開途中で中断 → packedが残存。次回起動時に再展開

#### 原子性の確保（2段階トランザクション）

```ts
// ステップ1: packed書き込み（rawはそのまま残す）
const tx1 = db.transaction('persisted-state', 'readwrite');
tx1.objectStore('persisted-state').put(compressedData, `chat:${id}:packed`);
await tx1.done;

// ステップ2: raw削除（packedが確実に書き込まれた後のみ実行）
const tx2 = db.transaction('persisted-state', 'readwrite');
tx2.objectStore('persisted-state').delete(`chat:${id}`);
await tx2.done;
```

#### 圧縮タイミング

- チャット切り替え時（旧チャットが非アクティブ化）
- `visibilitychange`イベントでページがhiddenになった時（アクティブチャット以外を圧縮）
- アイドルタイマー（`requestIdleCallback`、5分無操作後）
- `beforeunload`では**圧縮しない**（非同期が間に合わないため、非圧縮rawのまま保存）

### 2.2 懸念事項と対策

| 懸念 | リスク | 対策 |
|------|--------|------|
| **タブ強制終了（最重大）** | 圧縮中にrawが消え、packedも不完全 → データ消失 | raw削除はpacked書き込み完了後の**別トランザクション**で実行。packed未完了ならrawが残存 |
| **`beforeunload`での保存失敗** | 非同期gzip圧縮が完了しない | `beforeunload`では非圧縮rawを同期的に保存。圧縮は次回アイドル時 |
| **バックグラウンドタブのスロットリング** | `setTimeout`/`setInterval`が大幅に遅延 | `requestIdleCallback`を使用（影響を受けにくい）。圧縮はベストエフォート、未圧縮でも機能に影響なし |
| **IndexedDB容量制限** | 圧縮中にraw+packedが一時的に共存し容量倍増 | 1チャットずつ逐次処理し同時共存を最小化。圧縮完了後即座にraw削除 |
| **`CompressionStream`非対応ブラウザ** | Safari 16.4未満、古いFirefox | フォールバック: 圧縮をスキップし常にrawで保存。機能劣化なし |
| **マイグレーション中の中断** | 旧単一キーと新個別キーが混在 | 起動時に旧キーが存在すればマイグレーション未完了と判断し再実行。旧キー削除は全個別キー書き込み完了後の**最後のステップ** |
| **SSE受信中のチャット** | 頻繁な書き込みが圧縮と競合 | アクティブチャット（受信中含む）は圧縮対象外。`generating`フラグで判定 |
| **ContentStoreの分割問題** | チャットごとに分離するとrefCount管理が破綻 | ContentStoreは一括管理のまま維持。gzip圧縮はチャットオブジェクトのみに適用 |

### 2.3 実装ステップ

1. `IndexedDbStorage.ts`をチャット単位のキー構造にリファクタリング
2. `saveChatData`を差分書き込み対応に変更（変更されたチャットのみ書き込み）
3. `CompressionService`クラスを新規作成:
   - `compressChat(id)` — gzip圧縮 + packedキーに書き込み + raw削除
   - `decompressChat(id)` — packed読み込み + 展開 + rawキーに書き込み + packed削除
   - `resolveChat(id)` — 読み込み解決ルールに従って取得
   - `AbortController`で中断可能
4. 圧縮スケジューラの実装（チャット切り替え、visibilitychange、requestIdleCallback）
5. マイグレーション: 単一キー → 分割キーへの移行（旧キー削除は最後）

---

## Part 3: テスト計画

### 3.1 ユニットテスト

#### `contentStore.test.ts`（新規）

- `addContentDelta`: 差分がベースと比較して正しく保存されること
- `addContentDelta`: 差分率 > 70%で全文保存にフォールバックすること
- `resolveContent`（delta）: デルタチェーンを辿って正しく復元されること
- `resolveContent`（delta chain depth）: 深度5超でエラーまたは全文昇格
- `releaseContent`（delta dependency）: デルタ依存がある場合に依存先を全文昇格すること
- `promoteToFull`: デルタエントリが全文に正しく昇格すること
- `computeContentHash`: 衝突時の`_`サフィックス処理

#### `branch-domain.test.ts`（既存に追加）

- `createBranchState`: 分岐時にデルタエントリが作成されること
- `createBranchState`: 内容が大幅に異なる場合に全文で保存されること
- `upsertMessageAtIndexState`: 編集前のハッシュをベースにデルタが作成されること
- `removeMessageAtIndexState`: 削除されたノードのデルタ依存が正しく再リンクされること
- `insertMessageAtIndex` + `removeMessageAtIndex` の交互操作でデルタ整合性が維持されること

#### `CompressionService.test.ts`（新規）

- `compressChat`: raw → packed → raw削除の遷移が正しいこと
- `decompressChat`: packed → raw → packed削除の遷移が正しいこと
- `resolveChat`: raw優先ルールが正しく動作すること（4パターン全て）
- 圧縮/展開のラウンドトリップでデータが完全に一致すること

#### `IndexedDbStorage.test.ts`（既存を拡張）

- チャット単位のキー分離が正しく動作すること
- 差分書き込み（変更チャットのみ）が正しいこと
- マイグレーション: 旧単一キーから分割キーへの移行と中断リカバリ

### 3.2 統合テスト — 中断耐性

- 圧縮書き込み途中でトランザクションをabort → rawが残存すること
- raw削除途中でトランザクションをabort → 両方存在しraw優先で復元されること
- マイグレーション途中で中断 → 再起動時にマイグレーションが再実行されること

### 3.3 E2Eシナリオ

- チャットで複数回分岐 → エクスポート → インポート → 全メッセージが復元されること
- 分岐 → チャット切り替え（圧縮発動） → 戻る（展開） → メッセージが正しいこと
- 大量分岐（50+ブランチ）でのデータサイズがデルタなしと比較して削減されていること

### 3.4 パフォーマンステスト

- デルタチェーン深度1〜5でのresolveContent所要時間（< 1ms目標）
- 100チャット × 各10ブランチでの圧縮/展開サイクル時間
- gzip圧縮率の実測（実際のチャットデータで50-70%削減を確認）

---

## 実装順序（各Phase独立してマージ可能）

### Phase 1: デルタ圧縮（ContentStore層のみ、保存層は変更なし）
- diff-match-patch導入、ContentEntry拡張、デルタ操作関数、テスト
- **効果**: エクスポートサイズとメモリ使用量が削減される
- **リスク**: 低（既存の保存フローに変更なし）

### Phase 2: IndexedDBキー分離（圧縮なし、構造変更のみ）
- チャット単位のキー分離、差分書き込み、マイグレーション、テスト
- **効果**: 書き込みパフォーマンスが改善（全体ではなく変更チャットのみ）
- **リスク**: 中（マイグレーションの安全性確保が必要）

### Phase 3: コピーオンライト遅延gzip圧縮
- CompressionService、圧縮スケジューラ、中断リカバリ、テスト
- **効果**: IndexedDBのディスク使用量が大幅に削減
- **リスク**: 中（SPA中断シナリオへの対応が必要、ただしCoW設計で緩和済み）
