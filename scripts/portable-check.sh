#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

failed=0

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    local version
    version="$("$1" --version 2>/dev/null)"
    echo "OK   $1: ${version%%$'\n'*}"
  else
    echo "MISS $1 — install it before continuing"
    failed=1
  fi
}

echo "ts-3 portable checkout"
echo "Path: $ROOT"
echo

check_command git
check_command node
check_command npm
check_command gh

echo
if [[ -f .env ]]; then
  echo "OK   .env is present locally (ignored by Git)"
else
  echo "WARN .env is missing — copy it securely from the previous setup"
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "OK   tracked working files are clean"
else
  echo "WARN tracked files have uncommitted changes"
fi

echo "Branch: $(git branch --show-current)"
echo "Remote: $(git remote get-url origin 2>/dev/null || echo missing)"

if command -v gh >/dev/null 2>&1 && gh auth status -h github.com >/dev/null 2>&1; then
  echo "OK   GitHub authentication is ready"
else
  echo "WARN GitHub login needed: gh auth login -h github.com"
fi

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo
echo "Ready. Open this folder in Cursor and continue."
