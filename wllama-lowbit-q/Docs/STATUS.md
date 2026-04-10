# lowbit-Q v2 実装ステータス

最終更新: 2026-04-10 (Phase 3.6 — native quant baseline 実装)

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

- `LowbitQQuantType` enum: `PASSTHROUGH | Q4_0 | Q8_0 | SVID_1BIT | Q3_K | Q2_K`
- `GGML_BLOCK_SIZES`: Q2_K=256, Q3_K=256 追加済み
- `GGML_TYPE_SIZES`: Q2_K=84, Q3_K=110 追加済み
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

### TypeScript テスト — lowbit-Q サブセット (154 テスト、全体 616 テスト中)

| ファイル | テスト数 | 説明 |
|---|---|---|
| `allocator.test.ts` | 26 | allocator 固定ルール + 予算最適化 |
| `lowbit-q.test.ts` | 32 | 変換 E2E |
| `tensorFilter.test.ts` | 22 | テンソルフィルタ |
| `qualityMetrics.test.ts` | 20 | 品質メトリクス |
| `validation.test.ts` | 8 | バリデーション |
| `lowbit-q-v2-dispatch.test.ts` | 18 | C++ ディスパッチ契約テスト |
| `q3_kQuantize.test.ts` | 13 | Q3_K 量子化・逆量子化ラウンドトリップ |
| `q2_kQuantize.test.ts` | 15 | Q2_K 量子化・逆量子化ラウンドトリップ |

## Phase 3.6: Native Quant Baseline 実装 — 完了 (2026-04-10)

### 目的

Phase 3.5 結論: SVID_1BIT (NMSE ~0.37) は全プリセットで functionalSuccess=NO。
SVID は「研究トラック」に据え置き、ggml native quant (Q3_K/Q2_K) で
SVID より高圧縮かつ実用品質を達成できるかを検証するためのベースラインを確立。

### 採用判断の基準 (再定義)

> **採用条件は「SVID が独自であること」ではなく「native quant ベースラインを上回ること」**
>
> - Q4_0-ONLY (sizeBudget:1.0) で functionalSuccess=YES → パイプライン健全確認
> - Q3_K-ONLY / Q2_K-ONLY で functionalSuccess=YES かつ Q4_0 より高圧縮 → native quant が主系統
> - SVID mixed-bit が native quant と同等以上の品質 → SVID 研究トラックを再開

### 実装内容 (TypeScript 側、全 9 ファイル変更)

**新規ファイル**

| ファイル | 説明 |
|---|---|
| `src/local-llm/lowbit-q/q3_kQuantize.ts` | Q3_K 量子化 (256 elements/block, 110 bytes, symmetric 3-bit) |
| `src/local-llm/lowbit-q/q2_kQuantize.ts` | Q2_K 量子化 (256 elements/block, 84 bytes, asymmetric 2-bit) |
| `src/local-llm/lowbit-q/q3_kQuantize.test.ts` | Q3_K テスト 13 件 (NMSE < 0.05) |
| `src/local-llm/lowbit-q/q2_kQuantize.test.ts` | Q2_K テスト 15 件 (NMSE < 0.15) |

**変更ファイル**

| ファイル | 変更内容 |
|---|---|
| `types.ts` | `LowbitQQuantType.Q3_K/Q2_K` 追加、ブロックサイズ・型サイズ定数追加 |
| `dequantize.ts` | `dequantQ3_K()`, `dequantQ2_K()` 追加、dispatch switch 拡張 |
| `allocator.ts` | `Q3_K_ONLY_ALLOCATOR_CONFIG`, `Q2_K_ONLY_ALLOCATOR_CONFIG` 追加 |
| `convert.ts` | Q3_K/Q2_K 変換ブランチ追加 (GGMLType 11/10 で NativeQuantTensor として書き出し) |
| `ggufParser.ts` | `computeTensorDataSize()` に Q3_K/Q2_K case 追加 |
| `validation.ts` | `LowbitQV2AllocSummary` に `q3_kCount`, `q2_kCount` 追加 |
| `LowbitQValidationPage.tsx` | UI プリセット追加 (v2-q3konly, v2-q2konly) |
| `tests/lowbit-q-phase3-comparison.spec.ts` | Q3_K-ONLY/Q2_K-ONLY プリセット追加 |
| `cpp/lowbit-q/lowbit-q-metadata.h/c` | `LOWBIT_Q_QUANT_Q3_K=4`, `LOWBIT_Q_QUANT_Q2_K=5` 追加 (情報用) |

