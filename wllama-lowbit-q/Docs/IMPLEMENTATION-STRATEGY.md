# wllama-lowbit-q 実装方針

最終更新: 2026-04-12

## この文書の位置づけ

この文書は、`wllama-lowbit-q/TECH-SURVEY.md` の調査結果をもとに、
当プロジェクトで今後どのように OneBit / OneCompression 系の知見を
参照し、実装へ取り込むかを定義するための方針書である。

調査の根拠と技術比較は `TECH-SURVEY.md` を参照すること。

## 用語整理

当プロジェクトでは、以下を明確に区別して記述する。

- **OneBit**: SVID (Sign-Value Independent Decomposition) による 1-bit 重み量子化の原典
- **OneCompression / OneComp**: 複数の低ビット PTQ 手法と精度改善技術を束ねたフレームワーク
- **当プロジェクトの現状実装**: OneBit 系の SVID を実装しているが、実装上の参照先として
  FujitsuResearch/OneCompression 内の onebit 実装も参照している
- **旧実装名としての `onebit` / `1bit`**: このリポジトリで historically 使ってきた
  旧ディレクトリ名・旧型名・旧変数名・旧 UI 名であり、論文名としての `OneBit` とは別物。
  現在は `lowbit-Q` にリネーム済み

したがって、今後の記述ルールは次の通りとする。

- SVID の**原典**を説明するときは `OneBit (arXiv:2402.11295)` と書く
- 実装の**参照元**を説明するときは `FujitsuResearch/OneCompression の onebit 実装参照` と書く
- OneCompression を説明するときは、`1-bit 専用手法` ではなく
  `低ビット量子化フレームワーク` と書く
- リポジトリ内の旧名称 `onebit` / `1bit` は、**論文名の OneBit を指す語として使わない**

## 厳密な名称区別

この区別は必須であり、曖昧な運用を禁止する。

- **`OneBit`**
  - 論文名、原典手法名、学術的参照としてのみ使用する
  - 例: `OneBit (arXiv:2402.11295) の SVID`
- **`onebit` / `1bit`** (旧名称、リネーム済み)
  - このリポジトリで使っていた旧実装名、旧フォルダ名、旧変数名、旧 UI 文言を指す
  - 現在は `lowbit-Q` にリネーム済み。学術的な原典名としては使わない
- **`lowbit-Q`**
  - 今後の上位名称
  - 1-bit 固有実装に限定されない、低ビット量子化と精度補完全体を指す

### 禁止事項

以下のような書き方は禁止する。

- `onebit は論文 OneBit の実装である` のように、実装名と論文名を無区別に扱うこと
- `OneBit format` と書いて、実際にはこのリポジトリ独自の保存形式を指すこと
- `1bit` を一般用語として使い、SVID / mixed-bit / 独自フォーマットのどれかが不明なこと

### 推奨表現

- 原典を指す: `OneBit 論文の SVID`
- 旧コードを指す: `旧 onebit 実装`, `旧 onebit 変換経路`
- 現行の総称: `lowbit-Q 実装`, `lowbit-Q metadata`

## 大前提

### なぜ lowbit-Q が必要か — ブラウザのリソース制約

当プロジェクトは **HuggingFace 検索 → モデルダウンロード → 変換 → 推論・生成の
全工程をブラウザ内で完結** させることを前提とする。

- バックエンドサーバーを必要としない
- 開発者が事前変換済みモデルを配布することはプロジェクトの範囲外
- ユーザーが任意の HF モデルを選び、ブラウザ内でワンストップに利用できる

ブラウザ環境には以下のリソース制約がある:

| 制約 | 値 | 影響 |
|---|---|---|
| WASM メモリ上限 | 4 GB | モデル + KV cache + 推論バッファが収まる必要がある |
| ダウンロードサイズ | ユーザー回線依存 | 大きなモデルは実用的でない |
| OPFS ストレージ | ブラウザ依存 | 変換済みモデルの保存容量 |

**したがって、モデルサイズ削減が最優先課題**であり、
カスタム wllama (独自テンソル形式のロード・デコード・推論) が必要な理由はここにある。

### サイズ削減と精度補償の構造

サイズ削減は必然的に精度低下を伴う。当プロジェクトの戦略は:

