#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/Biglone/workspace/todo-harbor}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
BRANCH_NAME="${BRANCH_NAME:-master}"
STATE_DIR="${STATE_DIR:-$REPO_DIR/.deploy-state}"
LAST_DEPLOY_FILE="$STATE_DIR/last_deployed_sha"

cd "$REPO_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[todo-harbor:auto-deploy] local tracked changes detected, skip deploy"
  exit 0
fi

git fetch --prune "$REMOTE_NAME" "$BRANCH_NAME"

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE_NAME/$BRANCH_NAME")"

SYNCED_WITH_REMOTE=true

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  echo "[todo-harbor:auto-deploy] repository synced with remote ($LOCAL_SHA)"
elif git merge-base --is-ancestor "$LOCAL_SHA" "$REMOTE_SHA"; then
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
elif git merge-base --is-ancestor "$REMOTE_SHA" "$LOCAL_SHA"; then
  echo "[todo-harbor:auto-deploy] local branch is ahead of remote, skip deploy"
  SYNCED_WITH_REMOTE=false
else
  echo "[todo-harbor:auto-deploy] local and remote history diverged, skip deploy"
  SYNCED_WITH_REMOTE=false
fi

if [[ "$SYNCED_WITH_REMOTE" != "true" ]]; then
  exit 0
fi

TARGET_SHA="$(git rev-parse HEAD)"
mkdir -p "$STATE_DIR"

LAST_DEPLOY_SHA=""
if [[ -f "$LAST_DEPLOY_FILE" ]]; then
  LAST_DEPLOY_SHA="$(tr -d '\n' < "$LAST_DEPLOY_FILE")"
fi

if [[ "$TARGET_SHA" == "$LAST_DEPLOY_SHA" ]]; then
  echo "[todo-harbor:auto-deploy] already deployed ($TARGET_SHA)"
  exit 0
fi

echo "[todo-harbor:auto-deploy] deploying commit $TARGET_SHA"
docker compose up -d --build --remove-orphans
printf '%s' "$TARGET_SHA" > "$LAST_DEPLOY_FILE"
echo "[todo-harbor:auto-deploy] deploy completed at $(date -Iseconds)"
