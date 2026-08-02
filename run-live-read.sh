#!/usr/bin/env bash
# Live Master read (no writes). Requires .env with BRIDGE_URL + BRIDGE_SECRET
# and a redeployed apps-script/bridge.gs that reads the Projects tab.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "ERROR: create .env from .env.example with BRIDGE_URL and BRIDGE_SECRET"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [[ -z "${BRIDGE_URL:-}" || -z "${BRIDGE_SECRET:-}" ]]; then
  echo "ERROR: BRIDGE_URL and BRIDGE_SECRET must be set in .env"
  exit 1
fi

export APP_MODE="${APP_MODE:-staging}"
export STORE_ADAPTER="${STORE_ADAPTER:-sheets}"
export USE_LIVE_BRIDGE=true
export STAGING_WRITES="${STAGING_WRITES:-false}"
export WRITER_OF_RECORD="${WRITER_OF_RECORD:-ts2}"

echo "ts-3 live-read — USE_LIVE_BRIDGE=true · STAGING_WRITES=${STAGING_WRITES}"
echo "After boot: Inject → Refresh from master  (or POST /api/bridge/refresh as P4)"
exec ./run.sh
