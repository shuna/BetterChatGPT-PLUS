#!/usr/bin/env bash
#
# setup.sh — Prepare a wllama fork with lowbit-Q kernel for WASM build.
#
# This script:
#   1. Clones wllama at the pinned version
#   2. Copies the independent lowbit-Q C sources into the clone
#   3. Applies CMakeLists.txt patch (0001)
#   4. Applies lowbit-Q patches to llama.cpp submodule:
#      0002: make projection weight tensors optional in loader
#      0003: add SVID dispatch in llm_build_llama graph builder
#   5. Optionally builds the WASM binaries (requires Docker)
#
# Usage:
#   ./vendor/wllama/lowbit-q/setup.sh [--build]
#
# Prerequisites:
#   - git
#   - python3 (for patches 0002 and 0003)
#   - Docker (only if --build is passed)
#
# Output:
#   .wllama-fork/           — patched wllama clone, ready to build
#   .wllama-fork/esm/       — WASM binaries (only with --build)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FORK_DIR="$REPO_ROOT/.wllama-fork"
WLLAMA_VERSION="$(cat "$SCRIPT_DIR/WLLAMA_VERSION" | tr -d '[:space:]')"
WLLAMA_REPO="https://github.com/ngxson/wllama.git"

echo "=== vendor/wllama/lowbit-q setup ==="
echo "  wllama version: v$WLLAMA_VERSION"
echo "  fork directory: $FORK_DIR"
echo ""

# -----------------------------------------------------------------------
# Step 1: Clone wllama at pinned version
# -----------------------------------------------------------------------
if [ -d "$FORK_DIR" ]; then
  echo "[1/5] Fork directory exists, cleaning..."
  rm -rf "$FORK_DIR"
fi

echo "[1/5] Cloning wllama v$WLLAMA_VERSION..."
git clone --depth 1 --branch "v$WLLAMA_VERSION" "$WLLAMA_REPO" "$FORK_DIR" 2>/dev/null \
  || git clone --depth 1 "$WLLAMA_REPO" "$FORK_DIR"

# wllama uses llama.cpp as a submodule
cd "$FORK_DIR"
if [ -f ".gitmodules" ]; then
  echo "    Initializing llama.cpp submodule..."
  git submodule update --init --depth 1
fi

# -----------------------------------------------------------------------
# Step 2: Copy independent lowbit-Q sources
# -----------------------------------------------------------------------
echo "[2/5] Copying lowbit-Q kernel sources..."
mkdir -p "$FORK_DIR/cpp/lowbit-q"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-mul-mat.h"      "$FORK_DIR/cpp/lowbit-q/"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-mul-mat.c"      "$FORK_DIR/cpp/lowbit-q/"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-model-builder.h" "$FORK_DIR/cpp/lowbit-q/"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-model-builder.c" "$FORK_DIR/cpp/lowbit-q/"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-metadata.h"      "$FORK_DIR/cpp/lowbit-q/"
cp "$SCRIPT_DIR/cpp/lowbit-q/lowbit-q-metadata.c"      "$FORK_DIR/cpp/lowbit-q/"
echo "    Copied 6 files to cpp/lowbit-q/"

# -----------------------------------------------------------------------
# Step 3: Apply CMakeLists.txt patch (patch 0001)
# -----------------------------------------------------------------------
echo "[3/5] Patching CMakeLists.txt (patch 0001)..."

cd "$FORK_DIR"
if ! grep -q 'LOWBIT_Q_SRC' CMakeLists.txt; then
  # Write the new CMakeLists.txt from scratch using the canonical template
  cat > CMakeLists.txt << 'CMAKEOF'
cmake_minimum_required(VERSION 3.14)
project("wllama")

# lowbit-Q C sources (compiled into the llama library so symbols are available
# to models/llama.cpp and llama-model.cpp which reference lowbit_q_* functions)
set(LOWBIT_Q_SRC
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/lowbit-q/lowbit-q-mul-mat.c
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/lowbit-q/lowbit-q-model-builder.c
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/lowbit-q/lowbit-q-metadata.c)

add_subdirectory(llama.cpp)

# Expose lowbit-Q headers to llama.cpp subdirectory (models/llama.cpp includes lowbit-q-mul-mat.h)
target_include_directories(llama PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/cpp/lowbit-q)

# Add lowbit-Q C sources to the llama library (not wllama executable)
# This resolves lowbit_q_build_mul_mat / lowbit_q_log_model_info link errors
target_sources(llama PRIVATE ${LOWBIT_Q_SRC})

