import { describe, expect, it } from 'vitest';
import {
  initialDifficulty,
  initialStability,
  intervalFromStability,
  nextDifficulty,
  nextStabilityOnFailure,
  nextStabilityOnSuccess,
  retrievability,
  DEFAULT_FSRS_PARAMS,
  DEFAULT_DECK_CONFIG,
  newSchedulingState,
  schedule,
  schedulePreview,
  type DeckConfig,
  type SchedulingState,
} from '@/lib/fsrs';

const w = DEFAULT_FSRS_PARAMS;

describe('retrievability', () => {
  it('is 1 when no time has passed', () => {
    expect(retrievability(0, 10)).toBe(1);
  });

  it('is 0.9 after exactly one stability of elapsed time', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 6);
  });

  it('decreases monotonically with elapsed time', () => {
    expect(retrievability(20, 10)).toBeLessThan(retrievability(10, 10));
  });
});

describe('intervalFromStability', () => {
  it('round-trips: an interval at 90% retention equals the stability', () => {
    expect(intervalFromStability(10, 0.9, 36500)).toBe(10);
  });

  it('shortens the interval when the user wants higher retention', () => {
    expect(intervalFromStability(10, 0.95, 36500)).toBeLessThan(10);
  });

  it('never returns less than one day', () => {
    expect(intervalFromStability(0.01, 0.9, 36500)).toBe(1);
  });

  it('clamps to the maximum interval', () => {
    expect(intervalFromStability(100000, 0.9, 365)).toBe(365);
  });
});

describe('initial state', () => {
  it('uses one weight per rating for stability', () => {
    expect(initialStability(w, 1)).toBeCloseTo(w[0]!, 6);
    expect(initialStability(w, 4)).toBeCloseTo(w[3]!, 6);
  });

  it('gives easier ratings a lower difficulty', () => {
    expect(initialDifficulty(w, 4)).toBeLessThan(initialDifficulty(w, 1));
  });

  it('clamps difficulty into [1, 10]', () => {
    expect(initialDifficulty(w, 1)).toBeLessThanOrEqual(10);
    expect(initialDifficulty(w, 4)).toBeGreaterThanOrEqual(1);
  });
});

describe('nextDifficulty', () => {
  it('raises difficulty on Again and lowers it on Easy', () => {
    expect(nextDifficulty(w, 5, 1)).toBeGreaterThan(5);
    expect(nextDifficulty(w, 5, 4)).toBeLessThan(5);
  });

  it('stays within [1, 10]', () => {
    expect(nextDifficulty(w, 10, 1)).toBeLessThanOrEqual(10);
    expect(nextDifficulty(w, 1, 4)).toBeGreaterThanOrEqual(1);
  });
});

