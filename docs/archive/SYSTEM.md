# SYSTEM.md — How any AI must work on this project

*Permanent operating law. Read after MASTER.md. Violating this wastes Vinod's
time and trust. Claude, Codex, Cursor, Grok, LM Studio, and every future model
must follow it.*

**See also:**  
- [GIT-WORKFLOW.md](GIT-WORKFLOW.md) — GitHub is source of truth; pull/push; offline; fresh clone; multi-AI git habits.  
- [CLAUDE-GUIDE.md](CLAUDE-GUIDE.md) — step-by-step local run, test, commit, push workflow.

---

## 0. Truth hierarchy (when docs disagree)

1. **MASTER.md** — **intent**, architecture, profiles, deploy, repo map  
2. **The six core specs + admin-plugin.md** — detailed requirements (what)  
3. **AGENTS.md** — hard laws + lanes + how to work with Vinod  
4. **PLAN.md** — live to-do only (not architecture)  
5. **Code that is running + tests you just ran** — reality check  

If a handover, audit, `_box/`, or chat memory contradicts MASTER.md → **MASTER wins**.  
If you are about to invent a host, URL, or "whole app on X" → **stop; open MASTER §5** and **CLAUDE-GUIDE.md §5**. Never hallucinate deployment locations.
True intent is MASTER §0 — every feature must serve effortless continuous work + thin plumbing.

---

## 1. Full context you must hold (never drop)

### Deploy homes (canonical — do not hallucinate alternatives)

| Layer | Host | URL / place |
|-------|------|-------------|
| **Frontend** | **GitHub Pages** | https://p-cult.github.io/task/ |
| **Middleware** | **Render.com** | https://param-task-middleware.onrender.com |
| **Data** | **Google Sheets** via Apps Script | Drive folder `cult-automation` only |

```
Browser → GitHub Pages (static UI)
              ↓ /api/* cross-origin
         Render (Node middleware — ALL business logic)
              ↓ bridge only
         Apps Script → Google Sheets (master = truth)
```

**Forbidden confusions (historical, wrong):**

- “Whole app on Render”  
- Netlify as the product address bar  
- Codespace as permanent home  
- Frontend talks to Sheets / Apps Script  
- Baking a new deploy plan without Vinod  

**Local only:** `./run.sh` → http://localhost:4300 (API + HTML for convenience).  
**Kiosk exception:** `/tasks` form may be served on the Render host; main UI stays Pages.

### Stack laws (from MASTER / AGENTS)

- All business logic in middleware (`middleware/`, especially `roles.js`)  
- Apps Script = thin bridge only  
- Master sheet wins conflicts  
- Tasks born in user sheets; Task ID is proof of existence  
- Classification P4-only on the board; reports P3+P4 via admin plugin  
- **Passwords stay plain text** in the master Users tab — personal-scale app.  
  **Do not add hashing, OAuth, or “enterprise” auth unless Vinod asks.**

### Roles (quick)

P1 Public · P2 User (own data) · P3 Moderator (status + read reports) · P4 Super Admin  

Gates: `middleware/roles.js` + `middleware/admin/access.js`.

---

## 2. How you behave (proactive, not performative)

Vinod is a **visual designer, not a programmer**. He hired you to **do the work**.

### Always

1. **Read before acting:** MASTER.md → relevant spec or code → PLAN board if claiming work.  
2. **Act, don’t propose a menu.** Pick the best path, implement, show proof.  
3. **Use the terminal.** `git status`, tests, `./run.sh` or `node middleware/server.js`, curl APIs.  
4. **Verify in the real surface** when you can: localhost browser, curl to local API, or live URL — not “should work.”  
5. **Commit small and often** with honest messages (save-points); **push to `origin main`** (GIT-WORKFLOW.md). Unpushed work is invisible to other AIs and machines.  
6. **Write decisions to files** the moment they’re made. Chat memory dies.  
7. **Stay in your lane** (AGENTS.md). Don’t edit claimed files or Google without authority.  
8. **Plain language** to Vinod. No jargon wall. Lead with the answer.  
9. **GitHub `main` is the project.** Local folder is a copy. No force-push to main. Fresh clone is always allowed (GIT-WORKFLOW §5).

### Never

1. Never invent deploy homes or “temporary” hosting stories.  
2. Never say “done” without saying **built** vs **verified** and how you know.  
3. Never dump five options and wait when you could ship one fix.  
4. Never add frameworks, password hashing, or heavy deps “for best practice.”  
5. Never edit core specs to match broken code — fix the code.  
6. Never skip tests after middleware changes:  
   `node middleware/*.test.js` and `node middleware/admin/*.test.js` as relevant.  
7. Never leave the tree dirty when handing off — clear PLAN claims, commit.

### Session start checklist (≈2 minutes)

```text
1. git pull origin main && git status && git log --oneline -8  (full ritual: GIT-WORKFLOW.md §3 / §7)
2. Read MASTER.md (especially §6 deploy + profiles)
3. Skim PLAN.md LIVE COORDINATION BOARD (claims + resume pointer)
4. Read SYSTEM.md (this file) if you are a new or compacted session
5. Run the test suites you will touch before claiming “green”
6. If UI work: start localhost and exercise the path you changed
```

### When you feel lost

Re-read MASTER.md §1–3 and §6. Do **not** improvise architecture from memory.

---

## 3. Doc map (what to open, what to ignore)

### Living (root — keep current)

| File | Use |
|------|-----|
| **MASTER.md** | Main guide — intent, roles, comms, deploy, snapshot |
| **SYSTEM.md** | This file — AI operating law |
| **AGENTS.md** | Hard laws, lanes, Vinod joinery |
| **PLAN.md** | Live todos only |
| **README.md** | Human door |
| ESSENCE.md / SEED.md | Who Vinod is / north star |
| Six specs + admin-plugin.md + acceptance-tests.md | Requirements |
| STATE.md | One-page “where we are” |
| SHORTCUT-IMPORT.md / KEEP-ALIVE.md | Ops recipes |
| IDEAS.md | Parking lot |

### History (do not treat as current architecture)

Anything under `_box/` — including boxed audits and handovers.  
Useful for archaeology; **not** for deploy or role truth.

---

## 4. Proof language

| Say | When |
|-----|------|
| **Built — not verified** | Code landed, no run/browser check yet |
| **Verified: …** | You ran X and saw Y (command, URL, status code) |
| **Blocked: …** | Need Vinod (secret, Google click, product choice) |

Never: “Should be fine”, “Probably deployed”, “On Render the UI is…”

---

## 5. One-line oath

**MASTER.md is the map. Render is the API. GitHub Pages is the UI. Sheets hold the data. I do the work in the terminal and prove it — I don’t narrate and I don’t invent homes.**
