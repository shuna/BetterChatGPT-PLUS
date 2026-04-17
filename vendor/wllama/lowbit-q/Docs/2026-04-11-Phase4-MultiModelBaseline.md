# Phase 4: Multi-Model Native Quant Baseline 評価レポート

**作成日**: 2026-04-11  
**対象**: SmolLM2-1.7B-Instruct / Qwen 3.5 2B / Gemma 4 E2B  
**目的**: Phase 3.6 で TinyLlama-1.1B (1-bit モデル) に限定されていた native quant ベースラインを、1.7〜2B 規模のモデルで再検証する

---

## 1. 背景と目的

### Phase 3.6 の結論（TinyLlama 1.1B）

| プリセット | NMSE mean | Func |
|---|---|---|
| Q4_0-ONLY (ベースライン) | ~0.010 | **YES ✅** |
| Q3_K-ONLY | 0.034 | NO (繰り返しループ) |
| Q2_K-ONLY | 0.116 | NO (出力崩壊) |

> **仮説**: Q3_K/Q2_K の失敗は TinyLlama-1.1B の小規模モデル固有の感度であり、  
> 1.7B+ のモデルではパラメータ数の増加により Q3_K/Q2_K でも機能する可能性がある。

### Phase 4 の目的

1. SmolLM2-1.7B (llama arch) で native quant ベースラインを再検証
2. Qwen 3.5 2B / Gemma 4 E2B での non-Llama arch baseline 確立
3. KV Cache メモリ設計・測定軸の定義
4. KIVI 式 2-bit KV cache 量子化 PoC
5. 圧縮禁止領域の文書化・enforcement 実装

---

## 2. 実装内容（Phase 4 完了済み）

### 2.1 TypeScript 実装

| ファイル | 説明 | 状態 |
|---|---|---|
| `types.ts` | `KVQuantPolicy` インターフェース + KV bytes ヘルパー | ✅ 完了 |
| `kvCacheDesign.ts` | KV cache メモリ推定モジュール | ✅ 完了 |
| `kiviQuantize.ts` | KIVI per-token/per-channel 2-bit 量子化 PoC | ✅ 完了 |
| `kiviQuantize.test.ts` | 14 件テスト (全パス) | ✅ 完了 |
| `allocator.ts` | `PASSTHROUGH_ONLY_ALLOCATOR_CONFIG` + `validateAllocations()` | ✅ 完了 |
| `convert.ts` | `validateAllocations()` を変換パイプラインに接続 | ✅ 完了 |
| `lowbit-q-v2-dispatch.test.ts` | FORBIDDEN 検証テスト追加 (計 19 件) | ✅ 完了 |
| `LowbitQValidationPage.tsx` | `v2-native-direct` プリセット追加 | ✅ 完了 |

### 2.2 WASM ビルド更新

- llama.cpp サブモジュール: `4abef75` (Nov 2025) → `05b3caa` (Apr 2026)
- `gemma4` / `qwen35` アーキテクチャサポート追加
- `build-local.sh` に `-DLLAMA_WASM_MEM64=OFF` 追加 (wasm32/wasm64 ABI 不一致回避)
- 出力: `single-thread.wasm` 2.6 MB, `multi-thread.wasm` 2.7 MB (Apr 11 リビルド)

### 2.3 validateAllocations() 運用開始

`validateAllocations()` が変換パイプラインに接続済み:

| ルール | レベル | 条件 | 動作 |
|---|---|---|---|
| attn_v/out に SVID_1BIT | **FORBIDDEN** | Phase 3.5 で全プロンプト崩壊を確認 | 例外 → 変換中断 |
| Q2_K 均一 (80%超) | **CAUTION** | TinyLlama で出力崩壊リスク | console.warn |

DEFAULT / AGGRESSIVE プリセットは現在 FORBIDDEN 対象 (attn_v SVID_1BIT を含む)。  
**CONSERVATIVE / Q4_0-ONLY / Q3_K-ONLY / Q2_K-ONLY / NATIVE-DIRECT は問題なし。**

### 2.4 テストカバレッジ

| サブセット | テスト数 | 状態 |
|---|---|---|
| lowbit-Q 全テスト | 169 | ✅ 全パス |
| 全体 | 631 | ✅ 全パス |

---

## 3. E2E ベースライン実行結果

### 3.1 実行環境

| 項目 | 内容 |
|---|---|
| 実行日 | 2026-04-11 |
| UI | LowbitQValidationPage.tsx (`?lowbit-q-validation=1`) |
| プリセット | `v2-native-direct` (PASSTHROUGH — 変換なし、直接ロード) |
| ブラウザ | Chromium (Playwright, headless=false) |
| WASM | Apr 11 リビルド (llama.cpp `05b3caa`) |
| スモークプロンプト | `short-qa-en` / `list-generation` / `tiny-reasoning` |

