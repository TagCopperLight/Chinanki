import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDictionaryCache,
  lookupExact,
  lookupPrefix,
  setDictionaryFetch,
} from '@/lib/dictionary/lookup';
import { shardKeyFor } from '@/lib/dictionary/shard';
import type { DictEntry } from '@/lib/dictionary/types';

const HAO: DictEntry = { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: ['good'] };
const HAOREN: DictEntry = {
  simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: ['good person'],
};
const HAOCHI: DictEntry = {
  simplified: '好吃', traditional: '好吃', pinyin: 'hǎo chī', meanings: ['tasty'],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearDictionaryCache();
  fetchMock = vi.fn(async (url: string) => {
    const expected = `/dict/${shardKeyFor('好')}.json`;
    const body = url === expected ? [HAO, HAOREN, HAOCHI] : [];
    return { ok: true, json: async () => body } as Response;
  });
  setDictionaryFetch(fetchMock as unknown as typeof fetch);
});

describe('lookupExact', () => {
  it('finds an entry by its simplified form', async () => {
    expect(await lookupExact('好')).toEqual(HAO);
  });

  it('returns null when the word is absent', async () => {
    expect(await lookupExact('蛋')).toBeNull();
  });

  it('returns null for an empty query', async () => {
    expect(await lookupExact('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches each shard at most once', async () => {
    await lookupExact('好');
    await lookupExact('好人');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and does not throw when the shard is missing', async () => {
    setDictionaryFetch((async () => ({ ok: false }) as Response) as typeof fetch);
    clearDictionaryCache();
    expect(await lookupExact('好')).toBeNull();
  });

  it('retries a shard whose first fetch failed instead of caching the failure', async () => {
    let calls = 0;
    setDictionaryFetch((async () => {
      calls++;
      if (calls === 1) return { ok: false } as Response;
      return { ok: true, json: async () => [HAO] } as Response;
    }) as unknown as typeof fetch);
    clearDictionaryCache();

    expect(await lookupExact('好')).toBeNull();
    expect(await lookupExact('好')).toEqual(HAO);
    expect(calls).toBe(2);
  });
});

describe('lookupPrefix', () => {
  it('returns entries starting with the prefix, shortest first', async () => {
    const results = await lookupPrefix('好');
    expect(results.map((e) => e.simplified)).toEqual(['好', '好人', '好吃']);
  });

  it('respects the limit', async () => {
    expect(await lookupPrefix('好', 2)).toHaveLength(2);
  });

  it('returns an empty array for an empty query', async () => {
    expect(await lookupPrefix('')).toEqual([]);
  });
});
