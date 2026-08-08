/**
 * Converts CC-CEDICT into per-shard JSON under public/dict/.
 *
 *   curl -L https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz \
 *     | gunzip > cedict.u8
 *   npm run build:dict -- cedict.u8
 *
 * CC-CEDICT is licensed CC BY-SA 4.0; the attribution lives on the Settings page.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCedictLine } from '../src/lib/dictionary/parse';
import { shardKeyFor } from '../src/lib/dictionary/shard';
import type { DictEntry } from '../src/lib/dictionary/types';

const source = process.argv[2];
if (!source) {
  console.error('usage: npm run build:dict -- <path-to-cedict.u8>');
  process.exit(1);
}

const outputDir = join(process.cwd(), 'public', 'dict');
const text = await readFile(source, 'utf8');

const buckets = new Map<string, DictEntry[]>();
let parsed = 0;
let skipped = 0;

for (const line of text.split('\n')) {
  const entry = parseCedictLine(line);
  if (!entry) {
    if (line.trim() !== '' && !line.startsWith('#')) skipped++;
    continue;
  }
  // Trim the long tail of glosses; the editor only ever shows the first few.
  entry.meanings = entry.meanings.slice(0, 6);
  const key = shardKeyFor(entry.simplified);
  const bucket = buckets.get(key) ?? [];
  bucket.push(entry);
  buckets.set(key, bucket);
  parsed++;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let bytes = 0;
for (const [key, entries] of buckets) {
  entries.sort((a, b) => a.simplified.localeCompare(b.simplified));
  const json = JSON.stringify(entries);
  bytes += json.length;
  await writeFile(join(outputDir, `${key}.json`), json, 'utf8');
}

console.log(
  `${parsed} entries, ${skipped} skipped, ${buckets.size} shards, ` +
    `${(bytes / 1024 / 1024).toFixed(1)} MB total, ` +
    `${(bytes / buckets.size / 1024).toFixed(0)} KB average shard`,
);
