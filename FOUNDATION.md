# FOUNDATION.md — forever-young spine (Clean Architecture + ops)

Technical spine for ts-3. **No login, no tasks, no Google product yet.**  
Plain Node. Zero runtime npm dependencies.

Core docs: [README.md](README.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PLAN-CLEAN.md](PLAN-CLEAN.md) · **FOUNDATION** · [SLICE-01.md](SLICE-01.md)

---

## 0. First principles

### Clean Architecture (lightweight)

```text
 adapters/http  +  data/     ← outer (replaceable details)
         │
         ▼
     use-cases/              ← application actions
         │
         ▼
      domain/                ← pure core (rules & vocabulary)
```

| Rule | Meaning |
|------|---------|
| Dependencies point **inward** | domain never imports HTTP or Sheets |
| Business rules in **domain/** + **use-cases/** only | routes and data stay dumb |
| One action ≈ one use-case file | no monolith growth |
| Clarity over cleverness | no DI framework |

### Forever young

1. Protect the center (Task ID / Role / birth will live in domain).  
2. Edges stay thin and swappable.  
3. Fail loud with **actionable** messages.  
4. Self-heal only when safe (dev foot-guns); production blocks misconfig.  
5. Zero heavy deps — nothing to rot.  

### Dual-track ops (locked — see ARCHITECTURE §14)

| Mode | Host | Data | Public? |
|------|------|------|---------|
| **staging** | Oracle one-box (FE+MW) or `./run.sh` | Same live Sheets when bridge on; writes gated | No — testers only |
| **production** | Pages + Render | Same live Sheets | Yes — after go-live |

- **Never modify ts-2** from this codebase.  
- **`APP_MODE=staging`** until one-command go-live flips to production and retires ts-2.  
- Health should report `appMode` (when wired): staging vs production.  
- Production must not silently use memory fixtures as “live.”  

---

## 1. Folder structure

```text
middleware/
├── server.js                 # listen + dispatch + startup banner
├── app.js                    # composition root + bootstrap
├── context.js config.js log.js errors.js http.js router.js static.js
├── domain/                   # INNER: profiles, awareness (pure)
├── use-cases/                # APPLICATION: get-health, …
├── adapters/http/            # OUTER: thin routes
├── data/                     # OUTER: memory + retry + bridge status
├── runtime/                  # OUTER: bootstrap self-heal + process state
│   ├── bootstrap.js
│   └── state.js
├── auth/ store/              # placeholders for Slice 01+
└── foundation.test.js
```

---

## 2. One-command install and run

```bash
cd ts-3
./run.sh
```

What `./run.sh` does:

1. Checks **Node ≥ 18** (clear error if missing/old)  
2. Runs **`npm install`** (no packages — stays instant; keeps the habit for later)  
3. Sets safe env defaults (`PORT=4303`, `STORE_ADAPTER=memory`, `USE_LIVE_BRIDGE=false`, prefer `APP_MODE=staging`)  
4. Starts **`node middleware/server.js`**  
5. Server runs **bootstrap self-heal**, then listens and prints URL + health link  

**Hosting note:** Staging may run this same entry on **Oracle** (FE+MW one process). Production go-live moves UI to Pages and API to Render — see ARCHITECTURE §14 / PLAN-CLEAN §10.  

Equivalents:

```bash
npm start          # same server entry
npm test           # foundation tests
npm run health     # curl /api/health (server must be up)
```

**No** second install path, **no** framework CLI.

---

## 3. Self-awareness (`GET /api/health`)

Use-case `get-health` builds a full report (HTTP adapter only sets 200 vs 503).

| Field | Meaning |
|-------|---------|
| `ok` | overall boolean |
| `status` | `healthy` \| `degraded` \| `unhealthy` (domain/awareness) |
| `version` / `app` | identity |
| `mode` | env, storeAdapter, liveBridge, isDev/isProd |
| `config` | bootstrapOk + issues `[{severity,code,message,hint}]` |
| `dependencies.data` | memory/sheets ping |
| `dependencies.bridge` | disabled / misconfigured / unavailable |
| `selfHealing.actions` | heals applied this process |
| `uptimeSeconds` | since bootstrap |

Example (healthy foundation):

```json
{
  "ok": true,
  "status": "healthy",
  "version": "0.1.0",
  "mode": { "env": "development", "storeAdapter": "memory", "liveBridge": false },
  "config": { "ok": true, "bootstrapOk": true, "issues": [] },
  "dependencies": {
    "data": { "ok": true, "kind": "memory" },
    "bridge": { "ok": true, "state": "disabled" }
  },
  "selfHealing": { "enabled": true, "actions": [] }
}
```

Unhealthy → HTTP **503** + `ok: false` (so probes can alert).

Domain pure helper: `domain/awareness.evaluateOverall(facts)`.

---

## 4. Self-healing (bootstrap)

Runs once at process start in `runtime/bootstrap.js` (outer layer).

| Situation | Development | Production |
|-----------|-------------|------------|
| Missing `data/` dir | **create it** | **create it** |
| `STORE_ADAPTER` not implemented | fall back to **memory** + warn | **block start** |
| `USE_LIVE_BRIDGE=true` without URL/secret | **disable bridge** + warn | **block start** |
| Missing `frontend/index.html` | warn (API still runs) | warn |
| Node &lt; 18 | block | block |
| Port in use | clear message: try `PORT=4304 ./run.sh` | same |
| Empty `SESSION_SECRET` in prod | warn (prep for login) | warn |

Heals are recorded on `runtime` state and shown under `/api/health` → `selfHealing.actions`.

**Principle:** heal **foot-guns** in dev; never silently pretend live Sheets work when misconfigured in production.

---

## 5. Request path

```text
HTTP → server (ctx) → adapters/http → use-cases.execute
                         → domain (pure)
                         → data (ports)
```

---

## 6. How to add a feature

1. **domain/** — pure rules if needed  
2. **use-cases/foo.js** — `execute(...)`  
3. **adapters/http/foo.js** — thin route  
4. **adapters/http/index.js** — `register`  
5. **data/** — only if new persistence  
6. Tests — pure + use-case + optional HTTP  

Never put business `if (role)` in routes or data.

---

## 7. Config & errors

- `config.js` — env + `.env`  
- `errors.js` — AppError; `external` is retryable  
- `data/retry.js` — transport blips only  

**Ops flags (to wire when implementing cutover support):**

| Env | Default | Role |
|-----|---------|------|
| `APP_MODE` | `staging` | `staging` until go-live; then `production` |
| `STAGING_WRITES` | `false` | Live sheet writes off unless supervised test |
| `STORE_ADAPTER` | `memory` | later `sheets` against **same** live master |
| `USE_LIVE_BRIDGE` | `false` | bridge to live Sheets |
| `BRIDGE_URL` / `BRIDGE_SECRET` | empty | ts-3 env only — do not patch ts-2 to set these |

Production (`APP_MODE=production`) must **not** silently serve memory fixtures as truth.

---

## 8. Why this does not become obsolete

| Risk | Defense |
|------|---------|
| Core tied to Sheets/HTTP | dependency rule |
| Monolith server | adapters + use-cases |
| Mystery failures | self-aware health + hints |
| Dev misconfig death spiral | self-heal with audit trail |
| “Works on my machine” install | `./run.sh` one path |
| Dependency rot | zero runtime deps |
| Dual-app mint chaos | Staging writes gated; go-live stops ts-2 first |
| Accidental ts-2 edits | Separate tree; hard law in ARCHITECTURE §14 |

---

## 9. Status

| Capability | State |
|------------|--------|
| Clean Architecture layout | yes |
| One-command `./run.sh` | yes |
| Self-aware `/api/health` | yes |
| Bootstrap self-healing | yes |
| Product features | **not started** |
| npm runtime deps | **zero** |

```bash
./run.sh
npm test
```
