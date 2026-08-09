import { describe, expect, it } from 'vitest';
import { drawableCharacters } from '@/lib/writing/characters';

describe('drawableCharacters', () => {
  it('gives one entry per character, carrying its tone', () => {
    expect(drawableCharacters('书店', 'shū diàn')).toEqual([
      { character: '书', tone: 1 },
      { character: '店', tone: 4 },
    ]);
  });

  it('drops whitespace, which is not drawable, and loses tones in the process', () => {
    // The space inflates the code-point count characterTones compares
    // against the syllable count, so it bails out to all-null before this
    // function ever gets to filter the space out.
    const characters = drawableCharacters('你 好', 'nǐ hǎo');
    expect(characters.map((item) => item.character)).toEqual(['你', '好']);
    expect(characters.map((item) => item.tone)).toEqual([null, null]);
  });

  it('keeps characters outside the BMP intact', () => {
    const characters = drawableCharacters('𠮷', '');
    expect(characters).toHaveLength(1);
    expect(characters[0]!.character).toBe('𠮷');
  });

  it('has no tones when the pinyin does not line up', () => {
    expect(drawableCharacters('一点儿', 'yī diǎnr').every((item) => item.tone === null)).toBe(true);
  });

  it('is empty for an empty note', () => {
    expect(drawableCharacters('', '')).toEqual([]);
  });
});
