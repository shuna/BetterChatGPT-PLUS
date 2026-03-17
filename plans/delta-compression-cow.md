# デルタ圧縮 + コピーオンライト永続化

## 概要

チャットデータの肥大化を抑制するため、以下の2つの手法を組み合わせて実装する：

1. **デルタ圧縮**: 分岐ノード間のテキスト差分のみを保存し、ContentStoreのサイズを削減
2. **コピーオンライト遅延gzip圧縮**: 非アクティブチャットをバックグラウンドでgzip圧縮し、IndexedDBの使用量を削減

---

## Part 1: デルタ圧縮

### 1.1 設計

#### デルタ対象の限定: text-onlyエントリのみ

ContentInterface[]は`text`と`image_url`（base64含む）を含み得る。画像データにテキストdiffを掛けるとサイズ・CPU両面で悪化するため、**全ContentInterface要素がtextのみで構成されるエントリだけをデルタ対象とする**。image_urlを1つでも含むエントリは常に全文保存。

```ts
function isDeltaEligible(content: ContentInterface[]): boolean {
  return content.every(c => c.type === 'text');
}
```

#### BranchNodeの拡張

```ts
interface BranchNode {
  id: string;
  parentId: string | null;
  role: Role;
  contentHash: string;
  createdAt: number;
  label?: string;
  // deltaBaseHashはBranchNodeには持たない。
  // デルタ参照はContentEntry.delta.baseHashで管理する。
  // 理由: contentHashはノード間で共有されるため、デルタ参照もコンテンツ層で管理すべき。
}
```

#### ContentStoreの拡張

```ts
interface ContentEntry {
  content: ContentInterface[];  // 全文保存時に使用
  refCount: number;
  delta?: {
    baseHash: string;          // デルタ元のcontentHash
    patches: string;           // diff-match-patchのパッチテキスト（patch_toText形式）
  };
  // content と delta は排他:
  //   - delta なし → content に全文
  //   - delta あり → content は空配列、復元は baseHash + patches で行う
}
```

#### デルタ参照の決定ルール（操作時点で確定 — 全件探索不要）

| 操作 | デルタベース | 処理 |
|------|------------|------|
| `createBranch(fromNodeId, newContent)` | `fromNode.contentHash` | 分岐元との差分を計算。差分率 > 70% or 画像含む → 全文保存 |
| `upsertMessageAtIndex` | 旧`contentHash` | 編集前との差分を保存 |
| `insertMessageAtIndex` | なし | 新規ノードは全文保存（参照先がない） |
| `updateLastNodeContent` | 旧`contentHash` | 編集前との差分 |

**ポイント**: 変更操作の時点でデルタベースが確定するため、ContentStore内の全エントリとの比較（全件探索）は一切不要。

#### デルタ依存の解決: releaseContent中心の設計

ノード削除（`removeMessageAtIndex`）はデルタの再リンクを**行わない**。理由:

- ContentStoreはハッシュ単位の共有ストア。同じcontentHashを複数ノードが参照する
- ノード削除≠コンテンツ削除。refCountが残っていればエントリは生存する
- 不要な再リンクや誤判定を避けるため、**`releaseContent`でrefCount→0になる直前**に依存解決を行う

```ts
function releaseContent(store: ContentStoreData, hash: string): void {
  const entry = store[hash];
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    // このエントリをdeltaBaseとしている他エントリを全文昇格
    promoteDependents(store, hash);
    delete store[hash];
  }
}

function promoteDependents(store: ContentStoreData, baseHash: string): void {
  for (const [hash, entry] of Object.entries(store)) {
    if (entry.delta?.baseHash === baseHash) {
      // 復元してから全文に昇格
      const resolved = resolveContentChain(store, hash);
      entry.content = resolved;
      delete entry.delta;
    }
  }
}
```

この設計なら:
- ノード挿入・削除でデルタリンクを弄る必要がない
- 「最後の参照が消える」タイミングでのみ昇格処理が走る
- `promoteDependents`のスキャン範囲はContentStore全体だが、refCount→0は稀な操作であり頻度は低い

#### デルタチェーン深度制限

- 最大深度: 5（チェーンが深くなると復元コスト増大）
- `addContentDelta`時にベースのチェーン深度を確認し、深度超過時は全文保存
- `resolveContent`時にもチェーン長を検証し、無限ループを防止