describe('nextStabilityOnSuccess', () => {
  it('increases stability', () => {
    expect(nextStabilityOnSuccess(w, 5, 10, 0.9, 3)).toBeGreaterThan(10);
  });

  it('grows more for Easy than for Good than for Hard', () => {
    const hard = nextStabilityOnSuccess(w, 5, 10, 0.9, 2);
    const good = nextStabilityOnSuccess(w, 5, 10, 0.9, 3);
    const easy = nextStabilityOnSuccess(w, 5, 10, 0.9, 4);
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it('grows more when retrievability was low (successful hard recall)', () => {
    expect(nextStabilityOnSuccess(w, 5, 10, 0.7, 3)).toBeGreaterThan(
      nextStabilityOnSuccess(w, 5, 10, 0.95, 3),
    );
  });
});

describe('nextStabilityOnFailure', () => {
  it('never exceeds the previous stability', () => {
    expect(nextStabilityOnFailure(w, 5, 10, 0.9)).toBeLessThanOrEqual(10);
  });

  it('is lower for more difficult cards', () => {
    expect(nextStabilityOnFailure(w, 9, 10, 0.9)).toBeLessThan(
      nextStabilityOnFailure(w, 2, 10, 0.9),
    );
  });
});

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 86_400_000;
const config: DeckConfig = DEFAULT_DECK_CONFIG;

/** A card that has graduated and is due now, with a 10-day interval behind it. */
function reviewCard(overrides: Partial<SchedulingState> = {}): SchedulingState {
  return {
    state: 'review',
    stability: 10,
    difficulty: 5,
    due: NOW,
    lastReview: NOW - 10 * DAY,
    reps: 4,
    lapses: 0,
    learningStep: 0,
    scheduledDays: 10,
    ...overrides,
  };
}

describe('schedule: a new card', () => {
  it('starts in learning at the first step on Again', () => {
    const next = schedule(newSchedulingState(NOW), 1, NOW, config);
    expect(next.state).toBe('learning');
    expect(next.learningStep).toBe(0);
    expect(next.due).toBe(NOW + 1 * MINUTE);
    expect(next.reps).toBe(1);
  });

  it('advances to the second learning step on Good', () => {
    const next = schedule(newSchedulingState(NOW), 3, NOW, config);
    expect(next.state).toBe('learning');
    expect(next.learningStep).toBe(1);
    expect(next.due).toBe(NOW + 10 * MINUTE);
  });

  it('graduates straight to review on Easy', () => {
    const next = schedule(newSchedulingState(NOW), 4, NOW, config);
    expect(next.state).toBe('review');
    expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(next.due).toBe(NOW + next.scheduledDays * DAY);
  });

  it('seeds stability and difficulty from the first rating', () => {
    const easy = schedule(newSchedulingState(NOW), 4, NOW, config);
    const again = schedule(newSchedulingState(NOW), 1, NOW, config);
    expect(easy.stability).toBeGreaterThan(again.stability);
    expect(easy.difficulty).toBeLessThan(again.difficulty);
  });

  it('records the review time', () => {
    expect(schedule(newSchedulingState(NOW), 3, NOW, config).lastReview).toBe(NOW);
  });
});

describe('schedule: a learning card', () => {
  const learning = (): SchedulingState =>
    schedule(newSchedulingState(NOW), 3, NOW, config); // step 1 of 2

  it('graduates when Good is pressed on the last step', () => {
    const next = schedule(learning(), 3, NOW + 10 * MINUTE, config);
    expect(next.state).toBe('review');
    expect(next.learningStep).toBe(0);
  });

  it('returns to the first step on Again', () => {
    const next = schedule(learning(), 1, NOW + 10 * MINUTE, config);
    expect(next.state).toBe('learning');
    expect(next.learningStep).toBe(0);
    expect(next.due).toBe(NOW + 10 * MINUTE + 1 * MINUTE);
  });

  it('repeats the current step on Hard', () => {
    const next = schedule(learning(), 2, NOW + 10 * MINUTE, config);
    expect(next.state).toBe('learning');
    expect(next.learningStep).toBe(1);
  });
});

describe('schedule: a review card', () => {
  it('schedules a longer interval on Good', () => {
    const next = schedule(reviewCard(), 3, NOW, config);
    expect(next.state).toBe('review');
    expect(next.scheduledDays).toBeGreaterThan(10);
  });

  it('orders the intervals Hard < Good < Easy', () => {
    const preview = schedulePreview(reviewCard(), NOW, config);
    expect(preview[2].scheduledDays).toBeLessThan(preview[3].scheduledDays);
    expect(preview[3].scheduledDays).toBeLessThan(preview[4].scheduledDays);
  });

  it('lapses into relearning on Again', () => {
    const next = schedule(reviewCard(), 1, NOW, config);
    expect(next.state).toBe('relearning');
    expect(next.lapses).toBe(1);
    expect(next.learningStep).toBe(0);
    expect(next.due).toBe(NOW + 10 * MINUTE);
    expect(next.stability).toBeLessThan(10);
  });

  it('uses elapsed time, not the scheduled interval, to compute retrievability', () => {
    const onTime = schedule(reviewCard(), 3, NOW, config);
    const overdue = schedule(reviewCard(), 3, NOW + 20 * DAY, config);
    expect(overdue.stability).toBeGreaterThan(onTime.stability);
  });
});

describe('schedule: a relearning card', () => {
  it('returns to review on Good after the last relearning step', () => {
    const lapsed = schedule(reviewCard(), 1, NOW, config);
    const next = schedule(lapsed, 3, NOW + 10 * MINUTE, config);
    expect(next.state).toBe('review');
    expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('keeps the lapse count', () => {
    const lapsed = schedule(reviewCard(), 1, NOW, config);
    expect(schedule(lapsed, 3, NOW + 10 * MINUTE, config).lapses).toBe(1);
  });

  it('advances through multiple relearning steps', () => {
    const multiStepConfig: DeckConfig = { ...config, relearningSteps: [5, 20] };
    // Lapse a review card into relearning at step 0
    const lapsed = schedule(reviewCard(), 1, NOW, multiStepConfig);
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.learningStep).toBe(0);
    expect(lapsed.due).toBe(NOW + 5 * MINUTE);
    expect(lapsed.lapses).toBe(1);

    // Good at step 0 advances to step 1
    const step1 = schedule(lapsed, 3, NOW + 5 * MINUTE, multiStepConfig);
    expect(step1.state).toBe('relearning');
    expect(step1.learningStep).toBe(1);
    expect(step1.due).toBe(NOW + 5 * MINUTE + 20 * MINUTE);
    expect(step1.lapses).toBe(1);

    // Good at step 1 graduates back to review
    const graduated = schedule(step1, 3, NOW + 5 * MINUTE + 20 * MINUTE, multiStepConfig);
    expect(graduated.state).toBe('review');
    expect(graduated.learningStep).toBe(0);
    expect(graduated.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(graduated.lapses).toBe(1);
  });
});

describe('schedule: empty learning steps', () => {
  it('graduates a new card immediately on Good', () => {
    const noSteps: DeckConfig = { ...config, learningSteps: [] };
    const next = schedule(newSchedulingState(NOW), 3, NOW, noSteps);
    expect(next.state).toBe('review');
  });
});

describe('schedule: empty relearning steps', () => {
  it('graduates a lapsed card immediately without entering relearning', () => {
    const noRelearning: DeckConfig = { ...config, relearningSteps: [] };
    const card = reviewCard();
    const originalStability = card.stability;
    // Lapse the card with rating 1 (Again)
    const lapsed = schedule(card, 1, NOW, noRelearning);
    // Should graduate immediately to review, not enter relearning
    expect(lapsed.state).toBe('review');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.learningStep).toBe(0);
    expect(lapsed.scheduledDays).toBeGreaterThanOrEqual(1);
    // Stability should decrease due to the failure
    expect(lapsed.stability).toBeLessThan(originalStability);
  });
});

describe('schedulePreview', () => {
  it('does not mutate the input state', () => {
    const state = reviewCard();
    schedulePreview(state, NOW, config);
    expect(state.stability).toBe(10);
    expect(state.reps).toBe(4);
  });

  it('returns one outcome per rating', () => {
    expect(Object.keys(schedulePreview(reviewCard(), NOW, config))).toEqual(['1', '2', '3', '4']);
  });
});
