import { describe, expect, it } from 'vitest';
import { parseCedictLine } from '@/lib/dictionary/parse';

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
});
