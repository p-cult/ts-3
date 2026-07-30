# ARCHITECTURE.md — Official architecture for ts-3

**This file is the architecture law for the clean rebuild.**  
It explains how the system is shaped, who owns what, and what must never happen.

**Core set (root):** [README.md](README.md) · **ARCHITECTURE** · [PLAN-CLEAN.md](PLAN-CLEAN.md) · [FOUNDATION.md](FOUNDATION.md) · [SLICE-01.md](SLICE-01.md) · [CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md)

Specs: [docs/reference/](docs/reference/) · Secondary guides: [docs/archive/](docs/archive/) (includes old MASTER/SYSTEM)

If code and this file disagree, **fix the code** (or change this file first with Vinod’s agreement).  
If this file and an old handover disagree, **this file wins** for ts-3 architecture.

---

## 1. One-sentence system

People work in **user sheets** (where tasks are born and live).  
The **master sheet** shows everyone’s tasks together.  
**Middleware** is the only brain in the middle.  
The **browser** only ever talks to middleware.  
**Task ID** is the only real name a task has.

---

## 2. Core model (do not blur)

### 2.1 Task ID — the single unique identity

- Every real task has exactly one **Task ID**.
- That ID is the **master key** everywhere: user sheet, master sheet, mapping, logs, future tools.
- No valid Task ID → **not a task** (quarantine / reject — never pretend it is real work).
- Format (canonical):

  ```text
  [6-char ProjectCode] + [last 4 of EmployeeId] + [SubtaskCode A01…Z99]
  Example: PRJ0015678A01
  ```

- **Only middleware may mint** a Task ID.  
  Not the browser. Not a human typing randomly into master. Not Apps Script “deciding.” Not AI.
- Past `Z99` for that project+person → **refuse**. Never invent a broken ID.
- The ID does not change when status, notes, or assignee display name change.  
  Identity is stable; content moves under it.

### 2.2 User Sheet — the Vehicle

- Each person (or seat) has a **user sheet**.
- **Tasks are born here.** Creation always means: a row comes to life on the creating user’s sheet first.
- The user sheet is where the task **primarily lives** day to day — the working vehicle.
- Edits that belong to that person’s work should be expressible on their sheet; middleware keeps the world consistent.
- User sheets are not a free-for-all second brain: they still obey project vocabulary, roles, and Task ID rules enforced by middleware.

### 2.3 Master Sheet — the Parking Lot / Depot

- One **master sheet** holds the **aggregated view** of all real tasks.
- Think **parking lot / depot**: every vehicle (task) that exists should be visible here under its Task ID.
- Master is the **authoritative consolidated record** when copies disagree:
  - **Conflict rule:** master wins over user.
- Master **does not birth tasks**.  
  It receives, updates, and reflects tasks that already have a Task ID and a home vehicle.
- Master also holds shared vocabulary and system tabs (projects, content, mapping, config, spam, users) — the depot office, not a second place to invent work by hand.

### 2.4 Middleware — the Control Room / Brain

- Middleware is the **only** place business decisions are made:
  - who is allowed to do what (roles)
  - validation
  - Task ID minting
  - create / update / sync policy
  - what the browser is allowed to see
- Middleware **talks to both** user sheets and master (via a thin Google bridge).
- Middleware **does not permanently own the data**.  
  Sheets are the durable memory. Middleware may use short-lived cache/memory to go fast, but after a restart the truth is still in Sheets (and later, whatever durable store Vinod approves — default remains Sheets).
- Middleware must stay **thin but securely extensible**:
  - small modules
  - clear gates
  - new features plug in as routes/modules, not as a second architecture
  - no “smart” silent fallbacks that hide failure

### 2.5 Frontend — the Window

- One public UI (one HTML file in the clean design).
- **Only talks to middleware** over HTTP/API.
- Never holds sheet IDs, bridge secrets, or raw mapping guts.
- Hiding a button is **cosmetic**. Real power is enforced in middleware.

### 2.6 Apps Script — the Hands (not the brain)

- Thin bridge only: **read / write / listen / react** on middleware’s instruction.
- No role logic, no Task ID policy, no “who may edit what.”
- If a rule can live in middleware, it must not be re-implemented in Apps Script.

---

## 3. Layer diagram

