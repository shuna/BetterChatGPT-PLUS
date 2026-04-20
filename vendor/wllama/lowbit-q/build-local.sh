#!/usr/bin/env bash
#
# build-local.sh — Build lowbit-Q-patched wllama WASM using local Emscripten.
#
# Prerequisites:
#   - emsdk >= 5.0.0 installed and activated (source emsdk_env.sh)
#   - vendor/wllama-src/ prepared by scripts/wllama/setup.sh
#
# Usage:
#   bash scripts/wllama/build.sh               (preferred entry point)
#   ./vendor/wllama/lowbit-q/build-local.sh    (direct invocation)
#
# Optional JS glue sync (CPU always; WebGPU requires BUILD_WEBGPU=1):
#   WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh
#   WLLAMA_SYNC_VENDOR_JS=1 WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh
#
# Optional WebGPU build:
#   WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh
#   WLLAMA_BUILD_WEBGPU=1 EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg bash scripts/wllama/build.sh
#
# Output:
#   vendor/wllama/single-thread-cpu-compat.wasm
#   vendor/wllama/multi-thread-cpu-compat.wasm
#   vendor/wllama/single-thread-cpu-mem64.wasm
#   vendor/wllama/multi-thread-cpu-mem64.wasm
#   vendor/wllama/single-thread-webgpu-compat.wasm  (when WLLAMA_BUILD_WEBGPU=1)
#   vendor/wllama/multi-thread-webgpu-compat.wasm   (when WLLAMA_BUILD_WEBGPU=1)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FORK_DIR="$REPO_ROOT/vendor/wllama-src"
VENDOR_DIR="$REPO_ROOT/vendor/wllama"

# ---------------------------------------------------------------------------
# Validate environment
# ---------------------------------------------------------------------------
if [ ! -d "$FORK_DIR" ]; then
  echo "ERROR: vendor/wllama-src/ not found. Run setup first:"
  echo "  bash scripts/wllama/setup.sh"
  exit 1
fi

if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Activate emsdk first:"
  echo "  source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

MIN_EMSDK="5.0.0"
ACTUAL_EMSDK=$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if ! awk -v a="$ACTUAL_EMSDK" -v m="$MIN_EMSDK" 'BEGIN{
  split(a,A,"."); split(m,M,".");
  for(i=1;i<=3;i++){if(A[i]+0>M[i]+0)exit 0;if(A[i]+0<M[i]+0)exit 1}
  exit 0
}'; then
  echo "ERROR: emsdk >= $MIN_EMSDK required (got $ACTUAL_EMSDK)"
  echo "  Install: cd /Users/suzuki/emsdk && ./emsdk install latest && ./emsdk activate latest"
  echo "  Then:    source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

BUILD_WEBGPU="${WLLAMA_BUILD_WEBGPU:-0}"

echo "=== vendor/wllama/lowbit-q local build ==="
echo "  emcc: $(emcc --version | head -1)"
echo "  src:  $FORK_DIR"
echo ""

# ---------------------------------------------------------------------------
# Shared compiler flags (matches docker-compose.yml from upstream)
# ---------------------------------------------------------------------------
SHARED_EMCC_CFLAGS_BASE="--no-entry -O3 -msimd128 -DNDEBUG -flto=full -frtti -fwasm-exceptions -sEXPORT_ALL=1 -sEXPORT_ES6=0 -sMODULARIZE=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_FUNCTIONS=_main,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -sNO_EXIT_RUNTIME=1"
SHARED_EMCC_CFLAGS_COMPAT="$SHARED_EMCC_CFLAGS_BASE -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=2048MB"
# Memory64 uses 64-bit linear memory indexing; 8 GB maximum covers current large model sizes.
SHARED_EMCC_CFLAGS_MEM64="$SHARED_EMCC_CFLAGS_BASE -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=8589934592 -sMEMORY64=1"
NPROC=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
SYNC_VENDOR_JS="${WLLAMA_SYNC_VENDOR_JS:-0}"

cmake_compat_args=("-DLLAMA_WASM_MEM64=OFF")
cmake_mem64_args=("-DLLAMA_WASM_MEM64=ON")
cmake_webgpu_args=()
if [ "$BUILD_WEBGPU" = "1" ]; then
  cmake_webgpu_args+=("-DGGML_WEBGPU=ON")
  # JSPI is the default in llama.cpp, but keep it explicit for reproducibility.
  cmake_webgpu_args+=("-DGGML_WEBGPU_JSPI=ON")
  if [ -n "${EMDAWNWEBGPU_DIR:-}" ]; then
    cmake_webgpu_args+=("-DEMDAWNWEBGPU_DIR=$EMDAWNWEBGPU_DIR")
  fi
