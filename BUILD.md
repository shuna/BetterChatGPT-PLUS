# Build Overview

weavelet-canvas プロジェクトに含まれるビルド対象の一覧と、各詳細ドキュメントへの索引です。
ユーザー向けの紹介・スクリーンショットは [README.md](./README.md) を参照してください。

## プロジェクト構成

本リポジトリは複数のビルド対象を含みます。Web 版が主要ターゲットであり、その他は派生実装またはオプションコンポーネントです。

| 対象 | 場所 | ステータス | 詳細 |
|------|------|-----------|------|
| **Web 版 (本体)** | `src/`, `index.html`, `vite.config.ts` | 主要ターゲット | [docs/build/web.md](./docs/build/web.md) |
| **wllama (WASM)** | `vendor/wllama/` | Web 版が依存 | [docs/build/wllama.md](./docs/build/wllama.md) |
| iOS 版 | `ios2/` | 存在のみ | [docs/build/ios.md](./docs/build/ios.md) |
| Electron 版 | `electron/` | 存在のみ | [docs/build/electron.md](./docs/build/electron.md) |
| Docker | `Dockerfile`, `docker-compose.yml` | 存在のみ | [docs/build/docker.md](./docs/build/docker.md) |
| Proxy Worker (オプション) | `proxy-worker/` | デプロイ手順あり | [proxy-worker/README.md](./proxy-worker/README.md) |

## wllama ディレクトリ構成

wllama 関連ファイルの管理場所は次の通りです。

| パス | 役割 | 追跡 |
|------|------|------|
| `vendor/wllama-src/` | ビルド作業ツリー (upstream clone + patch 適用済み) | gitignore |
| `vendor/wllama-patches/` | upstream に対する独自差分 (patch ファイル) | 追跡 |
| `vendor/wllama/` | WASM バイナリ 8 種 + 拡張ソース (JS は含まない) | 追跡 |
| `src/vendor/wllama/index.js` | Vite がバンドル対象として読む JS ランタイム | 追跡 |

`vendor/wllama/` に JS ファイルは置きません。`src/vendor/wllama/index.js` がプロジェクト独自拡張
(`loadModelFromOpfs` 等) を含む JS ランタイムであり、Vite の import 解決対象はこちらです。

セットアップとビルドは `scripts/wllama/` のスクリプトから実行します。

```bash
bash scripts/wllama/setup.sh   # vendor/wllama-src/ を準備
bash scripts/wllama/build.sh   # WASM をビルドして vendor/wllama/ に出力
```

詳細は [docs/build/wllama.md](./docs/build/wllama.md) を参照してください。