```text
                    ┌─────────────────────────┐
                    │   Browser (Frontend)    │
                    │   one UI · many roles   │
                    └───────────┬─────────────┘
                                │
                     HTTPS API only
                     (no Google credentials
                      no sheet IDs)
                                │
                                ▼
                    ┌─────────────────────────┐
                    │      MIDDLEWARE         │
                    │   Control Room / Brain  │
                    │                         │
                    │  • auth & roles         │
                    │  • validate everything  │
                    │  • mint Task ID         │
                    │  • shape API responses  │
                    │  • orchestrate sync     │
                    │  • temporary cache only │
                    └───────────┬─────────────┘
                                │
                     internal bridge only
                     (browser cannot call this)
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Apps Script (Hands)    │
                    │  read / write / listen  │
                    │  / react — no decisions │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
   ┌────────────────────┐              ┌────────────────────┐
   │    USER SHEETS     │              │    MASTER SHEET    │
   │    (Vehicles)      │              │  (Parking Lot /    │
   │                    │              │   Depot)           │
   │  • tasks are BORN  │   Task ID    │  • aggregate view  │
   │  • primary home    │◄────────────►│  • authority on    │
   │  • per person      │   mapping    │    conflict        │
   │                    │              │  • never births    │
   └────────────────────┘              └────────────────────┘
```

**Production deploy homes (final — after go-live)**

| Layer        | Home                         |
|-------------|------------------------------|
| Frontend    | GitHub Pages                 |
| Middleware  | Render.com (API only)        |
| Data        | **Same** live Google Sheets  |

**Development / Staging host (until go-live)**

| Layer              | Home                                      |
|--------------------|-------------------------------------------|
| Frontend + Middleware together | **One server** — Oracle Free Cloud (or local `./run.sh`) |
| Data               | **Same** live Master + User Sheets as ts-2 |

Full dual-track, Staging, and cutover law: **§14** below.

---

## 4. Data flow (happy paths)

### 4.1 Create a task (birth)

```text
Person (P2 or allowed actor)
    → Frontend form
    → Middleware: auth, validate, assign project rules
    → Middleware MINTS Task ID
    → Bridge WRITE: new row on that user's sheet (Vehicle) with Task ID
    → Bridge WRITE: matching row on master (Parking Lot)
    → Bridge WRITE: mapping row (Task ID ↔ user row ↔ master row)
    → Middleware returns safe task view to browser
       (product law: do not leak internals; Task ID visibility follows MASTER)
```

**Birth law:** master is updated because a vehicle exists — master is not the maternity ward.

### 4.2 Edit a task

```text
Person
    → Frontend patch
    → Middleware: role gate (what fields this tier may touch)
    → Middleware: validate
    → Bridge WRITE: authoritative update path
         (keep user vehicle + master depot aligned under same Task ID)
    → On conflict later: master version is what the app believes
```

### 4.3 Read the board

```text
Person (or public)
    → Frontend GET
    → Middleware: session/role → scope filter
         P1 public slice
         P2 own vehicles only
         P3/P4 depot-wide view (with different write powers)
    → Middleware reads via bridge/cache from master-governed state
    → Browser paints rows — never raw sheet payloads
```

### 4.4 Something changes in a sheet (future listen path)

```text
Sheet change
    → Bridge listen/poll (“anything new?”)
    → Middleware decides what it means
    → Middleware may update the other side / mapping / quarantine
    → Next board fetch shows master-governed truth
```

Middleware still decides; the sheet does not “push policy.”

### 4.5 Reject / quarantine

```text
Row without valid Task ID
    → Middleware refuses to treat it as a task
    → Goes to master spam (or equivalent reject path)
    → Never appears as a normal board task
```

---

## 5. Responsibilities by layer

### Frontend

- Show the right room for the current role (cosmetic).
- Send creates/edits/reads only to middleware.
- Display messages, empty states, basic validation for comfort (server still re-checks).
- Hold no long-term source of truth.

### Middleware

- Authentication and sessions.
- Authorization (P1–P4 and field-level rules).
- All validation (including data that originated in a sheet).
- **Task ID mint and uniqueness policy.**
- Orchestrate writes to user sheet + master + mapping.
- Enforce master-over-user on conflict.
- Audit-worthy logging of writes (when that slice exists).
- Expose a stable, application-shaped API.
- Stay restartable without being the database.

### Apps Script bridge

