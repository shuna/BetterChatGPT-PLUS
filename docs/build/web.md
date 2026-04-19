# Web 版 ビルド手順

weavelet-canvas の主要ターゲットである Web 版（Vite + React + TypeScript）のビルド手順を説明します。
プロジェクト全体の構成と他のビルド対象の概要は [BUILD.md](../../BUILD.md) を参照してください。

## 構成

Web 版は次のレイヤー構成です。

- **アプリ本体**: `src/` 配下、Vite でバンドル
- **vendored wllama**: `vendor/wllama/` の WASM バイナリ + `src/vendor/wllama/index.js` の JS バンドル
- **オプション**: `proxy-worker/` (SSE 復旧プロキシ) を別途デプロイすることで利用可能

## 前提

- Node.js (バージョンは `package.json` の `engines` を参照)
- Yarn または npm

## ローカル開発・本番ビルド

ローカル起動:

```bash
yarn
yarn dev
```

または

```bash
npm install
npm run dev
```

本番ビルド (出力は `dist/`):

```bash
yarn build
```

## 環境変数

### Google Drive 連携 (`VITE_GOOGLE_CLIENT_ID`)

Google Drive 同期を有効化するには、独自の Google OAuth Web Client ID を `VITE_GOOGLE_CLIENT_ID` に設定します。

- 共有/デモデプロイでは、OAuth アプリが Google の Testing 状態かつ自分のアカウントがテストユーザーに登録されていない場合、`403: access_denied` が表示されることがあります。
- 自身でデプロイする場合は、Google Cloud で OAuth クライアントを作成し、Authorized JavaScript origins にサイト URL を登録、OAuth consent screen で Google Drive スコープを設定してください。
- 要求スコープは `https://www.googleapis.com/auth/drive.file` です。

## 関連ドキュメント

- [BUILD.md](../../BUILD.md) — プロジェクト全体のビルド対象一覧
- [docs/build/wllama.md](./wllama.md) — WASM / wllama 全体の再ビルド手順
- [vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) — WASM ビルドの詳細手順
- [vendor/wllama/SpecAndStatus.md](../../vendor/wllama/SpecAndStatus.md) — wllama 拡張の設計方針と達成状況
- [proxy-worker/README.md](../../proxy-worker/README.md) — オプションの SSE プロキシ
- [README.md](../../README.md) — ユーザー向け概要
