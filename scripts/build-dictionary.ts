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
