#!/usr/bin/env bash
# sync.sh — smart portable-drive ↔ GitHub helper for ts-3
# Safe: no force push. Clear messages for non-experts.
# Usage: ./sync.sh
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(pwd)"

# --- pretty output (macOS / BSD friendly, no fancy deps) ---
say()  { printf '%s\n' "$*"; }
ok()   { printf '  ✓  %s\n' "$*"; }
warn() { printf '  !  %s\n' "$*"; }
err()  { printf '  ✗  %s\n' "$*"; }
hdr()  { printf '\n== %s ==\n' "$*"; }

ONLINE=0
STATUS_LINE="unknown"
ACTION_LINE="nothing yet"
BRANCH=""
REMOTE="origin"
REMOTE_URL=""

# --- 1) Internet check ---
check_online() {
  # Try multiple quick probes (macOS may block ICMP sometimes)
  if ping -c 1 -t 2 github.com >/dev/null 2>&1; then
    ONLINE=1
    return 0
  fi
  if ping -c 1 -t 2 1.1.1.1 >/dev/null 2>&1; then
    ONLINE=1
    return 0
  fi
  # TCP-ish fallback via git/http
  if command -v curl >/dev/null 2>&1; then
    if curl -sI --connect-timeout 3 https://github.com >/dev/null 2>&1; then
      ONLINE=1
      return 0
    fi
  fi
  ONLINE=0
  return 1
}

# --- 2) Git basics ---
require_git() {
  if ! command -v git >/dev/null 2>&1; then
    err "Git is not installed."
    say "    Install Git (Xcode CLT or https://git-scm.com), then re-run ./sync.sh"
    ACTION_LINE="install Git, then re-run ./sync.sh"
    return 1
  fi
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    err "This folder is not a Git repository yet."
    say "    Folder: $ROOT"
    say "    Next: connect ts-3 to GitHub once, then ./sync.sh will work."
    say "    Example (Vinod / setup person):"
    say "      cd \"$ROOT\""
    say "      git init"
    say "      git remote add origin <your-github-repo-url>"
    say "      git add -A && git commit -m \"initial ts-3\""
    say "      git branch -M main"
    say "      git push -u origin main"
    ACTION_LINE="initialize git + add GitHub remote (one-time)"
    STATUS_LINE="not a git repo"
    return 1
  fi
  return 0
}

current_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD"
}

has_remote() {
  git remote get-url "$REMOTE" >/dev/null 2>&1
}

# Compare local branch to origin/branch after fetch
# Sets: AHEAD BEHIND
compute_ahead_behind() {
  AHEAD=0
  BEHIND=0
  local upstream="${REMOTE}/${BRANCH}"
  if ! git rev-parse --verify "$upstream" >/dev/null 2>&1; then
    # No remote tracking ref yet
    AHEAD=-1
    BEHIND=-1
    return 0
  fi
  local counts
  counts="$(git rev-list --left-right --count "${upstream}...HEAD" 2>/dev/null || echo "0	0")"
  BEHIND="$(printf '%s' "$counts" | awk '{print $1}')"
  AHEAD="$(printf '%s' "$counts" | awk '{print $2}')"
}

sync_label() {
  if [ "${AHEAD:-0}" = "-1" ]; then
    STATUS_LINE="no remote branch yet (nothing on GitHub for this branch)"
    return
  fi
  if [ "${AHEAD}" -eq 0 ] && [ "${BEHIND}" -eq 0 ]; then
    STATUS_LINE="in sync with GitHub"
  elif [ "${AHEAD}" -gt 0 ] && [ "${BEHIND}" -eq 0 ]; then
    STATUS_LINE="ahead of GitHub by ${AHEAD} commit(s) — local work not pushed"
  elif [ "${AHEAD}" -eq 0 ] && [ "${BEHIND}" -gt 0 ]; then
    STATUS_LINE="behind GitHub by ${BEHIND} commit(s) — need pull"
  else
    STATUS_LINE="diverged: ahead ${AHEAD}, behind ${BEHIND} — needs careful merge"
  fi
}

working_tree_dirty() {
  # true if uncommitted changes
  [ -n "$(git status --porcelain 2>/dev/null || true)" ]
}

