# SLICE-13 — Live Sheets read

**Status:** Built (`slice13.test.js`).  
**Depends on:** Slice 05 (spine) + Slice 06 (write gates stay off).  
**Mode:** `APP_MODE=staging`. **`STAGING_WRITES=false`**.

## Delivered

| Piece | Role |
|-------|------|
| `apps-script/bridge.gs` | Real Master readers: `task` / `admin` / `users` / `mapping` (+ vehicle by sheet id) |
| `middleware/data/sheet-row.js` | Pure A–N / admin / users → middleware shape |
| `middleware/data/sheets.js` | `refreshFromBridge` hydrates depot + users + projects |
| Boot hydrate | `startServer` awaits refresh when `USE_LIVE_BRIDGE=true` |

## Behaviour

- Successful live depot **replaces** fixture tasks (empty live depot clears mirror — no silent fixture fallback).
- Bridge failure keeps prior mirror and logs a warning.
- Writes still refused (`STAGING_WRITES=false`).
- Health reports `slice: 13`.

## How to try against live Master

1. Deploy `apps-script/bridge.gs` (new project — never ts-2). Script Properties: `BRIDGE_SECRET`, `MASTER_ID`.
2. Local `.env`:

```bash
APP_MODE=staging
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
BRIDGE_URL=https://script.google.com/macros/s/…/exec
BRIDGE_SECRET=…
STAGING_WRITES=false
WRITER_OF_RECORD=ts2
```

3. `./run.sh` → `GET /api/health` (`liveBridge`, bridge ok) → `GET /api/tasks` shows Master rows.

Login needs plaintext passwords in Users tab column H (or keep staging fixture users if bridge users omit passwords).

## Out of scope

Controlled live writes, script lock, poll/listen freshness (next priorities).
