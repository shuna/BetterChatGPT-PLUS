# vendor/wllama patches

このディレクトリは、`vendor/wllama` を再ビルドするために必要な
「upstream に対する差分」だけを保持する場所です。

方針:

- upstream 本体はここに置かない
- `.wllama-fork/` はローカル作業ツリーとして扱う
- 再ビルドに必要な修正は、最終的にこのディレクトリへ集約する
- low-bit-q 専用差分はここではなく `vendor/wllama/lowbit-q/` 直下に置く

想定カテゴリ:

- `0001-...` `wllama` 側ビルド・JS グルー補正
- `0002-...` `llama.cpp` / `ggml-webgpu` の upstream 互換修正
- `apply-*.sh` / `apply-*.py` patch 適用補助

現時点では、ローカル `.wllama-fork/` に残っている本流拡張差分を
ここへ移行する途中段階にある。
