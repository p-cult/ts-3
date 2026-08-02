# Publish Pages UI (`p-cult/task`)

Bake lives in this repo; production UI is **`https://p-cult.github.io/task/`**.

## One-shot bake

```bash
cd /Volumes/bkp-01/0proj/code/param/ts-3
npm run build:pages
# → dist/index.html  (API → https://param-task-middleware.onrender.com)
```

Optional override:

```bash
API_ORIGIN=https://param-task-middleware.onrender.com npm run build:pages
```

A copy from the 2026-08-02 backup is also at:

`param/_cutover-backup-20260802-200747/ts3-pages-dist/index.html`

## Publish (needs GitHub auth)

`gh` on this machine currently reports an **invalid keyring token** for `p-cult`. Fix first:

```bash
gh auth refresh -h github.com
# or: gh auth login -h github.com
```

Then either:

### A — helper script (clone + commit + push)

```bash
cd /Volumes/bkp-01/0proj/code/param/ts-3
./scripts/publish-pages.sh
```

### B — manual

```bash
git clone git@github.com:p-cult/task.git /tmp/p-cult-task
cp dist/index.html /tmp/p-cult-task/index.html
cd /tmp/p-cult-task
git checkout -b ts3-cutover-$(date +%Y%m%d)   # preferred: review branch first
git add index.html
git commit -m "ts-3 bake: Pages UI → Render API"
git push -u origin HEAD
gh pr create --title "ts-3 cutover bake" --body "Replaces ts-2 baked UI with ts-3 dist/index.html"
# After review: merge to the branch GitHub Pages serves (usually main)
```

**Do not merge to live Pages until Render is on ts-3 sole-writer** (or you will hit a live API that still behaves like ts-2 / wrong CORS).

## Staging order (safe)

1. Publish bake to a **non-default** branch or temporary Pages project if available.  
2. Private-window login against that UI → Render (after Render env twin is ready).  
3. At Phase 6 T3: merge/publish to the URL users already bookmark.

## Verify after publish

- Private window → `https://p-cult.github.io/task/`  
- No fixture passwords on login dialog  
- No permanent STAGING badge when API is `APP_MODE=production`  
- Login with Master username (e.g. Vinod)  
- Board loads; one create only after sole-writer is on
