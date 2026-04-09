# wllama-lowbit-q 実装方針

最終更新: 2026-04-09

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

## 現在位置

現時点の `src/local-llm/lowbit-q/` と `wllama-lowbit-q/cpp/lowbit-q/` は、
ブラウザ内変換および WASM 推論で **SVID 1-bit 経路を E2E で動かす最小構成** として成立している。

ただし、`TECH-SURVEY.md` が指摘するとおり、全層一律 1-bit は品質限界が明確である。
今後は `OneCompression をそのまま移植する` のではなく、
**OneCompression の中でブラウザ向けに効果が高い部分を選択的に吸収する** 方針を採る。

## 採用方針

### 1. SVID 1-bit は維持する

- 現在の 1-bit 変換・ロード・推論経路は残す
- これは最小サイズ圧縮の基準線として継続的に価値がある
- ただし、品質改善の主戦場は「SVID 単体の微修正」ではなく、
  mixed-bit 化や前処理へ移す

### 2. OneCompression は拡張方針の参照元として使う

OneCompression の取り込み方は次の通りとする。

- **直接採用する対象**
  - AutoBit 的な mixed-bit 割当
  - rotation preprocessing
  - 必要に応じた QEP / JointQ の考え方
- **直接採用しない対象**
  - フレームワーク全体への依存
  - Python 実装前提のランタイム構造
  - ブラウザ実行と相性の悪い複雑な前処理・後処理の全面移植

目的は、OneCompression に寄せることではなく、
**ブラウザ向け独自変換器と WASM カーネルを維持したまま、低ビット品質を上げること** である。

## 実装ロードマップ

`TECH-SURVEY.md` に基づき、次の順で進める。

### Phase 1: Mixed-bit metadata と layer-wise bitwidth 割当

最優先。

- `lowbit-q.version` のような単一形式 metadata から脱却し、
  layer / tensor 単位で quantization type を保持できる形式へ拡張する
- 1/2/3/4-bit 共存を前提に、変換パイプラインを一般化する
- OneComp AutoBit の発想を参照しつつ、
  ブラウザ実装に適した単純な allocator から始める

期待効果:

- 現状の「全層 1-bit」による品質悪化を直接緩和できる
- 将来の量子化器追加に備えたフォーマット基盤になる

### Phase 2: KV cache 量子化

- 初手は `KIVI` 相当の単純な非対称量子化を優先する
- TurboQuant は中期候補とし、ブラウザ移植コストを見ながら判断する

期待効果:

- 長文コンテキスト時のメモリ圧迫を軽減できる
- ブラウザ実行時の 4GB 制限への耐性が上がる

### Phase 3: Rotation preprocessing

- OneComp が取り込む SpinQuant / OSTQuant 系の考え方を参照する
- 回転行列は変換時に weight に吸収し、実行時コストは増やさない
- 対象は主に 3-4 bit 系の品質安定化

期待効果:

- 低ビット化で崩れやすい層の精度を改善できる
- mixed-bit と組み合わせたときの品質上限を上げられる

### Phase 4: Activation quantization

- weight-only と KV quantization が安定してから検討する
- ブラウザ/WASM ではオンライン変換コストが大きいため後回しにする

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

### 1-bit を基準線として残す

- OneBit/SVID 経路は比較対象として残す
- 新規方式は常に「サイズ」「速度」「品質」を 1-bit 基準線と比較する

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
