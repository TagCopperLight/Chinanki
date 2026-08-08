import { applyToneMark } from '@/lib/pinyin/tones';
import type { PinyinToken, Tone } from '@/lib/pinyin/types';

/** Letters in pinyin syllables (includes ü/Ü). */
const LETTER_CHARS = 'a-zA-ZüÜ';
/** A pinyin syllable in CC-CEDICT notation, e.g. "hao3", "lu:4", "er". */
const SYLLABLE = new RegExp(`^[${LETTER_CHARS}]+(?::)?[a-zA-Z]*[1-5]?$`);
/** Splits into word-ish runs and everything else, keeping both. */
const SPLITTER = new RegExp(`([${LETTER_CHARS}:]+[1-5]?)`);

function isPinyinSyllable(token: string): boolean {
  if (!SYLLABLE.test(token)) return false;
  // A bare uppercase letter such as the "X" in "X光" is not a syllable.
  return /[aeiouüvAEIOUÜV]/.test(token) || /^[nm]g?[1-5]?$/i.test(token);
}

export function parseNumberedPinyin(input: string): PinyinToken[] {
  const tokens: PinyinToken[] = [];
  for (const part of input.split(SPLITTER)) {
    if (part === '') continue;
    if (!isPinyinSyllable(part)) {
      tokens.push({ text: part, tone: null });
      continue;
    }
    const match = /[1-5]$/.exec(part);
    const digit = match ? Number(match[0]) : 5;
    const tone: Tone = digit === 5 ? 0 : (digit as Tone);
    const body = match ? part.slice(0, -1) : part;
    tokens.push({ text: applyToneMark(body, tone), tone });
  }
  return mergeSeparators(tokens);
}

/** Adjacent uncoloured tokens render as one span. */
function mergeSeparators(tokens: PinyinToken[]): PinyinToken[] {
  const merged: PinyinToken[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (token.tone === null && previous && previous.tone === null) {
      previous.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

export function numberedToAccented(input: string): string {
  return parseNumberedPinyin(input)
    .map((token) => token.text)
    .join('');
}
