# AI / new-developer handoff (ts-3)

Paste this file (or point an AI tool at this repo + this doc) when continuing work.

---

## Canonical repos (only these)

| Repo | Role |
|------|------|
| https://github.com/p-cult/ts-3 | Source of truth — middleware, `frontend/index.html`, tests, one-box deploy, docs |
| https://github.com/p-cult/task | Published static UI for GitHub Pages |

Do not treat personal forks as production. Remote should be `origin` → `p-cult/ts-3` only.

---

## Architecture in 6 lines

1. Browser talks **only** to middleware `/api/*` (never straight to Google).  
2. Middleware talks to Sheets only through Apps Script **thin bridge** (`BRIDGE_URL` + `BRIDGE_SECRET`).  
3. Middleware mints **Task IDs**; Sheets never invent them.  
4. Birth order: user sheet → Master → mapping.  
5. Production writer gate: `APP_MODE=production` + `WRITER_OF_RECORD=ts3` (sole writer).  
6. Two host shapes: **split** (Pages + Render) or **one-box** (UI+API same process).

```text
UI ──► Middleware ──► Apps Script bridge ──► Google Sheets
```

---

## Where to start

| Goal | Open |
|------|------|
| Run offline | `./run.sh` or `./scripts/run-one-box.sh --memory` |
| Deploy portable one-box | `docs/handover/ONE-BOX-DEPLOY.md` |
| Understand live prod URLs | `docs/handover/DELIVERY-PACKAGE.md` |
| Day-to-day code/ship | `docs/handover/CONTINUE-DEVELOPING.md` |
| Admin / operators | `docs/handover/ADMIN-GUIDE.md` |
| Hosting env vars | `docs/HOSTING.md`, `render.yaml` |
| Tests | `npm test` |

---

## Do not change without an explicit product decision

- Dual-writer / `WRITER_OF_RECORD` cutover rules  
- Task ID mint / birth order  
- Review stars / sheet status contract  
- Opaque refs  
- Putting Google credentials in the browser  

---

## One-box vs current production

- **Production now:** UI on Pages, API on Render, `CORS_ORIGIN` set.  
- **One-box:** same middleware serves UI; `CORS_ORIGIN` empty; bridge env identical.  
- Verify: `./scripts/verify-one-box.sh` (memory) or `--live` with secrets.

---

## Secrets (never commit)

`BRIDGE_URL`, `BRIDGE_SECRET`, `MASTER_ID`, `SESSION_SECRET` → local `deploy/one-box/.env` or Render dashboard only.

---

## Quick health

```bash
curl -s https://param-task-middleware.onrender.com/api/health | head
# or local one-box:
curl -s http://127.0.0.1:4303/api/health | head
```
