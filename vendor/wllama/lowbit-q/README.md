# vendor/wllama/lowbit-q — lowbit-Q Inference Backend for wllama

wllama (llama.cpp WASM) に 1-bit 量子化推論カーネルを追加するためのパッチセット。

## スコープ

このディレクトリは、独自フォーマット拡張と low-bit-q 変換/推論だけを扱う。

ここで扱わないもの:

- 本流 `wllama` の WebGPU 対応
- Memory64 / compat の一般対応
- shard / OPFS / JSPI の一般対応
- upstream に返すべき `ggml-webgpu` 修正

これらは `vendor/wllama/` 側を正本とする。

## ディレクトリ構成

```
vendor/wllama/lowbit-q/
├── README.md               ← このファイル
├── WLLAMA_VERSION           ← 対象 wllama バージョン (2.3.7)
├── setup.sh                 ← セットアップスクリプト (clone → patch → build)
├── cpp/lowbit-q/            ← 独自 C ソース (新規ファイル、パッチではない)
│   ├── lowbit-q-mul-mat.h   ← カーネル API 宣言
│   ├── lowbit-q-mul-mat.c   ← lowbit-Q matmul カーネル実装
│   ├── lowbit-q-model-builder.h  ← モデルローダーヘルパー宣言
│   └── lowbit-q-model-builder.c  ← lowbit-Q テンソル検索
└── patches/                 ← 既存ファイルへの変更 (git apply 可能)
    └── 0001-cmake-add-lowbit-q-sources.patch  ← CMakeLists.txt への差分
```

### 設計方針

- **独自ソース (`cpp/lowbit-q/`)**: wllama/llama.cpp の既存ファイルを一切変更しない独立モジュール。
  upstream のアップデートと衝突しない。
- **パッチ (`patches/`)**: CMakeLists.txt にビルドターゲットを追加する最小差分のみ。
- **ggml.h 変更不要**: `ggml_map_custom3_inplace` API を使用し、op enum の追加なしで
  カスタム演算を登録。upstream llama.cpp の更新に追従しやすい。
- **前提**: `vendor/wllama` 側の本流拡張が先に適用されていることを想定し、その上に low-bit-q を別差分として重ねる。

## セットアップ手順

### 前提条件

- git
- Docker (WASM ビルド時のみ)

### 自動セットアップ

```bash
# クローン + パッチ適用のみ (推奨エントリポイント)
bash scripts/wllama/setup.sh

# クローン + パッチ適用 + WASM ビルド
bash scripts/wllama/setup.sh --build
```

`setup.sh` は以下を実行する:

1. wllama v2.3.7 を `vendor/wllama-src/` にクローン
2. llama.cpp サブモジュールを初期化
3. `cpp/lowbit-q/` の 4 ファイルをソース作業ツリーにコピー
4. CMakeLists.txt にビルドターゲットを追加
5. (--build 指定時) Docker 経由で WASM をビルド

### 手動セットアップ

```bash
# 1. wllama をクローン
git clone --depth 1 --branch v2.3.7 https://github.com/nicekid1/Wllama.git vendor/wllama-src
cd vendor/wllama-src
git submodule update --init --depth 1

# 2. lowbit-Q ソースをコピー
mkdir -p cpp/lowbit-q
cp ../vendor/wllama/lowbit-q/cpp/lowbit-q/* cpp/lowbit-q/

# 3. CMakeLists.txt を編集 (パッチ参照または手動)
#    - LOWBIT_Q_SRC 変数を追加
#    - include_directories に cpp/lowbit-q と llama.cpp/ggml/include を追加
#    - add_executable に ${LOWBIT_Q_SRC} を追加

# 4. WASM ビルド (Docker)
bash scripts/build_wasm.sh
```

## ローカルビルド (Emscripten)

Docker を使わずローカルの Emscripten でビルドする手順。

### 前提条件

- git
- cmake (`brew install cmake`)
- python3
- Emscripten SDK (emsdk) **≥ 5.0.0**

> **重要**: `build-local.sh` は semver チェックで 5.0.0 未満を拒否する。
> emsdk 5 への移行により `-fwasm-exceptions` ABI が統一され、4.x 時代の
> バージョン分岐（CPU: 4.0.3 / WebGPU: 4.0.10）は不要になった。

### ビルド手順

```bash
# 1. セットアップ
./vendor/wllama/lowbit-q/setup.sh

# 2. Emscripten を有効化
source ~/emsdk/emsdk_env.sh

# 3. CPU 版（compat + Memory64）をビルド
./vendor/wllama/lowbit-q/build-local.sh

# 4. WebGPU 版も含める場合（compat のみ — WebGPU mem64 は未ビルド）
WLLAMA_BUILD_WEBGPU=1 ./vendor/wllama/lowbit-q/build-local.sh
```

### ビルド出力

`build-local.sh` は CPU 4 バリアントを生成して `vendor/wllama/` に配置する:

| ファイル | 出力先 | 用途 |
|---------|--------|------|
| `single-thread-cpu-compat.wasm` | `vendor/wllama/` | Memory64 非対応ブラウザ向け CPU 単スレッド |
| `multi-thread-cpu-compat.wasm` | `vendor/wllama/` | Memory64 非対応ブラウザ向け CPU マルチスレッド |
| `single-thread-cpu-mem64.wasm` | `vendor/wllama/` | Memory64 対応ブラウザ向け CPU 単スレッド（8 GB 上限） |
| `multi-thread-cpu-mem64.wasm` | `vendor/wllama/` | Memory64 対応ブラウザ向け CPU マルチスレッド（8 GB 上限） |

`WLLAMA_BUILD_WEBGPU=1` を指定した場合は追加で:

| ファイル | 出力先 | 用途 |
|---------|--------|------|
| `single-thread-webgpu-compat.wasm` | `vendor/wllama/` | compat+JSPI WebGPU 単スレッド |
| `multi-thread-webgpu-compat.wasm` | `vendor/wllama/` | compat+JSPI WebGPU マルチスレッド |

Memory64 と CPU WASM は同じ `src/vendor/wllama/index.js` の JS グルーと組み合わせて使う。
WebGPU WASM は `src/vendor/wllama/webgpu-index.js` と組み合わせる（メモリ export キーが異なるため混在不可）。

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
   - `0001-cmake-add-lowbit-q-sources.patch` を更新
   - または `setup.sh` 内の `sed` コマンドを調整
4. `ggml_map_custom3_inplace` API の互換性を確認
5. WASM をリビルド

独自ソース (`cpp/lowbit-q/`) は wllama/llama.cpp の内部実装に依存しないため、
通常はバージョン更新時に変更不要。