fi

# ---------------------------------------------------------------------------
# Post-build patches
#
# patch #1 (expose_emscripten_heap_views): Appends Module["HEAP*"] assignments so
#   the inner worker can access heap views via Module.*. Still required as of emsdk 4;
#   verify under emsdk 5 — remove if Emscripten exports them natively.
#
# patch #2 (patch_emscripten_jspi_exports): Widens the JSPI async-export pattern to
#   include wllama_* symbols, and normalises async-mode handling to Promise.resolve.
#   Verify under emsdk 5 — if the upstream export pattern already covers wllama_*,
#   this patch can be removed.
#
# patch #3 (fix_pthread_pool_size) has been eliminated: -sPTHREAD_POOL_SIZE=0 is
#   now hardcoded in the build flags; runtime-adapter injects pthreadPoolSize at
#   attach time, so the generated glue no longer references the Module variable.
#
# patch #4 (patch_pthread_prewarm): Injects a Module.__pthreadPrewarm() function
#   into the multi-thread glue's initMainThread() hook. Without this, Workers are
#   created lazily by pthread_create and may still be loading their WASM module
#   when the main thread reaches ggml_barrier during the first llama_decode →
#   deadlock. __pthreadPrewarm() pre-allocates (pthreadPoolSize-1) Workers and
#   awaits their WASM load before the runtime signals init-complete to the outer
#   Wllama layer. Called from llama-cpp.js onRuntimeInitialized (async).
# ---------------------------------------------------------------------------
expose_emscripten_heap_views() {
  local js_file="$1"

  # Check if the patch is already applied *inside* updateMemoryViews.
  # The replacement string starts with Module["HEAP8"] (not Module["HEAPU8"]),
  # so we check for that prefix.  emsdk 5 single-thread natively exports
  # Module["HEAPU8"] in the exports section (where HEAPU8 is still undefined at
  # eval time); that bare export does NOT follow the BigUint64Array constructor
  # and therefore won't be matched by this check.
  if grep -qF 'HEAPU64=new BigUint64Array(b);Module["HEAP8"]=HEAP8' "$js_file"; then
    return
  fi

  local marker='HEAPU64=new BigUint64Array(b)}'
  local replacement='HEAPU64=new BigUint64Array(b);Module["HEAP8"]=HEAP8;Module["HEAPU8"]=HEAPU8;Module["HEAP16"]=HEAP16;Module["HEAPU16"]=HEAPU16;Module["HEAP32"]=HEAP32;Module["HEAPU32"]=HEAPU32;Module["HEAPF32"]=HEAPF32;Module["HEAPF64"]=HEAPF64;Module["HEAP64"]=HEAP64;Module["HEAPU64"]=HEAPU64}'

  if ! grep -q "$marker" "$js_file"; then
    echo "ERROR: unable to find Emscripten heap view marker in $js_file" >&2
    exit 1
  fi

  perl -0pi -e "s/\\Q$marker\\E/$replacement/" "$js_file"
}

patch_emscripten_jspi_exports() {
  local js_file="$1"

  if grep -q 'wllama_(start|action|exit|debug)' "$js_file" \
    && grep -q 'Promise.resolve(ret).then(onDone)' "$js_file"; then
    return
  fi

  ruby -0pi \
    -e 'gsub(%r{var exportPattern=/\^\(main\|__main_argc_argv\)\$/;}, %q{var exportPattern=/^(main|__main_argc_argv|wllama_start|wllama_action|wllama_exit|wllama_debug)$/;}); gsub(%q{if(asyncMode)return ret.then(onDone);}, %q{if(asyncMode)return Promise.resolve(ret).then(onDone);})' \
    "$js_file"
}

