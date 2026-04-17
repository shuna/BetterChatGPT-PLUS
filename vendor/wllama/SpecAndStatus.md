# wllama WebGPU Integration — Spec and Status

## 設計方針

| 環境 | WASMバリアント | モデル配置 | CPUヒープ上限 |
|------|--------------|------------|--------------|
| WebGPU + compat (wasm32) | `single-thread-webgpu-compat.wasm` | 全レイヤーVRAM (`n_gpu_layers=999`) | 2 GB |
| WebGPU + Memory64 | `single-thread-webgpu.wasm` | 全レイヤーVRAM (`n_gpu_layers=999`) | 16 GB |
| CPU + compat (wasm32) | `single-thread-compat.wasm` | CPUヒープのみ | **2 GB（設計上限）** |
| CPU + Memory64 | `single-thread.wasm` | CPUヒープのみ | 16 GB |

- WebGPUが利用可能な場合は必ず `n_gpu_layers=999` でモデル全体をVRAMへ転送する。ヒープ上の重みコピーは最小化される。
- `use_mmap` はブラウザ環境では無効。常に `use_mmap: false`。`use_mmap: false` のとき llama.cpp はモデルファイルをmallocで別確保するため、WASMヒープ消費 ≈ ファイルサイズ × 2 となる。
- compat (wasm32) + CPU の 2 GB 上限は意図的な保守的設計。Memory64 / WebGPU が使えない環境では制限を受け入れる。4 GB に引き上げても 32-bit ftell の制約が残り 2 GB 超モデルは安定して動作しない。

---

## 達成済み

### WebGPU 生成時デッドロック修正（Step 3-A）

**問題**: `ggml_backend_webgpu_submit()` の `set_rows_error_buf_pool.MapAsync` が毎バッチ全32枚失敗し、`cv.wait()` 無限ループ → ブラウザクラッシュ。

**原因**: 失敗コールバックで `free_bufs()` が呼ばれずプール枯渇。シングルスレッドEmscriptenの `cv.wait()` はビジーループなので回収不能。

**修正** (`build_all_wasm.sh` → `apply_fork_compat_patches`): MapAsync失敗時に壊れたバッファを放棄し、`ggml_webgpu_create_buffer()` で新バッファペアを生成してプールへ補充。

### compat WebGPU の JS ラッパー修正

**問題**: `"Cannot convert a BigInt value to a number"` で生成失敗。

**原因**: 新Emscripten（4.0.x以降）がcompat(32-bit)WebGPUビルドでも `applySignatureConversions()` を生成するようになった。スクリプトが Memory64 用 BigInt ラッパーを 32-bit WASM に誤注入していた。

**修正** (`build_all_wasm.sh`): `patch_emscripten_jspi_exports` に `is_memory64` フラグを追加。compat は `makeWrapper_ppp` / `makeWrapper_pi32i32_async`（i32）、Memory64 は従来どおり BigInt ラッパーを注入。

### `makeWrapper_p` マーカー互換対応

**問題**: Emscripten バージョンアップで `Number(f())` → `f()>>>0` に変更され、ビルドスクリプトが `"ERROR: makeWrapper_p marker not found"` で中断。

**修正** (`build_all_wasm.sh`): 両形式を `next()` でフォールバック検索。

### compat CPU パスのメモリ上限対応

**問題**: SmolLM2 1.7B Q4_K_M（~1 GB）+ compat 2 GB上限 + `use_mmap:false` → 2倍消費でOOM。

**対応**: compat CPU テストモデルを Q2_K（~645 MB、2倍でも ~1.3 GB < 2 GB）に変更。2 GB 上限自体は設計上変えない。

### 検証テスト全通過

`tests/wasm-variant-verify.spec.ts` の全4ケースが通過（計 ~52秒）：

| ケース | WASM | モデル | 結果 |
|--------|------|--------|------|
| A) SmolLM2 + WebGPU | `single-thread-webgpu-compat.wasm` | SmolLM2 1.7B Q4_K_M | PASS |
| B) Bonsai-8B + WebGPU | `single-thread-webgpu.wasm` | Bonsai-8B Q2_K | PASS |
| C) SmolLM2 + CPU | `single-thread-compat.wasm` | SmolLM2 1.7B Q2_K | PASS |
| D) Bonsai-8B + CPU | `single-thread.wasm` | Bonsai-8B Q2_K | PASS |

---

## 未解決・今後の課題

### MapAsync 失敗の根本原因が未特定

`"Buffer was destroyed before mapping was resolved."` がなぜ毎回発生するかは不明のまま。

- バッファは MapAsync 呼び出し前は Unmapped 状態（正常）
- 失敗ステータスは `AbortPendingMap` と推測されるが、Chrome DevTools での詳細確認は未実施
- 候補: `WGPUBufferImpl::WillDropLastExternalRef()` の参照カウント問題、または Chrome の Dawn 実装の制約
- 現在の Step 3-A 修正はクラッシュを防ぐが、set_rows エラーチェック（SET_ROWS index overflow 検出）が毎回機能していない

### multi-thread WASMバリアントの未検証

`multi-thread-webgpu*.wasm` / `multi-thread*.wasm` は今回のビルドで未更新・未検証。COOP/COEP ヘッダが設定される Phase 8 以降に対応。

### Memory64 + WebGPU WASM の再ビルド未実施

`single-thread-webgpu.wasm`（05:17 ビルド）は `is_memory64` フラグ追加前のスクリプトでビルドされたが、BigInt ラッパーは正しく注入済みでテスト B 通過。次回の全バリアントビルド時に自動更新される。

### upstream llama.cpp へのPR

Step 3-A（MapAsync失敗時のバッファ再生成）は `ggml-webgpu` の一般的なバグに該当する。現在は `.wllama-fork` のパッチスクリプト内に留まっているが、upstream llama.cpp へのPRとして提案できる。
