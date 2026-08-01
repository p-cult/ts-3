# PLAN-CLEAN.md — Rebuild plan for ts-3 (refined)

**Purpose:** Rebuild Param’s task system as a **clearly better** ts-3: cleaner, more efficient, more robust, more agile, more versatile — **without breaking the core architecture**.

**Status:** Foundation + Slice 01–12 built (`npm test` green). Production-ready **Staging track**; cutover via `./go-live.sh`.  
**ts-2:** Live production — **never modify from the ts-3 track** (non-negotiable).  
**ts-3:** Staging rebuild until one-command go-live; then production on Pages + Render.  
**Data:** **Same live Master + User Sheets** as ts-2. All processing in **ts-3 middleware** when traffic hits ts-3.

Cutover / Staging law detail: [ARCHITECTURE.md](ARCHITECTURE.md) **§14**.

| Law doc | Role |
|---------|------|
| [README.md](README.md) | Entry — five files to read |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Shape: Task ID · vehicle · depot · control room |
| **PLAN-CLEAN** (this file) | Rebuild order · preserve/drop · birth · waves |
| [FOUNDATION.md](FOUNDATION.md) | Node spine + module layout |
| [SLICE-01.md](SLICE-01.md) | First buildable product slice |
| [CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md) | Live power inventory |
| [docs/reference/](docs/reference/) | Requirements specs |
| [docs/archive/](docs/archive/) | Secondary (old MASTER/SYSTEM/IMPROVEMENTS, etc.) |

**This file wins on:** rebuild order, what to preserve/drop, birth/queue/roles structure.  
**ARCHITECTURE wins on:** metaphors and never-rules.  
**Specs win on:** field-level product detail when they don’t fight ARCHITECTURE.

---

## 0. North star (one screen)

```text
Task ID     = only master key (middleware mints, sheets store)
User sheet  = vehicle (tasks are BORN here and primarily live here)
Master sheet= parking lot / depot (aggregate view; wins conflicts; never births)
Middleware  = control room (all decisions; temporary cache only; not the DB)
Frontend    = window (talks ONLY to middleware)
Bridge      = hands (read / write / listen / react — no decisions)
```

**ts-3 quality bar (better than ts-2 means):**

| Word | Practical meaning |
|------|-------------------|
| **Cleaner** | One birth sequence, one mint, small modules, no god-files |
| **More efficient** | Correct thin path first; cache optional; no duplicate factories |
| **More robust** | Fail loud; create-time identity guard; no silent fixture fallback in live |
| **More agile** | Slice-sized changes; plugin seams; env flags rare |
| **More versatile** | New *doors* (kiosk, WA, import) plug into the **same** control-room functions |

---

## 1. Intent (unchanged product why)

Make organisational work **effortless and continuous** for a small creative team (Param).

- Work is not trapped in one person’s head.
- Messy human input becomes a clean task under one Task ID.
- One public URL; four trust levels; frugal stack.
- Intelligence may help parse mess later — it never mints IDs or bypasses gates alone.

---

## 2. What must be preserved (the real power from ts-2)

These are **outcomes and laws**, not file copies. Full inventory: [CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md).

### P0 — Not optional

1. **Task ID** format + middleware-only mint + refuse past Z99 / invalid.  
2. **Task ID hidden** from browser JSON (opaque client `ref` only — HMAC handle, not a second identity).  
3. **Birth on user sheet**, then master + mapping (vehicle → depot).  
4. **Master beats user** on conflict; board shows master-governed state.  
5. **P1–P4** server enforcement (not UI-only).  
6. **PATCH field allow-lists** (P2 own content; P3 status; P4 full; classifier rules).  
7. **Classifier invisible below P4**; clear-classifier (“Make Task”) for P3+ when that feature lands.  
8. **Projects = admin vocabulary only.**  
9. **Browser → middleware only**; thin Apps Script bridge.  
10. **Auth** usable cross-origin (Pages UI + Render API): session + Bearer pattern.  
11. **CSRF on cookie writes, rate limits, server validation.**  
12. **Production deploy split (final):** GitHub Pages · Render API only · **same** Google Sheets.  
13. **Passwords plain text** in users store unless Vinod changes policy.  
14. **Drive boundary:** `cult-automation` + linked user sheets only.  
15. **ts-2 untouched** by ts-3 work.  
16. **Staging until go-live**; public users stay on ts-2 until cutover.  
17. **Go-live** = one command/click; seamless Task ID continuity; retire ts-2 as public app.

