# ブラウザ向けLLMクライアント: 量子化・圧縮技術調査

最終更新: 2026-04-09

関連文書:
- 実装方針: `wllama-lowbit-q/IMPLEMENTATION-STRATEGY.md`
- 旧ステータス資料: `wllama-lowbit-q/Docs/old/STATUS-2026-04-08.md`

## 前提

- 独自GGUF相当の形式を持ち、HF検索 → 取得 → 独自形式変換 → 読込までを自前で完結
- llama.cpp 系の追従ではなく、必要なら独自パッチ・独自実装を進める
- 主戦場は **ブラウザ実行** (WASM + WebGPU)
- 現在 OneBit 系 SVID 1-bit 量子化が E2E 動作済み (lowbit-Q パイプライン)
  (旧ステータス資料: `Docs/old/STATUS-2026-04-08.md` 参照)

## 設計原則

ブラウザ向けでは以下の三点が支配的:
1. **モデル本体サイズ** — ダウンロードと OPFS 容量
2. **KV キャッシュ肥大** — WebAssembly メモリ上限 (4GB)
3. **デコード経路の複雑化** — WASM では GPU カーネルのような自由度がない

したがって **変換時に重い処理を押し込み、実行時を単純化できる技術** の優先度が高い。

---

## A. 重み圧縮

### A1. OneCompression / OneComp (Fujitsu)

**現状: 導入済み (SVID 1-bit)**

