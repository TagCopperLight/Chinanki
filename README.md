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

`npm run build` produces a fully static `dist/`. Any static host works
(Netlify, Vercel, GitHub Pages, Caddy). One requirement: **all routes must fall
back to `index.html`**, since the app uses client-side routing.

Netlify — `public/_redirects`:

```
/*  /index.html  200
```

## Backups

Your data lives in this browser's IndexedDB. Clearing site data deletes it.
Settings → Export backup writes a JSON file that Import backup restores.
