#!/usr/bin/env bash
# Smoke-test one-box (UI + API same host). Safe defaults: memory fixture.
#
# Usage:
#   ./scripts/verify-one-box.sh                 # start memory one-box if needed, test, stop if we started it
#   ./scripts/verify-one-box.sh --live          # require live bridge + production-like health
#   BASE_URL=http://127.0.0.1:4303 ./scripts/verify-one-box.sh   # against already-running server
#
# Exit 0 only when all checks pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="memory"
for arg in "$@"; do
  case "$arg" in
    --live|-l) MODE="live" ;;
    --help|-h)
      sed -n '2,12p' "$0" | sed 's/^# //'
      exit 0
      ;;
  esac
done

BASE_URL="${BASE_URL:-http://127.0.0.1:4303}"
PORT="$(printf '%s' "$BASE_URL" | sed -E 's|.*:([0-9]+).*|\1|')"
STARTED_PID=""
TMPDIR_VERIFY="$(mktemp -d)"
cleanup() {
  if [[ -n "${STARTED_PID:-}" ]] && kill -0 "$STARTED_PID" 2>/dev/null; then
    kill "$STARTED_PID" 2>/dev/null || true
    wait "$STARTED_PID" 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_VERIFY"
}
trap cleanup EXIT

pass=0
fail=0
check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  OK  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL $name" >&2
    fail=$((fail + 1))
  fi
}

already_up=0
if curl -sS -m 2 -o /dev/null -w '' "$BASE_URL/api/health" 2>/dev/null; then
  already_up=1
  echo "using existing server at $BASE_URL"
else
  echo "starting one-box ($MODE) on port ${PORT}…"
  if [[ "$MODE" == "live" ]]; then
    PORT="$PORT" HOST=127.0.0.1 ONE_BOX_ALLOW_EPHEMERAL_SECRET=1 \
      ./scripts/run-one-box.sh --live \
      >"$TMPDIR_VERIFY/server.log" 2>&1 &
  else
    PORT="$PORT" HOST=127.0.0.1 ./scripts/run-one-box.sh --memory \
      >"$TMPDIR_VERIFY/server.log" 2>&1 &
  fi
  STARTED_PID=$!
  for i in $(seq 1 40); do
    if curl -sS -m 1 -o /dev/null "$BASE_URL/api/health" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$STARTED_PID" 2>/dev/null; then
      echo "server exited early:" >&2
      cat "$TMPDIR_VERIFY/server.log" >&2 || true
      exit 1
    fi
    sleep 0.25
  done
fi

echo "verify one-box @ $BASE_URL (mode=$MODE)"
echo "------------------------"

HEALTH_JSON="$TMPDIR_VERIFY/health.json"
curl -sS -m 15 -o "$HEALTH_JSON" -w '' "$BASE_URL/api/health"
check "GET /api/health HTTP body" test -s "$HEALTH_JSON"
check "health JSON has status field" grep -q '"status"' "$HEALTH_JSON"

if [[ "$MODE" == "live" ]]; then
  if grep -q '"state":"disabled"' "$HEALTH_JSON"; then
    check "live bridge not disabled" false
  else
    check "live bridge not disabled" true
  fi
  check "health mentions bridge" grep -q '"bridge"' "$HEALTH_JSON"
  # Prefer hydrated/live; mirror-cache fallback still proves one-box boots with sheets adapter.
  check "store is sheets" grep -qE '"kind":"sheets"|"store":"sheets"|sheets' "$HEALTH_JSON"
fi

INDEX_HTML="$TMPDIR_VERIFY/index.html"
CODE="$(curl -sS -m 10 -o "$INDEX_HTML" -w '%{http_code}' "$BASE_URL/")"
check "GET / returns 200" test "$CODE" = "200"
check "index is HTML" grep -qi '<html' "$INDEX_HTML"
check "index talks to relative /api (same-origin)" grep -qE "/api/" "$INDEX_HTML"

LOGIN_JSON="$TMPDIR_VERIFY/login.json"
if [[ "$MODE" == "memory" ]]; then
  CODE="$(curl -sS -m 10 -o "$LOGIN_JSON" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -d '{"username":"ts3admin","password":"ts3-98860"}' \
    "$BASE_URL/api/login")"
  check "fixture login HTTP 200" test "$CODE" = "200"
  TOKEN="$(node -e "const o=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); process.stdout.write(o.token||'')" "$LOGIN_JSON")"
  check "login returns token" test -n "$TOKEN"
  CODE="$(curl -sS -m 10 -o "$TMPDIR_VERIFY/me.json" -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/me")"
  check "GET /api/me with Bearer" test "$CODE" = "200"
  CODE="$(curl -sS -m 10 -o "$TMPDIR_VERIFY/tasks.json" -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/tasks")"
  check "GET /api/tasks with Bearer" test "$CODE" = "200"
else
  echo "  skip fixture login (live mode — use Master users tab credentials manually)"
fi

echo "------------------------"
echo "passed=$pass failed=$fail"
if [[ "$fail" -gt 0 ]]; then
  if [[ -f "$TMPDIR_VERIFY/server.log" ]]; then
    echo "--- server log (tail) ---" >&2
    tail -40 "$TMPDIR_VERIFY/server.log" >&2 || true
  fi
  exit 1
fi
echo "one-box verify OK"
if [[ "$already_up" -eq 1 ]]; then
  echo "(left pre-existing server running)"
fi
