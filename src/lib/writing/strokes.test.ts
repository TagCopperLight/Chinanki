import { describe, expect, it } from 'vitest';
import {
  beginStroke,
  extendStroke,
  isEmpty,
  normalise,
  strokePath,
  undoLastStroke,
  type Stroke,
} from '@/lib/writing/strokes';

const RECT = { left: 100, top: 50, width: 200, height: 200 };

describe('normalise', () => {
  it('maps a client point into the unit square', () => {
    expect(normalise(200, 150, RECT)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalise(100, 50, RECT)).toEqual({ x: 0, y: 0 });
    expect(normalise(300, 250, RECT)).toEqual({ x: 1, y: 1 });
  });

  it('clamps points dragged outside the box', () => {
    expect(normalise(0, 0, RECT)).toEqual({ x: 0, y: 0 });
    expect(normalise(500, 500, RECT)).toEqual({ x: 1, y: 1 });
  });

  it('returns the origin for a zero-sized box rather than NaN', () => {
    expect(normalise(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('beginStroke / extendStroke', () => {
  it('starts a new stroke without touching the earlier ones', () => {
    const first: Stroke[] = [[{ x: 0, y: 0 }]];
    const next = beginStroke(first, { x: 0.5, y: 0.5 });
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual([{ x: 0.5, y: 0.5 }]);
    expect(first).toHaveLength(1);
  });

  it('appends to the last stroke', () => {
    const strokes = extendStroke([[{ x: 0, y: 0 }]], { x: 0.5, y: 0.5 });
    expect(strokes[0]).toHaveLength(2);
  });

  it('drops points too close to the previous one', () => {
    const strokes = extendStroke([[{ x: 0.5, y: 0.5 }]], { x: 0.501, y: 0.5 });
    expect(strokes[0]).toHaveLength(1);
  });

  it('ignores a move that arrives before any stroke started', () => {
    expect(extendStroke([], { x: 0.5, y: 0.5 })).toEqual([]);
  });
});

describe('undoLastStroke / isEmpty', () => {
  it('removes the most recent stroke', () => {
    const strokes: Stroke[] = [[{ x: 0, y: 0 }], [{ x: 1, y: 1 }]];
    expect(undoLastStroke(strokes)).toHaveLength(1);
  });

  it('is a no-op when there is nothing to undo', () => {
    expect(undoLastStroke([])).toEqual([]);
  });

  it('treats no strokes and empty strokes alike as empty', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([[]])).toBe(true);
    expect(isEmpty([[{ x: 0, y: 0 }]])).toBe(false);
  });
});

describe('strokePath', () => {
  it('returns null for a stroke with no points', () => {
    expect(strokePath([], 100)).toBeNull();
  });

  it('returns a start and no segments for a single tap', () => {
    expect(strokePath([{ x: 0.5, y: 0.25 }], 100)).toEqual({
      start: { x: 50, y: 25 },
      segments: [],
    });
  });

  it('scales to pixels and smooths through the midpoints', () => {
    const path = strokePath(
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
      ],
      100,
    );
    expect(path).toEqual({
      start: { x: 0, y: 0 },
      segments: [
        { control: { x: 50, y: 0 }, end: { x: 75, y: 50 } },
        { control: { x: 100, y: 100 }, end: { x: 100, y: 100 } },
      ],
    });
  });
});
