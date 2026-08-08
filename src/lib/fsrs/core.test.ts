import { describe, expect, it } from 'vitest';
import {
  initialDifficulty,
  initialStability,
  intervalFromStability,
  nextDifficulty,
  nextStabilityOnFailure,
  nextStabilityOnSuccess,
  retrievability,
} from '@/lib/fsrs/core';
import { DEFAULT_FSRS_PARAMS } from '@/lib/fsrs/defaults';

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
