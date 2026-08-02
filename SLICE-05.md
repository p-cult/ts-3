# SLICE-05 — Google spine (read path)

**Status:** Built (`slice05.test.js`).  
**Depends on:** Slice 01–04.  
**Mode:** `APP_MODE=staging`. **`STAGING_WRITES=false`** by default.

## Delivered

| Piece | Role |
|-------|------|
| `apps-script/bridge.gs` | Thin bridge (Slice 05 stub → **Slice 13** live readers; writes still stubbed) |
| `middleware/bridge/client.js` | HTTP client to bridge (token in body + Bearer) |
| `middleware/data/sheets.js` | Sheets adapter — same interface as memory |
| `middleware/data/fixtures/sheets-depot.json` | Fixture-shaped depot for CI / local reads |

## Behaviour

- Default remains **`STORE_ADAPTER=memory`** (unchanged tests).
- **`STORE_ADAPTER=sheets`**: loads fixture (and can refresh from bridge when `USE_LIVE_BRIDGE=true`).
- **`STAGING_WRITES=false`**: birth/update/delete **refused** with clear `STAGING_WRITES=false` error. Reads allowed.
- Health reports `mode.storeAdapter`, `mode.stagingWrites`, `dependencies.data.kind`, `dependencies.bridge`.

## How to try fixture reads

```bash
STORE_ADAPTER=sheets STAGING_WRITES=false ./run.sh
# GET /api/tasks — includes “Sheets Fixture Read Task”
```

Live Master read: see **[SLICE-13.md](SLICE-13.md)** (`USE_LIVE_BRIDGE=true` + deployed `bridge.gs`).

## Out of scope (Slice 06 / 13+)

Controlled live writes, writer-of-record guard, queue.