### P1 — Same workplace power (after spine)

15. **One triage queue** for untrusted creates (when queue mode on).  
16. **Logged vs pure tasks** (classifier / Logged tab / completed counting rule).  
17. **Priority from deadline clock** (+ optional P4 override — simpler storage than a random disk file if possible).  
18. **Content tab** labels (icons strategy: bake or serve — decide at content slice).  
19. **Featherweight poll/listen.**  
20. **Reports as removable plugin** (P3+ read).  
21. **Audit log** of writes.  
22. **Create-time duplicate identity guard** before multi-door intake or user-sheet listen.  
23. **Intake that can UPDATE matched tasks** (not only mint twins) when WhatsApp/kiosk return.

### P2 — Operational power (repair kit, not daily spine)

24. Controlled user-sheet recovery/sync **v2**.  
25. Merge / dedup / reset with dry-run + confirm + backup.  
26. Bulk import **only** through the same birth function.  
27. Kiosk + WhatsApp as **doors**, not separate products.

---

## 3. What must be redesigned or dropped (debt)

Do **not** port these as architecture. Borrow lessons; rewrite.

| Debt in ts-2 | ts-3 rule |
|--------------|-----------|
| Many birth alleys (dashboard, queue mint, journal HMAC, inbox drain, bulk import, user-sheet sync, pull) | **One** `birthTask()` + **one** `mintTaskId()` only |
| `datasource.js` god-module | Split: **store adapter** · cache · poll · domain services |
| `server.js` monolith | Keep foundation router; domain routes stay thin |
| User-sheet sync kill-switch lifestyle | No auto-sync until identity guard proven; then sync v2 |
| Parallel parsers (journal / gemini / intake) | One **intake** module → drafts → queue or birth |
| Bulk import as special mint path | Preview planner → same birthTask |
| Silent / broad dev-fixture fallback on live failure | **Fail loud** in production |
| Dedup/purge as everyday product | **Repair plugin** only after spine solid |
| Merge planner without API | Finish later as one tool on same IDs — or box |
| OTP only in process RAM | Later: durable or signed reset; don’t fake security |
| Assignee = sheet key **or** display name ambiguity | **One canonical assignee key** in API (`userSheet` / username) |
| Admin page = reports + nuclear tools | **Reports UI** ≠ **danger tools UI** |
| Hard-coded spreadsheet IDs in script source | Config / Script Properties only |
| Netlify / whole-app-on-Render ideas | Drop |
| Copy-paste ts-2 middleware/frontend | **Forbidden** as default; pure helpers may be re-implemented from specs + tests |
| Priority overrides only as loose JSON side file | Prefer data next to task or one clear store module |
| Frameworks / dependency sprawl | Still no, unless Vinod agrees |

**Root lesson:** ts-2’s worst pain was **more than one way to mint a Task ID**. ts-3 treats a second mint path as a **bug**.

---

## 4. The one clean create path (birth sequence)

Every successful new task in the system, forever, walks this hallway:

