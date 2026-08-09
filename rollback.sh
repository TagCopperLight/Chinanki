#!/usr/bin/env bash
# Restore the previous image on the VPS. Run from the repo root: ./rollback.sh
#
# Retags rather than rebuilding, so recovery takes seconds instead of the
# several minutes a full rebuild costs — which matters when the site is broken.
# Note this restores the previous IMAGE, not the previous commit: run
# `git checkout <sha>` afterwards if you want the working tree to match.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker image inspect chinanki:last-good >/dev/null 2>&1; then
  echo "No chinanki:last-good image to roll back to." >&2
  exit 1
fi

echo "==> Restoring last known-good image"
docker image tag chinanki:last-good chinanki:latest
docker compose up -d --no-build

echo "==> Rolled back. Running image:"
docker image inspect chinanki:latest --format '{{.Id}}  created {{.Created}}'

# After this, chinanki:latest and chinanki:last-good point at the same image
# ID — there is nothing left to fall back to. If this rolled-back image also
# turns out to be bad, rollback.sh has no further target; you'll need to fix
# forward or restore from a rebuild/older git commit.
echo
echo "WARNING: chinanki:last-good now equals chinanki:latest."
echo "         There is no further rollback target — a second bad deploy"
echo "         cannot be undone with this script. Fix forward or rebuild"
echo "         an older commit if this image is also broken."