```
サイズ削減 (ブラウザ制約への対応)
  ├─ 重み量子化: mixed-bit (1/2/3/4-bit) で最大限圧縮
  ├─ KV cache 量子化: 推論時メモリを削減し、より大きなモデル/長いコンテキストを許容
  └─ 回転前処理: 同じビット幅でより多くの情報を保持 → さらなる低ビット化を可能にする

精度補償 (削減に伴う品質低下への対策)
  ├─ 重要テンソルの高精度維持 (第1/最終層、attention Q/K)
  ├─ mixed-bit allocator による層別最適化
  ├─ 回転前処理による outlier 軽減 (低ビットでも品質維持)
  └─ KV cache 量子化によるコンテキスト長伸長 (メモリ余裕の品質還元)

WebGPU (削減後モデルの実行省力化)
  └─ サイズ削減されたモデルの推論を GPU で加速する
```

各技術は「サイズ削減」と「精度補償」の両面を持つ。
例えば回転前処理は、同じビット幅での品質向上 (= 精度補償) であると同時に、
品質を維持したままさらに低いビット幅を選択可能にする (= さらなるサイズ削減)。
KV cache 量子化は推論時メモリ削減であると同時に、
空いたメモリをモデル本体やコンテキスト長に振り向けることで品質向上にも寄与する。

### ブラウザ完結制約による手法の制限

この制約により以下の手法は **採用しない**:

| 除外手法 | 理由 |
|---|---|
| QAT (Quantization-Aware Training) | GPU + PyTorch + 勾配降下が必須 |
| 知識蒸留 (Knowledge Distillation) | 教師モデル + 学習パイプラインが必須 |
| SpinQuant 学習済み回転行列 | Cayley 最適化に学習が必要 |
| サーバーサイド Python 変換 | ブラウザ完結に反する |

ブラウザ内で実行可能な手法のみを採用する:
ブロック量子化 (RTN)、SVID 分解、経験則ベースの mixed-bit 割当、
ランダム Hadamard 回転 (決定論的・学習不要)、
KV cache 量子化 (オンライン処理)、
SVID パラメータ精緻化 (ALS)。

## 現在位置

### Phase 4 完了時点 (2026-04-12)

**ggml ネイティブ量子化 (PASSTHROUGH 変換) を軸とした multi-model baseline が確立した。**

確認済み E2E パイプライン (import → PASSTHROUGH convert → load → infer):

| モデル | アーキテクチャ | サイズ | Func | 備考 |
|---|---|---|---|---|
| TinyLlama 1.1B Q4_0 | llama | ~610 MB | **YES** | Phase 3.6 確認 |
| SmolLM2 1.7B Q3_K_S | llama | 741 MB | **YES** | Phase 4 確認 |
| SmolLM2 1.7B Q2_K | llama | 643 MB | **YES** | Phase 4 確認 |
| Qwen 3.5 2B Q4_K_M | qwen35 | 1222 MB | **YES** | Phase 4 確認 |
| **Gemma 4 E2B Q4_K_M** | gemma4 | 2963 MB | **YES** | Phase 4 完了 (2026-04-12) |

**SVID_1BIT の評価:**

全層一律 1-bit ではサイズ削減は達成できるものの (1.1 GB → 252 MB, 77% 圧縮)、
**精度低下が大きすぎて実用に耐えない**
(`2026-04-09-SVID-Test-result.md` 参照: 全プロンプトで出力崩壊、NMSE 0.37 全テンソル均一)。

Phase 3/3.5 の TinyLlama 検証では、mixed-bit allocator を導入しても
`functionalSuccess = NO` のままであり、現状の SVID_1BIT を主たる圧縮手段として
採用する方針は成立していないことが確認済み。

**ネイティブ量子化の評価:**

- Q4_0: TinyLlama 1.1B でも functionalSuccess=YES → 実用の下限
- Q3_K/Q2_K: TinyLlama (1.1B) では失敗、SmolLM2 (1.7B) では成功
  → **品質はモデルサイズに依存、1.7B 以上であれば実用水準**

**主要な実装知見 (Phase 4):**

- GGUF `readString()` での `TextDecoder` BOM stripping バグを修正 (`ignoreBOM: true`)
  → Gemma 4 のような BOM 付きトークン変種を含む語彙でも byte-exact roundtrip が保証される
