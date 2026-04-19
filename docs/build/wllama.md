# wllama WASM ビルド手順

weavelet-canvas の wllama WASM バイナリおよび JS バンドルを再ビルドする手順です。
プロジェクト全体の構成は [BUILD.md](../../BUILD.md) を参照してください。

## ディレクトリ構成

| パス | 役割 |
|------|------|
| `vendor/wllama-src/` | ビルド作業ツリー（gitignore 済み、`setup.sh` が生成） |
| `vendor/wllama-patches/` | upstream に対する独自差分（git 追跡） |
| `vendor/wllama/` | 配布物専用（WASM バイナリ 8 種、各種ドキュメント） |
| `src/vendor/wllama/index.js` | Web アプリが import するランタイムバンドル |

## セットアップ

初回または作業ツリーをリセットしたい場合:

```bash
bash scripts/wllama/setup.sh
```

このスクリプトが `vendor/wllama-src/` を作成し、`vendor/wllama-patches/` の差分を適用します。

## WASM ビルド

```bash
# compat バリアントのみ (emsdk ローカル)
bash scripts/wllama/build.sh

# WebGPU バリアントも含める
WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh

# emdawnwebgpu をローカルパスで指定する場合
WLLAMA_BUILD_WEBGPU=1 EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg bash scripts/wllama/build.sh
```

全 8 バリアントをビルドする場合は `vendor/wllama-src/` から直接実行します:

```bash
cd vendor/wllama-src
./scripts/build_all_wasm.sh
```

## ワーカーコード差し替え (JS のみ更新)

`src/vendor/wllama/index.js` はプロジェクト独自拡張（`loadModelFromOpfs` 等）を含む
事前ビルド済みバンドルです。`npm run build:tsup` を `vendor/wllama-src` 内で実行して
このファイルを全体上書きすると独自拡張が失われます。

`LLAMA_CPP_WORKER_CODE` 定数のみを更新するには:

1. `vendor/wllama-src/src/workers-code/llama-cpp.js` を編集
2. 以下を実行:

   ```bash
   bash scripts/wllama/update-worker.sh
   ```

このスクリプトが `npm run build:worker` の実行と `LLAMA_CPP_WORKER_CODE` の置換を
一括で行います。

## 詳細手順

WASM バイナリのビルド、JS グルーへのパッチ適用、成果物のコピー、検証スクリプトの詳細は
[vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) を参照してください。

設計方針と各バリアントの仕様は
[vendor/wllama/SpecAndStatus.md](../../vendor/wllama/SpecAndStatus.md) を参照してください。

## 関連ドキュメント

- [BUILD.md](../../BUILD.md) — プロジェクト全体のビルド対象一覧
- [docs/build/web.md](./web.md) — Web 版のビルド手順
- [vendor/wllama/WASM-BUILD.md](../../vendor/wllama/WASM-BUILD.md) — WASM ビルド詳細
- [vendor/wllama-patches/README.md](../../vendor/wllama-patches/README.md) — パッチ管理方針
