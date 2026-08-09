#!/usr/bin/env bash
# Deploy on the VPS. Run from the repo root: ./deploy.sh
#
# `docker compose up -d --build` builds BEFORE recreating the container, so a
# failed build leaves the running site untouched. Deploys fail safe.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pulling"
# --ff-only: fail loudly on diverged local state rather than silently merging.
git pull --ff-only

echo "==> Tagging current image as rollback target"
docker image tag chinanki:latest chinanki:previous 2>/dev/null \
  || echo "    (no existing image — first deploy)"

echo "==> Building and starting"
docker compose up -d --build

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Done. Deployed:"
git --no-pager log -1 --oneline
