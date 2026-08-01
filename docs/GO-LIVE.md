# Go-live — ts-3 cutover

One-command preflight: **`./go-live.sh`** (runs `npm test` + health check + prints checklists).  
**Does not** modify or delete ts-2.

## Preflight

```bash
./run.sh          # Staging server (separate terminal)
./go-live.sh      # tests + health + checklist
```

Skip tests when server-only check: `./go-live.sh --skip-tests`

## Cutover sequence

1. **Preflight** — `npm test` green; `/api/health` green on Staging; bridge reachable if live.
2. **Pause ts-2 public role** — stop serving new public traffic from ts-2 (Sheets stay).
3. **Deploy API** — Render with `APP_MODE=production`, `WRITER_OF_RECORD=ts3`, `CORS_ORIGIN`, secrets.
4. **Deploy UI** — GitHub Pages from `frontend/`; API base → Render.
5. **Verify** — P1–P4 smoke on production URL; one create + edit on same sheets.
6. **Retire ts-2 processes** — archive code; **never delete ts-2 tree from drive**.

## Rollback

Point public URL back to ts-2; set `WRITER_OF_RECORD=ts2`; keep ts-3 Staging for diagnosis.

See [HOSTING.md](HOSTING.md) for env vars.
