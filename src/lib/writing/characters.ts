import { characterTones } from '@/lib/pinyin';
import type { Tone } from '@/lib/pinyin';

export interface DrawableCharacter {
  character: string;
  /** For tinting the ghost at reveal; null when the pinyin does not line up. */
  tone: Tone | null;
}

/**
 * The characters the learner has to draw: one per code point, whitespace
 * dropped. Tones are resolved before the filter so they stay aligned with the
 * pinyin even when the hanzi field contains spaces.
 */
export function drawableCharacters(hanzi: string, pinyin: string): DrawableCharacter[] {
  const tones = characterTones(hanzi, pinyin);
  return [...hanzi]
    .map((character, index) => ({ character, tone: tones[index] ?? null }))
    .filter((item) => item.character.trim() !== '');
}
