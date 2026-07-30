# GIT-WORKFLOW.md — How we use Git on this project

**For:** Vinod + every AI (Claude, Codex, Cursor, Grok, LM Studio, …)  
**Goal:** One truth on GitHub, safe offline work, easy sync, few conflicts.

---

## 1. The simple picture

```
                    GitHub (single source of truth)
                    ┌─────────────────────────────┐
                    │  main branch                │
                    │  vinod-gowda/…  +  p-cult/…  │
                    └─────────────▲───────────────┘
                                  │
                     git pull / git push
                                  │
                    ┌─────────────┴───────────────┐
                    │  Your Mac folder            │
                    │  (working copy only)        │
                    │  edit → commit → push       │
                    └─────────────────────────────┘
```

| What | Role |
|------|------|
| **GitHub `main`** | The real project. Always try to make this true. |
| **Local folder** | A working copy. Disposable if you can clone again. |
| **Chat / AI memory** | **Not** truth. If it disagrees with git + files, git wins. |
| **PLAN.md on main** | Shared short-term memory for humans + AIs. |

**Rule of thumb:** If it isn’t committed and pushed, it can vanish (laptop dies, wrong folder, AI session ends).

---

## 2. Repos and remotes (this project)

There are **two GitHub homes** that should stay on the same `main` commits:

| Remote name | URL | Purpose |
|-------------|-----|---------|
| **`origin`** | `https://github.com/vinod-gowda/param-task-system.git` | Primary (also pushes to p-cult — see below) |
| **`deploy`** | `https://github.com/p-cult/param-task-system.git` | Org copy (Render / team) |

On a healthy clone, `git remote -v` looks like:

```text
deploy  https://github.com/p-cult/param-task-system.git (fetch)
deploy  https://github.com/p-cult/param-task-system.git (push)
origin  https://github.com/vinod-gowda/param-task-system.git (fetch)
origin  https://github.com/vinod-gowda/param-task-system.git (push)
origin  https://github.com/p-cult/param-task-system.git (push)   ← optional second push URL
```

**Daily push command (preferred):**

```bash
git push origin main
```

That should update **both** GitHub repos when `origin` has two push URLs.  
If you’re unsure, also run:

```bash
git push deploy main
```

**Branch:** always work on **`main`** unless Vinod explicitly asks for a feature branch.

**Deploy after push (automatic):**

| What changed | What updates |
|--------------|--------------|
| `middleware/*` | Render API (auto on `main`) |
| `frontend/*` + pages build | GitHub Pages (via usual Pages pipeline / `build-pages.cjs` when used) |
| `apps-script/bridge.gs` | **Not** automatic — paste + **New version** in Apps Script (see DEPLOY-SAVE-SPEED.md) |

---

## 3. Daily commands (online)

Do these from the project folder (the one that contains `MASTER.md`).

### Morning / start of session (30 seconds)

```bash
cd /path/to/param/ts-2          # your local project folder
git pull origin main
git status
git log --oneline -8
```

Then open **PLAN.md** (ACTIVE CLAIMS + RESUME POINTER).

### While working

```bash
# see what changed
git status
git diff

# save often (small commits)
git add -A
git commit -m "short honest description of what changed"

# share with GitHub + other AIs
git push origin main
```

### End of session

```bash
git status                      # should be clean
git push origin main            # if you have commits not pushed
```

Update PLAN.md handoff (claim cleared, RESUME POINTER, LAST HANDOFF), commit, push.

### “Did everything land?”

```bash
git status                      # clean, "up to date with origin/main"
git log --oneline -3
git ls-remote origin main       # remote tip should match your latest commit
```

---

## 4. Offline work (no internet)

You can still edit and commit. You **cannot** pull/push until you’re back online.

```bash
# work normally
git add -A
git commit -m "offline: what you did"

# when internet returns
git pull origin main            # get others' work first
# fix conflicts if any (see §6)
git push origin main
```

**Tips offline:**

- Commit more often (each commit is a save-point on disk).
- Don’t start a second clone and edit both — you’ll double the merge pain.
- Write decisions into files (`PLAN.md`, code), not only chat.

---

## 5. Local folder missing or broken — clone fresh

GitHub still has the project. The Mac folder is replaceable.

### A. Clone (first time or “start over”)

```bash
cd ~/Projects                   # or wherever you keep code
git clone https://github.com/vinod-gowda/param-task-system.git ts-2
cd ts-2
```

Optional: add the org remote and mirror push setup:

```bash
git remote add deploy https://github.com/p-cult/param-task-system.git
# Optional: push to both with one command
git remote set-url --add --push origin https://github.com/vinod-gowda/param-task-system.git
git remote set-url --add --push origin https://github.com/p-cult/param-task-system.git
```

### B. Secrets (not in git)

Copy a local `.env` from your backup or password manager.  
**Never commit `.env`.** It holds `SESSION_SECRET`, bridge tokens, etc.