```text
                    any DOOR
         (board · queue approve · kiosk · WA · import · sync v2)
                         │
                         ▼
              ┌─────────────────────┐
              │  normalize + validate│  project known, name present,
              │  role / queue gate   │  actor allowed, etc.
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  identity guard     │  same project+name+assignee
              │  (duplicate check)  │  already exists? → refuse or
              └──────────┬──────────┘     route to update/merge — never silent twin mint
                         ▼
              ┌─────────────────────┐
              │  mintTaskId()       │  ONLY place IDs are born
              │  (lock / used set)  │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  birthTask()        │  ONLY place rows are created
              │                     │
              │  1. WRITE user sheet│  ← vehicle first
              │  2. WRITE master    │  ← parking lot
              │  3. WRITE mapping   │  ← ticket stub
              │  4. audit log       │
              └──────────┬──────────┘
                         ▼
                   safe API shape
              (opaque `ref`, no raw Task ID)
```

### Door vs factory

| Concept | Meaning |
|---------|---------|
| **Door** | How a human or channel *requests* work (UI form, queue decide, inbox line, import row) |
| **Factory** | `mintTaskId` + `birthTask` — single implementation |

Adding WhatsApp later = new door. **Not** a new factory.

### Queue (better structure)

```text
Untrusted create request (P2 when queue mode on, kiosk, WA, …)
    → enqueue(draft)     // no Task ID yet
    → P4 decide:
         approve → same validate → identity guard → mint → birthTask
         reject  → mark rejected
         file    → optional notes path (no fake task)
P4 direct create
    → skip queue → same validate → identity guard → mint → birthTask
```

- **One queue store** (sheet tab or equivalent).  
- **Queue never mints** on enqueue.  
- Approve is not a second create implementation — it **calls birthTask**.

### Fixture mode (Slice 01–02)

Same functions; store adapter is memory/JSON:

1. validate  
2. identity guard  
3. mintTaskId (still real atom, server-internal)  
4. birthTask → writes **vehicle partition + depot partition + mapping** inside the fixture store (mirrors Sheets shape even before Google)

So Google is a **store swap**, not a brain rewrite.

---

## 5. Roles, permissions, extensibility (better structure)

### 5.1 Roles module (pure)

One module, no I/O — same spirit as ts-2 `roles.js`, cleaner exports:

| Export | Job |
|--------|-----|
| `PROFILE` / `nameOf` | P1–P4 only |
| `permissionsFor(profile)` | Flags for API + UI (`canCreate`, `editScope`, `canClassify`, `canViewReports`, `canAdmin`, `createsDirect`, …) |
| `authorizeTaskPatch({ profile, body, ownsTask, userAllowedStatuses })` | Field allow-list + classifier rules |
| `mustQueueCreates(profile, queueModeOn)` | Queue gate |

**UI never invents rules** — it only dresses `permissions`.

### 5.2 Canonical actor identity

Every user record carries:

- `username` — login  
- `userSheet` — vehicle key (stable)  
- `employeeId` — for Task ID suffix  
- `displayName` — cosmetic  

**Assignee on tasks = `userSheet` (or username if no sheet yet)** — one field for scope checks. Display name is label only.  
(This removes ts-2’s “match sheet key *or* display name” fragility.)

### 5.3 Middleware layout (thin control room)

Target shape (grows slice by slice; not all folders need files on day one):

```text
middleware/
  server.js          # listen + request context only
  config.js log.js errors.js http.js router.js static.js
  routes.js          # mounts route modules
  routes/            # optional: auth.routes.js, tasks.routes.js, …
  auth/              # session, login, csrf helpers
  domain/            # pure rules (no HTTP)
    roles.js taskid.js identity.js ref.js tasks.js
    kinds.js stages.js review.js
    priority.js classifier.js  # later
  use-cases/         # application actions (create-task = only birth path)
  data/              # adapters — THE swappable memory
    memory.js        # fixtures (early slices)
    side-store.js    # stages/reviews (not Sheets birth)
    # sheets.js later — bridge-backed (Google slice)
    index.js         # picks adapter from config
  bridge/            # HTTP client to Apps Script only
  poll/              # listen loop (later)
  intake/            # messy text → drafts (later) — calls queue/birth, never mints alone
  plugin/            # removable
    admin/           # reports + P4 tools (later)
  data/              # local jsonl audit, etc. (or repo data/)
```

**Rules**

