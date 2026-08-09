import { describe, expect, it } from 'vitest';
import { glossesFor } from '@/lib/dictionary/glosses';
import type { DictEntry } from '@/lib/dictionary/types';

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
