import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_CONFIG } from '@/lib/fsrs/defaults';
import { newSchedulingState, schedule, schedulePreview } from '@/lib/fsrs/scheduler';
import type { DeckConfig, SchedulingState } from '@/lib/fsrs/types';

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
});

describe('schedule: empty learning steps', () => {
  it('graduates a new card immediately on Good', () => {
    const noSteps: DeckConfig = { ...config, learningSteps: [] };
    const next = schedule(newSchedulingState(NOW), 3, NOW, noSteps);
    expect(next.state).toBe('review');
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
