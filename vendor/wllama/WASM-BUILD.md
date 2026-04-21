# wllama WASM Build Guide

This document describes how to rebuild the single deployed `vendor/wllama`
artifact set for weavelet-canvas.

Repository policy:

- upstream `wllama` / `llama.cpp` sources are fetched into `vendor/wllama-src/` (gitignore'd)
- reproducible differences are stored as patches under `vendor/wllama-patches/`
- low-bit-q specific extensions are maintained under `vendor/wllama/lowbit-q/`

## Overview

The build produces WASM variants along 3 axes. Each WASM variant must be
distributed with the Emscripten JS glue produced by the same build variant —
glue files are **not interchangeable** across variants:

| Axis | Values | Notes |
|------|--------|-------|
| Threading | single-thread / multi-thread | Multi-thread requires COOP/COEP headers |
| Memory64 | memory64 / compat | Memory64 allows >2 GB models; compat for older browsers |
| WebGPU async mode | JSPI / Asyncify / none | JSPI and Asyncify are **separate build types** with separate WASM, separate glue |

**JSPI WebGPU variants** additionally require `-sJSPI=1`. The llama.cpp
`ggml-webgpu` backend requests `WGPUInstanceFeatureName_TimedWaitAny` and uses
`Instance::WaitAny()` during adapter/device initialization. The emdawnwebgpu
runtime rejects `TimedWaitAny` when neither Asyncify nor JSPI is enabled; in
that case `wgpuCreateInstance()` returns null and model loading aborts at:

```
ggml-webgpu.cpp:2593: GGML_ASSERT(webgpu_ctx->instance != nullptr) failed
```

Resulting files:

```
wasm/single-thread/wllama.wasm          (~2.2 MB)
wasm/multi-thread/wllama.wasm           (~2.3 MB)
wasm/single-thread-cpu-compat/wllama.wasm   (~2.2 MB)
wasm/multi-thread-cpu-compat/wllama.wasm    (~2.2 MB)
wasm/single-thread-webgpu/wllama.wasm   (~3.0 MB)
wasm/multi-thread-webgpu/wllama.wasm    (~3.1 MB)
wasm/single-thread-webgpu-compat/wllama.wasm (~2.9 MB)
wasm/multi-thread-webgpu-compat/wllama.wasm  (~3.0 MB)
```

Each variant also produces a `wllama.js` (Emscripten JS glue) file. The JS glue
is not interchangeable across Memory64/compat/WebGPU variants, and every
variant's glue must be patched and embedded before copying artifacts into the
main project.

Variant mapping:

| Runtime file in main project | WASM source | Embedded JS glue constant |
|------------------------------|-------------|---------------------------|
| `vendor/wllama/single-thread-cpu-mem64.wasm` | `wasm/single-thread-cpu-mem64/wllama.wasm` | `WLLAMA_SINGLE_THREAD_CODE` |
| `vendor/wllama/multi-thread-cpu-mem64.wasm` | `wasm/multi-thread-cpu-mem64/wllama.wasm` | `WLLAMA_MULTI_THREAD_CODE` |
| `vendor/wllama/single-thread-cpu-compat.wasm` | `wasm/single-thread-cpu-compat/wllama.wasm` | `WLLAMA_SINGLE_THREAD_COMPAT_CODE` |
| `vendor/wllama/multi-thread-cpu-compat.wasm` | `wasm/multi-thread-cpu-compat/wllama.wasm` | `WLLAMA_MULTI_THREAD_COMPAT_CODE` |
| `vendor/wllama/single-thread-webgpu.wasm` | `wasm/single-thread-webgpu/wllama.wasm` | `WLLAMA_SINGLE_THREAD_WEBGPU_CODE` |
| `vendor/wllama/multi-thread-webgpu.wasm` | `wasm/multi-thread-webgpu/wllama.wasm` | `WLLAMA_MULTI_THREAD_WEBGPU_CODE` |
| `vendor/wllama/single-thread-webgpu-compat.wasm` | `wasm/single-thread-webgpu-compat/wllama.wasm` | `WLLAMA_SINGLE_THREAD_WEBGPU_COMPAT_CODE` |
| `vendor/wllama/multi-thread-webgpu-compat.wasm` | `wasm/multi-thread-webgpu-compat/wllama.wasm` | `WLLAMA_MULTI_THREAD_WEBGPU_COMPAT_CODE` |
| `vendor/wllama/single-thread-webgpu-asyncify-compat.wasm` | `wasm/single-thread-webgpu-asyncify-compat/wllama.wasm` | (Asyncify glue, disabled until E2E verified) |
| `vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm` | `wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm` | (Asyncify glue, disabled until E2E verified) |

## Prerequisites

### Emscripten SDK

A single SDK version covers all build targets:

| Build type | Required emsdk |
|------------|----------------|
| CPU compat (`*-cpu-compat`) | **≥ 5.0.0** |
| CPU Memory64 (`*-cpu-mem64`) | **≥ 5.0.0** |
| WebGPU (`*-webgpu-compat`) | **≥ 5.0.0** |

The automated build script (`scripts/wllama/build.sh`) enforces this via a
semver check and will exit with an error if the version is below 5.0.0.

```bash
# Install (one-time)
cd ~/emsdk
./emsdk install latest
./emsdk activate latest
source emsdk_env.sh

# CPU builds (compat + Memory64)
bash scripts/wllama/build.sh

# WebGPU JSPI builds (compat only — Memory64 WebGPU not built)
WLLAMA_BUILD_WEBGPU=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh

# WebGPU Asyncify builds (experimental — JSPI-less; starts disabled in variant-table)
# Risk: -sASYNCIFY=1 + -fwasm-exceptions may be incompatible under current emsdk.
# See SpecAndStatus.md for investigation notes before promoting to active.
WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh

# Both WebGPU variants at once
WLLAMA_BUILD_WEBGPU=1 WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh
```

**Pin the exact version** once a build succeeds. Update the version number here
after a reproducible build is confirmed.

### emdawnwebgpu (for WebGPU builds only)

emsdk 4.0.10+ includes `emdawnwebgpu` as a **built-in port** — no separate
download is required. The build script passes `--use-port=emdawnwebgpu` which
auto-downloads and caches the package on first use.

The emsdk-bundled emdawnwebgpu (`v20250531.224602`) lacks several Dawn-native
types used by newer llama.cpp (`DawnTogglesDescriptor`, `SubgroupMatrixConfig`,
`InstanceFeatureName::TimedWaitAny`, `FeatureName::ImplicitDeviceSynchronization`).
These are guarded with `#ifndef __EMSCRIPTEN__` in this fork's ggml-webgpu.cpp.
See **Section 5** for details.

## Build Steps

### Step 1: Build WASM binaries

```bash
cd vendor/wllama-src
./scripts/build_all_wasm.sh
```

`vendor/wllama-src/` is a gitignore'd local working tree created from upstream
sources. Set it up once with `bash scripts/wllama/setup.sh`, which clones
wllama and applies patches from `vendor/wllama-patches/`.

The intended flow:

1. `bash scripts/wllama/setup.sh` — fetch upstream into `vendor/wllama-src/`, apply patches
2. `cd vendor/wllama-src && ./scripts/build_all_wasm.sh`

This builds all 8 variants under `wasm/`.

Each directory contains:
- `wllama.wasm` — the WASM binary
- `wllama.js` — the Emscripten JS glue (runtime + import definitions)

To rebuild only selected variants, pass variant names as arguments:

```bash
# run from vendor/wllama-src/
./scripts/build_all_wasm.sh \
  single-thread-webgpu \
  multi-thread-webgpu \
  single-thread-webgpu-compat \
  multi-thread-webgpu-compat
```

This is the recommended fast path when only the base WebGPU backend or its JS
glue needs to be refreshed.

### Step 2: Patch generated JS glue (CRITICAL)

Before embedding the generated glue, patch every `wasm/*/wllama.js` file for
emsdk 4.x heap-view compatibility:

This patch is intentionally strict. Do not only check whether
`Module["HEAPU8"]=HEAPU8` exists. A missing semicolon before `Module` produces
invalid minified JavaScript such as:

```javascript
HEAPU64=new BigUint64Array(b)Module["HEAPU8"]=HEAPU8
```

Also do not rely on one quote style when checking already-patched files. Some
tools may preserve `Module["HEAPU8"]`, while a hand patch might use
`Module['HEAPU8']`. Both are valid JavaScript; the important points are:

- the assignment must be inside `updateMemoryViews()`
- it must come after `HEAPU8` is assigned
- it must be separated from the previous expression with `;`
- verification must reject `BigUint64Array(...)Module[...]` with no separator

```bash
node <<'NODE'
const fs = require('fs');
const variants = [
  'single-thread-cpu-mem64',
  'multi-thread-cpu-mem64',
  'single-thread-cpu-compat',
  'multi-thread-cpu-compat',
  'single-thread-webgpu',
  'multi-thread-webgpu',
  'single-thread-webgpu-compat',
  'multi-thread-webgpu-compat',
];

let changed = 0;
for (const variant of variants) {
  const path = `wasm/${variant}/wllama.js`;
  let code = fs.readFileSync(path, 'utf8');

  const validPatch = /;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code);
  const missingSemicolon = /BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code);
  if (missingSemicolon) {
    throw new Error(`${path} has an invalid missing semicolon before Module.HEAPU8`);
  }
  if (validPatch) {
    continue;
  }

  const before = code;
  code = code.replace(
    /(HEAPU64\s*=\s*new BigUint64Array\((?:wasmMemory\.buffer|b)\);?)(\s*})/,
    '$1;Module["HEAPU8"]=HEAPU8$2',
  );

  if (code === before) {
    throw new Error(`Could not patch ${path}: updateMemoryViews() shape changed`);
  }

  fs.writeFileSync(path, code);
  changed++;
}

console.log(`Patched HEAPU8 export in ${changed} file(s)`);
NODE
```

Then verify all eight glue files have the patch:

```bash
node <<'NODE'
const fs = require('fs');
const variants = [
  'single-thread-cpu-mem64',
  'multi-thread-cpu-mem64',
  'single-thread-cpu-compat',
  'multi-thread-cpu-compat',
  'single-thread-webgpu',
  'multi-thread-webgpu',
  'single-thread-webgpu-compat',
  'multi-thread-webgpu-compat',
];

for (const variant of variants) {
  const path = `wasm/${variant}/wllama.js`;
  const code = fs.readFileSync(path, 'utf8');
  if (!/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code)) {
    throw new Error(`${path} does not expose Module.HEAPU8`);
  }
  if (/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code)) {
    throw new Error(`${path} has an invalid missing semicolon before Module.HEAPU8`);
  }
}

console.log('OK: all glue variants expose Module.HEAPU8');
NODE
```

### Step 3: Embed JS glue into the library (CRITICAL)

The wllama library embeds the Emscripten JS glue as string constants. After
rebuilding WASM, you **must** update the embedded glue:

```bash
# Run from vendor/wllama-src/
# Re-embed all JS glue variants into generated.ts
npm run build:worker

# Bundle the library
npm run build:tsup
```

**Why this matters:** The WASM binary and its JS glue are paired — the glue
defines the exact import functions (with minified names `a`, `b`, `c`...) that
the WASM binary expects. If you deploy new WASM binaries without updating the
embedded JS glue, `WebAssembly.instantiate()` will fail with:

    Import #0 "a": module is not an object or function

Verify the embedded bundle still contains the required runtime patches (run from `vendor/wllama-src/`):

```bash
node <<'NODE'
const fs = require('fs');
const code = fs.readFileSync('esm/index.js', 'utf8');

if (!/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code)) {
  throw new Error('esm/index.js does not contain the Module.HEAPU8 patch');
}

if (/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code)) {
  throw new Error('esm/index.js contains an invalid missing semicolon before Module.HEAPU8');
}

if (!code.includes('WebAssembly.Suspending')) {
  throw new Error('esm/index.js does not contain JSPI support for WebGPU glue');
}

if (code.includes('_emscripten_has_asyncify=()=>0')) {
  throw new Error('esm/index.js still contains asyncify=0 glue');
}

console.log('OK: embedded glue includes HEAPU8 export and JSPI WebGPU support');
NODE
```

### Step 4: Copy artifacts to the main project

Run from `vendor/wllama-src/` (one level inside the repo root):

```bash
# Copy WASM binaries
cp wasm/single-thread-cpu-mem64/wllama.wasm    ../vendor/wllama/single-thread-cpu-mem64.wasm
cp wasm/multi-thread-cpu-mem64/wllama.wasm     ../vendor/wllama/multi-thread-cpu-mem64.wasm
cp wasm/single-thread-cpu-compat/wllama.wasm   ../vendor/wllama/single-thread-cpu-compat.wasm
cp wasm/multi-thread-cpu-compat/wllama.wasm    ../vendor/wllama/multi-thread-cpu-compat.wasm
cp wasm/single-thread-webgpu/wllama.wasm         ../vendor/wllama/single-thread-webgpu.wasm
cp wasm/multi-thread-webgpu/wllama.wasm          ../vendor/wllama/multi-thread-webgpu.wasm
cp wasm/single-thread-webgpu-compat/wllama.wasm  ../vendor/wllama/single-thread-webgpu-compat.wasm
cp wasm/multi-thread-webgpu-compat/wllama.wasm   ../vendor/wllama/multi-thread-webgpu-compat.wasm

# Copy bundled JS library
cp esm/index.js ../src/vendor/wllama/index.js
```

### Step 5: Verify the main project copy

Run these checks from `vendor/wllama-src/` after copying:

```bash
node <<'NODE'
const fs = require('fs');
const wasmPairs = [
  ['wasm/single-thread-cpu-mem64/wllama.wasm',   '../vendor/wllama/single-thread-cpu-mem64.wasm'],
  ['wasm/multi-thread-cpu-mem64/wllama.wasm',    '../vendor/wllama/multi-thread-cpu-mem64.wasm'],
  ['wasm/single-thread-cpu-compat/wllama.wasm',  '../vendor/wllama/single-thread-cpu-compat.wasm'],
  ['wasm/multi-thread-cpu-compat/wllama.wasm',   '../vendor/wllama/multi-thread-cpu-compat.wasm'],
  ['wasm/single-thread-webgpu/wllama.wasm', '../vendor/wllama/single-thread-webgpu.wasm'],
  ['wasm/multi-thread-webgpu/wllama.wasm', '../vendor/wllama/multi-thread-webgpu.wasm'],
  ['wasm/single-thread-webgpu-compat/wllama.wasm', '../vendor/wllama/single-thread-webgpu-compat.wasm'],
  ['wasm/multi-thread-webgpu-compat/wllama.wasm', '../vendor/wllama/multi-thread-webgpu-compat.wasm'],
];

for (const [src, dst] of wasmPairs) {
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dst);
  if (!a.equals(b)) {
    throw new Error(`${dst} is not the current build output from ${src}`);
  }
}

const embedded = fs.readFileSync('esm/index.js', 'utf8');
const vendored = fs.readFileSync('../src/vendor/wllama/index.js', 'utf8');
if (embedded !== vendored) {
  throw new Error('../src/vendor/wllama/index.js is not the current esm/index.js');
}

console.log('OK: vendored WASM and JS artifacts match the current build');
NODE
```

## Known Pitfalls

### 1. WASM and JS glue must match

The most common failure mode. Every WASM binary has a paired `.js` file with
matching import function definitions. If you update one without the other, WASM
instantiation fails at runtime.

**Rule:** Always run Step 2 (patch generated glue) and Step 3 (embed + bundle)
after Step 1 (WASM build).

### 2. Every runtime variant requires separate JS glue

The vendored wllama library embeds **8 JS glue variants**:
- single-thread / multi-thread
- Memory64 / compat
- WebGPU / no-WebGPU

Memory64 glue uses 64-bit pointer conversion and creates Memory64 WASM memory.
Compat glue uses 32-bit pointer conversion and regular WASM memory. WebGPU glue
also includes additional Dawn/WebGPU import functions. Loading any WASM variant
with a different variant's glue can fail during instantiation or later calls.

**Current status:** `src/vendor/wllama/index.js` selects the embedded glue by
the selected WASM filename. `src/workers/wllamaWorker.ts` chooses the WASM file
from browser capabilities:
- WebGPU when local model settings allow it and `requestAdapter()` +
  `requestDevice({ requiredFeatures: ['shader-f16'] })` succeed. If llama.cpp
  still aborts during WebGPU model load, the runtime recreates the worker and
  retries with CPU WASM.
- Memory64 only when the model file is >= 2 GiB and a minimal Memory64 WASM
  module compiles; smaller models use compat builds to avoid Memory64-only
  runtime issues on devices that do not need it
- multi-thread only when SharedArrayBuffer and `crossOriginIsolated` are usable

### 3. emsdk version must be consistent

All WASM variants and the JS glue must be built with the **same emsdk version**.
Different emsdk versions may produce incompatible import tables or runtime code.

### 4. Shell quoting in build scripts

The `build_worker.sh` script uses `JSON.stringify()` via Node.js to embed
JS glue code as string literals in `generated.ts`. This produces **double-quoted**
JSON strings where:
- Backslashes and double quotes are escaped
- **Single quotes are NOT escaped**

When `tsup` bundles `generated.ts`, it may convert string delimiters from
double quotes to single quotes. If the embedded code contains unescaped single
quotes, this would truncate the string and break the library.

The current Emscripten output has very few single quotes (only 2 in the
entire glue file), so this hasn't been a problem yet. However, if you modify
the build pipeline or upgrade Emscripten and see truncated embedded code:

- Check if `build_worker.sh` correctly escapes the content
- Consider switching `generated.ts` to use template literals (backticks)
  instead of regular string literals
- Verify the embedded string length matches the source file:
  ```bash
  node -e "
    const gen = require('fs').readFileSync('src/workers-code/generated.ts','utf8');
    const m = gen.match(/WLLAMA_SINGLE_THREAD_CODE = \"((?:[^\"\\\\\\\\]|\\\\\\\\.)*)\"/);
    const src = require('fs').readFileSync('src/single-thread/wllama.js','utf8');
    console.log('embedded:', m[1].length, 'source:', src.length);
  "
  ```

### 5. WebGPU build patches (ggml-webgpu.cpp)

The llama.cpp `ggml-webgpu.cpp` uses Dawn-native APIs that are absent from the
emdawnwebgpu package bundled with emsdk 4.0.10/4.0.14 (`v20250531.224602`).
These are guarded with `#ifndef __EMSCRIPTEN__` in this fork.

**APIs guarded in ggml-webgpu.cpp:**

| API | Reason | Action |
|-----|--------|--------|
| `wgpu::DawnTogglesDescriptor` | Dawn-specific toggle type, not in emdawnwebgpu | `#ifndef __EMSCRIPTEN__` (3 locations: adapter, device, instance setup) |
| `wgpu::SubgroupMatrixConfig` (struct member) | Not in emdawnwebgpu pkg | `#ifndef __EMSCRIPTEN__` in struct definition |
| `wgpu::AdapterPropertiesSubgroupMatrixConfigs` | Not in emdawnwebgpu pkg | `#ifndef __EMSCRIPTEN__` in adapter info block |
| `wgpu::FeatureName::ChromiumExperimentalSubgroupMatrix` | Chrome-specific, not in emdawnwebgpu | `#ifndef __EMSCRIPTEN__` |
| `wgpu::FeatureName::ImplicitDeviceSynchronization` | Not in emdawnwebgpu | Excluded from `required_features` for EMSCRIPTEN |
| `wgpu::InstanceFeatureName::TimedWaitAny` | Not in emdawnwebgpu | `#ifndef __EMSCRIPTEN__` in instance setup |
| `OnSubmittedWorkDone` callback signature | emdawnwebgpu takes `(status)`, newer Dawn takes `(status, StringView)` | `#ifdef __EMSCRIPTEN__` with one-arg lambda |
| `uint` (bare type) | GCC extension, not standard C++ | Replaced with `uint32_t` |

Additionally, `CMakeLists.txt` in `ggml-webgpu/` was patched to use
`--use-port=emdawnwebgpu` (built-in) when `EMDAWNWEBGPU_DIR` is empty,
and `target_link_options` changed from `PRIVATE` to `INTERFACE` so the port
flag propagates to the final linker invocation.

If you update the `llama.cpp` submodule, re-check these areas in the new
`ggml-webgpu.cpp` — newer Dawn API changes may add or remove any of them.

The wllama wrapper must also pass `LoadModelConfig.n_gpu_layers` through to
`glue_msg_load_req`. The upstream wrapper used to send `n_gpu_layers: 0`
unconditionally; with WebGPU builds that silently disables GPU layer offload
even when the application requested it.

Model-load progress has two sources. The TypeScript worker wrapper emits file
copy progress while the `Blob` is streamed into the Emscripten FS:

```text
wllama-file-stage:<stage>
wllama-file-progress:<percent> name=<file> offset=<bytes> size=<bytes>
```

The native llama.cpp load then emits progress from
`llama_model_params.progress_callback` in `cpp/actions.hpp`:

```text
@@INFO@@wllama-load-stage:<stage>
@@INFO@@wllama-load-progress:<percent>
```

The application worker maps file-copy progress to the early UI progress range
and llama.cpp tensor-load progress to the native-load range. The heartbeat must
report the latest real progress counters (`fileCopy` and `native`) rather than
inventing progress while the backend is blocked. If native progress is not
visible in the debug view, verify that the deployed WebGPU WASM contains these
strings:

```bash
strings vendor/wllama/single-thread-webgpu-compat.wasm | rg 'wllama-load-stage|wllama-load-progress'
```

### 6. emsdk 4.x: HEAPU8 not exported on Module object

In emsdk 4.0.x, Emscripten no longer exposes heap views (HEAPU8, HEAP32, etc.)
as properties on the `Module` object. They are closure-local variables updated by
`updateMemoryViews()`. The wllama worker code (`llama-cpp.js`) accesses
`Module.HEAPU8` and will fail with:

    TypeError: Cannot read properties of undefined (reading 'set')

**Fix applied in this fork:** every generated `wasm/*/wllama.js` glue file is
patched before embedding to add `Module["HEAPU8"]=HEAPU8` at the end of
`updateMemoryViews()`:

```javascript
// Before closing brace of updateMemoryViews():
HEAPU64=new BigUint64Array(b);Module["HEAPU8"]=HEAPU8}
```

The semicolon before `Module` is required. Emscripten emits heavily minified
glue, and `HEAPU64=new BigUint64Array(b)` is not guaranteed to end with a
semicolon. A patch that simply inserts `Module["HEAPU8"]=HEAPU8` can create
invalid JavaScript:

```javascript
// Broken:
HEAPU64=new BigUint64Array(b)Module["HEAPU8"]=HEAPU8}
```

Verification should therefore check the syntax shape, not just the existence of
`HEAPU8`. Use a quote-tolerant regex such as
`/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/` and reject
`/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/`.
This matters because `Module["HEAPU8"]` and `Module['HEAPU8']` are equivalent
JavaScript, but a simple `includes('Module["HEAPU8"]=HEAPU8')` check misses the
single-quote form and can also skip over a syntactically broken double-quote
form.

**When this matters:** Whenever the JS glue files are updated from a new WASM build,
re-apply this patch before running `npm run build:worker`.

### 7. emsdk 4.x + Memory64: cwrap pointer type must be `'pointer'`

In emsdk 4.0.x with Memory64 (`-sMEMORY64=1`), WASM pointer parameters are i64
(BigInt). The Emscripten `cwrap` shortcut for all-numeric arguments bypasses type
conversion, so calling WASM functions with JS Numbers fails with:

    TypeError: Cannot convert 179 to a BigInt

**Fix applied in this fork:** `src/workers-code/llama-cpp.js` uses `'pointer'`
instead of `'number'` for WASM pointer arguments in cwrap calls. The `ccall`
path (triggered when any arg type is `'pointer'`) handles BigInt conversion.
Keep non-pointer arguments, such as `wllama_malloc`'s dummy `uint32_t`, as
`'number'`:

```javascript
// Before (broken with Memory64):
const pointer = 'number';
wllamaMalloc = callWrapper('wllama_malloc', pointer, ['number', pointer]);

// After (Memory64-compatible):
const pointer = 'pointer';
wllamaMalloc = callWrapper('wllama_malloc', pointer, [pointer, 'number']);
```

**When this matters:** Only affects Memory64 builds (`single-thread-cpu-mem64.wasm`,
`multi-thread-cpu-mem64.wasm`). Compat builds (`*-compat.wasm`) use 32-bit pointers
and would work with `'number'`, but `'pointer'` is safe for both.

### 8. cmake vs EMCC_CFLAGS for WebGPU port

The `--use-port=` flag for emdawnwebgpu must be passed via
`CMAKE_EXE_LINKER_FLAGS` (not `EMCC_CFLAGS`). Using both causes a
"duplicate port name" error. The `build_all_wasm.sh` script handles this
correctly by:
- Setting `EMCC_CFLAGS=""` during `emcmake cmake` configure
- Passing `--use-port=` via `-DCMAKE_EXE_LINKER_FLAGS` for WebGPU builds
- Setting `EMCC_CFLAGS` with other flags only during `emmake make`

### 9. WebGPU requires JSPI for TimedWaitAny

`ggml-webgpu.cpp` creates the WebGPU instance with:

```cpp
std::vector<wgpu::InstanceFeatureName> instance_features = {
  wgpu::InstanceFeatureName::TimedWaitAny,
};
```

The emdawnwebgpu implementation validates that `TimedWaitAny` is only enabled
when Asyncify or JSPI is available. If WebGPU builds are produced without
JSPI or Asyncify, the generated glue contains:

```javascript
_emscripten_has_asyncify=()=>0
```

and `wgpuCreateInstance()` returns null before adapter selection starts.

**Fix applied in this fork:** `scripts/build_all_wasm.sh` appends
`-sJSPI=1` only for WebGPU variants. Plain `-sASYNCIFY=1` is not used here
because Binaryen's Asyncify pass fails with this wasm-exceptions + memory64
build in emsdk 4.0.x. After rebuilding, verify the generated WebGPU glue no
longer reports `_emscripten_has_asyncify=()=>0`, then re-run
`npm run build:worker`, `npm run build:tsup`, and copy the rebuilt WebGPU WASM
plus `esm/index.js` into the main project.

### 10. Call `Module._wllama_*` directly — do not use `cwrap`

The inner worker (`llama-cpp.js`) calls the five wllama exports directly via
`Module._wllama_*` instead of going through `Module.cwrap()` / `ccall()`.

`applySignatureConversions` (patched by `build_all_wasm.sh`) already normalises
every `Module._wllama_*` export across all 8 variants so that:

- inputs accept plain JS Numbers (no manual BigInt conversion in JS)
- the return value is a plain JS Number (or `Promise<Number>` for JSPI exports)

A single `await` + `Number()` call therefore works uniformly across all variants:

```javascript
// Works for all 8 variants:
wllamaMalloc = async (size, dummy) => Number(await Module._wllama_malloc(size, dummy));
wllamaStart  = async () => Number(await Module._wllama_start());
wllamaExit   = async () => Number(await Module._wllama_exit());
wllamaDebug  = async () => Number(await Module._wllama_debug());
wllamaAction = async (action, reqPtr) => {
  const bytes = new TextEncoder().encode(action);
  const actPtr = await wllamaMalloc(bytes.byteLength + 1, 0);
  Module.HEAPU8.set(bytes, actPtr);
  Module.HEAPU8[actPtr + bytes.byteLength] = 0;
  return Number(await Module._wllama_action(actPtr, reqPtr));
};
```

**Why not cwrap?** `cwrap`/`ccall` contain an async-detection bug specific to the
Memory64+WebGPU combination: when `wllama_malloc` is wrapped in
`applySignatureConversions` with `Promise.resolve(...).then(Number)` the return
is a `Promise`, but `ccall` without `{async:true}` calls `Number(Promise)` = NaN
synchronously. That NaN propagates as the input pointer to `wllama_action` and
causes `BigInt(NaN)` to throw. Bypassing `cwrap` avoids this class of issue
entirely.

**When this matters:** Any change to how wllama exports are called. Do not
reintroduce `cwrap` without also auditing the async/sync path for all 8 variants.

### 11. Memory64 glue must wrap custom `wllama_*` i64 exports

On `MEMORY64=1` builds, Emscripten emits an `applySignatureConversions(...)`
helper so JavaScript can call selected i64 exports using plain Numbers. The
generated helper does not automatically include custom `wllama_*` exports.

This fork's `build_all_wasm.sh` patches the generated glue to extend
`applySignatureConversions` for all Memory64 variants:

**Memory64 + WebGPU (JSPI)** — `wllama_start/action/exit/debug` are JSPI-wrapped
and return `Promise<BigInt>`. We use async wrappers. `wllama_malloc` is NOT JSPI
and returns `BigInt` synchronously — we use a *sync* wrapper:

```javascript
// sync — wllama_malloc is NOT a JSPI export
var makeWrapper_pi64i32 = f => (a0,a1) => Number(f(BigInt(a0),a1));
// async — wllama_start/exit/debug are JSPI exports returning Promise<BigInt>
var makeWrapper_p_async  = f => () => Promise.resolve(f()).then(v=>Number(v));
// async — wllama_action is a JSPI export returning Promise<BigInt>
var makeWrapper_pi64i64  = f => (a0,a1) => Promise.resolve(f(BigInt(a0),BigInt(a1))).then(v=>Number(v));

wasmExports["wllama_malloc"] = makeWrapper_pi64i32(wasmExports["wllama_malloc"]);
wasmExports["wllama_start"]  = makeWrapper_p_async(wasmExports["wllama_start"]);
wasmExports["wllama_action"] = makeWrapper_pi64i64(wasmExports["wllama_action"]);
wasmExports["wllama_exit"]   = makeWrapper_p_async(wasmExports["wllama_exit"]);
wasmExports["wllama_debug"]  = makeWrapper_p_async(wasmExports["wllama_debug"]);
```

**Memory64 non-WebGPU (no JSPI)** — exports use minified names (e.g. `"x"`,
`"y"`, `"z"`, `"A"`, `"B"`). The build script extracts these names from
`assignWasmExports()` and injects sync-only wrappers:

```javascript
var makeWrapper_pi64i32_sync = f => (a0,a1) => Number(f(BigInt(a0),a1));
var makeWrapper_pi64i64_sync = f => (a0,a1) => Number(f(BigInt(a0),BigInt(a1)));

wasmExports["x"] = makeWrapper_pi64i32_sync(wasmExports["x"]);  // wllama_malloc
wasmExports["y"] = makeWrapper_p(wasmExports["y"]);              // wllama_start
wasmExports["z"] = makeWrapper_pi64i64_sync(wasmExports["z"]);  // wllama_action
wasmExports["A"] = makeWrapper_p(wasmExports["A"]);              // wllama_exit
wasmExports["B"] = makeWrapper_p(wasmExports["B"]);              // wllama_debug
```

(The actual minified names are discovered at build time and may differ across
emsdk versions or after llama.cpp submodule updates.)

**compat WebGPU (32-bit + JSPI)** — Newer emsdk versions (observed with 4.0.x)
generate `applySignatureConversions` even for compat WebGPU builds. These must
receive **i32 wrappers** (plain Numbers), NOT BigInt wrappers. The
`patch_emscripten_jspi_exports` function accepts a second argument:

```bash
# compat WebGPU — i32 wrappers
patch_emscripten_jspi_exports wllama.js false

# Memory64 WebGPU — i64/BigInt wrappers
patch_emscripten_jspi_exports wllama.js true
```

For compat WebGPU the injected helpers are:

```javascript
// wllama_malloc(i32 size, i32 dummy)->i32: sync, uses existing makeWrapper_ppp
wasmExports["wllama_malloc"] = makeWrapper_ppp(wasmExports["wllama_malloc"]);
// wllama_start/exit/debug ()->i32: JSPI async, no args
var makeWrapper_p_async      = f => () => Promise.resolve(f()).then(v=>v>>>0);
// wllama_action(i32,i32)->i32: JSPI async, 2 i32 args
var makeWrapper_pi32i32_async = f => (a0,a1) => Promise.resolve(f(a0,a1)).then(v=>v>>>0);
```

Injecting BigInt wrappers into a 32-bit WASM build causes:

    TypeError: Cannot convert a BigInt value to a number

at the first wllama_action call.

**compat non-WebGPU (32-bit, no JSPI)** — No injection needed; exports natively
accept/return 32-bit Numbers.

**When this matters:** Any `build_all_wasm.sh` run re-applies these patches
automatically. If you upgrade emsdk or update llama.cpp and see BigInt / NaN
errors from `wllama_malloc` or `wllama_action`, check that the patch still
applies (the `makeWrapper_p` marker must be present in the generated glue).

### 12. `makeWrapper_p` marker string changed in emsdk 4.0.x

`applySignatureConversions` was previously generated as:

```javascript
var makeWrapper_p=f=>()=>Number(f());
```

Newer emsdk emits:

```javascript
var makeWrapper_p=f=>()=>f()>>>0;
```

Both forms are functionally equivalent for 32-bit values. The build script uses
`next()` to try both forms so that builds succeed across emsdk versions:

```python
marker = next(
    (s for s in ('var makeWrapper_p=f=>()=>f()>>>0;',
                 'var makeWrapper_p=f=>()=>Number(f());') if s in body),
    None)
if marker is None:
    raise SystemExit(f"ERROR: makeWrapper_p marker not found in {path}")
```

**When this matters:** If you see `ERROR: makeWrapper_p marker not found` after
an emsdk upgrade, add the new form to the tuple above.

### 13. WebGPU set_rows error buffer pool exhaustion

During generation, `ggml_backend_webgpu_submit()` maps error-check buffers
asynchronously via `MapAsync(AllowSpontaneous)`. In the Emscripten build these
callbacks consistently fail with:

    ggml_webgpu: Failed to map error buffer: Buffer was destroyed before mapping was resolved.

Without a fix every `MapAsync` failure leaks a slot from `set_rows_error_buf_pool`
(fixed size: 32 slots). After 32 failures the pool is empty, `alloc_bufs()` calls
`cv.wait()` which becomes a busy-spin in single-threaded Emscripten, and the
browser tab hangs indefinitely.

**Fix applied in this fork (Step 3-A):** On `MapAsync` failure the callback
creates a fresh buffer pair via `ggml_webgpu_create_buffer()` and returns it to
the pool, keeping the pool full regardless of how many callbacks fail:

```cpp
if (status != wgpu::MapAsyncStatus::Success) {
    GGML_LOG_ERROR("ggml_webgpu: Failed to map error buffer: %s\n", ...);
    webgpu_pool_bufs new_bufs;
    ggml_webgpu_create_buffer(ctx->device, new_bufs.dev_buf, ...);
    ggml_webgpu_create_buffer(ctx->device, new_bufs.host_buf, ...);
    ctx->set_rows_error_buf_pool.free_bufs({ new_bufs });
}
```

The failed buffers are abandoned (not unmapped or returned) because their state
is undefined after an aborted map.

**When this matters:** Any WebGPU build that reaches the generation phase. The
patch is applied automatically by `apply_fork_compat_patches()` in
`build_all_wasm.sh`. If you update the llama.cpp submodule and the patch no
longer applies, check that the original `MapAsync` loop in
`ggml_backend_webgpu_submit()` still matches the `old` string in the script.
