#!/usr/bin/env bash
# One-box runner — same shape as deploy/one-box Docker image:
# one Node process serves frontend + /api (same-origin).
#
# Usage:
#   ./scripts/run-one-box.sh              # uses deploy/one-box/.env if present, else memory
#   ./scripts/run-one-box.sh --memory     # offline fixture (no Google)
#   ./scripts/run-one-box.sh --live       # production mirror; needs bridge secrets
#
# Docs: docs/handover/ONE-BOX-DEPLOY.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="auto"
for arg in "$@"; do
  case "$arg" in
    --memory|-m) MODE="memory" ;;
    --live|-l) MODE="live" ;;
    --help|-h)
      sed -n '2,14p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg (try --memory or --live)" >&2
      exit 1
      ;;
  esac
done

ONE_BOX_DIR="$ROOT/deploy/one-box"
ENV_FILE="$ONE_BOX_DIR/.env"

if [[ "$MODE" == "auto" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    MODE="file"
  else
    MODE="memory"
  fi
fi

# Clear inherited local .env surprises for one-box modes that load their own file.
# (middleware/config.js also loads root .env — we export after so our values win.)
load_kv_file() {
  local f="$1"
  set -a
  # shellcheck disable=SC1090
  source "$f"
  set +a
}

if [[ "$MODE" == "memory" ]]; then
  echo "one-box mode: memory (offline demo)"
  export NODE_ENV=production
  export APP_MODE=staging
  export HOST="${HOST:-0.0.0.0}"
  export PORT="${PORT:-4303}"
  export LOG_LEVEL="${LOG_LEVEL:-info}"
  export SESSION_SECRET="${SESSION_SECRET:-one-box-demo-change-me-not-for-live}"
  export STORE_ADAPTER=memory
  export USE_LIVE_BRIDGE=false
  export WRITER_OF_RECORD=ts2
  export STAGING_WRITES=false
  export QUEUE_MODE=off
  export CORS_ORIGIN=
elif [[ "$MODE" == "live" ]]; then
  echo "one-box mode: live (Sheets via bridge)"
  if [[ -f "$ENV_FILE" ]]; then
    load_kv_file "$ENV_FILE"
  elif [[ -f "$ROOT/.env" ]]; then
    echo "using root .env for bridge secrets (prefer deploy/one-box/.env)"
    load_kv_file "$ROOT/.env"
  else
    echo "ERROR: need deploy/one-box/.env (from env.live.example) or root .env with BRIDGE_*" >&2
    exit 1
  fi
  if [[ -z "${BRIDGE_URL:-}" || -z "${BRIDGE_SECRET:-}" ]]; then
    echo "ERROR: BRIDGE_URL and BRIDGE_SECRET required for --live" >&2
    exit 1
  fi
  if [[ -z "${SESSION_SECRET:-}" || "$SESSION_SECRET" == "dev-ref-secret" || "$SESSION_SECRET" == "replace-with-long-random-string" ]]; then
    if [[ "${ONE_BOX_ALLOW_EPHEMERAL_SECRET:-}" == "1" ]]; then
      export SESSION_SECRET="one-box-ephemeral-$(date +%s)-$$"
      echo "WARNING: using ephemeral SESSION_SECRET (verify/smoke only — not for durable prod)"
    else
      echo "ERROR: set a strong unique SESSION_SECRET for live one-box" >&2
      echo "  (or ONE_BOX_ALLOW_EPHEMERAL_SECRET=1 for smoke tests only)" >&2
      exit 1
    fi
  fi
  export NODE_ENV=production
  export APP_MODE=production
  export HOST="${HOST:-0.0.0.0}"
  export PORT="${PORT:-4303}"
  export STORE_ADAPTER=sheets
  export USE_LIVE_BRIDGE=true
  export BRIDGE_PROTOCOL="${BRIDGE_PROTOCOL:-thin}"
  export WRITER_OF_RECORD=ts3
  export STAGING_WRITES=false
  export QUEUE_MODE="${QUEUE_MODE:-off}"
  export OUTBOX_AWAIT_BIRTH="${OUTBOX_AWAIT_BIRTH:-true}"
  export CORS_ORIGIN=
  echo "WARNING: sole writer — stop any other app writing the same Master sheets."
elif [[ "$MODE" == "file" ]]; then
  echo "one-box mode: deploy/one-box/.env"
  load_kv_file "$ENV_FILE"
  export HOST="${HOST:-0.0.0.0}"
  export PORT="${PORT:-4303}"
  export CORS_ORIGIN=
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 18+ required" >&2
  exit 1
fi

echo "listen  http://127.0.0.1:${PORT}/  (also ${HOST}:${PORT})"
echo "health  http://127.0.0.1:${PORT}/api/health"
echo "verify  ./scripts/verify-one-box.sh"
echo "------------------------"
exec node middleware/server.js
