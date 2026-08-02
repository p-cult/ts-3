# Render cutover — `param-task-middleware`

Live API today is still **ts-2**. Pages PR is ready but must not merge until this service runs ts-3.

**Dashboard:** https://dashboard.render.com/  
**Service name:** `param-task-middleware`  
**Public URL:** `https://param-task-middleware.onrender.com`  
**ts-3 GitHub:** `https://github.com/p-cult/ts-3`

---

## A — Before the maintenance window (safe now)

1. Open the service → **Settings → Build & Deploy**
2. Note current **repo** (likely `param-task-system`) + latest **deploy ID** → paste into backup `git-pins.txt`
3. Confirm you can edit **Environment**

### Bulk paste — non-secret env (Environment → Add from .env)

```bash
NODE_ENV=production
APP_MODE=production
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
BRIDGE_PROTOCOL=thin
WRITER_OF_RECORD=ts2
STAGING_WRITES=false
QUEUE_MODE=off
OUTBOX_AWAIT_BIRTH=true
CORS_ORIGIN=https://p-cult.github.io
RATE_WINDOW_MS=60000
RATE_MAX_LOGINS=20
RATE_MAX_WRITES=120
```

> Keep **`WRITER_OF_RECORD=ts2`** until the freeze second. That way a mistaken early deploy cannot write Sheets.

### Secrets (copy from local `.env` / Script Properties — do not commit)

| Key | Source |
|-----|--------|
| `BRIDGE_URL` | same live `/exec` as today |
| `BRIDGE_SECRET` | same Script Property / local `.env` |
| `MASTER_ID` | Master spreadsheet id |
| `SESSION_SECRET` | Generate new strong value (or Render “generate”) — **required** for production boot |

Save with **Save only** if you are not ready to redeploy yet.

---

## B — Freeze window (do in order)

### T1 — Stop ts-2 writer
In-place replace = switching this service off ts-2 code. Optionally **Suspend** briefly if you need a gap before ts-3 boots.

### T2 — Point service at ts-3 + sole writer
1. **Settings → Build & Deploy**
   - Repository: `p-cult/ts-3`
   - Branch: `main`
   - Root directory: empty / `.`
   - Build command: empty (or leave blank)
   - Start command: `node middleware/server.js`
2. **Environment** — change:
   ```bash
   WRITER_OF_RECORD=ts3
   ```
3. **Manual Deploy** → Deploy latest commit  
4. Wait until deploy green, then:

```bash
curl -sS https://param-task-middleware.onrender.com/api/health | python3 -m json.tool
```

Expect:
- `mode.appMode` = `production`
- `mode.writerOfRecord` = `ts3`
- `banner.message` contains `sole sheet reader/writer`
- `dependencies.hydrate.ok` = true (may take ~30–60s on cold start)

### T3 — Flip Pages
Merge https://github.com/p-cult/task/pull/1 into `main` (serves `p-cult.github.io/task/`).

### T4 — Smoke
Private window → login (Master user) → board loads → one create → Master row appears → outbox drains.

---

## Rollback

1. Redeploy previous Render deploy (ts-2 / `param-task-system`) **or** point repo back + redeploy  
2. Revert Pages to `006992d8e2b2a15eba49d59fae5676e33cb7af7f` (pinned in cutover backup)  
3. Never leave ts-2 and ts-3 both writing

---

## This machine cannot finish dashboard clicks

No Render API token / CLI here. After you change repo + deploy, say **check health** and I will verify the public `/api/health` from here.
