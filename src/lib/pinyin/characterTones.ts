import { parseAccentedPinyin } from '@/lib/pinyin/accented';
import type { Tone } from '@/lib/pinyin/types';

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
