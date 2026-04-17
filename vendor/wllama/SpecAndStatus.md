# wllama Base Extension — Spec And Status

この文書は、`vendor/wllama/` を「独自フォーマット変更を含まない本流拡張」の正本として扱うための設計方針と実装ステータスを記録する。

対象:

- WebGPU 対応
- Memory64 / compat の両立
- JSPI / Emscripten 互換
- OPFS 直接ロード
- shard 対応
- ヒープ使用量低減
- upstream `wllama` / `llama.cpp` に本来載せられる性質の修正

対象外:

- 独自ファイルフォーマット拡張
- low-bit-q 変換
- low-bit-q 専用ローダー / カーネル

それらは `vendor/wllama/lowbit-q/` を正本とする。

---

## リポジトリ整理方針

### 1. `vendor/wllama` を単一の配布実体として扱う

Web アプリが読み込む WASM / JS グルーは `vendor/wllama/` 配下の 1 セットのみを正本とする。
異なる構成の `wllama` を並立させず、派生機能もまずはこの土台に対する差分として整理する。

### 2. 公式取得できるコードはリポジトリに抱え込まない

`.wllama-fork/` はローカル作業ツリーであり、公式取得できる upstream の展開先として扱う。
この main repo では upstream 本体を保持せず、必要な変更だけをパッチまたはスクリプトとして持つ。

### 3. 本流拡張と low-bit-q 拡張を分離する

- 本流拡張: `vendor/wllama/`
- 独自フォーマット拡張: `vendor/wllama/lowbit-q/`

WebGPU や Memory64 の安定化のような upstream 志向の変更を土台とし、その上に low-bit-q を別パッチとして重ねる。

### 4. ステータス文書も 2 系統に分ける

- 本流拡張の状態: このファイル
- low-bit-q 拡張の状態: `vendor/wllama/lowbit-q/Docs/Low-bit-q-STATUS.md`

`vendor/wllama/lowbit-q/Docs/` では、本流 `wllama` 側の WebGPU 状況を正本として扱わない。

---

## 配布対象と設計前提

| 環境 | WASMバリアント | モデル配置 | CPUヒープ上限 |
|------|--------------|------------|--------------|
| WebGPU + compat (wasm32) | `single-thread-webgpu-compat.wasm` | 全レイヤーVRAM (`n_gpu_layers=999`) | 2 GB |
| WebGPU + Memory64 | `single-thread-webgpu.wasm` | 全レイヤーVRAM (`n_gpu_layers=999`) | 16 GB |
| CPU + compat (wasm32) | `single-thread-compat.wasm` | CPUヒープのみ | 2 GB |
| CPU + Memory64 | `single-thread.wasm` | CPUヒープのみ | 16 GB |

- WebGPU 利用時は `n_gpu_layers=999` を基本とし、モデル全体を VRAM 側へ逃がす。
- ブラウザでは `use_mmap: false` を前提とする。
- compat CPU の 2 GB 上限は意図的な保守的設計であり、本流拡張では無理に広げない。

---

## パッチ管理方針

`vendor/wllama/patches/` を、本流拡張に必要な差分の置き場とする。

想定する内容:

- `wllama` 側ビルドスクリプト差分
- `llama.cpp` / `ggml-webgpu` の upstream 互換パッチ
- Emscripten JS グルー補正
- 再ビルド手順に必要な apply スクリプト

現状、ローカル `.wllama-fork/` には未コミットの作業ツリー差分が残っているが、長期的な正本はこの `patches/` に移す。

---

## 現在の達成状況

### 達成済み

- Memory64 モデルでも WebGPU バリアントを選択できるようにした
- raw export ベースへ切り替え、`cwrap` 依存の BigInt / NaN 系問題を回避した
- compat WebGPU に対して 32-bit 用 JSPI ラッパーを当てる方針を確立した
- `ggml-webgpu` の `MapAsync` 失敗で error buffer pool が枯渇する問題に対し、再生成による回避策を確認した
- WebGPU / CPU の主要 4 パスをローカル smoke test で確認した

### 未整理

- 上記差分の一部はまだ `.wllama-fork/` ローカル作業ツリーに残っており、main repo 側の patch 正本へ移し切れていない
- `vendor/wllama/patches/` はこれから整理する段階

---

## 未解決・継続課題

### 1. `MapAsync` 失敗の根本原因は未特定

`Buffer was destroyed before mapping was resolved.` の直接原因はまだ断定できていない。
現状の Step 3-A は「プール枯渇を防いで generate を通す」ための実務的回避であり、根本修正ではない。

### 2. upstream へ返せる単位に分解する必要がある

本流拡張は upstream 志向で扱うため、少なくとも次の単位には分離したい。

- JSPI / Emscripten 互換修正
- WebGPU error buffer pool 修正
- compat / Memory64 ラッパー修正

### 3. multi-thread 系は別フェーズ

`multi-thread*.wasm` は COOP/COEP や配信ヘッダの前提が強いため、本流整理の初期段階では single-thread 系を優先する。

---

## 次の整理作業

1. `.wllama-fork/` に残っている本流拡張差分を `vendor/wllama/patches/` へ移す  
2. `BUILD.md` を「upstream 取得 + patch 適用」前提に統一する  
3. low-bit-q 側文書から、本流 WebGPU 状況の記述を外す  
4. low-bit-q をこの本流拡張の上に積む二段構成を README へ明文化する
