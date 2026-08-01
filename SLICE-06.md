# SLICE-06 — Controlled Staging writes

**Status:** Built (`slice06.test.js`).  
**Depends on:** Slice 05 sheets adapter.  
**Default:** `STAGING_WRITES=false`, `WRITER_OF_RECORD=ts2`.

## Gates (all required for a sheet write)

1. `STAGING_WRITES=true`
2. `APP_MODE=staging`
3. `WRITER_OF_RECORD=ts3` (otherwise refuse — ts-2 remains writer-of-record)

Optional live path: `USE_LIVE_BRIDGE=true` + bridge URL/secret → `writeVehicle` / `writeDepot` / `writeMapping` after mirror birth.

## Health + UI

- `/api/health` includes `mode.stagingWrites`, `mode.writerOfRecord`, and `banner.message`.
- Frontend shows a Staging banner (red when writes on).

## Smoke (not CI)

```bash
APP_MODE=staging STORE_ADAPTER=sheets STAGING_WRITES=true WRITER_OF_RECORD=ts3 \
  ./run.sh
# other terminal:
APP_MODE=staging STORE_ADAPTER=sheets STAGING_WRITES=true WRITER_OF_RECORD=ts3 \
  ./staging-write-smoke.sh
```

Revert immediately after: `STAGING_WRITES=false` `WRITER_OF_RECORD=ts2`.

## Out of scope

Queue, Pages/Render cutover, editing ts-2.
