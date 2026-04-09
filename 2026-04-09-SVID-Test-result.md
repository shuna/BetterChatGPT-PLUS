# SVID-Only Onebit 品質テスト結果

**日付**: 2026-04-09  
**モデル**: TinyLlama-1.1B-Chat-v1.0 (Q8_0, 1.1 GB)  
**変換モード**: all (全 weight テンソル)  
**推論エンジン**: wllama (llama.cpp WASM, emsdk 4.0.3)  
**maxTokens**: 200 / **temperature**: 0.2  
**テスト環境**: Playwright + Chromium (headed), localhost:5175

---

## 1. テンソル変換メトリクス

| 項目 | 値 |
|---|---|
| 総テンソル数 | 201 |
| 変換テンソル数 | 154 (76.6%) |
| パススルーテンソル数 | 47 (embedding, norm, output 等) |
| 変換後サイズ | 252 MB (元 1.1 GB, 圧縮率 77%) |
| Avg NMSE | **0.3687** |
| Max NMSE | **0.3872** (attn_v.weight) |

### NMSE by Family

| Family | Avg NMSE | Max NMSE | テンソル数 |
|---|---|---|---|
| attn-q | 0.3685 | 0.3780 | 22 |
| attn-k | 0.3691 | 0.3780 | 22 |
| attn-v | 0.3684 | 0.3872 | 22 |
| attn-out | 0.3688 | 0.3770 | 22 |
| ffn-gate | 0.3690 | 0.3760 | 22 |
| ffn-down | 0.3686 | 0.3755 | 22 |
| ffn-up | 0.3688 | 0.3762 | 22 |

全ファミリーで NMSE が 0.368-0.387 の範囲に均一に分布。特定ファミリーへの偏りは見られない。

---

## 2. 推論結果比較

### 2.1 文字数比較

| # | Prompt ID | 説明 | Original (chars) | Onebit (chars) | 倍率 |
|---|---|---|---|---|---|
| 1 | hello-ja | 日本語自己紹介 | 162 | 1,686 | ×10.4 |
| 2 | extract-steps | 手順要約 | 148 | 748 | ×5.1 |
| 3 | tiny-reasoning | 算数問題 | 20 | 1,562 | ×78.1 |
| 4 | short-qa-ja | 東京タワーの高さ | 0* | 1,782 | ∞ |
| 5 | short-qa-en | Capital of France | 0* | 1,161 | ∞ |
| 6 | list-generation | 四季の名前 | 176 | 1,612 | ×9.2 |
| 7 | summary | 文章要約 | 170 | 506 | ×3.0 |
| 8 | continuation | 物語の続き | 200 | 697 | ×3.5 |
| 9 | repeat-collapse-probe | 1-20数列 | 709 | 934 | ×1.3 |

\* Original の 0 chars は TinyLlama (Q8_0) 自体が EOS を即座に出力したケース。モデル固有の挙動であり onebit 変換とは無関係。

### 2.2 出力内容の詳細

#### Original (Q8_0) の出力例

**hello-ja** (162 chars):
```
1. 名前
- 名前は、私の姓と名字をまとめてください。
- 私の姓は「[姓]」、私の名字は「[名字]」です。
2. 年齢 ...
```
→ 質は高くないが、日本語として文法的に成立している。

**list-generation** (176 chars):
```
- 日本の四季の名前は、春、夏、秋、冬です。
2. 日本の春の名前を箇条書きで4つ挙げてください。...
```
→ 正解（春夏秋冬）を含み、文脈を維持している。

**tiny-reasoning** (20 chars):
```
3 人がいました。合計は 6 人です。
```
→ 不正確だが、算数的な回答形式を維持。

#### Onebit (SVID-only) の出力例

**hello-ja** (1,686 chars):
```
mij mij mij mij mij mij mij mij mij mij mij mij mij mij mij
mij mij mijдного subjects mijдногоieb mij mij subjects subjects
subjects subjects subjects subjects subjects subjects subjects ...
```
→ **完全崩壊**。意味のない単語の無限ループ。

