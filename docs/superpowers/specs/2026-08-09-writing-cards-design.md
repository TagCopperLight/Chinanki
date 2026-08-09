# Writing cards: * → 汉字

## Goal

Add the two card directions that need a drawing surface, `meaning → 汉字` and
`pinyin → 汉字`. The learner draws the character with a finger or stylus, then
reveals the correct one ghosted behind the drawing and rates the recall as with
every other card.

This closes the gap named in `OBJECTIVES.MD`: every field can already prompt
every other field except writing, which was deferred precisely because it needs
drawing.

## Decisions

- **The app never judges the drawing.** No handwriting recognition, no
  stroke-order validation. You draw, you see the answer, you rate yourself.
  This matches the app's existing self-check philosophy, works offline with no
  dependency, and avoids a recogniser that would be wrong often enough to be
  worse than no feedback at all.
- **One character at a time**, one box per character, not a free canvas for the
  whole word. The box is as large as the screen allows, and every drawing lands
  in the same coordinate space so the ghost overlay lines up. The accepted
  cost is that the character count is revealed by the `2 / 3` indicator.
- **Reveal is never blocked.** "Show answer" is live from the first character.
  Skipped characters show the ghost alone.
- **Drawings are not persisted.** Strokes live in component state and are
  discarded when the card is rated. Nothing new is written to IndexedDB.
- **Canvas 2D**, not SVG paths, for the drawing surface. The stroke model is
  kept in a pure module so the logic is unit-testable; the canvas element
  itself is covered by e2e.

## Directions

`Direction` gains `'meaning-hanzi'` and `'pinyin-hanzi'`, added to
`ALL_DIRECTIONS` and to `DIRECTION_LABELS` as `Meaning → 汉字` and
`Pinyin → 汉字`.

`promptFor` and `answerFor` need no change — a direction is literally
`<prompt>-<answer>` and they split on the hyphen. `src/lib/study/prompt.ts`
gains one predicate:

```ts
export function isWritingDirection(direction: Direction): boolean {
  return answerFor(direction) === 'hanzi';
}
```

No schema change and no migration. Existing decks keep the directions they
have; `reconcile` in `src/lib/db/notes.ts` already creates cards for newly
enabled directions and removes them for disabled ones, so the deck settings
page simply lists six checkboxes instead of four. FSRS schedules the new cards
independently, exactly like the existing ones. Nothing in `src/lib/io/`
validates direction strings, so backup and CSV import need no change.

## Stroke model

`src/lib/writing/strokes.ts` is pure and holds the whole model:

```ts
export interface Point { x: number; y: number }   // normalised, 0–1
export type Stroke = Point[];
```

Coordinates are normalised to the unit square at capture time, from the
canvas's CSS box. This is what makes one drawing renderable at several sizes:
full-size in the drawing box, thumbnail-size in the reveal row, and at any
device pixel ratio, without storing anything device-specific.

The module exports `appendPoint`, `undoLastStroke`, `isEmpty`, and a
quadratic-smoothing path builder that turns a normalised stroke into the
sequence of `quadraticCurveTo` control points for a given pixel size. Points
closer than a small epsilon are dropped so a stationary finger does not inflate
the stroke.

## Components

**`src/components/DrawingCanvas.tsx`** — one canvas element, sized to a square
that fits the viewport, backed by a device-pixel-ratio-aware bitmap. Pointer
events with `setPointerCapture` so a stroke survives leaving the element, and
`touch-action: none` so drawing never scrolls the page. All pointer types are
accepted; there is no palm rejection.

Props include `readOnly` and `ghost`. The reveal row renders the same component
in read-only mode rather than introducing a second renderer.

**`src/components/WritingPrompt.tsx`** — owns the current character index and
the array of stroke arrays (one per character). Renders the box, the `2 / 3`
indicator, and the canvas controls. Lifts the stroke data to `StudyPage` so the
reveal can render it.

**`src/pages/StudyPage.tsx`** — branches on `isWritingDirection` to render
`WritingPrompt` in place of the plain prompt, and the reveal row in place of
the plain answer field. It stays an orchestrator; the writing logic does not
grow inline.

Characters come from `[...note.hanzi]`, so code points stay intact for
characters outside the BMP. Whitespace produces no box.

## Card flow

Prompt (meaning or pinyin) at the top, drawing box below it, indicator showing
position within the word.

The footer's primary button is **Next** until the last character, then **Show
answer**. Because reveal is never blocked, a ghost **Show answer** also appears
next to the review Undo whenever you are not on the last character.

The canvas controls sit with the box, not in the footer: **Undo stroke**
(disabled when the current character has no strokes) and **Clear**. The label
is deliberately *Undo stroke* rather than *Undo*, because the footer already
has a review-level Undo and the two must not read as the same action.

## Reveal

A row of N cells, wrapping when the word is long. Each cell is a read-only
`DrawingCanvas` showing your strokes in the normal text colour, with the target
character painted behind them via `ctx.fillText`, sized to fill the cell. Cells
for characters you skipped show the ghost alone.

The ghost is a light grey at low opacity, or the character's tone colour when
`colourHanzi` is enabled — the tone is already revealed at that point, so
colouring it gives nothing away.

A single eye-icon toggle above the row turns the ghost off for every cell at
once, so you can look at your own writing unobstructed. It resets to on for
each new card.

Below the row, the existing answer block is unchanged: pinyin, meaning, notes,
then `RatingButtons`.

## Keyboard

The existing global handler in `StudyPage` reveals on Space/Enter. On writing
cards it drives the primary button instead: advance to the next character, and
on the last one reveal. `1`–`4` still rate once revealed. The canvas is not a
focusable form control, so the handler's existing interactive-tag guard
continues to work unchanged.

## Testing

- **Unit** — `strokes.ts` in full: normalisation, epsilon filtering, undo,
  empty detection, path building. Plus `isWritingDirection`.
- **Component** — `WritingPrompt` with `HTMLCanvasElement.prototype.getContext`
  stubbed to a no-op spy in `src/vitest.setup.ts`, since jsdom implements no 2D
  context. Assertions are on behaviour, never pixels: the index advances, Undo
  stroke disables when there is nothing to undo, Show answer is reachable from
  character 1 of 3, the box count matches `[...note.hanzi]`.
- **E2E** — one Playwright spec that enables a writing direction on a deck,
  draws with mouse moves, advances through the characters, reveals, toggles the
  ghost, and rates. This is where the real canvas is exercised.

## Edge cases

- A note with empty hanzi renders no boxes and goes straight to reveal.
- Words longer than four characters wrap in the reveal row.
- Stroke state is cleared when the card changes and when a review is undone, so
  a drawing can never leak onto the next card.
- Dark mode: strokes take the normal foreground colour, the ghost stays a low
  opacity grey against either background.

## Out of scope

Stroke-order validation, handwriting recognition, animated stroke replay, and
saving drawings for later review. Each is a separate feature; none is required
for self-checked writing practice.
