# MASTER.md — The Simple Picture (source of truth)

*Specs win on fine detail. **This file wins on intent, roles, flows, and deploy.***  
Every AI session: read this + [SYSTEM.md](SYSTEM.md) first. Old handovers lose to this file.

---

## 0. True intent (why this app exists)

**Make organisational work effortless and continuous** for a small creative team (Param).

- Nobody’s head should be the only place “who is doing what” lives.
- People throw work in **messy human form** (WhatsApp, kiosk, dashboard). The system **understands**, shapes a clean task, and keeps a durable record.
- **Intelligence absorbs mess; plumbing stays thin** (Gemini helps parse — it never bypasses admin or mints IDs alone).
- **One truth** (master sheet). **One atom** (Task ID). Frugal stack. No enterprise tower.
- Four people-shapes on **one URL**: public gallery → worker → steward → owner.

If a change doesn’t serve that, it’s the wrong change.

---

## 1. Hard laws (never bend)

1. Frontend never talks to Sheets or Apps Script.  
2. All business logic lives in the middleware.  
3. Master sheet is source of truth (master beats user on conflict).  
4. Tasks are **born only in user sheets**; master edits, never creates.  
5. Task ID is the only proof a task exists; invalid → not a task.  
6. Projects are admin vocabulary only — users pick, never invent.  
7. Classification (silly/routine/other): **P4 sets**; board hides it below P4.  
8. Security is server-side; UI hiding is cosmetic.  
9. **Passwords stay plain text** in the Users tab (personal-scale app).  
10. Drive boundary: only `cult-automation` (and linked user sheets).
11. **Task ID is middleware-only.** Generated, stored, and managed exclusively by the middleware. Frontend never receives it in any JSON. Sheets never expose it in any user-visible column (A–L). Apps Script bridge carries it internally for sync only; it must never render to humans. Any UI, export, or report that leaks a Task ID violates this rule.

---

## 2. Four profiles (one URL)

Production URL: **https://p-cult.github.io/task/**  
Middleware decides tier; frontend only dresses the room.

| | Name | Can see | Can do |
|---|------|---------|--------|
| **P1** | Public Viewer | Public board | Look only |
| **P2** | User | Own tasks | Create (→ queue); edit own name/desc/notes/deadline/status (user statuses). No priority/classifier |
| **P3** | Moderator | Everyone + **Reports** | Status only on board; read reports/exports. No queue/import/reset/classify |
| **P4** | Super Admin | Everything | Full edit, priority, classify, queue, import, reset, reports |

**Names:** P1–P4 only. “Admin” in speech = P4. No fifth role.

**Task flavours (P4):** pure (can approve) vs routine/action (logged, not in real completed totals). Marks: silly (hidden), routine/other (logged only).

**Logged tab (board):** `classifier='routine'` entries show in their own **Logged** tab — kept and visible, but off the active board and out of all task counts. The admin **Pull a user's sheet** tool files pulled rows here. **Make Task** (P3+ Moderator/Admin) promotes a logged entry to a real task by clearing its classifier; *setting* a classifier stays P4-only.

---

## 3. Three-way communication

```
GitHub Pages (UI)  ──API──►  Render middleware (brain)  ──bridge──►  Apps Script  ──►  Sheets
```

| Path | Rule |
|------|------|
| Browser → Middleware | Only hop out of the browser |
| Middleware → Apps Script | Only hop into Google |
| Browser ↛ Google | Never |
| Apps Script | Read / write / listen / react only — no decisions |

**Creates that aren’t P4:** wait in **admin queue** (dashboard non-P4, WhatsApp, kiosk).  
**P4 push** → mint Task ID → user sheet + master + mapping.  
**Gemini:** parse messy text → still queue (unless legacy QUEUE_MODE=off).  
**Kiosk** `/tasks` on Render host; main UI on Pages.

**Still weak:** typing straight into a user Google Sheet; WhatsApp “done” matching existing tasks.

### Task ID atom

`[6-char ProjectCode][last 4 EmployeeId][A01…Z99]` — middleware only; refuse past Z99.

---

## 4. Where truth lives

| Concern | Place |
|---------|--------|
| Tasks (authority) | Master `task` |
| Projects | Master `admin` |
| UI labels/icons source | Master `content` |
| Row links | Master `mapping` |
| User rows | That user’s sheet |
| Roles / gates | `middleware/roles.js` |
| Reports plugin | `middleware/admin/` + `access.js` (P3 read / P4 write) |
| Messy-text help | `middleware/gemini.js` (fallback only) |

---

## 5. Deployment (do not mix up)

| Layer | Host | URL / how |
|-------|------|-----------|
| **Frontend** | **GitHub Pages** | https://p-cult.github.io/task/ · `node build-pages.cjs` → `p-cult/task` |
| **Middleware** | **Render.com** | https://param-task-middleware.onrender.com · `render.yaml` |
| **Data** | **Google Sheets** | Apps Script bridge; secrets only in Render env |

**Not homes:** Netlify address bar, “whole app on Render”, Codespace.  
**Local:** `./run.sh` → http://localhost:4300  

---

## 6. Repo map (clean layout)

```
MASTER.md SYSTEM.md AGENTS.md PLAN.md STATE.md START-HERE.md CLAUDE.md README.md
ESSENCE.md SEED.md          ← intent / Vinod joinery
six specs + admin-plugin    ← requirements detail
frontend/index.html         ← board UI source
middleware/                 ← API brain (roles, sync, queue, gemini, …)
middleware/admin/           ← reports plugin (removable)
apps-script/bridge.gs       ← thin bridge
build-pages.cjs render.yaml ← publish UI / host API
docs/AI-SESSION-TEMPLATE.md
_box/                       ← history only (never current truth)
```

---

## 7. Done looks like

- Right avatar and data for each profile — **server-enforced**  
- Non-P4 intake → **queue** → P4 → Task ID → sheets  
- Reports for stewards + owner; writes only for owner  
- Gemini helps reading mess; never skips the gate  
- Pages = face, Render = brain, Sheets = memory  
- Future AI reads MASTER + SYSTEM and stays on the rails  

## 8. Snapshot (19-Jul-2026)

| Area | State |
|------|--------|
| Roles | `roles.js` single authority |
| Queue | Non-P4 + kiosk + WhatsApp path |
| Reports | P3+P4 read; P4 write |
| Gemini | Context-aware fallback parser |
| Passwords | Plain text by design |
| Hardening | Auth-before-CSRF on gated writes; unknown projects rejected; no-op PATCH friendly |
| Live tests | `middleware/integration.live.test.js` (dev fixtures, all profiles) |
| User-sheet→system | Incomplete |
| WA update match | Can still duplicate |

*Behaviour: [SYSTEM.md](SYSTEM.md) · Rules: [AGENTS.md](AGENTS.md) · Todos: [PLAN.md](PLAN.md) · History: `_box/`*
