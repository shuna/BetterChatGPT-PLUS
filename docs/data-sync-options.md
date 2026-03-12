# Weavelet Canvas: デバイス間データ同期オプション検討

## 現行アーキテクチャ概要

- **SPA（クライアントオンリー）**: React + Zustand + localStorage（lz-string圧縮）
- **既存クラウド同期**: Google Drive API（OAuth2、ファイル丸ごとアップロード/ダウンロード）
- **ストレージ抽象化**: Zustandの`PersistStorage<S>`インターフェースを使用 → 新バックエンドの追加が比較的容易
- **データサイズ**: チャット履歴 + BranchTree + ContentStore（会話量に依存、数MB〜数十MB規模）
- **Electron対応**: デスクトップアプリとしても動作

---

## 同期方式の分類

```
┌─────────────────────────────────────────────────────────────┐
│                   デバイス間データ同期                         │
├──────────────┬──────────────────┬───────────────────────────┤
│  クラウド経由  │   P2P / ローカル  │     手動 / オフライン      │
├──────────────┼──────────────────┼───────────────────────────┤
│ Google Drive  │ WebRTC P2P      │ ファイルExport/Import     │
│ Dropbox       │ CRDTs (Yjs等)   │ QRコードトランスファー      │
│ OneDrive      │                  │ クリップボード / Share API  │
│ GitHub Gist   │                  │                           │
│ Firebase      │                  │                           │
│ Supabase      │                  │                           │
│ CouchDB       │                  │                           │
│ remoteStorage │                  │                           │
└──────────────┴──────────────────┴───────────────────────────┘
```

---

## A. クラウドストレージ型（Google Drive類似パターン）

### A1. Dropbox API

| 項目 | 内容 |
|------|------|
| **方式** | OAuth2 PKCE → Dropbox HTTP API v2でファイル読み書き |
| **npm** | `dropbox` (公式SDK v10.34、~150-200KB gzip。**3年以上未更新**) |
| **無料枠** | 2GB ストレージ（本アプリには十分すぎる） |
| **実装難易度** | ★★☆ 低〜中（Google Driveとほぼ同じパターン） |
| **CORS** | Dropbox APIはCORS対応済み、SPA直接呼び出し可 |
| **利点** | Google Drive実装とほぼ同構造でコード再利用可能。ユーザー母数が大きい |
| **欠点** | SDKが3年以上未メンテナンス。バンドルサイズ大（~150-200KB gzip、tree-shake不可）。APIの制限（150 req/min/user）。PKCE対応必須 |
| **注意** | SDKの代わりにfetch直接呼び出しも検討すべき（APIはシンプルなREST） |
| **実装見通し** | `GoogleCloudStorage.ts`をベースに`DropboxCloudStorage.ts`を作成。OAuth2 PKCEフロー + `/files/upload`、`/files/download`エンドポイント使用 |

### A2. OneDrive (Microsoft Graph API)

| 項目 | 内容 |
|------|------|
| **方式** | MSAL.js (OAuth2 PKCE) → Microsoft Graph APIでファイル操作 |
| **npm** | `@azure/msal-browser` (~55-70KB gzip、tree-shake困難) + fetch |
| **無料枠** | 5GB (個人) / 1TB (Microsoft 365) |
| **実装難易度** | ★★★ 中〜高（Azure ADアプリ登録が必要、MSALのセットアップが複雑） |
| **CORS** | Graph APIはCORS対応済み |
| **利点** | Windowsユーザーの多くが利用可能。大容量。企業アカウント対応 |
| **欠点** | Azure AD登録の管理が面倒。MSALライブラリが重い。**SPAタイプのリフレッシュトークンは24時間で失効**（再認証が必要） |
| **実装見通し** | Google Driveと同パターン。`/me/drive/root:/weavelet-canvas.json:/content`でファイル操作 |

### A3. GitHub Gist

