import { DAY_MS, startOfStudyDay, studyDayKey } from '@/lib/time';
import type { ReviewLog } from '@/lib/db/types';
import type { HeatmapDay } from '@/lib/stats/types';

/** Thresholds are absolute rather than relative so the colours mean the same thing over time. */
function levelFor(count: number): HeatmapDay['level'] {
  if (count === 0) return 0;
  if (count < 10) return 1;
  if (count < 25) return 2;
  if (count < 40) return 3;
  return 4;
}

export function buildHeatmap(
  reviews: ReviewLog[],
  now: number,
  rolloverHour: number,
  days = 365,
): HeatmapDay[] {
  const counts = new Map<string, number>();
  const oldest = startOfStudyDay(now, rolloverHour) - (days - 1) * DAY_MS;
  for (const review of reviews) {
    if (review.reviewedAt < oldest) continue;
    const key = studyDayKey(review.reviewedAt, rolloverHour);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: HeatmapDay[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const key = studyDayKey(now - offset * DAY_MS, rolloverHour);
    const count = counts.get(key) ?? 0;
    result.push({ date: key, count, level: levelFor(count) });
  }
  return result;
}

/** Consecutive study days with at least one review, allowing today to be still empty. */
export function currentStreak(reviews: ReviewLog[], now: number, rolloverHour: number): number {
  const active = new Set(reviews.map((review) => studyDayKey(review.reviewedAt, rolloverHour)));
  if (active.size === 0) return 0;

  const today = studyDayKey(now, rolloverHour);
  let offset = active.has(today) ? 0 : 1;
  if (!active.has(studyDayKey(now - offset * DAY_MS, rolloverHour))) return 0;

  let streak = 0;
  while (active.has(studyDayKey(now - offset * DAY_MS, rolloverHour))) {
    streak++;
    offset++;
  }
  return streak;
}

export function reviewsPerDayAverage(
  reviews: ReviewLog[],
  now: number,
  rolloverHour: number,
  days: number,
): number {
  const oldest = startOfStudyDay(now, rolloverHour) - (days - 1) * DAY_MS;
  const recent = reviews.filter((review) => review.reviewedAt >= oldest).length;
  return recent / days;
}