- Memory64 WASM ビルド: Chrome 147+ で 4 GB 超メモリ空間が利用可能
- Emscripten JS glue と WASM バイナリは常に同一ビルドのものをペアで更新する必要がある

**次のフェーズへの結論:**

今後の lowbit-Q は
**「独自圧縮を直接主系統に載せる」のではなく、
まず ggml ネイティブ量子化 (`Q4_0`, `Q3_K`, `Q2_K` など) を基準線として確立し、
その基準線に対して OneCompression / TurboQuant / KV cache + Model 統合最適化が
どこで上回れるかを検証する**
方針を維持する。

`.wllama-fork/llama.cpp/ggml/src/ggml-webgpu/` に **WebGPU 推論バックエンド**が
存在するがビルド未有効化であり、削減後モデルの GPU 推論が即座に利用可能な状態にある。

今後は `OneCompression をそのまま移植する` のではなく、
**OneCompression の中でブラウザ向けに効果が高い部分を選択的に吸収する** 方針を採る。

## 採用方針

### 1. SVID 1-bit は研究トラックとして維持する

- 現在の 1-bit 変換・ロード・推論経路は残す
- 最大圧縮率 (77%) の基準線として継続的に価値がある
- ただし現時点では**実用品質の主系統候補ではない**
- 新規方式は常に「サイズ」「速度」「品質」を 1-bit 基準線と比較する

### 1.5. ggml ネイティブ量子化を実用基準線として先に確立する

- `Q4_0` は最終到達点ではなく、**切り分け用かつ品質基準線**として扱う
- `Q3_K` / `Q2_K` は「サイズ削減と品質維持の現実的候補」として優先検証する
- lowbit-Q 独自方式 (OneCompression 由来の独自表現、TurboQuant、KV cache + Model 連携最適化) は、
  このネイティブ量子化基準線に対して
  **サイズ・品質・総メモリのいずれかで優位が示せる場合にのみ主系統へ採用**する
- したがって `Q4_0-only` / `Q3_K-only` / `Q2_K-only` は
  「単なる量子化」ではなく、独自手法導入の妥当性を測るための必須ベンチマークである

### 2. OneCompression は拡張方針の参照元として使う

OneCompression の取り込み方は次の通りとする。

- **直接採用する対象**
  - AutoBit 的な mixed-bit 割当 (サイズ削減 + 精度補償)
  - rotation preprocessing (精度補償 → さらなるサイズ削減を可能にする)
  - 必要に応じた QEP / JointQ の考え方
- **直接採用しない対象**
  - フレームワーク全体への依存
  - Python 実装前提のランタイム構造
  - ブラウザ実行と相性の悪い複雑な前処理・後処理の全面移植

目的は、OneCompression に寄せることではなく、
**ブラウザ向け独自変換器と WASM カーネルを維持したまま、
限られたリソース内でモデルを動かすためのサイズ削減と精度補償を進めること** である。

ただし採用判断は、必ず ggml ネイティブ量子化基準線との比較で行う。
「独自であること」は採用理由にならず、
**ブラウザ制約下での総メモリ削減・品質維持・実装複雑性のバランス**
で勝てることを条件とする。

### 3. WebGPU はサイズ削減されたモデルの実行省力化として導入する

- WebGPU は **サイズ削減と精度補償とは別の軸** にある
- サイズ削減により小さくなったモデルの推論を GPU で加速するもの
- 同じ GGUF モデル、同じ ggml 計算グラフ、同じ推論結果
- WebGPU 対応ブラウザ → GPU ディスパッチ (10x 近い高速化の可能性)
- 非対応ブラウザ → WASM CPU フォールバック (低速だが同一結果)
- ggml のバックエンドレジストリ (`ggml-backend-reg.cpp`) が自動ディスパッチ

**導入方針:**
- 標準量子化型 (Q4_0/Q8_0 等) は ggml-webgpu の既存シェーダで即時 GPU 実行可能
- lowbit-Q 1-bit カスタムカーネルは `ggml_map_custom3_inplace()` 経由のため CPU のみ
- lowbit-Q の GPU 実行には専用 WGSL シェーダの追加実装が必要

## 実装ロードマップ

全施策は**サイズ削減を第一義**とし、それに伴う精度低下を補償する構造である。

### 設計原則: 統一フォーマットとカーネルの一体設計

