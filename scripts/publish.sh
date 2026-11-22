#!/usr/bin/env bash
# Build the site and publish deploy/ to the `live` branch.
# Hostinger auto-deploys the `live` branch to theleonidatracker.com.
# Usage: bash scripts/publish.sh "Short description of today's update"
set -euo pipefail
MSG="${1:-Site update}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"

node "$ROOT/scripts/build.js"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if git ls-remote --exit-code --heads "$REMOTE" live >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch live "$REMOTE" "$TMP"
else
  git init --quiet "$TMP"
  git -C "$TMP" checkout --quiet --orphan live
  git -C "$TMP" remote add origin "$REMOTE"
fi
git -C "$TMP" config user.name "$(git -C "$ROOT" config user.name || echo Claude)"
git -C "$TMP" config user.email "$(git -C "$ROOT" config user.email || echo noreply@anthropic.com)"

# Replace everything except .git with the fresh build
find "$TMP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$ROOT/deploy/." "$TMP/"

git -C "$TMP" add -A
if git -C "$TMP" diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi
git -C "$TMP" commit --quiet -m "$MSG"
git -C "$TMP" -c push.negotiate=true push --quiet -u origin live
echo "Published to live: $MSG"
