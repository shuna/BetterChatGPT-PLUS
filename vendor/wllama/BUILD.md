# wllama WASM Build Guide (Custom Fork)

This document describes how to build the wllama WASM binaries and JS library
for the weavelet-canvas project.

## Overview

The build produces 8 WASM variants along 3 axes:

| Axis | Values | Notes |
|------|--------|-------|
| Threading | single-thread / multi-thread | Multi-thread requires COOP/COEP headers |
| Memory64 | memory64 / compat | Memory64 allows >2 GB models; compat for older browsers |
| WebGPU | webgpu / no-webgpu | GPU acceleration via Dawn/emdawnwebgpu |

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

Each variant also produces a `wllama.js` (Emscripten JS glue) file.

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

### Step 2: Embed JS glue into the library (CRITICAL)

The wllama library embeds the Emscripten JS glue as string constants. After
rebuilding WASM, you **must** update the embedded glue:

```bash
# Copy JS glue from build output to src/
cp wasm/single-thread/wllama.js src/single-thread/wllama.js
cp wasm/multi-thread/wllama.js  src/multi-thread/wllama.js

# Re-embed into generated.ts
npm run build:worker

# Bundle the library
npm run build:tsup
```

**Why this matters:** The WASM binary and its JS glue are paired — the glue
defines the exact import functions (with minified names `a`, `b`, `c`...) that
the WASM binary expects. If you deploy new WASM binaries without updating the
embedded JS glue, `WebAssembly.instantiate()` will fail with:

    Import #0 "a": module is not an object or function

### Step 3: Copy artifacts to the main project

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

## Known Pitfalls

### 1. WASM and JS glue must match

The most common failure mode. Every WASM binary has a paired `.js` file with
matching import function definitions. If you update one without the other, WASM
instantiation fails at runtime.

**Rule:** Always run Step 2 (embed + bundle) after Step 1 (WASM build).

### 2. WebGPU WASM requires separate JS glue

The wllama library currently embeds only **2 JS glue variants**:
- `WLLAMA_SINGLE_THREAD_CODE` (from `src/single-thread/wllama.js`)
- `WLLAMA_MULTI_THREAD_CODE` (from `src/multi-thread/wllama.js`)

These are from the **non-WebGPU** build (21 import functions). WebGPU WASM
binaries require **53 import functions** (additional WebGPU/Dawn runtime
functions). Loading a WebGPU WASM with non-WebGPU JS glue will always fail.

**Current status:** WebGPU WASM selection is disabled in `wllamaWorker.ts`.
To enable it, the library must be updated to embed WebGPU-specific JS glue
variants and select the correct one at runtime.

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

### 6. emsdk 4.x: HEAPU8 not exported on Module object

In emsdk 4.0.x, Emscripten no longer exposes heap views (HEAPU8, HEAP32, etc.)
as properties on the `Module` object. They are closure-local variables updated by
`updateMemoryViews()`. The wllama worker code (`llama-cpp.js`) accesses
`Module.HEAPU8` and will fail with:

    TypeError: Cannot read properties of undefined (reading 'set')

**Fix applied in this fork:** `src/single-thread/wllama.js` and
`src/multi-thread/wllama.js` are patched after copying from `wasm/*/wllama.js`
to add `Module["HEAPU8"]=HEAPU8` at the end of `updateMemoryViews()`:

```javascript
// Before closing brace of updateMemoryViews():
HEAPU64=new BigUint64Array(b);Module["HEAPU8"]=HEAPU8}
```

**When this matters:** Whenever the JS glue files are updated from a new WASM build,
re-apply this patch before running `npm run build:worker`.

### 7. emsdk 4.x + Memory64: cwrap pointer type must be `'pointer'`

In emsdk 4.0.x with Memory64 (`-sMEMORY64=1`), WASM pointer parameters are i64
(BigInt). The Emscripten `cwrap` shortcut for all-numeric arguments bypasses type
conversion, so calling WASM functions with JS Numbers fails with:

    TypeError: Cannot convert 179 to a BigInt

**Fix applied in this fork:** `src/workers-code/llama-cpp.js` uses `'pointer'`
instead of `'number'` for pointer/size arguments in cwrap calls. The `ccall`
path (triggered when any arg type is `'pointer'`) handles BigInt conversion:

```javascript
// Before (broken with Memory64):
const pointer = 'number';
wllamaMalloc = callWrapper('wllama_malloc', pointer, ['number', pointer]);

// After (Memory64-compatible):
const pointer = 'pointer';
wllamaMalloc = callWrapper('wllama_malloc', pointer, [pointer, pointer]);
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
