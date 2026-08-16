# One-box deploy — simple steps

**What this is:** Frontend + Middleware on **one** host (same URL). Google Sheets stay in Google via the existing Apps Script bridge.

**What this is not:** A replacement for the bridge. You still paste `BRIDGE_URL`, `BRIDGE_SECRET`, and `MASTER_ID` once.

```text
Browser  →  http://YOUR_HOST:4303/     (UI + /api)
                │
                ▼
         Apps Script bridge
                │
                ▼
         Google Master + user sheets
```

This matches how local staging already works (`./run.sh` serves both). Production today can stay **Pages + Render**; one-box is the portable “put both on a VPS / private cloud” path.

---

## A. Offline demo (no Google) — 2 minutes

Needs: Node 18+ (or Docker).

### Option 1 — Node (no Docker)

```bash
git clone https://github.com/p-cult/ts-3.git
cd ts-3
./scripts/verify-one-box.sh          # starts, checks, stops
./scripts/run-one-box.sh --memory    # leave it running
# open http://127.0.0.1:4303/
# login: ts3admin / ts3-98860
```

### Option 2 — Docker

```bash
cd deploy/one-box
cp env.memory.example .env
docker compose up --build -d
# open http://127.0.0.1:4303/
./../../scripts/verify-one-box.sh    # against the running container
```

---

## B. Live Sheets mirror (exact wiring)

Do this only when you own the Master and the bridge secret.

1. **Confirm the bridge** (already deployed Apps Script web app `/exec`).
2. Copy env template and fill secrets:

```bash
cd deploy/one-box
cp env.live.example .env
# Edit .env:
#   SESSION_SECRET   = long random string (not "dev-ref-secret")
#   BRIDGE_URL       = Apps Script /exec URL
#   BRIDGE_SECRET    = must match Script Property
#   MASTER_ID        = Master spreadsheet id
```

3. **Stop any other writer** (old ts-2 / another Render instance still writing the same sheets). Only one `WRITER_OF_RECORD=ts3` at a time.

4. Start:

```bash
# Docker
docker compose up --build -d

# or Node (same env shape)
cd ../..   # repo root
./scripts/run-one-box.sh --live
```

5. Open `http://YOUR_HOST:4303/` and log in with a **Master users-tab** account (not the offline fixture unless that row exists on Master).

6. Smoke:

```bash
BASE_URL=http://127.0.0.1:4303 ./scripts/verify-one-box.sh --live
```

---

## C. Private cloud / VPS checklist

| Step | Action |
|------|--------|
| 1 | Clone `p-cult/ts-3` on the server |
| 2 | Install Docker **or** Node 18+ |
| 3 | Create `deploy/one-box/.env` from `env.live.example` |
| 4 | `docker compose up -d` (or `run-one-box.sh --live` under systemd) |
| 5 | Put HTTPS in front (Caddy / nginx / cloud LB) → proxy to port 4303 |
| 6 | Open firewall only for 443 (and SSH) |
| 7 | Volume: keep Docker volume `ts3-data` (or host `./data`) for outbox/mirror |

Same-origin means: **do not** set `CORS_ORIGIN` for one-box. That env is only for the Pages→Render split.

---

## D. How this relates to current production

| | **Current prod** | **One-box** |
|--|------------------|-------------|
| UI | GitHub Pages `p-cult/task` | Served by middleware `/` |
| API | Render | Same process `/api/*` |
| Sheets | Bridge → Master | **Same bridge** |
| CORS | `CORS_ORIGIN=https://p-cult.github.io` | Empty |
| Keep-alive | GitHub Action → Render free tier | Not needed if VPS stays up |

Moving to one-box does **not** migrate Sheets. It only relocates UI+API.

---

## E. Files in this package

| Path | Role |
|------|------|
| `deploy/one-box/Dockerfile` | Image: Node serves UI+API |
| `deploy/one-box/docker-compose.yml` | One service + data volume |
| `deploy/one-box/env.memory.example` | Offline env |
| `deploy/one-box/env.live.example` | Live env (fill secrets) |
| `scripts/run-one-box.sh` | Native runner (same shape as Docker) |
| `scripts/verify-one-box.sh` | Automated smoke tests |
| `.github/workflows/one-box-verify.yml` | CI: memory verify + Docker build/test |

---

## F. Safety rules (do not skip)

1. Never commit real `.env` or bridge secrets.  
2. Never run two writers on the same Master.  
3. Production one-box requires a real `SESSION_SECRET`.  
4. Offline fixture passwords are **not** production accounts.

More context for developers and AI tools: [CONTINUE-DEVELOPING.md](CONTINUE-DEVELOPING.md), [AI-HANDOFF.md](AI-HANDOFF.md).
