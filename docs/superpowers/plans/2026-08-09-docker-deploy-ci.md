# Docker Deployment and GitHub CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Chinanki as a Docker image served by Caddy, deployable to an existing VPS behind a central reverse proxy, and verify every push with GitHub Actions.

**Architecture:** A two-stage Dockerfile builds the static site with Node and serves it from `caddy:2-alpine`; the CC-CEDICT dictionary is downloaded and sharded during the build. A `compose.yaml` joins the container to the pre-existing external `web` Docker network with a network alias, publishing no host ports — the user's central Caddy terminates TLS and routes to it. Deploys are a manual script on the VPS that rebuilds from source; a companion script rolls back by retagging the previous image.

**Tech Stack:** Docker (multi-stage, BuildKit), `node:26.7-alpine`, `caddy:2-alpine`, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-09-docker-deploy-ci-design.md`

## Global Constraints

- **The runtime container is stateless.** All user data lives in the browser's IndexedDB. No volumes, no database, no server-side persistence. The container is disposable.
- **Node version is `26.7`, pinned identically in the Dockerfile and CI.** Matches local dev (`v26.7.0`). Node exists only in the build stage; the shipped image contains no Node.
- **No `ports:` mapping in `compose.yaml`.** The VPS runs a single central Caddy at `/home/ubuntu/caddy` owning 80/443. Application containers join the external Docker network `web` with a network alias and expose an internal port only.
- **The external network is named `web` and is declared `external: true`.** It is created and owned outside this project; the plan must never create or modify it on the VPS.
- **Hostname is `chinanki.bourdet.be`**, routed by a block the user adds by hand to `/home/ubuntu/caddy/Caddyfile`.
- **Cache-Control policy is exact and load-bearing:**
  - `/assets/*` → `public, max-age=31536000, immutable`
  - `/dict/*` → `public, max-age=604800`
  - `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/registerSW.js` → `no-cache`
- **`public/dict/` is a gitignored build artifact**, never committed. It must be generated before `vite build` or hanzi auto-fill silently returns nothing.
- **The dictionary download must fail loudly.** `curl -f` plus a shard-count floor of >100 files.
- **CC-CEDICT URL:** `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz`
- **No linter or formatter is added.** None exists in this project today.
- **CI does not push images** to any registry and holds no deploy credentials.
- Existing commands that must keep working unchanged: `npm run dev`, `npm test` (279 tests), `npm run typecheck`, `npm run build`, `npm run test:e2e`, `npm run build:dict -- <file>`.

---

## File Structure

```
Chinanki/
├─ Dockerfile              # two-stage: node builder -> caddy runtime
├─ .dockerignore           # keeps node_modules / dist / public/dict out of build context
├─ compose.yaml            # external `web` network, alias, no host ports
├─ smoke-image.sh          # builds + runs the image and asserts serving behaviour
├─ deploy.sh               # VPS: pull, retag previous, rebuild, prune
├─ rollback.sh             # VPS: restore previous image without rebuilding
├─ docker/
│  └─ Caddyfile            # in-container: SPA fallback + cache headers
├─ .github/
│  └─ workflows/
│     └─ ci.yml            # verify | e2e | docker, in parallel
├─ README.md               # (modified) Deploying section rewritten
└─ public/
   └─ _redirects           # (deleted) Netlify-specific, inert on this VPS
```

**Task boundaries.** Task 1 delivers a working image plus the script that proves it works. Task 2 delivers deployability (compose wiring, deploy/rollback, docs). Task 3 delivers the CI gate. Each is independently reviewable: a reviewer could reject the CI workflow while accepting the image, or vice versa.

---

## Task 1: Container image

Builds the static site and serves it from Caddy with correct SPA fallback and cache headers. `smoke-image.sh` is this task's test — Docker and Caddy config cannot be unit-tested, so it stands in for that.

**Files:**
- Create: `smoke-image.sh`, `.dockerignore`, `docker/Caddyfile`, `Dockerfile`
- Test: `smoke-image.sh` (it is both deliverable and test)

**Interfaces:**
- Consumes: existing `npm run build:dict -- <path>` and `npm run build` scripts from `package.json`.
- Produces:
  - A Docker image whose default command serves `/srv` on port 80.
  - `./smoke-image.sh [--no-build] [image-tag]` — exits 0 if every assertion passes, non-zero otherwise. Default tag `chinanki:smoke`. Task 3 calls it as `./smoke-image.sh --no-build chinanki:ci`.

- [ ] **Step 1: Write the failing test**

Create `smoke-image.sh`:

```bash
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
```

Make it executable:

```bash
chmod +x smoke-image.sh
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./smoke-image.sh`
Expected: FAIL during `docker build` with `failed to read dockerfile` or `Dockerfile: no such file or directory`. There is no Dockerfile yet.

- [ ] **Step 3: Write `.dockerignore`**

Without this, `COPY . .` drags `node_modules/`, `dist/`, the host's 17 MB `public/dict/` and `.git/` into the build context. The copied `public/dict` would be overwritten by the build anyway.

Create `.dockerignore`:

```
node_modules
dist
public/dict
.git
.github
docs
test-results
playwright-report
coverage
*.local
.DS_Store
```

- [ ] **Step 4: Write the in-container Caddyfile**

Create `docker/Caddyfile`:

```
:80 {
	root * /srv
	encode gzip zstd

	# Vite content-hashes these filenames, so they can never go stale.
	@immutable path /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"

	# 128 dictionary shards, content-stable, ~113 KB each. Worth caching hard.
	@dict path /dict/*
	header @dict Cache-Control "public, max-age=604800"

	# Unhashed filenames. If these are cached, a bad deploy pins users to a broken
	# build with no remote way to recover.
	@revalidate path / /index.html /sw.js /manifest.webmanifest /registerSW.js
	header @revalidate Cache-Control "no-cache"

	# Client-side routing: /stats and friends have no file behind them.
	try_files {path} {path}/ /index.html
	file_server
}
```

- [ ] **Step 5: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:26.7-alpine AS builder
WORKDIR /app

# CC-CEDICT lives in its own early layer so editing package.json does not
# re-trigger a ~9 MB download. Docker caches this by command string, not by
# remote content, so the dictionary is pinned until deliberately invalidated:
#   docker compose build --build-arg CEDICT_URL="<url>#$(date +%F)"
# The ${VAR%%#*} strips that cache-busting suffix back off before fetching.
#
# -f matters: without it a 404 or 5xx yields an empty file, build:dict emits
# zero shards, and the image ships with auto-fill permanently broken and no error.
ARG CEDICT_URL=https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
RUN apk add --no-cache curl \
 && curl -fsSL "${CEDICT_URL%%#*}" | gunzip > /tmp/cedict.u8 \
 && test -s /tmp/cedict.u8

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# build:dict must run before vite build — Vite copies public/ into dist/.
# The shard-count floor turns a silently empty dictionary into a failed build.
# `npm run build` also runs both typecheck passes, so a type error fails the image.
RUN npm run build:dict -- /tmp/cedict.u8 \
 && test "$(ls -1 public/dict | wc -l)" -gt 100 \
 && npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `./smoke-image.sh`
Expected: the build runs (several minutes on a cold cache — `npm ci` plus a 9 MB download plus a Vite build), then:

```
==> Checks
  ok    GET / returns 200
  ok    GET /stats returns 200 (SPA fallback)
  ok    /stats serves the app shell
  ok    / is no-cache
  ok    sw.js is no-cache
  ok    manifest is no-cache
  ok    hashed asset /assets/index-XXXXXXXX.js is immutable
  ok    dictionary shard XX.json returns 200
  ok    dictionary shard is JSON with entries
  ok    dictionary shard is cached
  ok    128 dictionary shards shipped
==> All checks passed
```

If `/ is no-cache` fails, the `@revalidate` matcher is missing the bare `/` path — Caddy matches the request path, and a visit to the site root is `/`, not `/index.html`.

If `/stats returns 200` fails, `try_files` is missing or ordered after `file_server`.

- [ ] **Step 7: Confirm the image is small and contains no Node**

Run: `docker image ls chinanki:smoke`
Expected: roughly 60–80 MB.

Run: `docker run --rm chinanki:smoke node --version`
Expected: FAIL with `exec: "node": executable file not found`. The runtime stage is Caddy only; a Node binary in the final image would mean the multi-stage split is broken.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore docker/Caddyfile smoke-image.sh
git commit -m "build: add Docker image serving the PWA from Caddy"
```

---

## Task 2: Compose wiring, deploy and rollback

Makes the image deployable onto the VPS's existing Caddy setup, with a fast rollback path.

**Files:**
- Create: `compose.yaml`, `deploy.sh`, `rollback.sh`
- Modify: `README.md:41-51` (the `## Deploying` section)
- Delete: `public/_redirects`

**Interfaces:**
- Consumes: the `Dockerfile` from Task 1; `./smoke-image.sh` from Task 1.
- Produces:
  - Service name `chinanki`, image tag `chinanki:latest`, network alias `chinanki` on external network `web`, internal port 80. The user's central Caddy targets this as `reverse_proxy chinanki:80`.
  - `./deploy.sh` and `./rollback.sh`, both run from the repo root on the VPS.

- [ ] **Step 1: Write the failing test**

There is no test framework for compose, so the test is an explicit integration check run by hand. Write it down first so the expected behaviour is fixed before the config exists.

Create nothing yet — run this and record that it fails:

Run: `docker compose config`
Expected: FAIL with `no configuration file provided: not found`.

- [ ] **Step 2: Write `compose.yaml`**

Create `compose.yaml`:

```yaml
# The VPS runs one central Caddy (/home/ubuntu/caddy) owning 80/443 and doing TLS.
# App containers publish no host ports; they join the external `web` network with an
# alias, and Caddy routes to them by that alias:
#   chinanki.bourdet.be { reverse_proxy chinanki:80 }
services:
  chinanki:
    build:
      context: .
    image: chinanki:latest
    container_name: chinanki
    restart: unless-stopped
    expose:
      - "80"
    networks:
      web:
        aliases:
          - chinanki

networks:
  web:
    external: true
```

- [ ] **Step 3: Verify the compose file parses and publishes no host ports**

Run: `docker compose config`
Expected: PASS. The rendered output shows `image: chinanki:latest`, the `web` network marked `external: true`, and — critically — **no `ports:` key anywhere**. If a `ports:` mapping appears, the container would bind a host port and bypass the central Caddy.

- [ ] **Step 4: Verify the container is reachable by its network alias**

This proves the alias-plus-external-network design actually works, which is the whole basis of the deployment. On the local machine, create a stand-in for the VPS's network:

```bash
docker network create web 2>/dev/null || true
docker compose up -d --build
docker run --rm --network web curlimages/curl:latest -fsS -o /dev/null -w '%{http_code}\n' http://chinanki:80/
```

Expected: `200`. This is a sibling container resolving `chinanki` by alias over the `web` network — exactly how the VPS's Caddy will reach it.

Tear down:

```bash
docker compose down
```

Leave the local `web` network in place; it is harmless and useful for re-testing.

- [ ] **Step 5: Write `deploy.sh`**

Create `deploy.sh`:

```bash
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
```

Make it executable:

```bash
chmod +x deploy.sh
```

- [ ] **Step 6: Write `rollback.sh`**

Create `rollback.sh`:

```bash
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
```

Make it executable:

```bash
chmod +x rollback.sh
```

- [ ] **Step 7: Verify deploy and rollback against the local checkout**

`deploy.sh` runs `git pull --ff-only`, which will fail locally if there is no upstream remote configured. Verify the parts that can be verified without a remote:

```bash
bash -n deploy.sh && bash -n rollback.sh && echo "syntax ok"
```

Expected: `syntax ok`.

Then verify the rollback mechanism end to end, since it is the part you will only ever use under pressure:

```bash
docker compose up -d --build                 # produces chinanki:latest
docker image tag chinanki:latest chinanki:previous
./rollback.sh
```

Expected: `==> Rolled back. Running image:` followed by an image ID and creation date, and the container running. Then tear down with `docker compose down`.

- [ ] **Step 8: Delete the Netlify redirects file**

`public/_redirects` is Netlify-specific and has no effect on this VPS — SPA fallback is now handled by `try_files` in `docker/Caddyfile`. Leaving it implies a deployment target that is not used.

```bash
git rm public/_redirects
```

- [ ] **Step 9: Rewrite the README's Deploying section**

Replace `README.md` lines 41-51 — the entire block from `## Deploying` up to (but not including) `## Backups` — with:

````markdown
## Deploying

Deployed as a Docker container behind a central Caddy reverse proxy that owns
80/443 and handles TLS. The container publishes no host ports; it joins the
external `web` Docker network with the alias `chinanki`.

The container is **stateless** — all user data lives in the browser's IndexedDB,
so there are no volumes and nothing to back up on the server.

### First-time setup on the VPS

```bash
git clone <repo-url> /home/ubuntu/chinanki
cd /home/ubuntu/chinanki
./deploy.sh
```

Then add a block to `/home/ubuntu/caddy/Caddyfile`:

```
chinanki.bourdet.be {
	reverse_proxy chinanki:80
}
```

and reload Caddy:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Subsequent deploys

```bash
./deploy.sh     # git pull, rebuild, restart
./rollback.sh   # restore the previous image in seconds
```

`deploy.sh` builds before recreating the container, so a failed build leaves the
running site untouched.

### Refreshing the dictionary

CC-CEDICT is downloaded during the image build and pinned by Docker's layer
cache, so builds are reproducible. To pick up a newer dictionary:

```bash
docker compose build --build-arg \
  CEDICT_URL="https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz#$(date +%F)"
docker compose up -d
```

### Verifying the image

```bash
./smoke-image.sh
```

Builds the image, runs it, and asserts the things that actually break in
production: SPA fallback on deep links, `no-cache` on `sw.js`/`index.html`,
`immutable` on hashed assets, and that the dictionary shipped.
````

- [ ] **Step 10: Verify the README renders and no stale Netlify reference remains**

Run: `grep -n "Netlify\|_redirects" README.md`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add compose.yaml deploy.sh rollback.sh README.md
git rm --cached public/_redirects 2>/dev/null || true
git add -A
git commit -m "deploy: add compose wiring, deploy and rollback scripts"
```

---

## Task 3: GitHub Actions CI

Verifies every push: typecheck, unit tests, build, Playwright E2E, and that the Docker image still builds and serves correctly.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `./smoke-image.sh --no-build chinanki:ci` from Task 1; the `Dockerfile` from Task 1; existing npm scripts `typecheck`, `test`, `build`, `test:e2e`.
- Produces: three GitHub checks per push — `verify`, `e2e`, `docker`.

- [ ] **Step 1: Write the failing test**

The test for a workflow file is a linter that understands GitHub Actions semantics — YAML validity alone would miss unknown keys, bad `uses` references, and invalid expressions. `actionlint` runs from a container, so nothing needs installing.

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color`
Expected: PASS trivially with no output — there are no workflow files yet. This confirms the tool runs before you depend on it.

Now record the real expectation: after Step 2 the same command must still pass, and `.github/workflows/ci.yml` must exist. Verify the file is absent first:

Run: `ls .github/workflows/ci.yml`
Expected: FAIL with `No such file or directory`.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

# Supersede in-flight runs for the same branch; only the newest push matters.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # Typecheck, unit/component tests, production build.
  # Does not need the dictionary: public/dict is absent here, and the app degrades
  # to "no suggestions" when a shard is missing.
  verify:
    name: Typecheck, tests, build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '26.7'
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  # The 3 Playwright smoke tests, against a real production build in Chromium.
  # playwright.config.ts's webServer runs `npm run build && npm run preview`.
  e2e:
    name: End-to-end
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '26.7'
          cache: npm

      - run: npm ci

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  # The VPS builds from source, so without this a broken Dockerfile would only
  # surface mid-deploy, on the box, by hand.
  docker:
    name: Docker image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          load: true
          tags: chinanki:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Smoke-test the image
        run: ./smoke-image.sh --no-build chinanki:ci
```

- [ ] **Step 3: Run the linter to verify it passes**

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color`
Expected: PASS with no output. Any output is a real error — actionlint reports unknown keys, invalid `uses` refs, and shell issues inside `run:` blocks.

- [ ] **Step 4: Verify the smoke script works in the `--no-build` shape CI uses**

The `docker` job depends on `smoke-image.sh` accepting an already-built image. Confirm that path locally rather than discovering it fails on the first push:

```bash
docker build -t chinanki:ci .
./smoke-image.sh --no-build chinanki:ci
```

Expected: the build step is skipped (no `==> Building` line) and all checks pass.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify typecheck, tests, e2e and Docker build on every push"
```

- [ ] **Step 6: Push and confirm the checks run green**

```bash
git push
```

Then open the repository's Actions tab and confirm all three jobs pass. Expected wall-clock on a cold cache: `verify` ~1 min, `e2e` ~2-3 min, `docker` ~3-4 min. Subsequent runs are faster once the npm, Playwright and BuildKit caches populate.

If `docker` fails on the first run with a GHA cache error, that is expected only when the repository has never used `type=gha` caching; re-running the job resolves it.

---

## Post-implementation notes

**Deliberately out of scope** — do not add these while executing:

- An image registry (GHCR) and pull-based deploys. Revisit only if VPS build time becomes annoying; the box has 24 GB RAM and builds comfortably.
- Automated deploy from CI over SSH. Rejected to avoid holding an SSH private key in GitHub secrets for a personal VPS.
- Watchtower or any auto-update daemon.
- Linting or formatting. No linter exists in this project; adding one is separate work.
- Multi-architecture images. The VPS builds locally for its own architecture.
- Branch protection requiring these checks. That is a GitHub repository setting, not a file in this repo. Worth enabling separately — until then CI is advisory and nothing prevents deploying a red commit.

**Known trade-offs baked into this plan:**

- The dictionary is pinned by Docker's layer cache rather than by content hash, so a rebuild months later ships the same dictionary until `CEDICT_URL` is busted. This is intended: reproducible by default, refreshed on purpose. The README documents the refresh command.
- `deploy.sh` rebuilds from source on the VPS, so a deploy takes several minutes. `rollback.sh` exists precisely because that is too slow to be an incident-response path.
- `rollback.sh` restores the previous *image*, not the previous commit. The working tree stays where `git pull` left it, so the next `deploy.sh` will rebuild the newer code. This is noted in the script's own comment.
- `smoke-image.sh` binds host port 8099. If something else on the machine uses it, the script fails at container start rather than silently testing the wrong thing.

**First real-hardware verification.** This project has never been confirmed installable on a phone. After the first deploy, load `https://chinanki.bourdet.be` on a mobile device and check: the service worker registers (DevTools → Application → Service Workers), "Add to Home Screen" is offered, and the installed app still works in airplane mode after one online load. Consider adding `<link rel="apple-touch-icon">` to `index.html` if the iOS home-screen icon is wrong.

---

## Self-Review

**1. Spec coverage** — every section of the design maps to a task:

| Spec section | Task |
|---|---|
| Container: two-stage build, layer ordering, `curl -f`, shard floor | 1 (Steps 5) |
| Cache-header table, SPA fallback | 1 (Step 4), asserted in Step 1's script |
| Dictionary refresh via `CEDICT_URL` | 1 (Step 5 comment), README in 2 (Step 9) |
| `.dockerignore` | 1 (Step 3) |
| Compose: external `web`, alias, no ports | 2 (Steps 2-4) |
| Central Caddy route block | 2 (Step 9, README) |
| `deploy.sh` / `rollback.sh` | 2 (Steps 5-7) |
| Delete `public/_redirects` | 2 (Step 8) |
| CI: three jobs, caching, Node pinning, no push | 3 (Step 2) |
| Verification / `smoke-image.sh` | 1 (Step 1), reused by 3 (Step 4) |
| Post-deploy mobile check | Post-implementation notes |

**2. Placeholder scan** — no `TBD`, `TODO`, "add error handling", or "similar to Task N". Every code step contains complete file contents. Every run step names an exact command and expected output.

**3. Type/name consistency** — checked across tasks:
- Image tag `chinanki:latest` is produced by `compose.yaml` (Task 2 Step 2) and consumed by `deploy.sh`/`rollback.sh` (Task 2 Steps 5-6). Consistent.
- Service name, container name and network alias are all `chinanki`; the README's Caddy block targets `chinanki:80`. Consistent.
- `smoke-image.sh` is defined in Task 1 with signature `[--no-build] [image-tag]` and called by Task 3 Step 2 as `./smoke-image.sh --no-build chinanki:ci`. Consistent.
- Node `26.7` appears in `Dockerfile` (Task 1 Step 5) and both `setup-node` blocks (Task 3 Step 2). Consistent.
- `docker/Caddyfile` is the path written in Task 1 Step 4 and copied by the `Dockerfile` in Step 5. Consistent.
