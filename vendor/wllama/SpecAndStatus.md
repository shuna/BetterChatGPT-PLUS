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

`vendor/wllama-src/` はローカル作業ツリーであり (gitignore 済み)、公式取得できる upstream の展開先として扱う。
この main repo では upstream 本体を保持せず、必要な変更だけを `vendor/wllama-patches/` のパッチおよびスクリプトとして持つ。

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

現行実装では、モデル重みの主配置先は実行経路で分かれる。

- WebGPU 実行時は `n_gpu_layers=999` を指定し、モデル重みをできるだけ VRAM 側へ逃がす。
- CPU 実行時はモデル重みを WASM ヒープ側、すなわちメインメモリ側で保持する。
- ブラウザでは `use_mmap: false` を前提とするため、読み込み時にはヒープ消費を伴う。

この挙動は現行ロード経路の [`wllamaWorker.ts`](/Users/suzuki/weavelet-canvas/src/workers/wllamaWorker.ts:632) で
`n_gpu_layers: currentWasmUsesWebGPU ? 999 : 0` および `use_mmap: false` を指定していることに対応する。

### 各 WASM バリアントのメモリ上限

以下は現行 repo にある配布済み `.wasm` 実体の memory/import section を直接確認した結果である。
あわせて、ビルド設定としては `vendor/wllama-src/scripts/build_all_wasm.sh` が Memory64 版を `16384MB`、
compat 版を `4096MB` 上限で組む設計になっている一方、repo 内の
`vendor/wllama/lowbit-q/build-local.sh` は compat 版を `2048MB` 上限で再ビルドする。
そのため、現行配布物の compat 系上限は一律ではない。

| WASM バリアント | 実行経路 | Memory ABI | WebGPU | JSPI | 配布実体のヒープ上限 | 想定環境 |
|----------------|----------|------------|--------|------|------------------|----------|
| `single-thread-cpu-mem64.wasm` | CPU | Memory64 | なし | 不要 | 8 GB | Memory64 対応ブラウザでの CPU 実行 |
| `multi-thread-cpu-mem64.wasm` | CPU | Memory64 | なし | 不要 | 8 GB | COOP/COEP 前提の multi-thread CPU 実行 |
| `single-thread-cpu-compat.wasm` | CPU | wasm32 compat | なし | 不要 | 2 GB | Memory64 非依存の保守的 CPU 実行 |
| `multi-thread-cpu-compat.wasm` | CPU | wasm32 compat | なし | 不要 | 2 GB | COOP/COEP 前提の保守的 multi-thread CPU 実行 |
| `single-thread-webgpu.wasm` | WebGPU | Memory64 | あり | 必須 | 16 GB | Memory64 + JSPI + WebGPU が揃う環境 |
| `multi-thread-webgpu.wasm` | WebGPU | Memory64 | あり | 必須 | 16 GB | COOP/COEP + Memory64 + JSPI + WebGPU |
| `single-thread-webgpu-compat.wasm` | WebGPU | wasm32 compat | あり | 必須 | 4 GB | Memory64 なしで JSPI + WebGPU を使う単スレッド経路 |
| `multi-thread-webgpu-compat.wasm` | WebGPU | wasm32 compat | あり | 必須 | 2 GB | COOP/COEP 前提の compat WebGPU multi-thread 経路 |

- CPU Memory64 版 2 種（`*-cpu-mem64.wasm`）は `vendor/wllama/lowbit-q/build-local.sh` の `-sMAXIMUM_MEMORY=8589934592`（8 GB）で生成される。
- `single-thread-cpu-compat.wasm` と `multi-thread-cpu-compat.wasm` は、配布実体として 2 GB 上限である。これは `vendor/wllama/lowbit-q/build-local.sh` の `-sMAXIMUM_MEMORY=2048MB` と一致する。
- `single-thread-webgpu-compat.wasm` は、現行配布実体では 4 GB 上限であり、「compat は常に 2 GB」という状態にはなっていない。
- `multi-thread-webgpu-compat.wasm` は、現行配布実体では 2 GB 上限である。

### 現行アプリで実際に使っている経路