patch_pthread_prewarm() {
  local js_file="$1"

  if grep -qF '__pthreadPrewarm' "$js_file"; then
    return
  fi

  local old=',initMainThread(){},terminateAllThreads'
  local new=',initMainThread(){Module["__pthreadPrewarm"]=function(){var n=typeof Module["pthreadPoolSize"]==="number"?Module["pthreadPoolSize"]-1:0;if(n<=0)return Promise.resolve();var ps=[];for(var i=0;i<n;i++){PThread.allocateUnusedWorker();var w=PThread.unusedWorkers[PThread.unusedWorkers.length-1];ps.push(PThread.loadWasmModuleToWorker(w));}return Promise.all(ps);};},terminateAllThreads'

  if ! grep -qF "$old" "$js_file"; then
    echo "ERROR: patch_pthread_prewarm: initMainThread marker not found in $js_file" >&2
    exit 1
  fi

  perl -0pi -e "s/\Q$old\E/$new/" "$js_file"
}

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 1/4: single-thread CPU compat (no Memory64)
# ---------------------------------------------------------------------------
echo "[1/4] Building single-thread WASM (CPU compat, no Memory64)..."
rm -rf wasm/single-thread-cpu-compat
mkdir -p wasm/single-thread-cpu-compat
cd wasm/single-thread-cpu-compat

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_compat_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 2/4: multi-thread CPU compat (no Memory64)
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Building multi-thread WASM (CPU compat, no Memory64)..."
rm -rf wasm/multi-thread-cpu-compat
mkdir -p wasm/multi-thread-cpu-compat
cd wasm/multi-thread-cpu-compat

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_compat_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=0"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js
patch_pthread_prewarm wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 3/4: single-thread CPU Memory64
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Building single-thread WASM (CPU Memory64)..."
rm -rf wasm/single-thread-cpu-mem64
mkdir -p wasm/single-thread-cpu-mem64
cd wasm/single-thread-cpu-mem64

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_mem64_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_MEM64"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 4/4: multi-thread CPU Memory64
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Building multi-thread WASM (CPU Memory64)..."
rm -rf wasm/multi-thread-cpu-mem64
mkdir -p wasm/multi-thread-cpu-mem64
cd wasm/multi-thread-cpu-mem64

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_mem64_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_MEM64 -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=0"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js
patch_pthread_prewarm wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Copy to vendor directory
# ---------------------------------------------------------------------------
echo ""
echo "=== Copying outputs ==="
mkdir -p "$VENDOR_DIR"

cp wasm/single-thread-cpu-compat/wllama.wasm "$VENDOR_DIR/single-thread-cpu-compat.wasm"
cp wasm/multi-thread-cpu-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-cpu-compat.wasm"
cp wasm/single-thread-cpu-mem64/wllama.wasm  "$VENDOR_DIR/single-thread-cpu-mem64.wasm"
cp wasm/multi-thread-cpu-mem64/wllama.wasm   "$VENDOR_DIR/multi-thread-cpu-mem64.wasm"

if [ "$BUILD_WEBGPU" = "1" ]; then
  cd "$FORK_DIR"

  echo ""
  echo "[webgpu 1/2] Building single-thread WebGPU WASM (compat, no Memory64)..."
  rm -rf wasm/single-thread-webgpu-compat
  mkdir -p wasm/single-thread-webgpu-compat
  cd wasm/single-thread-webgpu-compat

  export EMCC_CFLAGS=""
  emcmake cmake ../.. "${cmake_compat_args[@]}" "${cmake_webgpu_args[@]}" 2>&1 | tail -6
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  patch_emscripten_jspi_exports wllama.js

  cd "$FORK_DIR"

  echo ""
  echo "[webgpu 2/2] Building multi-thread WebGPU WASM (compat, no Memory64)..."
  rm -rf wasm/multi-thread-webgpu-compat
  mkdir -p wasm/multi-thread-webgpu-compat
  cd wasm/multi-thread-webgpu-compat

  export EMCC_CFLAGS=""
  emcmake cmake ../.. "${cmake_compat_args[@]}" "${cmake_webgpu_args[@]}" 2>&1 | tail -6
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=0"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  patch_emscripten_jspi_exports wllama.js

  cd "$FORK_DIR"
  cp wasm/single-thread-webgpu-compat/wllama.wasm "$VENDOR_DIR/single-thread-webgpu-compat.wasm"
  cp wasm/multi-thread-webgpu-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-webgpu-compat.wasm"

  if [ "$SYNC_VENDOR_JS" = "1" ]; then
    echo ""
    echo "[webgpu js] Syncing WebGPU JS glue into vendored wllama runtime..."
    mkdir -p src/single-thread src/multi-thread

    # --- Step A: build WebGPU index.js ---
    # The WebGPU JS glue uses a different WASM memory-export key ("_") than the
    # CPU glue ("v").  They are NOT interchangeable — each must only be paired
    # with its matching WASM variant.  We therefore produce a SEPARATE file:
    #   src/vendor/wllama/webgpu-index.js   ← WebGPU WASM variants
    #   src/vendor/wllama/index.js          ← CPU WASM variants (built separately)
    cp wasm/single-thread-webgpu-compat/wllama.js   src/single-thread/wllama.js
    cp wasm/single-thread-webgpu-compat/wllama.wasm src/single-thread/wllama.wasm
    cp wasm/multi-thread-webgpu-compat/wllama.js    src/multi-thread/wllama.js
    cp wasm/multi-thread-webgpu-compat/wllama.wasm  src/multi-thread/wllama.wasm

    npm run build:worker
    npm run build:tsup
    npm run build:typedef

    cp esm/index.js "$REPO_ROOT/src/vendor/wllama/webgpu-index.js"
  fi
