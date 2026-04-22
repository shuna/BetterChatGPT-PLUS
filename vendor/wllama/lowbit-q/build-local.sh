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
# Optional JS glue sync (CPU always; WebGPU variants require their build flag):
#   WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh
#   WLLAMA_SYNC_VENDOR_JS=1 WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh
#   WLLAMA_SYNC_VENDOR_JS=1 WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 bash scripts/wllama/build.sh
#
# Optional WebGPU build (JSPI and Asyncify are independent flags):
#   WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh
#   WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 bash scripts/wllama/build.sh
#   WLLAMA_BUILD_WEBGPU=1 EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg bash scripts/wllama/build.sh
#
# Output:
#   vendor/wllama/single-thread-cpu-compat.wasm
#   vendor/wllama/multi-thread-cpu-compat.wasm
#   vendor/wllama/single-thread-cpu-mem64.wasm
#   vendor/wllama/multi-thread-cpu-mem64.wasm
#   vendor/wllama/single-thread-webgpu-compat.wasm          (when WLLAMA_BUILD_WEBGPU=1)
#   vendor/wllama/multi-thread-webgpu-compat.wasm           (when WLLAMA_BUILD_WEBGPU=1)
#   vendor/wllama/single-thread-webgpu-asyncify-compat.wasm (when WLLAMA_BUILD_WEBGPU_ASYNCIFY=1)
#   vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm  (when WLLAMA_BUILD_WEBGPU_ASYNCIFY=1)
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
BUILD_WEBGPU_ASYNCIFY="${WLLAMA_BUILD_WEBGPU_ASYNCIFY:-0}"

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
# WebGPU + JSPI: emdawnwebgpu's WaitAny implementation uses JSPI (WebAssembly.promising/Suspending).
SHARED_EMCC_CFLAGS_WEBGPU_COMPAT="$SHARED_EMCC_CFLAGS_COMPAT -sJSPI=1"
# WebGPU + Asyncify: Binaryen's Asyncify pass cannot instrument through -fwasm-exceptions
# (native wasm EH) — confirmed empirically: asyncify_start_unwind is emitted but wasmExports
# never exposes it as a function, causing _asyncify_start_unwind is not a function at runtime.
# Fix: derive from a base that replaces -fwasm-exceptions with Emscripten's JS-based exceptions
# (no explicit exception flag = Emscripten default = longjmp/JS, compatible with Asyncify).
# Consequence: the 'exnref' capability is not required for this variant (see variant-table.ts).
# Documented in vendor/wllama/SpecAndStatus.md.
SHARED_EMCC_CFLAGS_ASYNCIFY_BASE="--no-entry -O3 -msimd128 -DNDEBUG -flto=full -frtti -sEXPORT_ALL=1 -sEXPORT_ES6=0 -sMODULARIZE=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_FUNCTIONS=_main,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug -sEXPORTED_RUNTIME_METHODS=ccall,cwrap -sNO_EXIT_RUNTIME=1"
SHARED_EMCC_CFLAGS_WEBGPU_ASYNCIFY_COMPAT="$SHARED_EMCC_CFLAGS_ASYNCIFY_BASE -sINITIAL_MEMORY=128MB -sMAXIMUM_MEMORY=2048MB -sASYNCIFY=1 -sASSERTIONS=1 -sIMPORTED_MEMORY"
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
cmake_webgpu_asyncify_args=()
if [ "$BUILD_WEBGPU_ASYNCIFY" = "1" ]; then
  cmake_webgpu_asyncify_args+=("-DGGML_WEBGPU=ON")
  # Generate compile_commands.json so verify_webgpu_jspi_disabled can inspect
  # the actual compile command for ggml-webgpu.cpp (more reliable than flags.make).
  cmake_webgpu_asyncify_args+=("-DCMAKE_EXPORT_COMPILE_COMMANDS=ON")
  # Explicitly disable JSPI for the Asyncify build.
  # Verify this flag is respected: inspect the CMake configure log and generated
  # link commands for absence of JSPI-specific defines.  If upstream does not
  # expose GGML_WEBGPU_JSPI=OFF, patch vendor/wllama-src/ggml/src/ggml-webgpu/CMakeLists.txt
  # locally and document the patch in vendor/wllama/SpecAndStatus.md.
  cmake_webgpu_asyncify_args+=("-DGGML_WEBGPU_JSPI=OFF")
  if [ -n "${EMDAWNWEBGPU_DIR:-}" ]; then
    cmake_webgpu_asyncify_args+=("-DEMDAWNWEBGPU_DIR=$EMDAWNWEBGPU_DIR")
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