### Q3_K/Q2_K フォーマット仕様 (ggml block_q3_K / block_q2_K 互換)

**Q3_K (110 bytes / 256 elements)**:
```
Offset  Size  Field
0       32    hmask[32]   — high bit (bit2) of each qi
                            stride-32: element e → hmask[e%32], bit floor(e/32)
32      64    qs[64]      — low 2 bits of each qi
                            stride-32: element e → qs[floor(e/128)*32 + e%32],
                            shift floor((e%128)/32)*2
96      12    scales[12]  — 16 sub-block 6-bit scales (offset-coded +32)
                            j<8: S[j] low nibble; j>=8: S[j-8] high nibble
                            S[j%4+8] |= (sc>>4) << (2*(j/4))
108      2    d           — super-block scale (fp16, NEGATIVE: d = -maxScale/32)
```
- 逆量子化: `dl = d * (stored - 32)`, `x = dl * (low2 - (hm_bit ? 0 : 4))`

**Q2_K (84 bytes / 256 elements)**:
```
Offset  Size  Field
0       16    scales[16]  — per sub-block nibbles
                            low  nibble = 4-bit scale index
                            high nibble = 4-bit min   index
16      64    qs[64]      — 2-bit values, stride-32 (same as Q3_K qs)
80       2    d           — super-block scale  (fp16, POSITIVE: d = maxScale/15)
82       2    dmin        — super-block dmin   (fp16, POSITIVE: dmin = maxMin/15)
```
- 逆量子化: `dl = d * (sc & 0xF)`, `ml = dmin * (sc >> 4)`, `x = dl * qi - ml`

> **注意**: 初期実装は ggml と非互換のレイアウトを持っていた (Q4_0 ニブルバグと同根)。
> `ggml-quants.c` の `quantize_row_q3_K_ref` / `dequantize_row_q3_K` を参照して修正済み。

### WASM リビルド不要の理由

Q2_K/Q3_K は GGUF ヘッダで標準 GGML 型コード (10, 11) として書き込まれる。
wllama (llama.cpp) はこれらを native ggml path で処理するため、
カスタム C++ ディスパッチは不要。WASM バイナリの変更なし。

### ユニットテスト結果 (lowbit-Q サブセット 154 tests 全合格 / 全体 616 tests)

```
✓ q3_kQuantize.test.ts (13 tests) — NMSE < 0.05 on all random/normal inputs
✓ q2_kQuantize.test.ts (15 tests) — NMSE < 0.15 on all random/normal inputs
```

### E2E 実測結果 (2026-04-10)

| プリセット | 変換後サイズ | 圧縮率 | NMSE mean | NMSE max | Load | TokGen | Func |
|---|---|---|---|---|---|---|---|
| v2-q4only (clean) | ~610 MB | ~52% | ~0.010 | ~0.015 | YES | YES | **YES** ✅ |
| v2-q3konly | 558 MB | 47.2% | 0.0343 | 0.0522 | YES | YES | **NO** |
| v2-q2konly | 459 MB | 38.9% | 0.1161 | 0.1797 | YES | YES | **NO** |

**最終結論 (Phase 3.6)**:
- Q4_0-ONLY が初の functionalSuccess=YES → パイプライン健全・フォーマット互換性確認
- Q3_K-ONLY は NMSE 0.034 でも TinyLlama 1.1B では繰り返しループ (品質問題、フォーマット問題ではない)
- Q2_K-ONLY は NMSE 0.116 で出力崩壊 (期待通り)
- **TinyLlama 1.1B での最小実用 bit 幅は Q4_0 (4bit)**
- Q3_K/Q2_K のフォーマット実装は ggml 互換 (より大きなモデルでは動作可能)

## Phase 3/3.5: 品質検証・比較実験 — 実行済み (2026-04-10)

### 実験ハーネス

| ファイル | 役割 |
|---|---|
| `tests/lowbit-q-phase3-comparison.spec.ts` | Playwright 比較テスト (4 設定、全実行済み) |
| `tests/phase3-comparison-results.json` | **Phase 3.5 実測値 (4-preset、2026-04-10 再実行)** |
| `Docs/2026-04-10-Phase3-Evaluation.md` | 詳細評価レポート (Phase 3.5 実測値に基づく) |

