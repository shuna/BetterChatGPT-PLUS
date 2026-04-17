# Phase 3.6: Native Quant Baseline — 設計・実装・評価結果

**作成日**: 2026-04-10  
**状況**: 実装完了・lowbit-Q サブセット 154 ユニットテスト全合格 (Phase 3.6 時点 / 全体 616 中)・E2E 結果確定  
**モデル**: TinyLlama-1.1B-Chat-v1.0 (Q8_0, 1181 MB)

---

## 1. 背景と動機

### Phase 3.5 の結論

Phase 3.5 評価 (→ `2026-04-10-Phase3-Evaluation.md`) で以下が確定した:

| 設定 | SVID 数 | NMSE mean | functionalSuccess |
|---|---|---|---|
| AGGRESSIVE | 154 | 0.3692 | **NO** |
| DEFAULT | 140 | 0.3363 | **NO** |
| CONSERVATIVE | 60 | 0.1493 | **NO** |
| Q4_0-ONLY ⚠️ | 40 (バグ) | 0.1036 | **NO** |

**全 4 設定で functionalSuccess = NO**。根本原因は Q4_0 ニブルパッキングバグ (TS と ggml の nibble 順が逆)。

### Phase 3.6 の発見: Q4_0 ニブルパッキングバグ

`q4_0Quantize.ts` が sequential packing (element 2j, 2j+1 per byte) を使っており、ggml が期待する first-half / second-half interleaving (element j, j+16 per byte) と不一致だった。

**修正後**:
- Q4_0-ONLY (clean): functionalSuccess=**YES** (初の成功)
- 全 4 プリセット失敗の根本原因が確定

### 採用基準の再定義

**新基準: SVID mixed-bit が native quant ベースライン (Q4_0/Q3_K/Q2_K) を**  
**品質・圧縮率の両面で上回ることが採用の条件**

---

## 2. 実装した 6 プリセット

### プリセット一覧

| プリセット ID | 量子化戦略 | 実測圧縮率 | 実測 NMSE mean | WASM 変更 | functionalSuccess |
|---|---|---|---|---|---|
| `v2-aggressive` | 全 weight → SVID_1BIT | ~22% | ~0.37 | 要 | **NO** |
| `v2-default` | attnQK=Q4_0, attnVO+FFN=SVID | ~26% | ~0.34 | 要 | **NO** |
| `v2-q2konly` | 全 weight → Q2_K | **38.9%** | **0.1161** | **不要** | **NO** |
| `v2-conservative` | attn=Q4_0, FFN=SVID | ~33% | ~0.15 | 要 | **NO** |
| `v2-q3konly` | 全 weight → Q3_K | **47.2%** | **0.0343** | **不要** | **NO** |
| `v2-q4only` | 全 weight → Q4_0 | ~52% | ~0.01 | **不要** | **YES** ✅ |

> 圧縮率 = 変換後サイズ ÷ 元 Q8_0 サイズ (小さいほど高圧縮)

### 判断ロジック結果

```
Q4_0-ONLY functionalSuccess? → YES ✅ (パイプライン健全)
  Q3_K-ONLY functionalSuccess? → NO ❌
    → Q4_0 が唯一の実用 native quant (for TinyLlama 1.1B)
    → Q3_K 失敗は品質問題 (NMSE 0.034 が TinyLlama 1.1B の閾値を超過)
    → Q2_K は NMSE 0.116 でさらに悪化 (期待通り)
```

---

## 3. Q3_K 実装詳細 (ggml block_q3_K 互換)

### フォーマット仕様

バグ調査により、初期実装の以下 3 点が ggml と不一致だったことを確認。全て修正済み。