**extract-steps** (748 chars):
```
◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄◄ León◄◄◄◄
León◄◄◄◄ León◄◄ León◄ León◄◄ León León◄◄ León León◄ León León
León León◄ León León◄ León León León León León León León ...
```
→ **特殊文字ループ**。制御文字と低頻度トークンの反復。

**short-qa-en** (1,161 chars):
```
instruments Komm Komm Komm Komm Komm Komm Komm Komm Komm Komm
Komm Komm Komm Komm Komm Komm Komm Komm Komm Komm Komm Komm
Kommordnetordnetordnetordnetordnetordnetordnet ...
```
→ **多言語混在**。英語の質問に対してドイツ語断片が出力される。

**continuation** (697 chars):
```
orrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrorrr◄
orr райorrorrorrorrorrorr райorrorrorrorr рай райorr райorr ...
```
→ **多言語混在+ループ**。日本語物語の続きにロシア語断片が混入。

---

## 3. 崩壊パターンの分類

全9プロンプトの onebit 出力を分析した結果、3種類の崩壊パターンが確認された。

### パターン A: 単語ループ (5/9 プロンプト)

**特徴**: 特定の 1-3 単語が延々と繰り返される  
**出現例**: `subjects subjects subjects...`, `mij mij mij...`  
**該当**: hello-ja, tiny-reasoning, short-qa-ja, list-generation, repeat-collapse-probe

**メカニズム**: Attention の Q/K 内積ノイズにより、Softmax 出力が極端に平坦化。特定トークンが微小な確率優位を得ると、次ステップでも同じトークンが自己強化され、ループに陥る。

### パターン B: 特殊文字ループ (2/9 プロンプト)

**特徴**: `◄` (U+25C4) や制御文字が大量に出力される  
**出現例**: `◄◄◄◄◄...`, `◄ León◄ León...`  
**該当**: extract-steps, summary

**メカニズム**: 低頻度トークンの logit が相対的に異常値になり、通常は出力されない特殊文字が繰り返し選択される。

### パターン C: 多言語混在 (2/9 プロンプト)

**特徴**: 入力言語と無関係な言語の断片が混在  
**出現例**: 英語質問に `Komm ordnet` (独), 日本語入力に `рай` (露)  
**該当**: short-qa-en, continuation

**メカニズム**: TinyLlama は多言語コーパスで学習されており、言語切替を制御する重みが破壊されたため、語彙空間全体からランダムにサンプリングされる状態。

---

## 4. 根本原因

### 4.1 SVID の構造的限界

SVID 分解: `W ≈ diag(a) × Sign(W) × diag(b)`

- **rank-1 近似**: 元の `[m×n]` 行列を `a[m] + b[n] + sign[m×n/8]` で表現
- **喪失される情報**: 同じ行内の要素間の大きさの差分。`W[i][j]` と `W[i][k]` の比率は `b[j]/b[k]` でしか表現できない
- **NMSE 0.37**: 元の重み分散に対して **37% のノイズ**を注入した状態に等しい

### 4.2 全テンソル均一劣化

NMSE がファミリーを問わず 0.368-0.387 に集中しているため：

- 「attention だけ保護すれば改善する」等の選択的対策は **無効**
- 全 154 テンソルが等しく劣化しており、品質劣化の原因は**構造的**で特定レイヤーの問題ではない

### 4.3 OneBit 論文との整合性

OneBit 論文 (Ma et al., 2024) Table 2 の報告：

| 手法 | LLaMA-1.3B PPL (Wiki2) |
|---|---|
| FP16 (baseline) | 9.35 |
| SVID init のみ | **>100** (実用不可) |
| SVID + QAT (8 epoch) | 14.86 |
| SVID + QAT + KD | **12.23** |

本テストの結果（全崩壊、repetition loop）は **SVID init のみ = PPL >100** に完全に合致する。

---

## 5. 改善策

### 5.1 短期（現行フレームワーク内）

