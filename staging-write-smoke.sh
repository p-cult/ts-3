#!/usr/bin/env bash
# staging-write-smoke.sh — supervised Staging write test (NOT default CI).
#
# Requires explicit env (refuse otherwise):
#   APP_MODE=staging
#   STORE_ADAPTER=sheets
#   STAGING_WRITES=true
#   WRITER_OF_RECORD=ts3
#   Optional live: USE_LIVE_BRIDGE=true BRIDGE_URL=… BRIDGE_SECRET=…
#
# Usage:
#   APP_MODE=staging STORE_ADAPTER=sheets STAGING_WRITES=true WRITER_OF_RECORD=ts3 \
#     ./staging-write-smoke.sh
#
# Against a running server (default http://127.0.0.1:4303):
#   BASE=http://127.0.0.1:4303 ./staging-write-smoke.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ "${STAGING_WRITES:-false}" != "true" ]]; then
  echo "Refuse: set STAGING_WRITES=true explicitly" >&2
  exit 2
fi
if [[ "${WRITER_OF_RECORD:-ts2}" != "ts3" ]]; then
  echo "Refuse: set WRITER_OF_RECORD=ts3 for supervised smoke" >&2
  exit 2
fi
if [[ "${APP_MODE:-staging}" != "staging" ]]; then
  echo "Refuse: APP_MODE must be staging" >&2
  exit 2
fi

BASE="${BASE:-http://127.0.0.1:4303}"
USER="${SMOKE_USER:-ts3admin}"
PASS="${SMOKE_PASS:-ts3-98860}"

echo "== health =="
curl -fsS "$BASE/api/health" | head -c 400
echo
echo

echo "== login =="
LOGIN=$(curl -fsS -X POST "$BASE/api/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")
TOKEN=$(node -e "const j=JSON.parse(process.argv[1]); if(!j.token) process.exit(1); process.stdout.write(j.token)" "$LOGIN")
echo "token ok"

NAME="Smoke Write $(date +%s)"
echo "== create $NAME =="
CREATE=$(curl -fsS -X POST "$BASE/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"projectCode\":\"PRJ001\",\"name\":\"$NAME\",\"description\":\"staging-write-smoke\"}")
REF=$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.task.ref)" "$CREATE")
echo "ref=$REF"

echo "== patch Pause =="
curl -fsS -X PATCH "$BASE/api/tasks/$REF" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"Pause"}' | head -c 300
echo
echo
echo "OK — one create + one patch against Staging store"
echo "Revert: STAGING_WRITES=false WRITER_OF_RECORD=ts2"
