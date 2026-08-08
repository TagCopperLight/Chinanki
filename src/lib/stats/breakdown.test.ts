import { describe, expect, it } from 'vitest';
import { cardBreakdown } from '@/lib/stats/breakdown';
import type { Card } from '@/lib/db/types';

function card(overrides: Partial<Card>): Card {
  return {
    noteId: 1, deckId: 1, direction: 'hanzi-meaning', suspended: 0, state: 'new',
    stability: 0, difficulty: 0, due: 0, lastReview: null, reps: 0, lapses: 0,
    learningStep: 0, scheduledDays: 0, ...overrides,
  };
}

describe('cardBreakdown', () => {
  it('splits review cards into young and mature at 21 days', () => {
    const cards = [
      card({ state: 'review', scheduledDays: 20 }),
      card({ state: 'review', scheduledDays: 21 }),
      card({ state: 'review', scheduledDays: 100 }),
    ];
    expect(cardBreakdown(cards)).toMatchObject({ young: 1, mature: 2 });
  });

  it('counts new, learning and relearning', () => {
    const cards = [
      card({ state: 'new' }),
      card({ state: 'learning' }),
      card({ state: 'relearning' }),
    ];
    expect(cardBreakdown(cards)).toMatchObject({ new: 1, learning: 2 });
  });

  it('counts suspended cards separately and excludes them from the other buckets', () => {
    const cards = [card({ state: 'review', scheduledDays: 30, suspended: 1 }), card({ state: 'new' })];
    expect(cardBreakdown(cards)).toEqual({
      new: 1, learning: 0, young: 0, mature: 0, suspended: 1,
    });
  });

  it('returns all zeroes for no cards', () => {
    expect(cardBreakdown([])).toEqual({ new: 0, learning: 0, young: 0, mature: 0, suspended: 0 });
  });
});