- Read ranges / write ranges / cheap “anything new?” / perform instructed sync steps.
- Stay boring and small.

### User sheet (Vehicle)

- Home of birth and personal working rows.
- Carries Task ID once minted.
- Must not become a back door that bypasses middleware forever (listen/sync is middleware-governed).

### Master sheet (Parking Lot / Depot)

- Aggregated authoritative task list.
- Project catalog, content, mapping, users log, spam, config.
- Edit-in-place for administration is still executed through middleware rules when the product path is used.
- Never the place tasks are *supposed* to be created as new births.

---

## 6. Task ID ownership (precise)

| Question | Answer |
|----------|--------|
| Who creates the ID? | **Middleware only** |
| When? | At successful **birth**, before/as the user-sheet row is committed as a real task |
| Where is it stored? | User task row + master task row + mapping row (same ID) |
| Who may change it? | **Nobody** in normal operation. Correction is a controlled admin tool later, not casual edit |
| Who uses it as join key? | Mapping, sync, dedupe, future imports, reports |
| What if two rows claim different IDs for “the same work”? | They are different tasks until a deliberate merge tool says otherwise |
| What if two rows share one ID? | Invalid state — middleware/sync must treat as error/conflict to repair |
| Does the browser need the raw ID? | Follow **MASTER** product law: identity may be server-side; UI uses safe handles. Architecture still treats Task ID as the system master key even when the browser does not display it |
| Can AI or WhatsApp mint IDs alone? | **No.** They may propose content; middleware mints only after gates pass |

**Ownership summary:**  
Middleware **owns the factory**. Sheets **own the engraving** (durable storage of the ID on rows). Humans **own the work content**, not the ID scheme.

---

## 7. What should never happen

1. **Frontend talks directly to Google Sheets or Apps Script.**  
2. **Browser receives raw spreadsheet IDs, bridge secrets, or mapping internals.**  
3. **Business rules live only in the UI** (hidden buttons without server checks).  
4. **Apps Script decides roles, mints Task IDs, or invents projects.**  
5. **Tasks are born on the master sheet** as the normal path.  
6. **A row without a valid Task ID is treated as a normal task.**  
7. **Users invent project codes** outside admin vocabulary.  
8. **Middleware is the permanent database** (no Sheets/truth backend; data only in process memory in production). Local fixtures for early slices are a temporary scaffold, not the end architecture.  
9. **Silent fallback to dev data or dev passwords** when live Google fails.  
10. **Multiple competing birth paths** that each mint IDs with different rules (the root of duplicate chaos). One mint policy, one birth sequence.  
11. **Master and user diverge forever with no conflict rule** — master wins, then repair the vehicle.  
12. **Drive access outside** the allowed folder boundary (`cult-automation` and linked user sheets).  
13. **“Whole app on Render” or random extra UI homes** that break the Pages = face, Render = brain, Sheets = memory split.  
14. **Extensions that bypass the control room** (webhooks, scripts, or imports writing master without middleware gates).

---

## 8. Thin but extensible middleware

Middleware should feel like a **control room with clear panels**, not a junk drawer.

**Keep thin**

- Few layers: HTTP → authz → domain function → bridge.
- Plain Node modules; no framework tower required.
- Cache is optional speed, not truth.
- Each feature slice adds a module + routes + tests (see FOUNDATION).

**Stay securely extensible**

| Future panel | How it plugs in without new architecture |
|--------------|--------------------------------------------|
| Queue for non-admin creates | Same birth function; delayed mint until approve |
| WhatsApp / kiosk intake | New door into the **same** validate → mint → user sheet → master path |
| Reports | Read from master-governed data; separate module; preferably removable |
| Listen/sync from user sheets | Bridge events in; middleware applies one policy |
| Admin repair tools | Explicit P4 routes; backup/dry-run; still Task ID keyed |

**Extension test:**  
If a new feature needs a second way to mint Task IDs or a second place tasks are born, the design is wrong — extend the control room, don’t build a side alley.

---

## 9. Roles sit in the control room (not in the sheet)

Architecture does not replace the role charter, but placement matters:

- **P1** Public window — look only at what middleware marks public.  
- **P2** Driver of own vehicle — create/edit own work within allow-lists.  
- **P3** Steward — wide view; limited controls (e.g. status), no redefining the order.  
- **P4** Depot boss — full edit, classify, vocabulary, repair tools.  

