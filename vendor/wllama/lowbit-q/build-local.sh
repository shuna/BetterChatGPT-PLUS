#!/usr/bin/env bash
#
# build-local.sh — Build lowbit-Q-patched wllama WASM using local Emscripten.
#
# Prerequisites:
#   - emsdk installed and activated (source emsdk_env.sh)
#   - .wllama-fork/ prepared by setup.sh
#
# Usage:
#   ./vendor/wllama/lowbit-q/build-local.sh
#
# Optional WebGPU build:
#   WLLAMA_BUILD_WEBGPU=1 ./vendor/wllama/lowbit-q/build-local.sh
#   WLLAMA_BUILD_WEBGPU=1 EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg ./vendor/wllama/lowbit-q/build-local.sh
#   WLLAMA_BUILD_WEBGPU=1 WLLAMA_SYNC_VENDOR_JS=1 ./vendor/wllama/lowbit-q/build-local.sh
#
# Output:
#   vendor/wllama/single-thread-compat.wasm
#   vendor/wllama/multi-thread-compat.wasm
#   vendor/wllama/single-thread-webgpu-compat.wasm  (when WLLAMA_BUILD_WEBGPU=1)
#   vendor/wllama/multi-thread-webgpu-compat.wasm   (when WLLAMA_BUILD_WEBGPU=1)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FORK_DIR="$REPO_ROOT/.wllama-fork"
VENDOR_DIR="$REPO_ROOT/vendor/wllama"

# ---------------------------------------------------------------------------
# Validate environment
# ---------------------------------------------------------------------------
if [ ! -d "$FORK_DIR" ]; then
  echo "ERROR: .wllama-fork/ not found. Run setup.sh first:"
  echo "  bash vendor/wllama/lowbit-q/setup.sh"
  exit 1
fi

if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Activate emsdk first:"
  echo "  source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

# Upstream wllama uses emsdk 4.0.3 for CPU builds — must match to avoid ABI
# mismatch (-fwasm-exceptions changed ABI between 4.x and 5.x). WebGPU builds
# need emdawnwebgpu, which is a built-in Emscripten port starting at 4.0.10.
BUILD_WEBGPU="${WLLAMA_BUILD_WEBGPU:-0}"
REQUIRED_EMSDK="4.0.3"
if [ "$BUILD_WEBGPU" = "1" ]; then
  REQUIRED_EMSDK="4.0.10"
fi
ACTUAL_EMSDK=$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ "$ACTUAL_EMSDK" != "$REQUIRED_EMSDK" ]; then
  echo "WARNING: emsdk version mismatch (have $ACTUAL_EMSDK, need $REQUIRED_EMSDK)"
  echo "  Install correct version: cd /Users/suzuki/emsdk && ./emsdk install $REQUIRED_EMSDK && ./emsdk activate $REQUIRED_EMSDK"
  echo "  Then: source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

echo "=== vendor/wllama/lowbit-q local build ==="
echo "  emcc: $(emcc --version | head -1)"
echo "  fork: $FORK_DIR"
echo ""

# ---------------------------------------------------------------------------
# Shared compiler flags (matches docker-compose.yml from upstream)
# ---------------------------------------------------------------------------
SHARED_EMCC_CFLAGS_BASE="--no-entry -O3 -msimd128 -DNDEBUG -flto=full -frtti -fwasm-exceptions -sEXPORT_ALL=1 -sEXPORT_ES6=0 -sMODULARIZE=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_FUNCTIONS=_main,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -sNO_EXIT_RUNTIME=1"
SHARED_EMCC_CFLAGS_COMPAT="$SHARED_EMCC_CFLAGS_BASE -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=2048MB"
NPROC=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
SYNC_VENDOR_JS="${WLLAMA_SYNC_VENDOR_JS:-0}"

