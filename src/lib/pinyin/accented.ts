import { toneOfAccentedSyllable } from '@/lib/pinyin/tones';
import type { PinyinToken } from '@/lib/pinyin/types';

/** Letters, including accented vowels (both cases) and ü, that make up a syllable. */
const LETTER_CHARS =
  'a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ';
/** Letters, including accented vowels and ü, form syllables; everything else separates. */
const SPLITTER = new RegExp(`([${LETTER_CHARS}]+)`);

export function parseAccentedPinyin(input: string): PinyinToken[] {
  const tokens: PinyinToken[] = [];
  for (const part of input.split(SPLITTER)) {
    if (part === '') continue;
    if (SPLITTER.test(part)) {
      tokens.push({ text: part, tone: toneOfAccentedSyllable(part) });
    } else {
      tokens.push({ text: part, tone: null });
    }
  }
  return tokens;
}