Sheets may store role or password material as the product decides; **enforcement is always middleware.**

---

## 10. Mapping — the ticket stub between vehicle and bay

The master `mapping` tab (or equivalent) links:

```text
Task ID  →  master row  →  user sheet  →  user row
```

- Mapping is internal plumbing, not a user-facing identity.
- Browser does not manage mapping rows.
- Clearing/deleting a task must retire mapping deliberately (future slice rules).

Without mapping, the parking lot and the vehicle lose each other. Middleware owns that relationship.

---

## 11. Fixtures vs live Sheets

- **Unit / early slices:** memory fixtures may stand in so domain and API can be proven offline.  
- **Integration & Staging against real data:** ts-3 uses the **same live Master Sheet and related User Sheets** as ts-2.  
- Fixtures never become a second production truth. Birth rules are always written as vehicle → depot.  
- Swapping `data/` adapter (memory → sheets) must not rewrite the brain.

---

## 12. Short glossary

| Term | Meaning |
|------|---------|
| Task ID | Only real identity of a task; system master key |
| Vehicle | User sheet — birthplace and primary home |
| Parking lot / depot | Master sheet — aggregate authoritative view |
| Control room | Middleware — decisions, minting, gates |
| Hands | Apps Script — moves data when told |
| Window | Frontend — display and input only |
| Mapping | Internal stub linking vehicle row ↔ depot row under Task ID |
| Spam | Quarantine for non-tasks (no valid Task ID) |
| Staging | ts-3 running for build/test; not the public production URL yet |
| Production | Public user-facing deploy after go-live cutover |
| Go-live | One-command/click flip: ts-3 becomes production; ts-2 retires |

---

## 13. Completeness check (architecture is healthy when…)

- You can point to **one** mint function and **one** birth sequence.  
- Every real task row in master has a Task ID and a vehicle link (or a conscious repair state).  
- Frontend works fully with **only** the middleware base URL.  
- Killing middleware does not destroy history (Sheets still hold it).  
- Adding WhatsApp/reports/queue does not require a second identity system.  
- ts-2 code was never modified by the ts-3 track.  
- Go-live is a **mode/hosting switch**, not a data migration drama.  

---

## 14. Dual-track, Staging, hosting, and go-live (non-negotiable)

### 14.1 Hard laws

1. **ts-3 never modifies ts-2** — no edits to ts-2 code, config, deploy files, or Apps Script owned by ts-2’s running service, unless Vinod explicitly orders a one-off outside this track.  
2. **Same live data** — ts-3’s Sheets target is the **same Master Sheet and related User Sheets** ts-2 already uses. No permanent “shadow master” as production truth.  
3. **All processing in ts-3 middleware** — when a request hits ts-3, every decision, mint, validate, and orchestration runs in **ts-3** only. Browser never talks to Sheets. Apps Script stays thin hands.  
4. **Staging until go-live** — from first build through testing, ts-3 runs in **`APP_MODE=staging`** (or equivalent). It is not the public production face until cutover.  
5. **Dev hosting** — Staging serves **frontend + middleware together on one server** (Oracle Free Cloud; local `./run.sh` for laptop).  
6. **Production hosting (final)** — after go-live: **Frontend = GitHub Pages**, **Middleware = Render.com**, **Data = same Google Sheets**.  
7. **Go-live is one command or one click** — flips Staging → Production and retires ts-2 as the public system.  
8. **Seamless to users** — same Task IDs, same sheets, same (or redirected) public URL story; users should only feel that the system got **better**, not that data was “moved” or accounts reset.

### 14.2 Two processes, one parking lot

```text
                    ┌─────────────────────┐
   Public users ──► │  ts-2 PRODUCTION    │  (until go-live)
   (today)          │  Pages + Render     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  LIVE GOOGLE SHEETS │  ← single truth
                    │  Master + Users     │
                    └──────────▲──────────┘
                               │
                    ┌──────────┴──────────┐
   Testers / Vinod  │  ts-3 STAGING       │  (Oracle: FE+MW together)
                    │  APP_MODE=staging   │
                    └─────────────────────┘

   After go-live:
   Public users ──► ts-3 PRODUCTION (Pages + Render) ──► same Sheets
                    ts-2 stopped / retired
```

