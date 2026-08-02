# Go-live — ts-3 cutover (sole sheet reader/writer)

> **Full audit + phased fix plan:** [GO-LIVE-STATUS.md](./GO-LIVE-STATUS.md)  
> **Latest local rehearsal:** [REHEARSAL.md](./REHEARSAL.md)  
> Do **not** flip `https://p-cult.github.io/task/` until blockers B1–B9 there are closed.

One-command preflight: **`./go-live.sh`** (runs `npm test` + health check + prints checklists).  
**Does not** modify or delete ts-2. **Does not** deploy Pages/Render.

Sheet K write map: [SHEET-STATUS-CONTRACT.md](./SHEET-STATUS-CONTRACT.md).

## End state (what you asked for)

After the switch:

| Role | Who |
|------|-----|
| Read Master + user sheets | **ts-3 only** |
| Write Master + user sheets | **ts-3 only** (`WRITER_OF_RECORD=ts3`) |
| ts-2 app / middleware | **Stopped** (code kept as backup; never deleted) |

Local sole-writer rehearsal (writes on):

```bash
# 1. Stop ts-2 middleware / public UI first
./run-sole.sh
```

Env that means sole writer:

```text
APP_MODE=production
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
WRITER_OF_RECORD=ts3
BRIDGE_URL=…
BRIDGE_SECRET=…
BRIDGE_PROTOCOL=thin   # live Apps Script speaks read|write|listen|react
```

## Preflight

```bash
./run-live-read.sh   # read-only rehearsal (writes still off)
./go-live.sh         # tests + health + checklist
```

Skip tests when server-only check: `./go-live.sh --skip-tests`

## Cutover sequence

1. **Preflight** — `npm test` green; live-read shows old tasks (esp. Completed).
2. **Pause ts-2** — stop ts-2 middleware/UI so it cannot write Sheets.
3. **Flip ts-3 to sole writer** — local `./run-sole.sh`, or Render with production env above.
4. **Point users at ts-3** — Pages/Oracle URL; login with live Master usernames.
5. **Smoke** — create one task, edit status, confirm Master `task` + `mapping` + user sheet rows.
6. **Keep ts-2 tree** — archive only; never delete from the drive.

## Rollback

Stop ts-3 sole-writer process; restart ts-2; set ts-3 back to `WRITER_OF_RECORD=ts2` / live-read if needed.

See [HOSTING.md](HOSTING.md) for Render/Pages env vars.
