#!/usr/bin/env bash
# One-command start for ts-3 foundation.
# Usage: ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "ts-3 — one-command start"
echo "------------------------"

# --- Node present & version ---
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found."
  echo "  Install Node 18+ from https://nodejs.org and re-run ./run.sh"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 18 ]; then
  echo "ERROR: Node $(node -v) is too old (need >= 18)."
  echo "  Upgrade Node and re-run ./run.sh"
  exit 1
fi
echo "node    $(node -v)"

# --- Zero-deps install (fast no-op if already clean) ---
if [ -f package.json ]; then
  if command -v npm >/dev/null 2>&1; then
    # No dependencies declared — npm install stays instant and creates package-lock consistency
    npm install --silent --no-fund --no-audit
    echo "npm     install ok (zero runtime deps)"
  else
    echo "npm     not found (ok — this app needs no packages)"
  fi
fi

# --- Env defaults ---
export PORT="${PORT:-4303}"
export HOST="${HOST:-127.0.0.1}"
export NODE_ENV="${NODE_ENV:-development}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export STORE_ADAPTER="${STORE_ADAPTER:-memory}"
export USE_LIVE_BRIDGE="${USE_LIVE_BRIDGE:-false}"

echo "listen  http://${HOST}:${PORT}/"
echo "health  http://${HOST}:${PORT}/api/health"
echo "stop    ctrl+c"
echo "------------------------"

# Bootstrap self-heal + listen (server prints banner)
exec node middleware/server.js
