export type GlossLanguage = 'en' | 'fr';

/** One dictionary line, parsed but not yet merged with the other language. */
export interface ParsedEntry {
  simplified: string;
  traditional: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  meanings: string[];
}

/**
 * A merged entry as shipped in the shards. At least one language is present
 * and non-empty; coverage is uneven in both directions, so neither is
 * guaranteed on its own.
 */
export interface DictEntry {
  simplified: string;
  traditional: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  meanings: Partial<Record<GlossLanguage, string[]>>;
}
