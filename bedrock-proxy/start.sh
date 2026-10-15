#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 or newer is required." >&2
  exit 1
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24 or newer is required."); process.exit(1) }'

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install and run the proxy." >&2
  exit 1
fi

if ! node -e 'require.resolve("bedrock-protocol"); require.resolve("yauzl")' >/dev/null 2>&1; then
  npm ci
fi

exec npm start