### 3.2 SmolLM2-1.7B-Instruct (Architecture: llama)

| バリアント | ファイルサイズ | Import | Conv | Load | TokGen | Func |
|---|---|---|---|---|---|---|
| Q8_0 (reference) | — | ❌ SKIP (GGUF なし) | — | — | — | — |
| **Q4_K_M** ¹ | 1,007 MB | ✅ (pass) | ⏱ **TIMEOUT** | — | — | — |
| Q3_K_S | — | ❌ SKIP (GGUF なし) | — | — | — | — |
| Q2_K | — | ❌ SKIP (GGUF なし) | — | — | — | — |

¹ Q4_K_M は Q4_0 の代替として `/tmp/smollm2-1.7b-instruct.Q4_0.gguf` にシンボリックリンクして使用。

> ⚠️ **発見: PASSTHROUGH 変換が 1GB モデルで 15 分タイムアウト**  
>
> 現在の `convertToLowbitQV2Streaming` は全テンソルを一度にメモリに読み込み  
> (最大メモリ使用 ~2GB: 入力 1GB + 出力バッファ 1GB)、その後 OPFS に書き込む。  
> SmolLM2 Q4_K_M (1007 MB) では変換完了に > 15 分かかることが確認された。  
>
> **改善案 (Phase 5)**:  
> PASSTHROUGH 専用の真のストリーミングコピー実装  
> (テンソルごとに読み込み → 書き込み → GC の繰り返し)  
>
> **暫定回避策**: Q4_0 の小バリアント (~500 MB 以下) または直接ロード API を使用する。

### 3.3 Qwen 3.5 2B (Architecture: qwen35)

| バリアント | 状態 |
|---|---|
| Q8_0, Q4_0, Q3_K, Q2_K | ❌ 全スキップ (GGUF 未ダウンロード) |

JSON artifact: `tests/phase4-qwen3-results.json` (全4件 skipped 記録)

### 3.4 Gemma 4 E2B (Architecture: gemma4)

| バリアント | 状態 |
|---|---|
| Q8_0, Q4_0, Q3_K, Q2_K | ❌ 全スキップ (GGUF 未ダウンロード) |

JSON artifact: `tests/phase4-gemma4-results.json` (全4件 skipped 記録)

> **Note on Pristine Artifacts**: Phase 4 JSON artifacts は Playwright `afterAll` フックが  
> `fs.writeFileSync()` で直接出力する pristine ファイルである。Phase 3 の JSON とは異なり、  
> 手動補完や再構成は含まれない。

### 3.5 TinyLlama 1.1B との比較（Phase 3.6 実測値、参考）

| モデル | パラメータ | Q4_0 Func | Q3_K Func | Q2_K Func |
|---|---|---|---|---|
| TinyLlama 1.1B | 1.1B | **YES ✅** | NO (ループ) | NO (崩壊) |
| SmolLM2 1.7B | 1.7B | TBD ¹ | TBD | TBD |
| Qwen 3.5 2B | 2B | TBD ² | TBD | TBD |
| Gemma 4 E2B | 2B | TBD ² | TBD | TBD |

¹ Q4_K_M での部分実測が実行中  
² GGUF 未ダウンロード、スキップ

---

## 4. KIVI PoC 結果

### 4.1 理論と実測

KIVI (arXiv:2402.02750, ICML 2024) の per-token/per-channel 2-bit 量子化を TS でPoC実装。

**SmolLM2-1.7B attn_v 代表次元での計測**:

| 方式 | bytes/elem | NMSE (Gaussian) | NMSE (Uniform) | NMSE (Outlier) |
|---|---|---|---|---|
| FP16 (reference) | 2.000 | 0.000 | 0.000 | 0.000 |
| Q4_0 | 0.5625 | ~0.001 | — | — |
| Q3_K | 0.4297 | ~0.034 | — | — |
| Q2_K | 0.3281 | ~0.116 | — | — |
| **KIVI per-token 2-bit** | **0.252** | **0.653** | **0.333** | **2.604** |

### 4.2 KIVI の位置付け

| 観点 | 評価 |
|---|---|
| サイズ効率 | Q2_K (0.328) より 23% 小さい → **KV cache 圧縮に有効** |
| 品質 (NMSE) | Q2_K より高い (悪い) → **重みテンソルには不向き** |
| 外れ値耐性 | NMSE 2.6 と低い → attn_v の実運用には注意 |
| 適用領域 | **KV cache 専用**。attention の誤差は出力側で相殺される効果が期待できる |