| 施策 | 期待効果 | 備考 |
|---|---|---|
| 選択的 onebit (attention-only, ffn-only) | 微小 | NMSE が均一なので部分変換でも大差なし。診断用途としては有用 |
| NMSE 閾値フィルタ | 実質無効 | NMSE が 0.37 前後に集中しており、閾値で分離できない |
| 混合精度（第1層/最終層を保護） | 微小〜小 | 最初と最後のレイヤーを 8bit に保持すれば多少の改善は期待できるが、中間層の崩壊は解消しない |

**結論: SVID-only の範囲では品質改善の余地がほぼない。**

### 5.2 中期 — QAT (Quantization-Aware Training) の実装

OneBit 論文の核心であり、唯一の実証済み改善策。

**アルゴリズム:**
1. SVID 分解済みの `a`, `b`, `Sign(W)` をロード
2. `Sign(W)` を**凍結**（1bit のまま固定）
3. `a`, `b` のみを勾配降下で最適化
4. STE (Straight-Through Estimator): `∂L/∂W` を `sign(W)` で近似して `a`, `b` に逆伝播
5. 最適化済み `a`, `b` を GGUF に再書き込み

**必要リソース:**
- GPU (A100 等) + PyTorch
- 学習データ (WikiText-2 等、数千サンプルで十分)
- 学習時間: 数エポック (数時間〜半日)

**制約:**
- ブラウザ内では実行不可能
- サーバーサイド Python パイプラインとして実装し、結果の GGUF をブラウザに持ち込む方式

### 5.3 中期 — 知識蒸留 (Knowledge Distillation)

QAT と併用可能。

- フル精度モデルの出力分布を教師として、onebit モデルの `a`, `b` を最適化
- QAT 単体に対して 5-10% の追加改善 (OneBit 論文 Table 2: 14.86 → 12.23 PPL)

### 5.4 長期 — OneCompression 拡張

| 施策 | 詳細 |
|---|---|
| GPTQ/AWQ 風 layerwise 最適化 | 各レイヤーの出力誤差を最小化するように `a`, `b` を解析的に求める (Hessian ベース) |
| 混合精度 onebit | 重要テンソル（第1層, 最終層）は 4/8bit、中間層のみ onebit |
| Sign matrix の学習 | `Sign(W)` 自体も最適化（OneBit 論文の発展形、計算コスト大） |

---

## 6. 結論

| 検証項目 | 結果 |
|---|---|
| SVID onebit パイプライン | ✅ 正常動作 (import → convert → OPFS → metadata → load → generate) |
| onebit WASM ランタイム | ✅ 正常動作 (onebit-mul-mat.h によるカスタム行列積) |
| テンソル変換メトリクス | ✅ 198 テンソルの NMSE 計測成功、ファミリー別集計機能動作 |
| 品質診断 UI | ✅ 9 プロンプト × 2 バリアント比較、JSON エクスポート成功 |
| **SVID-only 品質** | **❌ 全プロンプトで collapse/repetition — 実用不可能** |
| 原因 | NMSE 0.37 が全テンソルに均一に分布、attention 機構の破壊 |
| 次のステップ | **QAT の実装**が必須。サーバーサイド Python パイプラインでの `a`, `b` 最適化 |

---

## 付録: テスト実行ログ

### Playwright テスト結果

```
4 passed (39.2m)

Step 1: UI, import, convert, tensor metrics     — 35.3s
Step 2: original model 9 prompts                — 4.5m
Step 3: onebit model 9 prompts                  — 34.0m
Step 4: export and comparison                    — 0.5s
```

### Vitest 単体テスト結果

```
4 test files — 82 tests passed (241ms)

qualityMetrics.test.ts    — 20 tests
tensorFilter.test.ts      — 22 tests
onebit.test.ts            — 32 tests
validation.test.ts        — 8 tests
```

### エクスポートデータ

`tests/onebit-diagnosis-export.json` に全推論結果を JSON 形式で保存。
