# SLICE-01 — Control room spine (ts-3)

**Goal:** Prove the **control room spine** — login, P1–P4 roles, list/create/edit tasks — on a **memory store shaped like vehicle + depot + mapping**. No Google. No queue. No WhatsApp. No reports.

**Architecture alignment:** Creates must go through **one** `mintTaskId` + **one** `birthTask` (see [PLAN-CLEAN.md](PLAN-CLEAN.md) §4, [ARCHITECTURE.md](ARCHITECTURE.md)). Fixtures are not a different product — they are a store adapter.

**Done when:** the checks in §7 all pass on a cold terminal, and a human can open one local URL, log in as each role, and see the right power.

**Status:** Built — automated §7 A–F verified (`npm test`).  
**Parent plan:** [PLAN-CLEAN.md](PLAN-CLEAN.md) Wave 1  
**Technical base:** [FOUNDATION.md](FOUNDATION.md)  
**Entry:** [README.md](README.md)  
**Out of:** ts-2 (do not modify ts-2 for this slice)

---

## 1. Locked choices for this slice only

| # | Question | Slice-01 default | Why |
|---|----------|------------------|-----|
| 1 | Queue for non-P4 creates? | **No.** P2 create → validate → identity guard → mint → **birthTask**. | One birth hallway; queue is Wave 4. |
| 2 | Live Sheets or fresh data? | **Memory store** seeded from `middleware/data/seed.json`. | No Drive risk; partitions mirror Sheets. |
| 3 | Task ID in browser JSON? | **Hidden.** Opaque client `ref` (HMAC) only; internal `taskId` stays in store. | MASTER / ARCHITECTURE / ts-2. |
| 4 | WhatsApp / kiosk? | **Out of scope.** | Board + login only. |
| 5 | Assignee identity | **`assigneeUsername`** (= login username) for scope; store also keeps `userSheet` on user records for later Sheets. | Avoid ts-2 display-name ambiguity. |
| 6 | Create entrypoint | **Only** `use-cases/create-task.js` → `nextTaskId` + `data.commitBirth` (vehicle+depot+mapping). | No POST handler that writes tasks directly. |

If Vinod changes a default, edit this table first, then code.

---

## 2. What Slice 01 is (one sentence)

A tiny local app: **one HTML file + thin HTTP layer + domain factory + memory store (vehicle/depot/mapping)**, where four people-shapes share one URL and the **server** decides who may read or write which tasks.

---

## 3. Files that will exist when Slice 01 is built

```
ts-3/
  run.sh
  frontend/index.html
  middleware/
    domain/           # roles, taskid, identity, birth (pure)
    use-cases/        # create-task, list-tasks, login, …
    adapters/http/    # thin routes only
    data/             # memory seed + partitions (vehicle/depot/mapping)
    auth/             # session helpers if needed
    slice01.test.js
  SLICE-01.md
```

Follow Clean Architecture wiring in [FOUNDATION.md](FOUNDATION.md).  
Foundation files remain. No Apps Script. No npm frameworks.

---

## 4. Fixture people (P1–P4)

Passwords plain text on purpose (personal-scale).

### Canonical Staging humans (locked — primary logins)

| username | password | role | displayName | employeeId | notes |
|----------|----------|------|-------------|------------|--------|
| `ts3admin` | `ts3-98860` | **P4** Admin | TS3 Admin | `9001` | Primary admin; inherits to live profile on go-live |
| `ts3usr1` | `ts3-98860` | **P2** User | TS3 User 1 | `9002` | Primary user; inherits to live profile on go-live |

See also: `middleware/data/CREDENTIALS.txt`

### Demo fixtures (automated tests only)

| username | password | role | displayName | employeeId (last 4 used later) | notes |
|----------|----------|------|-------------|----------------------------------|--------|
| *(none)* | — | **P1** Public Viewer | Public | — | No login; read public tasks only |
| `anya` | `anya` | **P2** User | Anya | `1001` | Own tasks only |
| `ravi` | `ravi` | **P2** User | Ravi | `1002` | Own tasks only (second user to prove isolation) |
| `mira` | `mira` | **P3** Moderator | Mira | `2001` | See all; status-only edits |
| `vinod` | `vinod` | **P4** Super Admin | Vinod | `0001` | Full edit |