#### 全文昇格の閾値

- パッチサイズ ÷ 元テキストのJSON文字列長 > 0.7 → 全文保存（デルタの意味がない）
- デルタベースがtext-onlyでない場合 → 全文保存
- チェーン深度 >= 5 → 全文保存

### 1.2 Export/Import/Persistence互換

Phase 1を単独でマージ可能にするため、以下の互換対応をPhase 1に含める。

#### Export（エクスポート）

現在のエクスポートは`entry.content`をそのまま複製している。デルタ化後はcontentが空配列になるエントリがあるため、**エクスポート時にデルタを解決して全文に展開する**。

```ts
// exportService内
function buildExportContentStore(store: ContentStoreData): ContentStoreData {
  const exported: ContentStoreData = {};
  for (const [hash, entry] of Object.entries(store)) {
    if (entry.delta) {
      // デルタを解決して全文で出力
      exported[hash] = {
        content: resolveContent(store, hash),
        refCount: entry.refCount,
        // deltaフィールドは含めない → 互換性のあるV3フォーマット
      };
    } else {
      exported[hash] = { ...entry };
    }
  }
  return exported;
}
```

これにより:
- エクスポートファイルは既存のV3フォーマットと完全互換
- デルタ非対応バージョンでもインポート可能
- エクスポートサイズ削減は**このPhaseでは目標としない**（Phase 1の効果はメモリ・IndexedDB内部サイズの削減）

将来的にデルタ付きエクスポート（V4フォーマット）を導入する場合は別Phaseで検討。

#### Import（インポート）

インポートデータにはdeltaフィールドがない（V3互換エクスポート）ため、**インポートパスは変更不要**。既存の`addContent`がそのまま全文で取り込む。

#### Persistence（永続化）

IndexedDBへの保存は現行の単一`put`のまま。ContentStoreData内にdeltaフィールドが含まれるが、読み込み時の`resolveContent`がデルタ対応していれば透過的に動作する。deltaフィールドがないエントリは従来通り全文として扱う（後方互換）。

### 1.3 懸念事項と対策

| 懸念 | リスク | 対策 |
|------|--------|------|
| デルタチェーンの破損 | ベースエントリが参照カウント外で消えると復元不能 | `releaseContent`のrefCount→0時に`promoteDependents`で依存先を全文昇格してから削除 |
| チェーン深度によるパフォーマンス劣化 | 深いチェーンは復元に複数回のpatch適用が必要 | 最大深度5。`addContentDelta`時にベース深度チェック。`resolveContent`に復元結果キャッシュ追加 |
| diff-match-patchのパッチ不整合 | バージョン間でパッチ形式が変わる可能性 | パッチをテキスト形式で保存（`patch_toText`）。ライブラリバージョンをロック |
| 画像・バイナリデータへのdiff適用 | base64文字列へのテキストdiffはサイズ・CPU悪化 | `isDeltaEligible`で**text-onlyエントリのみ**をデルタ対象に限定 |
| ストリーミング中のノード | SSE受信中はcontentが頻繁に更新される | ストリーミングハッシュ（`isStreamingContentHash`）はデルタ対象外。完了後に初めてデルタ化を検討 |
| Undo/Redo履歴との整合性 | スナップショットにデルタエントリが含まれる | Undo/Redoは現行通り参照ベースのスナップショット。`resolveContent`がデルタ対応していれば透過的に動作 |
| エクスポートの互換性 | デルタ入りContentStoreをそのまま出力すると旧バージョンで読めない | エクスポート時に全デルタを解決して全文に展開。V3フォーマット互換を維持 |

### 1.4 実装ステップ

1. `diff-match-patch`ライブラリを導入
2. `ContentEntry`型を拡張（`delta`フィールド追加）
3. `contentStore.ts`に以下を追加:
   - `isDeltaEligible(content)` — text-only判定
   - `addContentDelta(store, content, baseHash)` — diff計算、text-only・閾値・深度判定、デルタ or 全文で保存
   - `resolveContent`を拡張 — deltaの場合はチェーンを辿って復元
   - `promoteToFull(store, hash)` — デルタエントリを全文に昇格
   - `promoteDependents(store, hash)` — 指定ハッシュに依存するエントリを全文昇格
   - `releaseContent`を拡張 — refCount→0時にpromoteDependentsを呼ぶ
   - `getChainDepth(store, hash)` — デルタチェーンの深度を返す
