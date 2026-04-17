# ブラウザ向けLLMクライアント: 量子化・圧縮技術調査

最終更新: 2026-04-09

関連文書:
- 実装方針: `vendor/wllama/lowbit-q/IMPLEMENTATION-STRATEGY.md`
- 旧ステータス資料: `vendor/wllama/lowbit-q/Docs/old/STATUS-2026-04-08.md`

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
  旧 `Low-bit-q-STATUS.md` で「OneCompression 忠実実装」と記述しているが、正確には OneBit の SVID アルゴリズムを実装している
- **ブラウザ適合性**: 既に実装済み・動作確認済み

> **重要な訂正**: 旧 `Low-bit-q-STATUS.md` の「OneBit 分解 (SVID — FujitsuResearch/OneCompression)」は
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

## D. WebGPU 推論アクセラレーション

### D1. 当プロジェクトの WebGPU バックエンド (ggml-webgpu)

**現状: 実装済み・ビルド未有効化**

- **所在**: `.wllama-fork/llama.cpp/ggml/src/ggml-webgpu/`
- **実装ファイル**: `ggml-webgpu.cpp` (135KB) + 14 WGSL シェーダ
- **ビルドフラグ**: `GGML_WEBGPU=OFF` (デフォルト無効)
- **Emscripten 依存**: `emdawnwebgpu_pkg` (Dawn WebGPU port for Emscripten)
- **出典**: llama.cpp 本体の実験的 WebGPU バックエンド ([Issue #7773](https://github.com/ggml-org/llama.cpp/issues/7773)、メインラインには未マージ、2026-04 時点)

**サポート済みオペレーション:**

| カテゴリ | オペレーション | WGSL シェーダ |
|---|---|---|
| 行列積 | MUL_MAT | `mul_mat.tmpl.wgsl`, `mul_mat_vec.tmpl.wgsl`, `mul_mat_reg_tile.tmpl.wgsl`, `mul_mat_subgroup_matrix.tmpl.wgsl` |
| Attention | SOFT_MAX, ROPE, SCALE | `soft_max.tmpl.wgsl`, `rope.tmpl.wgsl`, `scale.tmpl.wgsl` |
| 正規化 | RMS_NORM | `rms_norm.wgsl` |
| 活性化 | GLU | `glu.tmpl.wgsl` |
| データ移動 | CPY, GET_ROWS, SET_ROWS | 各シェーダ |
| 算術 | ADD, SUB, MUL, DIV | `bin_op.tmpl.wgsl` |

**MUL_MAT がサポートする量子化型:**
F32, F16, Q4_0, Q4_1, Q5_0, Q5_1, Q8_0, Q2_K, Q3_K, Q4_K, Q5_K, Q6_K,
IQ1_S, IQ1_M, IQ2_XXS, IQ2_XS, IQ2_S, IQ3_XXS, IQ3_S, IQ4_NL, IQ4_XS

> LLM 推論に必要なほぼ全オペレーションが WebGPU シェーダで実装済み。
> 標準量子化型のモデルであれば、ビルドフラグ有効化だけで GPU 推論が動く可能性がある。

**ビルド要件:**
- CMake フラグ: `-DGGML_WEBGPU=ON -DEMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg`
- emsdk 4.0.3 との互換性要検証
- Python 3 (WGSL シェーダ埋め込みスクリプト `embed_wgsl.py`)
- ggml バックエンドレジストリが `GGML_USE_WEBGPU` 定義で自動登録

**lowbit-Q カスタムカーネルとの関係:**
現在の 1-bit sign matmul (`lowbit-q-mul-mat.c`) は `ggml_map_custom3_inplace()` を使用しており、CPU 上でのみ実行される。
WebGPU バックエンド有効化後も、lowbit-Q 1-bit テンソルは CPU フォールバックとなる。
GPU での 1-bit 実行には専用 WGSL シェーダの追加実装が必要。

### D2. web-llm (MLC AI)

- **GitHub**: [mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) (v0.2.82, 2026-04 時点)
- **方式**: Apache TVM / MLC-LLM でコンパイルした WebGPU + WASM カーネル
- **性能**: M3 Max で Llama 3.1 8B (4-bit) 41 tok/s、Phi 3.5 mini 71 tok/s
- **アーキテクチャ**: WASM (トークナイズ、サンプリング、制御) + WebGPU (GEMM、attention、正規化)
- **ブラウザ適合性**: 最も成熟したブラウザ LLM 推論フレームワーク。ただし TVM コンパイル済みモデル形式が前提で、GGUF 直接読み込みは不可
- **参考論文**: [arXiv:2412.15803](https://arxiv.org/abs/2412.15803)

### D3. bitnet.js (WebGPU ネイティブ低ビット推論)

- **GitHub**: [qwatts-dev/bitnet.js](https://github.com/qwatts-dev/bitnet.js), [m96-chan/0xBitNet](https://github.com/m96-chan/0xBitNet)
- **方式**: 純 WebGPU compute shader。WASM 不使用
- **対象**: BitNet b1.58 三値推論。16 三値重みを 1 u32 にパック、ブランチレス WGSL アンパック
- **性能**: M2 Max で BitNet 2B-4T ~5 tok/s
- **GGUF 対応**: HuggingFace から GGUF を直接取得・ブラウザ内パース
- **当プロジェクトとの関係**: lowbit-Q 1-bit WebGPU シェーダの設計に直接参考にできる

### D4. WASM SIMD vs WebGPU 性能比較

| 環境 | TinyLlama-1.1B tok/s | 備考 |
|---|---|---|
| WASM SIMD (CPU) | 2-5 | 現在の wllama |
| WebGPU (離散 GPU) | 25-40 | 10-15x 高速化 |
| WebGPU (統合 GPU) | 10-20 | 推定値、デバイス依存 |

行列積に限定した場合、512×512 以上の行列で WebGPU は WASM SIMD に対して **3-8x の高速化**。
256×256 以下ではオーバーヘッドにより差は縮小。

出典: SitePoint benchmarks (WebGPU vs WebAssembly / Transformers.js)

### D5. WebGPU 仕様制約

| 制約 | デフォルト値 | 影響 |
|---|---|---|
| `maxStorageBufferBindingSize` | 128 MiB | 1B+ パラメータモデルではバッファ分割が必要 |
| `maxBufferSize` | 256 MiB | 大テンソルの分割ロード |
| `maxComputeWorkgroupSizeX/Y` | 256 | GEMM タイリング設計に影響 |
| `maxComputeInvocationsPerWorkgroup` | 256 | ワークグループサイズ上限 |
| `maxComputeWorkgroupStorageSize` | 16 KiB | shared memory タイルサイズ制限 |
| `maxStorageBuffersPerShaderStage` | 8 | multi-pass dispatch が必要になる場合あり |
| Subgroup operations | Origin trial 終了、未安定 | 依存しない設計が必要 |

**ブラウザ対応状況 (2026-04):**
- Chrome: ✅ WebGPU 安定版
- Safari: ⚠️ 限定的対応
- Firefox: ⚠️ Nightly のみ

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

**設計方針: 統一フォーマット先行。**
mixed-bit 重み量子化、KV cache 量子化、回転前処理は全てサイズ削減に寄与する技術であり、
個別に段階拡張するのではなく、これらを包含する統一モデルフォーマット (lowbit-Q v2) を
最初に設計する。フォーマットが確定していれば、カーネルは一度の実装で全機能を扱える。

```
Phase 1: lowbit-Q v2 統一フォーマット設計
  ├─ per-tensor 量子化型 (1-bit SVID / 2-3 bit / Q4_0 / passthrough)
  ├─ KV cache 量子化パラメータ (KIVI: K per-channel, V per-token)
  ├─ 回転前処理メタデータ (適用有無、パラメータ)
  ├─ bitwidth allocator 設定 (サイズ予算、層別配分)
  └─ 将来拡張用 namespace 予約 (activation quantization 等)

Phase 2: 統一変換パイプラインとカーネルの一括実装
  ├─ ブラウザ内変換: allocator → 回転前処理 → テンソル量子化 → KV 設定 → GGUF 書出
  ├─ WASM カーネル: 全量子化型ディスパッチ (1/2/3/4-bit + KV cache)
  ├─ WebGPU シェーダ: 標準型 (ggml 既存) + lowbit-Q 全ビット幅 (新規)
  └─ WebGPU ビルド有効化 (GGML_WEBGPU=ON, emdawnwebgpu_pkg)

Phase 3: 品質検証とチューニング
  ├─ サイズ予算ごとの品質マップ (30%/40%/50%/60%)
  ├─ allocator 設定の最適化
  ├─ KV cache 量子化のコンテキスト長 vs 品質検証
  └─ 回転前処理の効果計測

Phase 4: Activation 量子化 (条件付き)
  ├─ metadata namespace は Phase 1 で予約済み
  └─ オンライン変換コストが見合う場合のみ
```

## 最終判断

元メモの結論は基本的に正しい: **「別アーキテクチャ対応」ではなく「既存 Transformer 資産をブラウザ上でより小さく・長く・安定して回す」ための強化**が優先。

### 根本的な動機: ブラウザのリソース制約

当プロジェクトは HuggingFace 検索 → モデルダウンロード → ブラウザ内変換 → 推論・生成の
**全工程をブラウザ内で完結**させることを前提とする。
バックエンドサーバーや開発者による事前変換済みモデルの配布は範囲外である。

ブラウザのリソース制約 (WASM 4GB, ダウンロードサイズ, OPFS) があるため、
**モデルサイズ削減が最優先課題**であり、カスタム wllama が必要な理由はここにある。

サイズ削減は精度低下を伴うため、精度補償が必要になる。
各技術は「サイズ削減」と「精度補償」の両面を持ち、一体として設計する:

- **mixed-bit**: サイズ削減 (1-4 bit) + 精度補償 (重要テンソルの高精度維持)
- **KV cache 量子化**: メモリ削減 + コンテキスト長伸長
- **回転前処理**: 精度補償 (outlier 軽減) → さらなる低ビット化 (= サイズ削減)
- **WebGPU**: 削減後モデルの実行省力化

### ブラウザ完結制約による除外

- **QAT**: GPU + PyTorch + 勾配降下が必須
- **知識蒸留**: 教師モデル + 学習パイプラインが必須
- **SpinQuant 学習済み回転**: Cayley 最適化に学習が必要

### 検証で変わった点

1. **TurboQuant-Model は存在しない** — activation 量子化に差し替え
2. **KV cache の初手は KIVI** — TurboQuant はブラウザ移植ハードルが想定より高い
3. **BitNet b1.58 は認識すべき** — PTQ とは別軸。bitnet.cpp WASM 移植が進めば将来の選択肢
4. **WebGPU バックエンドが .wllama-fork に存在する** — ビルド有効化で GPU 推論が即時利用可能
5. **統一フォーマット先行** — mixed-bit / KV cache / 回転前処理を個別に段階拡張するのではなく、
   包含する統一フォーマットを先に設計し、カーネルは一度だけ実装する
6. 別アーキテクチャ系は当面保留 (RWKV の WebGPU 動向はウォッチ)

---

## E. KIVI 2-bit KV Cache 量子化 PoC (Phase 4、2026-04-10)

### E1. KIVI 論文概要

**KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache** (ICML 2024)
arXiv: [2402.02750](https://arxiv.org/abs/2402.02750)

- **手法**: KV cache をトークン生成ごとに非対称 2-bit 量子化
  - **Keys (K)**: per-channel (per-column) 量子化 — チャネルごとに scale/zero_point を共有
  - **Values (V)**: per-token (per-row) 量子化 — トークンごとに scale/zero_point を独立設定
- **残差トークン**: 先頭 128 トークンは FP16 で保持 (attention sink 現象への対応)
- **学習不要**: PTQ-only、calibration データ不要
- **対象**: LLaMA 7B/13B での MMLU/GSM8K/HumanEval 品質維持を確認

### E2. Phase 4 PoC 実装

**実装ファイル**: `src/local-llm/lowbit-q/kiviQuantize.ts`  
**テストファイル**: `src/local-llm/lowbit-q/kiviQuantize.test.ts` (14 テスト全パス)

**アルゴリズム** (per-token, attn_v 向け):
```typescript
function quantizeRow2bit(row: Float32Array): { scale, zeroPoint, packed }
// 1. min/max を計算
// 2. scale = (max - min) / 3  (4レベル: 0, 1, 2, 3)
//    zero_point = min
// 3. q = clamp(round((x - zero_point) / scale), 0, 3)
// 4. 4要素/byte にパック (MSB-first, 2bit × 4)
// ストレージ: scale (fp16, 2B) + zero_point (fp16, 2B) + ceil(N/4) bytes
```

**ストレージ形式** (TypeScript PoC、GGUF 埋め込みは Phase 5):
```
Kivi2BitResult {
  rows, cols: number
  scales: Float32Array      // per-row scale (rows entries)
  zeroPoints: Float32Array  // per-row zero_point (rows entries)
  packedData: Uint8Array    // rows × ceil(cols/4) bytes
  totalBytes: number        // = rows*2 + rows*2 + packedData.length
}
```

### E3. 実測 NMSE (Phase 4、2026-04-10)

SmolLM2-1.7B attn_v 次元 (64 rows × 2048 cols) でのランダムテンソル計測:

| 入力分布 | NMSE | 備考 |
|---------|------|------|
| Gaussian N(0,1) | **0.653** | 純粋 2-bit (4レベル) の理論値と一致 |
| Uniform [-1, 1] | **0.333** | レンジ量子化にとって最良のケース |
| Outlier (2%×8x) | **2.604** | 外れ値が scale を支配 → 通常値が単一レベルに集中 |
| Gaussian (per-channel) | **0.449** | 64要素/チャネル (小サンプル数) |

**サイズ計測** (SmolLM2 512×2048 attn_v):
- KIVI 2-bit: **0.252 bytes/elem** (Large: 0.252, Small 8×64: 0.313)
- Q2_K: 0.328 bytes/elem → KIVI は 23% 小さい
- Q4_0: 0.5625 bytes/elem → KIVI は 55% 小さい

### E4. Phase 4 の結論

| 比較軸 | KIVI 2-bit | Q2_K | 優位 |
|--------|-----------|------|------|
| bytes/elem | 0.252 | 0.328 | **KIVI** (サイズ 23% 小) |
| Gaussian NMSE | 0.653 | ~0.116 | **Q2_K** (品質 5.6x 良好) |
| 外れ値耐性 | 低 (NMSE 2.6) | 高 (super-block) | **Q2_K** |
| 学習要否 | 不要 | 不要 | 同等 |
| KV cache 適合 | ◎ (per-token/channel) | △ (weight 向け block) | **KIVI** |

**結論**:
- **KIVI は KV cache 専用**。weight テンソルに適用しても Q2_K に対する品質優位はない
- **size 優位はある**: KV cache の場合、NMSE が高くても attention 演算で平均化されるため問題ない
- Q2_K の品質優位は **super-block 構造** による。純粋 2-bit vs Q2_K の比較は「ビット数」ではなく「ブロック構造」の差
- 外れ値が多い tensors (ffn_down など) への KIVI 適用は FORBIDDEN (NMSE > 2.0)

### E5. Phase 5 への統合パス

```
Phase 5 (C++ 実装予定):
  LowbitQQuantType.KIVI_2BIT_VALUE  // attn_v: per-token 2-bit
  LowbitQQuantType.KIVI_2BIT_KEY    // attn_k: per-channel 2-bit

KV cache 量子化の実装場所:
  llama.cpp attention カーネル内
  GGUF metadata: lowbit-q.kv_cache.key_method = "per_channel_2bit"
                 lowbit-q.kv_cache.value_method = "per_token_2bit"
                 lowbit-q.kv_cache.residual_tokens = 128

C++ prototype path:
  cpp/lowbit-q/kivi-kv-cache.h  // 量子化/逆量子化 inline 関数
  (build_attn フックで KV 書込み時に呼び出し)
```
