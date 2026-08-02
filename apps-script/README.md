# apps-script/

Thin Google Apps Script bridge for ts-3. **Never modify ts-2.**

| File | Role |
|------|------|
| `bridge.gs` | Deploy as a web app; live Master readers + write stubs |

## Deploy (manual)

1. Create a new Apps Script project (or clasp) — **not** the ts-2 project.
2. Paste `bridge.gs`.
3. Script Properties: `BRIDGE_SECRET`, `MASTER_ID` (same live master as ts-2 at cutover).
4. Deploy as web app (execute as you; access: anyone with link, or domain).
5. In ts-3 `.env`:

```bash
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
BRIDGE_URL=…
BRIDGE_SECRET=…
STAGING_WRITES=false
```

See [SLICE-13.md](../SLICE-13.md).

## Staging

- **Reads:** live when bridge configured (Slice 13).
- **Writes:** refused until `STAGING_WRITES=true` and bridge write helpers are unlocked.

## Local / CI

Default remains `STORE_ADAPTER=memory`. Sheets adapter loads fixture offline; optional `SHEETS_FIXTURE_PATH`.
