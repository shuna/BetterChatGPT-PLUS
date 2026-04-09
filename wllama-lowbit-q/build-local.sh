#!/usr/bin/env bash
#
# build-local.sh — Build lowbit-Q-patched wllama WASM using local Emscripten.
#
# Prerequisites:
#   - emsdk installed and activated (source emsdk_env.sh)
#   - .wllama-fork/ prepared by setup.sh
#
# Usage:
#   ./wllama-lowbit-q/build-local.sh
#
# Output:
#   vendor/wllama/single-thread.wasm
#   vendor/wllama/multi-thread.wasm
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FORK_DIR="$REPO_ROOT/.wllama-fork"
VENDOR_DIR="$REPO_ROOT/vendor/wllama"

# ---------------------------------------------------------------------------
# Validate environment
# ---------------------------------------------------------------------------
if [ ! -d "$FORK_DIR" ]; then
  echo "ERROR: .wllama-fork/ not found. Run setup.sh first:"
  echo "  bash wllama-lowbit-q/setup.sh"
  exit 1
fi

if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Activate emsdk first:"
  echo "  source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

# Upstream wllama uses emsdk 4.0.3 — must match to avoid ABI mismatch
# (-fwasm-exceptions changed ABI between 4.x and 5.x)
REQUIRED_EMSDK="4.0.3"
ACTUAL_EMSDK=$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ "$ACTUAL_EMSDK" != "$REQUIRED_EMSDK" ]; then
  echo "WARNING: emsdk version mismatch (have $ACTUAL_EMSDK, need $REQUIRED_EMSDK)"
  echo "  Install correct version: cd /Users/suzuki/emsdk && ./emsdk install $REQUIRED_EMSDK && ./emsdk activate $REQUIRED_EMSDK"
  echo "  Then: source /Users/suzuki/emsdk/emsdk_env.sh"
  exit 1
fi

echo "=== wllama-lowbit-q local build ==="
echo "  emcc: $(emcc --version | head -1)"
echo "  fork: $FORK_DIR"
echo ""

# ---------------------------------------------------------------------------
# Shared compiler flags (matches docker-compose.yml from upstream)
# ---------------------------------------------------------------------------
SHARED_EMCC_CFLAGS="--no-entry -O3 -msimd128 -DNDEBUG -flto=full -frtti -fwasm-exceptions -sEXPORT_ALL=1 -sEXPORT_ES6=0 -sMODULARIZE=0 -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=4096MB -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_FUNCTIONS=_main,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -sNO_EXIT_RUNTIME=1"

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build single-thread
# ---------------------------------------------------------------------------
echo "[1/2] Building single-thread WASM..."
rm -rf wasm/single-thread
mkdir -p wasm/single-thread
cd wasm/single-thread

emcmake cmake ../.. 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS"
emmake make wllama -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4) 2>&1

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Build multi-thread
# ---------------------------------------------------------------------------
echo ""
echo "[2/2] Building multi-thread WASM..."
rm -rf wasm/multi-thread
mkdir -p wasm/multi-thread
cd wasm/multi-thread

export EMCC_CFLAGS=""
emcmake cmake ../.. 2>&1 | tail -3
export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=Module[\"pthreadPoolSize\"]"
emmake make wllama -j$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4) 2>&1

cd "$FORK_DIR"

# ---------------------------------------------------------------------------
# Copy to vendor/
# ---------------------------------------------------------------------------
echo ""
echo "=== Copying WASM to vendor/wllama/ ==="
mkdir -p "$VENDOR_DIR"

cp wasm/single-thread/wllama.wasm "$VENDOR_DIR/single-thread.wasm"
cp wasm/multi-thread/wllama.wasm  "$VENDOR_DIR/multi-thread.wasm"

echo ""
echo "=== Build complete ==="
ls -lh "$VENDOR_DIR/"
echo ""
echo "lowbit-Q WASM ready at: $VENDOR_DIR/"
