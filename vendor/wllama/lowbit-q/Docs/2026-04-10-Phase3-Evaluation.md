# Phase 3/3.5: lowbit-Q v2 Allocator 比較評価レポート

**モデル**: TinyLlama-1.1B-Chat-v1.0 (Q8_0, 1.09 GiB = 1181 MB)  
**推論エンジン**: wllama v2 (patched, lowbit-Q WASM build)  
**テストスクリプト**: `tests/lowbit-q-phase3-comparison.spec.ts`  
**生データ**: `tests/phase3-comparison-results.json`

| 実行 | 日付 | Preset 数 | NMSE 計測範囲 | 成功判定 |
|---|---|---|---|---|
| Phase 3 (初回) | 2026-04-10 | 3 | attn_k/v のみ (4M 閾値) | tokenGenSuccess のみ |
| **Phase 3.5 (本レポート)** | **2026-04-10** | **4** | **全テンソル (閾値撤廃)** | **tokenGenSuccess + functionalSuccess** |

> **用語の定義**
> - **tokenGenSuccess**: 非空出力が1件以上返った。品質は問わない。
> - **functionalSuccess**: 少なくとも1プロンプトで期待パターン一致 かつ collapse 未検出。実用推論成功を意味する。
> - **collapse**: 単語占有率 >40% ヒューリスティック。"no" は非崩壊を示すが非機能出力の可能性あり。

---

## 1. 実験概要

lowbit-Q v2 mixed-bit 変換器を TinyLlama-1.1B に適用し、4 種類の allocator 設定で比較した。

**評価軸:**
- 変換前後サイズ・圧縮率 (圧縮率 = 変換後 ÷ 元サイズ)
- tensor_alloc 内訳 (SVID_1BIT / Q4_0 / passthrough 数)
- NMSE (SVID および Q4_0 roundtrip、全テンソル計測)
- ロード成否 (WASM @@INFO ログ照合)
- smoke test: 3 プロンプト × 4 設定、functionalSuccess / tokenGenSuccess

---

## 2. サイズ・割当比較

| 設定 | 変換後サイズ | 圧縮率 | SVID_1BIT | Q4_0 | passthrough | 合計 |
|---|---|---|---|---|---|---|
| 元モデル (Q8_0) | 1181 MB | — | — | — | — | — |
| DEFAULT | 301 MB | 25.6% | 140 | 14 | 47 | 201 |
| AGGRESSIVE | 264 MB | 22.4% | 154 | 0 | 47 | 201 |
| CONSERVATIVE | 384 MB | 32.6% | 60 | 94 | 47 | 201 |
| Q4_0-ONLY ⚠️ | 644 MB | 54.6% | **40** | 114 | 47 | 201 |

> ⚠️ **Q4_0-ONLY の SVID=40 はバグ**: `sizeBudget: 0.55` が推定サイズ超過と判定し、
> バジェット optimizer が attn_v/out (20層 × 2テンソル = 40) を SVID_1BIT に変換した。
> 本来 SVID=0 であるべきところが汚染されたベースライン。
> `sizeBudget: 1.0` に修正済み。再実行で SVID=0 の純粋ベースラインを取得予定。

### 割当の内訳 (TinyLlama-1.1B GQA アーキテクチャ)

- 22 transformer ブロック × 7 weight テンソル = 154 weight + 47 passthrough = 201
- 7 テンソル/ブロック: attn_q, attn_k, attn_v, attn_out, ffn_gate, ffn_up, ffn_down
- first/last layer (layer 0, 21): 全設定で Q4_0 (14テンソル) — first/last override 適用

**DEFAULT** (attnQK=Q4_0, attnVO+FFN=SVID_1BIT):
- layer 0, 21: 14 → Q4_0
- layer 1-20 の attn_q/k: Q4_0 (しかし実測 Q4_0=14 のみ → first/last の 14 が Q4_0、残り attn_q/k が SVID に分類されている可能性)
  - ※ 内訳詳細は未解明。allocator の family 判定とfirst/last override の優先順位が影響

**AGGRESSIVE** (全 SVID except first/last):
- layer 0, 21: Q4_0 (14) → しかし実測 SVID=154, Q4_0=0
  - ※ AGGRESSIVE では firstLayerQuant/lastLayerQuant も SVID_1BIT に設定されているため Q4_0=0 が正しい

