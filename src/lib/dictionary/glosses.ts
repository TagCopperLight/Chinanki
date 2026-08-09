import type { DictEntry, GlossLanguage } from '@/lib/dictionary/types';

/**
 * The glosses to show for one entry, and which language they turned out to be.
 *
 * Coverage is uneven in both directions — only about 39% of CC-CEDICT
 * headwords have a French entry, and some 8,700 French entries have no English
 * counterpart — so either language can be the missing one. Falling back keeps
 * a suggestion row from rendering blank for a word the dictionary does have,
 * and returning the language lets the caller mark the row.
 */
export function glossesFor(
  entry: DictEntry,
  language: GlossLanguage,
): { meanings: string[]; language: GlossLanguage } {
  const wanted = entry.meanings[language];
  if (wanted && wanted.length > 0) return { meanings: wanted, language };

  const other: GlossLanguage = language === 'en' ? 'fr' : 'en';
  const fallback = entry.meanings[other];
  if (fallback && fallback.length > 0) return { meanings: fallback, language: other };

  return { meanings: [], language };
}