4. `branch-domain.ts`の各操作関数を更新:
   - `createBranchState` → `addContentDelta`を使用
   - `upsertMessageAtIndexState` → 旧hashをベースにデルタ保存
5. エクスポートパスを更新:
   - `buildExportContentStore`を追加し、デルタを解決して全文で出力
   - 既存のV3フォーマット互換を維持
6. マイグレーション: 不要（deltaフィールドがなければ全文として扱う、後方互換）

---

## Part 2: コピーオンライト遅延gzip圧縮

### 2.1 設計

#### IndexedDBキー構造の変更と世代番号管理

現在: 単一キー `'chat-data'` に全データを格納（毎回全体を書き込み）

変更後: チャットごとにキーを分離し、**世代番号（generation）で整合性を保証**

```
persisted-state/
  meta              → { version, generation: number, activeChatId }
  chat:{id}         → { chat: ChatInterface, generation: number }
  chat:{id}:packed  → { compressed: Uint8Array, generation: number }
  content-store     → { data: ContentStoreData, generation: number }
  branch-clipboard  → { data: BranchClipboard, generation: number }
```

#### 世代番号によるchat↔content-store整合性保証

chatとcontent-storeを別レコードにすると、クラッシュ復旧時に片方だけが更新された状態が残り得る。BranchNode.contentHashがcontent-store側に存在しないと復元不能になる。

##### コミット中のcontent-storeはsuperset（旧hash保持）

**問題**: 新しいcontent-storeが旧hashをGC済みの状態で先に保存され、chat更新前に中断すると、旧chatが参照するhashがcontent-storeに存在しない状態になる。

**対策**: コミット中に保存するcontent-storeは、**新旧両方のhashを含むsuperset**とする。GC（refCount=0のエントリ削除）はコミット完了後に遅延実行する。

```ts
async function commitState(db, chats, contentStore, changedChatIds) {
  const nextGen = currentGeneration + 1;

  // GCを遅延: refCount=0のエントリにpendingDeleteマークを付けるが、
  // この時点ではまだ削除しない
  const supersetStore = buildSupersetForCommit(contentStore, pendingDeletes);

  // ステップ1: content-store(superset)を最初に書く
  // 旧chatが参照するhashも新chatが参照するhashも両方含む
  const tx1 = db.transaction('persisted-state', 'readwrite');
  tx1.objectStore('persisted-state').put(
    { data: supersetStore, generation: nextGen },
    'content-store'
  );
  await tx1.done;

  // ステップ2: 変更されたchatとbranch-clipboardを書く
  // content-storeが先に書かれているため、これらが参照するhashは必ず存在する
  const tx2 = db.transaction('persisted-state', 'readwrite');
  const store = tx2.objectStore('persisted-state');
  for (const id of changedChatIds) {
    store.put({ chat: chats[id], generation: nextGen }, `chat:${id}`);
  }
  store.put({ data: branchClipboard, generation: nextGen }, 'branch-clipboard');
  await tx2.done;

  // ステップ3: metaのgenerationを更新（コミットマーカー）
  const tx3 = db.transaction('persisted-state', 'readwrite');
  tx3.objectStore('persisted-state').put(
    { version: STORE_VERSION, generation: nextGen, activeChatId },
    'meta'
  );
  await tx3.done;

  currentGeneration = nextGen;

  // ステップ4: GC実行（コミット完了後に安全に削除）
  // 全chatがnextGenに到達しているため、旧hashへの参照は残っていない
  if (pendingDeletes.length > 0) {
    const txGc = db.transaction('persisted-state', 'readwrite');
    txGc.objectStore('persisted-state').put(
      { data: contentStore, generation: nextGen },  // GC済みの本来のstore
      'content-store'
    );
    await txGc.done;
  }
}
```

```ts
function buildSupersetForCommit(
  currentStore: ContentStoreData,
  pendingDeletes: string[]
): ContentStoreData {
  // currentStoreはメモリ上ではすでにrefCount=0のエントリが削除されている。
  // pendingDeletesに記録された「今回のコミットで消えるhash」を
  // 旧content-storeから復元して一時的にsupersetに含める。
  const superset = { ...currentStore };
  for (const hash of pendingDeletes) {
    if (!(hash in superset) && hash in previousContentStoreSnapshot) {
      superset[hash] = { ...previousContentStoreSnapshot[hash], refCount: 0 };
    }
  }
  return superset;
}
```

