CLAUDE-GUIDE.md — Permanent instructions for any future Claude (or AI) session

Read this first, every session. It is the practical operating manual.

Core rule: MASTER.md + SYSTEM.md + AGENTS.md + **GIT-WORKFLOW.md** are the single source of truth. This file is the "how to do work" companion.

Git detail (remotes, offline, fresh clone, no force-push): **[GIT-WORKFLOW.md](GIT-WORKFLOW.md)**.

---

## 0. Session start ritual (always, ~2 minutes)

```bash
git pull origin main
git status
git log --oneline -8
```

Then open and read (in order):
1. MASTER.md — especially §0 (intent), §1 (hard laws), §6 (deploy homes)
2. SYSTEM.md — especially §1 (deploy map), §2 (behaviour)
3. GIT-WORKFLOW.md — if new machine, offline, or git looks messy
4. AGENTS.md — lanes, claims, protocol
5. PLAN.md — LIVE COORDINATION BOARD (claims + resume pointer)

Never start work without this ritual. Chat memory is disposable; these files + GitHub `main` are permanent.

---

## 1. How to run the app locally

**One command starts everything useful:**

```bash
./run.sh
```

What it does:
- Starts the middleware API on http://localhost:4300
- Serves the frontend HTML at the same origin for convenience
- Enables the kiosk form at http://localhost:4300/tasks

**Manual start (if you need to debug):**

Terminal A — middleware:
```bash
node middleware/server.js
# or with env overrides:
QUEUE_MODE=on INBOX_DRAIN=off node middleware/server.js
```

Terminal B — quick static preview (optional):
```bash
python3 -m http.server 8080 -d frontend
# then open http://localhost:8080
```

**What you will see**
- API root: http://localhost:4300 → JSON status
- Frontend: http://localhost:4300 (served by run.sh) or the static server
- Kiosk: http://localhost:4300/tasks

**Never** treat localhost as production. Production is Pages + Render.

---

## 2. How to test changes safely

**Before any edit**
- Read the relevant spec or code path.
- Run the test suites that touch your files:
  ```bash
  node middleware/*.test.js
  node middleware/admin/*.test.js
  ```
- Note which suites must stay green.

**During work**
- Make small, isolated changes.
- After each logical chunk, run the affected tests.
- Use `curl` or the browser dev tools to hit the local API and confirm behaviour.

**Example local verification loop**
```bash
node middleware/server.js &
sleep 1
curl -s http://localhost:4300/api/health | cat
# exercise your endpoint, check response
pkill -f "node middleware/server.js"
```

**Never** push to Render or Pages until local tests pass and you have verified in the browser.

---

## 3. When and how to commit / push

**Commit rules**
- Commit small and often (every logical unit of work); push `origin main` (GIT-WORKFLOW.md).
- Message describes the change, not the ticket number.
- One lane per commit when possible (see AGENTS.md lanes table).
- Never leave the tree dirty when handing off.

**Push rules (production surfaces)**

Frontend (index.html) → GitHub Pages
- The repo root `frontend/index.html` is the production file.
- Push to the default branch; GitHub Pages auto-deploys.
- After push, open https://p-cult.github.io/task/ in a private browser and verify.

Middleware (all `middleware/*.js`) → Render
- Push to the default branch; Render auto-deploys the `middleware/server.js` entry.
- After deploy, check Render logs for startup errors.
- Verify with curl against the live Render URL (Bearer token required for protected routes).

**Never** mix the two pushes in one commit. Frontend and middleware are separate deploy pipelines.

**Secret / env changes**
- Never commit secrets.
- Update via Render dashboard or local `.env` only.
- After changing env, restart the local server and re-test.

---

## 4. Always read MASTER.md and SYSTEM.md first

Every new or compacted session must open:
- MASTER.md (intent + deploy homes + profiles)
- SYSTEM.md (behaviour + deploy map)

If a handover, audit, or old chat contradicts these files → **MASTER wins**.

---

## 5. Never hallucinate deployment locations

**Canonical homes (do not invent alternatives)**

| Layer      | Host          | URL / place                              |
|------------|---------------|------------------------------------------|
| Frontend   | GitHub Pages  | https://p-cult.github.io/task/           |
| Middleware | Render.com    | https://param-task-middleware.onrender.com |
| Data       | Google Sheets | Drive folder `cult-automation` only      |

Forbidden stories:
- "Whole app on Render"
- Netlify as the product address bar
- Codespace as permanent home
- Frontend talks directly to Sheets / Apps Script

If a task seems to require a different host, stop and ask Vinod.

---

## 6. Be proactive in terminal and browser preview

**Vinod is a visual designer, not a programmer.** He hired you to do the work, not to propose menus.

**Always**
- Use the terminal: git, tests, `./run.sh`, curl, node.
- Start localhost and exercise the path you changed.
- Verify in the real surface (browser or curl) before claiming "works".
- Write decisions to files immediately (chat memory dies on restart).
- Commit small and often with honest messages; push so other sessions see it (GIT-WORKFLOW.md).

**Never**
- Narrate without acting.
- Say "done" without proof (command output, curl, browser screenshot).
- Dump five options and wait when one fix can ship.
- Skip tests after middleware changes.
- Leave the working tree dirty on handoff.

**Session end checklist**
- All tests green for files you touched.
- Claims cleared in PLAN.md.
- Resume pointer and last handoff written.
- Tree clean, committed, pushed if appropriate.

---

## 7. Quick reference commands

```bash
# Start everything locally
./run.sh

# Run all middleware tests
node middleware/*.test.js

# Run admin plugin tests only
node middleware/admin/*.test.js

# Quick API smoke test (local)
curl -s http://localhost:4300/api/health | cat

# Git hygiene
git status
git log --oneline -8
git diff --stat
```

---

End of CLAUDE-GUIDE.md. Re-read on every session start.