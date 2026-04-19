# vendor/wllama-patches

このディレクトリは、`vendor/wllama/` を再ビルドするために必要な
「upstream に対する差分」だけを保持する場所です。

方針:

- upstream 本体はここに置かない
- `vendor/wllama-src/` はローカル作業ツリーとして扱う（gitignore 済み）
- 再ビルドに必要な修正は、最終的にこのディレクトリへ集約する
- low-bit-q 専用差分はここではなく `vendor/wllama/lowbit-q/` 直下に置く

想定カテゴリ:

- `0001-...` `wllama` 側ビルド・JS グルー補正
- `0002-...` `llama.cpp` / `ggml-webgpu` の upstream 互換修正
- `apply-*.sh` / `apply-*.py` patch 適用補助

セットアップ手順:

```bash
# vendor/wllama-src/ をセットアップし差分を適用してビルド準備する
bash scripts/wllama/setup.sh

# WASM をビルドして vendor/wllama/ に出力する
bash scripts/wllama/build.sh
```
