# Deploying

Chinanki runs on a shared VPS behind a central Caddy reverse proxy that owns
ports 80/443 and handles TLS. The container publishes no host ports. It joins
the external `web` Docker network under the alias `chinanki`.

The container is stateless. User data lives in each browser's IndexedDB, so
there are no volumes and nothing to back up on the server.

## First-time setup

Before you start, check two things:

- **DNS resolves.** `chinanki.bourdet.be` needs an A record pointing at the VPS
  before you reload Caddy. If it doesn't resolve yet, Let's Encrypt's HTTP-01
  challenge fails and you get TLS errors with no obvious cause. Check with
  `dig chinanki.bourdet.be`.
- **The `web` network exists.** Other services on the box (vaultwarden,
  gripsou, roadia) share it. On a fresh box, create it with
  `docker network create web`. Without it, `docker compose up` fails with
  `network web declared as external, but could not be found`.

Then clone and deploy:

```sh
git clone git@github.com:TagCopperLight/Chinanki.git /home/ubuntu/chinanki
cd /home/ubuntu/chinanki
./deploy.sh
```

Add a block to `/home/ubuntu/caddy/Caddyfile`:

```
chinanki.bourdet.be {
	reverse_proxy chinanki:80
}
```

and reload Caddy:

```sh
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Finally, check the PWA on a real phone:

- Load `https://chinanki.bourdet.be`.
- In DevTools → Application → Service Workers, confirm the service worker
  registered (on desktop against the same URL, or on the phone via remote
  debugging).
- Confirm the browser offers to install the app.
- After one online load, switch to airplane mode and confirm the app still
  works.

## Deploys and rollbacks

```sh
./deploy.sh     # git pull, rebuild, restart
./rollback.sh   # restore the previous image
```

`deploy.sh` builds before it recreates the container, so a failed build leaves
the running site untouched. When a deploy succeeds, the image it replaced
becomes `chinanki:last-good`, which is what `rollback.sh` restores. This only
happens if that image was serving correctly before the deploy and the new one
serves correctly after, so a broken image never becomes the rollback target.

## Checking the image

```sh
./smoke-image.sh
```

Builds the image, runs it, and checks what breaks in production: SPA fallback
on deep links, `no-cache` on `sw.js` and `index.html`, `immutable` on hashed
assets, and that the dictionary shipped.

## Refreshing the dictionary

The image build downloads both dictionaries, and Docker's layer cache pins them,
so builds are reproducible. To pick up newer data, bust the cache. Both URLs
share one layer, so changing either re-fetches both:

```sh
docker compose build \
  --build-arg CEDICT_URL="https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz#$(date +%F)" \
  --build-arg CFDICT_URL="https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip#$(date +%F)"
docker compose up -d
```

This bypasses `deploy.sh`, so it does not set `chinanki:last-good` and leaves no
rollback target. If you want one, and the current image is serving correctly,
tag it first: `docker image tag chinanki:latest chinanki:last-good`.

## Staying inside our own containers

The box is shared, so every command in `deploy.sh`, `rollback.sh` and
`compose.yaml` targets either a `chinanki:*` image tag or the single service in
`compose.yaml`:

- no `docker system prune`, `docker volume prune` or `docker compose down -v`
- `compose.yaml` declares no volumes
- the `web` network is `external: true`, so Compose uses it but never creates,
  changes or removes it

`deploy.sh` does not prune images. Cleanup is manual. To reclaim space, first
list what would go:

```sh
docker images --filter "dangling=true" \
              --filter "label=org.opencontainers.image.title=chinanki"
```

then remove it:

```sh
docker image prune -f --filter "label=org.opencontainers.image.title=chinanki"
```

`org.opencontainers.image.title` comes from `caddy:2-alpine`, and only this
project's `Dockerfile` overrides it. If that `LABEL` is ever removed, the filter
matches nothing, which is harmless. A filter on the inherited value `Caddy`
would match every Caddy-based image on the host, including the central proxy.
Use the label above or `label=com.docker.compose.project=chinanki`.
