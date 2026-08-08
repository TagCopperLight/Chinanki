import {
  initialDifficulty,
  initialStability,
  intervalFromStability,
  nextDifficulty,
  nextStabilityOnFailure,
  nextStabilityOnSuccess,
  retrievability,
} from '@/lib/fsrs/core';
import type { DeckConfig, Rating, SchedulingState } from '@/lib/fsrs/types';
import { RATINGS } from '@/lib/fsrs/types';

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
