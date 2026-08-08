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
    const response = await fetchImpl(`/dict/${key}.json`);
    if (!response.ok) throw new Error(`shard ${key} responded ${response.status}`);
    return (await response.json()) as DictEntry[];
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

export async function lookupExact(hanzi: string): Promise<DictEntry | null> {
  const query = hanzi.trim();
  if (query === '') return null;
  const entries = await loadShardSafe(shardKeyFor(query));
  return entries.find((entry) => entry.simplified === query) ?? null;
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
