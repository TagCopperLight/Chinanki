import { describe, expect, it } from 'vitest';
import { applyToneMark } from '@/lib/pinyin/tones';

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
