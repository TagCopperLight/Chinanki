# French Dictionary Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the note editor's dictionary suggestions show French glosses instead of English, chosen by a global setting, falling back to the other language when one is missing.

**Architecture:** CFDICT (Chinese↔French, CC-CEDICT line format) is merged into the existing dictionary shards at build time, so each shipped entry carries both gloss lists and no extra network request is needed at lookup. A pure `glossesFor` resolves which language to display and reports what it actually returned, so the suggestion list can badge rows that fell back. Nothing about sharding, caching or the service worker changes.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + Testing Library, Dexie (IndexedDB), Docker/Caddy.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-french-suggestions-design.md`.
- CFDICT source: `https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip`, licensed **CC BY-SA 3.0**, a zip containing `cfdict.u8`.
- CC-CEDICT stays licensed **CC BY-SA 4.0**; both attributions must appear on the Settings page.
- Glosses stay capped at **6 per language per entry**.
- `suggestionLanguage` defaults to `'en'`.
- Scope is the suggestion list only. Do **not** translate the app interface.
- Every task ends green: `npm run typecheck` and `npm test` both pass before the commit.
- Import paths use the `@/` alias, matching every existing file.

---

### Task 1: Split the parsed and merged entry types

Today `DictEntry` is both "a parsed line" and "what ships in a shard". Those stop being the same thing once two dictionaries are merged, so this task splits them and moves every consumer onto the new shape. No behaviour changes — English glosses still land in the same place on screen.

**Files:**
- Modify: `src/lib/dictionary/types.ts`
- Modify: `src/lib/dictionary/parse.ts:5-19`
- Modify: `src/lib/dictionary/index.ts`
- Modify: `scripts/build-dictionary.ts:30-42`
- Modify: `src/components/DictionarySuggestions.tsx:46`
- Modify: `src/pages/NoteEditorPage.tsx:50-55`
- Test: `src/lib/dictionary/parse.test.ts`, `src/lib/dictionary/lookup.test.ts:11-17`, `src/pages/NoteEditorPage.test.tsx:13-16`

**Interfaces:**
- Consumes: nothing.
- Produces: `ParsedEntry` (`{ simplified, traditional, pinyin, meanings: string[] }`), `DictEntry` (`{ simplified, traditional, pinyin, meanings: Partial<Record<GlossLanguage, string[]>> }`), `GlossLanguage` (`'en' | 'fr'`), and `parseCedictLine(line: string): ParsedEntry | null`.

- [ ] **Step 1: Write the failing test — a CFDICT line must parse**

Add to `src/lib/dictionary/parse.test.ts`, inside the existing `describe('parseCedictLine')`:

```ts
  it('parses a CFDICT line the same way as a CC-CEDICT one', () => {
    const entry = parseCedictLine('綠 绿 [lu:4] /vert/verdure/');
    expect(entry).toEqual({
      traditional: '綠',
      simplified: '绿',
      pinyin: 'lǜ',
      meanings: ['vert', 'verdure'],
    });
  });
```

- [ ] **Step 2: Run it to confirm it passes already**

Run: `npx vitest run src/lib/dictionary/parse.test.ts`
Expected: PASS. CFDICT uses the identical line format, so this test documents and locks in a property the parser already has rather than driving new code. If it fails, stop — the assumption the whole plan rests on is wrong.

- [ ] **Step 3: Replace the types**

Rewrite `src/lib/dictionary/types.ts` in full:

```ts
export type GlossLanguage = 'en' | 'fr';

/** One dictionary line, parsed but not yet merged with the other language. */
export interface ParsedEntry {
  simplified: string;
  traditional: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  meanings: string[];
}

/**
 * A merged entry as shipped in the shards. At least one language is present
 * and non-empty; coverage is uneven in both directions, so neither is
 * guaranteed on its own.
 */
export interface DictEntry {
  simplified: string;
  traditional: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  meanings: Partial<Record<GlossLanguage, string[]>>;
}
```

- [ ] **Step 4: Point the parser at `ParsedEntry`**

In `src/lib/dictionary/parse.ts`, change the import and the return type — the body is untouched:

```ts
import type { ParsedEntry } from '@/lib/dictionary/types';

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

