import { describe, expect, it } from 'vitest';
import { numberedToAccented, parseNumberedPinyin } from '@/lib/pinyin/numbered';

describe('parseNumberedPinyin', () => {
  it('parses syllables with their tones, keeping separators', () => {
    expect(parseNumberedPinyin('ni3 hao3')).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: ' ', tone: null },
      { text: 'hǎo', tone: 3 },
    ]);
  });

  it('treats tone 5 and a missing digit as neutral', () => {
    expect(parseNumberedPinyin('ma5')).toEqual([{ text: 'ma', tone: 0 }]);
    expect(parseNumberedPinyin('de')).toEqual([{ text: 'de', tone: 0 }]);
  });

  it('handles CC-CEDICT umlauts', () => {
    expect(parseNumberedPinyin('lu:4 se4')[0]).toEqual({ text: 'lǜ', tone: 4 });
  });

  it('passes non-pinyin tokens through uncoloured', () => {
    expect(parseNumberedPinyin('X guang1')).toEqual([
      { text: 'X ', tone: null },
      { text: 'guāng', tone: 1 },
    ]);
  });

  it('keeps punctuation as separators', () => {
    expect(parseNumberedPinyin('yi1, er4')).toEqual([
      { text: 'yī', tone: 1 },
      { text: ', ', tone: null },
      { text: 'èr', tone: 4 },
    ]);
  });

  it('handles uppercase Ü in a multi-character token without splitting', () => {
    expect(parseNumberedPinyin('lÜ4')).toEqual([
      { text: 'lǜ', tone: 4 },
    ]);
  });
});

describe('numberedToAccented', () => {
  it('produces a display string', () => {
    expect(numberedToAccented('Zhong1 guo2')).toBe('zhōng guó');
  });
});
