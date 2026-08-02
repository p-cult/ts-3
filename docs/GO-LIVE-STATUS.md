# GO-LIVE STATUS — ts-3 replaces ts-2 at the same URL

**Status date:** 2026-08-02  
**Target public URL:** `https://p-cult.github.io/task/` (GitHub Pages)  
**Target API (likely):** `https://param-task-middleware.onrender.com` (Render)  
**Sheet truth:** same Master + user sheets (no data migration)  
**Audit method:** four parallel deep probes (parity · data plane · auth/security · deploy/cutover) + spot verification in code  

---

## 0. Executive verdict

| Question | Answer |
|----------|--------|
| Can we flip the URL **tomorrow**? | **No.** |
| Is the spine (Task ID, roles, birth hallway, live read, gated write) real? | **Yes.** |
| Is day-to-day workplace parity with ts-2 done? | **No.** |
| What does “same URL” mean? | Keep **`https://p-cult.github.io/task/`**; swap baked UI + Render process to ts-3. Not Oracle. Not Cloudflare. |
| Hardest operational law | **Stop ts-2 completely before `WRITER_OF_RECORD=ts3`.** Dual writers can corrupt Master (mint race + row overwrite). |

**One-line:** ts-3 is a stronger control-room rebuild on the same sheets, but it is **not** a drop-in URL swap until hosting bake, sole-writer proof, sheet status contract, auth hardening, and a short list of UX traps are closed.

---

## 1. Target cutover shape (no ambiguity)

```text
TODAY (ts-2 live)
  Browser → https://p-cult.github.io/task/
         → https://param-task-middleware.onrender.com/api/*
         → Apps Script /exec (thin bridge)
         → Google Sheets (Master + user sheets)

GOAL (ts-3 sole reader/writer)
  Browser → https://p-cult.github.io/task/          ← SAME bookmark
         → SAME (or explicitly retargeted) Render API
         → SAME /exec (thin) unless new bridge deployed
         → SAME Sheets
  ts-2 Render process: STOPPED (code kept on disk forever)
```

| Decision | Closed / open |
|----------|----------------|
| Same sheets | **Closed** — same Master |
| Same public UI URL | **Closed** — `p-cult.github.io/task/` |
| Keep vs change Render hostname | **Closed (2026-08-02)** — **same** service `param-task-middleware` |
| Reuse thin `/exec` vs deploy ts-3 `bridge.gs` | **Closed (2026-08-02)** — **keep current** thin `/exec` |
| Kiosk `/tasks` + journal Shortcuts | **Closed** — **pause with ts-2** at freeze (offline until rebuilt); not in ts-3 day-one |
| P3 create | **Closed** — **No** |
| Approved on sheet | **Closed** — **write `Approved`** |
| Pause on sheet | **Closed** — **keep `Pause`** |
| Who runs the switch / when | **Closed** — **agent-led cutover** (this project’s operator sequence); date set when Phase 1–5 exit gates are green |
| Pre-cutover backup | **Closed** — **full system backup before freeze** (restore path if ts-3 fails) |

Evidence: `docs/GO-LIVE.md`, `docs/HOSTING.md`, `ts-2/build-pages.cjs`, `ts-2/render.yaml`, `ts-2/README.md`.

---

## 2. What is already solid (do not undercount)

| Area | State | Evidence |
|------|-------|----------|
| Task ID mint + opaque `ref` | Solid | `middleware/domain/taskid.js`, `ref.js` |
| P1–P4 scope + PATCH gates | Solid (with known P3 create delta) | `domain/roles.js`, `domain/tasks.js` |
| Live sheets read via thin bridge | Solid | `bridge/thin-master.js`, `STORE_ADAPTER=sheets` |
| Write gate (`WRITER_OF_RECORD`) | Solid | `data/sheets.js` |
| Write-behind outbox | Built (durability risk on Render) | `outbox-store.js`, `sync/sheets-worker.js` |
| File ★ review + Needs attention | Beyond ts-2 | frontend + review use-cases |
| Inject (P4) | Beyond ts-2 paste | Slice 15 |
| Priority clock + overdue brick red | Ported + fixed | `middleware/priority.js` |
| Overview + timer pill UI | Present | frontend |
| Slice API tests 01–15 | Largely green as unit/API | `package.json` test script |
| Local sole / live-read scripts | Present | `run-sole.sh`, `run-live-read.sh`, `go-live.sh` |

