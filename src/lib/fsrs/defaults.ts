import type { DeckConfig } from '@/lib/fsrs/types';

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
