#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/Biglone/workspace/todo-harbor}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-master}"

cd "$REPO_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[todo-harbor:auto-deploy] local tracked changes detected, skip deploy"
  exit 0
fi

git fetch --prune "$REMOTE_NAME" "$BRANCH_NAME"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  echo "[todo-harbor:auto-deploy] already up to date ($LOCAL_SHA)"
  exit 0
fi

if git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA"; then
  echo "[todo-harbor:auto-deploy] local branch is ahead of remote, skip deploy"
  exit 0
fi

if ! git merge-base --is-ancestor "$LOCAL_SHA" "$REMOTE_SHA"; then
  echo "[todo-harbor:auto-deploy] local and remote history diverged, skip deploy"
  exit 0
fi

echo "[todo-harbor:auto-deploy] updating $LOCAL_SHA -> $REMOTE_SHA"
for attempt in 1 2 3; do
  if git pull --ff-only "$REMOTE_NAME" "$BRANCH_NAME"; then
    break
  fi
  if [[ "$attempt" -eq 3 ]]; then
    echo "[todo-harbor:auto-deploy] pull failed after retries"
    exit 1
  fi
  sleep 2
done
docker compose up -d --build --remove-orphans
echo "[todo-harbor:auto-deploy] deploy completed at $(date -Iseconds)"