---

## 3. BLOCKERS — must close before URL flip

Severity: **B** = cutover-blocking. Ordered by dependency.

### B1 — Dual writer corruption (operational + process)

| | |
|--|--|
| **Risk** | ts-2 and ts-3 both mint/write → duplicate Task IDs, overwritten Master/user/mapping rows, write-behind blindness |
| **Evidence** | `docs/GO-LIVE.md`; thin `resolveWriteRow` in `thin-master.js`; no cross-process mint lock |
| **Done when** | Written freeze runbook executed: Render ts-2 **suspended**; health proves only ts-3 writes; no leftover local ts-2 `:4300` |

### B2 — Production Pages bake missing

| | |
|--|--|
| **Risk** | `p-cult.github.io/task/` serves static HTML; ts-3 frontend only `fetch('/api/…')` same-origin — Pages cannot reach Render without bake shim |
| **Status (Phase 2)** | **DONE in repo** — `build-pages.cjs` + `npm run build:pages` → `dist/index.html` with Render `API_ORIGIN`, Bearer `ts3_token`, fixture passwords stripped. Still must publish to `p-cult/task` and private-window smoke. |

### B3 — Render deploy artifact missing

| | |
|--|--|
| **Risk** | No `ts-3/render.yaml`; cutover improvisation on live service |
| **Status (Phase 2)** | **DONE in repo** — `render.yaml` with production env matrix (sole-writer, CORS, SESSION_SECRET generateValue, OUTBOX_AWAIT_BIRTH). Dashboard twin still needed at cutover. |

### B4 — Sheet status write contract unsafe / ambiguous

| | |
|--|--|
| **Risk** | Was: Pause/Blocked collapsed to Assigned; Approved not written to sheet K |
| **Status (Phase 1)** | **MOSTLY DONE** — see `docs/SHEET-STATUS-CONTRACT.md`. Pause→Pause; Done→Completed; Done+mark→Approved; Blocked→Rejected; birth/Active→Assigned. Approve feedback updates notes + Done so sheet write emits Approved. |
| **Still verify** | Supervised live smoke on Master dropdown (validation accepts Pause / Approved) |

### B5 — Hydrate failure can serve fixture as live

| | |
|--|--|
| **Risk** | Bridge hydrate fails → fixture depot still served |
| **Status (Phase 1)** | **DONE for production** — `server.js` refuses start when `APP_MODE=production` + sheets + hydrate fails/incomplete. Health exposes `dependencies.hydrate`. Staging still warns and continues. |

### B6 — Outbox durability on Render

| | |
|--|--|
| **Risk** | UI accepts birth; outbox on ephemeral disk; crash/redeploy before flush → lost births |
| **Status (Phase 2)** | **Policy chosen + coded** — `OUTBOX_AWAIT_BIRTH` defaults **true** when `APP_MODE=production` (birth awaits bridge; patches stay write-behind). Health still exposes outbox pending/dead. Cutover smoke must wait pending≈0 for patches. |

### B7 — Auth hardening for public URL

| | |
|--|--|
| **Risk** | No rate limits; in-memory unsigned sessions; `SESSION_SECRET` warn-only + `dev-ref-secret` fallback; login HTML shows fixture passwords; cookies lack `Secure` |
| **Status (Phase 2/3)** | **MOSTLY DONE** — prod fails without `SESSION_SECRET` / bans `dev-ref-secret`; login+write rate limits; timing-safe password compare; bake strips fixture passwords; link scheme allowlist. Still open: cookie `Secure`/`SameSite=None` (Bearer is primary for Pages), slim public `/api` inventory. |

### B8 — Board floods with logged kinds / “Logs” ≠ “Logged”

| | |
|--|--|
| **Risk** | ts-2 Logged tab isolates routine diary; ts-3 Board is “not Done” and still includes routine/not_a_task; UI tab **Logs** is journal export — naming trap |
| **Status (Phase 4)** | **DONE in UI** — Board excludes logged kinds; **Logged** tab restored; **Logs** renamed **Activity**. |

### B9 — Permanent STAGING badge

| | |
|--|--|
| **Risk** | Public trust / looks unfinished |
| **Status (Phase 2)** | **DONE** — `#modeBadge` hidden unless health banner reports staging. |

### B10 — Human decisions still open (block schedule, not code)