# --- main ---
hdr "ts-3 sync (portable drive ↔ GitHub)"
say "folder: $ROOT"

if check_online; then
  ok "Online — internet is available"
  NET="online"
else
  warn "Offline — no reliable internet right now"
  NET="offline"
fi

if ! require_git; then
  hdr "Status summary"
  say "  Network : $NET"
  say "  Git     : $STATUS_LINE"
  say "  Action  : $ACTION_LINE"
  say ""
  exit 1
fi

BRANCH="$(current_branch)"
ok "Git repo OK — branch: $BRANCH"

if ! has_remote; then
  err "No GitHub remote named '$REMOTE' is configured."
  say "    Add one:  git remote add origin <your-github-repo-url>"
  ACTION_LINE="add git remote 'origin'"
  STATUS_LINE="no remote"
  hdr "Status summary"
  say "  Network : $NET"
  say "  Branch  : $BRANCH"
  say "  Git     : $STATUS_LINE"
  say "  Action  : $ACTION_LINE"
  say ""
  exit 1
fi

REMOTE_URL="$(git remote get-url "$REMOTE")"
ok "Remote $REMOTE → $REMOTE_URL"

# ---------- OFFLINE path ----------
if [ "$ONLINE" -eq 0 ]; then
  # Best-effort local vs last-known remote refs (may be stale)
  compute_ahead_behind
  sync_label
  ACTION_LINE="work normally on the portable drive; run ./sync.sh again when online"
  hdr "Status summary"
  say "  Network : offline"
  say "  Branch  : $BRANCH"
  say "  Git     : $STATUS_LINE (last known — may be outdated while offline)"
  if working_tree_dirty; then
    say "  Working : you have uncommitted local changes (normal offline)"
  else
    say "  Working : clean (all changes committed, or no edits)"
  fi
  say "  Action  : $ACTION_LINE"
  say ""
  say "You are offline. Just work on this portable drive as usual."
  say "When you have internet again, run:  ./sync.sh"
  say ""
  exit 0
fi

# ---------- ONLINE path ----------
hdr "Fetching latest from GitHub"
if ! git fetch "$REMOTE" --prune; then
  err "Could not fetch from GitHub (auth or network glitch)."
  say "    Check login (gh auth / SSH keys) and try again."
  ACTION_LINE="fix GitHub auth, then re-run ./sync.sh"
  hdr "Status summary"
  say "  Network : online"
  say "  Branch  : $BRANCH"
  say "  Action  : $ACTION_LINE"
  exit 1
fi
ok "Fetch complete"

compute_ahead_behind
sync_label

# Pull if behind (and not diverged)
if [ "${BEHIND:-0}" -gt 0 ] && [ "${AHEAD:-0}" -eq 0 ]; then
  hdr "Updating local copy (pull)"
  if working_tree_dirty; then
    warn "You have uncommitted local changes."
    say "    Commit or stash them before pull is safe."
    say "    Suggested:"
    say "      git add -A && git commit -m \"wip: portable drive work\""
    say "      ./sync.sh"
    ACTION_LINE="commit local changes, then re-run ./sync.sh to pull"
  else
    # Fast-forward only — never invent a merge force story
    if git pull --ff-only "$REMOTE" "$BRANCH"; then
      ok "Pulled latest (fast-forward)"
      ACTION_LINE="pulled latest from GitHub"
      compute_ahead_behind
      sync_label
    else
      err "Fast-forward pull failed."
      say "    Branches may have diverged. Do not force-push."
      say "    Ask for help, or: git pull (review merge) carefully."
      ACTION_LINE="resolve pull carefully (no force push)"
    fi
  fi
elif [ "${BEHIND:-0}" -gt 0 ] && [ "${AHEAD:-0}" -gt 0 ]; then
  warn "Local and GitHub have different commits (diverged)."
  say "    This script will NOT force-push or auto-merge."
  say "    Next steps (careful):"
  say "      git status"
  say "      git log --oneline --left-right ${REMOTE}/${BRANCH}...HEAD"
  say "    Then merge or rebase with help if needed — never --force to main."
  ACTION_LINE="resolve divergence carefully (no force push)"
elif [ "${BEHIND:-0}" -eq 0 ] && [ "${AHEAD:-0}" -eq 0 ]; then
  ok "Already up to date with GitHub"
  ACTION_LINE="already in sync after fetch"