**mixed-bit 重み量子化、KV cache 量子化、回転前処理は全てサイズ削減に寄与する技術であり、
個別に段階拡張するのではなく、これらを包含する統一モデルフォーマットを最初に設計する。**

理由:
- 個別に Phase を分けてフォーマットを拡張すると、その都度カーネルの書き直しが発生する
- 統一フォーマットを先に確定すれば、変換器もカーネルも一度の実装で全機能を扱える
- 将来の拡張 (activation quantization 等) にも metadata 予約で対応可能

### Phase 1: lowbit-Q v2 統一フォーマット設計

最初に着手。**全ての後続実装はこのフォーマットに基づく。**

統一フォーマットが表現すべき情報:

```
lowbit-Q v2 metadata:
  ├─ 重み量子化 (per-tensor)
  │   ├─ quantization type: 1-bit SVID / 2-bit / Q3_K / Q4_0 / Q8_0 / passthrough
  │   ├─ 回転前処理適用有無 + パラメータ
  │   └─ bitwidth allocator が決定した根拠 (テンソルファミリー、層位置)
  ├─ KV cache 量子化
  │   ├─ K 量子化方式 (per-channel, bitwidth)
  │   ├─ V 量子化方式 (per-token, bitwidth)
  │   └─ 古トークン低精度化ポリシー (オプション)
  └─ 全体
      ├─ format version
      ├─ 元モデル情報
      ├─ サイズ予算 (target size ratio)
      └─ 品質メトリクス (変換時 NMSE 等)
```

**設計の要点:**
- metadata は GGUF の汎用 KV 形式を使い、llama.cpp 本体が無視できる形で格納
- SVID は ggml に存在しない独自テンソル型なので独自名 (`.lowbit_q_a/b/sign`) で識別する
- ggml ネイティブ型 (Q4_0, Q8_0, F16 等) は元の `.weight` 名を維持し GGML type で識別する
- `lowbit-q.tensor_alloc` JSON metadata が全テンソルの割当決定の正本
- KV cache 量子化パラメータは推論時に参照する runtime metadata として格納
- 回転行列は変換時に weight に吸収するため、推論側への影響はテンソルデータ自体に反映済み
- 将来の activation quantization 用に metadata namespace を予約しておく

### Phase 2: 統一変換パイプラインとカーネル実装 (TypeScript 側実装済み・C++ 側進行中)

Phase 1 のフォーマットに対する変換器とカーネルを**一括で**実装する。
回転前処理 ([2]) と 2-3 bit SVID 拡張は Phase 3 に延期。

**変換パイプライン (ブラウザ内):**

```
入力: HF モデル (GGUF Q8_0/F16)
  ↓
[1] bitwidth allocator  ← Phase 2 実装済み
    - テンソル名パターンマッチ + 層位置で量子化方式を決定
    - サイズ予算に基づく配分最適化 (greedy: attnVO → attnQK → first/last)
    - 第1/最終層 → Q4_0+, attention Q/K → Q4_0, FFN → 1-2 bit
  ↓
[2] 回転前処理 (オプション)  ← Phase 3 に延期
    - ランダム Hadamard 回転 (QuaRot 方式、学習不要)
    - 変換時に weight に吸収、推論時コストゼロ
    - 適用テンソルの選定は allocator と連動
    - 現状: applyRotation: true は未実装エラーを返す
    - 実装要件: (1) Hadamard 行列生成 (2) W_rot = W @ H^T 計算
      (3) attention カーネルでのオンライン活性化回転 (C++ 要変更)
  ↓
[3] テンソル量子化  ← Phase 2 実装済み
    - allocator が決定した方式で各テンソルを量子化
    - 1-bit SVID: 分解 → `prefix.lowbit_q_a/b/sign` triplet (独自名 = 独自カーネル)
    - Q4_0: RTN ブロック量子化 → 元の `.weight` 名維持 (ggml native kernel)
    - 2-3 bit: SVID 拡張または RTN (未実装、Phase 3)
    - パススルー: embedding, norm, 保護対象 → 元の `.weight` 名・元の型を維持
  ↓
[4] KV cache パラメータ決定  ← metadata スキーマのみ定義済み、実装は Phase 3
    - KIVI 方式のパラメータ (K per-channel, V per-token, bitwidth)
    - TurboQuant パラメータ (将来対応予約)
    - metadata に格納
  ↓
[5] lowbit-Q v2 GGUF 書き出し  ← Phase 2 実装済み
    - 統一 metadata + 量子化済みテンソル群
    - KV cache パラメータを runtime metadata として含む
出力: lowbit-Q v2 GGUF
```

