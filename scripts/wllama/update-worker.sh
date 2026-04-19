#!/usr/bin/env bash
#
# update-worker.sh — vendor/wllama-src/ のワーカーコードを再生成し、
#                    src/vendor/wllama/index.js の LLAMA_CPP_WORKER_CODE を置換する。
#
# src/vendor/wllama/index.js はプロジェクト独自拡張 (loadModelFromOpfs 等) を含む
# 事前ビルド済みバンドルです。npm run build:tsup でファイル全体を上書きすると独自拡張が
# 失われるため、このスクリプトは LLAMA_CPP_WORKER_CODE 定数のみを差し替えます。
#
# Usage:
#   bash scripts/wllama/update-worker.sh
#
# Prerequisites:
#   - vendor/wllama-src/ が scripts/wllama/setup.sh で準備済み
#   - Node.js (npm run build:worker のため)
#
# Output:
#   src/vendor/wllama/index.js  — LLAMA_CPP_WORKER_CODE のみ更新済み
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FORK_DIR="$REPO_ROOT/vendor/wllama-src"
WORKER_SRC="$FORK_DIR/src/workers-code/llama-cpp.js"
BUNDLE="$REPO_ROOT/src/vendor/wllama/index.js"

# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------
if [ ! -d "$FORK_DIR" ]; then
  echo "ERROR: vendor/wllama-src/ not found. Run setup first:"
  echo "  bash scripts/wllama/setup.sh"
  exit 1
fi

if [ ! -f "$WORKER_SRC" ]; then
  echo "ERROR: $WORKER_SRC not found."
  echo "  vendor/wllama-src/ may be incomplete. Re-run: bash scripts/wllama/setup.sh"
  exit 1
fi

if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: $BUNDLE not found."
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1: Regenerate generated.ts (embeds JS glue constants)
# ---------------------------------------------------------------------------
echo "[1/2] Regenerating worker code in vendor/wllama-src/ ..."
cd "$FORK_DIR"
npm run build:worker

# ---------------------------------------------------------------------------
# Step 2: Splice LLAMA_CPP_WORKER_CODE into the vendored bundle
# ---------------------------------------------------------------------------
echo "[2/2] Replacing LLAMA_CPP_WORKER_CODE in src/vendor/wllama/index.js ..."
python3 - <<PY
import re, json, sys

worker_src = "$WORKER_SRC"
bundle_path = "$BUNDLE"

with open(worker_src) as f:
    new_code = json.dumps(f.read())

with open(bundle_path) as f:
    bundle = f.read()

before = bundle
start_marker = 'var LLAMA_CPP_WORKER_CODE = '
end_marker = '\nvar OPFS_UTILS_WORKER_CODE = '

try:
    start = bundle.index(start_marker)
    end = bundle.index(end_marker, start)
except ValueError:
    sys.exit("ERROR: LLAMA_CPP_WORKER_CODE block not found in index.js")

replacement = start_marker + new_code
bundle = bundle[:start] + replacement + bundle[end:]

if bundle == before:
    sys.exit("ERROR: LLAMA_CPP_WORKER_CODE replacement made no changes")

with open(bundle_path, 'w') as f:
    f.write(bundle)

print("Done")
PY

echo ""
echo "=== update-worker complete ==="
echo "  src/vendor/wllama/index.js updated."
