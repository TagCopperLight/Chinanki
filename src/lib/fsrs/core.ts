import type { Rating } from '@/lib/fsrs/types';

/** FSRS-4.5 forgetting-curve constants. */
const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const MIN_STABILITY = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Probability of recall after `elapsedDays` given memory `stability` (days). */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/** The whole-day interval at which recall probability equals `desiredRetention`. */
export function intervalFromStability(
  stability: number,
  desiredRetention: number,
  maximumInterval: number,
): number {
  const days = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  return clamp(Math.round(days), 1, maximumInterval);
}

export function initialStability(w: number[], rating: Rating): number {
  return Math.max(w[rating - 1]!, MIN_STABILITY);
}

/**
 * FSRS-4.5 initial difficulty: linear in the rating.
 * FSRS-5 later replaced this with an exponential form (and added a (10-D)/9
 * damping term to nextDifficulty), but FSRS-5's formulas require FSRS-5's
 * weights — pairing them with the 17 FSRS-4.5 weights in defaults.ts produces
 * badly miscalibrated difficulties. Keep formulas and weights on the same version.
 */
export function initialDifficulty(w: number[], rating: Rating): number {
  return clamp(w[4]! - (rating - 3) * w[5]!, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

export function nextDifficulty(w: number[], difficulty: number, rating: Rating): number {
  const delta = difficulty - w[6]! * (rating - 3);
  // Mean reversion towards the difficulty an "Easy" first answer would have given.
  const reverted = w[7]! * initialDifficulty(w, 4) + (1 - w[7]!) * delta;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

export function nextStabilityOnSuccess(
  w: number[],
  difficulty: number,
  stability: number,
  r: number,
  rating: Rating,
): number {
  const hardPenalty = rating === 2 ? w[15]! : 1;
  const easyBonus = rating === 4 ? w[16]! : 1;
  const growth =
    Math.exp(w[8]!) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]!) *
    (Math.exp(w[10]! * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(stability * (1 + growth), MIN_STABILITY);
}

export function nextStabilityOnFailure(
  w: number[],
  difficulty: number,
  stability: number,
  r: number,
): number {
  const postLapse =
    w[11]! *
    Math.pow(difficulty, -w[12]!) *
    (Math.pow(stability + 1, w[13]!) - 1) *
    Math.exp(w[14]! * (1 - r));
  // A lapse must never increase stability.
  return clamp(Math.min(postLapse, stability), MIN_STABILITY, Number.MAX_SAFE_INTEGER);
}