- HTTP handlers: parse → call domain → send JSON. No sheet math in handlers.  
- Domain calls **store** interface, not Apps Script directly (bridge sits behind `store/sheets`).  
- Plugins register routes through one mount; core must run if `plugin/admin` is deleted.  
- **No second `mintTaskId` inside plugin or intake.**

### 5.4 Extensibility test (pass/fail)

A new feature is allowed only if:

1. It does not add a second mint or birth implementation, **and**  
2. It does not let the browser reach Google, **and**  
3. It enforces authz in middleware, **and**  
4. It has a slice doc + automated check.

---

## 6. What stays simple (non-negotiable engineering)

- Plain HTML/CSS/JS — **one** product `frontend/index.html`.  
- Plain Node — **zero** required dependencies until Vinod agrees.  
- Thin bridge; formulas in Sheets where they beat script.  
- Date display: `DD MMM | HH:MM`.  
- Fail loud in live mode.  
- Tests as plain Node HTTP/unit scripts.  
- Short true docs; box archaeology under `_box/`.

---

## 7. Rebuild waves (sharper order)

Each wave ends **verified** before the next. Detail slices get their own `SLICE-XX.md`.

| Wave | Name | Delivers | Explicitly out |
|------|------|----------|----------------|
| **0** | Foundation | HTTP, config, log, errors, router, static, health | Business ✅ done |
| **1** | Slice 01 — Control room spine | Auth P1–P4, memory store shaped as vehicle/depot/mapping, **mint+birth+patch+list**, identity guard v0, board shell | Google, queue, WA, reports, classifier UI |
| **2** | Board product | Tabs/filters polish, content labels stub, permissions-driven UI | Admin nuclear tools |
| **3** | Google spine | Bridge + sheets store adapter; real vehicle→depot birth; master-over-user; projects/content from sheet; poll | Auto user-sheet sync, multi-intake |
| **4** | Trust & flavour | Queue (approve→birthTask), classifier/Logged/Make Task, priority clock, audit | Bulk import, reset |
| **5** | Plugin | Reports P3+ removable; danger tools separate panel | Using purge as create |
| **6** | Doors | Kiosk + inbox/WA + one intake parser → queue/birth/match-update | Second mint path |
| **7** | Vehicle listen v2 | User-sheet sync with identity guard + dry-run | Kill-switch archaeology as design |
| **8** | Repair kit | Pull, merge, dedup, reset — confirm phrases + backup | Daily dependency on repair |
| **9** | Staging on Oracle | FE+MW one server; live Sheets read; writes gated; smoke vs real data | Public cutover |
| **10** | Go-live | One-command promote to Pages+Render; `APP_MODE=production`; stop ts-2 | Data migration / second master |

**Wave 1 note:** Even on fixtures, implement **birthTask** as the only create entry so Wave 3 is an adapter swap.

**Wave 3+ note:** Sheets adapter targets the **live** master/users (same as ts-2), not a disposable copy as long-term truth.

---

## 8. Definition of done (any slice)

- Automated checks green + named human smoke if UI touched.  
- Authz proven by API abuse cases, not only happy clicks.  
- Still **one** mint and **one** birth.  
- No production fixture-user fallback.  
- ts-2 untouched.  
- This plan / slice doc updated: built vs verified vs next.

---

## 9. Decisions locked for rebuild (defaults)

Vinod can override in writing; until then:

| Topic | Default |
|-------|---------|
| Touch ts-2 code/config | **Never** (ts-3 track) |
| Sheets target | **Same live Master + User sheets** as ts-2 |
| Where business logic runs (ts-3 traffic) | **ts-3 middleware only** |
| App mode until cutover | **`staging`** |
| Staging host | **Oracle Free Cloud** — frontend + middleware **one server** |
| Production host (final) | **Pages (UI) + Render (API) + same Sheets** |
| Go-live | **One command/click**; retire ts-2 public role; seamless Task IDs |
| Staging live writes | **Off by default**; enable only for supervised tests |
| Writer-of-record before go-live | **ts-2** for public users |
| Writer-of-record after go-live | **ts-3 only** |
| Queue in Slice 01 | **Off** — direct birth after validate (queue Wave 4) |
| Task ID in browser | **Hidden** — opaque client `ref` only |
| Early unit data | **Memory/fixtures** shaped like vehicle+depot |
| WhatsApp/kiosk | **Wave 6**, not Wave 1 |
| Copy ts-2 code | **No** by default |
| Canonical assignee | **`userSheet` / username**, not display name |

