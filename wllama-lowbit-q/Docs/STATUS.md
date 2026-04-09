# lowbit-Q v2 実装ステータス

最終更新: 2026-04-09

## 概要

lowbit-Q v2 統一フォーマットの TypeScript 側パイプラインが実装完了。
C++/WASM 側も Phase 2 完了: lowbit-Q v2 GGUF のロード・SVID ディスパッチ・メタデータ
サマリーログが native および WASM ビルドで動作確認済み。

## Phase 1: 統一フォーマット設計 — 完了

### メタデータスキーマ (GGUF KV)

| キー | 型 | 説明 |
|---|---|---|
| `lowbit-q.version` | uint32 | フォーマットバージョン (= 2) |
| `lowbit-q.source_model` | string | 変換元モデル名 |
| `lowbit-q.size_budget` | float32 | allocator のサイズ予算 (0.0–1.0) |
| `lowbit-q.tensor_alloc` | string | 全テンソル割当の正本 (JSON) |
| `lowbit-q.quality.nmse_mean` | float32 | 変換時 NMSE 平均 |
| `lowbit-q.quality.nmse_max` | float32 | 変換時 NMSE 最大値 |

### テンソル識別設計

識別子の配置方針:

- **SVID_1BIT**: ggml に存在しない独自テンソル型 → **独自名で識別**
  - `prefix.lowbit_q_a` / `prefix.lowbit_q_b` / `prefix.lowbit_q_sign`
- **Q4_0 / Q8_0 / F16 等**: ggml ネイティブ型 → **元の `.weight` 名を維持**
  - GGUF テンソルヘッダの GGML type コードで native kernel にディスパッチ
- **正本**: `lowbit-q.tensor_alloc` JSON metadata が全テンソルの割当記録

C++ ディスパッチ (struct-field アプローチ):

```
1. ローダーが layer.lowbit_q_wq_a 等を llama_layer struct に埋め込む
2. グラフビルダーが field が非 null かを確認:
   - 非 null → lowbit_q_build_mul_mat() (SVID カーネル)
   - null    → build_lora_mm() / build_ffn() (native ggml パス)
```

### 型定義 (`types.ts`)

- `LowbitQQuantType` enum: `PASSTHROUGH | Q4_0 | Q8_0 | SVID_1BIT`
- `TensorAllocRecord`: 割当の正本レコード (name, quantType, family, layerIndex, ...)
- `LowbitQV2Metadata`: v2 GGUF メタデータ構造体
- `BitwidthAllocatorConfig`: allocator 設定 (sizeBudget, 各ファミリーの quant type)

## Phase 1a: C++/WASM ローディングパイプライン — 完了 (2026-04-09)

### 実装内容

llama.cpp/wllama 側で lowbit-Q v2 GGUF を読み込み、SVID_1BIT と Q4_0/PASSTHROUGH の
mixed-bit モデルをクラッシュなく動作させるための C++ 実装を追加。

**新規 C++ ファイル**

| ファイル | 説明 |
|---|---|
| `cpp/lowbit-q/lowbit-q-metadata.h/c` | `lowbit-q.tensor_alloc` 読み込み C API、`@@INFO[lowbit-q]` サマリーログ |
| `cpp/lowbit-q/lowbit-q-mul-mat.h/c` | SVID_1BIT カスタムカーネル (ggml_custom_4d) |
| `cpp/lowbit-q/lowbit-q-model-builder.h/c` | モデルテンソル lookup ユーティリティ |

**ディスパッチアーキテクチャ: struct-field アプローチ**

`llama_layer` struct に 21 個の lowbit_q_ フィールドを追加:
```c
struct ggml_tensor * lowbit_q_wq_a    = nullptr;  // attn_q の行スケール
struct ggml_tensor * lowbit_q_wq_b    = nullptr;  // attn_q の列スケール
struct ggml_tensor * lowbit_q_wq_sign = nullptr;  // attn_q のサインビット
// ... (wk, wv, wo, ffn_gate, ffn_down, ffn_up)
```

ローダー (`llama-model.cpp`) が各層で `lowbit_q_a/b/sign` テンソルを試行し、
見つかれば struct field に格納。グラフビルダー (`models/llama.cpp`) は field の
null チェックのみでディスパッチ先を決定。

**制約: `llama_get_model_tensor()` 非公開 API 問題**

当初 Phase 1a では `llama_get_model_tensor()` を使った動的テンソル lookup を
設計していたが、wllama v2.3.7 の pinned llama.cpp には **この関数が公開 API に存在しない**。
そのため struct-field アプローチに変更した。詳細は `lowbit-q-model-builder.c` の
コメントを参照。

**パッチスクリプト**

| ファイル | 対象 | 内容 |
|---|---|---|
| `patches/0002-llama-loader-optional-weights.py` | `llama-model.h/cpp` | struct フィールド追加、フォーマット検出、テンソルロード、`lowbit_q_log_model_info()` 呼び出し |
| `patches/0003-llama-build-lowbit-q-dispatch.py` | `models/llama.cpp` | `llm_build_llama` に struct-field ベースの SVID ディスパッチを追加 |

