import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  parseCedictLine,
  mergeDictionaries,
  pinyinKey,
  type ParsedEntry,
  SHARD_COUNT,
  shardKeyFor,
  glossesFor,
  type DictEntry,
  clearDictionaryCache,
  lookupPrefix,
  setDictionaryFetch,
} from '@/lib/dictionary';

describe('parseCedictLine', () => {
  it('parses a standard entry', () => {
    const entry = parseCedictLine('你好 你好 [ni3 hao3] /hello/hi/how are you?/');
    expect(entry).toEqual({
      traditional: '你好',
      simplified: '你好',
      pinyin: 'nǐ hǎo',
      meanings: ['hello', 'hi', 'how are you?'],
    });
  });

  it('keeps traditional and simplified apart', () => {
    const entry = parseCedictLine('漢語 汉语 [Han4 yu3] /Chinese language/');
    expect(entry?.traditional).toBe('漢語');
    expect(entry?.simplified).toBe('汉语');
  });

  it('converts u: to ü in the pinyin', () => {
    expect(parseCedictLine('綠 绿 [lu:4] /green/')?.pinyin).toBe('lǜ');
  });

  it('ignores comments and blank lines', () => {
    expect(parseCedictLine('# comment')).toBeNull();
    expect(parseCedictLine('')).toBeNull();
    expect(parseCedictLine('   ')).toBeNull();
  });

  it('returns null for a malformed line', () => {
    expect(parseCedictLine('nonsense without brackets')).toBeNull();
  });

  it('parses a CFDICT line the same way as a CC-CEDICT one', () => {
    const entry = parseCedictLine('綠 绿 [lu:4] /vert/verdure/');
    expect(entry).toEqual({
      traditional: '綠',
      simplified: '绿',
      pinyin: 'lǜ',
      meanings: ['vert', 'verdure'],
    });
  });
});

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

  it('drops a gloss-less English entry instead of shipping an empty meanings array', () => {
    const merged = mergeDictionaries([parsed('词', 'ci2', [])], []);
    expect(merged).toEqual([]);
  });

  it('drops a gloss-less French entry instead of shipping an empty meanings array', () => {
    const merged = mergeDictionaries([], [parsed('词', 'ci2', [])]);
    expect(merged).toEqual([]);
  });

  it('does not attach an empty French gloss list to a matching English entry', () => {
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', ['good'])],
      [parsed('好', 'hǎo', [])],
    );
    expect(merged).toEqual([
      { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'] } },
    ]);
  });

  it('attaches French to every English entry sharing a reading', () => {
    const merged = mergeDictionaries(
      [parsed('好', 'hǎo', ['good']), parsed('好', 'hǎo', ['fine'])],
      [parsed('好', 'hǎo', ['bon'])],
    );
    expect(merged.map((entry) => entry.meanings.fr)).toEqual([['bon'], ['bon']]);
  });
});

describe('shardKeyFor', () => {
  it('returns a stable two-hex-digit key', () => {
    expect(shardKeyFor('好')).toMatch(/^[0-9a-f]{2}$/);
  });

  it('depends only on the first character', () => {
    expect(shardKeyFor('好')).toBe(shardKeyFor('好人'));
  });

  it('returns "xx" for an empty string', () => {
    expect(shardKeyFor('')).toBe('xx');
  });

  it('spreads common characters over many shards', () => {
    const keys = new Set(
      [...'的一是不了人我在有他这为之大来以个中上们'].map((c) => shardKeyFor(c)),
    );
    expect(keys.size).toBeGreaterThan(5);
  });

  it('never exceeds SHARD_COUNT distinct values', () => {
    const keys = new Set<string>();
    for (let code = 0x4e00; code < 0x4e00 + 2000; code++) {
      keys.add(shardKeyFor(String.fromCodePoint(code)));
    }
    expect(keys.size).toBeLessThanOrEqual(SHARD_COUNT);
  });
});

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

const HAO: DictEntry = {
  simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'] },
};
const HAOREN: DictEntry = {
  simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] },
};
const HAOCHI: DictEntry = {
  simplified: '好吃', traditional: '好吃', pinyin: 'hǎo chī', meanings: { en: ['tasty'] },
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

describe('shard loading', () => {
  it('fetches each shard at most once', async () => {
    await lookupPrefix('好');
    await lookupPrefix('好人');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns nothing and does not throw when the shard is missing', async () => {
    setDictionaryFetch((async () => ({ ok: false }) as Response) as typeof fetch);
    clearDictionaryCache();
    expect(await lookupPrefix('好')).toEqual([]);
  });

  it('retries a shard whose first fetch failed instead of caching the failure', async () => {
    let calls = 0;
    setDictionaryFetch((async () => {
      calls++;
      if (calls === 1) return { ok: false } as Response;
      return { ok: true, json: async () => [HAO] } as Response;
    }) as typeof fetch);
    clearDictionaryCache();

    expect(await lookupPrefix('好')).toEqual([]);
    expect(await lookupPrefix('好')).toEqual([HAO]);
    expect(calls).toBe(2);
  });
});

describe('stale shard shape normalisation', () => {
  const OLD_SHAPE_HAO = { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: ['good'] };

  it('upgrades an old array-shaped shard body', async () => {
    setDictionaryFetch(
      (async () => ({ ok: true, json: async () => [OLD_SHAPE_HAO] }) as Response) as typeof fetch,
    );
    clearDictionaryCache();
    expect(await lookupPrefix('好')).toEqual([HAO]);
  });

  it('passes a shard already in the new shape through untouched', async () => {
    setDictionaryFetch(
      (async () => ({ ok: true, json: async () => [HAO] }) as Response) as typeof fetch,
    );
    clearDictionaryCache();
    expect(await lookupPrefix('好')).toEqual([HAO]);
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