export function parseCedictLine(line: string): ParsedEntry | null {
```

- [ ] **Step 5: Export the new types**

In `src/lib/dictionary/index.ts`, replace the last line:

```ts
export type { DictEntry, GlossLanguage, ParsedEntry } from '@/lib/dictionary/types';
```

- [ ] **Step 6: Move the build script onto the new shape**

In `scripts/build-dictionary.ts`, rename the counter declared as `let parsed = 0;` to `let parsedCount = 0;` — the per-line variable below needs the name `parsed` — and use `parsedCount` in the final `console.log` template too. Then replace the whole `for (const line of text.split('\n')) { ... }` block with:

```ts
for (const line of text.split('\n')) {
  const parsed = parseCedictLine(line);
  if (!parsed) {
    if (line.trim() !== '' && !line.startsWith('#')) skipped++;
    continue;
  }
  // Trim the long tail of glosses; the editor only ever shows the first few.
  const entry: DictEntry = {
    simplified: parsed.simplified,
    traditional: parsed.traditional,
    pinyin: parsed.pinyin,
    meanings: { en: parsed.meanings.slice(0, 6) },
  };
  const key = shardKeyFor(entry.simplified);
  const bucket = buckets.get(key) ?? [];
  bucket.push(entry);
  buckets.set(key, bucket);
  parsedCount++;
}
```

This whole block is thrown away in Task 3; it exists only so the tree compiles at this commit.

- [ ] **Step 7: Move the two UI consumers onto the new shape**

In `src/components/DictionarySuggestions.tsx`, line 46:

```tsx
              {(entry.meanings.en ?? []).join('; ')}
```

In `src/pages/NoteEditorPage.tsx`, inside `applySuggestion`:

```ts
    setMeaning((entry.meanings.en ?? []).join('; '));
```

Both are temporary and get replaced in Task 7; the point of this step is only to keep the tree compiling.

- [ ] **Step 8: Update the test fixtures**

In `src/lib/dictionary/lookup.test.ts`, the three fixtures become:

```ts
const HAO: DictEntry = {
  simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'] },
};
const HAOREN: DictEntry = {
  simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] },
};
const HAOCHI: DictEntry = {
  simplified: '好吃', traditional: '好吃', pinyin: 'hǎo chī', meanings: { en: ['tasty'] },
};
```

In `src/pages/NoteEditorPage.test.tsx`, `ENTRIES` becomes:

```tsx
const ENTRIES = [
  { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good', 'well'] } },
  { simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] } },
];
```

- [ ] **Step 9: Run the full suite and the typechecks**

Run: `npm test && npm run typecheck`
Expected: all tests pass and both `tsc --noEmit` passes are clean. The scripts typecheck pass is the one that catches a half-migrated build script.

- [ ] **Step 10: Commit**

```bash
git add src/lib/dictionary scripts/build-dictionary.ts src/components/DictionarySuggestions.tsx src/pages/NoteEditorPage.tsx src/pages/NoteEditorPage.test.tsx
git commit -m "refactor(dictionary): split parsed entries from merged shard entries"
```

---

### Task 2: Merge two dictionaries into one entry list

Pure logic, no I/O. This is where the French glosses actually get attached to the English ones.

**Files:**
- Create: `src/lib/dictionary/merge.ts`
- Create: `src/lib/dictionary/merge.test.ts`
- Modify: `src/lib/dictionary/index.ts`

**Interfaces:**
- Consumes: `ParsedEntry`, `DictEntry` from Task 1.
- Produces: `mergeDictionaries(en: ParsedEntry[], fr: ParsedEntry[]): DictEntry[]` and `pinyinKey(pinyin: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dictionary/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeDictionaries, pinyinKey } from '@/lib/dictionary/merge';
import type { ParsedEntry } from '@/lib/dictionary/types';

function parsed(
  simplified: string,
  pinyin: string,
  meanings: string[],
  traditional = simplified,
): ParsedEntry {
  return { simplified, traditional, pinyin, meanings };
}

