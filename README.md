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

Auto-fill needs CC-CEDICT, which is not committed:

```bash
curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
  | gunzip > /tmp/cedict.u8
npm run build:dict -- /tmp/cedict.u8
```

CC-CEDICT is licensed CC BY-SA 4.0.

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

## Backups

Your data lives in this browser's IndexedDB. Clearing site data deletes it.
Settings → Export backup writes a JSON file that Import backup restores.
