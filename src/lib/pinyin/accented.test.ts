import { describe, expect, it } from 'vitest';
import { parseAccentedPinyin } from '@/lib/pinyin/accented';

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