describe('pinyinKey', () => {
  it('ignores tone marks, spacing and case', () => {
    expect(pinyinKey('Hǎo rén')).toBe(pinyinKey('hào  ren'));
  });

  it('keeps ü and u apart', () => {
    expect(pinyinKey('lǜ')).not.toBe(pinyinKey('lù'));
  });
});

describe('mergeDictionaries', () => {
  it('attaches French glosses to the matching English entry', () => {
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', ['good'])],
      [parsed('好', 'hǎo', ['bon'])],
    );
    expect(merged).toEqual([
      { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'], fr: ['bon'] } },
    ]);
  });

  it('keeps a different reading of the same headword separate', () => {
    const merged = mergeDictionaries(
      [parsed('长', 'cháng', ['long'])],
      [parsed('长', 'zhǎng', ['grandir'])],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]!.meanings).toEqual({ en: ['long'] });
    expect(merged[1]!.meanings).toEqual({ fr: ['grandir'] });
  });

  it('keeps a French entry that has no English counterpart', () => {
    const merged = mergeDictionaries([], [parsed('鹹魚', 'xián yú', ['poisson salé'])]);
    expect(merged).toEqual([
      {
        simplified: '鹹魚',
        traditional: '鹹魚',
        pinyin: 'xián yú',
        meanings: { fr: ['poisson salé'] },
      },
    ]);
  });

  it('unions duplicate French entries for one key without repeating a gloss', () => {
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', ['good'])],
      [parsed('好', 'hǎo', ['bon']), parsed('好', 'hǎo', ['bon', 'bien'])],
    );
    expect(merged[0]!.meanings.fr).toEqual(['bon', 'bien']);
  });

  it('caps each language at six glosses', () => {
    const seven = ['1', '2', '3', '4', '5', '6', '7'];
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', seven)],
      [parsed('好', 'hǎo', seven)],
    );
    expect(merged[0]!.meanings.en).toHaveLength(6);
    expect(merged[0]!.meanings.fr).toHaveLength(6);
  });

  it('attaches French to every English entry sharing a reading', () => {
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', ['good']), parsed('好', 'hǎo', ['fine'])],
      [parsed('好', 'hǎo', ['bon'])],
    );
    expect(merged.map((entry) => entry.meanings.fr)).toEqual([['bon'], ['bon']]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dictionary/merge.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/dictionary/merge"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/dictionary/merge.ts`:

```ts
import type { DictEntry, ParsedEntry } from '@/lib/dictionary/types';

const MAX_GLOSSES = 6;

/**
 * Merge key for one reading of one word.
 *
 * Tone marks come off: the two dictionaries disagree on the tone of a small
 * number of entries, and treating those as different words would lose the
 * French gloss entirely. ü is folded to "v" *before* the accents are stripped,
 * because NFD would otherwise turn ü into a plain u and silently merge lǜ with
 * lù — two genuinely different readings.
 */
export function pinyinKey(pinyin: string): string {
  return pinyin
    .normalize('NFC')
    .toLowerCase()
    .replace(/[üǖǘǚǜ]/g, 'v')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '');
}

function entryKey(entry: ParsedEntry | DictEntry): string {
  return `${entry.simplified}|${pinyinKey(entry.pinyin)}`;
}

function union(existing: string[] | undefined, incoming: string[]): string[] {
  const out = [...(existing ?? [])];
  for (const gloss of incoming) {
    if (!out.includes(gloss)) out.push(gloss);
  }
  return out.slice(0, MAX_GLOSSES);
}

/**
 * Folds CFDICT into CC-CEDICT. English entries keep their order and are the
 * spine of the result; French entries either attach to a matching reading or
 * are appended as French-only entries, which about 8,700 of them are.
 */
export function mergeDictionaries(en: ParsedEntry[], fr: ParsedEntry[]): DictEntry[] {
  const merged: DictEntry[] = en.map((entry) => ({
    simplified: entry.simplified,
    traditional: entry.traditional,
    pinyin: entry.pinyin,
    meanings: { en: entry.meanings.slice(0, MAX_GLOSSES) },
  }));

  const byKey = new Map<string, DictEntry[]>();
  for (const entry of merged) {
    const key = entryKey(entry);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(entry);
    else byKey.set(key, [entry]);
  }

  for (const entry of fr) {
    const key = entryKey(entry);
    const matches = byKey.get(key);
    if (matches) {
      for (const match of matches) {
        match.meanings.fr = union(match.meanings.fr, entry.meanings);
      }
      continue;
    }
    const own: DictEntry = {
      simplified: entry.simplified,
      traditional: entry.traditional,
      pinyin: entry.pinyin,
      meanings: { fr: entry.meanings.slice(0, MAX_GLOSSES) },
    };
    merged.push(own);
    // Registered so a later French duplicate unions into it instead of
    // appending a second copy of the same word.
    byKey.set(key, [own]);
  }

  return merged;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dictionary/merge.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Export it**

Add to `src/lib/dictionary/index.ts`:

```ts
export { mergeDictionaries, pinyinKey } from '@/lib/dictionary/merge';
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dictionary
git commit -m "feat(dictionary): merge CFDICT glosses into CC-CEDICT entries"
```

---

### Task 3: Build both dictionaries into the shards

**Files:**
- Modify: `scripts/build-dictionary.ts` (rewritten in full below)
- Modify: `README.md` — the `### Dictionary` section

**Interfaces:**
- Consumes: `mergeDictionaries` from Task 2, `parseCedictLine` and `shardKeyFor`.
- Produces: the CLI contract `npm run build:dict -- <cedict.u8> <cfdict.u8>`, used by the Dockerfile in Task 4.

- [ ] **Step 1: Rewrite the build script**

Replace `scripts/build-dictionary.ts` in full:

```ts
/**
 * Merges CC-CEDICT and CFDICT into per-shard JSON under public/dict/.
 *
 *   curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
 *     | gunzip > /tmp/cedict.u8
 *   curl -L https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip -o /tmp/cfdict.zip
 *   unzip -o -d /tmp /tmp/cfdict.zip
 *   npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8
 *
 * CC-CEDICT is CC BY-SA 4.0 and CFDICT is CC BY-SA 3.0; both attributions live
 * on the Settings page.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeDictionaries } from '../src/lib/dictionary/merge';
import { parseCedictLine } from '../src/lib/dictionary/parse';
import { shardKeyFor } from '../src/lib/dictionary/shard';
import type { DictEntry, ParsedEntry } from '../src/lib/dictionary/types';

/**
 * A CFDICT download that got truncated, redirected to an error page, or
 * silently emptied still produces a perfectly valid English-only dictionary.
 * The floor turns that into a failed build instead of a shipped feature that
 * does nothing. CFDICT carries ~56,000 entries, so this has enormous headroom.
 */
const MIN_FRENCH_ENTRIES = 10_000;

const [cedictPath, cfdictPath] = process.argv.slice(2);
if (!cedictPath || !cfdictPath) {
  console.error('usage: npm run build:dict -- <path-to-cedict.u8> <path-to-cfdict.u8>');
  process.exit(1);
}

async function parseFile(path: string): Promise<{ entries: ParsedEntry[]; skipped: number }> {
  const text = await readFile(path, 'utf8');
  const entries: ParsedEntry[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const entry = parseCedictLine(line);
    if (entry) entries.push(entry);
    else if (line.trim() !== '' && !line.startsWith('#')) skipped++;
  }
  return { entries, skipped };
}

const english = await parseFile(cedictPath);
const french = await parseFile(cfdictPath);
const entries = mergeDictionaries(english.entries, french.entries);

const withFrench = entries.filter((entry) => entry.meanings.fr !== undefined).length;
if (withFrench < MIN_FRENCH_ENTRIES) {
  console.error(
    `only ${withFrench} entries carry French glosses (expected at least ` +
      `${MIN_FRENCH_ENTRIES}) — is ${cfdictPath} complete?`,
  );
  process.exit(1);
}

const outputDir = join(process.cwd(), 'public', 'dict');
const buckets = new Map<string, DictEntry[]>();
for (const entry of entries) {
  const key = shardKeyFor(entry.simplified);
  const bucket = buckets.get(key) ?? [];
  bucket.push(entry);
  buckets.set(key, bucket);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let bytes = 0;
for (const [key, bucket] of buckets) {
  bucket.sort((a, b) => a.simplified.localeCompare(b.simplified));
  const json = JSON.stringify(bucket);
  bytes += json.length;
  await writeFile(join(outputDir, `${key}.json`), json, 'utf8');
}

console.log(
  `${entries.length} entries (${withFrench} with French), ` +
    `${english.skipped + french.skipped} skipped, ${buckets.size} shards, ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB total, ` +
    `${(bytes / buckets.size / 1024).toFixed(0)} KB average shard`,
);
```

- [ ] **Step 2: Typecheck the script**

Run: `npm run typecheck`
Expected: both passes clean. The second pass (`-p tsconfig.scripts.json`) is the one covering `scripts/`.

- [ ] **Step 3: Run it against the real dictionaries**

```bash
curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
  | gunzip > /tmp/cedict.u8
curl -L https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip -o /tmp/cfdict.zip
unzip -o -d /tmp /tmp/cfdict.zip
npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8
```

Expected: a summary line reporting roughly `133000 entries (56000 with French)` across 128 shards. The French count must be in the tens of thousands — if it is near zero the merge key is wrong, not the download.

- [ ] **Step 4: Confirm the missing-argument guard**

Run: `npm run build:dict -- /tmp/cedict.u8`
Expected: exit code 1 and the usage line, with `public/dict` left untouched.

- [ ] **Step 5: Update the README dictionary section**

In `README.md`, replace the body of `### Dictionary` with:

````markdown
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
````

- [ ] **Step 6: Commit**

```bash
git add scripts/build-dictionary.ts README.md
git commit -m "feat(dictionary): build shards from CC-CEDICT and CFDICT together"
```

---

### Task 4: Ship CFDICT in the image

**Files:**
- Modify: `Dockerfile:12-24`
- Modify: `README.md` — the "Refreshing the dictionary" section

**Interfaces:**
- Consumes: the two-argument `build:dict` CLI from Task 3.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the CFDICT layer**

In `Dockerfile`, replace the `ARG CEDICT_URL` line and the `RUN apk add` block that follows it with:

```dockerfile
ARG CEDICT_URL=https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
ARG CFDICT_URL=https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip
RUN apk add --no-cache curl unzip \
 && curl -fsSL "${CEDICT_URL%%#*}" | gunzip > /tmp/cedict.u8 \
 && test -s /tmp/cedict.u8 \
 && curl -fsSL "${CFDICT_URL%%#*}" -o /tmp/cfdict.zip \
 && unzip -o -d /tmp /tmp/cfdict.zip \
 && test -s /tmp/cfdict.u8
```

The comment block above these lines already explains the caching and `${VAR%%#*}` conventions; extend its first sentence to say "CC-CEDICT and CFDICT live in their own early layer" rather than naming only CC-CEDICT.

- [ ] **Step 2: Pass both files to the build**

In the same file, change the build `RUN` to:

```dockerfile
RUN npm run build:dict -- /tmp/cedict.u8 /tmp/cfdict.u8 \
 && test "$(ls -1 public/dict | wc -l)" -gt 100 \
 && npm run build
```

- [ ] **Step 3: Build the image**

Run: `docker build -t chinanki:french .`
Expected: success, taking several minutes. The `build:dict` step must print its summary line with a five-figure French count; the script's own floor fails the build if CFDICT arrived empty.

- [ ] **Step 4: Smoke-test the image**

Run: `./smoke-image.sh --no-build chinanki:french`
Expected: every check passes, including "dictionary shard is JSON with entries" and the shard-count floor.

- [ ] **Step 5: Update the deploy docs**

In `README.md`, under "Refreshing the dictionary", replace the command block and its following paragraph with:

````markdown
Both dictionaries are downloaded during the image build and pinned by Docker's
layer cache, so builds are reproducible. To pick up newer data, bust the cache
on whichever you want to refresh — the URLs share one layer, so refreshing
either re-fetches both:

```bash
docker compose build \
  --build-arg CEDICT_URL="https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz#$(date +%F)" \
  --build-arg CFDICT_URL="https://chine.in/mandarin/dictionnaire/CFDICT/cfdict.zip#$(date +%F)"
docker compose up -d
```
````

Leave the paragraph after it — the one warning that this bypasses `deploy.sh` and leaves no `chinanki:last-good` rollback target — exactly as it is.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile README.md
git commit -m "build: download and ship CFDICT alongside CC-CEDICT"
```

---

### Task 5: Resolve which language to show

**Files:**
- Create: `src/lib/dictionary/glosses.ts`
- Create: `src/lib/dictionary/glosses.test.ts`
- Modify: `src/lib/dictionary/index.ts`

**Interfaces:**
- Consumes: `DictEntry`, `GlossLanguage` from Task 1.
- Produces: `glossesFor(entry: DictEntry, language: GlossLanguage): { meanings: string[]; language: GlossLanguage }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dictionary/glosses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { glossesFor } from '@/lib/dictionary/glosses';
import type { DictEntry } from '@/lib/dictionary/types';

function entry(meanings: DictEntry['meanings']): DictEntry {
  return { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings };
}

describe('glossesFor', () => {
  it('returns the requested language when it is there', () => {
    expect(glossesFor(entry({ en: ['good'], fr: ['bon'] }), 'fr')).toEqual({
      meanings: ['bon'],
      language: 'fr',
    });
  });

  it('falls back to English and says so', () => {
    expect(glossesFor(entry({ en: ['good'] }), 'fr')).toEqual({
      meanings: ['good'],
      language: 'en',
    });
  });

  it('falls back to French and says so', () => {
    expect(glossesFor(entry({ fr: ['bon'] }), 'en')).toEqual({
      meanings: ['bon'],
      language: 'fr',
    });
  });

  it('returns English for an English request', () => {
    expect(glossesFor(entry({ en: ['good'], fr: ['bon'] }), 'en')).toEqual({
      meanings: ['good'],
      language: 'en',
    });
  });

  it('treats an empty gloss list as absent', () => {
    expect(glossesFor(entry({ en: ['good'], fr: [] }), 'fr')).toEqual({
      meanings: ['good'],
      language: 'en',
    });
  });

  it('returns nothing rather than throwing when both are missing', () => {
    expect(glossesFor(entry({}), 'fr')).toEqual({ meanings: [], language: 'fr' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dictionary/glosses.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/dictionary/glosses"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/dictionary/glosses.ts`:

```ts
import type { DictEntry, GlossLanguage } from '@/lib/dictionary/types';

/**
 * The glosses to show for one entry, and which language they turned out to be.
 *
 * Coverage is uneven in both directions — only about 39% of CC-CEDICT
 * headwords have a French entry, and some 8,700 French entries have no English
 * counterpart — so either language can be the missing one. Falling back keeps
 * a suggestion row from rendering blank for a word the dictionary does have,
 * and returning the language lets the caller mark the row.
 */
export function glossesFor(
  entry: DictEntry,
  language: GlossLanguage,
): { meanings: string[]; language: GlossLanguage } {
  const wanted = entry.meanings[language];
  if (wanted && wanted.length > 0) return { meanings: wanted, language };

  const other: GlossLanguage = language === 'en' ? 'fr' : 'en';
  const fallback = entry.meanings[other];
  if (fallback && fallback.length > 0) return { meanings: fallback, language: other };

  return { meanings: [], language };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dictionary/glosses.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Export it**

Add to `src/lib/dictionary/index.ts`:

```ts
export { glossesFor } from '@/lib/dictionary/glosses';
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/dictionary
git commit -m "feat(dictionary): resolve gloss language with a symmetric fallback"
```

---

### Task 6: The suggestion language setting

**Files:**
- Modify: `src/lib/db/types.ts` — `AppSettings`
- Modify: `src/lib/db/settings.ts` — `DEFAULT_SETTINGS`
- Modify: `src/pages/SettingsPage.tsx`
- Test: `src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `GlossLanguage` from Task 1.
- Produces: `AppSettings.suggestionLanguage: GlossLanguage`, defaulting to `'en'`.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/SettingsPage.test.tsx`, inside `describe('SettingsPage')`:

```tsx
  it('changes the suggestion language', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Suggestion language'), 'fr');
    await waitFor(async () => expect((await getSettings()).suggestionLanguage).toBe('fr'));
  });

  it('carries the CFDICT attribution', async () => {
    renderPage();
    expect(await screen.findByText(/CFDICT/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 3.0/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — both new tests, on `Unable to find a label with the text of: Suggestion language` and `Unable to find an element with the text: /CFDICT/`.

- [ ] **Step 3: Add the setting to the type**

In `src/lib/db/types.ts`, add `import type { GlossLanguage } from '@/lib/dictionary/types';` at the top — import the module directly rather than the `@/lib/dictionary` barrel, which would pull the fetch-owning lookup module into every consumer of the database types — then add to `AppSettings`:

```ts
  /** Language of the dictionary suggestions in the note editor. */
  suggestionLanguage: GlossLanguage;
```

- [ ] **Step 4: Add the default**

In `src/lib/db/settings.ts`, add to `DEFAULT_SETTINGS`, after `colourHanzi`:

```ts
  suggestionLanguage: 'en',
```

`getSettings` already spreads `DEFAULT_SETTINGS` over the stored row, so existing rows and imported pre-change backups pick this up with no migration — do not write one.

- [ ] **Step 5: Add the control**

In `src/pages/SettingsPage.tsx`, directly after the closing `</Field>` of the Theme field, add:

```tsx
        <Field label="Suggestion language" hint="Which language the dictionary suggestions show.">
          <select
            className={inputClass}
            value={settings.suggestionLanguage}
            onChange={(event) =>
              update({ suggestionLanguage: event.target.value as typeof settings.suggestionLanguage })
            }
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </Field>
```

- [ ] **Step 6: Add the attribution**

In the credits section of the same file, directly after the paragraph carrying the CC-CEDICT link, add:

```tsx
          <p>
            French glosses from CFDICT, licensed CC BY-SA 3.0.{' '}
            <a
              className="underline"
              href="https://chine.in/mandarin/dictionnaire/CFDICT/"
              target="_blank"
              rel="noreferrer"
            >
              chine.in
            </a>
          </p>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS, including the pre-existing CC-CEDICT attribution test.

- [ ] **Step 8: Run everything**

Run: `npm test && npm run typecheck`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(settings): choose the dictionary suggestion language"
```

---

### Task 7: Show the chosen language in the editor

**Files:**
- Modify: `src/components/DictionarySuggestions.tsx` (rewritten in full below)
- Modify: `src/pages/NoteEditorPage.tsx` — `applySuggestion`
- Create: `src/components/DictionarySuggestions.test.tsx`

**Interfaces:**
- Consumes: `glossesFor` (Task 5), `AppSettings.suggestionLanguage` (Task 6), `useSettings`.
- Produces: `onPick: (entry: DictEntry, meaning: string) => void` — the resolved gloss string is passed alongside the entry so the editor never re-resolves it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/DictionarySuggestions.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DictionarySuggestions from '@/components/DictionarySuggestions';
import { db } from '@/lib/db/db';
import { saveSettings } from '@/lib/db/settings';
import { clearDictionaryCache, setDictionaryFetch } from '@/lib/dictionary';

const ENTRIES = [
  { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'], fr: ['bon'] } },
  { simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] } },
  { simplified: '好客', traditional: '好客', pinyin: 'hào kè', meanings: { fr: ['hospitalier'] } },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearDictionaryCache();
  setDictionaryFetch(
    vi.fn(async () => ({ ok: true, json: async () => ENTRIES }) as Response) as typeof fetch,
  );
});

describe('DictionarySuggestions', () => {
  it('shows English glosses by default, unbadged', async () => {
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('good')).toBeInTheDocument();
    // Nothing fell back *to* English, so no row carries an "en" badge — the
    // French-only 好客 row does carry an "fr" one.
    expect(screen.queryByText('en')).not.toBeInTheDocument();
  });

  it('shows French glosses when French is chosen', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('bon')).toBeInTheDocument();
  });

  it('badges a row that fell back to the other language', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('good person')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('falls back to French for an English reader when there is no English', async () => {
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('hospitalier')).toBeInTheDocument();
    expect(screen.getByText('fr')).toBeInTheDocument();
  });

  it('passes the resolved meaning to onPick', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<DictionarySuggestions query="好" onPick={onPick} />);

    await user.click(await screen.findByRole('button', { name: /bon/ }));
    expect(onPick).toHaveBeenCalledWith(ENTRIES[0], 'bon');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/DictionarySuggestions.test.tsx`
Expected: FAIL — the badge and French tests fail because the component still reads `meanings.en` unconditionally, and the `onPick` test fails on the argument count.

- [ ] **Step 3: Rewrite the component**

Replace `src/components/DictionarySuggestions.tsx` in full:

```tsx
import { useEffect, useState } from 'react';
import { glossesFor, lookupPrefix } from '@/lib/dictionary';
import type { DictEntry } from '@/lib/dictionary';
import { useSettings } from '@/hooks/useSettings';
import PinyinText from '@/components/PinyinText';

/** Debounced prefix search. Renders nothing until there is something to show. */
export default function DictionarySuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (entry: DictEntry, meaning: string) => void;
}) {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<DictEntry[]>([]);

  useEffect(() => {
    if (query.trim() === '') {
      setEntries([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await lookupPrefix(query, 8);
      if (!cancelled) setEntries(results);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (entries.length === 0) return null;

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
      {entries.map((entry) => {
        const gloss = glossesFor(entry, settings.suggestionLanguage);
        const meaning = gloss.meanings.join('; ');
        return (
          // Merged entries can share a headword across readings, so the
          // simplified form alone is no longer unique.
          <li key={`${entry.simplified}|${entry.pinyin}`}>
            <button
              type="button"
              onClick={() => onPick(entry, meaning)}
              className="flex w-full min-h-11 items-baseline gap-2 px-3 py-2 text-left"
            >
              <span className="text-lg">{entry.simplified}</span>
              <PinyinText pinyin={entry.pinyin} className="text-sm" />
              <span className="flex-1 truncate text-sm text-slate-500">{meaning}</span>
              {gloss.language !== settings.suggestionLanguage && (
                <span className="rounded bg-slate-100 px-1 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {gloss.language}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Take the resolved meaning in the editor**

In `src/pages/NoteEditorPage.tsx`, replace `applySuggestion`:

```ts
  /**
   * Overwrites all three fields. Picking a second suggestion must visibly
   * correct a wrong first pick, which a fill-only-if-blank rule cannot do.
   * The meaning is resolved by the suggestion list, which owns the language
   * choice — re-resolving it here would let the two disagree.
   */
  function applySuggestion(entry: DictEntry, meaning: string) {
    setHanzi(entry.simplified);
    setPinyin(entry.pinyin);
    setMeaning(meaning);
  }
```

The JSX using it is unchanged.

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run src/components/DictionarySuggestions.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole suite and the typechecks**

Run: `npm test && npm run typecheck`
Expected: green, including the existing `NoteEditorPage` suggestion tests — they assert English glosses under the default setting, which is unchanged behaviour.

- [ ] **Step 7: Check it in the real app**

```bash
npm run dev
```

With shards built from Task 3: open a deck, add a word, type `好`, and confirm English glosses. Then Settings → Suggestion language → Français, return to the editor, and confirm French glosses appear with an `en` badge on rows CFDICT lacks.

- [ ] **Step 8: Commit**

```bash
git add src/components/DictionarySuggestions.tsx src/components/DictionarySuggestions.test.tsx src/pages/NoteEditorPage.tsx
git commit -m "feat(editor): show suggestions in the chosen language"
```

---

## Verification

After Task 7, the whole feature is in place. Full check:

```bash
npm run typecheck && npm test && npm run test:e2e && npm run build
```

E2E is unaffected — the flows it covers do not depend on gloss language — but it must still pass. Note the README's warning about running E2E during the 03:59–04:01 rollover window.