---

## 10. Staging, isolation, and go-live (plan summary)

Full law: [ARCHITECTURE.md §14](ARCHITECTURE.md).

### 10.1 Staging mode

- ts-3 runs with **`APP_MODE=staging`** for the entire build/test period.  
- Hosted on **Oracle** (FE + MW together) or laptop `./run.sh`.  
- Public users keep using **ts-2** (Pages + Render).  
- Testers use the Staging URL only.  
- Health reports staging mode; optional UI “STAGING” marker.  
- Against live Sheets: **read** when bridge is on; **write** only if explicitly enabled for a test window.

### 10.2 Data isolation (same sheets, not same chaos)

| Isolate | How |
|---------|-----|
| Code | Separate tree; zero commits into ts-2 from this track |
| Public traffic | Still ts-2 URLs until go-live |
| Automated tests | Memory fixtures — no sheet mutations |
| Live writes | Default off; one writer-of-record for the public (ts-2) until cutover |
| Task ID mint | Never leave ts-2 and ts-3 both minting for everyone at once |

### 10.3 One-command go-live (high level)

Implement later as `./go-live.sh` (or one documented click path) that:

1. Preflight health + smoke on Staging  
2. Stop/pause **ts-2** public writers  
3. Deploy ts-3 MW to **Render** + bake UI to **GitHub Pages** with `APP_MODE=production`  
4. Point public URL at ts-3  
5. Verify P1–P4 + one create/edit on **same** sheets  
6. Retire ts-2 processes (archive code; keep Sheets)  

Users should only notice the system got better — **no data reload story**.

### 10.4 Success criteria for cutover

- [ ] ts-2 source untouched by ts-3 work  
- [ ] Same Task IDs visible continuity  
- [ ] Public board works on Pages → Render → Sheets  
- [ ] ts-2 not serving public traffic  
- [ ] Staging Oracle no longer required for production  

---

## 11. Open questions (still Vinod)

1. When queue lands: default **on** for P2 (ts-2-like) or **off** until team wants theatre?  
2. Slots feature: keep later or drop?  
3. Forgot-password OTP: needed in rebuild season or admin-resets-only?  
4. Exact public URL after go-live: keep `p-cult.github.io/task` vs new path + redirect?  
5. Oracle hostname / who runs `./go-live.sh` (Vinod only vs trusted operator)?  

*(Sheets target and dual-track rules are **closed** — see §9.)*

---

## 12. Immediate next step

**Slice 01 + 02 are done** (memory control room + kinds/stages/review/logs). Next:

1. Commit current tree if not already  
2. **Wave 3** Google spine (bridge + sheets adapter; same live master), **or** remaining board polish  
3. Keep **one** mint + **one** birth; client key remains `ref`  

Still: memory first until bridge lands. No ts-2 edits. Live Sheets later under Staging gates.

---

## 13. Doc map (ts-3) — lean

```text
README.md                 ← start here
ARCHITECTURE.md           ← shape law
PLAN-CLEAN.md             ← this file (includes quality bar / why better)
FOUNDATION.md             ← technical spine
SLICE-01.md               ← first build
CAPABILITIES-FROM-TS2.md  ← inventory
docs/reference/*          ← requirements specs
docs/archive/*            ← everything else (not daily reading)
```

---

*Refined after capabilities analysis. Staging + same-sheet cutover locked. Preserve power; redesign plumbing; one birth hallway forever; one-command go-live.*
