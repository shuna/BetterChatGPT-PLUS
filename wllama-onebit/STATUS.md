# wllama-onebit 実装ステータス

最終更新: 2026-04-08

## 概要

weavelet-canvas のブラウザ内LLM推論 (wllama/llama.cpp WASM) に、1-bit量子化モデルのサポートを追加するプロジェクト。

OneBit分解 (SVID — FujitsuResearch/OneCompression): `W ≈ diag(a) × Sign(W) × diag(b)`
- `a`: 行スケール (out_features,) fp16 — `|u₁| · √σ₁` (rank-1 SVD由来)
- `b`: 列スケール (in_features,) fp16 — `|v₁| · √σ₁` (rank-1 SVD由来)
- `sign`: パック済み符号ビット (ceil(out*in/8),) I8 (GGML_TYPE_I8), MSB-first

## 現在のステータス

| コンポーネント | 状態 | 備考 |
|-------------|------|------|
| SVID分解アルゴリズム (TS/Python) | ✅ | OneCompression忠実実装 |
| GGUF書き出し (TS/Python) | ✅ | メタデータ + onebitテンソル確認済み |
| llama.cppパッチ | ✅ | モデルローダー + 推論グラフ |
| WASMビルド | ✅ | emsdk 4.0.3, single/multi-thread |
| ブラウザ推論 | 🔶 要テスト | 新WASMビルド済み、手動テスト必要 |

### 最新の進捗

1. **SVIDアルゴリズム刷新**: 粗い absolute-mean 近似から OneCompression 忠実実装に変更
   - Power iteration で `|W|` の rank-1 SVD (σ₁, u₁, v₁) を計算
   - `a = |u₁| · √σ₁`, `b = |v₁| · √σ₁` + gauge normalization
   - TS版 (`onebitDecompose.ts`) と Python版 (`convert_to_onebit_gguf.py`) の両方を同期

2. **WASMビルド完了**: emsdk 4.0.3 でビルド成功
   - single-thread.wasm: 2.1 MB
   - multi-thread.wasm: 2.1 MB
   - `vendor/wllama/` にコピー済み

3. **GGUF検証**: OPFSに保存された onebit GGUF (92.6 MB) を直接バイナリ検証
   - `onebit.version` (UINT32=1): ✅ ファイルオフセット 1,769,511 に存在
   - `onebit.sign_packing` (STRING="msb_first"): ✅ 存在
   - `onebit.layers` (ARRAY): ✅ 存在
   - テンソル名 (`blk.0.attn_q.onebit_a` 等): ✅ 正しい形式

## SVIDアルゴリズム詳細

### 分解手順 (OneCompression 忠実実装)

```
入力: W (out_features × in_features) — fp32 重み行列

1. |W| = abs(W)                               # 絶対値行列
2. rank-1 SVD: |W| ≈ σ₁ · u₁ · v₁ᵀ           # power iteration (maxIter=64, tol=1e-7)
3. a = |u₁| · √σ₁                             # per-row scale
4. b = |v₁| · √σ₁                             # per-column scale
5. gauge: balance = √(‖b‖/‖a‖)               # ‖a‖ と ‖b‖ を均衡化
   a *= balance, b /= balance
6. sign = packMSB(sign(W))                    # bit=1: positive/zero, bit=0: negative

出力: a (fp16), b (fp16), sign (uint8 packed)
```

### Power Iteration (rank-1 SVD)

ブラウザ環境では LAPACK/NumPy が使えないため、power iteration で σ₁, u₁, v₁ を計算:

```
v ← 1/√cols [uniform init]
for iter = 0..63:
    u = M·v;  σ = ‖u‖;  u /= σ
    v_new = Mᵀ·u;  v_new /= ‖v_new‖
    if ‖v_new - v‖ < 1e-7: break
    v = v_new
```

典型的な Transformer 重み行列では 5–15 反復で収束。

### 品質 (NMSE)

Normalized Mean Squared Error = MSE / var(original)。理想は 0 (完全再構成)。
- SVID (rank-1 SVD): NMSE ≈ 0.5–0.7 (層依存)
- 旧 absolute-mean: NMSE ≈ 0.9+ (ほぼランダム)

## 完了済みコンポーネント

### 1. カーネル実装 (`wllama-onebit/cpp/onebit/` → `.wllama-fork/cpp/onebit/`)