set(CMAKE_THREAD_LIBS_INIT "-lpthread")
set(CMAKE_HAVE_THREADS_LIBRARY 1)
set(CMAKE_USE_WIN32_THREADS_INIT 0)
set(CMAKE_USE_PTHREADS_INIT 1)
set(THREADS_PREFER_PTHREAD_FLAG ON)

set(WLLAMA_SRC cpp/wllama.cpp
    cpp/actions.hpp
    cpp/glue.hpp
    cpp/helpers/wlog.cpp
    cpp/helpers/wcommon.cpp
    cpp/helpers/wsampling.cpp
    llama.cpp/include/llama.h)

include_directories(${CMAKE_CURRENT_SOURCE_DIR}/cpp)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/cpp/helpers)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/cpp/lowbit-q)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp/ggml/include)

add_executable(wllama ${WLLAMA_SRC})
target_link_libraries(wllama PRIVATE ggml llama ${CMAKE_THREAD_LIBS_INIT})
CMAKEOF
  echo "    CMakeLists.txt patched successfully (full rewrite)"
else
  echo "    CMakeLists.txt already patched (skipping)"
fi

# Verify patch
if grep -q 'LOWBIT_Q_SRC' CMakeLists.txt && grep -q 'lowbit-q-mul-mat' CMakeLists.txt; then
  echo "    Verification: OK"
else
  echo "    ERROR: Patch 0001 verification failed!"
  exit 1
fi

# -----------------------------------------------------------------------
# Step 4a: Apply llama.cpp loader patch (patch 0002)
#          Makes projection weight tensors TENSOR_NOT_REQUIRED so that
#          SVID_1BIT layers (which have no .weight tensor) load without error.
# -----------------------------------------------------------------------
echo "[4/5] Patching llama.cpp (patch 0002 — optional weights)..."

LLAMA_MODEL_CPP="$FORK_DIR/llama.cpp/src/llama-model.cpp"
LLAMA_MODEL_H="$FORK_DIR/llama.cpp/src/llama-model.h"
if [ ! -f "$LLAMA_MODEL_CPP" ]; then
  echo "    WARNING: $LLAMA_MODEL_CPP not found — skipping patch 0002"
  echo "    (llama.cpp submodule may not be initialized)"
else
  python3 "$SCRIPT_DIR/0002-llama-loader-optional-weights.py" "$LLAMA_MODEL_CPP" "$LLAMA_MODEL_H"
  echo "    Patch 0002 applied"
fi

# -----------------------------------------------------------------------
# Step 4b: Apply llama.cpp graph builder patch (patch 0003)
#          Adds lowbit-Q SVID dispatch in llm_build_llama constructor.
# -----------------------------------------------------------------------
echo "    Patching llama.cpp (patch 0003 — lowbit-Q dispatch)..."

LLAMA_MODELS_CPP="$FORK_DIR/llama.cpp/src/models/llama.cpp"
if [ ! -f "$LLAMA_MODELS_CPP" ]; then
  # Older llama.cpp layout: models/ was not a separate directory
  LLAMA_MODELS_CPP="$FORK_DIR/llama.cpp/src/llama-model.cpp"
  if [ ! -f "$LLAMA_MODELS_CPP" ]; then
    echo "    WARNING: graph builder source not found — skipping patch 0003"
    echo "    (expected: src/models/llama.cpp or src/llama-model.cpp)"
  else
    echo "    Using fallback path: $LLAMA_MODELS_CPP"
    python3 "$SCRIPT_DIR/0003-llama-build-lowbit-q-dispatch.py" "$LLAMA_MODELS_CPP"
    echo "    Patch 0003 applied (fallback path)"
  fi
else
  python3 "$SCRIPT_DIR/0003-llama-build-lowbit-q-dispatch.py" "$LLAMA_MODELS_CPP"
  echo "    Patch 0003 applied"
fi

echo "[4/5] llama.cpp patches complete"

# -----------------------------------------------------------------------
# Step 4c: Patch wllama/WebGPU glue for local WebGPU builds
# -----------------------------------------------------------------------
echo "    Patching wllama WebGPU glue..."

WLLAMA_TS="$FORK_DIR/src/wllama.ts"
if [ -f "$WLLAMA_TS" ]; then
  python3 - "$WLLAMA_TS" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
if "n_gpu_layers?: number;" not in text:
    text = text.replace("  n_threads?: number;\n", "  n_threads?: number;\n  n_gpu_layers?: number;\n", 1)
text = text.replace("      n_gpu_layers: 0,\n", "      n_gpu_layers: config.n_gpu_layers ?? 0,\n", 1)
path.write_text(text)
PY
  echo "    wllama.ts patched for n_gpu_layers"
else
  echo "    WARNING: $WLLAMA_TS not found — skipping n_gpu_layers patch"
fi