```bash
# example only — use your real values
cp /path/to/safe-backup/.env .env
```

### C. Run locally

```bash
./run.sh
# or: set -a; source .env; set +a; node middleware/server.js
```

### D. Point AI tools at the new folder

In Claude / Cursor / Codex: open **this** folder as the project root  
(the directory that contains `MASTER.md` + `AGENTS.md`).

### E. Old folder still exists?

1. In the **old** folder: `git status` — commit anything worth keeping, `git push`.  
2. Only then delete or archive the old folder.  
3. Use the new clone going forward.

---

## 6. Avoiding conflicts (humans + many AIs)

Conflicts happen when two people/tools edit the **same lines** without pulling.

### Prevention (best)

1. **Always `git pull` before you start.**  
2. **Claim your lane in PLAN.md** (ACTIVE CLAIMS), commit + push the claim.  
3. **One lane per tool** (see AGENTS.md):  
   - A Frontend → `frontend/index.html`  
   - B Middleware → `middleware/*.js`  
   - C Bridge/Google → `apps-script/*` + Sheets (Claude+Vinod only)  
   - D Tests → `*.test.js`  
4. **Small commits, push often** — unpushed work is invisible to others.  
5. **Don’t rewrite history on `main`** (`git push --force` to main is forbidden unless Vinod orders it).

### If `git pull` reports a conflict

```bash
git status                      # lists conflicted files
# open each file; look for <<<<<<< ======= >>>>>>>
# keep the correct code; delete conflict markers
git add <fixed-files>
git commit -m "merge: resolve conflict on <topic>"
git push origin main
```

If you’re unsure which side is right: **prefer GitHub’s latest + re-apply your small change**, or ask Vinod before deleting someone else’s work.

### Never do these on `main`

```bash
git push --force origin main    # NO — rewrites shared history
git reset --hard origin/main    # only if you accept LOSING all local uncommitted work
```

Safe “throw away my local mess and match GitHub”:

```bash
git fetch origin
git checkout main
git reset --hard origin/main    # destroys uncommitted AND unpushed local commits
git clean -fd                   # removes untracked files — double-check first
```

---

## 7. Workflow for AIs (Claude and friends)

Every session, in order:

```text
1. cd to project root (folder with MASTER.md)
2. git pull origin main
3. Read PLAN.md board (claims + resume pointer)
4. git status && git log --oneline -8
5. Claim lane in PLAN.md → commit → push
6. Do the work (only claimed files)
7. Run tests (middleware unit suites at minimum)
8. Commit with a clear message
9. git push origin main
10. Update PLAN handoff → commit → push
11. Leave git status clean
```

### Commit messages (good enough)

```text
fix: login trim + sheet password authority
feat: user-sheet scan on poll
docs: PLAN handoff — save-speed live
claim: lane B middleware save path
```

### What AIs must not treat as source of truth

- Previous chat transcripts  
- Stale handovers under `_box/`  
- Uncommitted local edits on another machine  

**Truth order:** MASTER.md → specs → AGENTS.md → **git `main`** → PLAN.md → running code you just tested.

### Parallel AIs

- Two tools must not claim the same files.  
- If a file is claimed, pick other work or wait.  
- Git + PLAN.md beat “I thought the other chat finished it.”

---

## 8. Vinod cheat sheet (print this)

| When | Do this |
|------|---------|
| Start work | `git pull` → read PLAN.md |
| Finished a chunk | `git add -A` → `git commit -m "…"` → `git push` |
| Going offline | Commit first; push when back |
| New computer / lost folder | Clone from GitHub (§5), restore `.env` |
| AI says “done” | `git status` clean? pushed? PLAN updated? |
| Site broken after push | Check Render deploy + Pages; don’t panic-force-push |
| Two versions disagree | GitHub `main` wins; re-clone if local is chaos |

---

## 9. Quick health check

```bash
git rev-parse --show-toplevel   # should be …/ts-2 (or your clone name)
test -f MASTER.md && test -f AGENTS.md && echo "right folder"
git status -sb
git remote -v
git log --oneline -5
```

All good when:

- You’re on `main`  
- `git status` is clean  
- `main...origin/main` with no “ahead/behind”  
- Remotes point at vinod-gowda + p-cult param-task-system  

---

## 10. Related docs

| File | What it’s for |
|------|----------------|
| [PLAN.md](PLAN.md) | Live claims + handoff (multi-AI coordination) |
| [AGENTS.md](AGENTS.md) | Lanes, hard laws, who may touch what |
| [SYSTEM.md](SYSTEM.md) | AI behaviour law |
| [CLAUDE-GUIDE.md](CLAUDE-GUIDE.md) | Local run, test, deploy homes |
| [MASTER.md](MASTER.md) | Product + deploy truth |
| [DEPLOY-SAVE-SPEED.md](DEPLOY-SAVE-SPEED.md) | Apps Script deploy (not git-only) |

---

*If this file and an old chat disagree → follow this file + GitHub `main`.*