現行アプリのロード処理では [`wllamaWorker.ts`](/Users/suzuki/weavelet-canvas/src/workers/wllamaWorker.ts:632) で
`n_threads: 1` を固定しているため、実運用で使うのは single-thread 系が中心である。
したがって、現在の主な実行経路と上限は次の 4 つである。

| 実行モード | 選ばれる単スレッド WASM | 重みの主配置先 | 実効上限 |
|-----------|------------------------|----------------|----------|
| CPU + Memory64 | `single-thread-cpu-mem64.wasm` | メインメモリ | 8 GB |
| CPU + compat | `single-thread-cpu-compat.wasm` | メインメモリ | 2 GB |
| WebGPU + JSPI | `single-thread-webgpu-compat.wasm` | VRAM 優先 | 4 GB |

WebGPU Memory64 バリアント（`*-webgpu-mem64.wasm`）は現時点でビルドされておらず、variant-table では `disabled` 扱い。
WebGPU を選択した場合は常に `*-webgpu-compat.wasm` が選ばれる。

### ブラウザ機能対応メモ

最新のデスクトップ・モバイル stable 環境を前提にすると、`Memory64`、`WebGPU`、`JSPI` の対応状況にはブラウザ差がある。

| 環境 | Memory64 | WebGPU | JSPI |
|------|----------|--------|------|
| Chrome | 利用可 | 利用可 | 利用可 |
| Chrome for Android | 利用可 | 利用可 | 未対応 |
| Firefox | 利用可 | 利用可 | 未対応 |
| Firefox for Android | 利用可 | 主対象にしにくい | 未対応 |
| Safari | 未対応 | 利用可または部分対応 | 未対応 |
| Safari on iOS | 未対応 | 利用可または部分対応 | 未対応 |

- この fork の WebGPU バリアントは `BUILD.md` にある通り `-sJSPI=1` を前提とする。したがって `Memory64` と `WebGPU` が使えても、`JSPI` がない環境では WebGPU のフル機能実行は前提にできない。
- Firefox デスクトップは `Memory64` と `WebGPU` 自体は使えるが、最新 stable では `JSPI` が未対応である。そのため、この fork の現在の WebGPU 実装をそのままフル機能で動かすのは難しい。
- Chrome for Android も `Memory64` と `WebGPU` は使える一方で `JSPI` は未対応であり、この fork の WebGPU 実行条件は満たしにくい。
- Safari 系では `JSPI` に加えて `Memory64` も前提にできないため、`Memory64` 前提のバリアントや WebGPU のフル機能経路は想定しにくい。

---

## パッチ管理方針

`vendor/wllama-patches/` を、本流拡張に必要な差分の唯一の置き場とする。

想定する内容:

- `wllama` 側ビルドスクリプト差分
- `llama.cpp` / `ggml-webgpu` の upstream 互換パッチ
- Emscripten JS グルー補正
- 再ビルド手順に必要な apply スクリプト

セットアップは `bash scripts/wllama/setup.sh` で行う。
このスクリプトが `vendor/wllama-src/` を作成し、`vendor/wllama-patches/` の差分を適用する。

---

## 現在の達成状況

### 達成済み

- Memory64 モデルでも WebGPU バリアントを選択できるようにした
- raw export ベースへ切り替え、`cwrap` 依存の BigInt / NaN 系問題を回避した
- compat WebGPU に対して 32-bit 用 JSPI ラッパーを当てる方針を確立した
- `ggml-webgpu` の `MapAsync` 失敗で error buffer pool が枯渇する問題に対し、再生成による回避策を確認した
- WebGPU / CPU の主要 4 パスをローカル smoke test で確認した

### 未整理

- 上記差分の一部はまだ `vendor/wllama-src/` ローカル作業ツリーにのみ反映されており、`vendor/wllama-patches/` のパッチ正本へ移し切れていない

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

1. `vendor/wllama-src/` に残っている本流拡張差分を `vendor/wllama-patches/` へ patch として切り出す
2. low-bit-q 側文書から、本流 WebGPU 状況の記述を外す
3. low-bit-q をこの本流拡張の上に積む二段構成を README へ明文化する