### 14.3 How Staging mode works

| Aspect | Staging behaviour |
|--------|-------------------|
| `APP_MODE` | `staging` (required until go-live) |
| Host | Oracle one-box (FE static + MW API same origin) or local |
| Data target | Live Master + User sheets (when Sheets adapter on) |
| Public traffic | **Still ts-2** — Staging URL is private/tester |
| Health | `/api/health` reports `mode.env`, `mode.appMode=staging`, store, bridge |
| Banner / chrome | Optional visible “STAGING” marker so no one confuses it with prod UI |
| Writes | Gated (see §14.4) — never accidental dual-writer chaos |
| ts-2 | Unchanged and remains writer-of-record for the public |

Staging is for **building and proving** ts-3 against real shape of data — not for replacing the public app early.

### 14.4 Data isolation during development (same sheets, safe boundaries)

“Same sheets” does **not** mean two brains freely write at once.

| Layer | Isolation rule |
|-------|----------------|
| **Code** | Separate folders/repos processes: **ts-3 never edits ts-2 files** |
| **Runtime** | Separate hosts/URLs: public → ts-2; testers → ts-3 Staging |
| **Unit tests** | Memory fixtures only — no live sheet side effects |
| **Live reads** | Allowed in Staging once bridge is configured (observe real depot) |
| **Live writes** | Default **off** (`STAGING_WRITES=false` or equivalent). Enable only for deliberate Vinod-supervised tests |
| **Writer-of-record** | Until go-live, **ts-2** remains the system public users depend on for creates/edits |
| **After go-live** | **Only ts-3** writes; ts-2 stopped so Task ID mint never double-fires from two apps |

If Staging writes are enabled temporarily: use a short window, prefer dry-run tools first, and never leave both ts-2 and ts-3 minting Task IDs for public traffic in parallel.

### 14.5 Processing boundary

```text
Any client of ts-3
    → ts-3 Frontend (window)
    → ts-3 Middleware only   ← ALL business processing
    → Bridge (hands)
    → Live Sheets
```

- No “let ts-2 middleware finish this request.”  
- No shared Node process with ts-2.  
- Bridge token/env for ts-3 is configured in **ts-3’s** environment (Staging Oracle / later Render), not by patching ts-2’s Render dashboard as part of normal ts-3 work.

### 14.6 How one-command go-live works (high level)

Goal: **one script or one agreed click-path** (e.g. `./go-live.sh` or a documented single admin action) that:

1. **Preflight** — ts-3 health green; staging smoke passed; Sheets reachable; `APP_MODE` ready to flip; backup/snapshot note of master (Sheet version history is the safety net).  
2. **Freeze public risk** — briefly pause or drain ts-2 writes if needed (stop ts-2 Render service or put ts-2 in maintenance) so two minters never run together.  
3. **Promote ts-3** — set `APP_MODE=production` on the production middleware host (Render); deploy middleware there; bake frontend to **GitHub Pages** with production API base URL.  
4. **Point users** — public URL (Pages) serves ts-3 UI; API calls hit ts-3 Render. Redirects from old ts-2 UI URL if required so bookmarks still work.  
5. **Retire ts-2** — stop ts-2 app processes; leave code archived read-only; do **not** delete Sheets.  
6. **Verify** — login P1–P4, create/edit one task, confirm same Task ID space and board truth.  
7. **Announce** — users see the same workplace, smoother behaviour.

Exact flags and hostnames live in runbooks when implemented; **architecture requires the cutover to stay a mode/hosting switch, not a data export/import.**

### 14.7 Seamless user experience

Users should notice only improvement:

- Same login identities (sheet users).  
- Same tasks and Task IDs (same master key space).  
- Same or continuously redirected public entry URL.  
- No “please re-enter all work.”  
- Downtime measured in minutes at most, ideally a clean flag flip.

### 14.8 What Staging must never do

- Patch ts-2 source to “make cutover easier.”  
- Invent a second Master sheet as the long-term truth.  
- Run production public traffic on Oracle one-box after go-live (prod homes are Pages + Render).  
- Leave ts-2 and ts-3 both minting IDs for everyone after go-live.  
- Silent fixture fallback when `APP_MODE=production` and Sheets fail.

---

*ts-3 official architecture. Dual-track + cutover locked. Keep this file true; put feature detail in slice docs.*
