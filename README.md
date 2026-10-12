# Chinanki

A local-first web app for learning Mandarin vocabulary with spaced repetition.
Each word becomes six cards: hanzi → meaning, hanzi → pinyin, meaning → pinyin,
pinyin → meaning, and two writing cards (meaning → hanzi, pinyin → hanzi) where
you draw the character. FSRS-4.5 schedules every card on its own.

There is no account and no server-side data. Everything lives in your browser's
IndexedDB, and the app installs as a PWA and works offline. Clearing site data
deletes your collection, so use Settings → Export backup to keep a JSON copy,
and Import backup to restore it.

## Develop

Prerequisites: Node.js and npm.

```sh
npm install
npm run dev
```

Checks: `npm test`, `npm run test:e2e` (Playwright, against a production build),
`npm run typecheck`, `npm run build`.

## Dictionary

Auto-fill looks words up in CC-CEDICT (English) and CFDICT (French). Neither is
committed. Download both and build the shards:

```sh
curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
  | gunzip > /tmp/cedict.u8
curl -L https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip -o /tmp/cfdict.zip
unzip -o -d /tmp /tmp/cfdict.zip
npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8
```

The two are merged into one set of shards, so each entry has whichever languages
are available for it. CC-CEDICT is licensed CC BY-SA 4.0 and CFDICT CC BY-SA 3.0.

## Deploy

The app ships as a stateless Docker container (Caddy serving the static build)
behind a reverse proxy. The image build downloads the dictionaries itself.

```sh
./deploy.sh        # pull, rebuild, restart
./rollback.sh      # go back to the previous image
./smoke-image.sh   # build and check the image locally
```

See the [deployment guide](docs/deploying.md) for first-time server setup,
refreshing the dictionary, and cleaning up images.
