#!/usr/bin/env bash
#
# setup.sh — Prepare a wllama fork with onebit kernel for WASM build.
#
# This script:
#   1. Clones wllama at the pinned version
#   2. Copies the independent onebit C sources into the clone
#   3. Applies the CMakeLists.txt patch
#   4. Optionally builds the WASM binaries (requires Docker)
#
# Usage:
#   ./wllama-onebit/setup.sh [--build]
#
# Prerequisites:
#   - git
#   - Docker (only if --build is passed)
#
# Output:
#   .wllama-fork/           — patched wllama clone, ready to build
#   .wllama-fork/esm/       — WASM binaries (only with --build)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FORK_DIR="$REPO_ROOT/.wllama-fork"
WLLAMA_VERSION="$(cat "$SCRIPT_DIR/WLLAMA_VERSION" | tr -d '[:space:]')"
WLLAMA_REPO="https://github.com/ngxson/wllama.git"

echo "=== wllama-onebit setup ==="
echo "  wllama version: v$WLLAMA_VERSION"
echo "  fork directory: $FORK_DIR"
echo ""

# -----------------------------------------------------------------------
# Step 1: Clone wllama at pinned version
# -----------------------------------------------------------------------
if [ -d "$FORK_DIR" ]; then
  echo "[1/4] Fork directory exists, cleaning..."
  rm -rf "$FORK_DIR"
fi

echo "[1/4] Cloning wllama v$WLLAMA_VERSION..."
git clone --depth 1 --branch "v$WLLAMA_VERSION" "$WLLAMA_REPO" "$FORK_DIR" 2>/dev/null \
  || git clone --depth 1 "$WLLAMA_REPO" "$FORK_DIR"

# wllama uses llama.cpp as a submodule
cd "$FORK_DIR"
if [ -f ".gitmodules" ]; then
  echo "    Initializing llama.cpp submodule..."
  git submodule update --init --depth 1
fi

# -----------------------------------------------------------------------
# Step 2: Copy independent onebit sources
# -----------------------------------------------------------------------
echo "[2/4] Copying onebit kernel sources..."
mkdir -p "$FORK_DIR/cpp/onebit"
cp "$SCRIPT_DIR/cpp/onebit/onebit-mul-mat.h"       "$FORK_DIR/cpp/onebit/"
cp "$SCRIPT_DIR/cpp/onebit/onebit-mul-mat.c"       "$FORK_DIR/cpp/onebit/"
cp "$SCRIPT_DIR/cpp/onebit/onebit-model-builder.h"  "$FORK_DIR/cpp/onebit/"
cp "$SCRIPT_DIR/cpp/onebit/onebit-model-builder.c"  "$FORK_DIR/cpp/onebit/"
echo "    Copied 4 files to cpp/onebit/"

# -----------------------------------------------------------------------
# Step 3: Apply CMakeLists.txt patch
# -----------------------------------------------------------------------
echo "[3/4] Patching CMakeLists.txt..."

# The patch has placeholder index hashes — apply manually for reliability
cd "$FORK_DIR"
if ! grep -q 'ONEBIT_SRC' CMakeLists.txt; then
  # Insert onebit sources before the include_directories block
  sed -i.bak '/^include_directories.*cpp)/i\
# Onebit quantization kernel (independent from ggml core)\
set(ONEBIT_SRC\
    cpp/onebit/onebit-mul-mat.c\
    cpp/onebit/onebit-model-builder.c)\
' CMakeLists.txt

  # Add onebit include directory
  sed -i.bak '/include_directories.*llama\.cpp\/include/a\
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/cpp/onebit)\
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp/ggml/include)' CMakeLists.txt

  # Add ONEBIT_SRC to the executable
  sed -i.bak 's/add_executable(wllama ${WLLAMA_SRC})/add_executable(wllama ${WLLAMA_SRC} ${ONEBIT_SRC})/' CMakeLists.txt

  rm -f CMakeLists.txt.bak
  echo "    CMakeLists.txt patched successfully"
else
  echo "    CMakeLists.txt already patched (skipping)"
fi

# Verify patch
if grep -q 'ONEBIT_SRC' CMakeLists.txt && grep -q 'onebit-mul-mat' CMakeLists.txt; then
  echo "    Verification: OK"
else
  echo "    ERROR: Patch verification failed!"
  exit 1
fi

# -----------------------------------------------------------------------
# Step 4: Build WASM (optional)
# -----------------------------------------------------------------------
if [[ "${1:-}" == "--build" ]]; then
  echo "[4/4] Building WASM binaries (requires Docker)..."
  cd "$FORK_DIR"
  if [ -f "scripts/build_wasm.sh" ]; then
    bash scripts/build_wasm.sh
    echo ""
    echo "=== Build complete ==="
    echo "  Single-thread WASM: $FORK_DIR/esm/single-thread/wllama.wasm"
    echo "  Multi-thread WASM:  $FORK_DIR/esm/multi-thread/wllama.wasm"
    echo ""
    echo "To use in weavelet-canvas, copy the WASM files:"
    echo "  cp $FORK_DIR/esm/single-thread/wllama.wasm  <project>/vendor/wllama/"
    echo "  cp $FORK_DIR/esm/multi-thread/wllama.wasm   <project>/vendor/wllama/"
  else
    echo "    WARNING: build_wasm.sh not found. Manual build required."
    echo "    See: https://github.com/nicekid1/Wllama#building-from-source"
  fi
else
  echo "[4/4] Skipping WASM build (pass --build to build)"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Fork is at: $FORK_DIR"
echo ""
echo "Next steps:"
echo "  1. cd $FORK_DIR"
echo "  2. Review CMakeLists.txt and cpp/onebit/ contents"
echo "  3. Run: bash scripts/build_wasm.sh  (requires Docker)"
echo "  4. Copy output WASM to vendor/ or update vite config"
