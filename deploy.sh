#!/usr/bin/env bash
# Deploy on the VPS. Run from the repo root: ./deploy.sh
#
# `docker compose up -d --build` builds BEFORE recreating the container, so a
# failed build leaves the running site untouched. Deploys fail safe.
set -euo pipefail
cd "$(dirname "$0")"

WEB_CHECK_URL="http://chinanki:80/"
WEB_CHECK_RETRIES=15
WEB_CHECK_DELAY=2

echo "==> Pulling"
# --ff-only: fail loudly on diverged local state rather than silently merging.
git pull --ff-only

echo "==> Tagging current image as rollback target"
# `docker image tag chinanki:latest chinanki:previous` MOVES the previous
# tag, so running this unconditionally on every deploy loses whatever
# chinanki:previous used to point at. If a later step in the same deploy
# fails, the untagged image is invisible and `docker image prune -f`
# permanently deletes it a few lines down. Only retag when it would actually
# preserve something new — i.e. chinanki:latest and chinanki:previous do not
# already resolve to the same image ID. Absent tags inspect to an empty
# string, so both "no previous deploy yet" and "no image at all" fall
# through safely to the tag/skip logic below.
latest_id="$(docker image inspect --format '{{.Id}}' chinanki:latest 2>/dev/null || true)"
previous_id="$(docker image inspect --format '{{.Id}}' chinanki:previous 2>/dev/null || true)"
if [ -z "$latest_id" ]; then
  echo "    (no chinanki:latest yet — first deploy, nothing to preserve)"
elif [ "$latest_id" = "$previous_id" ]; then
  echo "    (chinanki:previous already matches chinanki:latest — skipping retag)"
else
  docker image tag chinanki:latest chinanki:previous
fi

echo "==> Building and starting"
docker compose up -d --build

# `docker compose up -d` returns as soon as the container has STARTED, not
# once it's actually serving — a Caddyfile syntax error, a bad /srv copy, or
# a crash loop would all still leave this script printing "Done" while the
# site is down. Confirm reachability over the same `web` network and by the
# same hostname the box's central Caddy uses to reverse_proxy to us, so this
# also catches network/alias regressions, not just container-crash ones.
# This must run BEFORE the prune below: if it fails, `set -e` stops the
# script right here, so the untagged rollback-target image from the retag
# step above survives instead of being deleted.
echo "==> Verifying the site is reachable"
reachable=0
for _ in $(seq 1 "$WEB_CHECK_RETRIES"); do
  if docker run --rm --network web curlimages/curl:latest \
      -fsS -o /dev/null "$WEB_CHECK_URL" 2>/dev/null; then
    reachable=1
    break
  fi
  sleep "$WEB_CHECK_DELAY"
done
if [ "$reachable" -ne 1 ]; then
  echo "FAIL: chinanki did not become reachable at $WEB_CHECK_URL on the web network." >&2
  echo "      The new container is running but not serving — check 'docker logs chinanki'." >&2
  echo "      chinanki:previous is untouched; run ./rollback.sh to restore it." >&2
  exit 1
fi

echo "==> Pruning dangling images (this project only)"
# Global `docker image prune -f` would delete dangling images left behind by
# any project on this box (vaultwarden, gripsou, roadia, ...). Scope it to
# images built from this Dockerfile via the OCI title label.
docker image prune -f --filter "label=org.opencontainers.image.title=chinanki"

echo "==> Done. Deployed:"
git --no-pager log -1 --oneline