**Projects in fixture (admin vocabulary only):**

| code (6) | name |
|----------|------|
| `PRJ001` | Sample Project |
| `PRJ002` | Other Project |

Users pick from this list. Create with unknown project → **400**.

---

## 5. Task fields for v1 (minimal)

### Server-internal task record

| Field | Required | Who may set on create | Who may change later | Notes |
|-------|----------|----------------------|----------------------|--------|
| `taskId` | yes (server) | server only | never | Full atom e.g. `PRJ0011001A01`. **Never in API JSON this slice.** |
| `ref` | yes (derived) | server only | never | Opaque client handle: HMAC-SHA256(secret, taskId) hex first 16. Browser key. **Not a second identity.** |
| `projectCode` | yes | P2+ | P4 only | Must exist in fixture projects; denormalized from atom when valid |
| `projectName` | yes | server fills | server | From project catalog |
| `name` | yes | P2+ | owner P2 / P4 | Task title |
| `description` | no | P2+ | owner P2 / P4 | |
| `notes` | no | P2+ | owner P2 / P4 | |
| `status` | yes | default `Draft` | owner P2 (allowed set) / P3 / P4 | See status lists below |
| `priority` | no | default `normal` | **P4 only** | |
| `startDate` | no | P2+ | owner P2 / P4 | Display form `DD MMM \| HH:MM` when set |
| `endDate` | no | P2+ | owner P2 / P4 | Deadline |
| `assigneeUsername` | yes | server (creator) | P4 only | **Canonical scope key** for P2 (= username) |
| `userSheet` | yes (internal) | server | rare | Vehicle key on user + stored on task for later Sheets (`user-anya` style ok in seed) |
| `visibility` | yes | default `public` for slice simplicity | P4 | P1 only sees `visibility === 'public'` |
| `createdAt` / `updatedAt` | yes | server | server | ISO internally OK; UI may format later |

**Internal store partitions (not in API JSON):**

- **vehicle** — per-user task rows (birth lands here first)  
- **depot** — aggregate task rows (board reads depot-governed list)  
- **mapping** — `{ taskId, ref, userSheet, assigneeUsername }` ticket stub  

Board list reads **depot** (memory stand-in for master). Create writes all three via `birthTask`.

**Explicitly not in Slice 01:** classifier / flavour, approved flag, Logged tab, link field, spam UI, queue, audit log UI, content-tab CMS, reports, Google.

### Status vocabulary (fixture hard-coded; later from content tab)

- **All statuses:** `Draft`, `Active`, `Blocked`, `Done`
- **P2 may set:** `Draft`, `Active`, `Done`
- **P3 may set:** any of all statuses (status field only)
- **P4 may set:** any + all other fields

### Role × task rules (server must enforce)

| Action | P1 | P2 | P3 | P4 |
|--------|----|----|----|-----|
| List tasks | public only | own only | all | all |
| Get one task | if public | if own | yes | yes |
| Create | no | yes (self assignee) | no* | yes (any assignee) |
| Patch name/description/notes/dates | no | own only | **no** | yes |
| Patch status | no | own + allowed set | any task, status only | yes |
| Patch priority / project / assignee | no | no | no | yes |
| Delete | no | no | no | yes (soft: `status=Done` + flag, or hard remove in fixture — pick **hard delete in fixture only**) |

\*P3 create = **no** in Slice 01 (moderators steward status, not birth). Override only if Vinod wants otherwise.

---

## 6. Endpoints (exact)

Base: `http://localhost:4303` (prefer **4303** so ts-2 on 4300 can stay running).  
JSON in/out. Sessions via **httpOnly cookie** + **Bearer token** header both accepted (token easier for curl).  
Writes need header `x-csrf-token` matching session CSRF value from login.

### 6.1 Health

`GET /api/health`  
→ `200 { "ok": true, "slice": "01" }`

### 6.2 Session

`POST /api/login`  
body: `{ "username", "password" }`  
→ `200 { "user": { "username", "displayName", "role" }, "csrfToken", "token" }`  
→ `401` bad credentials  

`POST /api/logout`  
→ `200 { "ok": true }`  

`GET /api/me`  
→ `200` user+role if logged in  
→ `200 { "user": null, "role": "P1" }` if anonymous  