| ファイル | 状態 | 内容 |
|---------|------|------|
| `onebit-mul-mat.h` | ✅ | API宣言。`onebit_build_mul_mat()`, `onebit_detect_format()` |
| `onebit-mul-mat.c` | ✅ | カーネル本体。`ggml_custom_4d` API使用、WASM SIMD対応 |
| `onebit-model-builder.h` | ✅ | テンソル検索ヘルパー (`onebit_lookup()`) |
| `onebit-model-builder.c` | ✅ | 検索実装 |

**重要**: `wllama-onebit/cpp/onebit/` がマスターコピー。`.wllama-fork/cpp/onebit/` にコピーして使用。
ファイルが不一致の場合は `wllama-onebit/` 側を正とすること。

**カーネル設計:**
- `ggml_custom_4d` API (GGML_OP_CUSTOM) を使用 — ggml.hの変更不要
- 4入力テンソル (a, b, sign, x) を `args[]` で渡し、`dst->src[0..3]` に配置
- 出力型: **明示的に GGML_TYPE_F32** を指定（F16を継承しない）
- コールバック: `void (*)(ggml_tensor* dst, int ith, int nth, void* userdata)`
- xをbで事前スケーリング → 符号ビットに対する条件付き加減算
- WASM SIMD path: byte-aligned時に8ビット一括展開

### 2. llama.cpp パッチ (`.wllama-fork/llama.cpp/`)

#### llama-model.h — 構造体拡張
- `llama_layer` に21個の `ggml_tensor*` フィールド追加:
  - Attention: `onebit_wq_{a,b,sign}`, `onebit_wk_{a,b,sign}`, `onebit_wv_{a,b,sign}`, `onebit_wo_{a,b,sign}`
  - FFN: `onebit_ffn_gate_{a,b,sign}`, `onebit_ffn_down_{a,b,sign}`, `onebit_ffn_up_{a,b,sign}`
- `llama_model` に `bool is_onebit = false` 追加

#### llama-model.cpp — モデルローダー
- GGUFメタデータ `"onebit.version"` から1-bit形式を検出 (`gguf_kv` map)
- `is_onebit` フラグに基づき標準weightテンソルを `TENSOR_NOT_REQUIRED` に設定 (`ob_flag`)
- **既存の `create_tensor` パスを使用** — LLM_TN の suffix 機能で onebit テンソル名を生成:
  - `tn(LLM_TENSOR_ATTN_Q, "onebit_a", i)` → `"blk.N.attn_q.onebit_a"`
  - `tn(LLM_TENSOR_ATTN_Q, "onebit_b", i)` → `"blk.N.attn_q.onebit_b"`
  - `tn(LLM_TENSOR_ATTN_Q, "onebit_sign", i)` → `"blk.N.attn_q.onebit_sign"`
- sign テンソルは bit-packed 1D: `{n_in * n_out / 8}` (GGML_TYPE_I8)
- 新しい enum 追加不要、LTOバグ回避

#### models/llama.cpp — グラフビルダー (推論パス)
- `#include "onebit-mul-mat.h"` でカーネルを使用
- `layer.onebit_wq_a != nullptr` で onebit/標準 パスを分岐
- Attention Q/K/V: `onebit_build_mul_mat()` で直接計算
- Attention O: `build_attn()` に `wo=nullptr` を渡し、戻り値に `onebit_build_mul_mat()` 適用
- FFN (SwiGLU): gate/up を並列計算 → `ggml_swiglu_split` → down をonebit matmul
  - `build_ffn()` を使わずインライン実装（onebit重みは nullptr のため）

### 3. ビルドシステム

| ファイル | 状態 | 内容 |
|---------|------|------|
| `.wllama-fork/CMakeLists.txt` | ✅ | onebitソース追加 + `target_include_directories(llama PUBLIC ...)` |
| `patches/0001-cmake-add-onebit-sources.patch` | ✅ | 参考用パッチ（実体は直接編集済み） |
| `build-local.sh` | ✅ | ローカルEmscriptenビルド。emsdk 4.0.3必須チェック付き |
| `setup.sh` | ✅ | フォーク作成、サブモジュール初期化、パッチ適用 |

### 4. フロントエンド統合

#### wllamaWorker.ts
- `isOnebit` フラグで WASM パスを切り替え:
  - onebit: `vendor/wllama/single-thread.wasm` (カスタムビルド)
  - 標準: `@wllama/wllama/esm/single-thread/wllama.wasm` (npm)
- マルチスレッド非対応環境では multi-thread.wasm をロードしない
- ネイティブログ転送 + スタックトレース付きエラーレポート

#### ChatViewTabs.tsx / ConfigMenu.tsx
- `getModelDisplayName()` に quantization 表示追加: `"ModelName (Local · onebit)"`
- ドロップダウンで1-bitモデルを優先表示 (`onebitByOrigin` マップ)