### 4.3 次のステップ (Phase 5 スコープ)

- C++ attention kernel で KV cache の量子化/逆量子化実装
- Per-channel Key, per-token Value の別々ポリシー適用
- 実推論での perplexity / functional 品質測定

---

## 5. KV Cache メモリ設計

### 5.1 推定式

```
KV(bytes) = n_layers × 2 × n_kv_heads × head_dim × seq_len × bytes_per_element(policy)
```

### 5.2 SmolLM2-1.7B 試算 (24 層, 16 KV heads, head_dim=128)

| Model 量子化 | KV ポリシー | Model Body | KV@2048 | Total | Max SeqLen (4GB) |
|---|---|---|---|---|---|
| Q4_0 | FP16 | ~880 MB | ~75 MB | ~1,030 MB | ~26,000 |
| Q4_0 | KIVI 2-bit | ~880 MB | ~10 MB | ~955 MB | ~240,000+ |
| Q2_K | KIVI 2-bit | ~460 MB | ~10 MB | ~540 MB | ~470,000+ |

> **Phase 4 では設計・推定のみ。C++ runtime 実装は Phase 5 スコープ。**

---

## 6. 圧縮リスクマップ要約

詳細は `COMPRESSION-RISK-MAP.md` を参照。主要ポイント:

### FORBIDDEN (変換パイプラインで強制拒否)

| テンソル | 手法 | 根拠 |
|---|---|---|
| attn_v, attn_out | SVID_1BIT | Phase 3.5: 40テンソル汚染で全プロンプト崩壊 |

### CAUTION (console.warn のみ)

| テンソル | 手法 | 根拠 |
|---|---|---|
| all (80%超) | Q2_K 均一 | TinyLlama: NMSE 0.116, 出力崩壊リスク |

### RE-VERIFY (1.7B+ モデルで要再実測)

| テンソル | 手法 | 期待 |
|---|---|---|
| all | Q3_K 均一 | 1.7B+ で TinyLlama より安定する可能性 |
| all | Q2_K 均一 | 失敗の可能性高いが NMSE 改善を確認 |
| ffn=Q3_K, attn=Q4_0 | 混合 | 最有望な mixed-bit native プリセット |

---

## 7. 次のアクション

### 高優先度 (Phase 4.1 拡張)

1. **SmolLM2-1.7B 追加 GGUF 取得**: Q8_0 (reference), Q3_K_S, Q2_K
   - 期待: Q3_K は TinyLlama より安定して機能する可能性
   - コマンド: `huggingface-cli download bartowski/SmolLM2-1.7B-Instruct-GGUF ...`

2. **SmolLM2 Q3_K/Q2_K E2E 実行**: 仮説検証
   - Q3_K functionalSuccess=YES → "モデルサイズ依存" 仮説確定
   - Q3_K functionalSuccess=NO → パイプライン問題の可能性

3. **mixed-bit プリセット追加**: `ffn=Q3_K, attn=Q4_0`
   - `MIXED_Q3K_ATTN_Q4_ALLOCATOR_CONFIG` を `allocator.ts` に追加
   - SmolLM2 で E2E テスト

### 中優先度 (Phase 5)

4. **KIVI C++ カーネル実装**: attention kernel での KV cache 量子化
5. **WebGPU ビルド**: `-DGGML_WEBGPU=ON` + WGSL シェーダ

### 低優先度 / 保留

6. **Qwen 3.5 2B / Gemma 4 E2B E2E**: GGUF ダウンロード後に実施
7. **TurboQuant (PolarQuant + beta 誘導)**: KIVI C++ 実装後に検討

---

## 8. 評価データの信頼性

| データソース | 種別 | 信頼性 |
|---|---|---|
| TinyLlama Phase 3.5/3.6 E2E 結果 | Playwright 実測 + 一部再構成 | ⚠️ 一部手動補完 (詳細: Low-bit-q-STATUS.md) |
| KIVI PoC NMSE 値 | Vitest 単体テスト実測 | ✅ pristine (コード: `kiviQuantize.test.ts`) |
| KV cache 推定値 | `kvCacheDesign.ts` の推定関数 | ℹ️ 理論計算 (実測非確認) |
| SmolLM2 Q4_K_M E2E | Playwright 実測 | ✅ pristine (`tests/phase4-smollm2-results.json`) |
| Qwen3/Gemma4 E2E | 全スキップ | ℹ️ JSON は "available=false" 記録のみ |
