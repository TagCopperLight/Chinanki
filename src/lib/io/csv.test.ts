import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/lib/io/csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('好,hǎo,good\n水,shuǐ,water')).toEqual([
      ['好', 'hǎo', 'good'],
      ['水', 'shuǐ', 'water'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('好,hǎo,"good, fine"')).toEqual([['好', 'hǎo', 'good, fine']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a,"say ""hi"""')).toEqual([['a', 'say "hi"']]);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n')).toEqual([]);
  });

  it('preserves newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });

  it('throws on an unterminated quoted field at end of input', () => {
    expect(() => parseCsv('好,hǎo,"good\n水,shuǐ,water')).toThrow(/unterminated|quote/i);
  });

  it('treats a lone CR as a row separator', () => {
    expect(parseCsv('a,b\rc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('does not produce a blank row for CRLF', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserves a CR inside a quoted field as literal content', () => {
    expect(parseCsv('a,"line1\rline2"')).toEqual([['a', 'line1\rline2']]);
  });
});

describe('toCsv', () => {
  it('quotes only the fields that need it', () => {
    expect(toCsv([['好', 'good, fine', 'say "hi"']])).toBe('好,"good, fine","say ""hi"""');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['好', 'hǎo', 'good, fine'],
      ['水', 'shuǐ', 'water\nH2O'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
