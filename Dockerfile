FROM node:26.7-alpine AS builder
WORKDIR /app

# Download the dictionaries first so this layer stays cached across code changes.
ARG CEDICT_URL=https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
ARG CFDICT_URL=https://chine.in/assets/cfdict/cfdict.u8
RUN apk add --no-cache curl \
 && curl -fsSL "$CEDICT_URL" -o /tmp/cedict.u8.gz && gunzip /tmp/cedict.u8.gz \
 && curl -fsSL "$CFDICT_URL" -o /tmp/cfdict.u8

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8 && npm run build

FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
