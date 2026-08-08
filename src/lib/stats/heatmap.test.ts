import { describe, expect, it } from 'vitest';
import { buildHeatmap, currentStreak, reviewsPerDayAverage } from '@/lib/stats/heatmap';
import type { ReviewLog } from '@/lib/db/types';

const DAY = 86_400_000;
/** Noon local time, so a rollover hour of 4 never pushes it into another day. */
function noon(daysAgo: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime() - daysAgo * DAY;
}

function review(reviewedAt: number, rating: 1 | 2 | 3 | 4 = 3): ReviewLog {
  return {
    cardId: 1, noteId: 1, deckId: 1, direction: 'hanzi-meaning', rating,
    stateBefore: 'review', stateAfter: 'review', reviewedAt, elapsedDays: 1,
    scheduledDays: 2, stabilityAfter: 2, difficultyAfter: 5, durationMs: 100,
  };
}

const NOW = noon(0);

describe('buildHeatmap', () => {
  it('returns one entry per day, oldest first, ending today', () => {
    const days = buildHeatmap([], NOW, 4, 7);
    expect(days).toHaveLength(7);
    expect(days[6]!.date).toBe(days.at(-1)!.date);
    expect(new Date(days[0]!.date).getTime()).toBeLessThan(new Date(days[6]!.date).getTime());
  });

  it('counts reviews into their study day', () => {
    const days = buildHeatmap([review(noon(1)), review(noon(1)), review(NOW)], NOW, 4, 3);
    expect(days.at(-1)!.count).toBe(1);
    expect(days.at(-2)!.count).toBe(2);
    expect(days.at(-3)!.count).toBe(0);
  });

  it('ignores reviews older than the window', () => {
    expect(buildHeatmap([review(noon(30))], NOW, 4, 7).reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });

  it('assigns level 0 to empty days and 1-4 to busy ones', () => {
    const reviews = [
      review(noon(3)),
      ...Array.from({ length: 40 }, () => review(noon(1))),
    ];
    const days = buildHeatmap(reviews, NOW, 4, 5);
    expect(days.find((d) => d.count === 0)?.level).toBe(0);
    expect(days.find((d) => d.count === 1)?.level).toBe(1);
    expect(days.find((d) => d.count === 40)?.level).toBe(4);
  });
});

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak([review(NOW), review(noon(1)), review(noon(2))], NOW, 4)).toBe(3);
  });

  it('still counts a streak that has not been extended today yet', () => {
    expect(currentStreak([review(noon(1)), review(noon(2))], NOW, 4)).toBe(2);
  });

  it('breaks when a day is missed', () => {
    expect(currentStreak([review(NOW), review(noon(2))], NOW, 4)).toBe(1);
  });

  it('is 0 when there are no reviews', () => {
    expect(currentStreak([], NOW, 4)).toBe(0);
  });

  it('is 0 when the last review was more than a day ago', () => {
    expect(currentStreak([review(noon(3))], NOW, 4)).toBe(0);
  });
});

describe('reviewsPerDayAverage', () => {
  it('divides the reviews in the window by the number of days', () => {
    expect(reviewsPerDayAverage([review(NOW), review(NOW), review(noon(1))], NOW, 4, 3)).toBeCloseTo(1, 5);
  });

  it('is 0 with no reviews', () => {
    expect(reviewsPerDayAverage([], NOW, 4, 30)).toBe(0);
  });
});
