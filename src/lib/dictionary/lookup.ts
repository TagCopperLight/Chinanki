import { shardKeyFor } from '@/lib/dictionary/shard';
import type { DictEntry } from '@/lib/dictionary/types';

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
    try {
      const response = await fetchImpl(`/dict/${key}.json`);
      if (!response.ok) return [];
      return (await response.json()) as DictEntry[];
    } catch {
      // Offline with an uncached shard: degrade to "no suggestions".
      return [];
    }
  })();
  shards.set(key, pending);
  return pending;
}

export async function lookupExact(hanzi: string): Promise<DictEntry | null> {
  const query = hanzi.trim();
  if (query === '') return null;
  const entries = await loadShard(shardKeyFor(query));
  return entries.find((entry) => entry.simplified === query) ?? null;
}

export async function lookupPrefix(prefix: string, limit = 20): Promise<DictEntry[]> {
  const query = prefix.trim();
  if (query === '') return [];
  const entries = await loadShard(shardKeyFor(query));
  return entries
    .filter((entry) => entry.simplified.startsWith(query))
    .sort((a, b) => a.simplified.length - b.simplified.length)
    .slice(0, limit);
}
