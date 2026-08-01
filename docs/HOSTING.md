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
WRITER_OF_RECORD=ts3         # after go-live only
STAGING_WRITES=false         # production default
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

| | Staging | Production |
|---|---------|------------|
| Host | Oracle / laptop | Pages + Render |
| `APP_MODE` | `staging` | `production` |
| Public traffic | ts-2 | ts-3 |
| Writer-of-record | ts-2 | ts-3 |

See [GO-LIVE.md](GO-LIVE.md) for the cutover checklist.
