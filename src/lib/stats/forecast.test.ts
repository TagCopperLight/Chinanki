import { describe, expect, it } from 'vitest';
import { buildForecast } from '@/lib/stats/forecast';
import type { Card } from '@/lib/db/types';

const DAY = 86_400_000;
function noon(daysAhead: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime() + daysAhead * DAY;
}
const NOW = noon(0);

function card(due: number, overrides: Partial<Card> = {}): Card {
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
    const forecast = buildForecast([card(noon(1)), card(noon(1)), card(noon(3))], NOW, 4, 5);
    expect(forecast[1]!.dueCount).toBe(2);
    expect(forecast[3]!.dueCount).toBe(1);
    expect(forecast[2]!.dueCount).toBe(0);
  });

  it('counts overdue cards as due today', () => {
    expect(buildForecast([card(noon(-5))], NOW, 4, 5)[0]!.dueCount).toBe(1);
  });

  it('accumulates the running total', () => {
    const forecast = buildForecast([card(noon(0)), card(noon(1)), card(noon(2))], NOW, 4, 4);
    expect(forecast.map((day) => day.cumulative)).toEqual([1, 2, 3, 3]);
  });

  it('ignores new and suspended cards', () => {
    const forecast = buildForecast(
      [card(noon(1), { state: 'new' }), card(noon(1), { suspended: 1 }), card(noon(1))],
      NOW, 4, 3,
    );
    expect(forecast[1]!.dueCount).toBe(1);
  });

  it('ignores cards due beyond the window', () => {
    expect(buildForecast([card(noon(60))], NOW, 4, 30).at(-1)!.cumulative).toBe(0);
  });
});