| 項目 | 内容 |
|------|------|
| **方式** | GitHub OAuth / PAT → Gist API でJSONファイルを読み書き |
| **npm** | 不要（fetch + GitHub REST API） |
| **無料枠** | 無制限（Gist自体は無料、ファイルサイズ上限 ~100MB） |
| **実装難易度** | ★★☆ 低〜中 |
| **CORS** | GitHub APIはCORS対応済み |
| **利点** | 開発者ユーザーにとって親和性が高い。バージョン履歴が自動的に残る（Gitベース）。追加登録不要 |
| **欠点** | 一般ユーザーにはGitHubアカウントのハードルが高い。OAuth Appの登録が必要。大きなデータには不向き（API制限 60req/hr未認証、5000req/hr認証済み） |
| **実装見通し** | `POST /gists`で作成、`PATCH /gists/:id`で更新、`GET /gists/:id`で取得。シンプルなREST |

---

## B. BaaS型（リアルタイム同期が可能）

### B1. Firebase (Firestore / Realtime Database)

| 項目 | 内容 |
|------|------|
| **方式** | Firebase SDK → Firestore or Realtime Database |
| **npm** | `firebase` (モジュラーSDK v10+: Firestore ~61KB + Auth ~20KB gzip、tree-shakable) |
| **無料枠** | Spark Plan: Firestore 1GB保存 + 50K読み取り/日 + 20K書き込み/日 + Auth 50K MAU |
| **実装難易度** | ★★☆ 低〜中（SDK充実、ドキュメント豊富） |
| **リアルタイム** | Firestoreの`onSnapshot`で変更をリアルタイム受信可能 |
| **利点** | **リアルタイム同期**が可能（他デバイスの変更を即座に反映）。オフライン対応内蔵。匿名認証も使える。バックエンドサーバー不要 |
| **欠点** | Googleへのベンダーロックイン。無料枠を超えると課金。バンドルサイズがやや大きい |
| **実装見通し** | `PersistStorage`としてFirestoreドキュメントに読み書き。`onSnapshot`で他デバイスからの変更を検知してZustandストアを更新 |

```typescript
// 概念例: FirestoreCloudStorage
const firestoreStorage: PersistStorage<S> = {
  getItem: async (name) => {
    const doc = await getDoc(doc(db, 'users', uid, 'state', name));
    return doc.exists() ? doc.data() : null;
  },
  setItem: async (name, value) => {
    await setDoc(doc(db, 'users', uid, 'state', name), value);
  },
  removeItem: async (name) => {
    await deleteDoc(doc(db, 'users', uid, 'state', name));
  },
};
```

### B2. Supabase

| 項目 | 内容 |
|------|------|
| **方式** | Supabase SDK → PostgreSQL + Realtime |
| **npm** | `@supabase/supabase-js` (~35-50KB gzip、tree-shakable) |
| **無料枠** | 500MB DB + 1GB Storage + 50K MAU（**7日間非アクティブで自動停止**） |
| **実装難易度** | ★★☆ 低〜中 |
| **リアルタイム** | PostgreSQL LISTEN/NOTIFY ベースのWebSocketリアルタイムサブスクリプション |
| **利点** | オープンソース。PostgreSQL標準（SQL/JOIN可）。Row Level Securityで認証統合。セルフホスト可能 |
| **欠点** | **無料枠は7日間DBアクセスがないとプロジェクトが自動停止**。DB容量500MBと小さめ。バックアップ/SLAなし |
| **実装見通し** | テーブル`user_state(user_id, key, value_json, updated_at)`を作成。Realtime subscriptionで他デバイスの変更を検知 |

---

## C. オフラインファースト / P2P型

### C1. PouchDB + CouchDB

