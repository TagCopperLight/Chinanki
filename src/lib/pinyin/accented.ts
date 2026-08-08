import { toneOfAccentedSyllable } from '@/lib/pinyin/tones';
import type { PinyinToken } from '@/lib/pinyin/types';

/** Letters, including accented vowels and ü, form syllables; everything else separates. */
const SPLITTER = /([a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+)/;

export function parseAccentedPinyin(input: string): PinyinToken[] {
  const tokens: PinyinToken[] = [];
  for (const part of input.split(SPLITTER)) {
    if (part === '') continue;
    if (SPLITTER.test(part) && /[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(part[0]!)) {
      tokens.push({ text: part, tone: toneOfAccentedSyllable(part) });
    } else {
      tokens.push({ text: part, tone: null });
    }
  }
  return tokens;
}