##### 中断シナリオの安全性

| 中断タイミング | ディスク状態 | 安全性 |
|---------------|-------------|--------|
| ステップ1後（content-store書き込み後） | content-store=superset(nextGen), chat=旧, meta=旧 | **安全**: supersetは旧hashも含むため、旧chatの参照は解決可能 |
| ステップ2途中（一部chatのみ更新） | content-store=superset(nextGen), 一部chat=nextGen/一部chat=旧, meta=旧 | **安全**: supersetは新旧両方のhashを含む |
| ステップ3後、ステップ4前（GC未実行） | content-store=superset(nextGen), 全chat=nextGen, meta=nextGen | **安全**: supersetに不要エントリが残るだけ（メモリリークだが復元は正常） |
| ステップ4途中（GC中断） | content-storeが中途半端 | **安全**: 次回起動時にchatが参照するhashを走査し、参照されていないエントリを再GCすればよい |

##### 復旧ルール（起動時）

```
1. meta.generation を読む → G とする
2. content-store.generation を確認:
   - generation === G → 正常
   - generation > G → content-storeは書けたがmeta更新前に中断
     → supersetなので旧chatの参照も解決可能。安全。
     → meta.generation を content-store.generation に合わせて修正
3. 各 chat:{id} の generation を確認:
   - generation === G → 正常
   - generation < G → chatはコミット途中で中断。content-storeはsupersetなので参照は解決可能
4. GC残留チェック:
   - 全chatおよびbranch-clipboardが参照するcontentHashを収集
   - content-store内でどこからも参照されていないエントリを削除（遅延GCの再実行）
```

**設計の鍵**: content-storeを書く時点では**何も消さない（superset）**。消すのはコミット完了後。これにより、どの時点で中断しても旧chatが参照するhashがcontent-storeに存在することが保証される。

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

#### 原子性の確保（2段階トランザクション）

```ts
// 圧縮: packed書き込み → raw削除（別トランザクション）
// 展開: raw書き込み → packed削除（別トランザクション）
// どの時点で中断してもraw優先ルールで安全
```

#### 圧縮タイミング

- チャット切り替え時（旧チャットが非アクティブ化）
- `visibilitychange`イベントでページがhiddenになった時（アクティブチャット以外を圧縮）
- アイドルタイマー（`requestIdleCallback`、5分無操作後）
- `beforeunload`では**圧縮しない**（非同期が間に合わないため、非圧縮rawのまま保存）

### 2.2 懸念事項と対策

| 懸念 | リスク | 対策 |
|------|--------|------|
| **chat↔content-store整合性（最重大）** | chatが参照するcontentHashがcontent-storeにない → 復元不能 | content-storeはコミット中superset（旧hash保持）で書き込み。GCはコミット完了後に遅延実行。起動時にgeneration照合+参照走査で不整合を検出・修復 |
| **タブ強制終了** | 圧縮中にrawが消え、packedも不完全 → データ消失 | raw削除はpacked書き込み完了後の別トランザクション。packed未完了ならrawが残存 |
| **`beforeunload`での保存失敗** | 非同期gzip圧縮が完了しない | `beforeunload`では非圧縮rawを同期的に保存。圧縮は次回アイドル時 |
| **バックグラウンドタブのスロットリング** | `setTimeout`が大幅に遅延 | `requestIdleCallback`を使用。圧縮はベストエフォート、未圧縮でも機能に影響なし |
| **IndexedDB容量制限** | 圧縮中にraw+packedが一時的に共存 | 1チャットずつ逐次処理。圧縮完了後即座にraw削除 |
| **`CompressionStream`非対応ブラウザ** | Safari 16.4未満 | フォールバック: 圧縮をスキップし常にrawで保存。機能劣化なし |
| **マイグレーション中の中断** | 旧単一キーと新個別キーが混在 | 旧キー存在=マイグレーション未完了と判断し再実行。旧キー削除は最後のステップ |
| **SSE受信中のチャット** | 頻繁な書き込みが圧縮と競合 | アクティブチャット（受信中含む）は圧縮対象外。`generating`フラグで判定 |
| **ContentStoreの分割問題** | チャットごとに分離するとrefCount管理が破綻 | ContentStoreは一括管理のまま維持。gzip圧縮はチャットオブジェクトのみに適用 |

