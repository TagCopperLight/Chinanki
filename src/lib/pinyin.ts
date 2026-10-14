export type Tone = 0 | 1 | 2 | 3 | 4;

export interface PinyinToken {
  /** The text to render. */
  text: string;
  /** Tone for colouring, or null when this token is a separator / non-pinyin. */
  tone: Tone | null;
}

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

/** Letters, including accented vowels (both cases) and ü, form syllables; everything else separates. */
const ACCENTED_SPLITTER = new RegExp(
  '([a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+)',
);

export function parseAccentedPinyin(input: string): PinyinToken[] {
  const tokens: PinyinToken[] = [];
  for (const part of input.split(ACCENTED_SPLITTER)) {
    if (part === '') continue;
    if (ACCENTED_SPLITTER.test(part)) {
      tokens.push({ text: part, tone: toneOfAccentedSyllable(part) });
    } else {
      tokens.push({ text: part, tone: null });
    }
  }
  return tokens;
}

/** A pinyin syllable in CC-CEDICT notation, e.g. "hao3", "lu:4", "er". */
const NUMBERED_SYLLABLE = /^[a-zA-ZüÜ]+(?::)?[a-zA-Z]*[1-5]?$/;
/** Splits into word-ish runs and everything else, keeping both. */
const NUMBERED_SPLITTER = /([a-zA-ZüÜ:]+[1-5]?)/;

function isPinyinSyllable(token: string): boolean {
  if (!NUMBERED_SYLLABLE.test(token)) return false;
  // A bare uppercase letter such as the "X" in "X光" is not a syllable.
  return /[aeiouüvAEIOUÜV]/.test(token) || /^[nm]g?[1-5]?$/i.test(token);
}

export function parseNumberedPinyin(input: string): PinyinToken[] {
  const tokens: PinyinToken[] = [];
  for (const part of input.split(NUMBERED_SPLITTER)) {
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

/**
 * The tone of each character of `hanzi`, taken from the nth pinyin syllable.
 * When the counts disagree (erhua, punctuation) every character comes back
 * null, because a partial mapping would mis-colour rather than under-colour.
 */
export function characterTones(hanzi: string, pinyin: string): (Tone | null)[] {
  const characters = [...hanzi];
  const syllables = parseAccentedPinyin(pinyin).filter((token) => token.tone !== null);
  if (syllables.length !== characters.length) return characters.map(() => null);
  return syllables.map((syllable) => syllable.tone);
}