1. Keep Render hostname vs new service  
2. Thin `/exec` reuse vs new bridge deploy  
3. Fate of `/tasks` kiosk + journal Shortcuts  
4. P3 create policy (ts-2 yes / ts-3 no) + `QUEUE_MODE`  
5. Maintenance window length + who presses freeze  

---

## 4. SHOULD-FIX before or immediately after flip

| ID | Gap | Why it hurts | Evidence |
|----|-----|--------------|----------|
| S1 | No board poll / sync pill | Stale multi-user board | ts-2 `/api/sync`; PLAN next steps |
| S2 | Reports = journey stub only | P3 lose workplace reports | ts-2 `admin/`; ts-3 Logs panel `<pre>` |
| S3 | No forgot-password | Support load | CAPABILITIES F6 |
| S4 | Delete does not clear Sheets | “Deleted” ghosts on Master | sheets adapter |
| S5 | `GET /api`, health, dropdown public | Recon / PII usernames | `adapters/http/*` |
| S6 | Link `href` not scheme-allowlisted | `javascript:` XSS | `linkOpenHtml` |
| S7 | Queue UI absent | Never enable `QUEUE_MODE=on` without UI | SLICE-07 |
| S8 | API `countsAsCompleted` ≠ UI Completed gate | Metrics lie | `classifier.js` vs `isDoneOnCompletedTab` |
| S9 | Commit-inject copy still mentions `STAGING_WRITES` | Wrong in production | `commit-inject.js` |
| S10 | Health hangs / 503 on bridge timeout | False “down” during cutover | `get-health.js` 2.5s race; `go-live.sh` curl |

---

## 5. Vocabulary / UX traps (train or alias)

| User mental model (ts-2) | ts-3 today | Action |
|--------------------------|------------|--------|
| Ongoing / Assigned | Active (+ Resume→Active display) | Train or alias labels |
| Completed (waiting) | Done + “Waiting for approval” | Train |
| Approved (status) | `⟦TASK_APPROVED⟧` in notes + chip | Decide sheet K policy |
| Logged tab | Missing; Logs ≠ Logged | **B8** |
| Admin reports | Inject + thin journey | S2 |
| Modal create | Draft cards | Train |
| All / Mine tabs | Board + My Task pill | Train |
| Medium priority | API `normal`, UI “Medium” | OK if consistent |

---

## 6. Production sole-writer env matrix (exact)

```text
APP_MODE=production
NODE_ENV=production
STORE_ADAPTER=sheets
USE_LIVE_BRIDGE=true
WRITER_OF_RECORD=ts3
STAGING_WRITES=false          # ignored when production+ts3, set false anyway
BRIDGE_PROTOCOL=thin         # until semantic bridge proven
BRIDGE_URL=<live /exec>
BRIDGE_SECRET=<same value as Script Property BRIDGE_TOKEN>
MASTER_ID=<Master spreadsheet id>
OUTBOX_AWAIT_BIRTH=true      # production default: await birth on bridge
SESSION_SECRET=<strong unique; required>
CORS_ORIGIN=https://p-cult.github.io
PORT=10000                   # Render
QUEUE_MODE=off               # until queue UI exists
```

Bake UI for Pages:

```bash
npm run build:pages          # → dist/index.html (API → Render)
# optional: API_ORIGIN=https://….onrender.com npm run build:pages
```

Local rehearsal: stop ts-2 → `./run-sole.sh`.  
Preflight printer (not a deploy): `./go-live.sh`.

---

## 7. Fix plan — step by step before final switch

Do **not** reorder past hard dependencies. Each phase ends with an explicit **exit gate**.

### Phase 0 — Freeze decisions (humans, ≤1 day)

- [x] Confirm UI stays `https://p-cult.github.io/task/`
- [x] Choose Render: **in-place replace** `param-task-middleware` **vs** new service + re-bake
- [x] Choose bridge: **reuse thin `/exec`** (recommended path) **vs** deploy `ts-3/apps-script/bridge.gs`
- [x] Choose: drop / rebuild kiosk + journal Shortcuts
- [x] Choose: P3 create + queue policy
- [ ] Book maintenance window

**Exit:** decisions written into this file’s §1 table (no “TBD”).

---

### Phase 1 — Sheet write contract + sole-writer proof (local/staging)