## Phase 2: C++/WASM ビルド検証・ロードテスト — 完了 (2026-04-09)

### WASM ビルド

`build-local.sh` による本番 WASM ビルドが成功:
- `vendor/wllama/single-thread.wasm`: 2.1 MB
- `vendor/wllama/multi-thread.wasm`: 2.1 MB

WASM バイナリに含まれることを確認済みの文字列:
- `lowbit-q.version` / `lowbit-q.tensor_alloc` (メタデータキー)
- `lowbit_q_a` / `lowbit_q_b` / `lowbit_q_sign` (テンソル名サフィックス)
- `@@INFO[lowbit-q] ===== lowbit-Q v%s model =====` (ロードサマリーログ)
- `@@INFO[lowbit-q] tensor alloc: %d SVID_1BIT, %d Q4_0/Q8_0, ...`
- `detected lowbit-Q format (version=%u)`

**CMakeLists.txt 変更**: lowbit-q C ソースを `wllama` 実行ファイルではなく
`llama` ライブラリにリンク (`target_sources(llama PRIVATE ${LOWBIT_Q_SRC})`)。
これにより native ビルドと WASM ビルドの両方でシンボル解決が正しく行われる。

### ロードテスト (native llama.cpp)

`wllama-lowbit-q/tests/create_minimal_lowbitq_gguf.py` で生成した最小テスト GGUF:
- 2 層モデル
- Layer 0: 全プロジェクション → Q4_0 (native パス)
- Layer 1: attn_q / ffn_gate / ffn_up / ffn_down → SVID_1BIT、残り → Q4_0
- メタデータ: `lowbit-q.version = 2`, `tensor_alloc` JSON 14 レコード

`wllama-lowbit-q/tests/test_loader.cpp` (native llama.cpp リンク) で確認済み:

```
load_hparams: detected lowbit-Q format (version=2)
create_tensor: loading tensor blk.1.attn_q.lowbit_q_a
create_tensor: loading tensor blk.1.attn_q.lowbit_q_b
create_tensor: loading tensor blk.1.attn_q.lowbit_q_sign
...
@@INFO[lowbit-q] ===== lowbit-Q v2 model =====
@@INFO[lowbit-q] source: minimal-test-fixture
@@INFO[lowbit-q] size budget: 0.60
@@INFO[lowbit-q] tensor alloc: 4 SVID_1BIT, 10 Q4_0/Q8_0, 0 passthrough, 0 other (total 14)
[PASS] Model loaded successfully
[PASS] lowbit-Q format detected in load log
[PASS] SVID triplet tensors (lowbit_q_a/sign) loaded
[PASS] native path (.weight) tensors also present
=== ALL TESTS PASSED ===
```

### TypeScript テスト (126 テスト)

| ファイル | テスト数 | 説明 |
|---|---|---|
| `allocator.test.ts` | 26 | allocator 固定ルール + 予算最適化 |
| `lowbit-q.test.ts` | 32 | 変換 E2E |
| `tensorFilter.test.ts` | 22 | テンソルフィルタ |
| `qualityMetrics.test.ts` | 20 | 品質メトリクス |
| `validation.test.ts` | 8 | バリデーション |
| `lowbit-q-v2-dispatch.test.ts` | 18 | C++ ディスパッチ契約テスト |

## Phase 2 の既知制約

### アーキテクチャ制約 (Phase 3 で対応予定)

C++ パッチ 0002/0003 は **LLAMA アーキテクチャのみ** を対象としている。
Qwen2, Gemma, Phi3 等の非 Llama モデルは `llm_build_X` グラフビルダーが別ファイルにあり、
パッチが当たっていない。

TypeScript 側 (`convertToLowbitQV2Streaming`) に arch ガードを追加済み:
- `general.architecture === 'llama'` → SVID 割当を許可
- それ以外 → SVID → Q4_0 に強制オーバーライド

### メタデータキャッシュの単一モデル前提

`lowbit_q_get_quant_type()` の静的キャッシュ (`s_cache`) は最後に見た
`llama_model *` のみを保持する。wllama プロトタイプ (同時に 1 モデルのみロード)
では問題ない。マルチモデルセッション対応は Phase 3 スコープ。

## 未実装 (Phase 3)

- 回転前処理 (Hadamard, `applyRotation: true` は未実装エラー)
- TinyLlama-1.1B 品質検証 (実際の変換 + 推論精度確認)
- サイズ vs 品質マップ
- 2-3 bit SVID 拡張
- 非 Llama アーキへの SVID ディスパッチ拡張 (patch 0002b/0003b)

## 未実装 (Phase 4)

- WebGPU ビルド有効化 (`-DGGML_WEBGPU=ON`)
- WGSL シェーダ (lowbit-Q カスタム型用)
- KV cache 量子化ランタイム (attention カーネル内)
- Activation quantization (W4A8 → W4A4)
