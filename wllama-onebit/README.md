# wllama-onebit — Onebit Inference Backend for wllama

wllama (llama.cpp WASM) に 1-bit 量子化推論カーネルを追加するためのパッチセット。

## ディレクトリ構成

```
wllama-onebit/
├── README.md               ← このファイル
├── WLLAMA_VERSION           ← 対象 wllama バージョン (2.3.7)
├── setup.sh                 ← セットアップスクリプト (clone → patch → build)
├── cpp/onebit/              ← 独自 C ソース (新規ファイル、パッチではない)
│   ├── onebit-mul-mat.h     ← カーネル API 宣言
│   ├── onebit-mul-mat.c     ← onebit matmul カーネル実装
│   ├── onebit-model-builder.h  ← モデルローダーヘルパー宣言
│   └── onebit-model-builder.c  ← onebit テンソル検索
└── patches/                 ← 既存ファイルへの変更 (git apply 可能)
    └── 0001-cmake-add-onebit-sources.patch  ← CMakeLists.txt への差分
```

### 設計方針

- **独自ソース (`cpp/onebit/`)**: wllama/llama.cpp の既存ファイルを一切変更しない独立モジュール。
  upstream のアップデートと衝突しない。
- **パッチ (`patches/`)**: CMakeLists.txt にビルドターゲットを追加する最小差分のみ。
- **ggml.h 変更不要**: `ggml_map_custom3_inplace` API を使用し、op enum の追加なしで
  カスタム演算を登録。upstream llama.cpp の更新に追従しやすい。

## セットアップ手順

### 前提条件

- git
- Docker (WASM ビルド時のみ)

### 自動セットアップ

```bash
# クローン + パッチ適用のみ
./wllama-onebit/setup.sh

# クローン + パッチ適用 + WASM ビルド
./wllama-onebit/setup.sh --build
```

`setup.sh` は以下を実行する:

1. wllama v2.3.7 を `.wllama-fork/` にクローン
2. llama.cpp サブモジュールを初期化
3. `cpp/onebit/` の 4 ファイルをフォークにコピー
4. CMakeLists.txt にビルドターゲットを追加
5. (--build 指定時) Docker 経由で WASM をビルド

### 手動セットアップ

```bash
# 1. wllama をクローン
git clone --depth 1 --branch v2.3.7 https://github.com/nicekid1/Wllama.git .wllama-fork
cd .wllama-fork
git submodule update --init --depth 1

# 2. onebit ソースをコピー
mkdir -p cpp/onebit
cp ../wllama-onebit/cpp/onebit/* cpp/onebit/

# 3. CMakeLists.txt を編集 (パッチ参照または手動)
#    - ONEBIT_SRC 変数を追加
#    - include_directories に cpp/onebit と llama.cpp/ggml/include を追加
#    - add_executable に ${ONEBIT_SRC} を追加

# 4. WASM ビルド
bash scripts/build_wasm.sh
```

### ビルド出力の配置

```bash
# ビルド後、WASM バイナリをプロジェクトにコピー
mkdir -p vendor/wllama
cp .wllama-fork/esm/single-thread/wllama.wasm vendor/wllama/single-thread.wasm
cp .wllama-fork/esm/multi-thread/wllama.wasm  vendor/wllama/multi-thread.wasm
```

wllamaWorker.ts の WASM パス解決を vendor/ を参照するように変更する。

## カーネル実装の詳細

### 演算: OneBit 分解 matmul

```
out[batch][i] = a[i] * Σ_j( sign[i,j] * b[j] * x[batch][j] )
```

| テンソル | 型 | 形状 | 説明 |
|---------|------|------|------|
| `a` | fp16 | (out_features,) | 行スケーリングベクトル |
| `b` | fp16 | (in_features,) | 列スケーリングベクトル |
| `sign` | uint8 | (⌈out×in/8⌉,) | パックド符号ビット (MSB first) |
| `x` | f32 | (in_features[, batch]) | 入力活性化 |

### 最適化

1. **x の b 前乗算**: `x_scaled[j] = x[j] * b[j]` を各バッチで 1 回だけ計算
2. **条件付き加減算**: 内部ループは乗算なし（ビット判定 → 加算 or 減算）
3. **バイトアラインド高速パス**: 行ビットオフセットがバイト境界の場合、8 要素を一括展開
4. **WASM SIMD**: `__wasm_simd128__` 検出時にバイト単位で 8 要素処理
5. **スレッド並列化**: 出力行を ggml スレッド間で分割

### ggml 統合方式

`ggml_map_custom3_inplace` を使用:

```c
result = ggml_map_custom3_inplace(ctx, a, b, sign, callback, GGML_N_TASKS_MAX, NULL);
result->src[3] = x;  // 入力活性化を src[3] に格納
```

この方式は ggml.h の変更が不要。`ggml_map_custom3_inplace` は既存の public API。

## wllama バージョン更新時の手順

1. `WLLAMA_VERSION` を新バージョンに更新
2. `setup.sh` を実行して新バージョンにパッチが適用されるか確認
3. CMakeLists.txt のパッチが適用できない場合:
   - 新しい CMakeLists.txt を確認
   - `patches/0001-cmake-add-onebit-sources.patch` を更新
   - または `setup.sh` 内の `sed` コマンドを調整
4. `ggml_map_custom3_inplace` API の互換性を確認
5. WASM をリビルド

独自ソース (`cpp/onebit/`) は wllama/llama.cpp の内部実装に依存しないため、
通常はバージョン更新時に変更不要。
