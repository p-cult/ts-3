#!/usr/bin/env bash
# ts-3 go-live preflight — does NOT modify or delete ts-2.
# Usage: ./go-live.sh [--skip-tests]
set -euo pipefail
cd "$(dirname "$0")"

SKIP_TESTS=0
if [ "${1:-}" = "--skip-tests" ]; then SKIP_TESTS=1; fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4303}"
HEALTH_URL="http://${HOST}:${PORT}/api/health"

echo ""
echo "ts-3 go-live preflight"
echo "======================"
echo "Law: ts-2 is never modified or deleted from this track."
echo ""

# --- Automated tests ---
if [ "$SKIP_TESTS" -eq 0 ]; then
  echo "[1/4] npm test"
  npm test
  echo "      PASS"
else
  echo "[1/4] npm test — skipped (--skip-tests)"
fi

# --- Health check (server must already be listening, or start briefly) ---
echo "[2/4] health check — ${HEALTH_URL}"
if curl -sf "$HEALTH_URL" >/tmp/ts3-health.json 2>/dev/null; then
  SLICE="$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/ts3-health.json','utf8')).slice" 2>/dev/null || echo '?')"
  MODE="$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/ts3-health.json','utf8')).mode.appMode" 2>/dev/null || echo '?')"
  echo "      slice=${SLICE}  appMode=${MODE}  OK"
else
  echo "      WARN: server not reachable at ${HEALTH_URL}"
  echo "      Start Staging first: ./run.sh   then re-run ./go-live.sh"
  exit 1
fi

# --- Staging checklist ---
echo ""
echo "[3/4] Staging checklist (before cutover)"
cat <<'CHECKLIST'
  [ ] ts-2 public traffic still on ts-2 URLs (no accidental cutover)
  [ ] Staging smoke passed on Oracle or ./run.sh against live Sheets read
  [ ] STAGING_WRITES only enabled for supervised test windows
  [ ] WRITER_OF_RECORD=ts2 for public users until flip
  [ ] Bridge URL + secret set on Render (when deploying API)
  [ ] SESSION_SECRET set for production Render service
  [ ] CORS_ORIGIN set to exact GitHub Pages URL
  [ ] Team notified of maintenance window
CHECKLIST

# --- Production flip (document only — operator runs on Render/Pages) ---
echo "[4/4] Production flip (operator steps — not auto-applied)"
cat <<'FLIP'
  1. Pause ts-2 public writers (retire ts-2 app role; keep Sheets)
  2. Deploy middleware to Render with:
       APP_MODE=production
       WRITER_OF_RECORD=ts3
       NODE_ENV=production
       CORS_ORIGIN=<Pages origin>
  3. Bake/publish frontend to GitHub Pages (API → Render URL)
  4. Point public URL at ts-3 Pages UI
  5. Verify: P1 board · P2 create · P3 review · P4 admin · one birth on live sheets
  6. Confirm /api/health reports appMode=production
FLIP

echo ""
echo "Full detail: docs/GO-LIVE.md · docs/HOSTING.md"
echo "Preflight complete — ready for operator cutover when checklist is green."
echo ""
