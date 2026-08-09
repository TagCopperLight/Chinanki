import { describe, expect, it } from 'vitest';
import { characterTones } from '@/lib/pinyin';

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
