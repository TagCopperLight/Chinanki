# Icon set and stats chart dark mode

## Problem

Two unrelated visual defects, both in the app's chrome.

The bottom navigation bar labels its three tabs with emoji (📚 📈 ⚙️). Emoji render
with the platform's own colour and weight, so the tabs do not respond to the
active/inactive colour states around them and do not match each other in optical
weight. The same ⚙️ appears again in the deck header, and two text characters
(✕ for closing a study session, ← for the back button) stand in for icons
elsewhere.

In dark mode, hovering or tapping a chart on the Statistics page produces a light
column over the hovered category and a tooltip that is white-on-white and
therefore unreadable.

## Cause of the dark mode defect

Confirmed in the installed Recharts 3.10:

- `recharts/es6/util/cursor/getCursorRectangle.js:5` hardcodes the hover cursor
  rectangle to `fill: '#ccc'`. This is the light column.
- `recharts/es6/component/DefaultTooltipContent.js:35` hardcodes the tooltip
  wrapper to a `#fff` background with a `#ccc` border, and sets no colour on the
  label text, which therefore inherits the app's `dark:text-slate-100` ink.
- `Bar.js:495` defaults `activeBar` to `false`, so the bar itself is not
  highlighted. The cursor rectangle accounts for the whole effect.

Axis tick labels separately inherit Recharts' `#666` default, which is too dim
against the `#0f172a` dark surface.

## Scope

In scope: the six glyph sites listed below, and the chrome of the two Recharts
charts on the Statistics page.

Out of scope: the 🎉 in the study session's "All done" screen, which stays as an
emoji by decision — it is a once-per-session decorative reward, not UI chrome,
and a monochrome stroke icon would lose the warmth. The `Heatmap` component
already carries explicit `dark:` classes and needs no change. The chart series
colours also stay as they are (see below).

## Icon system

Add `lucide-react` as a runtime dependency. Import named icons directly at each
use site rather than through a wrapper module, so Vite's Rollup build tree-shakes
to only the icons used.

| Site | Current | Replacement |
|---|---|---|
| `NavBar.tsx` — Decks | 📚 | `Library` |
| `NavBar.tsx` — Stats | 📈 | `ChartColumn` |
| `NavBar.tsx` — Settings | ⚙️ | `Settings` |
| `DeckPage.tsx:42` — deck settings link | ⚙️ | `Settings` |
| `StudyPage.tsx:154` — close session | ✕ | `X` |
| `PageHeader.tsx:23` — back | ← | `ChevronLeft` |
| `StudyPage.tsx:126` — "All done" | 🎉 | unchanged |

Icons render at `size={22}` in the navigation bar and `size={20}` for the three
header controls, at lucide's default `strokeWidth={2}`. They take their colour
from `currentColor`, so `NavBar`'s existing `text-sky-600 dark:text-sky-400`
active state and `text-slate-500` inactive state drive the icon colour with no
further work — the tabs' active treatment is already colour-based.

Lucide emits `aria-hidden="true"` on its SVGs by default, which is correct at
every site here: the navigation tabs carry visible text labels, and the three
header controls carry `aria-label` on the button or link element
(`"Back"`, `"Close"`, `"Deck settings"`). No accessible name changes anywhere.

One structural consequence: `NavBar.tsx`'s `TABS` array currently types `icon` as
a string. It becomes a component reference (`icon: Library`), and the
`<span aria-hidden className="text-xl">` wrapper is removed, since the SVG sizes
itself.

## Chart chrome

### `src/components/ChartTooltip.tsx` (new)

One tooltip renderer shared by both charts, typed against a narrow local prop
type rather than Recharts' `TooltipContentProps`, since that type marks
`payload`, `coordinate`, `active`, `accessibilityLayer` and `activeIndex` as
required, which would make the component impossible to render directly in a
test. It renders the category label, then one row per payload entry: a small
swatch in the series colour, the series name, and the value.

Surface: `bg-white dark:bg-slate-800`, `border border-slate-200
dark:border-slate-700`, `rounded-lg`, `shadow-md`. Value text in
`text-slate-900 dark:text-slate-100`; category label in `text-slate-500
dark:text-slate-400`. Text wears text tokens; the swatch beside it carries series
identity. Colour is never the only channel.

It takes an optional `formatValue` prop. The retention chart passes a formatter
that renders `0.87` as `87%`, replacing the current `<Tooltip formatter={...}>`.

### `src/pages/StatsPage.tsx`

- Both `<Tooltip>` elements take `content={<ChartTooltip />}`.
- Bar chart cursor: `cursor={{ className: 'fill-slate-200/70 dark:fill-slate-700/60' }}`.
  Recharts forwards `className` to the cursor `<Rectangle>`; Tailwind's `fill-*`
  utilities target the SVG `fill` property and so override the hardcoded `#ccc`.
- Line chart cursor: `cursor={{ className: 'stroke-slate-300 dark:stroke-slate-600' }}`,
  since that cursor is a stroked line rather than a filled rectangle.
- All four axes: `tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}`.
- `CartesianGrid` is unchanged. Its `stroke="#94a3b8"` at `strokeOpacity={0.2}` is
  slate-400 at low opacity — deliberately recessive and legible on both surfaces.

### Series colours: unchanged, by measurement

`#0284c7` (bar) and `#16a34a` (line) were run through the dataviz palette
validator against both surfaces:

- light, surface `#f8fafc`: all six checks PASS
- dark, surface `#0f172a`: all six checks PASS

Both sit inside the dark mode OKLCH lightness band of 0.48–0.67, clear the chroma
floor, and exceed 3:1 contrast against both surfaces. Dark mode is a deliberate
selection here rather than an automatic flip; these steps happen to be the correct
selection for both modes, so they stay. Each chart carries a single series, so no
legend is required — the section heading names the series.

## Testing

`src/components/ChartTooltip.test.tsx` (new) renders the component with a
synthetic payload and asserts that the category label, series name and value
appear, and that `formatValue` is applied when supplied. This is the only piece
with real logic; the icon swaps and the className props are declarative.

All existing tests must pass unmodified. `App.test.tsx` and `e2e/smoke.spec.ts`
query by role and accessible name, and no accessible name changes. A test that
breaks indicates a wrong label in the implementation, not a test to be edited.

Manual verification, after `npm run dev`: switch Settings → Theme → Dark, then
hover and tap a bar in "Upcoming workload" and a point in "Retention by month".
Confirm the tooltip does not clip at the chart edges within the 480px-max-width
mobile layout, and that the navigation icons are optically balanced. The palette
validator checks colour, not layout, so the rendered result must be looked at.

## Risks

**Recharts `className` forwarding.** The design assumes Recharts passes
`className` through to the cursor `<Rectangle>` and the tick `<Text>`. The
hardcoded defaults being overridden are confirmed in source, but the full
prop-spread path is not. Verify this first, before the rest of the chart work. If
a class does not land, apply the CSS-custom-property fallback
(`cursor={{ fill: 'var(--chart-cursor)' }}` with `--chart-cursor` defined under
`:root` and `.dark` in `index.css`) to the specific prop that misbehaves — not as
a wholesale change of approach.

**Bundle size.** `lucide-react` is large in aggregate, which matters for an
offline-first PWA where the bundle is precached by the service worker. Named
imports should tree-shake to the six icon modules used. Compare `npm run build`
output size before and after; if the icons are not tree-shaken, switch to
per-icon imports from `lucide-react/icons/<name>`.
