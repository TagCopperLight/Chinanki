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
