# Build Overview

weavelet-canvas プロジェクトに含まれるビルド対象の一覧と、各詳細ドキュメントへの索引です。
ユーザー向けの紹介・スクリーンショットは [README.md](./README.md) を参照してください。

## プロジェクト構成

本リポジトリは複数のビルド対象を含みます。Web 版が主要ターゲットであり、その他は派生実装またはオプションコンポーネントです。

| 対象 | 場所 | ステータス | 詳細 |
|------|------|-----------|------|
| **Web 版 (本体)** | `src/`, `index.html`, `vite.config.ts` | 主要ターゲット | [docs/build/Web-Build.md](./docs/build/Web-Build.md) |
| **wllama (WASM)** | `vendor/wllama/` | Web 版が依存 | [vendor/wllama/WASM-BUILD.md](./vendor/wllama/WASM-BUILD.md) |
| iOS 版 | `ios2/` | 存在のみ。ビルド手順未整理 | — |
| Electron 版 | `electron/` | 存在のみ。ビルド手順未整理 | — |
| Docker | `Dockerfile`, `docker-compose.yml` | 存在のみ。利用方法未整理 | — |
| Proxy Worker (オプション) | `proxy-worker/` | デプロイ手順あり | [proxy-worker/README.md](./proxy-worker/README.md) |

## 主要ターゲット

### Web 版

Vite + React + TypeScript ベースのブラウザ向けアプリケーション。
ローカル開発・本番ビルド・wllama ワーカーコード差し替えなどの手順は
[docs/build/Web-Build.md](./docs/build/Web-Build.md) を参照してください。

### wllama (WASM)

Web 版がブラウザ内 LLM 推論に使用する WASM バイナリ群（8 バリアント）と Emscripten JS グルー。
ビルド手順は [vendor/wllama/WASM-BUILD.md](./vendor/wllama/WASM-BUILD.md)、
設計方針と達成状況は [vendor/wllama/SpecAndStatus.md](./vendor/wllama/SpecAndStatus.md) を参照してください。

なお、`.wllama-fork/` はローカルビルド作業用ディレクトリであり `.gitignore` 済みです。
リポジトリには含まれず、ビルド時にのみ生成されます。

## その他のビルド対象

以下はリポジトリに存在しますが、ビルド・利用手順のドキュメントは未整理です。

- **iOS 版** (`ios2/`) — `WeaveletCanvas.xcworkspace` を含む Xcode プロジェクト
- **Electron 版** (`electron/`) — `index.cjs`, `generate-icons.mjs`, `mock-stream-proxy.cjs` を含む
- **Docker** — リポジトリルートの `Dockerfile` / `docker-compose.yml`
- **Proxy Worker** (`proxy-worker/`) — オプションの Cloudflare Worker (SSE 復旧プロキシ)。
  デプロイ手順は [proxy-worker/README.md](./proxy-worker/README.md) を参照
