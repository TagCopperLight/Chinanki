export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];
export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulingState {
  state: CardState;
  /** Memory stability in days. 0 while the card is new. */
  stability: number;
  /** Memory difficulty in [1, 10]. 0 while the card is new. */
  difficulty: number;
  /** When the card next comes up, ms since epoch. */
  due: number;
  /** When the card was last answered, ms since epoch, or null if never. */
  lastReview: number | null;
  reps: number;
  lapses: number;
  /** Index into learningSteps / relearningSteps while in a (re)learning state. */
  learningStep: number;
  /** The interval in days that was scheduled by the last answer. */
  scheduledDays: number;
}

export interface DeckConfig {
  /** Minutes. An empty array graduates a card on its first Good. */
  learningSteps: number[];
  /** Minutes, used after a lapse. */
  relearningSteps: number[];
  /** Target probability of recall at review time, e.g. 0.9. */
  desiredRetention: number;
  /** Days. Intervals are clamped to this. */
  maximumInterval: number;
  /** The 17 FSRS-4.5 weights. */
  fsrsParams: number[];
}

/** FSRS-4.5 default weights (w0..w16). */
export const DEFAULT_FSRS_PARAMS: number[] = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461,
  2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  desiredRetention: 0.9,
  maximumInterval: 36500,
  fsrsParams: DEFAULT_FSRS_PARAMS,
};

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
 * FSRS-4.5 initial difficulty: linear in the rating. Do not swap in FSRS-5's
 * formulas without FSRS-5's weights; the two must stay on the same version.
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

const MINUTE = 60_000;
const DAY = 86_400_000;

export function newSchedulingState(now: number): SchedulingState {
  return {
    state: 'new',
    stability: 0,
    difficulty: 0,
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
    learningStep: 0,
    scheduledDays: 0,
  };
}

/** Applies `rating` to `state` and returns the new state. Never mutates the input. */
export function schedule(
  state: SchedulingState,
  rating: Rating,
  now: number,
  config: DeckConfig,
): SchedulingState {
  const w = config.fsrsParams;
  const isNew = state.state === 'new';

  let stability: number;
  let difficulty: number;
  if (isNew) {
    stability = initialStability(w, rating);
    difficulty = initialDifficulty(w, rating);
  } else {
    const elapsedDays = state.lastReview === null ? 0 : (now - state.lastReview) / DAY;
    const r = retrievability(elapsedDays, state.stability);
    difficulty = nextDifficulty(w, state.difficulty, rating);
    stability =
      rating === 1
        ? nextStabilityOnFailure(w, state.difficulty, state.stability, r)
        : nextStabilityOnSuccess(w, state.difficulty, state.stability, r, rating);
  }

  const next: SchedulingState = {
    ...state,
    stability,
    difficulty,
    lastReview: now,
    reps: state.reps + 1,
  };

  const graduate = (): SchedulingState => {
    const days = intervalFromStability(stability, config.desiredRetention, config.maximumInterval);
    return { ...next, state: 'review', learningStep: 0, scheduledDays: days, due: now + days * DAY };
  };

  const stepTo = (
    steps: number[],
    index: number,
    cardState: 'learning' | 'relearning',
  ): SchedulingState => {
    const minutes = steps[Math.min(index, steps.length - 1)] ?? 1;
    return {
      ...next,
      state: cardState,
      learningStep: index,
      scheduledDays: 0,
      due: now + minutes * MINUTE,
    };
  };

  if (state.state === 'review') {
    if (rating === 1) {
      next.lapses = state.lapses + 1;
      if (config.relearningSteps.length === 0) return graduate();
      return stepTo(config.relearningSteps, 0, 'relearning');
    }
    return graduate();
  }

  const inRelearning = state.state === 'relearning';
  const steps = inRelearning ? config.relearningSteps : config.learningSteps;
  const cardState = inRelearning ? 'relearning' : 'learning';

  if (steps.length === 0) return graduate();
  if (rating === 1) return stepTo(steps, 0, cardState);
  if (rating === 2) return stepTo(steps, state.learningStep, cardState);
  if (rating === 4) return graduate();

  // Good: advance one step, graduating past the end.
  const nextStep = state.learningStep + 1;
  if (nextStep >= steps.length) return graduate();
  return stepTo(steps, nextStep, cardState);
}

/** What each rating would do, without committing to any of them. */
export function schedulePreview(
  state: SchedulingState,
  now: number,
  config: DeckConfig,
): Record<Rating, SchedulingState> {
  const preview = {} as Record<Rating, SchedulingState>;
  for (const rating of RATINGS) {
    preview[rating] = schedule(state, rating, now, config);
  }
  return preview;
}
