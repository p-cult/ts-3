# apps-script/

Thin Google Apps Script bridge for ts-3. **Never modify ts-2.**

| File | Role |
|------|------|
| `bridge.gs` | Deploy as a web app; actions `ping` / `getDepot` / `getVehicle` / `getProjects` / `getUsers` (+ write stubs) |

## Deploy (manual)

1. Create a new Apps Script project (or clasp) — **not** the ts-2 project.
2. Paste `bridge.gs`.
3. Script Properties: `BRIDGE_SECRET`, `MASTER_ID` (same live master as ts-2 at cutover).
4. Deploy as web app (execute as you; access: anyone with link, or domain).
5. In ts-3 `.env`: `USE_LIVE_BRIDGE=true`, `BRIDGE_URL=…`, `BRIDGE_SECRET=…`, `STORE_ADAPTER=sheets`.

## Staging

- Reads allowed when bridge configured.
- Writes stay refused until `STAGING_WRITES=true` (Slice 06) and bridge write helpers are enabled.

## Local / CI

Default remains `STORE_ADAPTER=memory`. Sheets adapter can load a **fixture** (`SHEETS_FIXTURE=1` or path) without calling Google.