elif [ "${AHEAD:-0}" -lt 0 ]; then
  warn "This branch is not on GitHub yet."
  ACTION_LINE="push will create the remote branch (if you confirm)"
fi

# Push local commits if ahead
compute_ahead_behind
sync_label

if [ "${AHEAD:-0}" -gt 0 ] && [ "${BEHIND:-0}" -eq 0 ]; then
  hdr "Local commits not on GitHub yet"
  say "  You are ahead by ${AHEAD} commit(s)."
  git log --oneline "${REMOTE}/${BRANCH}..HEAD" 2>/dev/null | head -10 | sed 's/^/    /' || true
  if working_tree_dirty; then
    warn "Uncommitted changes exist — push will only send commits, not loose files."
    say "    Commit first if those edits should go to GitHub:"
    say "      git add -A && git commit -m \"describe your work\""
  fi
  # Interactive confirm on TTY; auto-push if SYNC_PUSH=1
  DO_PUSH=0
  if [ "${SYNC_PUSH:-}" = "1" ]; then
    DO_PUSH=1
  elif [ -t 0 ]; then
    printf '  Push these commits to GitHub now? [y/N] '
    read -r ans || ans=""
    case "$ans" in
      y|Y|yes|YES) DO_PUSH=1 ;;
      *) DO_PUSH=0 ;;
    esac
  else
    warn "Not a terminal — skip push (re-run interactively, or SYNC_PUSH=1 ./sync.sh)"
    ACTION_LINE="re-run ./sync.sh and answer y to push (or SYNC_PUSH=1)"
  fi

  if [ "$DO_PUSH" -eq 1 ]; then
    if git push "$REMOTE" "$BRANCH"; then
      ok "Pushed to GitHub safely (no force)"
      ACTION_LINE="pushed local commits to GitHub"
      git fetch "$REMOTE" --prune >/dev/null 2>&1 || true
      compute_ahead_behind
      sync_label
    else
      err "Push failed (permissions, network, or branch protection)."
      say "    No force-push was attempted. Fix access and try ./sync.sh again."
      ACTION_LINE="fix push access, then re-run ./sync.sh"
    fi
  else
    ACTION_LINE="local commits waiting — run ./sync.sh and choose y to push"
    warn "Push skipped — your work stays on the portable drive only for now"
  fi
elif [ "${AHEAD:-0}" -eq 0 ] && [ "${BEHIND:-0}" -eq 0 ]; then
  :
elif [ "${AHEAD:-0}" -lt 0 ]; then
  # No upstream branch — offer first push
  if [ -t 0 ] || [ "${SYNC_PUSH:-}" = "1" ]; then
    hdr "Publish branch to GitHub?"
    DO_PUSH=0
    if [ "${SYNC_PUSH:-}" = "1" ]; then
      DO_PUSH=1
    else
      printf '  No remote branch yet. Push "%s" to GitHub now? [y/N] ' "$BRANCH"
      read -r ans || ans=""
      case "$ans" in y|Y|yes|YES) DO_PUSH=1 ;; esac
    fi
    if [ "$DO_PUSH" -eq 1 ]; then
      if git push -u "$REMOTE" "$BRANCH"; then
        ok "Branch published on GitHub"
        ACTION_LINE="published branch to GitHub"
        compute_ahead_behind
        sync_label
      else
        err "Initial push failed"
        ACTION_LINE="fix remote permissions for first push"
      fi
    fi
  fi
fi

# Final dirty reminder
DIRTY_NOTE="clean"
if working_tree_dirty; then
  DIRTY_NOTE="uncommitted local changes present"
fi

hdr "Status summary"
say "  Network : online"
say "  Branch  : $BRANCH"
say "  Remote  : $REMOTE_URL"
say "  Git     : $STATUS_LINE"
say "  Working : $DIRTY_NOTE"
say "  Action  : $ACTION_LINE"
say ""
if [ "$DIRTY_NOTE" != "clean" ]; then
  say "Tip: commit your work so sync can push it next time:"
  say "  git add -A && git commit -m \"your message\""
  say "  ./sync.sh"
fi
say "Done."
say ""
