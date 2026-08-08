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
