# Writing Cards (* → 汉字) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `meaning → 汉字` and `pinyin → 汉字` card directions, where the learner draws the character on a canvas, then reveals the correct character ghosted behind their drawing and self-rates.

**Architecture:** Two new members of the existing `Direction` union — no schema change, no migration, because `reconcile` in `src/lib/db/notes.ts` already creates and removes cards when a deck's directions change. Drawing state lives in React state and is discarded when the card is rated; nothing is written to IndexedDB. The stroke model is a pure module operating on coordinates normalised to the unit square, so one drawing renders at any size; a single `DrawingCanvas` component paints it, and is reused read-only for the reveal.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Dexie, Vitest + Testing Library (jsdom), Playwright.

## Global Constraints

- The app never judges the drawing. No handwriting recognition, no stroke-order validation. The learner self-rates, as with every other card.
- Drawings are never persisted. No IndexedDB writes, no schema change, no migration.
- Reveal is never blocked. "Show answer" is reachable from the first character onwards.
- Coordinates are normalised to 0–1 at capture time. Nothing device-specific (pixels, device pixel ratio) is ever stored in the stroke model.
- Stroke logic lives in pure modules and is unit-tested; the canvas element itself is covered by Playwright, because jsdom implements no 2D context.
- The stroke-level undo is labelled **Undo stroke** and lives with the canvas. The footer's review-level **Undo** is untouched — the two must never read as the same action.
- Existing decks are untouched. The new directions appear as unticked checkboxes in deck settings.
- Spec: `docs/superpowers/specs/2026-08-09-writing-cards-design.md`.

Run `npm test` for unit and component tests, `npm run typecheck` for types, `npm run test:e2e` for Playwright.

---

### Task 1: Writing directions and the `isWritingDirection` predicate

Adds the two directions and the predicate the rest of the plan branches on. Also fixes the one existing test and the two pieces of prose that assert writing does not exist yet.

**Files:**
- Modify: `src/lib/db/types.ts:9-22`
- Modify: `src/lib/study/prompt.ts`
- Modify: `src/lib/study/prompt.test.ts:16-21`
- Modify: `src/pages/DeckSettingsPage.tsx:119-121`
- Modify: `README.md:3-6`

**Interfaces:**
- Consumes: nothing.
- Produces: `Direction` now includes `'meaning-hanzi' | 'pinyin-hanzi'`; `isWritingDirection(direction: Direction): boolean` exported from `@/lib/study/prompt`.

- [ ] **Step 1: Write the failing test**

In `src/lib/study/prompt.test.ts`, replace the existing `it('never prompts for the hanzi as an answer', ...)` block (lines 16–21) — it asserts the exact invariant this feature breaks — with the following, and add the import of `isWritingDirection` on line 2:

```ts
import { answerFor, isWritingDirection, promptFor } from '@/lib/study/prompt';
```

```ts
  it('maps the writing directions to their prompt and answer field', () => {
    expect(promptFor('meaning-hanzi')).toBe('meaning');
    expect(answerFor('meaning-hanzi')).toBe('hanzi');
    expect(promptFor('pinyin-hanzi')).toBe('pinyin');
    expect(answerFor('pinyin-hanzi')).toBe('hanzi');
  });
});

describe('isWritingDirection', () => {
  it('is true exactly for the directions answered by writing the character', () => {
    expect(isWritingDirection('meaning-hanzi')).toBe(true);
    expect(isWritingDirection('pinyin-hanzi')).toBe(true);
    expect(isWritingDirection('hanzi-meaning')).toBe(false);
    expect(isWritingDirection('hanzi-pinyin')).toBe(false);
    expect(isWritingDirection('meaning-pinyin')).toBe(false);
    expect(isWritingDirection('pinyin-meaning')).toBe(false);
  });

  it('covers every direction', () => {
    for (const direction of ALL_DIRECTIONS) {
      expect(typeof isWritingDirection(direction)).toBe('boolean');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/study/prompt.test.ts`
Expected: FAIL — `isWritingDirection` is not exported, and TypeScript rejects `'meaning-hanzi'` as a `Direction`.

- [ ] **Step 3: Add the directions**

In `src/lib/db/types.ts`, replace the `Direction` type, `ALL_DIRECTIONS` and `DIRECTION_LABELS` declarations with:

```ts
export type Direction =
  | 'hanzi-meaning'
  | 'hanzi-pinyin'
  | 'meaning-pinyin'
  | 'pinyin-meaning'
  | 'meaning-hanzi'
  | 'pinyin-hanzi';

export const ALL_DIRECTIONS: readonly Direction[] = [
  'hanzi-meaning',
  'hanzi-pinyin',
  'meaning-pinyin',
  'pinyin-meaning',
  'meaning-hanzi',
  'pinyin-hanzi',
];

export const DIRECTION_LABELS: Record<Direction, string> = {
  'hanzi-meaning': '汉字 → Meaning',
  'hanzi-pinyin': '汉字 → Pinyin',
  'meaning-pinyin': 'Meaning → Pinyin',
  'pinyin-meaning': 'Pinyin → Meaning',
  'meaning-hanzi': 'Meaning → 汉字',
  'pinyin-hanzi': 'Pinyin → 汉字',
};
```

