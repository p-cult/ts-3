# SYNC.md — portable drive ↔ GitHub

**Command:** from the ts-3 folder:

```bash
./sync.sh
```

For moving between machines on a portable drive without losing work or fighting Git.

## What it does

1. Checks if you are **online** or **offline**.  
2. **Online**
   - `git fetch` from GitHub  
   - **Pull** latest if you are behind (fast-forward only — safe)  
   - If you have **local commits** not on GitHub, shows them and asks before **push**  
3. **Offline**
   - Clear message: work normally on the drive; run `./sync.sh` again when online  
4. Always prints a short **status summary**
   - Network  
   - Ahead / behind / in sync  
   - What was done or what to do next  

## Safety

- **No force push** (`--force` is never used).  
- Pull uses **fast-forward only** when possible.  
- If histories **diverged**, it stops and explains — does not auto-merge messily.  
- Uncommitted files are reported; commit them before they can be pushed.

## Typical day

```text
Plug in drive
  ./sync.sh          ← get latest if online
  … work …
  git add -A && git commit -m "what I did"
  ./sync.sh          ← push when online (answer y)
```

## Optional

```bash
SYNC_PUSH=1 ./sync.sh    # push without asking (still no force)
```

## One-time setup (if not a git repo yet)

ts-3 must be a Git repository with remote `origin`:

```bash
cd /path/to/ts-3
git init
git remote add origin <your-github-repo-url>
git add -A && git commit -m "initial ts-3"
git branch -M main
git push -u origin main
```

Then `./sync.sh` works every day.

## Notes

- Does **not** touch **ts-2**.  
- Does **not** replace planning docs or foundation.  
- Broader git habits (if needed): [archive/GIT-WORKFLOW.md](archive/GIT-WORKFLOW.md).
