import type { Tone } from '@/lib/pinyin/types';

/** Index into each array is the tone number; index 0 is the unmarked vowel. */
const MARKS: Record<string, readonly string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  'ü': ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

const VOWELS = 'aeiouü';

/** CC-CEDICT writes ü as "u:"; users often type "v". */
export function normaliseUmlaut(syllable: string): string {
  return syllable.replace(/u:/g, 'ü').replace(/v/g, 'ü').replace(/U:/g, 'Ü');
}

/**
 * Standard placement: mark the "a" if there is one, else the "o" or "e",
 * else the last vowel (which handles "iu" → "iù" and "ui" → "uì").
 */
function markIndex(syllable: string): number {
  const a = syllable.indexOf('a');
  if (a >= 0) return a;
  const o = syllable.indexOf('o');
  if (o >= 0) return o;
  const e = syllable.indexOf('e');
  if (e >= 0) return e;
  for (let i = syllable.length - 1; i >= 0; i--) {
    if (VOWELS.includes(syllable[i]!)) return i;
  }
  return -1;
}

export function applyToneMark(syllable: string, tone: Tone): string {
  const normalised = normaliseUmlaut(syllable.toLowerCase());
  if (tone === 0) return normalised;
  const index = markIndex(normalised);
  if (index < 0) return normalised;
  const vowel = normalised[index]!;
  const marked = MARKS[vowel]?.[tone];
  if (!marked) return normalised;
  return normalised.slice(0, index) + marked + normalised.slice(index + 1);
}

/** Reverse lookup: accented vowel → its tone number. Built once at module load. */
const TONE_OF_CHAR = new Map<string, Tone>();
for (const forms of Object.values(MARKS)) {
  for (let tone = 1; tone <= 4; tone++) {
    TONE_OF_CHAR.set(forms[tone]!, tone as Tone);
  }
}

export function toneOfAccentedSyllable(syllable: string): Tone {
  for (const char of syllable) {
    const tone = TONE_OF_CHAR.get(char.toLowerCase());
    if (tone !== undefined) return tone;
  }
  return 0;
}