**テンソル識別と割当管理の設計 (Phase 2 確定):**

lowbit-Q v2 は同一 GGUF 内に PASSTHROUGH・Q4_0・SVID_1BIT が混在する
独自フォーマットである。この混在を loader と kernel が誤解なく扱うために、
識別子の配置を以下のように設計する。

*設計原則:*
- SVID_1BIT は ggml に存在しない独自テンソル型 → **独自名で識別**する
- Q4_0 / Q8_0 / F16 等は ggml ネイティブ型 → **元の `.weight` 名を維持**し、
  GGML type コードで native kernel にディスパッチする
- どのレイヤーにどの方式を割り当てたかの**正本**は
  `lowbit-q.tensor_alloc` JSON metadata で管理する

*テンソル名と GGML type の対応:*

```
prefix.lowbit_q_a / _b / _sign → SVID_1BIT (独自カーネル)
prefix.weight (GGML type = Q4_0) → Q4_0 再量子化 (ggml native kernel)
prefix.weight (GGML type = F16 等) → PASSTHROUGH (元の型そのまま)
```

*C++ ディスパッチ (Phase 2 実装済み: struct-field アプローチ):*

ローダー (`llama-model.cpp`, patch 0002) が各レイヤーのロード時に SVID テンソルを
`llama_layer` struct の専用フィールドに先読みする:

```cpp
// llama_layer struct に追加済み (llama-model.h, patch 0002)
struct ggml_tensor * lowbit_q_wq_a    = nullptr;
struct ggml_tensor * lowbit_q_wq_b    = nullptr;
struct ggml_tensor * lowbit_q_wq_sign = nullptr;
// ... (wk, wv, wo, ffn_gate, ffn_down, ffn_up の分も同様)

// llama-model.cpp ローダー: SVID テンソルが GGUF に存在すれば field に格納
layer.lowbit_q_wq_a = create_tensor(tn(LLM_TENSOR_ATTN_Q, "lowbit_q_a", i), ..., TENSOR_NOT_REQUIRED);
```

グラフビルダー (`models/llama.cpp`, patch 0003) は field の null チェックのみでディスパッチ:

```cpp
// models/llama.cpp (llm_build_llama)
ggml_tensor * Qcur;
if (model.layers[il].lowbit_q_wq_a) {
    // SVID テンソルがロード済み → 独自カーネル
    Qcur = lowbit_q_build_mul_mat(ctx0,
        model.layers[il].lowbit_q_wq_a,
        model.layers[il].lowbit_q_wq_b,
        model.layers[il].lowbit_q_wq_sign, cur);
} else {
    // SVID テンソルなし → native ggml パス
    Qcur = build_lora_mm(model.layers[il].wq, cur);
}
```

**なぜ struct-field アプローチか:**

当初設計では `lowbit_q_lookup(model, prefix)` が実行時に
`llama_get_model_tensor()` を呼んで動的に SVID テンソルを検索する予定だったが、
wllama v2.3.7 が pin している llama.cpp のバージョンには
`llama_get_model_tensor()` が公開 API として存在しない。
そのため OneCompression の旧実装が採用していた struct-field 方式を踏襲した。

`lowbit_q_lookup()` は現在も API として存在するが、常に `{valid=0}` を返す
スタブ実装になっており、実際のディスパッチ判断は行っていない。

この設計により:
- 重要レイヤー (第1/最終層、attention Q/K) を低ビット化せず保護する mixed format を自然に扱える
- ggml の既存グラフビルダー・カーネルをそのまま活用できる
- ディスパッチ判断のコストがゼロ (ポインタの null チェックのみ)

**カーネル (WASM + WebGPU):**

一つの統一カーネルが全量子化型をディスパッチする:

- 標準量子化型 (Q4_0/Q8_0 等) → ggml ネイティブカーネル (WebGPU 対応済み)
- lowbit-Q 1-bit SVID → カスタムカーネル (WASM SIMD + WGSL シェーダ)
- lowbit-Q 2-3 bit → カスタムカーネル (同上)
- KV cache 量子化 → attention 経路にオンライン量子化/復元を組み込み