Roles in JSON: `"P1" | "P2" | "P3" | "P4"`.

### 6.3 Projects (read)

`GET /api/projects`  
→ list `{ "code", "name" }[]`  
Auth: any (P1 included) so the create form can populate after login; fine to require login — **Slice 01: login required**.

### 6.4 Tasks

`GET /api/tasks`  
→ `{ "tasks": [ /* public fields only */ ] }`  
Scoped by role (§5). Each task object:

```json
{
  "ref": "5fc806549a0db15d",
  "projectCode": "PRJ001",
  "projectName": "Sample Project",
  "name": "Draw poster",
  "description": "",
  "notes": "",
  "status": "Active",
  "priority": "normal",
  "startDate": "",
  "endDate": "15 Aug | 18:00",
  "assigneeUsername": "anya",
  "assigneeDisplayName": "Anya",
  "visibility": "public",
  "parentRef": null,
  "updatedAt": "2026-07-29T12:00:00.000Z"
}
```

No `taskId` field. No `publicId` / sequential `t_*` id. No sheet ids.  
HTTP route param `:id` is the client **`ref`** value (short path name only).

`GET /api/tasks/:id`  
→ one task or `404` / `403` if out of scope (`:id` = client `ref`)  

`POST /api/tasks`  
auth: P2 or P4  
body:

```json
{
  "projectCode": "PRJ001",
  "name": "Draw poster",
  "description": "optional",
  "notes": "optional",
  "endDate": "15 Aug | 18:00",
  "visibility": "public"
}
```

Server path (mandatory):

```text
POST handler
  → authz (P2/P4)
  → validate input
  → identity.guard (duplicate project+name+assignee → 409 conflict)
  → domain.birthTask({…})     // only create entry
       → mintTaskId()
       → store.writeVehicle
       → store.writeDepot
       → store.writeMapping
  → 201 public task shape
```

→ `201 { "task": { … } }`  
→ `400` validation / unknown project / empty name  
→ `409` duplicate identity  
→ `401` / `403`  

**Internal Task ID mint (server only, inside birth/mint):**  
`[projectCode][last4(employeeId)][next subtask A01…]`  
Example: Anya + PRJ001 → `PRJ0011001A01`, then `A02`…  
Past `Z99` → `400` refuse.  
Never send `taskId` to browser.

**Forbidden:** route handler or store method that inserts a task without going through `birthTask`.

`PATCH /api/tasks/:id`  
body: sparse fields only  
Server applies role allow-list (§5). Unknown field or forbidden field → `403` or `400` (pick **403** for role, **400** for bad value).  
→ `200 { "task": { … } }`  

`DELETE /api/tasks/:id`  
auth: P4 only  
→ `200 { "ok": true }`  

### 6.5 Static

`GET /` → `frontend/index.html`  
No other routes required.

---

## 7. Done means (checks)

Run server, then these must pass. Prefer automated `node middleware/slice01.test.js` that performs the same calls.

### A — Health & anonymous

1. `GET /api/health` → 200, `slice === "01"`  
2. `GET /api/me` without auth → role `P1`  
3. `GET /api/tasks` as P1 → only tasks with `visibility: "public"`; none of Anya’s private rows if any exist in fixtures  

### B — Login & roles

4. Login `anya` / `anya` → 200, role `P2`  
5. Login bad password → 401  
6. Login `mira` → `P3`; `vinod` → `P4`  

### C — Scope

7. As `anya`, `GET /api/tasks` → only `assigneeUsername === "anya"`  
8. As `mira` or `vinod` → tasks for both Anya and Ravi present  
9. As `anya`, `GET` Ravi’s task id → 403 or 404 (not leaked)

### D — Create (single birth path)

10. As `anya`, POST valid task → 201; appears in her list; response has `id`, **no** `taskId`  
11. As `anya`, POST unknown `projectCode` → 400  
12. As P1 (no login), POST → 401/403  
13. As `mira` (P3), POST → 403  
13b. As `anya`, POST exact duplicate (same project+name) → **409** (identity guard)  
13c. After create, memory store has matching **vehicle + depot + mapping** entries for that internal taskId (unit or store assertion)  

### E — Patch gates

