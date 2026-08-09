import { characterTones } from '@/lib/pinyin';
import type { Tone } from '@/lib/pinyin';

export interface DrawableCharacter {
  character: string;
  /** For tinting the ghost at reveal; null when the pinyin does not line up. */
  tone: Tone | null;
}

/**
 * The characters the learner has to draw: one per code point, whitespace
 * dropped. Tones are resolved before the filter, so a character and its tone
 * stay paired up. But whitespace in hanzi inflates the code-point count
 * characterTones compares against the syllable count, so hanzi containing
 * whitespace comes back with no tones at all (every entry null) and its
 * ghost is left untinted.
 */
export function drawableCharacters(hanzi: string, pinyin: string): DrawableCharacter[] {
  const tones = characterTones(hanzi, pinyin);
  return [...hanzi]
    .map((character, index) => ({ character, tone: tones[index] ?? null }))
    .filter((item) => item.character.trim() !== '');
}
