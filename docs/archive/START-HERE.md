# START HERE — ts-3 clean rebuild

**Archived.** Use root **[README.md](../../README.md)** instead.

Whoever you are (human or AI): read this **before** coding in ts-3.

**ts-2** is the live complex app — do not modify it from this track unless Vinod asks.  
**ts-3** is the clean rebuild: architecture + plan first, then slices.

## Required order (ts-3)

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — Task ID · vehicle · depot · control room · never-rules.  
2. **[PLAN-CLEAN.md](PLAN-CLEAN.md)** — preserve vs drop, **one birth path**, roles/queue, rebuild waves.  
3. **[IMPROVEMENTS-TS3.md](IMPROVEMENTS-TS3.md)** — why ts-3 is better (short).  
4. **[FOUNDATION.md](FOUNDATION.md)** — how the Node spine works + target `domain/` / `store/` layout.  
5. **[SLICE-01.md](SLICE-01.md)** — first build slice (when implementing).  
6. **[MASTER.md](MASTER.md)** — product intent and deploy homes (Pages / Render / Sheets).  
7. **[SYSTEM.md](SYSTEM.md)** + **[AGENTS.md](AGENTS.md)** — how to work with Vinod / hard laws.

Optional depth:

- **[CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md)** — full inventory of live power.  
- **ESSENCE.md** / **SEED.md** — Vinod joinery / north star.  
- `docs/reference/*` — requirements specs.  
- Foundation check: `npm test` or `./run.sh` → http://127.0.0.1:4303/

## Core architecture (never dilute)

```text
Task ID      = single master key (middleware mints only)
User sheet   = vehicle (tasks are born here)
Master sheet = parking lot / depot (aggregate; wins conflicts; never births)
Middleware   = control room (all decisions; not the permanent DB)
Frontend     = window → middleware only
```

## The one engineering rule for creates

**One** `mintTaskId` + **one** `birthTask`. Every door (board, queue, kiosk, WA, import) calls them. A second factory is a bug.

## Status

- Planning + foundation: **yes**  
- Slice 01 product code: **not started** (say “build Slice 01” to begin)  
- No product code until a slice is explicitly built  

## The survival rule

**If it isn’t written to a file, it doesn’t survive.** Chat memory is sand.
