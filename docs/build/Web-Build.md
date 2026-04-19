# Web 版 ビルド手順

weavelet-canvas の主要ターゲットである Web 版（Vite + React + TypeScript）のビルド手順を説明します。
プロジェクト全体の構成と他のビルド対象の概要は [BUILD.md](../../BUILD.md) を参照してください。

## 構成

Web 版は次のレイヤー構成です。

- **アプリ本体**: `src/` 配下、Vite でバンドル
- **vendored wllama**: `vendor/wllama/` の WASM バイナリ + `src/vendor/wllama/index.js` の JS バンドル
- **オプション**: `proxy-worker/` (SSE 復旧プロキシ) を別途デプロイすることで利用可能

ビルド粒度別の参照先:

| 粒度 | 用途 | 参照 |
|------|------|------|
| アプリ本体 | `src/` の変更を反映 | 本ドキュメント「ローカル開発・本番ビルド」 |
| wllama ワーカーコードのみ | `llama-cpp.js` の差し替え | 本ドキュメント「wllama ワーカーコード差し替え」 |
| WASM / wllama 全体 | WASM バイナリや Emscripten JS グルーの再生成 | [vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) |

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

## wllama ワーカーコード差し替え

`src/vendor/wllama/index.js` はプロジェクト独自拡張 (`loadModelFromOpfs` 等) を含む事前ビルド済みバンドルです。

> **注意**: `.wllama-fork` で `npm run build:tsup` を実行してこのファイルを上書きすると、独自拡張が失われます。直接の上書きは行わず、以下の手順で `LLAMA_CPP_WORKER_CODE` 定数のみを差し替えてください。

`.wllama-fork/` は `.gitignore` 済みのローカルビルド作業ディレクトリです。
事前にこの作業ツリーのセットアップが必要であり、その手順は
[vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) を参照してください。

1. `.wllama-fork/src/workers-code/llama-cpp.js` を編集
2. `generated.ts` を再生成:

   ```bash
   cd .wllama-fork && npm run build:worker
   ```

3. `src/vendor/wllama/index.js` 内の `LLAMA_CPP_WORKER_CODE` 定数だけを置換:

   ```bash
   python3 - <<'PY'
   import re, json
   with open('.wllama-fork/src/workers-code/llama-cpp.js') as f:
       new_code = json.dumps(f.read())
   with open('src/vendor/wllama/index.js') as f:
       bundle = f.read()
   bundle = re.sub(
       r'(var LLAMA_CPP_WORKER_CODE\s*=\s*)"(?:[^"\\]|\\.)*"',
       r'\g<1>' + new_code,
       bundle,
   )
   with open('src/vendor/wllama/index.js', 'w') as f:
       f.write(bundle)
   print('Done')
   PY
   ```

Emscripten WASM グルー本体や wllama ライブラリ全体の再ビルドは
[vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) を参照してください。

## 関連ドキュメント

- [BUILD.md](../../BUILD.md) — プロジェクト全体のビルド対象一覧
- [vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) — WASM / wllama 全体の再ビルド手順
- [vendor/wllama/SpecAndStatus.md](../../vendor/wllama/SpecAndStatus.md) — wllama 拡張の設計方針と達成状況
- [proxy-worker/README.md](../../proxy-worker/README.md) — オプションの SSE プロキシ
- [README.md](../../README.md) — ユーザー向け概要
