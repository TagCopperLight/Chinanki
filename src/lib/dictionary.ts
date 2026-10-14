import { numberedToAccented } from '@/lib/pinyin';

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

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;

export function parseCedictLine(line: string): ParsedEntry | null {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  const match = LINE.exec(trimmed);
  if (!match) return null;
  const [, traditional, simplified, pinyin, glosses] = match;
  return {
    traditional: traditional!,
    simplified: simplified!,
    pinyin: numberedToAccented(pinyin!),
    meanings: glosses!.split('/').filter((gloss) => gloss !== ''),
  };
}

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
  // Drop gloss-less lines, or they ship as suggestion rows with a blank meaning.
  const merged: DictEntry[] = en
    .filter((entry) => entry.meanings.length > 0)
    .map((entry) => ({
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
    if (entry.meanings.length === 0) continue;
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

export const SHARD_COUNT = 128;

/**
 * Buckets an entry by its first character so a lookup only downloads one shard.
 * Shared by the build script and the runtime loader — they must never diverge.
 */
export function shardKeyFor(hanzi: string): string {
  const code = hanzi.codePointAt(0);
  if (code === undefined) return 'xx';
  return (code % SHARD_COUNT).toString(16).padStart(2, '0');
}

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

/** Swappable so tests do not need a real network or file server. */
let fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);

export function setDictionaryFetch(fn: typeof fetch): void {
  fetchImpl = fn;
}

const shards = new Map<string, Promise<DictEntry[]>>();

export function clearDictionaryCache(): void {
  shards.clear();
}

function loadShard(key: string): Promise<DictEntry[]> {
  const cached = shards.get(key);
  if (cached) return cached;
  const pending = (async (): Promise<DictEntry[]> => {
    const response = await fetchImpl(`/dict/${key}.json`);
    if (!response.ok) throw new Error(`shard ${key} responded ${response.status}`);
    // Shard URLs are unversioned, so a cache may still hold the old shape
    // (meanings: string[], English only). Upgrade it on read.
    const raw = (await response.json()) as (
      | DictEntry
      | (Omit<DictEntry, 'meanings'> & { meanings: string[] })
    )[];
    return raw.map((e): DictEntry =>
      Array.isArray(e.meanings) ? { ...e, meanings: { en: e.meanings } } : (e as DictEntry),
    );
  })();
  shards.set(key, pending);
  // A failed load must not be cached: evict it so a later lookup can retry.
  // A successful load (even one that legitimately resolves to []) stays cached.
  pending.catch(() => {
    if (shards.get(key) === pending) shards.delete(key);
  });
  return pending;
}

async function loadShardSafe(key: string): Promise<DictEntry[]> {
  try {
    return await loadShard(key);
  } catch {
    // Offline or a transient failure: degrade to "no suggestions" for this call,
    // but do not poison the cache — see loadShard's eviction above.
    return [];
  }
}

export async function lookupPrefix(prefix: string, limit = 20): Promise<DictEntry[]> {
  const query = prefix.trim();
  if (query === '') return [];
  const entries = await loadShardSafe(shardKeyFor(query));
  return entries
    .filter((entry) => entry.simplified.startsWith(query))
    .sort((a, b) => a.simplified.length - b.simplified.length)
    .slice(0, limit);
}