1. Document Master column K allowed words and ts-3 mapping table.  
2. Fix `serializeStatusForSheet` for Pause/Blocked (preserve or map to real sheet words — **no silent Assigned collapse** unless product signs off).  
3. Align `slice14` / sheet tests with live contract.  
4. Define Approved: notes-mark only **or** also write sheet `Approved`.  
5. `./run-live-read.sh` — prove task counts vs Master (not fixture).  
6. Supervised write window → create / status / Done / approve → confirm Master `task` + `mapping` + user sheet.  
7. Wait outbox `pending=0`, `dead=0`.  
8. Implement hydrate-fail fail-closed (or unmistakable banner) for production.

**Exit:** signed smoke log (refs + sheet row screenshots); contract doc checked in; hydrate honesty verified. **(2026-08-02 smoke: PRPA100063A01 → Approved on Master K)**

---

### Phase 2 — Hosting path that matches the public URL

1. Add `build-pages.cjs` (or CI) for ts-3: inject `API_ORIGIN`, Bearer storage key `ts3_token`, CORS-ready.  
2. Add `render.yaml` (or twin checklist) for ts-3 middleware.  
3. Staging bake → temporary Pages branch **or** Oracle same-origin dress rehearsal.  
4. Private-window login with **live Master** users (not fixture hints).  
5. Strip fixture passwords from production bake; gate STAGING badge on mode.

**Exit:** a URL that is **not** `:4303` successfully boards against Render-like API with live users.  
**Repo status (2026-08-02):** items 1–2 + bake strip + badge gate **done**; items 3–4 (publish + private-window) still open before Phase 6.

---

### Phase 3 — Auth / abuse / secrets

1. Require `SESSION_SECRET` in production (fail boot).  
2. Ban `dev-ref-secret` when `APP_MODE=production`.  
3. Port login + write rate limits from ts-2.  
4. Cookie `Secure` (+ `SameSite=None` if Pages≠API).  
5. Timing-safe password compare; optional col J hash later.  
6. Scheme-allowlist links (`http:`/`https:` only).  
7. Slim public `/api` inventory / dropdown / health (or auth-gate).

**Exit:** security checklist B7 items checked; penetration smoke (brute login blocked).  
**Repo status:** 1–3, 5–6 done; 4 + 7 remain (Bearer primary for Pages).

---

### Phase 4 — Workplace traps that break daily use

1. **Logged** board surface (tab or Board exclusion of routine/not_a_task) + Make Task entry clear.  
2. Rename **Logs** → something unambiguous (Activity / Journal export).  
3. Optional: status label aliases (Completed/Approved wording) if training cost too high.  
4. Keep `QUEUE_MODE=off` until queue UI exists.

**Exit:** P2 day-in-the-life script passes without diary flood or “where is Logged?”.  
**Repo status:** 1–2 + 4 done in UI; day-in-the-life still to run.

---

### Phase 5 — Cutover rehearsal (full dry run)

1. Stop local/staging fake dual writers.  
2. Run freeze → sole writer → smoke → rollback drill once.  
3. Time the freeze window.  
4. Update keep-alive plan target (`/api/health`).  
5. Confirm Sheet version history access for rollback net.

**Exit:** written rehearsal report with timings + rollback OK.  
**Local rehearsal (2026-08-02):** **PASS** — see [REHEARSAL.md](./REHEARSAL.md). Smoke `PRPA100063A02` → Master **Approved**; rollback to writes-off verified. Pages publish + Render twin + full backup still open before Phase 6.

---

### Phase 6 — Final switch (production)

```text
T0  Announce freeze
T1  Suspend ts-2 Render (hard stop writer)
T2  Deploy ts-3 middleware with sole-writer env (Phase 0 choices)
T3  Publish ts-3 bake to p-cult/task (SAME URL)
T4  Smoke: health banner sole-writer · private window · P1–P4 · one create on Master · outbox drain
T5  Retarget keep-alive / Shortcuts as decided
T6  Watch 24h: outbox dead, bridge errors, user login issues
```

**Rollback:** restore previous Pages commit + previous Render deploy of ts-2; drain/inspect any ts-3 outbox before declaring Sheets clean; never run both writers “for a minute.”

---

### Phase 7 — Post-cutover (not blockers, schedule within 2 weeks)

- Board poll / sync indicator (S1)  
- Reports v1 for P3 (S2)  
- Forgot-password redesign or admin SOP (S3)  
- Sheet-backed delete policy (S4)  
- Queue UI only if product still wants triage (S7)

---

## 8. Explicit non-goals for day-one flip