| 項目 | 内容 |
|------|------|
| **方式** | ブラウザ内PouchDB（IndexedDB）↔ CouchDB互換サーバーと双方向同期 |
| **npm** | `pouchdb-browser` (~45KB gzip) |
| **無料CouchDB** | IBM Cloudant (1GB無料) / Fly.io自前ホスト |
| **実装難易度** | ★★★ 中（CouchDBサーバーの運用が必要） |
| **リアルタイム** | `db.changes({live: true})`で変更フィードをリアルタイム受信 |
| **利点** | **オフラインファースト**のゴールドスタンダード。CouchDBプロトコルによる信頼性の高い双方向同期。コンフリクト解決が組み込み |
| **欠点** | CouchDBサーバーの運用コスト/複雑さ。ドキュメント指向DBへのデータモデル変換が必要 |
| **実装見通し** | 現在のZustandストアをPouchDBドキュメントとしてモデリング。`PouchDB.sync(remoteDb, {live: true})`で自動同期 |

### C2. CRDTs (Yjs + y-webrtc)

| 項目 | 内容 |
|------|------|
| **方式** | CRDT（Conflict-free Replicated Data Type）による分散データ構造 |
| **npm** | `yjs` (~18-20KB gzip) + `y-webrtc` (~15-25KB) + `y-indexeddb` + `zustand-middleware-yjs` |
| **実装難易度** | ★★★★ 高（データモデルの根本的な再設計が必要） |
| **リアルタイム** | y-webrtcで直接P2P同期。同一ブラウザ内タブはBroadcastChannelで自動同期 |
| **利点** | サーバーレスP2P同期が可能。同時編集にも対応。オフライン対応が完全（y-indexeddb）。`zustand-middleware-yjs`でZustandとの統合ミドルウェアが存在 |
| **欠点** | **データモデルの大幅な変更が必要**（JSON→Y.Map/Y.Array）。学習コストが高い。`zustand-middleware-yjs`は単一メンテナー。Automergeは200-400KB gzip(WASM)でさらに重い |
| **実装見通し** | 現行のZustand + JSON構造からYjsのY.Map/Y.Arrayへの移行が大規模。ROI低い |

```typescript
// 概念例: Zustand + Yjs統合（zustand-middleware-yjsを使用）
import yjs from 'zustand-middleware-yjs'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

const ydoc = new Y.Doc()
const provider = new WebrtcProvider('weavelet-room', ydoc, {
  signaling: ['wss://signaling.yjs.dev'],
  password: 'optional-encryption-key',
})

const useStore = create(
  yjs(ydoc, 'shared', (set) => ({
    chats: [],
    // ... シリアライズ可能なステートのみ同期
  }))
)
```

### C3. WebRTC DataChannel（直接P2P）

| 項目 | 内容 |
|------|------|
| **方式** | WebRTC DataChannelで2デバイス間を直接接続しデータ転送 |
| **npm** | `peerjs` (~60-70KB gzip, 13.2k stars) or `trystero` (シグナリングサーバー不要) |
| **実装難易度** | ★★★ 中 |
| **利点** | 高速な直接転送。プライバシー性が高い。E2E暗号化 |
| **欠点** | **両デバイスが同時にオンラインである必要**。NAT越えで~10-20%の接続がTURNリレー必要。コンフリクト解決は自前実装 |
| **実装見通し** | PeerJSの公開シグナリングサーバー or 自前。QRコードでPeer IDを共有。接続後にステート全体を送信 |

#### 注目: Trystero（サーバーレスP2P）

