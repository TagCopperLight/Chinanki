import { describe, expect, it } from 'vitest';
import {
  applyToneMark,
  parseAccentedPinyin,
  numberedToAccented,
  parseNumberedPinyin,
  characterTones,
} from '@/lib/pinyin';

describe('applyToneMark', () => {
  it('leaves neutral tone unmarked', () => {
    expect(applyToneMark('ma', 0)).toBe('ma');
  });

  it('marks the "a" when present', () => {
    expect(applyToneMark('hao', 3)).toBe('hǎo');
    expect(applyToneMark('shuang', 1)).toBe('shuāng');
  });

  it('prefers "o" over "e" when there is no "a"', () => {
    expect(applyToneMark('guo', 2)).toBe('guó');
    expect(applyToneMark('zhou', 1)).toBe('zhōu');
  });

  it('marks the "e" when there is no "a" or "o"', () => {
    expect(applyToneMark('xie', 4)).toBe('xiè');
    expect(applyToneMark('bei', 3)).toBe('běi');
  });

  it('marks the last vowel for iu / ui', () => {
    expect(applyToneMark('liu', 4)).toBe('liù');
    expect(applyToneMark('gui', 4)).toBe('guì');
  });

  it('normalises u: and v to ü', () => {
    expect(applyToneMark('lu:', 4)).toBe('lǜ');
    expect(applyToneMark('nv', 3)).toBe('nǚ');
    expect(applyToneMark('lu:e', 4)).toBe('lüè');
  });

  it('returns tokens with no vowels unchanged', () => {
    expect(applyToneMark('hm', 2)).toBe('hm');
  });
});

describe('parseAccentedPinyin', () => {
  it('detects tones from the accented vowel', () => {
    expect(parseAccentedPinyin('nǐ hǎo')).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: ' ', tone: null },
      { text: 'hǎo', tone: 3 },
    ]);
  });

  it('reports unaccented syllables as neutral', () => {
    expect(parseAccentedPinyin('de')).toEqual([{ text: 'de', tone: 0 }]);
  });

  it('keeps apostrophes and hyphens as separators', () => {
    expect(parseAccentedPinyin("xī'ān")).toEqual([
      { text: 'xī', tone: 1 },
      { text: "'", tone: null },
      { text: 'ān', tone: 1 },
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseAccentedPinyin('')).toEqual([]);
  });

  it('keeps a capitalized accented syllable as one token with the correct tone', () => {
    // markIndex() finds the "a" first, so the tone mark lands on the second
    // letter of "Anhui" -> "Ānhuī" tone comes from "ā" (tone 1); the whole
    // word must survive as a single token, not be split at the accented "Ā".
    expect(parseAccentedPinyin('Ānhuī')).toEqual([{ text: 'Ānhuī', tone: 1 }]);
  });

  it('handles mixed-case multi-syllable proper nouns', () => {
    expect(parseAccentedPinyin('Běijīng')).toEqual([{ text: 'Běijīng', tone: 3 }]);
  });
});

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

describe('characterTones', () => {
  it('gives each character the tone of its syllable', () => {
    expect(characterTones('你好', 'nǐ hǎo')).toEqual([3, 3]);
    expect(characterTones('妈麻马骂吗', 'mā má mǎ mà ma')).toEqual([1, 2, 3, 4, 0]);
  });

  it('colours nothing when the counts disagree', () => {
    expect(characterTones('一点儿', 'yī diǎnr')).toEqual([null, null, null]);
  });

  it('returns one entry per code point', () => {
    expect(characterTones('', '')).toEqual([]);
    expect(characterTones('好', '')).toEqual([null]);
  });
});
