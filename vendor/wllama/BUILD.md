# wllama WASM Build Guide (Custom Fork)

This document describes how to build the wllama WASM binaries and JS library
for the weavelet-canvas project.

## Overview

The build produces 8 WASM variants along 3 axes. Each WASM variant must be
distributed with the Emscripten JS glue produced by the same build variant:

| Axis | Values | Notes |
|------|--------|-------|
| Threading | single-thread / multi-thread | Multi-thread requires COOP/COEP headers |
| Memory64 | memory64 / compat | Memory64 allows >2 GB models; compat for older browsers |
| WebGPU | webgpu / no-webgpu | GPU acceleration via Dawn/emdawnwebgpu |

WebGPU variants additionally require `-sJSPI=1`. The llama.cpp
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
wasm/single-thread-compat/wllama.wasm   (~2.2 MB)
wasm/multi-thread-compat/wllama.wasm    (~2.2 MB)
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
| `vendor/wllama/single-thread.wasm` | `wasm/single-thread/wllama.wasm` | `WLLAMA_SINGLE_THREAD_CODE` |
| `vendor/wllama/multi-thread.wasm` | `wasm/multi-thread/wllama.wasm` | `WLLAMA_MULTI_THREAD_CODE` |
| `vendor/wllama/single-thread-compat.wasm` | `wasm/single-thread-compat/wllama.wasm` | `WLLAMA_SINGLE_THREAD_COMPAT_CODE` |
| `vendor/wllama/multi-thread-compat.wasm` | `wasm/multi-thread-compat/wllama.wasm` | `WLLAMA_MULTI_THREAD_COMPAT_CODE` |
| `vendor/wllama/single-thread-webgpu.wasm` | `wasm/single-thread-webgpu/wllama.wasm` | `WLLAMA_SINGLE_THREAD_WEBGPU_CODE` |
| `vendor/wllama/multi-thread-webgpu.wasm` | `wasm/multi-thread-webgpu/wllama.wasm` | `WLLAMA_MULTI_THREAD_WEBGPU_CODE` |
| `vendor/wllama/single-thread-webgpu-compat.wasm` | `wasm/single-thread-webgpu-compat/wllama.wasm` | `WLLAMA_SINGLE_THREAD_WEBGPU_COMPAT_CODE` |
| `vendor/wllama/multi-thread-webgpu-compat.wasm` | `wasm/multi-thread-webgpu-compat/wllama.wasm` | `WLLAMA_MULTI_THREAD_WEBGPU_COMPAT_CODE` |

## Prerequisites

### Emscripten SDK

**Version requirement: >= 4.0.10** (for emdawnwebgpu port support).

```bash
cd ~/emsdk
git pull
./emsdk install 4.0.14   # or latest
./emsdk activate 4.0.14
source emsdk_env.sh
emcc --version  # verify
```

### emdawnwebgpu (for WebGPU builds only)

Download `emdawnwebgpu_pkg-*.zip` from
[Dawn releases](https://github.com/aspect-build/aspect-workflows/releases)
and extract to `deps/emdawnwebgpu_pkg/`.

**Note:** The stock headers do not include Dawn-specific types used by
llama.cpp's ggml-webgpu (e.g. `SubgroupMatrixConfig`, `DawnTogglesDescriptor`).
See `deps/` for the patched headers that add `enabled_tags=['emscripten','dawn']`.

## Build Steps

### Step 1: Build WASM binaries

```bash
cd .wllama-fork
./scripts/build_all_wasm.sh
```

This builds all 8 variants under `wasm/`. Each directory contains:
- `wllama.wasm` — the WASM binary
- `wllama.js` — the Emscripten JS glue (runtime + import definitions)

To rebuild only selected variants, pass variant names as arguments:

```bash
./scripts/build_all_wasm.sh \
  single-thread-webgpu \
  multi-thread-webgpu \
  single-thread-webgpu-compat \
  multi-thread-webgpu-compat
```

This is the recommended fast path when only the WebGPU backend or its JS glue
needs to be refreshed.

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
  'single-thread',
  'multi-thread',
  'single-thread-compat',
  'multi-thread-compat',
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
  'single-thread',
  'multi-thread',
  'single-thread-compat',
  'multi-thread-compat',
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

Verify the embedded bundle still contains the required runtime patches:

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

```bash
# Copy WASM binaries
cp wasm/single-thread/wllama.wasm         ../vendor/wllama/single-thread.wasm
cp wasm/multi-thread/wllama.wasm          ../vendor/wllama/multi-thread.wasm
cp wasm/single-thread-compat/wllama.wasm  ../vendor/wllama/single-thread-compat.wasm
cp wasm/multi-thread-compat/wllama.wasm   ../vendor/wllama/multi-thread-compat.wasm
cp wasm/single-thread-webgpu/wllama.wasm         ../vendor/wllama/single-thread-webgpu.wasm
cp wasm/multi-thread-webgpu/wllama.wasm          ../vendor/wllama/multi-thread-webgpu.wasm
cp wasm/single-thread-webgpu-compat/wllama.wasm  ../vendor/wllama/single-thread-webgpu-compat.wasm
cp wasm/multi-thread-webgpu-compat/wllama.wasm   ../vendor/wllama/multi-thread-webgpu-compat.wasm

# Copy bundled JS library
cp esm/index.js ../src/vendor/wllama/index.js
```

### Step 5: Verify the main project copy

Run these checks from `.wllama-fork` after copying:

```bash
node <<'NODE'
const fs = require('fs');
const wasmPairs = [
  ['wasm/single-thread/wllama.wasm', '../vendor/wllama/single-thread.wasm'],
  ['wasm/multi-thread/wllama.wasm', '../vendor/wllama/multi-thread.wasm'],
  ['wasm/single-thread-compat/wllama.wasm', '../vendor/wllama/single-thread-compat.wasm'],
  ['wasm/multi-thread-compat/wllama.wasm', '../vendor/wllama/multi-thread-compat.wasm'],
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

### 5. WebGPU build patches

The llama.cpp `ggml-webgpu.cpp` uses some non-standard types and Dawn-specific
APIs that require patches:

- `uint` → `uint32_t` at lines 452, 453, 1422, 1423
- Dawn headers must include `enabled_tags=['emscripten','dawn']`
- `#ifdef __EMSCRIPTEN__ / #error` guards must be removed from generated headers
- No-op `FreeMembers` stubs must be added for Dawn-specific types

These patches are already applied in this fork. If you update `llama.cpp`
(git submodule), you may need to re-apply them.

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

**When this matters:** Only affects Memory64 builds (`single-thread.wasm`,
`multi-thread.wasm`). Compat builds (`*-compat.wasm`) use 32-bit pointers
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
