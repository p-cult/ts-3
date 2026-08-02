# Hosting — ts-3 production split

**Staging (now):** frontend + middleware on one server (Oracle or `./run.sh`).  
**Production (after go-live):** GitHub **Pages** (UI) + **Render** (API). Same Google Sheets.

## GitHub Pages (frontend)

| Item | Value |
|------|--------|
| Source | `frontend/index.html` (static bake or Pages branch) |
| API base | Render middleware URL (configure in UI or env at bake time) |
| Auth | Bearer token in `localStorage`; cookie+CSRF when same-site |

Build/deploy: push static assets to Pages; point fetches at Render `/api/*`.

## Render (middleware)

| Item | Value |
|------|--------|
| Start | `node middleware/server.js` |
| Health | `GET /api/health` (public) |
| Env | See below |

### Required / common env vars

```text
NODE_ENV=production
APP_MODE=production          # after cutover (staging until then)
SESSION_SECRET=<strong secret>
CORS_ORIGIN=https://p-cult.github.io   # exact Pages origin
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
BRIDGE_URL=...
BRIDGE_SECRET=...
WRITER_OF_RECORD=ts3         # after go-live only — ts-3 sole writer
STAGING_WRITES=false         # ignored in production; staging-only supervised latch
BRIDGE_PROTOCOL=thin         # live ts-2 Apps Script bridge (or deploy ts-3 bridge.gs later)
QUEUE_MODE=off               # or on per policy
PORT=10000                   # Render sets automatically
```

## CORS + cookies

- Set **`CORS_ORIGIN`** to the exact Pages URL (scheme + host, no trailing slash).
- Middleware responds with `Access-Control-Allow-Origin` on `/api/*` when configured.
- **`OPTIONS`** preflight returns `204` with the same headers.
- **`Access-Control-Allow-Credentials: true`** — session cookies work cross-origin only when the UI sends `credentials: 'include'` and Render sets `SameSite=None; Secure` (future hardening).
- **Bearer token** path (current UI default) avoids cookie CORS complexity for Pages → Render.

## Staging vs production

| | Staging (before) | Production (after switch) |
|---|------------------|---------------------------|
| Host | Oracle / laptop | Pages + Render (or `./run-sole.sh`) |
| `APP_MODE` | `staging` | `production` |
| Public traffic | ts-2 (until flip) | **ts-3 only** |
| Sheet read/write | ts-2 public; ts-3 read-only or supervised | **ts-3 only** |
| `WRITER_OF_RECORD` | `ts2` | `ts3` |
| Local sole rehearsal | — | `./run-sole.sh` (stop ts-2 first) |

Write gates:

- **Staging:** needs `STAGING_WRITES=true` **and** `WRITER_OF_RECORD=ts3`
- **Production:** needs `WRITER_OF_RECORD=ts3` only (`STAGING_WRITES` unused)

See [GO-LIVE.md](GO-LIVE.md) for the cutover checklist.

Bake static UI for GitHub Pages:

```bash
npm run build:pages   # writes dist/index.html → publish to p-cult/task
```

Render blueprint: `render.yaml` (in-place service `param-task-middleware`).