- **論文**: "OneComp: One-Line Revolution for Generative AI Model Compression"
  - Yuma Ichikawa et al. (Fujitsu)
  - arXiv: [2603.28845](https://arxiv.org/abs/2603.28845) (2026-03-30)
- **GitHub**: [FujitsuResearch/OneCompression](https://github.com/FujitsuResearch/OneCompression) (v1.0.2, 2026-03)
- **内容**:
  - PTQ フレームワーク。layer-wise / block-wise / global PTQ + QLoRA fine-tuning をパイプライン化
  - **AutoBit**: 利用可能メモリ制約下で層ごとの bitwidth を自動割当 (混合精度)
  - **Rotation Preprocessing**: SpinQuant / OSTQuant ベースの回転前処理で outlier 軽減
  - **JointQ**: 重み割当とスケールパラメータの同時最適化
  - **QEP** (Quantization Error Propagation): 層間の量子化誤差伝搬を補正
- **当プロジェクトでの利用**:
  - SVID 分解 (`W ≈ diag(a) * Sign(W) * diag(b)`) を TypeScript で忠実実装済み
  - ただし SVID 1-bit 分解の出典は OneComp ではなく **OneBit** (下記 A6 参照)
  - OneComp の価値は AutoBit (混合精度割当) と rotation preprocessing にある
- **注意**: OneComp 自体は 2/3/4-bit の混合精度 PTQ パイプラインであり、1-bit を直接サポートしていない
- AutoBit は OneComp フレームワーク内の一機能。独立した別論文「AutoBit」は存在しない

> **訂正**: 元メモで「AutoBit」を独立した概念のように記述していたが、
> これは OneComp フレームワーク内の一機能。外部論文としての "AutoBit" は見つからなかった。
> また元メモで「1bit を含む PTQ 群」と記述していたが、OneComp は 1-bit をサポートしない。
> 1-bit (SVID) は OneBit が出典。

### A2. QuaRot (ETH Zurich)

- **論文**: "QuaRot: Outlier-Free 4-Bit Inference in Rotated LLMs"
  - Saleh Ashkboos et al. (ETH Zurich / SPCL)
  - arXiv: [2404.00456](https://arxiv.org/abs/2404.00456) (2024-04)
  - **NeurIPS 2024** 採択
- **GitHub**: [spcl/QuaRot](https://github.com/spcl/QuaRot)
- **内容**:
  - ランダム Hadamard 回転で hidden state の outlier を除去し、weights / activations / KV cache を end-to-end 4-bit 化
  - LLaMA-2-70B で WikiText-2 perplexity 劣化 0.47 以内、zero-shot 性能 99% 維持
  - LLaMA-2-7B で prefill 2.16x 高速化、decode メモリ 3.39x 削減
- **ブラウザ適合性**: Hadamard 回転は変換時に weight に吸収可能で、実行時コストが小さい。ただし activation 量子化にはオンライン Hadamard が必要で、WASM では実装コストあり

### A3. SpinQuant (Meta)

- **論文**: "SpinQuant: LLM Quantization with Learned Rotations"
  - Zechun Liu et al. (Meta / Facebook Research)
  - arXiv: [2405.16406](https://arxiv.org/abs/2405.16406) (2024-05)
- **GitHub**: [facebookresearch/SpinQuant](https://github.com/facebookresearch/SpinQuant)
- **内容**:
  - QuaRot のランダム回転を **学習済み回転行列** (Cayley 最適化) に置き換え
  - ランダム回転間で最大 13 点の精度差があることを実証
  - W4A4KV4 で LLaMA-2-7B の精度ギャップを 2.9 点に縮小 (SmoothQuant 比 25 点改善)
- **ブラウザ適合性**: 回転行列は変換時に計算・吸収するため、実行時追加コストなし。OneComp の rotation preprocessing が SpinQuant ベース

### A4. OSTQuant (ICLR 2025)

- **論文**: "OSTQuant: Refining Large Language Model Quantization with Orthogonal and Scaling Transformations for Better Distribution Fitting"
  - arXiv: [2501.13987](https://arxiv.org/abs/2501.13987) (2025-01)
  - **ICLR 2025** 採択: [OpenReview](https://openreview.net/forum?id=rAcgDBdKnP)
- **GitHub**: 公開リポジトリなし
- **内容**:
  - 直交変換 + スケーリング変換の組み合わせで weight/activation 分布を最適化
  - QSUR (Quantization Space Utilization Rate) メトリクスを提案
  - W4A4KV4 で LLaMA-3-8B の性能ギャップを SOTA 比 32% 削減
- **ブラウザ適合性**: OneComp がこの系列の前処理を内蔵しているため、直接的な個別実装は不要

> **訂正**: 元メモで "OstQuant" と表記していたが、正式名称は **OSTQuant** (大文字)

### A5. OneBit (1-bit Weight Quantization via SVID)

- **論文**: "OneBit: Towards Extremely Low-bit Large Language Models"
  - Yuzhuang Xu, Xu Han, Zonghan Yang et al.
  - arXiv: [2402.11295](https://arxiv.org/abs/2402.11295) (2024-02)
- **内容**:
  - SVID (Sign-Value Independent Decomposition) による 1-bit 重み量子化
  - `W ≈ diag(a) * Sign(W) * diag(b)` — rank-1 SVD ベースのスケール推定
  - W2A16 設定で他手法を上回る性能
- **当プロジェクトとの関係**: **これが現在の `src/local-llm/lowbit-q/` (旧 `onebit/`) の直接の出典**。
  旧 `STATUS.md` で「OneCompression 忠実実装」と記述しているが、正確には OneBit の SVID アルゴリズムを実装している
- **ブラウザ適合性**: 既に実装済み・動作確認済み

> **重要な訂正**: 旧 `STATUS.md` の「OneBit 分解 (SVID — FujitsuResearch/OneCompression)」は
> 不正確。SVID は OneBit 論文の手法であり、OneCompression (OneComp) とは別の研究。
> OneComp リポジトリに SVID の実装が含まれている可能性はあるが、手法の出典は OneBit。

### A6. BitNet b1.58 (Microsoft)

- **論文**: "The Era of 1-bit LLMs"
  - Microsoft Research
  - arXiv: [2402.17764](https://arxiv.org/abs/2402.17764) (2024-02)
- **GitHub**: [microsoft/BitNet](https://github.com/microsoft/BitNet)
- **モデル**: [microsoft/bitnet-b1.58-2B-4T](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T) (2025-04)
- **内容**:
  - 重みを {-1, 0, +1} の三値 (1.58-bit) に制約して **ネイティブ学習**
  - 2B パラメータ / 4T トークン学習済みモデル公開
  - CPU 推論で 2.37x-6.17x 高速化、エネルギー 71-82% 削減
  - 2026-01: CPU最適化で追加 1.15-2.1x 高速化。NPU対応予定
- **ブラウザ適合性**: bitnet.cpp 専用カーネルが必要で、WASM 移植は大きな工数。ただし三値行列演算は理論上 WASM SIMD と相性が良い
- **OneCompression との関係**: 直接の関係なし。BitNet はネイティブ学習、OneComp/SVID は PTQ

> **追記**: 元メモでは BitNet への言及がなかったが、1-bit 量子化を扱う以上、最も成熟した
> ネイティブ 1-bit モデルとして認識すべき。ただし PTQ ではなく学習時量子化のため、
> 既存モデルの変換パイプラインという文脈では直接競合しない

---

## B. KV キャッシュ圧縮

### B1. TurboQuant (Google Research)

- **論文**: "TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate"
  - Google Research
  - arXiv: [2504.19874](https://arxiv.org/abs/2504.19874) (2025-04)
  - **ICLR 2026** 採択
- **GitHub**: 公式実装なし。コミュニティ実装:
  - [0xSero/turboquant](https://github.com/0xSero/turboquant) (Triton + vLLM)
  - [sharpner/turboquant-mlx](https://github.com/sharpner/turboquant-mlx) (Apple MLX)
- **内容**:
  - ランダム回転で入力ベクトルに Beta 分布を誘導 → 座標別最適スカラー量子化 → 残差に 1-bit QJL 変換
  - KV cache を 3-bit (keys) / 2-bit (values) まで圧縮、精度低下なし
  - H100 で attention logits 計算 8x 高速化、KV メモリ 6x 削減
  - **学習不要** (training-free)
  - Gemma / Mistral で LongBench, Needle-in-Haystack, RULER 等を検証
- **ブラウザ適合性**:
  - 理論は筋が良いが、PolarQuant 変換にカスタムカーネルが必要
  - packed integer のデコード経路が WASM では複雑化する懸念
  - 2026-04 時点で主要推論フレームワーク (llama.cpp 含む) に未統合

> **訂正**: 元メモで「Google の説明では実装オーバーヘッドも小さい」としていたが、
> 実際には PolarQuant 変換のカスタム CUDA カーネルが必要で、ブラウザ移植のハードルは高い。
> また「3-bit 級まで KV cache を圧縮」は正確には Keys 3-bit / Values 2-bit の非対称構成

### B2. KIVI (ICML 2024)

- **論文**: "KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache"
  - arXiv: [2402.02750](https://arxiv.org/abs/2402.02750) (2024-02)
  - **ICML 2024** 採択
- **GitHub**: [jy-yuan/KIVI](https://github.com/jy-yuan/KIVI)
- **内容**:
  - Key は per-channel、Value は per-token で 2-bit 量子化 (非対称)
  - プラグアンドプレイ、fine-tuning 不要
  - ピークメモリ 2.6x 削減、スループット 2.35-3.47x 向上
- **ブラウザ適合性**: 実装がシンプルで WASM 移植しやすい。TurboQuant の前段階として最適

### B3. KVQuant (NeurIPS 2024)

- **論文**: "KVQuant: Towards 10 Million Context Length LLM Inference with KV Cache Quantization"
  - arXiv: [2401.18079](https://arxiv.org/abs/2401.18079) (2024-01)
  - **NeurIPS 2024** 採択
- **GitHub**: [SqueezeAILab/KVQuant](https://github.com/SqueezeAILab/KVQuant)
- **内容**:
  - Per-channel key quantization, Pre-RoPE key quantization, non-uniform quantization, dense-and-sparse quantization
  - LLaMA-7B で 1M コンテキスト長を A100 1枚で実現
  - KIVI 比 1.5x 小さい bitwidth で同等精度
- **ブラウザ適合性**: non-uniform quantization のデコードが重い可能性。KIVI の方がシンプルで初手向き

### B4. GEAR (2024)

- **論文**: "GEAR: An Efficient KV Cache Compression Recipe for Near-Lossless Generative Inference of LLM"
  - Hao Kang et al.
  - arXiv: [2403.05527](https://arxiv.org/abs/2403.05527) (2024-03)
- **GitHub**: [opengear-project/GEAR](https://github.com/opengear-project/GEAR)
- **内容**:
  - 大部分を ultra-low precision 量子化 + 低ランク行列で量子化誤差近似 + sparse 行列で outlier 補正
  - Near-lossless 4-bit KV 圧縮、スループット 2.38x、ピークメモリ 2.29x 削減
- **ブラウザ適合性**: 低ランク + sparse の組み合わせは実装が複雑。ブラウザ初手としては重い

---

## C. 別アーキテクチャ

### C1. RWKV

- **最新バージョン**: RWKV-7 "Goose"
- **GitHub**: [BlinkDL/RWKV-LM](https://github.com/BlinkDL/RWKV-LM)
- **ブラウザ実装**: [cryscan/web-rwkv](https://github.com/cryscan/web-rwkv) (WebGPU/Rust, V4-V7対応, int8/fp4 量子化対応)
  - ライブデモ: [web-rwkv-realweb](https://cryscan.github.io/web-rwkv-realweb/)
- **特徴**:
  - 100% RNN、KV cache なし、定数メモリ、線形時間推論
  - int8 14B パラメータモデルが 3GB VRAM で動作
- **ブラウザ適合性**: WebGPU 実装が既に存在する点は注目に値する。ただし Transformer 互換ではなく、別ランタイムが必要

### C2. PHOTON (Fujitsu / RIKEN)

- **論文**: "PHOTON: Hierarchical Autoregressive Modeling for Lightspeed and Memory-Efficient Language Generation"
  - Yuma Ichikawa et al. (Fujitsu / RIKEN)
  - arXiv: [2512.20687](https://arxiv.org/abs/2512.20687) (2025-12)
- **内容**:
  - 階層的潜在ストリーム: bottom-up encoder がトークンを低レート状態に圧縮、top-down decoder が並列復元
  - decode 時の KV cache 通信を削減、メモリ単位あたりスループット最大 10^3 倍
  - 主眼は **デコードスループットとメモリ効率** (長文コンテキスト保持が一次目的ではない)
- **ブラウザ適合性**: 理論は面白いが、エコシステム未成熟。OneComp と同じ Fujitsu チーム (Ichikawa et al.) の研究

> **訂正**: 元メモの「階層自己回帰で長文保持の構造を変える」は不正確。
> PHOTON の主目的はデコード速度とメモリ効率であり、長文コンテキスト保持は副次的効果。
> 「製品実装優先度は低い」の判断は妥当

### C3. Titans (Google Research)

- **論文**: "Titans: Learning to Memorize at Test Time"
  - Ali Behrouz, Peilin Zhong, Vahab Mirrokni (Google Research)
  - arXiv: [2501.00663](https://arxiv.org/abs/2501.00663) (2024-12)
- **GitHub**: [lucidrains/titans-pytorch](https://github.com/lucidrains/titans-pytorch) (非公式)
- **内容**:
  - Core (短期記憶 = 限定窓 attention) + Long-term Memory (テスト時学習型ニューラル記憶) + Persistent Memory (タスク知識パラメータ)
  - 2M+ コンテキスト窓でTransformer / linear recurrent モデルを上回る
- **ブラウザ適合性**: 研究段階。推論フレームワーク統合なし

### C4. Mamba / State Space Models

- **最新**: Mamba-3 (2026)
  - arXiv: Mamba-1 [2312.00752](https://arxiv.org/abs/2312.00752) (2023-12)
- **GitHub**: [state-spaces/mamba](https://github.com/state-spaces/mamba)
- **内容**: 選択的状態空間モデル。Transformer 比 5x 高スループット、線形時間推論
- **ブラウザ適合性**: WASM/ブラウザ実装は見つからず。カスタムカーネル (selective scan) が必要

### C5. xLSTM

- **論文**: "xLSTM: Extended Long Short-Term Memory"
  - Maximilian Beck et al.
  - arXiv: [2405.04517](https://arxiv.org/abs/2405.04517) (2024-05)
  - xLSTM 7B: [2503.13427](https://arxiv.org/abs/2503.13427) (2025-03)
  - Scaling Laws: [2510.02228](https://arxiv.org/abs/2510.02228) (**ICLR 2026** 採択)
- **内容**: 拡張 LSTM、線形時間推論、7B モデルで LLaMA/Mamba 系と同等性能
- **ブラウザ適合性**: ブラウザ実装なし。RNN 系のため理論上は KV cache 不要だが、カスタムオペレータが必要

---

## 検証結果と訂正事項

元メモからの主な訂正・補足:

| 項目 | 元メモの記述 | 検証結果 |
|------|------------|---------|
| OneCompression と SVID | 「OneCompression 忠実実装」 | SVID は OneBit (arXiv:2402.11295) の手法。OneComp とは別研究 |
| OneComp と 1-bit | 「1bit を含む PTQ 群」 | OneComp は 2/3/4-bit 混合精度。1-bit は非サポート |
| AutoBit | 独立概念のように記述 | OneComp フレームワーク内の一機能。独立論文なし |
| OstQuant | 小文字表記 | 正式名称は **OSTQuant** |
| TurboQuant | 「実装オーバーヘッドも小さい」 | カスタム CUDA カーネル必要。ブラウザ移植ハードルは高い |
| TurboQuant | 「3-bit 級」 | Keys 3-bit / Values 2-bit の非対称構成 |
| TurboQuant-Model | 「TurboQuant の思想を重み側へ持ち込む系」 | TurboQuant は KV cache 専用。重み版は存在しない |
| BitNet | 言及なし | 1-bit 量子化で最も成熟したプロジェクト。ただし PTQ ではなくネイティブ学習 |
| RWKV ブラウザ | 「別ランタイム対応に近い」 | WebGPU 実装 (web-rwkv) が既に存在 |
| PHOTON 著者 | 言及なし | OneComp と同じ Fujitsu チーム (Ichikawa et al.) |

---

## 再評価: 実装優先度

元メモのロードマップを検証結果に基づき再評価する。

### 第1段階: 混合ビット幅量子化 [優先度: 最高] -- 元メモと同意

**評価変更なし。** OneComp の AutoBit がそのまま使える。

- 効果: 高い
- 実装難易度: 低〜中
- 根拠: 現在の SVID 1-bit 実装 (lowbit-Q パイプライン) の品質問題 (NMSE 0.5-0.7) を、層別に 1/2/3/4-bit を振り分けることで直接解決できる。変換パイプラインは既にあり、bitwidth metadata を GGUF に追加するだけ
- 参照: OneComp AutoBit ([arXiv:2603.28845](https://arxiv.org/abs/2603.28845))

### 第2段階: KV cache 量子化 [優先度: 高] -- 元メモと同意、ただし手法推奨を変更

**変更点**: TurboQuant は「段階導入」ではなく、中期候補に格下げ。**初手は KIVI**。

- 効果: 高い (特に長文時)
- 実装難易度: 低 (KIVI) 〜 高 (TurboQuant)
- 根拠:
  - KIVI は per-channel/per-token の単純な非対称量子化で、WASM 実装が容易
  - TurboQuant は PolarQuant カーネルが必要で、ブラウザ移植のハードルが想定より高い
  - llama.cpp 本体にも TurboQuant 未統合 (2026-04 時点)
- 推奨順序: KIVI → 必要なら KVQuant の一部手法 → TurboQuant は llama.cpp 統合後に検討
- 参照: KIVI ([arXiv:2402.02750](https://arxiv.org/abs/2402.02750)), TurboQuant ([arXiv:2504.19874](https://arxiv.org/abs/2504.19874))

### 第3段階: 回転前処理による低ビット安定化 [優先度: 高] -- 元メモと同意

**評価変更なし。** OneComp が SpinQuant/OSTQuant ベースの回転前処理を内蔵。

- 効果: 高い
- 実装難易度: 中
- 根拠: QuaRot/SpinQuant の回転行列を変換時に weight に吸収すれば、実行時追加コストゼロ。3-4 bit の品質安定化に直結
- 参照: QuaRot ([arXiv:2404.00456](https://arxiv.org/abs/2404.00456)), SpinQuant ([arXiv:2405.16406](https://arxiv.org/abs/2405.16406)), OSTQuant ([arXiv:2501.13987](https://arxiv.org/abs/2501.13987))

### 第4段階: Activation 量子化 (W4A8 → W4A4) [優先度: 低]

**変更点**: 元メモの「TurboQuant-Model」を削除し、activation 量子化に一本化。

- 効果: 中
- 実装難易度: 高
- 根拠:
  - **「TurboQuant-Model」は存在しない**。TurboQuant は KV cache 専用技術であり、重み圧縮版は提案されていない
  - Activation 量子化は QuaRot が W4A4 まで対応しているが、オンライン Hadamard 変換が WASM では重い
  - まずは weight-only → KV → W4A8 の順が妥当。A4 は後回し

### 保留: 別アーキテクチャ -- 元メモと同意

- RWKV: web-rwkv (WebGPU) が存在する点は要ウォッチ。ただし Transformer 互換ではないため別プロジェクト扱い
- PHOTON / Titans / Mamba / xLSTM: 研究段階。将来の観察対象

---

## 確定ロードマップ

```
Phase 1: 混合ビット幅量子化
  ├─ GGUF に layer/block ごとの quant type metadata を追加
  ├─ OneComp AutoBit の考え方で 1/2/3/4-bit を層別に振り分け
  └─ 現在の SVID 1-bit の品質問題を直接解決

Phase 2: KV cache 量子化
  ├─ KIVI 方式 (K: per-channel, V: per-token, 2-bit) から開始
  ├─ K/V 別精度、古いトークンの低精度化を段階導入
  └─ TurboQuant は llama.cpp 統合状況を見て判断

Phase 3: 回転前処理
  ├─ OneComp の rotation preprocessing を変換器に統合
  ├─ SpinQuant/OSTQuant ベースの回転行列を weight に吸収
  └─ W4A8 安定化を狙う

Phase 4: Activation 量子化 (条件付き)
  ├─ W4A8 → W4A4 の段階的導入
  └─ WASM でのオンライン Hadamard コストが見合う場合のみ
```

## 最終判断

元メモの結論は基本的に正しい: **「別アーキテクチャ対応」ではなく「既存 Transformer 資産をブラウザ上でより小さく・長く・安定して回す」ための強化**が優先。

検証で変わった点:
1. **TurboQuant-Model は存在しない** — 第4段階を activation 量子化に差し替え
2. **KV cache の初手は KIVI** — TurboQuant はブラウザ移植ハードルが想定より高い
3. **BitNet b1.58 は認識すべき** — ただし PTQ パイプラインとは別軸。将来的に bitnet.cpp の WASM 移植が進めばネイティブ 1-bit モデルの直接実行も選択肢に入る

優先順位:
1. 混合ビット幅量子化 (OneComp AutoBit)
2. KV cache 量子化 (KIVI → 段階的拡張)
3. 回転前処理 (SpinQuant/OSTQuant via OneComp)
4. Activation 量子化 (条件付き)
5. 別アーキテクチャ系は当面保留 (RWKV の WebGPU 動向はウォッチ)