### 2.3 実装ステップ

1. `IndexedDbStorage.ts`をチャット単位のキー構造 + 世代番号管理にリファクタリング
2. `commitState`関数を実装（content-store superset先行書き込み、meta最後、GCはコミット後）
3. `buildSupersetForCommit`を実装（pendingDeletesの旧hashをsupersetに含める）
4. 起動時のgeneration照合・修復・残留GCロジックを実装
4. `saveChatData`を差分書き込み対応に変更（変更されたチャットのみ書き込み）
5. `CompressionService`クラスを新規作成:
   - `compressChat(id)` — gzip圧縮 + packedキーに書き込み + raw削除
   - `decompressChat(id)` — packed読み込み + 展開 + rawキーに書き込み + packed削除
   - `resolveChat(id)` — 読み込み解決ルールに従って取得
   - `AbortController`で中断可能
6. 圧縮スケジューラの実装（チャット切り替え、visibilitychange、requestIdleCallback）
7. マイグレーション: 単一キー → 分割キーへの移行（旧キー削除は最後）

---

## Part 3: テスト計画

### 3.1 ユニットテスト

#### `contentStore.test.ts`（新規）

**デルタ基本操作**:
- `addContentDelta`: text-onlyエントリで差分が正しく保存されること
- `addContentDelta`: image_urlを含むエントリは常に全文保存されること
- `addContentDelta`: 差分率 > 70%で全文保存にフォールバックすること
- `addContentDelta`: チェーン深度 >= 5で全文保存にフォールバックすること
- `resolveContent`（delta）: デルタチェーンを辿って正しく復元されること
- `resolveContent`（delta chain depth 5）: 最大深度でも正しく復元されること
- `promoteToFull`: デルタエントリが全文に正しく昇格すること

**デルタ破損への防御**:
- `resolveContent`: baseHashが存在しない → エラーを局所化し空コンテンツ or 例外（呼び出し元で処理）
- `resolveContent`: 循環参照（A→B→A） → 深度カウンタで検出、全文フォールバック不可のためエラー
- `resolveContent`: `patch_fromText`/`patch_apply`が失敗 → エラーを局所化、該当エントリを破損マークし呼び出し元に通知
- `resolveContent`: デルタベースがtext-onlyでない（実装バグ） → 全文フォールバック不可のためエラー
- 起動時バリデーション: 全デルタエントリのbaseHash存在チェック。不在の場合はエントリを破損扱いとしログ出力

**依存解決（releaseContent中心）**:
- `releaseContent`: refCount→0時に依存エントリが全文昇格されること
- `releaseContent`: refCount→0のエントリがdeltaBaseでない場合は単純削除されること
- `releaseContent`: 多段依存（A←B←C、Aが消える）でB,C両方が昇格されること
- `releaseContent`: refCount > 0のエントリは依存チェックされないこと

**既存機能の回帰**:
- `computeContentHash`: 衝突時の`_`サフィックス処理
- `addContent`/`retainContent`/`releaseContent`: deltaなしの従来動作が変わらないこと

#### `branch-domain.test.ts`（既存に追加）

- `createBranchState`: text-only分岐時にデルタエントリが作成されること
- `createBranchState`: 画像含む分岐時に全文で保存されること
- `createBranchState`: 内容が大幅に異なる場合に全文で保存されること
- `upsertMessageAtIndexState`: 編集前のハッシュをベースにデルタが作成されること
- 分岐作成→全ブランチ削除→contentStore整合性が保たれること（依存昇格の統合テスト）

#### `CompressionService.test.ts`（新規）

- `compressChat`: raw → packed → raw削除の遷移が正しいこと
- `decompressChat`: packed → raw → packed削除の遷移が正しいこと
- `resolveChat`: raw優先ルール4パターン全て
- 圧縮/展開のラウンドトリップでデータが完全に一致すること

#### `IndexedDbStorage.test.ts`（既存を拡張）

