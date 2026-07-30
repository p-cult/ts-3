# ts-3 — Param task system (clean rebuild)

Parallel rebuild of the live app in **ts-2**.  
**Never modifies ts-2.** Same live Sheets. **Staging** until one-command go-live → Pages + Render.

This folder stays **lean**. Cutover law: [ARCHITECTURE.md](ARCHITECTURE.md) §14 · [PLAN-CLEAN.md](PLAN-CLEAN.md) §9–10.

## Read these five (in order)

| # | File | What it is |
|---|------|------------|
| 1 | **[ARCHITECTURE.md](ARCHITECTURE.md)** | Core model + laws (Task ID, vehicle, depot, control room) |
| 2 | **[PLAN-CLEAN.md](PLAN-CLEAN.md)** | Rebuild plan: preserve / drop / one birth path / waves |
| 3 | **[FOUNDATION.md](FOUNDATION.md)** | Technical spine (server, config, log, errors, layout) |
| 4 | **[SLICE-01.md](SLICE-01.md)** | First build slice (not coded yet) |
| 5 | **[CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md)** | What live ts-2 actually does |

That’s the whole working brain. Everything else is reference or archive.

## Architecture in one breath

```text
Task ID      = only master key (middleware mints)
User sheet   = vehicle (tasks are born here)
Master sheet = parking lot / depot (never births; wins conflicts)
Middleware   = control room (decisions; not the permanent DB)
Frontend     = talks ONLY to middleware
```

**One create path:** validate → identity guard → `mintTaskId` → `birthTask` (vehicle → depot → mapping).

## One-command run

```bash
./run.sh          # checks Node, npm install (zero deps), bootstrap, listen
                  # http://127.0.0.1:4303/  ·  /api/health
npm test          # foundation tests
```

Health is **self-aware** (mode, config, dependencies, self-heals). See [FOUNDATION.md](FOUNDATION.md).

## Portable drive ↔ GitHub sync

```bash
./sync.sh         # smart sync (safe — never force-push)
```

| Situation | What happens |
|-----------|----------------|
| **Offline** | Tells you to work normally on the drive |
| **Online** | Fetches/pulls latest from GitHub, then offers to push your local commits |
| **Status** | Always prints: online/offline · ahead/behind/in sync · next action |

Details: [docs/SYNC.md](docs/SYNC.md).  
One-time: this folder must be a Git repo with `origin` pointing at GitHub.

## Folders

```text
frontend/          one HTML UI (placeholder today)
middleware/        Node control room
apps-script/       empty until Google wave
docs/reference/    requirements specs (from ts-2)
docs/archive/      secondary guides (not day-to-day reading)
data/              local runtime
```

## Hosting (locked)

| Phase | Frontend + API | Data |
|-------|----------------|------|
| **Staging** | Together on Oracle (or `./run.sh`) | Same live Master + User sheets |
| **Production** | Pages + Render | Same sheets |
| **Go-live** | One command/click; retire ts-2 public role | No data migration |

## Status

- Planning + foundation: **yes**
- Staging / cutover strategy: **documented**
- Slice 01 product code: **not started**
- Say **build Slice 01** to implement
