import { describe, expect, it } from 'vitest';
import { retentionByMonth, retentionOverall } from '@/lib/stats/retention';
import type { CardState, ReviewLog } from '@/lib/db/types';

function review(rating: 1 | 2 | 3 | 4, stateBefore: CardState, reviewedAt = Date.UTC(2026, 2, 15)): ReviewLog {
  return {
    cardId: 1, noteId: 1, deckId: 1, direction: 'hanzi-meaning', rating, stateBefore,
    stateAfter: 'review', reviewedAt, elapsedDays: 3, scheduledDays: 5,
    stabilityAfter: 5, difficultyAfter: 5, durationMs: 100,
  };
}

describe('retentionOverall', () => {
  it('counts only reviews of cards that were already in the review state', () => {
    const reviews = [
      review(3, 'review'),
      review(1, 'review'),
      review(1, 'learning'), // learning failures are not lapses
      review(3, 'new'),
    ];
    expect(retentionOverall(reviews)).toEqual({ reviewed: 2, correct: 1, rate: 0.5 });
  });

  it('treats Hard, Good and Easy as correct and Again as incorrect', () => {
    const reviews = [review(2, 'review'), review(3, 'review'), review(4, 'review'), review(1, 'review')];
    expect(retentionOverall(reviews).rate).toBe(0.75);
  });

  it('counts relearning reviews too', () => {
    expect(retentionOverall([review(3, 'relearning')]).reviewed).toBe(1);
  });

  it('reports a rate of 0 when there is nothing to measure', () => {
    expect(retentionOverall([])).toEqual({ reviewed: 0, correct: 0, rate: 0 });
  });
});

describe('retentionByMonth', () => {
  it('groups by calendar month, oldest first', () => {
    const reviews = [
      review(3, 'review', Date.UTC(2026, 0, 10)),
      review(1, 'review', Date.UTC(2026, 0, 20)),
      review(3, 'review', Date.UTC(2026, 1, 5)),
    ];
    const months = retentionByMonth(reviews);
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02']);
    expect(months[0]!.rate).toBe(0.5);
    expect(months[1]!.rate).toBe(1);
    expect(months[0]!.reviewed).toBe(2);
  });

  it('omits months with no measurable reviews', () => {
    expect(retentionByMonth([review(3, 'new')])).toEqual([]);
  });
});
