# CAPABILITIES-FROM-TS2.md — What the live system actually does

**Purpose:** Inventory every **real** capability in `ts-2` so `ts-3` can rebuild the same *power* — cleaner, thinner, more robust — without copying debt.

**Core set:** [README.md](README.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [PLAN-CLEAN.md](PLAN-CLEAN.md) · [FOUNDATION.md](FOUNDATION.md) · [SLICE-01.md](SLICE-01.md) · **CAPABILITIES**

**Method:** Read-only survey of `ts-2` middleware, frontend, apps-script, and living docs. **No ts-2 code was changed.**

**Honesty ladder:**  
- **Verified by code** = module/route exists and is wired.  
- **Doc/live claim** = STATE/PLAN say live; not re-probed from this session’s browser.  
- **Partial / broken** = code exists but kill-switch, missing UI, or known failure mode.

Survey date context: codebase as of late Jul 2026 notes in STATE/PLAN.

---

## 0. System shape (as built)

```text
GitHub Pages (baked frontend via build-pages.cjs)
        │  CORS + Bearer token / cookies
        ▼
Render Node middleware (~server.js 1300+ lines + many modules)
        │  bridge token
        ▼
Apps Script bridge (read / write / listen / react / readMany / dropdown / inbox)
        ▼
Google Sheets (master + N user sheets)
```

| Surface | What exists |
|---------|-------------|
| Main board UI | `frontend/index.html` (~1500 lines), also served from middleware for local/admin paths |
| Admin / reports UI | `middleware/admin.html` + plugin under `middleware/admin/` |
| Kiosk form | `middleware/tasks-form.html` at `/tasks` |
| Shared topbar | `middleware/shared/topbar.js` |
| Tests | Many `*.test.js` + `integration.live.test.js` (dev fixtures) |
| Deploy | Pages bake, `render.yaml`, local `./run.sh` :4300 |

**Scale of middleware JS (approx):** server 1339 · datasource 577 · user-sheet-sync 478 · journal-import 425 · sync 373 · admin plugin cluster large · roles 195 · taskid 198 · queue 255 · etc. Product power is real; surface area is large.

---

## 1. Capability catalog

Legend for columns:

| Column | Meaning |
|--------|---------|
| **Works?** | How healthy it looks from code + STATE/PLAN |
| **Complexity** | Low / Medium / High / Very high |
| **ts-3?** | **Must** keep · **Should** keep · **Later** · **Redesign** · **Drop / repair-only** |

---

### A. Core task lifecycle

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| A1 | **Task ID mint** (`project + emp4 + A01…Z99`) | `taskid.js`, used by `datasource.createTask` / imports | Solid unit logic | Medium | **Must** | Single factory must remain *one* function in ts-3 |
| A2 | **Task ID hidden from browser** (opaque `ref`) | `tasks.stripId` / `refFor` | Wired | Medium | **Must** | Aligns with MASTER + ARCHITECTURE |
| A3 | **Create task** (API POST `/api/tasks`) | `server.js` → `datasource.createTask` → `sync.executeCreateTask` | Works when bridge live; P4 direct | High | **Must** | Birth should hit **user sheet first**, then master + mapping |
| A4 | **Non-P4 create → triage queue** | `roles.mustQueueCreates`, `QUEUE_MODE` env, `queue.js` | Works (queue mode default on) | High | **Should** (simpler design) | Valuable gate; ts-2 path multiplies with intake |
| A5 | **Update task** PATCH `/api/tasks/:ref` | `server.js` + `roles.authorizeTaskPatch` + `sync.executeUpdateTask` | Works; save path optimised | High | **Must** | Role field gates are gold — keep pure module |
| A6 | **List tasks** GET `/api/tasks` scoped | `tasks.scopeForSession` | Works | Medium | **Must** | P1 public fields · P2 own · P3/P4 all |
| A7 | **Projects list** GET `/api/projects` | admin tab / fixtures | Works | Low | **Must** | Admin vocabulary only |
| A8 | **Unknown project rejected** | create path | Works | Low | **Must** | |
| A9 | **Classifier** silly / routine / other (+ clear) | roles + sheet col + UI P4 | Works | Medium | **Should** | Clear = “Make Task” for P3+ |
| A10 | **Logged tab** (`classifier=routine`) | frontend + pull tool | Live per STATE | Medium | **Should** | Separates diary noise from real board |
| A11 | **Make Task** (clear classifier) | frontend button + PATCH gate | Live per STATE | Low–Med | **Should** | Keep server gate |
| A12 | **Completed vs approved vs logged** counts | `tasks.countsAsCompleted`, board filters | Works in code | Medium | **Should** | One counting rule — keep pure |
| A13 | **Priority clock** (deadline math) + P4 override file | `priority.js`, `data/priority-overrides.json` | Works | Medium | **Should** (simpler store) | Single truth good; file override is a bit clunky |
| A14 | **Status vocabulary from content tab** | session + PATCH | Works with fallbacks | Medium | **Should** | Sheet-driven labels |
| A15 | **Journal field on task** (status history string) | `journal.js`, folded into save | Works | Medium | **Later / thin** | Nice; not day-one spine |
| A16 | **Spam / invalid Task ID rows** | tasks build + spam tab intent | Partial (flag vs move) | Medium | **Should** | Spec wants spam tab; confirm behaviour |
| A17 | **Soft delete / clear rows** | reset + dedup clear paths | Admin tools | High | **Later** | Dangerous; needs dry-run ritual |
| A18 | **Merge tasks planner** | `admin/merge.js` pure | **Core done, endpoint/UI missing** | Medium | **Later** | Preserve pure planner; finish cleanly |
| A19 | **Duplicate identity check** | `duplicate-check.js` | Used by pull/dedup | Medium | **Must** (before multi-intake) | Create-time guard still open in PLAN |
| A20 | **Task match for chat updates** | `task-match.js` | Code + tests; live verify optional | Medium | **Should** when WA returns | Prevents twin creates |

---

### B. Roles & permissions

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| B1 | **Four profiles P1–P4** | `roles.js` | Strong, tested | Low–Med | **Must** | Single authority module |
| B2 | **permissions object on API** | `permissionsFor` | Works | Low | **Must** | UI must not invent rules |
| B3 | **PATCH field allow-lists** | `authorizeTaskPatch` | Strong | Medium | **Must** | P3 status; classifier rules subtle |
| B4 | **P2 own-task only** | scope + ownsTask | Works | Medium | **Must** | Assignee match sheet key *or* display name — fragile identity |
| B5 | **P3 status-only (+ clear classifier)** | roles | Works | Low | **Must** | |
| B6 | **P4 classify / priority / admin** | roles + admin access | Works | Low | **Must** | |
| B7 | **Classifier invisible below P4** | stripClassifier | Works | Low | **Must** | |
| B8 | **Reports cap P3+, admin writes P4** | `admin/access.js` | Works | Low | **Must** if reports kept | Plugin pipe is good pattern |
| B9 | **Passwords plain text in sheet** (scrypt optional if plain empty) | server login | By design | Low | **Must** (unless Vinod changes) | Document clearly |
| B10 | **Invite-only accounts** | product law | Sheet-provisioned users | Medium | **Should** | No public signup in practice |

---

### C. Data flow & sheets interaction

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| C1 | **Bridge client** tokenised HTTP | `bridge.js` | Works when env set | Medium | **Must** | |
| C2 | **Bridge actions** read, write, listen, react, readMany, dropdown | `bridge.gs` | Thin; good | Medium | **Must** | Keep thin |
| C3 | **Datasource cache** + refresh | `datasource.js` | Works; complex | **Very high** | **Redesign** | Heart of speed *and* footguns |
| C4 | **Listen/poll “anything new?”** | datasource + bridge listen | Works | Medium | **Must** (featherweight) | |
| C5 | **Create: user + master + mapping** | `sync.executeCreateTask` | Works | High | **Must** | Canonical birth |
| C6 | **Update: master + user aligned** | `sync.executeUpdateTask` | Works; optimised path | High | **Must** | Master-over-user merge helpers |
| C7 | **Background refresh after write** | datasource | Works | Medium | **Should** | Don’t block UX |
| C8 | **Dev fixtures fallback** | datasource | **Dangerous if live fails open** | High | **Redesign** | Fail loud in production — lesson from audits |
| C9 | **User-sheet auto sync scan** | `user-sheet-sync.js` | **KILL-SWITCH OFF** (`USER_SHEET_SYNC`) | **Very high** | **Redesign** | Needed eventually; current form minted dupes |
| C10 | **Admin pull one user sheet** | `pull-user.js` + API | Built; name-guarded; → Logged | High | **Should** as recovery tool | Prefer fixing birth/sync over living on pull |
| C11 | **Content tab → UI strings/icons** | `/api/content`, frontend applyContent | Works | Medium | **Should** | Bake icons at build optional |
| C12 | **Dropdown data** people/projects | `/api/dropdown-data` | Works | Medium | **Should** | |
| C13 | **Project dropdown write-back to sheet** | bridge `dropdown` + refresh helper | Exists | Medium | **Later** | |
| C14 | **Users tab / sheet assignment** | datasource users | Works | Medium | **Must** | Vehicle registry |
| C15 | **Mapping tab** | sync | Works | High | **Must** | Ticket stub vehicle↔depot |
| C16 | **Id minting lock** | datasource | Works | Medium | **Must** | Concurrency |
| C17 | **Drive boundary** cult-automation | policy + MASTER_ID in bridge | Policy | Low | **Must** | Hard-coded master id in `.gs` is operational coupling |
| C18 | **Sheet parse / display dates** | `sheetparse.js`, `datefmt.js` | Works | Medium | **Must** thin util | `DD MMM \| HH:MM` |

---

### D. Admin / reports

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| D1 | **Removable admin plugin** | `admin/index.js`, contract doc | Good isolation idea | Medium | **Must pattern** | Keep plugin boundary |
| D2 | **Reports page** filter/group/print-ish | `report.js` + admin.html | Works for P3+ | High | **Should** | Rebuild UI simpler |
| D3 | **Activity log read** | `audit.js` → jsonl → `adminlog.js` | Works | Medium | **Should** | |
| D4 | **Queue list + decide** | queue-api | Works P4 | High | **Should** | Approve/reject/file notes |
| D5 | **Bulk import preview/commit** | bulk-import + cleaner + memory | **Historically fragile** (RAM dedupe, twins) | **Very high** | **Redesign or Later** | Don’t port as-is |
| D6 | **Import memory** (sheet-backed?) | import-memory | Exists | High | **Later** | |
| D7 | **Reset all tasks** type-confirm | reset-api | Dangerous but gated | High | **Later** + dry-run | Keep ritual |
| D8 | **Slots registry** (module name slots on master) | slots.js + API | Niche | High | **Later / Drop?** | Confirm Vinod still wants |
| D9 | **Dedup purge** Preview→PURGE + backup | dedup.js + api | Built; purge may await Vinod | High | **Repair-only** | Symptom tool; not core product forever |
| D10 | **Pull user** Preview→PULL | pull-user | Built | High | **Repair-only → then redesign sync** | |
| D11 | **Admin HTML kitchen sink** | admin.html | Heavy | High | **Redesign** | Split reports vs dangerous tools |

---

### E. Input channels

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| E1 | **Dashboard create/edit** | frontend + API | Core path | Medium | **Must** | |
| E2 | **Kiosk `/tasks` form** | tasks-form.html + intake APIs | Works as alternate UI on API host | Medium | **Should** | Same birth pipeline only |
| E3 | **Intake parse POST** `/api/tasks/intake` | server + gemini/journal | Works | High | **Later** | Messy text → structured |
| E4 | **Intake find / update** | task-match | Works in code | High | **Later** | “poster done” style |
| E5 | **WhatsApp → Inbox tab** | bridge `inbox` + INBOX_TOKEN | Works drop | Medium | **Should** channel | |
| E6 | **Inbox drain loop** | `inbox-drain.js` | Works when running | High | **Redesign** | Must share one mint/match path |
| E7 | **Gemini parse fallback** | `gemini.js` | Optional if key set | High | **Later** | Never mint alone; never bypass queue |
| E8 | **iPhone Shortcut journal import** | `/api/import/journal` HMAC | Special path | **Very high** | **Later / Redesign** | Second birth alley risk |
| E9 | **Journal import execute** | journal-import.js | Complex; update branch improved | **Very high** | **Redesign** | Collapse into one intake module |
| E10 | **Queue from all non-P4 channels** | queue.js | Central idea good | High | **Should** | One queue, many doors |

---

### F. Reliability / edge-case / security

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| F1 | **Signed sessions** (cookie + Bearer) | server.js | Works; cross-origin story real | High | **Must** | Pages ≠ API origin |
| F2 | **CORS allowlist** | server.js | Works | Medium | **Must** | |
| F3 | **CSRF on cookie writes** | double-submit | Works; Bearer exempt | Medium | **Must** | |
| F4 | **Rate limiting** | server.js | Works | Medium | **Must** | |
| F5 | **Audit log writes** | audit.js | Works | Medium | **Should** | |
| F6 | **OTP forgot-password** | server pendingOtps Map | Works in process (lost on restart) | High | **Redesign / Later** | Ephemeral Map is weak |
| F7 | **Health endpoint** | `/api/health` | Works | Low | **Must** | |
| F8 | **Sync status / manual sync** | `/api/sync` + UI pill | Works | Medium | **Should** | |
| F9 | **Stale cache signalling** | datasource connectionStatus | Partial | Medium | **Should** | Fail loud > fake fresh |
| F10 | **Script lock on bridge writes** | bridge.gs locked_ | Works | Medium | **Must** | |
| F11 | **Dedup backups to disk** | data/backups | Operational | Medium | **Repair tooling** | |
| F12 | **Live reload dev SSE** | server | Dev only | Low | **Dev only** | |
| F13 | **Integration tests** | integration.live.test.js | Dev fixtures | Medium | **Must habit** | |
| F14 | **Kill switches** QUEUE_MODE, USER_SHEET_SYNC | env | Operational scar tissue | Medium | **Prefer design so switches rare** | |
| F15 | **Keep-alive / Render spin** | KEEP-ALIVE.md etc. | Hosting concern | Low | **Ops note** | |

---

### G. Frontend / UX / other

| # | Capability | Where | Works? | Complexity | ts-3? | Notes |
|---|------------|-------|--------|------------|-------|-------|
| G1 | **One board URL, profile unlock** | index.html | Works | Medium | **Must** | |
| G2 | **Tabs: All / Mine / Completed / Logged** | frontend | Works | Medium | **Should** | |
| G3 | **Filters** user/status/priority/search | frontend | Works | Medium | **Should** | |
| G4 | **Overview stats + per-user strips** | frontend | Works | Medium | **Should** | Nice, not spine |
| G5 | **Content-driven labels + icons** | content API | Works | Medium | **Should** | |
| G6 | **Login / logout dialogs** | frontend | Works | Low | **Must** | |
| G7 | **Edit dialog role-locked fields** | frontend | Works | Medium | **Must** cosmetic + server | |
| G8 | **New task dialog** | frontend | Works | Low | **Must** | |
| G9 | **Priority dots / overdue pulse** | CSS + priority field | Works | Low | **Later polish** | |
| G10 | **Guide toggle localStorage** | frontend | Minor | Low | **Drop or Later** | |
| G11 | **Pages bake + token injection** | build-pages.cjs | Required for prod | Medium | **Must** when deploying | |
| G12 | **Netlify.toml remnant** | repo | Confusing | Low | **Drop** | Not a home |
| G13 | **Topbar shared component** | shared/topbar.js | Works | Low | **Should** simplify | |
| G14 | **Password hash helper CLI** | hash-password.js | Utility | Low | **Optional** | |

---

## 2. Most valuable capabilities (preserve the *power*)

These are the spine. ts-3 should deliver equivalent power even if every file is new.

### P0 — Without these it is not the product

1. **Task ID** as sole existence proof; middleware-only mint; refuse invalid / past Z99.  
2. **Birth on user sheet → master + mapping** (vehicle then parking lot).  
3. **Master wins** on conflict; board reads master-governed state.  
4. **P1–P4** server enforcement + field-level PATCH gates.  
5. **Browser → middleware only**; thin bridge hands.  
6. **Projects as admin vocabulary.**  
7. **Create / list / update** tasks with scoped visibility.  
8. **Auth session** usable cross-origin (Pages + API).  
9. **CSRF + rate limit + validation** on writes.  
10. **Deploy split:** Pages UI · Render API · Sheets data.

### P1 — Makes it Param’s real workplace (soon after spine)

11. **Queue** for non-trusted creates (one queue, many doors later).  
12. **Classifier + Logged vs real tasks + Make Task.**  
13. **Completed / approved counting rule** (one function).  
14. **Priority from deadline clock** (+ optional P4 override).  
15. **Content tab** labels (and icons strategy).  
16. **Featherweight poll/listen.**  
17. **Reports (P3+) as removable plugin.**  
18. **Audit trail of writes.**  
19. **Duplicate identity guard at create** (before multi-channel or user-sheet sync).  
20. **Chat/inbox intake that matches updates** instead of minting twins.

### P2 — Operational / recovery (have a plan, don’t start here)

21. Controlled user-sheet pull / sync (redesigned).  
22. Dedup/merge repair tools (with backup + confirm).  
23. Bulk import (redesigned).  
24. Reset (dry-run + confirm).  
25. Kiosk + WhatsApp as *doors*, not separate products.

---

## 3. Complex / clunky parts (redesign or drop)

| Problem in ts-2 | Why it hurts | ts-3 direction |
|-----------------|--------------|----------------|
| **Many birth alleys** (dashboard queue, direct P4, journal HMAC, inbox drain, bulk import, user-sheet sync, pull) | Duplicate Task IDs / twin rows (948→1461 story) | **One** `birthTask()` / **one** `mintTaskId()`; every door calls them |
| **`datasource.js` god-module** | Cache, poll, create, update, fixtures, locks intertwined | Split: store adapter · cache · poll · services |
| **User-sheet sync off by kill-switch** | Needed feature became liability | Redesign with create-time dedupe + dry-run; no silent mint storms |
| **Bulk import complexity** | Cleaner + memory + fingerprints + past bugs | Later; pure preview planner + same birth path |
| **Journal import + Gemini + intake** parallel parsers | Behaviour forks | One “messy text → draft task(s)” module |
| **server.js monolith** (~1300 lines) | Hard to reason, easy to bypass gates | Foundation-style router + modules (ts-3 already started) |
| **OTP in process memory** | Restarts wipe resets | Later: sheet or signed token with expiry |
| **Assignee identity ambiguity** (sheet key vs display name) | Scope bugs | One canonical assignee key in API |
| **Admin page as tool dump** | Scary controls beside reports | Reports UI ≠ nuclear tools UI |
| **Dedup/purge as ongoing product** | Treats symptoms | Repair toolkit, not daily path |
| **Hard-coded MASTER_ID in bridge** | Env/deploy rigidity | Config/property only |
| **Silent or broad dev fallback risk** | Security/trust | Production: no fixture users if bridge fails |
| **Merge without API/UI** | Half-built | Finish or box until Slice N |
| **Netlify / historical homes** | Cognitive noise | Don’t revive |
| **Priority overrides JSON file on disk** | Extra state store | Sheet column or mapping metadata later |
| **Frontend 1500-line single file with everything** | OK for product law, but dense | Still one file; clearer sections / less duplicate rule logic (trust API permissions) |

---

## 4. What “same power, cleaner” means for ts-3

Keep the **outcomes** users feel:

- One URL, four trust levels.  
- Work appears from board, and later from WhatsApp/kiosk, without chaos.  
- Admin can see everyone, classify noise, approve real completion, run reports.  
- Sheets remain durable memory; control room stays replaceable.

Change the **internals**:

- Architecture metaphors enforced in code layout ([ARCHITECTURE.md](ARCHITECTURE.md)).  
- Foundation spine already started ([FOUNDATION.md](FOUNDATION.md)).  
- Slices add power in order ([PLAN-CLEAN.md](PLAN-CLEAN.md), [SLICE-01.md](SLICE-01.md)).  
- **No copy-paste of ts-2 modules** unless a pure function is extracted and re-tested (e.g. ideas from `taskid.js`, `roles.js`, `merge.js` planners) — prefer re-implement against specs + this list.

---

## 5. Suggested rebuild waves (capability → slice thinking)

| Wave | Capabilities | Avoid |
|------|--------------|-------|
| **Foundation** | HTTP, config, log, errors | Business |
| **Slice 01** | Auth P1–P4, fixtures, list/create/patch, permissions | Sheets, queue, WA |
| **Slice 02** | Board UX tabs/filters, content labels stub | Admin nuclear tools |
| **Google spine** | Bridge, birth vehicle→depot, mapping, poll | Auto user-sheet sync |
| **Trust gates** | Queue, classifier/Logged, priority clock, audit | Bulk import |
| **Plugin** | Reports read P3+ | Reset/dedup on same day |
| **Intake** | One messy-text door + match-update | Second mint path |
| **Vehicle listen** | User-sheet sync v2 with dedupe | Kill-switch archaeology |
| **Repair kit** | Pull, dedup, merge, reset | Using repair as daily create |

---

## 6. API surface inventory (actual routes seen)

**Core / board**

- `POST /api/login` · `POST /api/logout` · `GET /api/session`  
- `GET /api/health` · `GET /api/content` · `GET /api/projects` · `GET /api/dropdown-data`  
- `GET|POST /api/tasks` · `PATCH /api/tasks/:idOrRef`  
- `GET|POST /api/sync`  
- `POST /api/forgot-password/request` · `POST /api/forgot-password/verify`  
- `POST /api/tasks/intake` · `POST /api/tasks/intake/find` · `POST /api/tasks/intake/update`  
- `POST /api/import/journal`  
- `GET /api/livereload` (dev)

**Admin plugin**

- `GET /api/admin/data`  
- `GET /api/admin/queue` · `POST /api/admin/queue/decide`  
- `GET|POST /api/admin/slots…`  
- `POST /api/admin/reset`  
- `POST /api/admin/import/preview` · `POST /api/admin/import/commit`  
- `POST /api/admin/dedup`  
- `POST /api/admin/pull`

**Pages**

- `/` board · `/admin` · `/tasks` kiosk · static shared assets  

ts-3 should not recreate this entire surface on day one — recreate **power** behind a smaller, consistent surface.

---

## 7. Module map (ts-2 → conceptual ts-3 home)

| ts-2 module | Fate |
|-------------|------|
| `roles.js` | Re-implement pure; **preserve rules** |
| `taskid.js` | Re-implement pure; **preserve format** |
| `tasks.js` (scope, strip, counts) | Re-implement pure |
| `sync.js` | Re-implement as birth/update orchestrator |
| `bridge.js` + `bridge.gs` | Keep thin contract; tidy config |
| `datasource.js` | **Split/redesign** |
| `queue.js` | Re-implement simpler |
| `priority.js` | Re-implement |
| `user-sheet-sync.js` | Redesign later |
| `journal-import.js` / `gemini.js` / `inbox-drain.js` | Merge into one intake story later |
| `admin/*` plugin | Keep **plugin shape**; rebuild tools carefully |
| `admin/merge.js` `dedup.js` `duplicate-check.js` | Keep as pure planners when needed |
| `frontend/index.html` | New clean board; same roles UX |
| `build-pages.cjs` | Recreate when deploying |

---

## 8. Risks if ts-3 “just copies ts-2”

- Re-imports duplicate factories and kill-switches as normal.  
- Re-imports admin nuclear tools before create-time safety.  
- Re-imports fixture fallback insecurity.  
- Loses the chance to make **vehicle / depot / control room** obvious in code.  
- Burns trust again with “it works in curl” vs Vinod’s browser.

---

## 9. One-page verdict

**ts-2 is a real, ambitious multi-channel task control room** with correct *laws* (Task ID, roles, bridge, Pages/Render/Sheets) and a battle-scarred *implementation* (too many doors into create, a heavy datasource, sync that had to be switched off, repair tools growing around duplication).

**ts-3 should preserve the laws and the user-visible power**, especially: four profiles, hidden Task ID master key, vehicle birth, depot authority, queue+classifier discipline, reports plugin, and eventually one safe intake bus.

**ts-3 should not preserve the scar tissue as architecture:** god-files, parallel importers, default-off sync as a lifestyle, or purge tools as the create path.

---

## 10. Links

| Doc | Role |
|-----|------|
| [README.md](README.md) | Entry |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Target shape |
| [PLAN-CLEAN.md](PLAN-CLEAN.md) | Rebuild order |
| [SLICE-01.md](SLICE-01.md) | First concrete slice |
| [FOUNDATION.md](FOUNDATION.md) | Technical spine |
| [docs/archive/MASTER.md](docs/archive/MASTER.md) | Old product snapshot (archive) |
| ts-2 living PLAN/STATE | Live claims (in ts-2 only) |

---

*Read-only analysis. When a capability is implemented in ts-3, tick it in the slice doc with verification — do not mark done from this inventory alone.*
