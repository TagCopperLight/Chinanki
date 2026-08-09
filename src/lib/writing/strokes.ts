/**
 * The stroke model for handwriting practice.
 *
 * Points are normalised to the unit square at capture time, so one drawing
 * renders at any size — full-size in the study box, thumbnail-size in the
 * reveal row, at any device pixel ratio — without storing anything
 * device-specific.
 */

export interface Point {
  x: number;
  y: number;
}

/** One pen-down-to-pen-up gesture. */
export type Stroke = Point[];

/** The part of a DOMRect this module needs, so tests need no DOM. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Normalised distance below which a new point is pointer noise, not movement. */
const MIN_DISTANCE = 0.005;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Maps a client coordinate into the unit square, clamped to the box. */
export function normalise(clientX: number, clientY: number, rect: Rect): Point {
  return {
    x: rect.width === 0 ? 0 : clamp((clientX - rect.left) / rect.width),
    y: rect.height === 0 ? 0 : clamp((clientY - rect.top) / rect.height),
  };
}

export function beginStroke(strokes: Stroke[], point: Point): Stroke[] {
  return [...strokes, [point]];
}

/** Extends the last stroke. Points too close to the previous one are dropped. */
export function extendStroke(strokes: Stroke[], point: Point): Stroke[] {
  const last = strokes[strokes.length - 1];
  if (!last) return strokes;
  const previous = last[last.length - 1];
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < MIN_DISTANCE) {
    return strokes;
  }
  return [...strokes.slice(0, -1), [...last, point]];
}

export function undoLastStroke(strokes: Stroke[]): Stroke[] {
  return strokes.slice(0, -1);
}

export function isEmpty(strokes: Stroke[]): boolean {
  return strokes.every((stroke) => stroke.length === 0);
}

export interface Segment {
  control: Point;
  end: Point;
}

export interface StrokePath {
  start: Point;
  segments: Segment[];
}

/**
 * Converts a normalised stroke into pixel-space curves. Each segment steers
 * through a captured point and ends at the midpoint to the next one, which is
 * the standard way to draw a smooth line through a noisy pointer trail. A
 * single-point stroke has no segments; the renderer draws it as a dot.
 */
export function strokePath(stroke: Stroke, size: number): StrokePath | null {
  const first = stroke[0];
  if (!first) return null;

  const scale = (point: Point): Point => ({ x: point.x * size, y: point.y * size });
  const segments: Segment[] = [];

  for (let index = 1; index < stroke.length - 1; index++) {
    const current = stroke[index]!;
    const next = stroke[index + 1]!;
    segments.push({
      control: scale(current),
      end: scale({ x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }),
    });
  }

  if (stroke.length > 1) {
    const last = scale(stroke[stroke.length - 1]!);
    segments.push({ control: last, end: last });
  }

  return { start: scale(first), segments };
}