Do **not** block cutover on these (track separately):

- WhatsApp / inbox / journal HMAC intake  
- Admin nuclear tools (reset/dedup/pull) — Inject covers controlled bulk  
- Full content-tab CMS  
- Semantic bridge.gs if thin is stable  
- Pixel-perfect ts-2 chrome (Needs attention / drafts are intentional upgrades)

---

## 9. Ambiguities resolved by this audit

| Ambiguity | Resolution |
|-----------|------------|
| “Same URL” = Oracle? | **No** — Pages `p-cult.github.io/task/` |
| `go-live.sh` flips production? | **No** — tests + health + printed checklist only |
| Slices 01–15 done ⇒ cutover ready? | **No** — API/tests ≠ product + hosting parity |
| Logs tab = Logged tab? | **No** — different features; rename required |
| Can ts-2 stay up “just for reads”? | **No** — dual mint/write risk remains if it can write; stop it |
| Fixture login on live sheets? | **No** — Master users tab col H |
| Delete on board clears Sheets? | **No** today — treat as known debt (S4) |
| Override keeps overdue orange? | **Fixed in engine** — past deadline forces high+overdue |

---

## 10. Open questions that still need a human answer

### Phase 0 answers (2026-08-02)

| # | Question | Answer |
|---|----------|--------|
| 1 | Render | **Same** — in-place replace `param-task-middleware` |
| 2 | Bridge | **Keep current** thin `/exec` |
| 3 | Kiosk + journal | **Pause with ts-2** at freeze (go offline together); rebuild later if needed |
| 4 | P3 create | **No** |
| 5 | Approved on sheet | **Yes — write `Approved`** |
| 6 | Pause / Blocked | **Keep `Pause`** on sheet (just Pause) |
| 7 | Who runs the switch | **Agent-led** (cutover sequence owned here); run only after Phase 1–5 gates are green |
| — | Backup | **Full system backup before freeze** — ts-2 + ts-3 trees, Render/Pages deploy pins, Sheet version-history note, env secrets checklist — so we can restore if ts-3 fails |

**Backup / restore intent (mandatory before Phase 6):**
1. Snapshot / copy `param/ts-2` and `param/ts-3` (or tagged archives) on the drive.  
2. Record current Render deploy ID + `p-cult/task` Pages commit SHA (rollback pins).  
3. Confirm Google Sheet **version history** is available for Master (and note time).  
4. Save env var names (not secrets in git) + where secrets live (Render / Script Properties).  
5. Kiosk + journal pause with ts-2 — no dual-writer; accept offline until rebuilt on ts-3 later.

**Note on #3:** Pausing with ts-2 is correct for sole-writer safety. Do **not** leave ts-2 writing Sheets beside ts-3.

### Still needed before the actual flip

- Phase 1–5 engineering exit gates green (sheet contract, bake, auth, Logged/UX, rehearsal).  
- Explicit go-ahead to run Phase 6 after backup checklist is checked.

---

## 11. Suggested next engineering sprint (immediate)

After Phase 0 answers land, implement in this order:

1. Sheet status serializer + tests (B4)  
2. Production hydrate fail-closed (B5)  
3. Outbox durability decision implemented (B6)  
4. `build-pages.cjs` + `render.yaml` (B2, B3)  
5. Auth rate limit + SESSION_SECRET hard require + strip login leaks (B7)  
6. Logged board / Logs rename / STAGING badge (B8, B9)  
7. Full rehearsal (Phase 5) → schedule Phase 6  

---

## 12. Document control

| Artifact | Role |
|----------|------|
| **This file** | Single status + fix plan for cutover |
| `docs/GO-LIVE.md` | Short operator checklist (keep; sync after Phase 0) |
| `docs/HOSTING.md` | Env var reference |
| `CAPABILITIES-FROM-TS2.md` | Historical Must/Should inventory — do not treat as “done” |
| `PLAN-CLEAN.md` | Roadmap narrative — update open Qs when Phase 0 closes |
| `docs/PUBLISH-PAGES.md` | Bake + publish to `p-cult/task` |
| `docs/REHEARSAL.md` | Phase 5 local dry-run report |
| `param/_cutover-backup-*` | Pre-flip tree archives + bake copy |

**Owner:** update this file when any B-item flips from open→done. Do not flip the public URL while any **B1–B9** remains open (B10 decisions may remain only if explicitly accepted in writing with compensating controls).