verify_webgpu_jspi_disabled() {
  # Usage: verify_webgpu_jspi_disabled <build_dir> <cmake_log_file>
  #
  # Confirms that JSPI was genuinely excluded from an Asyncify WebGPU build.
  # Three independent checks must all pass; any failure is fatal.
  #
  # Check 1 — cmake did not ignore the flag:
  #   CMake prints "Manually-specified variables were not used by the project:
  #   GGML_WEBGPU_JSPI" when the variable is passed but never referenced in
  #   CMakeLists.txt.  That means the build is not controlled by our flag and
  #   JSPI may still be compiled in via the default code path.
  #
  # Check 2 — no JSPI-related defines in the compiler flags used to build wllama:
  #   CMakeFiles/wllama.dir/flags.make contains the per-target CXX_FLAGS and
  #   C_FLAGS injected at compile time.  If GGML_WEBGPU_JSPI appears there as a
  #   define (e.g. -DGGML_WEBGPU_JSPI=1), the source was compiled with JSPI on.
  #
  # Check 3 — Emscripten linker did not inject JSPI runtime into wllama.js:
  #   -sJSPI=1 causes the Emscripten linker to emit WebAssembly.promising and
  #   WebAssembly.Suspending calls.  Their presence in wllama.js is a hard
  #   indicator that the link step used JSPI regardless of cmake flags.
  local build_dir="$1"
  local cmake_log="$2"
  local failed=0

  # ── Check 1: cmake did not silently ignore GGML_WEBGPU_JSPI ─────────────────
  if [ ! -f "$cmake_log" ]; then
    echo "ERROR: verify_webgpu_jspi_disabled: cmake log not found: $cmake_log" >&2
    exit 1
  fi

  # "Manually-specified variables were not used" appears in cmake stderr/stdout
  # when a -D variable is unknown to the project.
  if grep -q 'Manually-specified variables were not used' "$cmake_log" \
     && grep -A5 'Manually-specified variables were not used' "$cmake_log" \
        | grep -q 'GGML_WEBGPU_JSPI'; then
    echo "ERROR: CMake ignored -DGGML_WEBGPU_JSPI=OFF (variable not used by the project)." >&2
    echo "  Upstream CMakeLists.txt does not reference GGML_WEBGPU_JSPI." >&2
    echo "  Patch vendor/wllama-src/ggml/src/ggml-webgpu/CMakeLists.txt to honour the flag," >&2
    echo "  then re-run the build. Document the patch in vendor/wllama/SpecAndStatus.md." >&2
    failed=1
  else
    echo "  [verify-1] cmake honoured GGML_WEBGPU_JSPI (no 'not used' warning) — OK"
  fi

  # ── Check 2: no JSPI defines in ggml-webgpu compile flags ──────────────────
  # GGML_WEBGPU_JSPI is consumed by vendor/wllama-src/llama.cpp/ggml/src/ggml-webgpu/
  # CMakeLists.txt, so the define will appear in ggml-webgpu.dir/flags.make, not in
  # wllama.dir.  Scan all flags.make files under the build tree that belong to
  # ggml-webgpu targets.  Also check compile_commands.json (generated when
  # -DCMAKE_EXPORT_COMPILE_COMMANDS=ON is passed) as a more reliable alternative.

  local jspi_define_found=0

  # 2a. flags.make: look for any ggml-webgpu.dir/flags.make in the entire tree.
  local webgpu_flags_count=0
  while IFS= read -r ff; do
    webgpu_flags_count=$((webgpu_flags_count + 1))
    if grep -qE 'GGML_WEBGPU_JSPI[[:space:]]*=[[:space:]]*1|-DGGML_WEBGPU_JSPI=1' "$ff"; then
      echo "ERROR: GGML_WEBGPU_JSPI=1 found in compile flags: $ff" >&2
      echo "  ggml-webgpu/CMakeLists.txt set JSPI ON despite -DGGML_WEBGPU_JSPI=OFF." >&2
      echo "  Patch vendor/wllama-src/ggml/src/ggml-webgpu/CMakeLists.txt. Document in SpecAndStatus.md." >&2
      jspi_define_found=1
    else
      echo "  [verify-2a] no GGML_WEBGPU_JSPI=1 in $ff — OK"
    fi
  done < <(find "$build_dir" -name 'flags.make' -path '*/ggml-webgpu.dir/*' 2>/dev/null)

  if [ "$webgpu_flags_count" -eq 0 ]; then
    echo "  WARNING: no ggml-webgpu.dir/flags.make found under $build_dir." >&2
    echo "    Falling back to compile_commands.json check only." >&2
  fi

  # 2b. compile_commands.json: generated when -DCMAKE_EXPORT_COMPILE_COMMANDS=ON is
  #     passed to cmake (added to cmake_webgpu_asyncify_args).  Grep the ggml-webgpu.cpp
  #     entry for JSPI defines; this catches cases where flags.make is absent or
  #     abbreviated by the build system.
  local ccdb="$build_dir/compile_commands.json"
  if [ -f "$ccdb" ]; then
    if grep -A3 'ggml-webgpu' "$ccdb" | grep -qE 'GGML_WEBGPU_JSPI[[:space:]]*=[[:space:]]*1|-DGGML_WEBGPU_JSPI=1'; then
      echo "ERROR: GGML_WEBGPU_JSPI=1 found in compile_commands.json (ggml-webgpu entry)." >&2
      echo "  Patch vendor/wllama-src/ggml/src/ggml-webgpu/CMakeLists.txt. Document in SpecAndStatus.md." >&2
      jspi_define_found=1
    else
      echo "  [verify-2b] compile_commands.json: no GGML_WEBGPU_JSPI=1 in ggml-webgpu entries — OK"
    fi
  else
    echo "  WARNING: compile_commands.json not found; flags.make check is the only compile-flag evidence." >&2
    echo "    Consider adding -DCMAKE_EXPORT_COMPILE_COMMANDS=ON to cmake_webgpu_asyncify_args." >&2
  fi

  [ "$jspi_define_found" -eq 1 ] && failed=1

  # ── Check 3: Emscripten linker did not inject JSPI runtime ───────────────────
  local js_file="$build_dir/wllama.js"
  if [ ! -f "$js_file" ]; then
    echo "ERROR: verify_webgpu_jspi_disabled: $js_file not found" >&2
    exit 1
  fi

  if grep -qF 'WebAssembly.promising' "$js_file" || grep -qF 'WebAssembly.Suspending' "$js_file"; then
    echo "ERROR: JSPI linker output (WebAssembly.promising/Suspending) found in $js_file." >&2
    echo "  The link step used -sJSPI=1 regardless of cmake flags." >&2
    echo "  Check EMCC_CFLAGS and emcmake cmake output. Document in SpecAndStatus.md." >&2
    failed=1
  else
    echo "  [verify-3] wllama.js: no JSPI linker markers — OK"
  fi

  [ "$failed" -eq 1 ] && exit 1

  # ── Advisory: wllama_* direct export presence ────────────────────────────────
  # Not a failure condition here; document findings before promoting to active.
  for sym in _wllama_start _wllama_action _wllama_exit _wllama_debug _wllama_malloc; do
    if ! grep -qF "\"${sym}\"" "$js_file" && ! grep -qF "Module[\"${sym}\"]" "$js_file"; then
      echo "  WARNING: symbol ${sym} not found as direct export — patch_emscripten_asyncify_exports may be needed." >&2
      echo "    Document in SpecAndStatus.md before promoting variant to active." >&2
    fi
  done
  echo "  [verify] all JSPI-disabled checks passed"
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
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_WEBGPU_COMPAT"
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
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_WEBGPU_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=0"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  patch_emscripten_jspi_exports wllama.js
  patch_pthread_prewarm wllama.js

  cd "$FORK_DIR"
  cp wasm/single-thread-webgpu-compat/wllama.wasm "$VENDOR_DIR/single-thread-webgpu-compat.wasm"
  cp wasm/multi-thread-webgpu-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-webgpu-compat.wasm"

  if [ "$SYNC_VENDOR_JS" = "1" ]; then
    echo ""
    echo "[webgpu-jspi js] Syncing WebGPU JSPI JS glue into vendored wllama runtime..."
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

if [ "$BUILD_WEBGPU_ASYNCIFY" = "1" ]; then
  cd "$FORK_DIR"

  echo ""
  echo "[webgpu-asyncify 1/2] Building single-thread WebGPU Asyncify WASM (compat, no Memory64)..."
  rm -rf wasm/single-thread-webgpu-asyncify-compat
  mkdir -p wasm/single-thread-webgpu-asyncify-compat
  cd wasm/single-thread-webgpu-asyncify-compat

  export EMCC_CFLAGS=""
  _cmake_log_st=$(mktemp)
  emcmake cmake ../.. "${cmake_compat_args[@]}" "${cmake_webgpu_asyncify_args[@]}" 2>&1 \
    | tee "$_cmake_log_st" | tail -6
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_WEBGPU_ASYNCIFY_COMPAT"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  verify_webgpu_jspi_disabled "$(pwd)" "$_cmake_log_st"
  rm -f "$_cmake_log_st"

  cd "$FORK_DIR"

  echo ""
  echo "[webgpu-asyncify 2/2] Building multi-thread WebGPU Asyncify WASM (compat, no Memory64)..."
  rm -rf wasm/multi-thread-webgpu-asyncify-compat
  mkdir -p wasm/multi-thread-webgpu-asyncify-compat
  cd wasm/multi-thread-webgpu-asyncify-compat

  export EMCC_CFLAGS=""
  _cmake_log_mt=$(mktemp)
  emcmake cmake ../.. "${cmake_compat_args[@]}" "${cmake_webgpu_asyncify_args[@]}" 2>&1 \
    | tee "$_cmake_log_mt" | tail -6
  export EMCC_CFLAGS="$SHARED_EMCC_CFLAGS_WEBGPU_ASYNCIFY_COMPAT -pthread -sUSE_PTHREADS=1 -sPTHREAD_POOL_SIZE=0"
  emmake make wllama -j"$NPROC" 2>&1
  expose_emscripten_heap_views wllama.js
  verify_webgpu_jspi_disabled "$(pwd)" "$_cmake_log_mt"
  rm -f "$_cmake_log_mt"
  patch_pthread_prewarm wllama.js

  cd "$FORK_DIR"
  cp wasm/single-thread-webgpu-asyncify-compat/wllama.wasm "$VENDOR_DIR/single-thread-webgpu-asyncify-compat.wasm"
  cp wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm  "$VENDOR_DIR/multi-thread-webgpu-asyncify-compat.wasm"

  if [ "$SYNC_VENDOR_JS" = "1" ]; then
    echo ""
    echo "[webgpu-asyncify js] Syncing WebGPU Asyncify JS glue into vendored wllama runtime..."
    mkdir -p src/single-thread src/multi-thread

    cp wasm/single-thread-webgpu-asyncify-compat/wllama.js   src/single-thread/wllama.js
    cp wasm/single-thread-webgpu-asyncify-compat/wllama.wasm src/single-thread/wllama.wasm
    cp wasm/multi-thread-webgpu-asyncify-compat/wllama.js    src/multi-thread/wllama.js
    cp wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm  src/multi-thread/wllama.wasm

    npm run build:worker
    npm run build:tsup
    npm run build:typedef

    cp esm/index.js "$REPO_ROOT/src/vendor/wllama/webgpu-asyncify-index.js"
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
echo "  - WebGPU JSPI variants are opt-in via WLLAMA_BUILD_WEBGPU=1"
echo "  - WebGPU Asyncify variants are opt-in via WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 (independent of JSPI)"
echo "  - WebGPU mem64 variants are not built (out of scope)"
echo "  - WLLAMA_SYNC_VENDOR_JS=1 syncs glue for whichever variants were built in this run:"
echo "      src/vendor/wllama/index.js                 (CPU compat WASM variants)"
echo "      src/vendor/wllama/mem64-index.js           (CPU mem64 WASM variants)"
echo "      src/vendor/wllama/webgpu-index.js          (WebGPU JSPI variants, with WLLAMA_BUILD_WEBGPU=1)"
echo "      src/vendor/wllama/webgpu-asyncify-index.js (WebGPU Asyncify variants, with WLLAMA_BUILD_WEBGPU_ASYNCIFY=1)"
echo "  - JS glue bundles use ABI-specific WASM memory keys and MUST NOT be swapped across variants"
echo "  - Asyncify WebGPU variants are experimental active entries; validate Firefox/mobile behavior before release"