fi

# ---------------------------------------------------------------------------
# JS glue sync: CPU variants (runs whenever WLLAMA_SYNC_VENDOR_JS=1,
# independent of BUILD_WEBGPU)
# ---------------------------------------------------------------------------
if [ "$SYNC_VENDOR_JS" = "1" ]; then
  echo ""
  echo "[cpu js] Syncing CPU JS glue into vendored wllama runtime..."
  cd "$FORK_DIR"
  mkdir -p src/single-thread src/multi-thread

  # --- Step B: CPU compat glue → src/vendor/wllama/index.js ---
  # CPU compat WASM uses wasm32 ABI (Number pointers).  This glue is the default
  # for all cpu-compat variants and must NOT be paired with mem64 WASM.
  cp wasm/single-thread-cpu-compat/wllama.js   src/single-thread/wllama.js
  cp wasm/single-thread-cpu-compat/wllama.wasm src/single-thread/wllama.wasm
  cp wasm/multi-thread-cpu-compat/wllama.js    src/multi-thread/wllama.js
  cp wasm/multi-thread-cpu-compat/wllama.wasm  src/multi-thread/wllama.wasm

  npm run build:worker
  npm run build:tsup

  cp esm/index.js "$REPO_ROOT/src/vendor/wllama/index.js"

  # --- Step C: CPU mem64 glue → src/vendor/wllama/mem64-index.js ---
  # CPU mem64 WASM uses Memory64 ABI (BigInt pointers).  A separate glue bundle
  # is required because the embedded LLAMA_CPP_WORKER_CODE must match the WASM ABI.
  # Using the compat glue with mem64 WASM causes "Cannot mix BigInt and other types".
  echo ""
  echo "[cpu-mem64 js] Verifying HEAPU64 presence in mem64 glue..."
  grep -c 'HEAPU64' wasm/single-thread-cpu-mem64/wllama.js \
    && echo "  HEAPU64 found — mem64 glue looks correct" \
    || { echo "ERROR: HEAPU64 not found in single-thread-cpu-mem64/wllama.js — expose_emscripten_heap_views may have failed"; exit 1; }

  cp wasm/single-thread-cpu-mem64/wllama.js   src/single-thread/wllama.js
  cp wasm/single-thread-cpu-mem64/wllama.wasm src/single-thread/wllama.wasm
  cp wasm/multi-thread-cpu-mem64/wllama.js    src/multi-thread/wllama.js
  cp wasm/multi-thread-cpu-mem64/wllama.wasm  src/multi-thread/wllama.wasm

  npm run build:worker
  npm run build:tsup

  cp esm/index.js "$REPO_ROOT/src/vendor/wllama/mem64-index.js"

  # Verify all available glue bundles have the same public export surface.
  node "$REPO_ROOT/scripts/wllama/verify-glue-exports.mjs" "$REPO_ROOT/src/vendor/wllama" \
    || { echo "ERROR: glue export surface mismatch — aborting"; exit 1; }
fi

echo ""
echo "=== Build complete ==="
ls -lh "$VENDOR_DIR/"*.wasm
echo ""
echo "CPU WASM installed to: $VENDOR_DIR/"
echo ""
echo "NOTE:"
echo "  - Memory64 variants require browsers with WebAssembly.Memory64 support"
echo "  - WebGPU variants are opt-in via WLLAMA_BUILD_WEBGPU=1"
echo "  - WebGPU mem64 variants are not built (out of scope)"
echo "  - WLLAMA_SYNC_VENDOR_JS=1 always produces CPU glue bundles:"
echo "      src/vendor/wllama/index.js          (CPU compat WASM variants)"
echo "      src/vendor/wllama/mem64-index.js    (CPU mem64 WASM variants)"
echo "  - WLLAMA_SYNC_VENDOR_JS=1 WLLAMA_BUILD_WEBGPU=1 additionally produces:"
echo "      src/vendor/wllama/webgpu-index.js  (WebGPU WASM variants)"
echo "  - CPU and WebGPU JS glue use different WASM memory-export keys and MUST NOT be swapped"
