#!/usr/bin/env bash
# ts-3 sole sheet reader/writer — AFTER cutover (ts-2 public app must be stopped).
# Uses the live Master via the existing thin bridge. Writes ARE ON.
#
# Law: never edit ts-2. Stop ts-2 middleware/UI before running this so only
# ts-3 touches Sheets.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "ERROR: create .env with BRIDGE_URL and BRIDGE_SECRET (see bridge-credentials.txt)"
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

export APP_MODE=production
export STORE_ADAPTER=sheets
export USE_LIVE_BRIDGE=true
export WRITER_OF_RECORD=ts3
# Staging latch unused in production; leave false so health banner is honest.
export STAGING_WRITES=false
export BRIDGE_PROTOCOL="${BRIDGE_PROTOCOL:-thin}"

echo "ts-3 SOLE WRITER — APP_MODE=production · WRITER_OF_RECORD=ts3 · live bridge on"
echo "Confirm ts-2 app/middleware is stopped before creating/editing tasks."
echo "URL will be http://${HOST:-127.0.0.1}:${PORT:-4303}/"
exec ./run.sh
