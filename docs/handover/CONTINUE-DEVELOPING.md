# Continue developing — Param Task Board (ts-3)

Guide for engineers who inherit this codebase after client handover.

---

## 1. Canonical places (do not invent others)

| Thing | Location |
|-------|----------|
| **Source of truth (code)** | https://github.com/p-cult/ts-3 — remote name **`origin` only** |
| **Published UI** | https://github.com/p-cult/task → https://p-cult.github.io/task/ |
| **API** | Render: `param-task-middleware` → https://param-task-middleware.onrender.com |
| **Working copy (optional)** | Portable path `/Volumes/bkp-01/0proj/code/param/ts-3` if that drive is still used |

```bash
git remote -v
# Should show ONLY:
# origin  https://github.com/p-cult/ts-3.git (fetch)
# origin  https://github.com/p-cult/ts-3.git (push)
```

If a personal `fork` remote appears, remove it (`git remote remove fork`). Push only to `p-cult/ts-3`.

---

## 2. Stack in one page

- **Language:** Node.js 18+ (zero npm runtime dependencies)
- **UI:** single file `frontend/index.html` (+ shared CSS under `middleware/shared/`)
- **API:** plain Node HTTP in `middleware/`
- **Data:** Google Sheets via Apps Script thin bridge (`BRIDGE_URL` + secret)
- **Tests:** `npm test` (slice + foundation scripts)

Architecture law (short):

1. Middleware mints **Task IDs** — never invent them in Sheets.  
2. Birth order: user sheet (vehicle) → Master (depot) → mapping.  
3. Frontend talks **only** to middleware `/api/*`, never straight to Sheets.

---

## 3. First-time setup

### 3.1 Tools

- Git, Node 18+, GitHub CLI (`gh`)
- Access: collaborator on `p-cult/ts-3` and `p-cult/task`
- Optional: Cursor / VS Code

### 3.2 Clone and run (offline / memory demo)

```bash
git clone https://github.com/p-cult/ts-3.git
cd ts-3
npm install          # no packages; keeps lock hygiene
./run.sh             # http://127.0.0.1:4303/
npm test
```

Demo logins (memory fixture only): `ts3admin` / `ts3-98860`.

### 3.2b One-box deploy (UI + API together)

Portable mirror of staging: one process (or Docker) serves the board and `/api`. Sheets still use the Apps Script bridge.

```bash
./scripts/verify-one-box.sh          # automated smoke (memory)
./scripts/run-one-box.sh --memory    # leave running → http://127.0.0.1:4303/
# Docker: see docs/handover/ONE-BOX-DEPLOY.md  (deploy/one-box/)
```

For AI-assisted continuation, start with **[AI-HANDOFF.md](AI-HANDOFF.md)**.

### 3.3 Local against live Master (read-only recommended)

Requires a local `.env` (gitignored) with `BRIDGE_URL`, `BRIDGE_SECRET`, `MASTER_ID`:

```bash
./run-live-read.sh   # live data, sheet writes off
```

Log in with **Master users-tab** credentials.

### 3.4 Supervised write modes

See `docs/HOSTING.md`, `run-sole.sh`, and `go-live.sh`.  
Never flip `WRITER_OF_RECORD=ts3` while an older app is still writing the same sheets.

---

## 4. Day-to-day development loop

```bash
git pull --ff-only origin main   # or ./sync.sh on the portable drive
# edit code
npm test
./run.sh                         # or run-live-read.sh
git add …
git commit -m "Clear why"
git push origin HEAD             # deploys middleware via Render auto-deploy
```

### Ship the website (Pages)

UI on production is **not** served from Render. After UI changes:

```bash
npm run build:pages              # → dist/index.html pointed at Render API
# then publish dist/index.html into p-cult/task (see docs/PUBLISH-PAGES.md)
# or: ./scripts/publish-pages.sh
```

Hard-refresh https://p-cult.github.io/task/ after merge to `main`.

---

## 5. Where to change what

| Goal | Start here |
|------|------------|
| Board UI / admin buttons | `frontend/index.html` |
| HTTP routes | `middleware/adapters/http/` |
| Business rules | `middleware/use-cases/`, `middleware/domain/` |
| Sheet row shape / bridge | `middleware/data/sheets.js`, `middleware/bridge/` |
| Config / env names | `middleware/config.js`, `.env.example`, `render.yaml` |
| Pages bake | `build-pages.cjs` |
| Operator docs | `docs/handover/` |

---

## 6. Projects list (admin vocabulary)

- Source: Master sheet tab **`admin`**
- Column **H Active** = `Yes` → shown in dropdown; other values → hidden  
- Column **F Pseudo Name** → label shown in create/inject dropdowns  
- Middleware polls projects every ~5s when live bridge is on  
- Admins can press **Update projects** for an immediate pull  

Do not hand-edit formula columns **D / E / G** on `admin`.

---

## 7. Safety rails (please keep)

| Rule | Why |
|------|-----|
| One writer of record | Prevents duplicate Task IDs and silent overwrites |
| Opaque task `ref` in the API | Task IDs stay server-side |
| Delete clears Sheets before mirror | Avoids ghosts after refresh |
| Inject matches project by code/exact name only | Soft match caused wrong editions |
| Anonymous dropdown vocabulary empty | Cuts public recon of people/projects |
| Secrets only in Render / `.env` | Never commit bridge secrets |

---

## 8. Useful commands

```bash
./run.sh                 # local staging (usually memory)
./run-live-read.sh       # local + live Master, writes off
npm test                 # full suite
npm run build:pages      # bake production UI
./scripts/portable-check.sh
./sync.sh                # portable drive ↔ GitHub
curl -s https://param-task-middleware.onrender.com/api/health | jq .
```

---

## 9. Reading order for new developers

1. This file  
2. [DELIVERY-PACKAGE.md](DELIVERY-PACKAGE.md)  
3. [../../README.md](../../README.md)  
4. [../HOSTING.md](../HOSTING.md)  
5. [../../ARCHITECTURE.md](../../ARCHITECTURE.md) (laws)  
6. [../reference/dataflow.md](../reference/dataflow.md) (sheets)

Ignore `docs/archive/` and old `SLICE-*.md` until you need archaeology.

---

## 10. Support boundaries

| Topic | Owner |
|-------|--------|
| Product rules / approvals | Client operations |
| Sheet structure / users / projects | Client sheet admins |
| Code bugs / features | Assigned developers on `p-cult/ts-3` |
| Render / Pages outages | Hosting account owners |
| Apps Script allowlist / bridge | Google Script owners |
