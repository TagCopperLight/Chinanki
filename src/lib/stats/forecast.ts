import { DAY_MS, startOfStudyDay, studyDayKey } from '@/lib/time';
import type { Card } from '@/lib/db/types';
import type { ForecastDay } from '@/lib/stats/types';

/** Upcoming workload. Overdue cards all land on day 0. New cards are not scheduled. */
export function buildForecast(
  cards: Card[],
  now: number,
  rolloverHour: number,
  days = 30,
): ForecastDay[] {
  const today = startOfStudyDay(now, rolloverHour);
  const counts = new Array<number>(days).fill(0);

  for (const card of cards) {
    if (card.suspended === 1 || card.state === 'new') continue;
    const offset = Math.floor((startOfStudyDay(card.due, rolloverHour) - today) / DAY_MS);
    const index = Math.max(0, offset);
    if (index < days) counts[index] = counts[index]! + 1;
  }

  let running = 0;
  return counts.map((dueCount, index) => {
    running += dueCount;
    return { date: studyDayKey(today + index * DAY_MS, rolloverHour), dueCount, cumulative: running };
  });
}
