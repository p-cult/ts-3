#!/usr/bin/env bash
# Live Master read (no writes). Requires .env with BRIDGE_URL + BRIDGE_SECRET.
# Works against the live ts-2 thin bridge (read/readMany) OR a deployed ts-3 bridge.gs.
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
# Force sheets + live bridge (ignore .env memory/offline defaults).
export STORE_ADAPTER=sheets
export USE_LIVE_BRIDGE=true
export STAGING_WRITES="${STAGING_WRITES:-false}"
export WRITER_OF_RECORD="${WRITER_OF_RECORD:-ts2}"
export BRIDGE_PROTOCOL="${BRIDGE_PROTOCOL:-thin}"

echo "ts-3 live-read — USE_LIVE_BRIDGE=true · STAGING_WRITES=${STAGING_WRITES} · protocol=${BRIDGE_PROTOCOL}"
echo "After boot: Inject → Refresh from master  (or POST /api/bridge/refresh as P4)"
exec ./run.sh
