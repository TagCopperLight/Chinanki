import { describe, expect, it } from 'vitest';
import {
  cardBreakdown,
  buildForecast,
  buildHeatmap,
  currentStreak,
  reviewsPerDayAverage,
  retentionByMonth,
  retentionOverall,
} from '@/lib/stats';
import type { Card, ReviewLog } from '@/lib/db';
import type { CardState } from '@/lib/fsrs';

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

const DAY = 86_400_000;
function noonIn(daysAhead: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime() + daysAhead * DAY;
}
const NOW = noonIn(0);

function dueCard(due: number, overrides: Partial<Card> = {}): Card {
  return {
    noteId: 1, deckId: 1, direction: 'hanzi-meaning', suspended: 0, state: 'review',
    stability: 5, difficulty: 5, due, lastReview: NOW - DAY, reps: 3, lapses: 0,
    learningStep: 0, scheduledDays: 5, ...overrides,
  };
}

describe('buildForecast', () => {
  it('returns one entry per day starting today', () => {
    expect(buildForecast([], NOW, 4, 30)).toHaveLength(30);
  });

  it('buckets cards by their due day', () => {
    const forecast = buildForecast([dueCard(noonIn(1)), dueCard(noonIn(1)), dueCard(noonIn(3))], NOW, 4, 5);
    expect(forecast[1]!.dueCount).toBe(2);
    expect(forecast[3]!.dueCount).toBe(1);
    expect(forecast[2]!.dueCount).toBe(0);
  });

  it('counts overdue cards as due today', () => {
    expect(buildForecast([dueCard(noonIn(-5))], NOW, 4, 5)[0]!.dueCount).toBe(1);
  });

  it('accumulates the running total', () => {
    const forecast = buildForecast([dueCard(noonIn(0)), dueCard(noonIn(1)), dueCard(noonIn(2))], NOW, 4, 4);
    expect(forecast.map((day) => day.cumulative)).toEqual([1, 2, 3, 3]);
  });

  it('ignores new and suspended cards', () => {
    const forecast = buildForecast(
      [dueCard(noonIn(1), { state: 'new' }), dueCard(noonIn(1), { suspended: 1 }), dueCard(noonIn(1))],
      NOW, 4, 3,
    );
    expect(forecast[1]!.dueCount).toBe(1);
  });

  it('ignores cards due beyond the window', () => {
    expect(buildForecast([dueCard(noonIn(60))], NOW, 4, 30).at(-1)!.cumulative).toBe(0);
  });
});

/** Noon local time, so a rollover hour of 4 never pushes it into another day. */
function noonAgo(daysAgo: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime() - daysAgo * DAY;
}

function reviewAt(reviewedAt: number, rating: 1 | 2 | 3 | 4 = 3): ReviewLog {
  return {
    cardId: 1, noteId: 1, deckId: 1, direction: 'hanzi-meaning', rating,
    stateBefore: 'review', stateAfter: 'review', reviewedAt, elapsedDays: 1,
    scheduledDays: 2, stabilityAfter: 2, difficultyAfter: 5, durationMs: 100,
  };
}

describe('buildHeatmap', () => {
  it('returns one entry per day, oldest first, ending today', () => {
    const days = buildHeatmap([], NOW, 4, 7);
    expect(days).toHaveLength(7);
    expect(days[6]!.date).toBe(days.at(-1)!.date);
    expect(new Date(days[0]!.date).getTime()).toBeLessThan(new Date(days[6]!.date).getTime());
  });

  it('counts reviews into their study day', () => {
    const days = buildHeatmap([reviewAt(noonAgo(1)), reviewAt(noonAgo(1)), reviewAt(NOW)], NOW, 4, 3);
    expect(days.at(-1)!.count).toBe(1);
    expect(days.at(-2)!.count).toBe(2);
    expect(days.at(-3)!.count).toBe(0);
  });

  it('ignores reviews older than the window', () => {
    expect(buildHeatmap([reviewAt(noonAgo(30))], NOW, 4, 7).reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });

  it('assigns level 0 to empty days and 1-4 to busy ones', () => {
    const reviews = [
      reviewAt(noonAgo(3)),
      ...Array.from({ length: 40 }, () => reviewAt(noonAgo(1))),
    ];
    const days = buildHeatmap(reviews, NOW, 4, 5);
    expect(days.find((d) => d.count === 0)?.level).toBe(0);
    expect(days.find((d) => d.count === 1)?.level).toBe(1);
    expect(days.find((d) => d.count === 40)?.level).toBe(4);
  });
});

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak([reviewAt(NOW), reviewAt(noonAgo(1)), reviewAt(noonAgo(2))], NOW, 4)).toBe(3);
  });

  it('still counts a streak that has not been extended today yet', () => {
    expect(currentStreak([reviewAt(noonAgo(1)), reviewAt(noonAgo(2))], NOW, 4)).toBe(2);
  });

  it('breaks when a day is missed', () => {
    expect(currentStreak([reviewAt(NOW), reviewAt(noonAgo(2))], NOW, 4)).toBe(1);
  });

  it('is 0 when there are no reviews', () => {
    expect(currentStreak([], NOW, 4)).toBe(0);
  });

  it('is 0 when the last review was more than a day ago', () => {
    expect(currentStreak([reviewAt(noonAgo(3))], NOW, 4)).toBe(0);
  });
});

describe('reviewsPerDayAverage', () => {
  it('divides the reviews in the window by the number of days', () => {
    expect(reviewsPerDayAverage([reviewAt(NOW), reviewAt(NOW), reviewAt(noonAgo(1))], NOW, 4, 3)).toBeCloseTo(1, 5);
  });

  it('is 0 with no reviews', () => {
    expect(reviewsPerDayAverage([], NOW, 4, 30)).toBe(0);
  });
});

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
