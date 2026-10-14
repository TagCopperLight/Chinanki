# Chinanki

A small Anki-like web app for learning Mandarin vocabulary, made for phones.

Each word you add becomes up to six flashcards:

- hanzi → meaning
- hanzi → pinyin
- meaning → pinyin
- pinyin → meaning
- meaning → hanzi (you draw the character)
- pinyin → hanzi (you draw the character)

Reviews are scheduled with FSRS. When adding a word, you get suggestions from a
Chinese–English (CC-CEDICT) and Chinese–French (CFDICT) dictionary.

There is no account and no backend. Your data lives in the browser (IndexedDB),
and the app can be installed as a PWA and used offline. Clearing the site's data
deletes everything, so use **Settings → Export backup** now and then.

## Run locally

```sh
npm install
npm run dev
```

`npm test` runs the tests and `npm run build` type-checks and builds.

Dictionary suggestions need the dictionary files, which are not in the repo.
To build them locally:

```sh
curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz | gunzip > /tmp/cedict.u8
curl -L https://chine.in/assets/cfdict/cfdict.u8 -o /tmp/cfdict.u8
npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8
```

Without them the app still works, just without suggestions.

## Deploy

The Docker image downloads the dictionaries, builds the app and serves it with
Caddy. `compose.yaml` attaches it to an existing external Docker network called
`web`, where a reverse proxy routes to `chinanki:80`.

```sh
git pull
docker compose up -d --build
```

To fetch fresh dictionaries, rebuild without the cache:
`docker compose build --no-cache && docker compose up -d`.

## Licences

CC-CEDICT is CC BY-SA 4.0 and CFDICT is CC BY-SA 3.0.