cmake_webgpu_args=()
cmake_compat_args=("-DLLAMA_WASM_MEM64=OFF")
if [ "$BUILD_WEBGPU" = "1" ]; then
  cmake_webgpu_args+=("-DGGML_WEBGPU=ON")
  # JSPI is the default in llama.cpp, but keep it explicit for reproducibility.
  cmake_webgpu_args+=("-DGGML_WEBGPU_JSPI=ON")
  if [ -n "${EMDAWNWEBGPU_DIR:-}" ]; then
    cmake_webgpu_args+=("-DEMDAWNWEBGPU_DIR=$EMDAWNWEBGPU_DIR")
  fi
fi

expose_emscripten_heap_views() {
  local js_file="$1"

  if grep -q 'Module\["HEAPU8"\]=HEAPU8' "$js_file"; then
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

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 1/2: single-thread compat (no Memory64)
# ---------------------------------------------------------------------------
echo "[1/2] Building single-thread WASM (compat, no Memory64)..."
rm -rf wasm/single-thread-compat
mkdir -p wasm/single-thread-compat
cd wasm/single-thread-compat

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_compat_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build 2/2: multi-thread compat (no Memory64)
# ---------------------------------------------------------------------------
echo ""
echo "[2/2] Building multi-thread WASM (compat, no Memory64)..."
rm -rf wasm/multi-thread-compat
mkdir -p wasm/multi-thread-compat
cd wasm/multi-thread-compat

export EMCC_CFLAGS=""
emcmake cmake ../.. "${cmake_compat_args[@]}" 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=Module[\"pthreadPoolSize\"]"
emmake make wllama -j"$NPROC" 2>&1
expose_emscripten_heap_views wllama.js
patch_emscripten_jspi_exports wllama.js

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Copy to safe destinations
# ---------------------------------------------------------------------------
echo ""
echo "=== Copying safe outputs ==="
mkdir -p "$VENDOR_DIR"

cp wasm/single-thread-compat/wllama.wasm "$VENDOR_DIR/single-thread-compat.wasm"
cp wasm/multi-thread-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-compat.wasm"

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
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=Module[\"pthreadPoolSize\"]"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  patch_emscripten_jspi_exports wllama.js

  cd "$FORK_DIR"
  cp wasm/single-thread-webgpu-compat/wllama.wasm "$VENDOR_DIR/single-thread-webgpu-compat.wasm"
  cp wasm/multi-thread-webgpu-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-webgpu-compat.wasm"

  if [ "$SYNC_VENDOR_JS" = "1" ]; then
    echo ""
    echo "[webgpu js] Syncing Emscripten JS glue into vendored wllama runtime..."
    mkdir -p src/single-thread src/multi-thread
    cp wasm/single-thread-webgpu-compat/wllama.js   src/single-thread/wllama.js
    cp wasm/single-thread-webgpu-compat/wllama.wasm src/single-thread/wllama.wasm
    cp wasm/multi-thread-webgpu-compat/wllama.js    src/multi-thread/wllama.js
    cp wasm/multi-thread-webgpu-compat/wllama.wasm  src/multi-thread/wllama.wasm

    npm run build:worker
    npm run build:tsup
    npm run build:typedef

    cp esm/index.js "$REPO_ROOT/src/vendor/wllama/index.js"
  fi
fi

echo ""
echo "=== Build complete ==="
ls -lh "$VENDOR_DIR/"
echo ""
echo "Compat WASM installed to: $VENDOR_DIR/"
echo ""
echo "NOTE:"
echo "  - build-local.sh no longer overwrites vendor/wllama/{single,multi}-thread.wasm"
echo "  - Memory64 variants are intentionally not built by this script"
echo "  - Keep vendor/wllama/{single,multi}-thread.wasm on upstream binaries"
echo "  - WebGPU variants are opt-in via WLLAMA_BUILD_WEBGPU=1 and may require matching Emscripten JS glue"
echo "  - Use WLLAMA_SYNC_VENDOR_JS=1 with WebGPU builds to refresh src/vendor/wllama/index.js"