**WebGPU 対応も含めて一度に実装する:**
- 標準量子化型: ggml-webgpu 既存シェーダ活用
- lowbit-Q 全ビット幅: 専用 WGSL シェーダを新規作成 (bitnet.js 参照)
- KV cache: attention カーネル内で量子化/復元

### Phase 3: 品質検証と基準線確立

統一パイプラインの動作確認と、サイズ vs 品質のトレードオフ調整。

- TinyLlama-1.1B で各 allocator 設定を検証
- `Q4_0-only` を純粋条件で再実行し、runtime / loader / conversion path の健全性を切り分ける
- `Q3_K-only` / `Q2_K-only` を追加し、native quant のサイズ・品質基準線を作る
- サイズ予算ごとの品質マップ作成 (30%/40%/50%/60% of original)
- allocator の経験則を検証結果に基づきチューニング

**Phase 3 の判断基準:**
- `Q4_0-only` でも崩れるなら、独自手法以前に変換経路または loader/runtime を再点検する
- `Q4_0-only` は成立し `SVID` 系のみ崩れるなら、問題は SVID 表現品質にあると判断する
- `Q3_K` / `Q2_K` が実用品質を維持できるなら、短中期の主系統は native quant ベースとする
- 独自方式 (OneCompression 派生, TurboQuant, KV cache + Model 最適化) は、
  native quant 基準線を超える候補に絞って検討する

### Phase 3.5: 独自技術の採用条件を明確化

- OneCompression 由来 mixed-bit / TurboQuant / KV cache + Model を
  **即採用前提ではなく評価対象**として扱う
- 比較対象:
  - `Q8_0` 原本
  - `Q4_0-only`
  - `Q3_K-only`
  - `Q2_K-only`
  - `lowbit-Q mixed-bit (SVID 含む)`
- 採用条件:
  - 同等品質でより小さい
  - 同等サイズでより高品質
  - モデル本体 + KV cache の総メモリで優位
  - ブラウザ内実装コストが許容範囲
- この条件を満たさない独自方式は研究トラックに残し、主系統には載せない

### Phase 4: Multi-Model Baseline + KV Cache Design + KIVI PoC (進行中)

- **前提**: Phase 3.6 で Q4_0 が TinyLlama で functionalSuccess=YES → パイプライン健全確認済み
- **目的**: TinyLlama での Q3_K/Q2_K 失敗がモデルサイズ起因か否かを 1.7B+ で再検証
- **実施内容**:
  1. SmolLM2-1.7B-Instruct (llama arch) / Qwen 3.5 2B / Gemma 4 E2B の native quant E2E テスト
     - pre-quantized GGUF (Q8_0, Q4_0, Q3_K, Q2_K) を Unsloth/bartowski から直接取得
     - 自前変換なし — native quality の評価のみ
  2. KV Cache + Model 総メモリ設計 (`kvCacheDesign.ts` 完了)
     - `estimateKvCacheBytes()`, `maxSeqLenIn4GB()`, `buildStrategyMatrix()` 実装済み
  3. KIVI 2-bit PoC (`kiviQuantize.ts` 完了、14 テスト全パス)
     - 結論: KIVI は KV cache 専用。サイズ 23% 削減、品質は Q2_K より低い
  4. 圧縮禁止領域の文書化 (`COMPRESSION-RISK-MAP.md` 作成済み)
     - `validateAllocations()` による自動警告 (allocator.ts)
  5. llama.cpp サブモジュール更新 (commit 05b3caa、gemma4/qwen35 アーキテクチャ追加)

- **残タスク**: SmolLM2 Playwright E2E テスト実行、Phase 4 評価レポート作成

### Phase 5: KV Cache C++ 実装 + Activation quantization (条件付き)

- Phase 4 の native quant 結果次第で方針決定
- KV cache KIVI C++ 統合: attention カーネル内で量子化/復元 (build_attn フック)
  - `LowbitQQuantType.KIVI_2BIT_VALUE` / `KIVI_2BIT_KEY` enum 追加
  - `lowbit-q.kv_cache.*` GGUF metadata キー使用
  - PoC 実装: `src/local-llm/lowbit-q/kiviQuantize.ts` (Phase 4 で完了)
