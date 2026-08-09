import { describe, expect, it } from 'vitest';
import { answerFor, isWritingDirection, promptFor } from '@/lib/study/prompt';
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

  it('maps the writing directions to their prompt and answer field', () => {
    expect(promptFor('meaning-hanzi')).toBe('meaning');
    expect(answerFor('meaning-hanzi')).toBe('hanzi');
    expect(promptFor('pinyin-hanzi')).toBe('pinyin');
    expect(answerFor('pinyin-hanzi')).toBe('hanzi');
  });
});

describe('isWritingDirection', () => {
  it('is true exactly for the directions answered by writing the character', () => {
    expect(isWritingDirection('meaning-hanzi')).toBe(true);
    expect(isWritingDirection('pinyin-hanzi')).toBe(true);
    expect(isWritingDirection('hanzi-meaning')).toBe(false);
    expect(isWritingDirection('hanzi-pinyin')).toBe(false);
    expect(isWritingDirection('meaning-pinyin')).toBe(false);
    expect(isWritingDirection('pinyin-meaning')).toBe(false);
  });

  it('covers every direction', () => {
    for (const direction of ALL_DIRECTIONS) {
      expect(typeof isWritingDirection(direction)).toBe('boolean');
    }
  });
});
