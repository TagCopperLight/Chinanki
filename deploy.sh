#!/usr/bin/env bash
# Deploy on the VPS. Run from the repo root: ./deploy.sh
#
# `docker compose up -d --build` builds BEFORE recreating the container, so a
# failed build leaves the running site untouched. Deploys fail safe.
#
# The rollback target (chinanki:last-good) is verification-gated: it is only
# ever moved onto an image that this script has proven reachable. See the
# comments below for the two checks that guarantee that.
set -euo pipefail
cd "$(dirname "$0")"

WEB_CHECK_URL="http://chinanki:80/"
WEB_CHECK_RETRIES=15
WEB_CHECK_DELAY=2

# Probe reachability over the `web` network, by the same hostname the box's
# central Caddy uses to reverse_proxy to us. With retries=1 this is a single
# quick check of whatever is running right now; with more retries it
# tolerates the few seconds a freshly (re)started container needs to come up.
check_reachable() {
  local retries="$1" i
  for i in $(seq 1 "$retries"); do
    if docker run --rm --network web curlimages/curl:latest \
        -fsS -o /dev/null "$WEB_CHECK_URL" 2>/dev/null; then
      return 0
    fi
    [ "$i" -lt "$retries" ] && sleep "$WEB_CHECK_DELAY"
  done
  return 1
}

echo "==> Pulling"
# --ff-only: fail loudly on diverged local state rather than silently merging.
git pull --ff-only

echo "==> Checking outgoing image"
# This is the image `up --build` is about to replace. It only becomes the
# new rollback target (chinanki:last-good) if BOTH of these hold:
#
#   (a) it is itself serving correctly RIGHT NOW, checked below, before
#       anything is touched, and
#   (b) the new deployment we're about to build also verifies (checked
#       further down, after `up --build`).
#
# (a) is not redundant with (b). `docker compose up -d --build` retags
# chinanki:latest to the freshly built image as soon as the build succeeds —
# regardless of whether the container ends up serving anything. So after a
# failed deploy, chinanki:latest is left pointing at the broken image. If the
# operator fixes the problem and reruns ./deploy.sh, and this new attempt
# happens to succeed, a scheme that only checked (b) would capture that
# still-broken image as "outgoing" and promote it straight into
# chinanki:last-good the moment the retry succeeds — silently reintroducing
# the exact "rollback target is worthless" failure mode this script exists
# to prevent, just one retry later. Requiring the outgoing image to be
# reachable right now closes that: a currently-broken chinanki:latest can
# never become the rollback target, no matter how many times the deploy is
# retried. chinanki:last-good only ever advances to an image that both
# demonstrably worked before this run AND was cleanly superseded by one that
# demonstrably works now.
outgoing_id="$(docker image inspect --format '{{.Id}}' chinanki:latest 2>/dev/null || true)"
outgoing_trustworthy=0
if [ -z "$outgoing_id" ]; then
  echo "    (no chinanki:latest yet — first deploy, nothing to preserve)"
elif check_reachable 1; then
  outgoing_trustworthy=1
else
  echo "    (chinanki:latest is not currently serving — it will not become"
  echo "     the rollback target even if this deploy succeeds)"
fi

# `docker image tag chinanki:latest chinanki:latest` (i.e. rebuilding "in
# place") is what `up --build` does next, and on this engine that MOVES the
# chinanki:latest tag onto the new image and immediately deletes the old,
# now-untagged one — it does not linger as a reclaimable dangling image the
# way it would on the classic overlay2 graphdriver. So the outgoing image
# has to be protected by a tag of its own *before* the build touches
# chinanki:latest, or it will be gone by the time we try to record it below.
# chinanki:staging is a disposable holding tag for exactly that: it only
# ever exists for the duration of one deploy run and is always removed by
# the trap on exit, whether this run succeeds, fails, or is interrupted.
trap 'docker rmi chinanki:staging >/dev/null 2>&1 || true' EXIT
if [ "$outgoing_trustworthy" -eq 1 ]; then
  docker image tag "$outgoing_id" chinanki:staging
fi

echo "==> Building and starting"
docker compose up -d --build

# `docker compose up -d` returns as soon as the container has STARTED, not
# once it's actually serving — a Caddyfile syntax error, a bad /srv copy, or
# a crash loop would all still leave this script printing "Done" while the
# site is down. This must run BEFORE the last-good update below: if it fails,
# `set -e` stops the script right here, so chinanki:last-good is left exactly
# as it was.
echo "==> Verifying the site is reachable"
if ! check_reachable "$WEB_CHECK_RETRIES"; then
  echo "FAIL: chinanki did not become reachable at $WEB_CHECK_URL on the web network." >&2
  echo "      The new container is running but not serving — check 'docker logs chinanki'." >&2
  echo "      chinanki:last-good is untouched; run ./rollback.sh to restore it." >&2
  exit 1
fi

if [ "$outgoing_trustworthy" -eq 1 ]; then
  echo "==> Recording verified-good rollback target"
  docker image tag chinanki:staging chinanki:last-good
fi

# Deliberately NO image pruning here.
#
# This box is shared with other services, including a password manager. Every
# command in this script is scoped to a `chinanki:*` tag or to the single
# service in compose.yaml — nothing here can reach another project's images,
# containers, volumes or networks.
#
# An automatic `docker image prune` would be the one exception: a destructive
# command whose blast radius depends on a filter staying correct forever. It
# was scoped by an OCI label, but that label is INHERITED from caddy:2-alpine
# and merely overridden by our Dockerfile — one careless edit away from
# matching every Caddy-derived image on the host, including the central proxy.
# Reclaiming a little disk is not worth that, so cleanup is manual and opt-in.
# See the README for a scoped cleanup command.

echo "==> Done. Deployed:"
git --no-pager log -1 --oneline