- W4A8 → W4A4 activation quantization (条件付き)
- metadata namespace は Phase 1 で予約済み
- ブラウザ/WASM/WebGPU でのオンライン変換コストとの兼ね合いで判断する

### WebGPU ビルド有効化 (Phase 2 と同時)

サイズ削減されたモデルの実行省力化。Phase 2 のカーネル実装と同時に行う。

- `build-local.sh` に `-DGGML_WEBGPU=ON` と `emdawnwebgpu_pkg` パス設定を追加
- WebGPU 対応/非対応ブラウザの自動検出 + WASM CPU フォールバック
- 標準量子化型は ggml-webgpu 既存シェーダで GPU 実行
- lowbit-Q カスタム型は新規 WGSL シェーダで GPU 実行
- ビルド要件: emdawnwebgpu_pkg、emsdk 4.0.3 互換検証、Python 3
- 将来: 変換パイプライン自体の GPU オフロード (SVID power iteration 等)

## 実装原則

### フレームワーク非依存

- OneCompression の概念は参照するが、当プロジェクトの内部 API は独自に保つ
- Python 実装や外部リポジトリ構造に密結合しない

### 変換時に重い処理を寄せる

- ブラウザ推論経路は単純であるほど良い
- 高コスト処理は変換時に吸収し、実行時は metadata と軽量カーネルで処理する

### metadata 先行

- 新しい量子化方式を入れる前に、表現できる metadata 形式を先に決める
- フォーマットが曖昧なまま個別実装を増やさない

### 1-bit は研究基準線、native quant は実用基準線

- OneBit/SVID 経路は比較対象として残す
- 新規方式は常に「サイズ」「速度」「品質」を 1-bit 基準線と比較する
- ただし採用判断の主基準は `Q4_0` / `Q3_K` / `Q2_K` の native quant 基準線とする

### WebGPU はオプショナル加速

- WebGPU は必須ではなく、高速化のためのオプショナルレイヤーとして扱う
- 全機能は WASM CPU のみで動作可能であること
- WebGPU 非対応環境で機能が欠落してはならない
- ggml のバックエンドディスパッチに委ねて、明示的な分岐を最小化する

## ドキュメント運用

- `TECH-SURVEY.md`: 調査結果、比較、優先順位
- `IMPLEMENTATION-STRATEGY.md`: この方針書。採用判断と実装順序
- `Docs/old/`: 古くなったステータス資料や、歴史的経緯のために残す文書

古い文書を残す場合は、先頭に「旧資料」である旨と、
現行参照先 (`TECH-SURVEY.md`, `IMPLEMENTATION-STRATEGY.md`) を明記する。

## 命名方針

`onebit` という呼称は、現在の実装出発点である SVID 1-bit を指すには有効だが、
今後の実態である **低ビット量子化技術 + 精度補完技術** を表す名称としては狭すぎる。

そのため、今後の上位名称は **`lowbit-Q`** とする。

意図は次の通り。

- `lowbit`: 1-bit に限定しない低ビット量子化全般を表す
- `Q`: quantization と、その周辺の品質改善系を含む umbrella term として使う

### 名称整理の実施状況

以下の名称整理は **完了済み** である。

- フォルダ名: `wllama-onebit/` → `wllama-lowbit-q/`、`src/local-llm/onebit/` → `src/local-llm/lowbit-q/`
- ファイル名: `convert_to_onebit_gguf.py` → `convert_to_lowbit_q_gguf.py`
- metadata key: `onebit.version` → `lowbit-q.version`
- テンソル名サフィックス: `_onebit_a` → `_lowbit_q_a` 等
- ファイル拡張子: `.onebit.gguf` → `.lowbit-q.gguf`
- 設計文書内の呼称

残りの対象 (ソースコード内の型名・変数名、UI 表示名、テスト名) は
段階的にリネームを進める。

### 現時点の扱い

主要なディレクトリ名・ファイル名・metadata key・文書呼称のリネームは完了した。
新規文書・新規設計では `lowbit-Q` を使用すること。
旧名称 `onebit` は歴史的経緯の説明や、旧文書の引用時にのみ使用する。

今後の改名計画・レビュー・実装指示では、
**論文名の `OneBit` と、旧実装名の `onebit` / `1bit` を必ず別カテゴリとして扱うこと**。
この区別が曖昧な rename plan は不完全とみなす。
