#!/usr/bin/env bash
# Verifies a built image actually serves the app correctly.
#
# Docker and Caddy configuration cannot be unit-tested, so this script stands in
# for that: it asserts the specific things that break in production if the
# Dockerfile or Caddyfile are wrong — SPA fallback, cache headers, and whether
# the dictionary was built and shipped at all.
#
# Usage:
#   ./smoke-image.sh                          # build chinanki:smoke, then test it
#   ./smoke-image.sh --no-build chinanki:ci   # test an image that already exists
set -euo pipefail

BUILD=1
if [ "${1:-}" = "--no-build" ]; then
  BUILD=0
  shift
fi
IMAGE="${1:-chinanki:smoke}"
PORT=8099
NAME=chinanki-smoke

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

if [ "$BUILD" -eq 1 ]; then
  echo "==> Building $IMAGE"
  docker build -t "$IMAGE" .
fi

echo "==> Starting $IMAGE on :$PORT"
docker run -d --name "$NAME" -p "$PORT:80" "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "FAIL: container did not start serving within 30s"
  docker logs "$NAME"
  exit 1
fi

fail=0
check() { # label, actual, expected-substring
  if printf '%s' "$2" | grep -qi -- "$3"; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1"
    echo "        expected to contain: $3"
    echo "        actual: $2"
    fail=1
  fi
}

check_status() { # label, url, expected-http-code
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$2")
  check "$1" "$code" "^$3\$"
}

echo "==> Checks"

code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/")
check "GET / returns 200" "$code" "^200$"

# A client-side route with no file behind it. 404 here means SPA fallback is broken
# and a refresh on /stats would break for every user.
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/stats")
check "GET /stats returns 200 (SPA fallback)" "$code" "^200$"

body=$(curl -s "http://localhost:$PORT/stats")
check "/stats serves the app shell" "$body" 'id="root"'

# Unhashed files must always revalidate. Cache these and a bad deploy pins users
# to a broken build with no remote way to fix it.
hdr=$(curl -sI "http://localhost:$PORT/")
check "/ is no-cache" "$hdr" "cache-control: no-cache"

hdr=$(curl -sI "http://localhost:$PORT/sw.js")
check "sw.js is no-cache" "$hdr" "cache-control: no-cache"

hdr=$(curl -sI "http://localhost:$PORT/manifest.webmanifest")
check "manifest is no-cache" "$hdr" "cache-control: no-cache"

# Client-side routes are served via the SPA fallback, so they must revalidate too —
# otherwise a heuristically-cached stale app shell can reference pruned asset files.
hdr=$(curl -sI "http://localhost:$PORT/stats")
check "/stats is no-cache" "$hdr" "cache-control: no-cache"

hdr=$(curl -sI "http://localhost:$PORT/deck/1/browse")
check "/deck/1/browse is no-cache" "$hdr" "cache-control: no-cache"

hdr=$(curl -sI "http://localhost:$PORT/icon-192.png")
check "/icon-192.png is no-cache" "$hdr" "cache-control: no-cache"

# Vite content-hashes these, so they must be immutable or every visit refetches them.
asset=$(curl -s "http://localhost:$PORT/" | grep -o '/assets/[^"]*\.js' | head -1)
if [ -z "$asset" ]; then
  echo "  FAIL  could not find a hashed asset reference in index.html"
  fail=1
else
  hdr=$(curl -sI "http://localhost:$PORT$asset")
  check "hashed asset $asset is immutable" "$hdr" "immutable"
fi

# Shard filenames are codePoint % 128 in hex, so no specific name is guaranteed.
shard=$(docker exec "$NAME" sh -c 'ls /srv/dict 2>/dev/null | head -1')
if [ -z "$shard" ]; then
  echo "  FAIL  no dictionary shards in the image"
  fail=1
else
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/dict/$shard")
  check "dictionary shard $shard returns 200" "$code" "^200$"
  body=$(curl -s "http://localhost:$PORT/dict/$shard")
  check "dictionary shard is JSON with entries" "$body" '"simplified"'
  hdr=$(curl -sI "http://localhost:$PORT/dict/$shard")
  check "dictionary shard is cached" "$hdr" "max-age=604800"
fi

# A missing file under /assets or /dict must 404, not fall through to the SPA
# index.html. If it doesn't, Workbox precaching a stale/renamed asset gets a
# 200 text/html cached forever as that asset's URL, and the dictionary lookup
# code sees response.ok, tries to parse HTML as JSON, and silently degrades to
# no suggestions — with the broken entry stuck in the service worker cache
# with no expiry, surviving even a corrected redeploy.
check_status "missing /assets file returns 404 (no SPA fallback)" \
  "http://localhost:$PORT/assets/nope-does-not-exist.js" 404

check_status "missing /dict shard returns 404 (no SPA fallback)" \
  "http://localhost:$PORT/dict/zz-not-a-shard.json" 404

count=$(docker exec "$NAME" sh -c 'ls -1 /srv/dict 2>/dev/null | wc -l' || echo 0)
if [ "$count" -gt 100 ]; then
  echo "  ok    $count dictionary shards shipped"
else
  echo "  FAIL  only $count dictionary shards shipped (expected >100)"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "==> All checks passed"
else
  echo "==> FAILED"
fi
exit "$fail"
