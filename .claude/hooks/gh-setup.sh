#!/bin/bash
# gh CLI auto-install for Claude Code on the Web
# Only runs in remote (cloud) environments; skips on local machines.

set -euo pipefail

# Skip if not running in a remote Claude Code environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Skip if gh is already installed and available
if command -v gh &>/dev/null; then
  exit 0
fi

GH_VERSION="2.67.0"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  GH_ARCH="amd64" ;;
  aarch64|arm64) GH_ARCH="arm64" ;;
  *)
    echo "gh-setup: unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

TARBALL="gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz"
URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${TARBALL}"
INSTALL_DIR="$HOME/.local"

mkdir -p "$INSTALL_DIR/bin"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "gh-setup: downloading gh v${GH_VERSION} (${GH_ARCH})..."
curl -fsSL "$URL" -o "$TMPDIR/$TARBALL"
tar -xzf "$TMPDIR/$TARBALL" -C "$TMPDIR"

cp "$TMPDIR/gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh" "$INSTALL_DIR/bin/gh"
chmod +x "$INSTALL_DIR/bin/gh"

# Persist PATH for the rest of the session via CLAUDE_ENV_FILE
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "PATH=$INSTALL_DIR/bin:\$PATH" >> "$CLAUDE_ENV_FILE"
fi

# Also export for current hook execution
export PATH="$INSTALL_DIR/bin:$PATH"

# Authenticate using GITHUB_TOKEN if available
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null || true
fi

echo "gh-setup: gh v${GH_VERSION} installed successfully."
