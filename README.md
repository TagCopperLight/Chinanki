# Chinanki

A local-first, installable web app for learning Mandarin vocabulary. Cards go in
four directions (hanzi → meaning, hanzi → pinyin, meaning → pinyin, pinyin →
meaning), each scheduled independently by FSRS-4.5. Everything is stored in your
browser — no account, no server.

## Development

```bash
npm install
npm run dev
```

### Dictionary

Auto-fill needs two dictionaries, neither committed: CC-CEDICT for English and
CFDICT for French.

```bash
curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
  | gunzip > /tmp/cedict.u8
curl -L https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip -o /tmp/cfdict.zip
unzip -o -d /tmp /tmp/cfdict.zip
npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8
```

They are merged into one set of shards, so each entry carries whichever of the
two languages has it. CC-CEDICT is licensed CC BY-SA 4.0 and CFDICT CC BY-SA
3.0.

### Checks

```bash
npm test          # unit and component tests
npm run test:e2e  # Playwright, against a production build
npm run typecheck
npm run build
```

Note: the default study-day rollover is 04:00 local time. Running `npm run
test:e2e` in the 03:59–04:01 window can make the stats assertions see a
rollover mid-run and fail; this is a timing artifact of the test environment,
not a bug. Re-run outside that window if it happens.

## Deploying

Deployed as a Docker container behind a central Caddy reverse proxy that owns
80/443 and handles TLS. The container publishes no host ports; it joins the
external `web` Docker network with the alias `chinanki`.

The container is **stateless** — all user data lives in the browser's IndexedDB,
so there are no volumes and nothing to back up on the server.

### First-time setup on the VPS

Before you start, make sure of two things:

- **DNS is live first.** `chinanki.bourdet.be` needs an A record pointing at
  the VPS *before* you reload Caddy in the last step below. Reloading with
  the block in place but DNS not yet resolving means Let's Encrypt's HTTP-01
  challenge fails, and you'll see TLS errors with no obvious cause — this is
  the most likely place to get stuck, so confirm the record has propagated
  (`dig chinanki.bourdet.be`) before proceeding.
- **The external `web` Docker network must already exist** — it's shared
  with the other services on the box (vaultwarden, gripsou, roadia). If it's
  missing, `deploy.sh` fails at `docker compose up` with `network web
  declared as external, but could not be found`. Create it once with `docker
  network create web` if this is a fresh box.

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

and reload Caddy (only after DNS resolves, see above):

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Finally, do a real-hardware check — this is the project's first genuine PWA
confirmation and the design spec requires it:

- Load `https://chinanki.bourdet.be` on a phone.
- In desktop DevTools → Application → Service Workers, confirm the service
  worker registered (you can point DevTools at the phone via remote
  debugging, or just check on desktop against the same URL).
- Confirm the browser offers "Add to Home Screen" / "Install".
- After one successful online load, put the phone in airplane mode and
  confirm the app still works.

### Subsequent deploys

```bash
./deploy.sh     # git pull, rebuild, restart
./rollback.sh   # restore the previous image in seconds
```

`deploy.sh` builds before recreating the container, so a failed build leaves the
running site untouched.

### Blast radius on a shared host

Every command in `deploy.sh`, `rollback.sh` and `compose.yaml` is scoped either
to a `chinanki:*` image tag or to the single service declared in
`compose.yaml`. Nothing here can reach another project's containers, images,
volumes or networks:

- no `docker system prune`, no `docker volume prune`, no `docker compose down -v`
- `compose.yaml` declares **no volumes** — the container is stateless, so there
  is no server-side data to lose in the first place
- the `web` network is declared `external: true`, so Compose uses it but never
  creates, modifies or removes it

`deploy.sh` deliberately does **not** prune images. Disk cleanup is manual and
opt-in, so no unattended destructive command runs on a shared box. When you do
want to reclaim space, this is scoped to images built from this project's
Dockerfile:

```bash
docker image prune -f --filter "label=org.opencontainers.image.title=chinanki"
```

Check what it would remove first — a filter that matches nothing is safe, a
filter that matches too much is not:

```bash
docker images --filter "dangling=true" \
              --filter "label=org.opencontainers.image.title=chinanki"
```

Note that `org.opencontainers.image.title` is inherited from `caddy:2-alpine`
and only overridden by this project's `Dockerfile`. If that `LABEL` is ever
removed, the filter silently stops matching (harmless), but a filter written
against the inherited value `Caddy` would match Caddy-derived images across the
whole host. Prefer the label above, or Compose's own
`label=com.docker.compose.project=chinanki`.

### Refreshing the dictionary

CC-CEDICT is downloaded during the image build and pinned by Docker's layer
cache, so builds are reproducible. To pick up a newer dictionary:

```bash
docker compose build --build-arg \
  CEDICT_URL="https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz#$(date +%F)"
docker compose up -d
```

This bypasses `deploy.sh`, so it does **not** set a `chinanki:last-good` tag —
there is no rollback target after a dictionary refresh done this way. If you
want one, tag the current image yourself before rebuilding, but only if it is
currently serving correctly: `docker image tag chinanki:latest
chinanki:last-good`.

### Verifying the image

```bash
./smoke-image.sh
```

Builds the image, runs it, and asserts the things that actually break in
production: SPA fallback on deep links, `no-cache` on `sw.js`/`index.html`,
`immutable` on hashed assets, and that the dictionary shipped.

## Backups

Your data lives in this browser's IndexedDB. Clearing site data deletes it.
Settings → Export backup writes a JSON file that Import backup restores.