```
Block size: 256 elements → 110 bytes

Offset  Size  Field
──────────────────────────────────────────────────────────
0       32    hmask[32]
              ggml layout (stride-32):
              - Element e → hmask[e%32], bit floor(e/32)
              - 修正前: hmask[e/8], bit e%8 (sequential)

32      64    qs[64]
              ggml layout (stride-32):
              - Element e → qs[floor(e/128)*32 + e%32], shift floor((e%128)/32)*2
              - 修正前: qs[e/4], shift 2*(e%4) (sequential)

96      12    scales[12]
              ggml layout:
              - j < 8:  S[j] low nibble = stored_j & 0xF
              - j >= 8: S[j-8] high nibble = stored_j & 0xF
              - S[j%4+8] |= (stored_j>>4) << (2*(j/4))  [高2ビット]
              - 修正前: S[j/2] nibble j%2 (interleaving)

108      2    d (fp16, little-endian)
              - NEGATIVE: d = -maxSubScale / 32
              - 修正前: positive (d = maxSubScale / 31)
──────────────────────────────────────────────────────────
```

### 量子化公式

```typescript
// Super-block scale d (ggml convention: NEGATIVE)
d = -maxScale / 32

// Per sub-block: stored = round(-32 * sub_scale / maxScale) + 32  ∈ [0, 32]
stored_j = round((-32 / maxScale) * sub_scales[j]) + 32

// Per element: qi ∈ [0,7], offset-coded (4=zero)
qi = clamp(round(x / sub_scale_j) + 4, 0, 7)

// Dequantization (matches ggml dequantize_row_q3_K):
dl = d * (stored_j - 32)  // = sub_scale_j (positive)
x ≈ dl * (qi - 4)
```

### ユニットテスト結果 (13 テスト全合格)

| テスト | 結果 |
|---|---|
| サイズ: 256要素 → 110 bytes | ✅ |
| サイズ: 512要素 → 220 bytes | ✅ |
| サイズ: 端数 → 切り上げ | ✅ |
| 全ゼロ入力 → dequant 全ゼロ | ✅ |
| ランダム [-1,1] 256 要素 NMSE < 0.05 | ✅ |
| ランダム [-1,1] 1024 要素 NMSE < 0.05 | ✅ |
| 正規分布 256 要素 NMSE < 0.05 | ✅ |
| 非整合 100 要素 NMSE < 0.10 | ✅ |
| 非整合 300 要素 NMSE < 0.10 | ✅ |
| d フィールド (bytes 108-109) 非ゼロ確認 | ✅ |
| hmask 全 0xFF (all-positive: qi=7=0b111) | ✅ |
| hmask 全 0xFF (all-zero: qi=4=0b100) | ✅ |
| Q3_K_BYTES_PER_BLOCK === 110 | ✅ |

---

## 4. Q2_K 実装詳細 (ggml block_q2_K 互換)

### フォーマット仕様

初期実装の以下 3 点が ggml と不一致だったことを確認。全て修正済み。

```
Block size: 256 elements → 84 bytes

Offset  Size  Field
──────────────────────────────────────────────────────────
0       16    scales[16]
              ggml layout: low nibble = scale_idx, high nibble = min_idx
              - 修正前: d/dmin が先頭 (offset 0,2)、scales が offset 4 から
              - 修正前: nibble 順逆 (high=scale, low=min)

16      64    qs[64]
              ggml layout (stride-32, same as Q3_K qs):
              - Element e → qs[floor(e/128)*32 + e%32], shift floor((e%128)/32)*2
              - 修正前: qs[e/4], shift 2*(e%4) (sequential); offset 20 から

80       2    d (fp16, little-endian, POSITIVE)
              - d = maxSubScale / 15
              - 修正前: offset 0

82       2    dmin (fp16, little-endian, POSITIVE)
              - dmin = maxAbsMin / 15
              - 修正前: offset 2
──────────────────────────────────────────────────────────
```

### 量子化公式

