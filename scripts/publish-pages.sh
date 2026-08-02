#!/usr/bin/env bash
# Bake + push ts-3 frontend to p-cult/task (GitHub Pages).
# Requires: gh auth OK, git write access to p-cult/task.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${PAGES_BRANCH:-ts3-cutover-$(date +%Y%m%d)}"
CLONE="${PAGES_CLONE:-/tmp/p-cult-task-$$}"
# Prefer HTTPS — matches `gh` keyring auth (SSH host keys often missing).
REMOTE="${PAGES_REMOTE:-https://github.com/p-cult/task.git}"

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "ERROR: GitHub auth failed. Run: gh auth refresh -h github.com"
  exit 1
fi

echo "== bake =="
npm run build:pages
test -f dist/index.html

echo "== clone $REMOTE → $CLONE =="
rm -rf "$CLONE"
git clone "$REMOTE" "$CLONE"
cd "$CLONE"
git checkout -b "$BRANCH"

cp "$ROOT/dist/index.html" ./index.html
git add index.html
git status
git commit -m "ts-3 Pages bake → param-task-middleware (cutover)"

echo "== push $BRANCH =="
git push -u origin HEAD

if command -v gh >/dev/null; then
  gh pr create --title "ts-3 cutover: bake Pages UI" --body "$(cat <<'EOF'
## Summary
- Replace Pages `index.html` with ts-3 `npm run build:pages` output
- API origin: `https://param-task-middleware.onrender.com`
- Fixture login passwords stripped; STAGING badge gated by health

## Test plan
- [ ] Private window load
- [ ] Login with Master user (not fixture hints)
- [ ] Board hydrates
- [ ] Merge only when Render is ready for sole-writer (or staging API)

EOF
)" || echo "(PR create skipped — open manually)"
fi

echo "Done. Clone left at $CLONE"
echo "Merge only when Render cutover is ready — see docs/PUBLISH-PAGES.md"
