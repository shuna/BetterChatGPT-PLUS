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

| WASM バリアント | 実行経路 | Memory ABI | WebGPU | JSPI | ヒープ上限 | 想定環境 | variant-table status |
|----------------|----------|------------|--------|------|-----------|----------|---------------------|
| `single-thread-cpu-mem64.wasm` | CPU | Memory64 | なし | 不要 | 8 GB | Memory64 対応 CPU | active |
| `multi-thread-cpu-mem64.wasm` | CPU | Memory64 | なし | 不要 | 8 GB | COOP/COEP MT CPU | active |
| `single-thread-cpu-compat.wasm` | CPU | wasm32 compat | なし | 不要 | 2 GB | 保守的 CPU | active |
| `multi-thread-cpu-compat.wasm` | CPU | wasm32 compat | なし | 不要 | 2 GB | COOP/COEP MT CPU | active |
| `single-thread-webgpu.wasm` | WebGPU | Memory64 | あり | 必須 | 16 GB | Memory64 + JSPI + WebGPU | **upstream artifact のみ; variant-table に entry なし** |
| `multi-thread-webgpu.wasm` | WebGPU | Memory64 | あり | 必須 | 16 GB | COOP/COEP + Memory64 + JSPI + WebGPU | **upstream artifact のみ; variant-table に entry なし** |
| `single-thread-webgpu-compat.wasm` | WebGPU | wasm32 compat | あり | 必須 | 4 GB | JSPI + WebGPU (no Memory64) | active |
| `multi-thread-webgpu-compat.wasm` | WebGPU | wasm32 compat | あり | 必須 | 2 GB | COOP/COEP JSPI WebGPU MT | active |
| `single-thread-webgpu-asyncify-compat.wasm` | WebGPU | wasm32 compat | あり | 不要 (Asyncify) | 2 GB | JSPI なし + WebGPU 環境 (Firefox, Android Chrome 等) | **experimental, active for verification** |
| `multi-thread-webgpu-asyncify-compat.wasm` | WebGPU | wasm32 compat | あり | 不要 (Asyncify) | 2 GB | COOP/COEP + JSPI なし + WebGPU MT | **experimental, active for verification** |

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

- **JSPI WebGPU バリアント** (`*-webgpu-compat.wasm`, `*-webgpu.wasm`) は `-sJSPI=1` を前提とする。JSPI がない環境では選ばれない。
- **Asyncify WebGPU バリアント** (`*-webgpu-asyncify-compat.wasm`) は `-sASYNCIFY=1` で JSPI なしに WebGPU を使う。Chromium では ST/MT とも E2E PASS 済み。Firefox / Mobile Chrome / Mobile Safari は検証中のため、状態は experimental active とする。
- Firefox デスクトップ・Chrome for Android は `WebGPU` あり / `JSPI` なし の典型環境。Asyncify バリアントが有効になればこれらで WebGPU を使えるようになる可能性がある。
- Safari 系では `JSPI`・`Memory64` いずれも前提にできないため、現状は CPU compat fallback。WebGPU Asyncify が stable になれば Safari でも WebGPU が使える可能性がある（未検証）。
- モバイル環境での実機確認は現在の開発環境では実施できない。期待挙動のみ SpecAndStatus.md に記録する。

### Asyncify WebGPU build notes (2026-04-21)

| 項目 | 状況 |
|------|------|
| emsdk | 5.0.5 |
| ビルド成功 | ✓ (ST + MT) |
| `-sASYNCIFY=1` × `-fwasm-exceptions` 相性 | **非互換確認済み** — Asyncify ビルドは `-fwasm-exceptions` を除去し Emscripten デフォルト (JS-based) 例外を使用 |
| 例外モード切替 | **`SHARED_EMCC_CFLAGS_ASYNCIFY_BASE` から `-fwasm-exceptions` を除去** |
| `required[]` の `exnref` | **除去** — Asyncify ビルドは wasm native EH を使わないため `exnref` ブラウザ機能は不要 |
| `GGML_WEBGPU_JSPI=OFF` CMake フラグ有効性 | ✓ |
| export minification bug | `-sASYNCIFY=1` + `-O3` で Emscripten の `MINIFY_WASM_IMPORTS_AND_EXPORTS` が有効になり、`asyncify_start_unwind` が wasm-opt によって `qb` などに rename されるが JS 側の更新が失敗し `_asyncify_start_unwind is not a function` が発生。**回避策: `-sASSERTIONS=1` を追加** (ASSERTIONS=true の場合 minification が無効化される) |
| `-sIMPORTED_MEMORY` | emdawnwebgpu が imported memory を要求するため必要。追加済み |
| Asyncify 呼び出し規約 | Asyncify build では `Module._wllama_action(...)` は同期的に返る（unwind/rewind が内部で発生）。`await Module._wllama_action(...)` では結果が得られない。`Module['Asyncify'].currData !== null` を確認後に `Module['Asyncify'].whenDone()` を await する方式に修正 (`llama-cpp.js` の `_callWasm` ヘルパー) |
| ST Asyncify E2E | **✓ PASS** — Chromium、smollm2-360m-instruct-q8_0.gguf、generated=" 1000000" tokens=8、gpuAdapter vendor=apple |
| MT Asyncify E2E | **✓ PASS** — Chromium、isMultiThread=true numThreads=4、同モデル、同トークン生成確認 |
| active 化判断 | Chromium ✓。利用者が限られるため `disabled: true` は除去済み。Firefox Desktop / Mobile Chrome / Mobile Safari での検証結果を追記する |

**例外モード変更の影響**: JS-based exceptions は wasm native EH より低速。ただし Asyncify WebGPU は GPU offload が主目的のため例外ハンドリングのオーバーヘッドは支配的でない。`-frtti` は維持（RTTI は例外モードと独立）。

**残りの検証手順**:
1. Firefox で `tests/webgpu-asyncify-verify.spec.ts` を実行し ST/MT の結果を記録
2. Mobile Chrome / Mobile Safari で実機 smoke を行い、WebGPU Asyncify または CPU fallback のどちらに流れたかを記録
3. 問題が出た場合は `variant-table.ts` で該当バリアントのみ `disabled: true` に戻し、CPU fallback を維持する

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