14. As `anya`, PATCH own `name` → 200  
15. As `anya`, PATCH own `priority` → 403  
16. As `mira`, PATCH someone’s `status` → 200  
17. As `mira`, PATCH someone’s `name` → 403  
18. As `vinod`, PATCH `priority` → 200  
19. As `ravi`, PATCH Anya’s task → 403  

### F — Delete

20. As `anya`, DELETE → 403  
21. As `vinod`, DELETE → 200; task gone from list  

### G — Human smoke (Vinod or builder)

22. Open `http://localhost:4303` → see board shell  
23. Log in Anya → see only her tasks; create one; it appears  
24. Log in Mira → see everyone’s; can change status; cannot change title in UI **and** API rejects if forced  
25. Log out → public view again  

**Reporting rule:** say **built — not verified** until A–F run; say **verified** only with command output or a clear pass list.

---

## 8. Frontend behaviour (cosmetic only)

One file. No frameworks.

- **P1:** board list (public tasks), Login button. No create. No edit.  
- **P2:** board (own), Create form (project dropdown, name, description, notes, end date), edit own allowed fields + status.  
- **P3:** board (all), edit dialog/control with **status only** unlocked.  
- **P4:** board (all), full edit, delete control.  

UI may hide buttons; **tests in §7 must still pass if someone calls the API directly.**

Skin: one CSS-variable block at top. Plain readable class names. No icon CMS yet — a few inline labels are OK for Slice 01 only (content-tab comes later).

---

## 9. Explicit out of scope (do not build in Slice 01)

- Google Sheets / Apps Script / Drive  
- Render / GitHub Pages deploy  
- Queue, WhatsApp, kiosk, Gemini  
- Classifier, Logged tab, Make Task, approve  
- Reports / admin plugin  
- Duplicate purge, merge, pull-user-sheet  
- Priority clock math / overrides  
- Content tab baking  
- Spam tab UI  
- Exposing mapping rows to the browser  
- Rate-limit beyond a simple optional guard  
- Copying files from `ts-2/middleware` or `ts-2/frontend`  
- Any second function that creates tasks besides `birthTask`  

If a change is not required by §6–§7, it is not Slice 01.

---

## 10. Implementation order inside this slice

1. `data/seed.json` — users (with userSheet + employeeId), projects, sample depot tasks  
2. `domain/taskid.js` — compose / parse / next / validate  
3. `domain/roles.js` — permissionsFor + authorizeTaskPatch  
4. `domain/identity.js` — duplicate key guard  
5. `data/memory.js` — load seed; vehicle/depot/mapping; get/list/update/delete  
6. `use-cases/create-task.js` + `commitBirth` — mint + write three partitions (only create path)  
7. `domain/tasks.js` + `domain/ref.js` — scope list, public DTO (`ref`, strip taskId)  
8. `auth/*` — login, session token, csrf  
9. Wire routes in `routes.js` (or `routes/*.js`) — handlers call domain only  
10. `slice01.test.js` — §7 A–F including 13b/13c  
11. `frontend/index.html` — board shell  
12. `npm test` (foundation) + slice01 tests → human smoke G → update sign-off  

Do not start step 11 until step 10 is green.

---

## 11. Risks / watch-outs

- **Do not copy ts-2 code** — re-implement pure rules from specs.  
- **Do not put Task ID in JSON.**  
- **Do not create tasks outside birthTask.**  
- **Do not open port 4300** if ts-2 is running; use **4303**.  
- **Do not touch ts-2.**  
- Fail loud: unknown project, forbidden patch, bad session, duplicate identity.  
- Keep `server.js` thin — if it grows task logic, stop and move to domain/routes.

---

## 12. After Slice 01 (not now)

Per [PLAN-CLEAN.md](PLAN-CLEAN.md) waves:

- **Wave 2:** board UX polish  
- **Wave 3:** Google `store/sheets` + real vehicle→depot  
- **Wave 4:** queue + classifier (approve still calls birthTask)  

---

## 13. Sign-off

| Item | State |
|------|--------|
| Plan written | yes |
| Code built | **yes** |
| §7 A–F verified | **yes** — `node middleware/slice01.test.js` (24 passed) + foundation green |
| §7 G human smoke | pending Vinod browser walkthrough |

**Next:** Wave 2 board polish, or Wave 3 Google spine when ready.
