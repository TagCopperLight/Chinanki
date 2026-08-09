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