#### LocalModelSettings.tsx
- P1修正: `generateOnebitModelId()` — `--onebit` を常に末尾に追加（セグメント置換を廃止）
- P2-a修正: `m.id.replace(/--onebit$/, '')` で元モデルとの紐付け
- P2-b修正: `onebitSupported` チェック — Q4_K_M等の非対応量子化でconvertボタンを非表示

## ビルド手順

### 前提条件

```bash
# emsdk 4.0.3 のインストール（初回のみ）
cd ~/emsdk
./emsdk install 4.0.3
./emsdk activate 4.0.3
```

### フォークの初期化 (新しいworktree/クローン時)

```bash
# 1. wllama v2.3.7 をクローン、onebitソースをコピー、CMakeLists.txtをパッチ
bash wllama-onebit/setup.sh

# 2. llama.cppのonebitパッチ適用（手動。setup.shには含まれない）
# 下記「llama.cppパッチの適用」セクションを参照
```

### llama.cppパッチの適用

`setup.sh` はカーネルソース (`cpp/onebit/`) とCMakeのパッチのみ適用する。
llama.cpp本体へのパッチ（3ファイル）は手動で適用が必要:

1. `.wllama-fork/llama.cpp/src/llama-model.h` — 構造体にonebitフィールド追加
2. `.wllama-fork/llama.cpp/src/llama-model.cpp` — onebit.version検出 + テンソル登録
3. `.wllama-fork/llama.cpp/src/models/llama.cpp` — 推論グラフのonebitディスパッチ

これらのパッチは `claude/ecstatic-lewin` ブランチのgit履歴にある。
将来的には `wllama-onebit/patches/` にパッチファイルを追加し、`setup.sh` で自動適用すべき。

### WASMビルド

```bash
# ワンコマンドビルド（setup.sh 実行後）
source ~/emsdk/emsdk_env.sh
bash wllama-onebit/build-local.sh

# 出力:
#   vendor/wllama/single-thread.wasm  (≈2.1 MB)
#   vendor/wllama/multi-thread.wasm   (≈2.1 MB)
```

手動ビルド:

```bash
source ~/emsdk/emsdk_env.sh
cd .wllama-fork
mkdir -p wasm/single-thread && cd wasm/single-thread
emcmake cmake ../..
export EMCC_CFLAGS="--no-entry -O3 -msimd128 -DNDEBUG -flto=full -frtti -fwasm-exceptions \
  -sEXPORT_ALL=1 -sEXPORT_ES6=0 -sMODULARIZE=0 -sINITIAL_MEMORY=128MB \
  -sMAXIMUM_MEMORY=4096MB -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=_main,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -sNO_EXIT_RUNTIME=1"
emmake make wllama -j
cp wllama.wasm ../../../vendor/wllama/single-thread.wasm
```

### 1-bitモデルの作成

ブラウザ内変換:
1. 設定 → ローカルモデル → 対応モデル横の「1-bit変換」ボタン
2. SVIDアルゴリズムで全weight層を分解 (ブラウザWorkerで実行)
3. 結果はOPFSに `{modelId}--onebit` として保存

Python変換:
```bash
python scripts/convert_to_onebit_gguf.py input.gguf output.onebit.gguf
```

### テスト方法

```bash
npm run dev   # → http://localhost:5173
```

1. 設定 → ローカルモデルで対応モデルをダウンロード (SmolLM2-360M Q8_0 推奨)
2. 「1-bit変換」で onebit GGUF を作成
3. モデルセレクタで `(1-bit)` モデルを選択
4. メッセージを送信して推論テスト
5. DevTools コンソールで `[wllama-native]` ログを確認

## 解決済みの技術課題

### WASM LTO miscompilation
- **問題**: `create_onebit_tensor` ラムダが `-flto=full` で function signature mismatch
- **解決**: 独自ラムダを廃止、既存 `create_tensor` + LLM_TN suffix を使用

### ggml_set_rows F32 assertion
- **問題**: グラフ予約時に `GGML_ASSERT(b->type == GGML_TYPE_F32)` 失敗
- **原因**: `.wllama-fork` の onebit-mul-mat.c が旧版 (`ggml_map_custom3_inplace` → F16出力継承)
- **解決**: `ggml_custom_4d(ctx, GGML_TYPE_F32, ...)` で明示的F32出力。マスターコピーで上書き