The writing directions go last so they sort after the existing ones everywhere `ALL_DIRECTIONS` drives an ordering (deck settings checkboxes, `updateDeck`'s normalisation).

- [ ] **Step 4: Add the predicate**

Append to `src/lib/study/prompt.ts`:

```ts
/** Writing directions are answered by drawing the character rather than reading it. */
export function isWritingDirection(direction: Direction): boolean {
  return answerFor(direction) === 'hanzi';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/study/prompt.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Fix the prose that says writing does not exist**

In `src/pages/DeckSettingsPage.tsx`, replace the hint paragraph under the direction checkboxes:

```tsx
          <p className="mt-2 text-xs text-slate-500">
            The 汉字 directions are writing practice — you draw the character, then check it
            yourself.
          </p>
```

In `README.md`, replace the second paragraph (lines 3–6):

```markdown
A local-first, installable web app for learning Mandarin vocabulary. Cards go in
six directions (hanzi → meaning, hanzi → pinyin, meaning → pinyin, pinyin →
meaning, and the two writing directions meaning → hanzi and pinyin → hanzi where
you draw the character), each scheduled independently by FSRS-4.5. Everything is
stored in your browser — no account, no server.
```

- [ ] **Step 7: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS. No other test asserts the number of directions — the existing suites all pass explicit direction arrays.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/types.ts src/lib/study/prompt.ts src/lib/study/prompt.test.ts src/pages/DeckSettingsPage.tsx README.md
git commit -m "feat(directions): add meaning-hanzi and pinyin-hanzi writing directions"
```

---

### Task 2: Stroke model

The pure heart of the feature: capture, normalisation, undo, and the smoothing that turns a noisy pointer trail into curves. No React, no canvas.

**Files:**
- Create: `src/lib/writing/strokes.ts`
- Test: `src/lib/writing/strokes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `@/lib/writing/strokes`:
  - `interface Point { x: number; y: number }`
  - `type Stroke = Point[]`
  - `interface Rect { left: number; top: number; width: number; height: number }`
  - `interface Segment { control: Point; end: Point }`
  - `interface StrokePath { start: Point; segments: Segment[] }`
  - `normalise(clientX: number, clientY: number, rect: Rect): Point`
  - `beginStroke(strokes: Stroke[], point: Point): Stroke[]`
  - `extendStroke(strokes: Stroke[], point: Point): Stroke[]`
  - `undoLastStroke(strokes: Stroke[]): Stroke[]`
  - `isEmpty(strokes: Stroke[]): boolean`
  - `strokePath(stroke: Stroke, size: number): StrokePath | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/writing/strokes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/writing/strokes.test.ts`
Expected: FAIL — cannot resolve `@/lib/writing/strokes`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/writing/strokes.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/writing/strokes.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/writing/strokes.ts src/lib/writing/strokes.test.ts
git commit -m "feat(writing): add the normalised stroke model"
```

---

### Task 3: Per-character tone colours

The reveal tints each ghost character with its tone when `colourHanzi` is on. `HanziText` already contains that rule, including the "counts disagree, colour nothing" guard. Extract it so there is one copy.

**Files:**
- Create: `src/lib/pinyin/characterTones.ts`
- Test: `src/lib/pinyin/characterTones.test.ts`
- Modify: `src/lib/pinyin/index.ts`
- Modify: `src/components/HanziText.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `characterTones(hanzi: string, pinyin: string): (Tone | null)[]`, exported from `@/lib/pinyin`. The result is aligned to `[...hanzi]` — one entry per code point, in order.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pinyin/characterTones.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { characterTones } from '@/lib/pinyin';

describe('characterTones', () => {
  it('gives each character the tone of its syllable', () => {
    expect(characterTones('你好', 'nǐ hǎo')).toEqual([3, 3]);
    expect(characterTones('妈麻马骂吗', 'mā má mǎ mà ma')).toEqual([1, 2, 3, 4, 0]);
  });

  it('colours nothing when the counts disagree', () => {
    expect(characterTones('一点儿', 'yī diǎnr')).toEqual([null, null, null]);
  });

  it('returns one entry per code point', () => {
    expect(characterTones('', '')).toEqual([]);
    expect(characterTones('好', '')).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pinyin/characterTones.test.ts`
Expected: FAIL — `characterTones` is not exported from `@/lib/pinyin`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pinyin/characterTones.ts`:

```ts
import { parseAccentedPinyin } from '@/lib/pinyin/accented';
import type { Tone } from '@/lib/pinyin/types';

/**
 * The tone of each character of `hanzi`, taken from the nth pinyin syllable.
 * When the counts disagree (erhua, punctuation) every character comes back
 * null, because a partial mapping would mis-colour rather than under-colour.
 */
export function characterTones(hanzi: string, pinyin: string): (Tone | null)[] {
  const characters = [...hanzi];
  const syllables = parseAccentedPinyin(pinyin).filter((token) => token.tone !== null);
  if (syllables.length !== characters.length) return characters.map(() => null);
  return syllables.map((syllable) => syllable.tone);
}
```

Add to `src/lib/pinyin/index.ts`, keeping the existing alphabetical-by-module order:

```ts
export { characterTones } from '@/lib/pinyin/characterTones';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pinyin/characterTones.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use it in HanziText**

Replace the body of `src/components/HanziText.tsx` after the props destructuring (keep the file's doc comment and props unchanged):

```tsx
  const { settings } = useSettings();
  const characters = [...hanzi];
  const tones = characterTones(hanzi, pinyin);

  if (!colour || !settings.colourHanzi || tones.every((tone) => tone === null)) {
    return <span className={className}>{hanzi}</span>;
  }

  return (
    <span className={className}>
      {characters.map((character, index) => {
        const tone = tones[index];
        if (tone === null || tone === undefined) return <span key={index}>{character}</span>;
        return (
          <span key={index} data-tone={tone} style={{ color: settings.toneColours[tone] }}>
            {character}
          </span>
        );
      })}
    </span>
  );
```

And replace its import of `parseAccentedPinyin`:

```tsx
import { characterTones } from '@/lib/pinyin';
```

- [ ] **Step 6: Run the existing HanziText tests as the safety net**

Run: `npx vitest run src/components/HanziText.test.tsx`
Expected: PASS, unchanged — this is a refactor, its tests are the proof.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pinyin/characterTones.ts src/lib/pinyin/characterTones.test.ts src/lib/pinyin/index.ts src/components/HanziText.tsx
git commit -m "refactor(pinyin): extract characterTones and reuse it in HanziText"
```

---

### Task 4: jsdom canvas stubs and `DrawingCanvas`

The one component that touches the canvas API. jsdom implements neither a 2D context nor `ResizeObserver`, so both get no-op stubs in the test setup; the real drawing is proved by the Playwright spec in Task 8.

**Files:**
- Modify: `src/vitest.setup.ts`
- Create: `src/components/DrawingCanvas.tsx`
- Test: `src/components/DrawingCanvas.test.tsx`

**Interfaces:**
- Consumes: `Stroke`, `beginStroke`, `extendStroke`, `normalise`, `strokePath` from `@/lib/writing/strokes` (Task 2).
- Produces: default export `DrawingCanvas` with props
  `{ strokes: Stroke[]; onStrokesChange?: (strokes: Stroke[]) => void; ghost?: string; ghostColour?: string; readOnly?: boolean; label: string; className?: string }`.
  It renders a single `<canvas role="img" aria-label={label}>` and sizes its own bitmap; the caller sizes it with `className` (or a sized wrapper).

- [ ] **Step 1: Write the failing test**

Create `src/components/DrawingCanvas.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DrawingCanvas from '@/components/DrawingCanvas';

describe('DrawingCanvas', () => {
  it('renders a labelled canvas', () => {
    render(<DrawingCanvas strokes={[]} label="Draw character 1 of 2" />);
    const canvas = screen.getByRole('img', { name: 'Draw character 1 of 2' });
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('starts a stroke on pointer down', () => {
    const onStrokesChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />);
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    expect(onStrokesChange.mock.calls[0]![0]).toHaveLength(1);
  });

  it('ignores pointer movement until a stroke has started', () => {
    const onStrokesChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />);
    fireEvent.pointerMove(screen.getByRole('img', { name: 'Draw' }), {
      pointerId: 1,
      clientX: 5,
      clientY: 5,
    });
    expect(onStrokesChange).not.toHaveBeenCalled();
  });

  it('takes no pointer input when read-only', () => {
    const onStrokesChange = vi.fn();
    render(
      <DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} readOnly label="Your drawing" />,
    );
    const canvas = screen.getByRole('img', { name: 'Your drawing' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onStrokesChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/DrawingCanvas.test.tsx`
Expected: FAIL — cannot resolve `@/components/DrawingCanvas`.

- [ ] **Step 3: Stub the canvas APIs jsdom lacks**

Append to `src/vitest.setup.ts`:

```ts
// jsdom implements neither a canvas 2D context nor ResizeObserver. What is
// actually painted is proved by the Playwright suite; here the components only
// need to mount, so a context that swallows every call and an observer that
// never fires are enough.
if (typeof HTMLCanvasElement !== 'undefined') {
  const noopContext = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = (() => noopContext) as never;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
```

- [ ] **Step 4: Write the component**

Create `src/components/DrawingCanvas.tsx`:

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  beginStroke,
  extendStroke,
  normalise,
  strokePath,
  type Stroke,
} from '@/lib/writing/strokes';

/** How faint the correct character sits behind the learner's own strokes. */
const GHOST_ALPHA = 0.3;
/** Stroke width and ghost size, as fractions of the box. */
const LINE_WIDTH = 0.045;
const GHOST_SIZE = 0.85;

/**
 * Paints a set of normalised strokes, optionally over a ghosted character, and
 * captures new ones from pointer input. The same component renders the study
 * box and — with `readOnly` — every cell of the reveal row.
 */
export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  ghost,
  ghostColour,
  readOnly = false,
  label,
  className = '',
}: {
  strokes: Stroke[];
  onStrokesChange?: (strokes: Stroke[]) => void;
  /** Character painted behind the strokes; omit for a blank box. */
  ghost?: string;
  /** Defaults to the canvas's own text colour. */
  ghostColour?: string;
  readOnly?: boolean;
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [size, setSize] = useState(0);

  // The bitmap has to follow the CSS box, or the strokes land offset from the
  // finger and blur on high-density screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      setSize(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    const ink = getComputedStyle(canvas).color;

    if (ghost) {
      context.save();
      context.globalAlpha = GHOST_ALPHA;
      context.fillStyle = ghostColour ?? ink;
      context.font = `${size * GHOST_SIZE}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(ghost, size / 2, size / 2);
      context.restore();
    }

    const width = size * LINE_WIDTH;
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const stroke of strokes) {
      const path = strokePath(stroke, size);
      if (!path) continue;
      context.beginPath();
      if (path.segments.length === 0) {
        // A tap, not a drag: a line with no length draws nothing, so dot it.
        context.arc(path.start.x, path.start.y, width / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.moveTo(path.start.x, path.start.y);
      for (const segment of path.segments) {
        context.quadraticCurveTo(segment.control.x, segment.control.y, segment.end.x, segment.end.y);
      }
      context.stroke();
    }
  }, [strokes, ghost, ghostColour, size]);

  if (readOnly) {
    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={`pointer-events-none ${className}`}
      />
    );
  }

  function pointOf(event: PointerEvent<HTMLCanvasElement>) {
    return normalise(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      // touch-none, or drawing scrolls the page instead of marking the box.
      className={`touch-none ${className}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true;
        onStrokesChange?.(beginStroke(strokes, pointOf(event)));
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        onStrokesChange?.(extendStroke(strokes, pointOf(event)));
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
      onPointerCancel={() => {
        drawing.current = false;
      }}
    />
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/DrawingCanvas.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Check nothing else broke on the new setup file**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/vitest.setup.ts src/components/DrawingCanvas.tsx src/components/DrawingCanvas.test.tsx
git commit -m "feat(writing): add the DrawingCanvas component"
```

---

### Task 5: `WritingPrompt`

The study-side box: one square per character, the position indicator, and the two canvas controls. Fully controlled — the current character index lives in `StudyPage`, because the footer button label depends on it.

**Files:**
- Create: `src/components/WritingPrompt.tsx`
- Test: `src/components/WritingPrompt.test.tsx`

**Interfaces:**
- Consumes: `DrawingCanvas` (Task 4); `isEmpty`, `undoLastStroke`, `Stroke` from `@/lib/writing/strokes` (Task 2); `Button` from `@/components/Button`.
- Produces: default export `WritingPrompt` with props
  `{ count: number; index: number; strokes: Stroke[][]; onStrokesChange: (index: number, strokes: Stroke[]) => void }`.
  It never receives the character — the box is blank by design. Renders `data-testid="writing-progress"` holding `"{index + 1} / {count}"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/WritingPrompt.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WritingPrompt from '@/components/WritingPrompt';
import type { Stroke } from '@/lib/writing/strokes';

const ONE_STROKE: Stroke[] = [[{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }]];

describe('WritingPrompt', () => {
  it('shows the position within the word', () => {
    render(<WritingPrompt count={3} index={1} strokes={[[], [], []]} onStrokesChange={vi.fn()} />);
    expect(screen.getByTestId('writing-progress')).toHaveTextContent('2 / 3');
  });

  it('gives the box a label naming the character being drawn', () => {
    render(<WritingPrompt count={2} index={0} strokes={[[], []]} onStrokesChange={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Draw character 1 of 2' })).toBeInTheDocument();
  });

  it('disables the controls until something is drawn', () => {
    render(<WritingPrompt count={1} index={0} strokes={[[]]} onStrokesChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('undoes the last stroke of the current character', async () => {
    const user = userEvent.setup();
    const onStrokesChange = vi.fn();
    render(
      <WritingPrompt count={2} index={1} strokes={[[], ONE_STROKE]} onStrokesChange={onStrokesChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Undo stroke' }));
    expect(onStrokesChange).toHaveBeenCalledWith(1, []);
  });

  it('clears the current character', async () => {
    const user = userEvent.setup();
    const onStrokesChange = vi.fn();
    render(
      <WritingPrompt count={1} index={0} strokes={[ONE_STROKE]} onStrokesChange={onStrokesChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onStrokesChange).toHaveBeenCalledWith(0, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/WritingPrompt.test.tsx`
Expected: FAIL — cannot resolve `@/components/WritingPrompt`.

- [ ] **Step 3: Write the component**

Create `src/components/WritingPrompt.tsx`:

```tsx
import Button from '@/components/Button';
import DrawingCanvas from '@/components/DrawingCanvas';
import { isEmpty, undoLastStroke, type Stroke } from '@/lib/writing/strokes';

/**
 * The drawing box for one character of the answer. Deliberately blank — the
 * character is what the learner is trying to recall — and controlled, because
 * the footer's primary button depends on which character is showing.
 */
export default function WritingPrompt({
  count,
  index,
  strokes,
  onStrokesChange,
}: {
  count: number;
  index: number;
  /** One entry per character of the answer, in order. */
  strokes: Stroke[][];
  onStrokesChange: (index: number, strokes: Stroke[]) => void;
}) {
  const current = strokes[index] ?? [];
  const blank = isEmpty(current);

  return (
    <div className="flex flex-col items-center gap-2" data-testid="writing-prompt">
      <div className="aspect-square w-64 max-w-[70vw] rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
        <DrawingCanvas
          label={`Draw character ${index + 1} of ${count}`}
          strokes={current}
          onStrokesChange={(next) => onStrokesChange(index, next)}
          className="h-full w-full text-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="flex w-64 max-w-[70vw] items-center justify-between">
        <Button
          variant="ghost"
          disabled={blank}
          onClick={() => onStrokesChange(index, undoLastStroke(current))}
        >
          Undo stroke
        </Button>
        <span className="text-xs tabular-nums text-slate-500" data-testid="writing-progress">
          {index + 1} / {count}
        </span>
        <Button variant="ghost" disabled={blank} onClick={() => onStrokesChange(index, [])}>
          Clear
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/WritingPrompt.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/WritingPrompt.tsx src/components/WritingPrompt.test.tsx
git commit -m "feat(writing): add the WritingPrompt drawing box"
```

---

### Task 6: Drawable characters and `WritingAnswer`

What the learner must draw (code points, whitespace dropped, each with its tone), and the reveal row that shows their drawings against the ghosted originals.

**Files:**
- Create: `src/lib/writing/characters.ts`
- Test: `src/lib/writing/characters.test.ts`
- Create: `src/components/WritingAnswer.tsx`
- Test: `src/components/WritingAnswer.test.tsx`

**Interfaces:**
- Consumes: `characterTones` from `@/lib/pinyin` (Task 3); `DrawingCanvas` (Task 4); `Stroke` (Task 2); `useSettings` from `@/hooks/useSettings`.
- Produces:
  - `interface DrawableCharacter { character: string; tone: Tone | null }`
  - `drawableCharacters(hanzi: string, pinyin: string): DrawableCharacter[]` from `@/lib/writing/characters`
  - default export `WritingAnswer` with props
    `{ characters: DrawableCharacter[]; strokes: Stroke[][]; ghost: boolean; onToggleGhost: () => void }`

- [ ] **Step 1: Write the failing test for the character split**

Create `src/lib/writing/characters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { drawableCharacters } from '@/lib/writing/characters';

describe('drawableCharacters', () => {
  it('gives one entry per character, carrying its tone', () => {
    expect(drawableCharacters('书店', 'shū diàn')).toEqual([
      { character: '书', tone: 1 },
      { character: '店', tone: 4 },
    ]);
  });

  it('drops whitespace, which is not drawable', () => {
    expect(drawableCharacters('你 好', 'nǐ hǎo').map((item) => item.character)).toEqual(['你', '好']);
  });

  it('keeps characters outside the BMP intact', () => {
    const characters = drawableCharacters('𠮷', '');
    expect(characters).toHaveLength(1);
    expect(characters[0]!.character).toBe('𠮷');
  });

  it('has no tones when the pinyin does not line up', () => {
    expect(drawableCharacters('一点儿', 'yī diǎnr').every((item) => item.tone === null)).toBe(true);
  });

  it('is empty for an empty note', () => {
    expect(drawableCharacters('', '')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/writing/characters.test.ts`
Expected: FAIL — cannot resolve `@/lib/writing/characters`.

- [ ] **Step 3: Write the character split**

Create `src/lib/writing/characters.ts`:

```ts
import { characterTones } from '@/lib/pinyin';
import type { Tone } from '@/lib/pinyin';

export interface DrawableCharacter {
  character: string;
  /** For tinting the ghost at reveal; null when the pinyin does not line up. */
  tone: Tone | null;
}

/**
 * The characters the learner has to draw: one per code point, whitespace
 * dropped. Tones are resolved before the filter so they stay aligned with the
 * pinyin even when the hanzi field contains spaces.
 */
export function drawableCharacters(hanzi: string, pinyin: string): DrawableCharacter[] {
  const tones = characterTones(hanzi, pinyin);
  return [...hanzi]
    .map((character, index) => ({ character, tone: tones[index] ?? null }))
    .filter((item) => item.character.trim() !== '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/writing/characters.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing test for the reveal row**

Create `src/components/WritingAnswer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/db';
import WritingAnswer from '@/components/WritingAnswer';
import { drawableCharacters } from '@/lib/writing/characters';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const CHARACTERS = drawableCharacters('书店', 'shū diàn');

describe('WritingAnswer', () => {
  it('shows one cell per character, labelled with that character', async () => {
    render(
      <WritingAnswer characters={CHARACTERS} strokes={[[], []]} ghost onToggleGhost={vi.fn()} />,
    );
    expect(await screen.findByRole('img', { name: 'Your drawing of 书' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Your drawing of 店' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('reports the overlay state on the toggle and calls back when pressed', async () => {
    const user = userEvent.setup();
    const onToggleGhost = vi.fn();
    render(
      <WritingAnswer
        characters={CHARACTERS}
        strokes={[[], []]}
        ghost
        onToggleGhost={onToggleGhost}
      />,
    );
    const toggle = await screen.findByRole('button', { name: 'Overlay' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(onToggleGhost).toHaveBeenCalledTimes(1);
  });

  it('reports the overlay as off when it is hidden', async () => {
    render(
      <WritingAnswer
        characters={CHARACTERS}
        strokes={[[], []]}
        ghost={false}
        onToggleGhost={vi.fn()}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Overlay' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/WritingAnswer.test.tsx`
Expected: FAIL — cannot resolve `@/components/WritingAnswer`.

- [ ] **Step 7: Write the reveal row**

Create `src/components/WritingAnswer.tsx`:

```tsx
import { Eye, EyeOff } from 'lucide-react';
import DrawingCanvas from '@/components/DrawingCanvas';
import { useSettings } from '@/hooks/useSettings';
import type { DrawableCharacter } from '@/lib/writing/characters';
import type { Stroke } from '@/lib/writing/strokes';

/**
 * The reveal: each drawing with the correct character ghosted behind it. The
 * overlay can be switched off for every cell at once, to look at one's own
 * writing unobstructed.
 */
export default function WritingAnswer({
  characters,
  strokes,
  ghost,
  onToggleGhost,
}: {
  characters: DrawableCharacter[];
  strokes: Stroke[][];
  ghost: boolean;
  onToggleGhost: () => void;
}) {
  const { settings } = useSettings();

  return (
    <div className="space-y-2" data-testid="writing-answer">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleGhost}
          aria-pressed={ghost}
          className="flex min-h-11 items-center gap-2 px-3 text-sm text-slate-500"
        >
          {ghost ? <Eye size={16} /> : <EyeOff size={16} />}
          Overlay
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {characters.map((item, index) => (
          <div
            key={index}
            className="aspect-square w-20 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <DrawingCanvas
              readOnly
              label={`Your drawing of ${item.character}`}
              strokes={strokes[index] ?? []}
              ghost={ghost ? item.character : undefined}
              // The tone is already revealed here, so colouring the ghost
              // gives nothing away.
              ghostColour={
                settings.colourHanzi && item.tone !== null
                  ? settings.toneColours[item.tone]
                  : undefined
              }
              className="h-full w-full text-slate-900 dark:text-slate-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/components/WritingAnswer.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/writing/characters.ts src/lib/writing/characters.test.ts src/components/WritingAnswer.tsx src/components/WritingAnswer.test.tsx
git commit -m "feat(writing): add drawableCharacters and the WritingAnswer reveal row"
```

---

### Task 7: Wire writing cards into `StudyPage`

The integration: branch on the direction, own the drawing state, add the Next / Show answer footer, and make the keyboard shortcut drive it.

**Files:**
- Modify: `src/pages/StudyPage.tsx`
- Test: `src/pages/StudyPage.test.tsx`

**Interfaces:**
- Consumes: `isWritingDirection` (Task 1), `Stroke` (Task 2), `WritingPrompt` (Task 5), `drawableCharacters` + `WritingAnswer` (Task 6).
- Produces: the finished study flow. No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/StudyPage.test.tsx`, inside the existing top-level `describe('StudyPage', ...)` block:

```tsx
  describe('writing cards', () => {
    // Every note must exist before renderPage(): StudySession.start snapshots
    // the queue, so a note added afterwards is not in this session.
    async function renderWritingCard(extra = false) {
      await updateDeck(deckId, { directions: ['meaning-hanzi'] });
      await createNote({ deckId, hanzi: '书店', pinyin: 'shū diàn', meaning: 'bookshop' });
      if (extra) {
        await createNote({ deckId, hanzi: '医院', pinyin: 'yī yuàn', meaning: 'hospital' });
      }
      renderPage();
      return userEvent.setup();
    }

    it('prompts with the meaning and offers a drawing box per character', async () => {
      await renderWritingCard();
      expect(await screen.findByTestId('prompt')).toHaveTextContent('bookshop');
      expect(await screen.findByTestId('writing-progress')).toHaveTextContent('1 / 2');
      expect(screen.queryByTestId('answer')).not.toBeInTheDocument();
    });

    it('advances through the characters before offering the answer', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      expect(await screen.findByTestId('writing-progress')).toHaveTextContent('2 / 2');
      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('lets the answer be revealed from the first character', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      expect(await screen.findByTestId('answer')).toHaveTextContent('书店');
      expect(await screen.findByTestId('writing-answer')).toBeInTheDocument();
      expect(screen.getAllByRole('img', { name: /Your drawing of/ })).toHaveLength(2);
    });

    it('toggles the overlay off and on', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      const toggle = await screen.findByRole('button', { name: 'Overlay' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await user.click(toggle);
      expect(screen.getByRole('button', { name: 'Overlay' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('starts the next card back at the first character with a clean box', async () => {
      const user = await renderWritingCard(true);
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      await user.click(await screen.findByRole('button', { name: /Easy/ }));

      await waitFor(() =>
        expect(screen.getByTestId('writing-progress')).toHaveTextContent('1 / 2'),
      );
      expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    });
  });
```

Add `updateDeck` to the existing `@/lib/db/decks` import at the top of the file:

```tsx
import { createDeck, updateDeck } from '@/lib/db/decks';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/StudyPage.test.tsx`
Expected: FAIL — no `writing-progress` element; the page still renders the plain prompt.

- [ ] **Step 3: Add the imports and the drawing state**

In `src/pages/StudyPage.tsx`, add to the imports:

```tsx
import { answerFor, isWritingDirection, promptFor, type NoteField } from '@/lib/study/prompt';
import { drawableCharacters } from '@/lib/writing/characters';
import type { Stroke } from '@/lib/writing/strokes';
import WritingAnswer from '@/components/WritingAnswer';
import WritingPrompt from '@/components/WritingPrompt';
```

Add the state next to the existing `const [revealed, setRevealed] = useState(false);`:

```tsx
  // Writing cards only. Drawings are deliberately not persisted: they exist to
  // be compared against the answer once, then thrown away.
  const [charIndex, setCharIndex] = useState(0);
  const [drawings, setDrawings] = useState<Stroke[][]>([]);
  const [ghost, setGhost] = useState(true);
```

- [ ] **Step 4: Reset the drawing state whenever the card changes**

In `rate`, add the three resets next to `setRevealed(false)`:

```tsx
        setItem(session.current);
        setRevealed(false);
        setCharIndex(0);
        setDrawings([]);
        setGhost(true);
```

Make the identical addition in `undo`, so an undone review never leaves its drawing behind:

```tsx
    setItem(session.current);
    setRevealed(false);
    setCharIndex(0);
    setDrawings([]);
    setGhost(true);
```

- [ ] **Step 5: Derive the writing state and update the keyboard handler**

Add above the `useEffect` that installs the keyboard listener:

```tsx
  const writing = item !== null && isWritingDirection(item.card.direction);
  const characters = writing && item ? drawableCharacters(item.note.hanzi, item.note.pinyin) : [];
  const moreCharacters = writing && charIndex < characters.length - 1;
```

Then, in that `useEffect`, replace the `else setRevealed(true);` branch and the dependency array:

```tsx
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (revealed) void rate(3);
        else if (moreCharacters) setCharIndex((index) => index + 1);
        else setRevealed(true);
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
```

```tsx
  }, [revealed, rate, moreCharacters]);
```

Place these three `const`s immediately after the `undo` callback and before the keyboard `useEffect` that reads `moreCharacters`. They are plain expressions, not hooks, and they guard on `item !== null` themselves, so the existing early returns further down stay where they are and no hook moves below a `return`.

- [ ] **Step 6: Render the drawing box and the reveal row**

In the body, replace the `<div data-testid="prompt">` block and the opening of the answer block with:

```tsx
        <div data-testid="prompt">
          {/* colour only affects the hanzi branch of FieldView; it's a no-op
              when the prompt field is pinyin or meaning. */}
          <FieldView field={promptFor(item.card.direction)} item={item} large colour={revealed} />
        </div>

        {writing && !revealed && (
          <WritingPrompt
            count={characters.length}
            index={charIndex}
            strokes={drawings}
            onStrokesChange={(index, strokes) =>
              setDrawings((previous) => {
                const next = [...previous];
                next[index] = strokes;
                return next;
              })
            }
          />
        )}

        {revealed && (
          <div
            data-testid="answer"
            className="w-full space-y-3 border-t border-slate-200 pt-6 dark:border-slate-700"
          >
            {writing && (
              <WritingAnswer
                characters={characters}
                strokes={drawings}
                ghost={ghost}
                onToggleGhost={() => setGhost((shown) => !shown)}
              />
            )}
            <div className="font-semibold">
```

The rest of the answer block is unchanged: it already renders the answer field (the hanzi, for writing cards) and then whichever of pinyin/meaning is neither prompt nor answer.

A writing card whose note has no drawable characters renders no box, and `moreCharacters` is false, so the footer offers "Show answer" straight away.

- [ ] **Step 7: Add the Next button and the ghost escape hatch**

Replace the footer's contents:

```tsx
      <footer className="space-y-2 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {revealed ? (
          <RatingButtons previews={session.previews(now)} now={now} onRate={rate} />
        ) : moreCharacters ? (
          <Button className="min-h-14 w-full" onClick={() => setCharIndex(charIndex + 1)}>
            Next
          </Button>
        ) : (
          <Button className="min-h-14 w-full" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
        <div className="flex justify-center gap-2">
          {!revealed && moreCharacters && (
            <Button variant="ghost" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          )}
          <Button variant="ghost" disabled={counts.answered === 0} onClick={undo}>
            Undo
          </Button>
        </div>
      </footer>
```

The two "Show answer" buttons are mutually exclusive: whenever the ghost one is rendered, the primary reads "Next".

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/pages/StudyPage.test.tsx`
Expected: PASS — the five new tests plus every existing one, since non-writing cards take exactly the old path.

- [ ] **Step 9: Run the whole suite**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/pages/StudyPage.tsx src/pages/StudyPage.test.tsx
git commit -m "feat(study): draw the character on writing cards"
```

---

### Task 8: End-to-end proof that the canvas actually draws

Everything so far mocks the 2D context. This is the only test that proves a real stroke reaches a real canvas, on a real touch-sized viewport.

**Files:**
- Create: `e2e/writing.spec.ts`

**Interfaces:**
- Consumes: the whole feature.
- Produces: nothing.

- [ ] **Step 1: Write the spec**

Create `e2e/writing.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('draw a two-character word, reveal it, and rate it', async ({ page }) => {
  // Turning a direction off asks for confirmation, because it deletes cards.
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill('Writing deck');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Writing deck')).toBeVisible();

  // Leave only the writing direction on, so the deck holds exactly one card.
  await page.getByText('Writing deck').click();
  await page.getByRole('link', { name: 'Deck settings' }).click();
  await page.getByRole('checkbox', { name: 'Meaning → 汉字' }).check();
  await page.getByRole('checkbox', { name: '汉字 → Meaning' }).uncheck();
  await page.getByRole('checkbox', { name: '汉字 → Pinyin' }).uncheck();
  await page.goBack();

  await page.getByRole('button', { name: 'Add word' }).click();
  await page.getByLabel('Hanzi').fill('书店');
  await page.getByLabel('Pinyin').fill('shū diàn');
  await page.getByLabel('Meaning').fill('bookshop');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('count-new')).toHaveText('1');

  await page.getByRole('button', { name: /Study/ }).click();
  await expect(page.getByTestId('prompt')).toContainText('bookshop');
  await expect(page.getByTestId('writing-progress')).toHaveText('1 / 2');

  await drawDiagonal(page, 'Draw character 1 of 2');
  await expect(page.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('writing-progress')).toHaveText('2 / 2');
  // The second box starts clean — one drawing must never leak into the next.
  await expect(page.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
  await drawDiagonal(page, 'Draw character 2 of 2');

  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('answer')).toContainText('书店');
  await expect(page.getByRole('img', { name: /Your drawing of/ })).toHaveCount(2);

  const overlay = page.getByRole('button', { name: 'Overlay' });
  await expect(overlay).toHaveAttribute('aria-pressed', 'true');
  await overlay.click();
  await expect(overlay).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: /Easy/ }).click();
  await expect(page.getByText('All done')).toBeVisible();
});

async function drawDiagonal(page: import('@playwright/test').Page, label: string) {
  const box = await page.getByRole('img', { name: label }).boundingBox();
  if (!box) throw new Error(`No drawing box for "${label}"`);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 10 });
  await page.mouse.up();
}
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/writing.spec.ts`
Expected: PASS.

The settings control is the icon link labelled `Deck settings` in `src/pages/DeckPage.tsx:39-43`; `page.goBack()` returns to the deck.

- [ ] **Step 3: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS. Avoid the 03:59–04:01 window, which makes the existing stats assertions flaky (see `README.md`).

- [ ] **Step 4: Commit**

```bash
git add e2e/writing.spec.ts
git commit -m "test(e2e): cover drawing, revealing and rating a writing card"
```

---

## Verification

Run all three before calling the feature done:

```bash
npm test
npm run typecheck
npm run test:e2e
```

Then check by hand on a phone-sized viewport (`npm run dev`): drawing must not scroll the page, the stroke must land under the finger, and the ghost must be legible in both light and dark mode.
