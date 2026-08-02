# SLICE-14 — Controlled live write

**Status:** Built (`slice14.test.js`).  
**Depends on:** Slice 06 gates + Slice 13 live read.  
**Default:** still **writes off** (`STAGING_WRITES=false`, `WRITER_OF_RECORD=ts2`).

## In plain words

ts-3 can now **put one new task onto the real Google Sheets** when you deliberately flip three switches. Normal `./run.sh` does **not** write to Sheets.

Think of it as a supervised rehearsal: create one task, check Master + User sheet + mapping, then turn the switches back off.

## Gates (all required)

1. `STAGING_WRITES=true`
2. `APP_MODE=staging`
3. `WRITER_OF_RECORD=ts3`
4. For live Sheets (not just memory mirror): `USE_LIVE_BRIDGE=true` + `BRIDGE_URL` + `BRIDGE_SECRET`

## What unlocked

| Piece | Behaviour |
|-------|-----------|
| `apps-script/bridge.gs` | `writeVehicle` / `writeDepot` / `writeMapping` under Script Lock; upsert by Task Id |
| Birth order | vehicle → depot → mapping (with row numbers) |
| Failure | live write error rolls back the in-memory mirror — API does not pretend success |

## Supervised smoke

1. Redeploy `bridge.gs` (new Apps Script project — never ts-2).
2. Start server with gates on:

```bash
APP_MODE=staging STORE_ADAPTER=sheets STAGING_WRITES=true WRITER_OF_RECORD=ts3 \
  USE_LIVE_BRIDGE=true BRIDGE_URL=… BRIDGE_SECRET=… ./run.sh
```

3. Other terminal:

```bash
APP_MODE=staging STORE_ADAPTER=sheets STAGING_WRITES=true WRITER_OF_RECORD=ts3 \
  ./staging-write-smoke.sh
```

4. Confirm one new row on user `task`, master `task`, and `mapping`.
5. **Revert immediately:** `STAGING_WRITES=false` `WRITER_OF_RECORD=ts2`.

## Out of scope

Poll/listen freshness, open public cutover, editing ts-2.