- チャット単位のキー分離が正しく動作すること
- 差分書き込み（変更チャットのみ）が正しいこと
- 世代番号: content-store(G), chat(G-1), meta(G-1) → 起動時に正常扱い、旧chatの参照がsuperset内に存在すること
- 世代番号: content-store(G+1), meta(G) → meta.generationが修正されること
- superset: コミット中のcontent-storeが旧hashを含んでいること
- 遅延GC: コミット完了後にrefCount=0のエントリが削除されること
- GC中断リカバリ: 起動時に参照走査で不要エントリが再GCされること

**clipboard世代ずれ**:
- branch-clipboard(nextGen) + content-store(oldGen) → clipboard参照のhashが解決可能であること（supersetによる保護、またはcontent-store先行書き込みにより到達不可能な状態であること）
- content-store(nextGen) + branch-clipboard(oldGen) → 旧clipboardの参照がsuperset内に存在すること
- 起動時GC: clipboardが参照するhashがGC対象から除外されること

- マイグレーション: 旧単一キーから分割キーへの移行と中断リカバリ

### 3.2 統合テスト — 中断耐性

- commitState: ステップ1(superset書き込み)後に中断 → 旧chat・旧clipboardが参照するhashがsuperset内に存在し復旧可能
- commitState: ステップ2途中(一部chat書き込み、clipboard未書き込み)で中断 → 旧clipboardの参照がsupersetで保護されること
- commitState: ステップ2(chat+clipboard書き込み)後に中断 → meta未更新、supersetが新旧両方含むため復旧可能
- commitState: ステップ3後ステップ4(GC)前に中断 → supersetに不要エントリが残るが復元は正常。起動時再GCで解消
- commitState: ステップ4(GC)後にclipboard/chatの参照が残っているケース → GC対象から除外されていること
- 圧縮: packed書き込み途中でabort → rawが残存すること
- 圧縮: raw削除途中でabort → 両方存在しraw優先で復元されること
- マイグレーション途中で中断 → 再起動時にマイグレーションが再実行されること

### 3.3 E2Eシナリオ

- チャットで複数回分岐 → エクスポート → インポート → 全メッセージが復元されること
- デルタ化されたチャットのエクスポートがV3フォーマット互換であること（deltaフィールドなし）
- 分岐 → チャット切り替え（圧縮発動） → 戻る（展開） → メッセージが正しいこと
- 大量分岐（50+ブランチ）でのデータサイズがデルタなしと比較して削減されていること

### 3.4 パフォーマンステスト

- デルタチェーン深度: 深度1→5で所要時間が概ね線形増加であること（指数的悪化がないことを確認）
- `promoteDependents`: 1000エントリでのスキャンがUIブロッキング級（16ms超）に悪化しないこと
- 100チャット × 各10ブランチでの圧縮/展開サイクル: 全体で数秒以内に完了すること
- gzip圧縮率の実測（実際のチャットデータで50-70%削減を確認）

---

## 実装順序（各Phase独立してマージ可能）

### Phase 1: デルタ圧縮 + Export互換
- diff-match-patch導入、ContentEntry拡張、デルタ操作関数
- text-onlyエントリのみをデルタ対象に限定
- releaseContent中心の依存解決（refCount→0時にpromoteDependents）
- エクスポート時にデルタ→全文展開（V3互換維持）
- テスト
- **効果**: メモリ使用量とIndexedDB内部サイズの削減
- **エクスポートサイズ削減はこのPhaseでは対象外**（V3互換を優先）
- **リスク**: 低（保存フロー・エクスポートフォーマットに破壊的変更なし）

### Phase 2: IndexedDBキー分離 + 世代番号管理
- チャット単位のキー分離
- 世代番号によるchat↔content-store整合性保証（superset先行書き込み、meta最後、GC遅延実行）
- 起動時のgeneration照合・修復・残留GCロジック
- 差分書き込み（変更チャットのみ）
- マイグレーション
- テスト
- **効果**: 書き込みパフォーマンスが改善（全体ではなく変更チャットのみ）
- **リスク**: 中（マイグレーションの安全性 + 世代番号管理の正確性が必要）

### Phase 3: コピーオンライト遅延gzip圧縮
- CompressionService、圧縮スケジューラ、中断リカバリ
- テスト
- **効果**: IndexedDBのディスク使用量が大幅に削減
- **リスク**: 中（SPA中断シナリオへの対応が必要、ただしCoW設計で緩和済み）
