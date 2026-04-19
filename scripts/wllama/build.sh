#!/usr/bin/env bash
#
# build.sh — vendor/wllama-src/ から WASM をビルドして vendor/wllama/ に出力する。
#
# このスクリプトは vendor/wllama/lowbit-q/build-local.sh を呼び出す薄いラッパーです。
#
# Usage:
#   bash scripts/wllama/build.sh
#
# Optional WebGPU build:
#   WLLAMA_BUILD_WEBGPU=1 bash scripts/wllama/build.sh
#   WLLAMA_BUILD_WEBGPU=1 EMDAWNWEBGPU_DIR=/path/to/emdawnwebgpu_pkg bash scripts/wllama/build.sh
#
# Prerequisites:
#   - emsdk installed and activated (source emsdk_env.sh)
#   - vendor/wllama-src/ prepared by scripts/wllama/setup.sh
#
# Output:
#   vendor/wllama/single-thread-compat.wasm
#   vendor/wllama/multi-thread-compat.wasm
#   vendor/wllama/single-thread-webgpu-compat.wasm  (when WLLAMA_BUILD_WEBGPU=1)
#   vendor/wllama/multi-thread-webgpu-compat.wasm   (when WLLAMA_BUILD_WEBGPU=1)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

exec bash "$REPO_ROOT/vendor/wllama/lowbit-q/build-local.sh" "$@"
