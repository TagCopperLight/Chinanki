export interface DictEntry {
  simplified: string;
  traditional: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  meanings: string[];
}