### 分解品質 (absolute-mean → SVID)
- **問題**: 旧実装は `a[i] = mean(|W[i,:]|)`, `b[j] = mean(|W[:,j]|)` の粗い近似
- **原因**: rank-1 SVDの正しい実装が不足。NMSE ≈ 0.9+ でほぼランダム
- **解決**: OneCompression忠実SVIDアルゴリズムに全面書き換え (TS + Python)

## ファイル構成

```
wllama-onebit/                            # マスターコピー（設計ドキュメント + カーネルソース）
├── README.md                             # 概要説明
├── STATUS.md                             # このファイル
├── build-local.sh                        # ローカルEmscriptenビルド
├── setup.sh                              # フォーク作成スクリプト
├── WLLAMA_VERSION                        # "2.3.7"
├── patches/
│   └── 0001-cmake-add-onebit-sources.patch
└── cpp/onebit/                           # ★ カーネルのマスターコピー
    ├── onebit-mul-mat.h
    ├── onebit-mul-mat.c
    ├── onebit-model-builder.h
    └── onebit-model-builder.c

.wllama-fork/                             # wllama v2.3.7 フォーク（ビルド用、gitignore済み）
├── CMakeLists.txt                        # onebitソース追加 + include_directories
├── cpp/onebit/                           # ← wllama-onebit/cpp/onebit/ からコピー
└── llama.cpp/src/
    ├── llama-model.h                     # 構造体拡張
    ├── llama-model.cpp                   # テンソルローダー (create_tensor + suffix)
    └── models/llama.cpp                  # グラフビルダー (onebitディスパッチ)

vendor/wllama/                            # フロントエンドから参照されるWASM
├── single-thread.wasm                    # ← build-local.sh でコピー (2.1 MB)
└── multi-thread.wasm                     # ← build-local.sh でコピー (2.1 MB)

scripts/convert_to_onebit_gguf.py         # GGUF変換スクリプト（Python, numpy SVD使用）
src/workers/wllamaWorker.ts               # WASM/onebit切り替え + エラーハンドリング
src/workers/onebitConversionWorker.ts      # ブラウザ内1-bit変換Worker
src/local-llm/onebit/                     # ブラウザ内1-bit変換パイプライン
├── onebitDecompose.ts                    # SVIDアルゴリズム (power iteration)
├── onebitManager.ts                      # 変換マネージャ + モデルID生成
├── ggufParser.ts                         # GGUFバイナリパーサー
├── ggufWriter.ts                         # GGUFバイナリライター
├── dequantize.ts                         # Q8_0/Q4_0/F16/F32 → fp32 デコーダー
├── convert.ts                            # 変換パイプライン
├── index.ts                              # エクスポート
├── types.ts                              # 型定義 + 定数
├── onebit.test.ts                        # テスト
└── testHelpers.ts                        # テスト用ヘルパー
src/components/Chat/ChatViewTabs.tsx       # UI: quantization表示 + 1-bit優先
src/components/ConfigMenu/ConfigMenu.tsx   # UI: 設定画面の1-bit優先
src/components/SettingsMenu/LocalModelSettings.tsx  # 変換UI + 量子化チェック
```

## GGUF テンソル名規約

コンバーター (`ggufWriter.ts` / `convert_to_onebit_gguf.py`) が出力する名前:
```
blk.N.attn_q.onebit_a        (GGML_TYPE_F16, [out_features])
blk.N.attn_q.onebit_b        (GGML_TYPE_F16, [in_features])
blk.N.attn_q.onebit_sign     (GGML_TYPE_I8,  [ceil(out*in/8)])
blk.N.attn_k.onebit_{a,b,sign}
blk.N.attn_v.onebit_{a,b,sign}
blk.N.attn_output.onebit_{a,b,sign}
blk.N.ffn_gate.onebit_{a,b,sign}
blk.N.ffn_down.onebit_{a,b,sign}
blk.N.ffn_up.onebit_{a,b,sign}
```

メタデータ:
- `onebit.version`: uint32 = 1
- `onebit.sign_packing`: string = "msb_first"
- `onebit.layers`: array of uint32 (変換されたレイヤーのインデックス)

## 次のステップ

1. **ブラウザ推論テスト**: 新WASMで手動テスト
   - `onebit.version` が `gguf_kv` に正しく読み込まれるか (コンソールログで確認)
   - `LLAMA_LOG_INFO: detected onebit format` が出力されるか
   - 推論出力がガーベジでなく意味のあるテキストか
2. **llama.cppパッチの自動化**: `setup.sh` にパッチ適用を組み込む
3. **テスト拡充**: onebitDecompose.ts の NMSE テスト
