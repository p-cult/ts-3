#!/usr/bin/env bash
# Ping Render middleware so free-tier idle spin-down does not trip
# during weekday business hours (Asia/Kolkata).
#
# Window: Mon–Fri 09:00–23:59 IST
# Interval: every ~10 minutes (GitHub Actions cron or local launchd/cron)
#
# Usage:
#   ./scripts/keep-render-awake.sh
#   HEALTH_URL=https://…/api/health ./scripts/keep-render-awake.sh
#   FORCE=1 ./scripts/keep-render-awake.sh   # ignore schedule window
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-https://param-task-middleware.onrender.com/api/health}"
TZ_NAME="${TZ_NAME:-Asia/Kolkata}"
FORCE="${FORCE:-0}"

eval "$(
  TZ_NAME="$TZ_NAME" FORCE="$FORCE" python3 - <<'PY'
import os
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore

tz = ZoneInfo(os.environ.get("TZ_NAME") or "Asia/Kolkata")
now = datetime.now(tz)
force = os.environ.get("FORCE") == "1"
weekday = now.isoweekday()  # 1=Mon … 7=Sun
hm = now.hour * 100 + now.minute
in_window = weekday <= 5 and 900 <= hm <= 2359
print(f"STAMP={now.isoformat()}")
print(f"IN_WINDOW={1 if in_window else 0}")
print(f"SHOULD_PING={1 if force or in_window else 0}")
PY
)"

if [ "${SHOULD_PING}" != "1" ]; then
  echo "skip keep-alive outside Mon–Fri 09:00–23:59 ${TZ_NAME} (now ${STAMP})"
  exit 0
fi

echo "keep-alive ping ${HEALTH_URL} @ ${STAMP}"
# Cold start can take ~60s; allow enough time for the request to wake the box.
code="$(curl -sS -o /tmp/ts3-keepalive-body.json -w '%{http_code}' \
  --connect-timeout 20 --max-time 120 \
  "$HEALTH_URL" || true)"

if [ "$code" = "200" ] || [ "$code" = "503" ]; then
  # 503 can happen during bridge cold ping; the HTTP hit still woke the service.
  echo "ok http=${code} body=$(head -c 180 /tmp/ts3-keepalive-body.json 2>/dev/null || true)"
  exit 0
fi

echo "fail http=${code} body=$(head -c 300 /tmp/ts3-keepalive-body.json 2>/dev/null || true)" >&2
exit 1