[Trystero](https://github.com/dmotz/trystero)は既存の分散インフラ（BitTorrentトラッカー、Nostrリレー、MQTTブローカー等）をシグナリングに利用し、**自前サーバー完全不要**でP2P接続を確立する:

```typescript
import { joinRoom } from 'trystero/nostr' // or /torrent, /mqtt, /supabase, /firebase
const room = joinRoom({ appId: 'weavelet-canvas' }, 'room-id')
const [sendState, getState] = room.makeAction('sync')
sendState(compressedState)              // 全ピアに送信
getState((data, peerId) => { ... })     // ピアからの受信
```

各ストラテジーは個別importでtree-shake可能。データはE2E暗号化され、シグナリング媒体にはデータ本体が流れない。

---

## D. 手動 / シンプル同期

### D1. ファイルExport/Import（既存強化）

| 項目 | 内容 |
|------|------|
| **方式** | JSONファイルのダウンロード/アップロードまたはFile System Access API |
| **npm** | 不要 |
| **実装難易度** | ★☆☆ 最低 |
| **利点** | 追加依存ゼロ。プライバシー完全。iCloud Drive / Google Drive / Dropbox等のファイル同期サービスと自然に連携 |
| **欠点** | 手動操作が必要。リアルタイム性なし |
| **実装見通し** | File System Access APIで特定ファイルへの自動保存。ファイル同期サービスが自動的にデバイス間同期を担う |

### D2. QRコード転送

| 項目 | 内容 |
|------|------|
| **方式** | データをQRコードにエンコードし、他デバイスのカメラで読み取り |
| **npm** | `qrcode` (~4.3K dependents) + `qr-scanner` (~16KB gzip、WebWorkerベース) |
| **実装難易度** | ★★☆ 低〜中 |
| **利点** | ネットワーク不要。直感的なUX |
| **欠点** | QRコードの容量制限（最大~2,953バイト）。実用的なスキャン距離ではさらに小さい。ステート全体の転送は不可能 |
| **実装見通し** | 同期URL/トークンの共有（Firebase等と組み合わせ）には使えるが、データ本体の転送には使えない |

### D3. Web Share API + クリップボード

| 項目 | 内容 |
|------|------|
| **方式** | Web Share APIでデータファイルを共有 or クリップボードにコピー |
| **npm** | 不要 |
| **実装難易度** | ★☆☆ 最低 |
| **利点** | OS標準の共有メカニズム。AirDrop、メール、メッセンジャー等と連携 |
| **欠点** | 手動操作。Share APIのブラウザ対応がまだ限定的（特にデスクトップ） |

---

## E. ブラウザネイティブ / その他

### E1. Cloudflare Workers KV / D1

| 項目 | 内容 |
|------|------|
| **方式** | Cloudflare Worker（薄いバックエンド）経由でKV or D1（SQLite）にアクセス |
| **npm** | 不要（fetch + Worker。開発時は`wrangler` CLI） |
| **無料枠** | Workers 100K req/日 + D1 5GB + 5M行読取/日 + 100K行書込/日 |
| **実装難易度** | ★★★ 中（**クライアントオンリーではなくWorkerの実装・デプロイが必要**） |
| **利点** | 無料枠が非常に寛大。グローバルエッジ配信で低レイテンシ。エグレス費用なし |
| **欠点** | **SPAオンリーの前提に反してバックエンドが必要**。KVは結果整合性（書込反映に最大60秒）。リアルタイム同期にはDurable Objects（有料）が必要。認証機構を自前で実装する必要あり |

### E2. remoteStorage

| 項目 | 内容 |
|------|------|
| **方式** | オープンプロトコル(WebFinger + OAuth + WebDAV)による分散ストレージ |
| **npm** | `remotestoragejs` (~40KB gzip) |
| **実装難易度** | ★★★ 中 |
| **利点** | ベンダー非依存。ユーザーが自分のストレージサーバーを選べる。オフラインファーストが組み込み |
| **欠点** | 普及率が低い（対応サーバーが少ない）。一般ユーザーのハードルが高い |

### E3. WebDAV

| 項目 | 内容 |
|------|------|
| **方式** | WebDAVプロトコルでNextcloud等のサーバーにファイル読み書き |
| **npm** | `webdav` (~30KB gzip、ブラウザ用に`webdav/web`をimport) |
| **実装難易度** | ★★★★ 高 |
| **利点** | オープン標準。既存のNextcloud/ownCloudユーザーが利用可能 |
| **欠点** | **CORSがほぼショーストッパー**（Nextcloud等のWebDAVサーバーがCORSヘッダーを返さない）。サーバー側のCORS設定が必要だがユーザーが制御できないケースが多い。リアルタイム/オフライン対応なし |
| **実装見通し** | CORSの問題から**ブラウザSPAでの実用は非現実的**。Electronアプリ限定なら可能 |

### E4. OPFS (Origin Private File System)

| 項目 | 内容 |
|------|------|
| **方式** | ブラウザのOrigin Private File Systemに高速ファイル書き込み |
| **npm** | 不要（ブラウザ標準API） |
| **実装難易度** | ★★☆ 低〜中 |
| **利点** | localStorageの容量制限を突破。高速。Worker内からも使用可 |
| **欠点** | **デバイス間同期には別途仕組みが必要**（ローカルストレージの改善のみ） |
| **実装見通し** | localStorageの代替として導入し、クラウド同期は別レイヤーで対応 |

---

## 推奨度マトリックス

| 方式 | 実装コスト | リアルタイム | オフライン | プライバシー | ユーザー母数 | 推奨度 |
|------|-----------|------------|-----------|-------------|------------|--------|
| **Dropbox API** | 低 | - | - | ○ | 大 | ★★★★☆ |
| **OneDrive** | 中 | - | - | ○ | 大 | ★★★★☆ |
| **GitHub Gist** | 低 | - | - | △ | 中（開発者） | ★★★☆☆ |
| **Firebase** | 低〜中 | ★★★ | ★★★ | △ | 大 | ★★★★★ |
| **Supabase** | 低〜中 | ★★☆ | - | ○ | 中 | ★★★★☆ |
| **PouchDB+CouchDB** | 中 | ★★★ | ★★★ | ○ | - | ★★★☆☆ |
| **CRDTs (Yjs)** | 高 | ★★★ | ★★★ | ★★★ | - | ★★☆☆☆ |
| **WebRTC P2P** | 中 | ★★☆ | - | ★★★ | - | ★★☆☆☆ |
| **File Export強化** | 最低 | - | ★★★ | ★★★ | 全員 | ★★★★☆ |
| **Cloudflare D1** | 中 | - | - | ○ | - | ★★★☆☆ |
| **WebDAV** | 高 | - | - | ○ | 小 | ★☆☆☆☆ |
| **remoteStorage** | 中 | ★☆☆ | ★★★ | ★★★ | 極小 | ★★☆☆☆ |

---

## 段階的実装の提案

### Phase 1（低コスト・高効果）
1. **File Export/Import強化** — File System Access APIで自動保存対応。依存ゼロで最もリスクが低い
2. **Dropbox API同期** — Google Drive実装のコードをほぼ流用可能（SDK未メンテのためfetch直接推奨）

### Phase 2（リアルタイム同期）
3. **Firebase Firestore** — リアルタイム双方向同期。複数デバイスの変更を即座に反映。最も成熟したBaaS
4. **Supabase** — Firebaseのオープンソース代替（7日停止制限に注意）

### Phase 3（ユーザー層拡大）
5. **OneDrive** — Windows/Officeユーザー向け（24hトークン失効の制限あり）
6. **GitHub Gist** — 開発者コミュニティ向けニッチオプション

---

## 現行コードとの統合方針

現在の`GoogleCloudStorage.ts`はZustandの`PersistStorage<S>`インターフェースを実装しており、同じパターンで各バックエンドを追加できる:

```
src/store/storage/
├── CompressedStorage.ts      # localStorage（既存）
├── GoogleCloudStorage.ts     # Google Drive（既存）
├── DropboxCloudStorage.ts    # Dropbox（新規）
├── OneDriveCloudStorage.ts   # OneDrive（新規）
├── FirestoreCloudStorage.ts  # Firebase Firestore（新規）
├── GistCloudStorage.ts       # GitHub Gist（新規）
└── compress.worker.ts        # 圧縮Worker（既存）
```

`cloud-auth-store.ts`を拡張してプロバイダー選択UIを追加し、ユーザーが好みのクラウドプロバイダーを選べるようにする。

---

*作成日: 2026-03-12*
