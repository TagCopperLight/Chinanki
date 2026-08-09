#!/usr/bin/env bash
# Restore the previous image on the VPS. Run from the repo root: ./rollback.sh
#
# Retags rather than rebuilding, so recovery takes seconds instead of the
# several minutes a full rebuild costs — which matters when the site is broken.
# Note this restores the previous IMAGE, not the previous commit: run
# `git checkout <sha>` afterwards if you want the working tree to match.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker image inspect chinanki:previous >/dev/null 2>&1; then
  echo "No chinanki:previous image to roll back to." >&2
  exit 1
fi

echo "==> Restoring previous image"
docker image tag chinanki:previous chinanki:latest
docker compose up -d --no-build

echo "==> Rolled back. Running image:"
docker image inspect chinanki:latest --format '{{.Id}}  created {{.Created}}'