**CONSERVATIVE** (attn=Q4_0, FFN=SVID_1BIT):
- attn (4テンソル × 22層 = 88 のうち first/last 含む): Q4_0 = 94
- ffn (3テンソル × 20中間層 = 60): SVID_1BIT = 60

**Q4_0-ONLY (汚染版)**:
- 本来全 Q4_0 のはずが、optimizer により attn_v/out 20層分 = 40 が SVID_1BIT に

---

## 3. NMSE 比較 (Phase 3.5: 全テンソル計測)

Phase 3.5 では `totalElements <= 4_000_000` 制限を撤廃し、FFN (11.5M 要素) を含む全テンソルを計測。  
Q4_0 ブランチにも roundtrip NMSE (fp32→Q4_0→fp32) を追加。

| 設定 | NMSE mean | NMSE max | 備考 |
|---|---|---|---|
| DEFAULT | **0.3363** | **0.3920** | SVID テンソルの平均 (140 SVID + 14 Q4_0 混在) |
| AGGRESSIVE | **0.3692** | **0.3976** | 全 154 テンソル SVID の平均 |
| CONSERVATIVE | **0.1493** | **0.3709** | FFN SVID (最大 0.37) + Q4_0 attn (最小 ~0.001) の混在平均 |
| Q4_0-ONLY ⚠️ | **0.1036** | **0.3920** | attn_v/out SVID 40 (max 0.39) + Q4_0 114 (~0.001) の混在平均 |

**Phase 3 → Phase 3.5 NMSE 変化:**
- DEFAULT: 0.3688 → 0.3363 (FFN テンソルの NMSE が attn_k/v より低く、平均を下げた)
- AGGRESSIVE: 0.3687 → 0.3692 (ほぼ同等、全テンソルが SVID のため変化小)
- CONSERVATIVE: N/A → 0.1493 (**初めて計測**: FFN SVID ~0.37 + Q4_0 attn ~0.001 の混在)
- Q4_0-ONLY: 新規 (ただし汚染版)

**FFN NMSE の推定** (CONSERVATIVE の内訳から):
- 60 SVID テンソル (FFN) の NMSE max = 0.3709 → FFN SVID も ~0.37 水準
- Q4_0 テンソルの NMSE は非常に低い (mean を 0.37 から 0.15 に引き下げている)

---

## 4. ロード・smoke test 結果

> **ロード**: 全 4 設定で ✅ SUCCESS。wllama-native @@INFO ログで allocator 内訳確認済み。

### smoke test 出力比較