WEBGPU_CPP="$FORK_DIR/llama.cpp/ggml/src/ggml-webgpu/ggml-webgpu.cpp"
if [ -f "$WEBGPU_CPP" ]; then
  python3 - "$WEBGPU_CPP" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old = """    ctx->webgpu_global_ctx->device.GetQueue().OnSubmittedWorkDone(wgpu::CallbackMode::WaitAnyOnly,\n            [&callback_status, &callback_message](wgpu::QueueWorkDoneStatus status, wgpu::StringView message) {\n                callback_status = status;\n                callback_message = std::string(message);\n            });\n"""
new = """#ifdef __EMSCRIPTEN__\n    ctx->webgpu_global_ctx->device.GetQueue().OnSubmittedWorkDone(wgpu::CallbackMode::WaitAnyOnly,\n            [&callback_status](wgpu::QueueWorkDoneStatus status) { callback_status = status; });\n#else\n    ctx->webgpu_global_ctx->device.GetQueue().OnSubmittedWorkDone(wgpu::CallbackMode::WaitAnyOnly,\n            [&callback_status, &callback_message](wgpu::QueueWorkDoneStatus status, wgpu::StringView message) {\n                callback_status = status;\n                callback_message = std::string(message);\n            });\n#endif\n"""
if old in text and "__EMSCRIPTEN__" not in text[text.find(old)-80:text.find(old)+len(old)+80]:
    text = text.replace(old, new, 1)

old = """#ifdef __EMSCRIPTEN__\n    std::vector<wgpu::InstanceFeatureName> instance_features = { wgpu::InstanceFeatureName::TimedWaitAny };\n    instance_descriptor.requiredFeatureCount                  = instance_features.size();\n    instance_descriptor.requiredFeatures                      = instance_features.data();\n#else\n    instance_descriptor.capabilities.timedWaitAnyEnable   = true;\n    instance_descriptor.capabilities.timedWaitAnyMaxCount = 1;\n#endif\n"""
new = """#ifdef __EMSCRIPTEN__\n    instance_descriptor.capabilities.timedWaitAnyEnable   = true;\n    instance_descriptor.capabilities.timedWaitAnyMaxCount = 1;\n#else\n    std::vector<wgpu::InstanceFeatureName> instance_features = { wgpu::InstanceFeatureName::TimedWaitAny };\n    instance_descriptor.requiredFeatureCount                  = instance_features.size();\n    instance_descriptor.requiredFeatures                      = instance_features.data();\n#endif\n"""
if old in text:
    text = text.replace(old, new, 1)

path.write_text(text)
PY
  echo "    ggml-webgpu.cpp patched for Emscripten 4.0.10"
else
  echo "    WARNING: $WEBGPU_CPP not found — skipping WebGPU glue patch"
fi

# -----------------------------------------------------------------------
# Step 5: Build WASM (optional)
# -----------------------------------------------------------------------
if [[ "${1:-}" == "--build" ]]; then
  echo "[5/5] Building WASM binaries (requires Docker)..."
  cd "$FORK_DIR"
  if [ -f "scripts/build_wasm.sh" ]; then
    bash scripts/build_wasm.sh
    echo ""
    echo "=== Build complete ==="
    echo "  Single-thread WASM: $FORK_DIR/esm/single-thread/wllama.wasm"
    echo "  Multi-thread WASM:  $FORK_DIR/esm/multi-thread/wllama.wasm"
    echo ""
    echo "Do not copy these Memory64 WASM files directly into vendor/wllama/."
    echo "They require matching JS glue updates in src/vendor/wllama/index.js."
  else
    echo "    WARNING: build_wasm.sh not found. Manual build required."
    echo "    See: https://github.com/nicekid1/Wllama#building-from-source"
  fi
else
  echo "[5/5] Skipping WASM build (pass --build to build)"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Fork is at: $FORK_DIR"
echo ""
echo "Patches applied:"
echo "  0001: CMakeLists.txt — lowbit-Q sources added to WASM build"
echo "  0002: llama-model.cpp — projection weights marked TENSOR_NOT_REQUIRED"
echo "  0003: models/llama.cpp — lowbit-Q SVID dispatch in llm_build_llama"
echo ""
echo "Next steps:"
echo "  1. cd $FORK_DIR"
echo "  2. Review changes in llama.cpp/src/{llama-model.cpp,models/llama.cpp}"
echo "  3. Run: bash scripts/build_wasm.sh  (requires Docker)"
echo "  4. Or:  ./vendor/wllama/lowbit-q/build-local.sh  (requires emsdk 4.0.3)"
echo "  5. Keep vendor/wllama/{single,multi}-thread.wasm on upstream binaries unless JS glue is updated too"