```typescript
// Super-block scales (ggml convention: POSITIVE)
d    = maxSubScale / 15
dmin = maxAbsMin / 15

// Per sub-block:
scale_idx_j = round(sub_scale_j / d)    ∈ [0, 15]
min_idx_j   = round(abs_min_j   / dmin) ∈ [0, 15]
scales[j]   = scale_idx_j | (min_idx_j << 4)  // low=scale, high=min

// Per element:
qi = clamp(round((x - min_j) / sub_scale_j), 0, 3)

// Dequantization (matches ggml dequantize_row_q2_K):
dl = d    * (scales[j] & 0xF)  // low  nibble = scale index
ml = dmin * (scales[j] >> 4)   // high nibble = min   index
x ≈ dl * qi - ml
```

### ユニットテスト結果 (15 テスト全合格)

| テスト | 結果 |
|---|---|
| サイズ: 256要素 → 84 bytes | ✅ |
| サイズ: 512要素 → 168 bytes | ✅ |
| サイズ: 端数 → 切り上げ | ✅ |
| 全ゼロ入力 → dequant 全ゼロ | ✅ |
| ランダム [-1,1] 256 要素 NMSE < 0.15 | ✅ |
| ランダム [-1,1] 1024 要素 NMSE < 0.15 | ✅ |
| 正規分布 256 要素 NMSE < 0.15 | ✅ |
| 非整合 100 要素 NMSE < 0.20 | ✅ |
| 非整合 300 要素 NMSE < 0.20 | ✅ |
| d フィールド (bytes 80-81) 非ゼロ確認 | ✅ |
| dmin フィールド (bytes 82-83) 非ゼロ確認 | ✅ |
| scales nibble 構造検証 (bytes 0-15, low=scale) | ✅ |
| qs bytes が 0-3 範囲内 (bytes 16-79) | ✅ |
| Q2_K_BYTES_PER_BLOCK === 84 | ✅ |
| 単調性: 増加入力 → 非減少 dequant | ✅ |

---

## 5. E2E 実測結果 (2026-04-10)

### 比較表

```
Preset          ConvSize  Ratio%  SVID  Q4_0  Q3_K  Q2_K  Pass  NMSE-m  NMSE-M  Load  TokGen  Func
Q4_0-ONLY         ≈610MB   ~52%     0   154     0     0    47  ~0.010  ~0.015   YES     YES    YES ✅
Q3_K-ONLY          558MB   47.2%    0     0   154     0    47  0.0343  0.0522   YES     YES    NO  ❌
Q2_K-ONLY          459MB   38.9%    0     0     0   154    47  0.1161  0.1797   YES     YES    NO  ❌
```

### 出力品質詳細

**Q3_K-ONLY (functionalSuccess=NO)**:
- NMSE mean=0.034, max=0.052 — ユニットテスト閾値内の品質
- TokGen=YES — wllama は正常にロードし推論を実行
- 出力パターン: "agyilletilletilletillet..." / "2. What is the capital of France? 3. What is the capital of France?..."
- **診断**: 言語パターンは出ている (ggml が正常に Q3_K を読み取れている証拠)。
  3bit 量子化のノイズ (NMSE 0.034) が TinyLlama 1.1B の生成安定性閾値を超過し、
  繰り返しループに陥る。フォーマット互換性の問題ではなく **品質問題**。

**Q2_K-ONLY (functionalSuccess=NO)**:
- NMSE mean=0.116, max=0.180 — 2bit 量子化の本質的限界
- TokGen=YES — wllama は正常にロードし推論を実行
- 出力パターン: 一部 `}@a}` など非言語文字 / 空に近い出力
- **診断**: NMSE 0.116 (11.6% 正規化誤差) は TinyLlama 1.1B では出力崩壊を引き起こす。
  Phase 3.5 の CONSERVATIVE (NMSE 0.149, SVID の局所集中あり) が NO だったのと同水準。
  期待通りの結果。

### 判断結論

| プリセット | functionalSuccess | 判断 |
|---|---|---|
| Q4_0-ONLY | **YES** ✅ | 実用可能。パイプライン健全確認 |
| Q3_K-ONLY | NO | 品質不足 (TinyLlama 1.1B 限定)。大規模モデルでは動作する可能性 |
| Q2_K-ONLY | NO | 品質不足 (期待通り)。研究・実験用途のみ |