### Phase 3.5 実験結果サマリー (4 preset、2026-04-10 再実行) — 検証済み

※ 圧縮率 = 変換後サイズ ÷ 元サイズ (25.6% = 74.4% 削減)

| 設定 | 変換後 | 圧縮率 | SVID | Q4_0 | NMSE mean | NMSE max | Load | TokGen | Func |
|---|---|---|---|---|---|---|---|---|---|
| DEFAULT | 301 MB | 25.6% | 140 | 14 | 0.3363 | 0.3920 | ✅ | YES | NO |
| AGGRESSIVE | 264 MB | 22.4% | 154 | 0 | 0.3692 | 0.3976 | ✅ | YES | NO |
| CONSERVATIVE | 384 MB | 32.6% | 60 | 94 | 0.1493 | 0.3709 | ✅ | YES | NO |
| Q4_0-ONLY ⚠️ | 644 MB | 54.6% | **40** | 114 | 0.1036 | 0.3920 | ✅ | YES | NO |

> ⚠️ **Q4_0-ONLY バグ**: `sizeBudget: 0.55` が推定超過と判定し optimizer 起動 → attn_v/out 40テンソルが SVID_1BIT に。  
> SVID=0 の純粋ベースラインではない。`sizeBudget: 1.0` に修正済み。**再実行が必要。**

### Phase 3.5 実装変更 (全て適用済み)

- **smoke test 判定厳密化**: `tokenGenSuccess` (文字出力あり) と `functionalSuccess` (期待一致+非崩壊) を分離
- **Q4_0-only ベースライン追加**: allocator preset `v2-q4only` (allocator.ts, UI, テスト)
- **NMSE 4M 制限撤廃**: FFN (11.5M) を含む全テンソルが計測対象に
- **Q4_0 NMSE 計測**: Q4_0 ブランチに roundtrip NMSE 追加
- **Q4_0-ONLY sizeBudget バグ修正**: 0.55 → 1.0

### Phase 3.5 主要な知見

1. **全 4 設定で tokenGenSuccess = YES、functionalSuccess = NO** — 実用品質未達
2. **SVID NMSE ~0.37 は致命的** — 全 SVID preset で崩壊
3. **新発見: attn_v/out SVID が FFN SVID より有害**
   - CONSERVATIVE (FFN SVID): collapse ヒューリスティック未発火
   - Q4_0-ONLY 汚染版 (attn_v/out SVID=40): 全3プロンプト崩壊
4. **CONSERVATIVE NMSE 初判明**: mean=0.1493, max=0.3709 (FFN SVID 含む)
5. **Q4_0-ONLY は汚染版** — 純粋ベースラインの確立に再実行が必要

### 次フェーズへの結論

- **最優先**: Q4_0-ONLY 再実行 (sizeBudget: 1.0 修正済み、SVID=0 を確認)
  - functionalSuccess=YES → SVID が根本原因、Q2_K/Q3_K へ
  - functionalSuccess=NO → パイプライン/loader 問題、Phase 2 再検証
- **2 位**: attn_v/out 感受性検証 (attn_v/out のみ Q4_0 の設定を追加)
- **3 位**: Q2_K / Q3_K 導入 (NMSE << 0.37、Q4_0 より高圧縮)
- **4 位以降**: rotation preprocessing
Q2_K/Q3_K で NMSE を ~0.01-0.05 に下げることを先に目指すべき。

**2-3 bit SVID 拡張に進む価値があるか**: LOWER PRIORITY。
SVID の rank-1 近似限界 (NMSE 0.37) は bit 幅以前の問題。
Q2_K/Q3_K の方が理論的根拠が強く、実装コストも低い。

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

## 未実装 (次フェーズ)

- 回転前処理 (Hadamard, `applyRotation: true` は未実装エラー) ← native quant 確認後に検討
- 2-3 bit SVID 拡張 ← 低優先度 (native quant が主系統の場合は不要)
- 非 Llama アーキへの SVID ディスパッチ拡張 (patch 0002b/0003b)

## 未実装 (Phase 4)

- WebGPU ビルド有効化 (`-DGGML_WEBGPU=ON`)
- WGSL シェーダ (lowbit-Q カスタム型用)
- KV cache 量子化ランタイム (attention カーネル内)
- Activation quantization (W4A8 → W4A4)
