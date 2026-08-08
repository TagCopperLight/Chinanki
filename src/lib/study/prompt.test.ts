import { describe, expect, it } from 'vitest';
import { answerFor, promptFor } from '@/lib/study/prompt';
import { ALL_DIRECTIONS } from '@/lib/db/types';

describe('promptFor / answerFor', () => {
  it('maps each direction to its prompt and answer field', () => {
    expect(promptFor('hanzi-meaning')).toBe('hanzi');
    expect(answerFor('hanzi-meaning')).toBe('meaning');
    expect(promptFor('hanzi-pinyin')).toBe('hanzi');
    expect(answerFor('hanzi-pinyin')).toBe('pinyin');
    expect(promptFor('meaning-pinyin')).toBe('meaning');
    expect(answerFor('meaning-pinyin')).toBe('pinyin');
    expect(promptFor('pinyin-meaning')).toBe('pinyin');
    expect(answerFor('pinyin-meaning')).toBe('meaning');
  });

  it('never prompts for the hanzi as an answer', () => {
    for (const direction of ALL_DIRECTIONS) {
      expect(answerFor(direction)).not.toBe('hanzi');
    }
  });
});
