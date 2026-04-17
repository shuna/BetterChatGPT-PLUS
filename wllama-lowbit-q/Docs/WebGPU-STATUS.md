# WebGPU ロード状況

最終更新: 2026-04-17

## 概要

Memory64 WASM (Bonsai-8B 等の大型モデル) + WebGPU 経路の修正状況と残課題を記録する。

---

## 修正済み — Memory64 BigInt 変換エラー (2026-04-17)

### 症状

`single-thread-webgpu.wasm` (Memory64 + JSPI) 選択時に以下で落ちていた:

```
The number NaN cannot be converted to a BigInt because it is not an integer
```

### 根本原因

`wllamaAction` が action 名文字列の確保に `wllama_malloc` を呼んでいたが、
`wllama_malloc` は常に同じ静的バッファ (`input_buffer.data()`) を返す単一ポインタ。
`actPtr == reqPtr` となり、リクエスト本体を上書き → C++ 側で "Invalid magic number" →
null output pointer → `BigInt(NaN)` 例外。

### 修正内容

**`.wllama-fork/src/workers-code/llama-cpp.js`**

- `Module.cwrap` を削除し `Module._wllama_*` 直接呼び出しに切り替え
- action 名文字列は `Module.stackSave() / stackAlloc() / stackRestore()` で
  WASM スタック上に確保（全 8 バリアントで利用可能）
- `wllamaAction` の実装:

```js
wllamaAction = async (action, reqPtr) => {
  const bytes = textEncoder.encode(action);
  const sp = Module.stackSave();
  const actPtr = Module.stackAlloc(bytes.byteLength + 1);
  Module.HEAPU8.set(bytes, actPtr);
  Module.HEAPU8[actPtr + bytes.byteLength] = 0;
  try {
    return Number(await Module._wllama_action(actPtr, reqPtr));
  } finally {
    Module.stackRestore(sp);
  }
};
```

**`src/workers/wllamaWorker.ts`**

- Memory64 モデルで WebGPU を一時的に無効化していた暫定コードを削除
  (`memory64-webgpu-temporarily-disabled` フラグを撤去)

### 検証結果 (2026-04-17)

| ケース | WASM | ロード | 生成 | 確認環境 |
|---|---|---|---|---|
| C) SmolLM2-360M + CPU | `single-thread-compat.wasm` | ✅ (0.3s) | ✅ (10s) | Firefox |
| D) Bonsai-8B Q2_K + CPU | `single-thread.wasm` (Memory64) | ✅ (0.9s) | ✅ (44s) | Firefox |
| A) SmolLM2-360M + WebGPU | `single-thread-webgpu-compat.wasm` | ✅ | ❌ | Chrome |
| B) Bonsai-8B Q2_K + WebGPU | `single-thread-webgpu.wasm` (Memory64) | ✅ | ❌ | Chrome |

BigInt / NaN エラーは解消。CPU 経路は両モデルとも完全動作。

---

## 未解決 — WebGPU 生成フェーズの `Failed to map error buffer`

### 症状

Chrome (WebGPU 有効) で `generate` リクエスト直後に以下が大量発生し生成失敗:

```
ggml_webgpu: Failed to map error buffer: Buffer was destroyed before mapping was resolved.
```

### 原因分析

llama.cpp WebGPU バックエンド (`ggml-webgpu.cpp`) がエラー検出のために
GPU バッファに `mapAsync()` を発行するが、JSPI ファイバーの suspend/resume
タイミングでバッファが先に破棄されてしまう。
今回の JS 変更 (cwrap → direct export) とは独立した llama.cpp upstream の問題。

### 影響範囲

- WebGPU + compat (小モデル) も同様に失敗する
- CPU モード (Firefox / Chrome WebGPU 無効) では再現しない
- ロード自体は成功するため、モデルのパラメータ読み込みには影響なし

### 対応方針 (TODO)

- [ ] Chrome で `--disable-dawn-features=disallow_unsafe_apis` 等のフラグで
  error scope の挙動を変えて再現確認
- [ ] llama.cpp upstream issue を調査・追跡
- [ ] 必要なら `ggml-webgpu.cpp` の `webgpu_context_check_errors` 前後に
  バッファライフタイムの延長パッチを検討

---

## WASM バリアント選択ロジック (参考)

| モデルサイズ | WebGPU | WASM | JSPI | Memory64 |
|---|---|---|---|---|
| ≤ 2GB (compat) | off | `single-thread-compat.wasm` | — | — |
| ≤ 2GB (compat) | on | `single-thread-webgpu-compat.wasm` | ✓ | — |
| > 2GB (Memory64) | off | `single-thread.wasm` | — | ✓ |
| > 2GB (Memory64) | on | `single-thread-webgpu.wasm` | ✓ | ✓ |

JSPI = `WebAssembly.Suspending / promising` (Chrome 専用、Firefox 未対応)。
Firefox では WebGPU WASM が選択不可のため自動的に CPU フォールバック。
