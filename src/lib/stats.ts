import type { Card, ReviewLog } from '@/lib/db';
import { DAY_MS, startOfStudyDay, studyDayKey } from '@/lib/time';

export interface HeatmapDay {
  /** YYYY-MM-DD study-day key. */
  date: string;
  count: number;
  /** 0 = no reviews, 1–4 = quartile buckets used for colour intensity. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ForecastDay {
  date: string;
  dueCount: number;
  cumulative: number;
}

export interface RetentionSummary {
  reviewed: number;
  correct: number;
  rate: number;
}

export interface CardBreakdown {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
}

/** Anki's convention: a review card is "mature" once its interval reaches 21 days. */
const MATURE_DAYS = 21;

export function cardBreakdown(cards: Card[]): CardBreakdown {
  const breakdown: CardBreakdown = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };

  for (const card of cards) {
    if (card.suspended === 1) {
      breakdown.suspended++;
      continue;
    }
    if (card.state === 'new') breakdown.new++;
    else if (card.state === 'learning' || card.state === 'relearning') breakdown.learning++;
    else if (card.scheduledDays < MATURE_DAYS) breakdown.young++;
    else breakdown.mature++;
  }

  return breakdown;
}

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

/**
 * Only answers to cards that were already scheduled count: failing a card during
 * its first learning steps says nothing about long-term recall.
 */
function isMeasurable(review: ReviewLog): boolean {
  return review.stateBefore === 'review' || review.stateBefore === 'relearning';
}

export function retentionOverall(reviews: ReviewLog[]): RetentionSummary {
  const measurable = reviews.filter(isMeasurable);
  const correct = measurable.filter((review) => review.rating > 1).length;
  return {
    reviewed: measurable.length,
    correct,
    rate: measurable.length === 0 ? 0 : correct / measurable.length,
  };
}

export function retentionByMonth(
  reviews: ReviewLog[],
): { month: string; rate: number; reviewed: number }[] {
  const buckets = new Map<string, { correct: number; reviewed: number }>();

  for (const review of reviews.filter(isMeasurable)) {
    const date = new Date(review.reviewedAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(month) ?? { correct: 0, reviewed: 0 };
    bucket.reviewed++;
    if (review.rating > 1) bucket.correct++;
    buckets.set(month, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) => ({
      month,
      reviewed: bucket.reviewed,
      rate: bucket.correct / bucket.reviewed,
    }));
}
