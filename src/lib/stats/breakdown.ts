import type { Card } from '@/lib/db/types';
import type { CardBreakdown } from '@/lib/stats/types';

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