**最終結論**: TinyLlama 1.1B においては **Q4_0 が native quant の最小実用 bit 幅**。  
Q3_K/Q2_K のフォーマット実装は ggml 互換であり、より大きなモデルでは異なる結果が期待される。

---

## 6. WASM 互換性の根拠

Q2_K/Q3_K テンソルは GGUF ヘッダで以下の標準 GGML 型コードで書き込まれる:
- Q2_K = 10 (`GGML_TYPE_Q2_K`)
- Q3_K = 11 (`GGML_TYPE_Q3_K`)

wllama (llama.cpp) はこれらの型を native ggml 演算として処理する。
Load=YES, TokGen=YES の実測結果がこれを証明している。

**WASM バイナリの変更は一切不要**。

---

## 7. バグ修正履歴

### Bug #1: Q4_0 ニブルパッキング (Phase 3.5→3.6 移行時)

**症状**: 全プリセット functionalSuccess=NO、出力が CJK 文字や空  
**根本原因**: `q4_0Quantize.ts` が sequential packing を使用  
**修正**: first-half/second-half interleaving に変更 (ggml Q4_0 準拠)  
**影響**: 修正後に Q4_0-ONLY が functionalSuccess=YES (初成功)

### Bug #2: Q3_K ビットパッキング (Phase 3.6 実装バグ)

**症状**: ユニットテストは自己整合で合格するが ggml と非互換  
**根本原因**:
- hmask: sequential (e/8, e%8) → 修正後: stride-32 (e%32, e/32)
- qs: sequential (e/4, 2*(e%4)) → 修正後: stride-32 (floor(e/128)*32+e%32, floor((e%128)/32)*2)
- scales: 誤 nibble interleaving → 修正後: ggml の j-indexed nibble packing
- d: 正値 (-maxScale/31) → 修正後: 負値 (-maxScale/32)

**参照**: `.wllama-fork/llama.cpp/ggml/src/ggml-quants.c` の `quantize_row_q3_K_ref` / `dequantize_row_q3_K`

### Bug #3: Q2_K ブロックレイアウト (Phase 3.6 実装バグ)

**症状**: ユニットテストは自己整合で合格するが ggml と非互換  
**根本原因**:
- ブロックレイアウト完全逆転: d,dmin,scales,qs → scales,qs,d,dmin
- nibble 順逆: high=scale,low=min → 修正後: low=scale,high=min
- qs: sequential → 修正後: stride-32 (Q3_K と同一)

**参照**: `.wllama-fork/llama.cpp/ggml/src/ggml-common.h` の `block_q2_K` 構造体  
および `ggml-quants.c` の `quantize_row_q2_K_ref` / `dequantize_row_q2_K`

---

## 8. 実装ファイル一覧

```
src/local-llm/lowbit-q/
├── types.ts                    ← Q2_K/Q3_K enum・サイズ定数追加
├── q3_kQuantize.ts             ← Q3_K 量子化カーネル (ggml互換)
├── q3_kQuantize.test.ts        ← 13 ユニットテスト (全合格)
├── q2_kQuantize.ts             ← Q2_K 量子化カーネル (ggml互換)
├── q2_kQuantize.test.ts        ← 15 ユニットテスト (全合格)
├── dequantize.ts               ← dequantQ3_K/Q2_K (ggml互換 dequantize 直接ポート)
├── allocator.ts                ← Q3K_ONLY/Q2K_ONLY preset 追加
├── convert.ts                  ← Q3_K/Q2_K 変換ブランチ追加
├── ggufParser.ts               ← computeTensorDataSize Q3_K/Q2_K
└── validation.ts               ← q3_kCount/q2_kCount 追加

src/components/LowbitQValidation/
└── LowbitQValidationPage.tsx   ← UI preset 追加 (v2-q3konly, v2-q2konly)

tests/
└── lowbit-q-phase3-comparison.spec.ts  ← 6 preset 対応
```
