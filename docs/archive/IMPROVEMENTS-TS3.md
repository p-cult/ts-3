# IMPROVEMENTS-TS3.md — Why ts-3 will be better than ts-2

**Archived.** Canonical rebuild quality bar lives in root **[PLAN-CLEAN.md](../../PLAN-CLEAN.md)** (§0).  
This file is kept for history only.

Detail: [PLAN-CLEAN.md](../../PLAN-CLEAN.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md) · [CAPABILITIES-FROM-TS2.md](../../CAPABILITIES-FROM-TS2.md)

---

## The promise

Same **workplace power** (tasks, roles, sheets truth, later queue/intake/reports).  
Different **plumbing**: one birth hallway, thin control room, swappable store, fail loud.

---

## Key improvements

### 1. One create path forever
- **ts-2 pain:** dashboard, queue, journal, inbox, bulk import, user-sheet sync, pull — several ways to mint IDs → duplicates.  
- **ts-3:** every door calls **`mintTaskId` + `birthTask` only**. A second factory is a bug.

### 2. Architecture is code shape, not only docs
- Vehicle (user sheet) → depot (master) → mapping is how **birth** and **store partitions** work, even in memory fixtures.  
- Google becomes a **store adapter**, not a rewrite of the brain.

### 3. Thin control room modules
- **ts-2:** god `server.js` + god `datasource.js`.  
- **ts-3:** `domain/` · `store/` · `auth/` · `routes/` · optional `plugin/` · `intake/`.  
- HTTP handlers do not talk to Apps Script directly.

### 4. Roles stay pure and central
- One `roles` module owns P1–P4 and PATCH allow-lists.  
- UI only dresses `permissions` — never invents power.  
- **Canonical assignee key** (username / userSheet) — no “display name or sheet key” ambiguity.

### 5. Queue as a door, not a second product
- Enqueue **drafts without Task IDs**.  
- Approve **calls birthTask** — does not reimplement create.

### 6. Identity guard before multi-door chaos
- Create-time duplicate check is part of the spine (Slice 01+).  
- User-sheet listen and WhatsApp wait until this is real — no kill-switch lifestyle.

### 7. Fail loud in production
- No silent fallback to dev users/passwords when Sheets/bridge fails.  
- Errors are structured; live mode stays honest.

### 8. Plugins and repair tools stay on the side
- Reports = removable plugin.  
- Dedup / pull / reset = **repair kit**, not the daily create path.  
- Reports UI separated in plan from nuclear tools.

### 9. Extensibility without sprawl
- New channel = new **door** under `intake/` or a form route.  
- Extensibility test: same mint, same birth, server authz, slice + tests.

### 10. Rebuild discipline
- Slice docs + foundation tests + “built vs verified”.  
- ts-2 left running; no copy-paste debt by default.  
- Foundation already runnable (`./run.sh`, `npm test`).

---

## What we refuse to “improve” away

- Task ID as master key  
- User sheet birth / master depot authority  
- Middleware-only decisions  
- Frontend → middleware only  
- Four profiles, plain frugal stack, Pages + Render + Sheets homes  

Those are the product. ts-3 makes them **harder to violate**.

---

## One line

**ts-3 keeps Param’s power and laws; it replaces scar tissue with one birth hallway and a control room that stays thin as features grow.**