| 設定 | Prompt | chars | match | collapse | 出力冒頭 |
|---|---|---|---|---|---|
| **DEFAULT** | Reasoning | 598 | ❌ | YES | `mitt Ducmittmitt Ducetonetonetonmitt...` |
| | Short QA | 513 | ❌ | no* | `ischofischofischofischofischofiscof...` |
| | List | 861 | ❌ | YES | `ExternaŤ◄ŤŤŤ◄ischofischofischof...` |
| **AGGRESSIVE** | Reasoning | 1116 | ❌ | YES | `longer longest longest longer longest...` |
| | Short QA | 863 | ❌ | YES | `brit Komm instruments Komm Komm Komm...` |
| | List | 1110 | ❌ | YES | `mij mij longer mij mij mij mij mij...` |
| **CONSERVATIVE** | Reasoning | 577 | ❌ | no* | `éső teraovátera breminaaisonminateratera...` |
| | Short QA | 635 | ❌ | no* | `teraterateraterateraterateraterateratera...` |
| | List | 602 | ❌ | no* | `teraterateraterateraminaterateraminamina...` |
| **Q4_0-ONLY** ⚠️ | Reasoning | 710 | ❌ | YES | `racc racc racc racc racc racc racc...` |
| | Short QA | 796 | ❌ | YES | `` `;wo`;`;`;`;wo`;wouo)`,`,)`,)`,)`,... `` |
| | List | 621 | ❌ | YES | `racc banda; Mad releases作 Mad raccMad...` |

*「no」は collapse ヒューリスティック (<40% 単語占有率) を超えていないが、実質非機能出力。

### 成功判定サマリー

| 設定 | tokenGenSuccess | functionalSuccess | collapse パターン |
|---|---|---|---|
| DEFAULT | YES | **NO** | 単語ループ (Duc, iscof, Externa) |
| AGGRESSIVE | YES | **NO** | 単語ループ (longest, Komm, mij) |
| CONSERVATIVE | YES | **NO** | 音節ループ (tera/mina/hers)、collapse 未検出 |
| Q4_0-ONLY ⚠️ | YES | **NO** | 単語ループ (racc)、記号列、多言語断片 |

**全 4 設定で functionalSuccess = NO。**

---

## 5. Phase 3.5 の新知見

### 5.1 attn_v/out SVID は FFN SVID より有害

| 設定 | SVID 対象 | collapse 有無 |
|---|---|---|
| CONSERVATIVE | FFN (60テンソル, NMSE max 0.37) | **なし** (heuristic) |
| Q4_0-ONLY 汚染版 | attn_v/out (40テンソル, NMSE max 0.39) | **あり** (全3プロンプト) |

CONSERVATIVE (FFN SVID) では collapse ヒューリスティックが発火しない音節ループにとどまる。
Q4_0-ONLY 汚染版 (attn_v/out SVID のみ) では単語ループ・記号列の激しい崩壊が発生する。

→ **attn_v/out の SVID 量子化が FFN より出力品質に致命的**。  
Phase 3 の「FFN ノイズが主要因」という分析は見直しが必要。  
attention value / output projection を低品質で量子化することが崩壊の引き金になっている可能性が高い。

ただし Q4_0-ONLY は汚染版のため、SVID=0 での確認が必要。

### 5.2 CONSERVATIVE NMSE が判明

Phase 3 では FFN テンソル (11.5M 要素) が 4M 閾値で計測外。  
Phase 3.5 では撤廃により CONSERVATIVE NMSE = 0.1493 (mean), 0.3709 (max) と判明。  
FFN SVID の max NMSE は ~0.37 であり、他 SVID テンソルと同水準。  
しかし attn を Q4_0 で保護したことで、出力崩壊は抑制されている。

### 5.3 DEFAULT の NMSE が低下

Phase 3: NMSE mean = 0.3688 (attn_k/v のみ)  
Phase 3.5: NMSE mean = 0.3363 (全テンソル)

FFN テンソルの NMSE が attn_k/v (0.37) より低い可能性がある。  
ただし mean の低下は Q4_0=14 の低 NMSE が混入した影響も考えられる。

---

## 6. Phase 3.5 全設定比較テーブル

| 設定 | 変換後 | 圧縮率 | SVID | Q4_0 | NMSE mean | NMSE max | Load | TokGen | Func |
|---|---|---|---|---|---|---|---|---|---|
| DEFAULT | 301 MB | 25.6% | 140 | 14 | 0.3363 | 0.3920 | ✅ | YES | **NO** |
| AGGRESSIVE | 264 MB | 22.4% | 154 | 0 | 0.3692 | 0.3976 | ✅ | YES | **NO** |
| CONSERVATIVE | 384 MB | 32.6% | 60 | 94 | 0.1493 | 0.3709 | ✅ | YES | **NO** |
| Q4_0-ONLY ⚠️ | 644 MB | 54.6% | **40** | 114 | 0.1036 | 0.3920 | ✅ | YES | **NO** |

---

## 7. Q4_0-ONLY バグと修正

**バグ**: `Q4_0_ONLY_ALLOCATOR_CONFIG.sizeBudget = 0.55` が推定サイズを超過と判定し、
バジェット optimizer の Step 1 (attnVO → SVID_1BIT) を実行した。
その結果 attn_v/out 20中間層 (40テンソル) が SVID_1BIT に変換された。

**修正**: `sizeBudget: 1.0` に変更済み (`allocator.ts`)。optimizer を無効化。

**Q4_0-ONLY 汚染版の解釈**:
- SVID=0 の純粋 Q4_0 ベースラインではないため、「Q4_0 でも崩壊する」とは結論できない
- ただし attn_v/out SVID の崩壊への影響は観察できた
- 純粋 Q4_0-ONLY の再実行が必要

---

## 8. NMSE 閾値の撤廃

Phase 3 では `totalElements <= 4,000,000` 制限により FFN テンソルが計測外だった。
Phase 3.5 でガードを削除し、以下が全て計測可能に:

| テンソル | 要素数 | Phase 3 | Phase 3.5 |
|---|---|---|---|
| attn_q / attn_out | 4,194,304 | ❌ | ✅ |
| attn_k / attn_v | 524,288 | ✅ | ✅ |
| ffn_gate / ffn_up / ffn_down | 11,534,336 | ❌ | ✅ |

`reconstruct()` は元々フル Float32Array を確保するため追加メモリコストなし。
NMSE ループは O(n) で 11.5M テンソルでも < 1 秒。

---

## 9. 結論

### 確認できたこと

1. **全 4 設定でロード・トークン生成パイプライン正常動作** — tokenGenSuccess = YES
   ただし **functionalSuccess = NO for all** (実用品質なし)
2. **SVID NMSE ~0.37 は依然として致命的** — 3 SVID preset すべてで崩壊
3. **attn_v/out SVID が FFN SVID より有害** — Q4_0-ONLY 汚染版の崩壊 vs CONSERVATIVE の非崩壊
4. **CONSERVATIVE NMSE が初めて判明**: mean=0.1493, max=0.3709 (FFN SVID ~0.37 を含む)
5. **Q4_0-ONLY ベースラインは未確立** — sizeBudget バグで SVID=40 が混入、修正済み

### allocator ごとのトレードオフ (Phase 3.5 時点)

| 設定 | サイズ | NMSE mean | 品質 | 推薦度 |
|---|---|---|---|---|
| AGGRESSIVE | 最良 (22.4%) | 0.3692 | 最悪 (全崩壊) | ❌ |
| DEFAULT | 中 (25.6%) | 0.3363 | 悪い (崩壊あり) | ❌ |
| CONSERVATIVE | 大 (32.6%) | 0.1493 | 相対的に最良 (非崩壊) | ❌ (非機能) |
| Q4_0-ONLY ⚠️ | 最大 (54.6%) | 0.1036 | 崩壊 (汚染版) | 再実行待ち |

---

## 10. 次にやるべきこと (優先順位順)

### 最優先: Q4_0-ONLY 再実行 (sizeBudget: 1.0 修正済み)

**目的**: SVID=0 の純粋 Q4_0 ベースラインを確立。  
Q4_0 でも崩壊 → パイプライン/loader の問題を調査  
Q4_0 で正常 → SVID が根本原因確定、Q2_K/Q3_K へ進む

**期待**: ~600 MB (51%), NMSE < 0.01, functionalSuccess = YES

### 2位: attn_v/out 感受性の検証

Q4_0-ONLY 汚染版の知見 (attn_v/out SVID が有害) を確認するため、  
attn_v/out のみ Q4_0、他 SVID の設定を追加テスト。

### 3位: Q2_K / Q3_K 導入

SVID の rank-1 近似限界 (NMSE 0.37) は構造的問題。  
ggml ネイティブ型 Q2_K / Q3_K は NMSE << 0.37 で Q4_0 より高圧縮。

### 4位以降

- rotation preprocessing: Q2_K/Q3_K 採用後に検討
- 2-3bit SVID 拡張: rank-1 限界が先行課題

---

## 付録: 生ログ抜粋 (Phase 3.5)

### DEFAULT — Reasoning (崩壊)
```
mitt Ducmittmitt Ducetonetonetonmitt Ducetonmitt Duceton Duc Ducetonetonetonmitt Duc Duc Duc Duc Duc
```

### AGGRESSIVE — List (崩壊)
```
mij mij longer mij mij mij mij mij mij Komm mij mij mij mij mij mij mij mij мij интер mij
```

### CONSERVATIVE — Short QA (非崩壊、非機能)
```
terateraterateraterateraterateraterateraterateraterateraterateraterateraterateratera hers tera
```

### Q4_0-ONLY ⚠️ — Short QA (崩壊、記号混在)
```
`;wo`;`;`;`;wo`;wouo)`,`,)`,)`,)`,uo)`,)`,)`,uouo)`,)`,)`,)`,)`,)`,)`,)`,)`,)`,)`,)`
```

CONSERVATIVE と Q4_0-ONLY (汚染) の崩壊パターンの違いが attn_v/out SVID の影響を示唆する。
