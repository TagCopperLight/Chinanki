# syntax=docker/dockerfile:1

FROM node:26.7-alpine AS builder
WORKDIR /app

# CC-CEDICT and CFDICT live in their own early layer so editing package.json does not
# re-trigger a ~9 MB download. Docker caches this by command string, not by
# remote content, so the dictionary is pinned until deliberately invalidated:
#   docker compose build --build-arg CEDICT_URL="<url>#$(date +%F)"
# The ${VAR%%#*} strips that cache-busting suffix back off before fetching.
#
# -f matters: without it a 404 or 5xx yields an empty file, build:dict emits
# zero shards, and the image ships with auto-fill permanently broken and no error.
ARG CEDICT_URL=https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
ARG CFDICT_URL=https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip
RUN apk add --no-cache curl unzip \
 && curl -fsSL "${CEDICT_URL%%#*}" | gunzip > /tmp/cedict.u8 \
 && test -s /tmp/cedict.u8 \
 && curl -fsSL "${CFDICT_URL%%#*}" -o /tmp/cfdict.zip \
 && unzip -o -d /tmp /tmp/cfdict.zip \
 && test -s /tmp/cfdict.u8

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# build:dict must run before vite build — Vite copies public/ into dist/.
# The shard-count floor turns a silently empty dictionary into a failed build.
# `npm run build` also runs both typecheck passes, so a type error fails the image.
RUN npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8 \
 && test "$(ls -1 public/dict | wc -l)" -gt 100 \
 && npm run build

FROM caddy:2-alpine
LABEL org.opencontainers.image.title="chinanki"
COPY --from=builder /app/dist /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
