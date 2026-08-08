import type { ReviewLog } from '@/lib/db/types';
import type { RetentionSummary } from '@/lib/stats/types';

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
