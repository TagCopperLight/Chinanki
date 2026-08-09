# Icon Set and Stats Chart Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's emoji and text-character UI glyphs with lucide-react icons, and make the two Recharts charts on the Statistics page readable in dark mode.

**Architecture:** Icons are imported by name from `lucide-react` at each use site — no wrapper module — and inherit colour through `currentColor`, so the existing Tailwind `dark:` colour states drive them unchanged. Chart chrome is themed by passing Tailwind utility classes into Recharts' `className`-forwarding props (`cursor`, `tick`) plus one shared `ChartTooltip` component; SVG presentation attributes like Recharts' hardcoded `fill="#ccc"` lose to CSS class rules, so no JS theme state is needed.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Recharts 3.10, react-router 8, Vitest + Testing Library, Playwright.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-09-icons-and-chart-dark-mode-design.md`. Read it before starting.
- Dark mode is a `dark` class on `<html>`, applied by `ThemeEffect` in `src/App.tsx:7-18`. Tailwind's variant is declared in `src/index.css` as `@custom-variant dark (&:where(.dark, .dark *));`.
- `@/` is a Vite alias for `./src` (`vite.config.ts` `resolve.alias`). Use `@/...` imports, matching every existing file.
- Vitest runs with `globals: true` and the jsdom environment, but every existing test file still imports `describe`, `expect`, `it` explicitly from `vitest`. Follow that convention.
- **No accessible name may change.** `src/App.test.tsx` and `e2e/smoke.spec.ts` query by role and name. If one of them fails, the implementation has the wrong label — fix the implementation, never the test.
- The 🎉 in `src/pages/StudyPage.tsx:126` stays as an emoji. It is explicitly out of scope.
- Chart series colours `#0284c7` and `#16a34a` stay exactly as they are. They were validated against both the light `#f8fafc` and dark `#0f172a` surfaces and pass all six checks. Do not "improve" them.
- `src/components/Heatmap.tsx` is already dark-mode correct. Do not touch it.
- Commit after every task, using Conventional Commits prefixes (`feat:`, `fix:`, `docs:`) as the existing history does.
- **Do not assert on Tailwind class strings in tests.** jsdom cannot compute Tailwind styles, so such assertions test markup rather than behaviour and break on any restyle. Dark-mode appearance is verified by the manual check in Task 4, not by unit tests. Assertions on inline `style` values (which jsdom does compute) are fine.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `package.json` | adds the `lucide-react` dependency | 1 |
| `src/components/NavBar.tsx` | modify — three tab icons become components | 1 |
| `src/components/NavBar.test.tsx` | create — asserts icons render and emoji are gone | 1 |
| `src/components/PageHeader.tsx` | modify — back arrow becomes `ChevronLeft` | 2 |
| `src/components/PageHeader.test.tsx` | create — asserts the back control keeps its name | 2 |
| `src/pages/DeckPage.tsx` | modify — deck settings ⚙️ becomes `Settings` | 2 |
| `src/pages/StudyPage.tsx` | modify — close ✕ becomes `X` | 2 |
| `src/components/ChartTooltip.tsx` | create — the one themed tooltip renderer | 3 |
| `src/components/ChartTooltip.test.tsx` | create — its behaviour | 3 |
| `src/pages/StatsPage.tsx` | modify — wires tooltip, cursors, axis ticks | 4 |

---

### Task 1: Add lucide-react and convert the navigation bar

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/components/NavBar.tsx` (whole file)
- Test: `src/components/NavBar.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: establishes the icon convention that Task 2 follows — named import from `lucide-react`, explicit `size`, colour left to `currentColor`, no `aria-label` on the icon itself.

**Context you need:** `NavBar` renders three `NavLink`s from `react-router`. Each currently holds an emoji string in a `TABS` const array and renders it inside `<span aria-hidden className="text-xl">`. The active state is purely a text colour (`text-sky-600 dark:text-sky-400`), which is why `currentColor` inheritance means the icons need no active-state handling of their own. Because `NavBar` uses `NavLink`, any test rendering it must wrap it in a router — use `MemoryRouter` from `react-router`, as `src/pages/DeckPage.test.tsx:19` does.

- [ ] **Step 1: Install the dependency**

```bash
npm install lucide-react
```

Expected: `package.json` gains `"lucide-react"` under `dependencies`, and `package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Create `src/components/NavBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import NavBar from '@/components/NavBar';

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>,
  );
}

describe('NavBar', () => {
  it('keeps a visible text label on every tab', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Decks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('draws an svg icon in each tab rather than an emoji character', () => {
    const { container } = renderNav();

    for (const name of ['Decks', 'Stats', 'Settings']) {
      const tab = screen.getByRole('link', { name });
      expect(tab.querySelector('svg')).toBeInTheDocument();
    }

    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('marks the icon decorative so the label alone names the tab', () => {
    renderNav();
    const tab = screen.getByRole('link', { name: 'Decks' });
    expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tab).toHaveAccessibleName('Decks');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/components/NavBar.test.tsx
```

Expected: FAIL. The emoji-character assertion fails on `container.textContent` matching 📚, and `tab.querySelector('svg')` returns `null`.

- [ ] **Step 4: Rewrite NavBar**

Replace the entire contents of `src/components/NavBar.tsx`:

```tsx
import { NavLink } from 'react-router';
import { ChartColumn, Library, Settings } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Decks', Icon: Library },
  { to: '/stats', label: 'Stats', Icon: ChartColumn },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const;

export default function NavBar() {
  return (
    <nav className="sticky bottom-0 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
```

Note what changed and what did not: the `<span aria-hidden className="text-xl">` wrapper is gone, because the SVG sizes itself and lucide already sets `aria-hidden="true"`. Every className on `<nav>` and `<NavLink>` is byte-for-byte unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/components/NavBar.test.tsx src/App.test.tsx
```

Expected: PASS, both files. `App.test.tsx`'s "renders the bottom navigation" test must pass without modification.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/NavBar.tsx src/components/NavBar.test.tsx
git commit -m "feat(nav): replace bottom tab emoji with lucide icons"
```

---

### Task 2: Convert the three header controls

**Files:**
- Modify: `src/components/PageHeader.tsx:16-25` (the back button)
- Modify: `src/pages/DeckPage.tsx:34-45` (the deck settings link)
- Modify: `src/pages/StudyPage.tsx:148-156` (the close button)
- Test: `src/components/PageHeader.test.tsx` (create)

**Interfaces:**
- Consumes: the `lucide-react` dependency added in Task 1, and its convention (named import, explicit `size`, colour via `currentColor`).
- Produces: nothing later tasks depend on.

**Context you need:** All three controls already carry their accessible name on the interactive element itself, via `aria-label` — `"Back"` on the `PageHeader` button, `"Deck settings"` on the `DeckPage` `Link`, `"Close"` on the `StudyPage` button. The glyph inside is purely decorative. Each element also carries `min-h-11 min-w-11` for the touch target; keep that. The `text-xl` class on these elements exists only to size the character glyph — remove it, since the icon takes an explicit `size` prop, but keep `text-slate-500` where present because the icon inherits it.

`PageHeader` calls `useNavigate()`, so its test needs a `MemoryRouter` wrapper.

- [ ] **Step 1: Write the failing test**

Create `src/components/PageHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import PageHeader from '@/components/PageHeader';

function renderHeader(props: { title: string; backTo?: string }) {
  return render(
    <MemoryRouter initialEntries={['/deck/1']}>
      <PageHeader {...props} />
    </MemoryRouter>,
  );
}

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    renderHeader({ title: 'Statistics' });
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });

  it('omits the back control when there is nowhere to go back to', () => {
    renderHeader({ title: 'Statistics' });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('draws the back control as an svg icon that keeps the accessible name', () => {
    renderHeader({ title: 'HSK 1', backTo: '/' });

    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveAccessibleName('Back');
    expect(back.querySelector('svg')).toBeInTheDocument();
    expect(back.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/PageHeader.test.tsx
```

Expected: FAIL on "draws the back control as an svg icon" — `back.textContent` is `'←'`, not `''`, and `querySelector('svg')` returns `null`. The other three tests pass already.

- [ ] **Step 3: Convert PageHeader's back button**

In `src/components/PageHeader.tsx`, add to the imports at the top of the file:

```tsx
import { ChevronLeft } from 'lucide-react';
```

Then replace the back button block:

```tsx
      {backTo && (
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(backTo)}
          className="flex min-h-11 min-w-11 items-center justify-center text-slate-500"
        >
          <ChevronLeft size={20} />
        </button>
      )}
```

`text-xl` is dropped (it only sized the character) and `flex items-center justify-center` is added so the icon centres inside the 44px target.

- [ ] **Step 4: Convert DeckPage's settings link**

In `src/pages/DeckPage.tsx`, add to the imports:

```tsx
import { Settings } from 'lucide-react';
```

Then replace the `action` prop's `Link`:

```tsx
        action={
          <Link
            to={`/deck/${deckId}/settings`}
            className="flex min-h-11 min-w-11 items-center justify-center px-2 py-2 text-slate-500"
            aria-label="Deck settings"
          >
            <Settings size={20} />
          </Link>
        }
```

- [ ] **Step 5: Convert StudyPage's close button**

In `src/pages/StudyPage.tsx`, add to the imports:

```tsx
import { X } from 'lucide-react';
```

Then replace the close button:

```tsx
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate(`/deck/${deckId}`)}
          className="flex min-h-11 min-w-11 items-center justify-center text-slate-500"
        >
          <X size={20} />
        </button>
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS, all files. `src/pages/DeckPage.test.tsx`, `src/pages/StudyPage.test.tsx` and the new `PageHeader.test.tsx` must all pass with no test edits.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/PageHeader.tsx src/components/PageHeader.test.tsx src/pages/DeckPage.tsx src/pages/StudyPage.tsx
git commit -m "feat(ui): use lucide icons for the back, close and deck settings controls"
```

---

### Task 3: Build the themed chart tooltip

**Files:**
- Create: `src/components/ChartTooltip.tsx`
- Test: `src/components/ChartTooltip.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces — Task 4 depends on all of these exactly:
  - default export `ChartTooltip`, a React component
  - `ChartTooltipProps` — `{ active?: boolean; label?: string | number; payload?: ReadonlyArray<ChartTooltipEntry>; formatValue?: (value: number) => string }`
  - exported type `ChartTooltipEntry` — `{ name?: string; value?: number | string; color?: string; fill?: string; stroke?: string }`

**Context you need:** Recharts renders a custom tooltip by cloning the element passed to `<Tooltip content={...}>` and injecting `active`, `label` and `payload` as props. Do **not** type this component with Recharts' own `TooltipContentProps` — that type marks `payload`, `coordinate`, `active`, `accessibilityLayer` and `activeIndex` as required, which makes the component impossible to render directly in a test. Declare the narrow prop type above instead. It is structurally compatible with what Recharts injects, and `<ChartTooltip />` still satisfies the `content` prop because that prop accepts any `ReactElement`.

A bar's payload entry carries its colour on `fill`; a line's carries it on `stroke`; Recharts also sets `color` on both. Read them in that priority order: `color ?? fill ?? stroke`.

`formatValue` only receives numbers. When a value is not a number, render it as-is.

- [ ] **Step 1: Write the failing test**

Create `src/components/ChartTooltip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChartTooltip from '@/components/ChartTooltip';

describe('ChartTooltip', () => {
  it('renders nothing when the tooltip is inactive', () => {
    const { container } = render(
      <ChartTooltip active={false} label="2026-08-09" payload={[{ name: 'Due', value: 12 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no payload', () => {
    const { container } = render(<ChartTooltip active label="2026-08-09" payload={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the category label and each series name and value', () => {
    render(
      <ChartTooltip
        active
        label="2026-08-09"
        payload={[{ name: 'Due', value: 12, fill: '#0284c7' }]}
      />,
    );

    expect(screen.getByText('2026-08-09')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('applies formatValue to numeric values', () => {
    render(
      <ChartTooltip
        active
        label="2026-07"
        payload={[{ name: 'rate', value: 0.874, stroke: '#16a34a' }]}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />,
    );

    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  it('leaves non-numeric values alone even when formatValue is given', () => {
    render(
      <ChartTooltip
        active
        label="2026-07"
        payload={[{ name: 'rate', value: 'n/a' }]}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />,
    );

    expect(screen.getByText('n/a')).toBeInTheDocument();
  });

  it('takes the swatch colour from fill, stroke or color', () => {
    const { container } = render(
      <ChartTooltip active label="2026-08-09" payload={[{ name: 'Due', value: 12, fill: '#0284c7' }]} />,
    );

    const swatch = container.querySelector('[data-testid="tooltip-swatch"]') as HTMLElement;
    expect(swatch).toBeInTheDocument();
    expect(swatch.style.backgroundColor).toBe('rgb(2, 132, 199)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/ChartTooltip.test.tsx
```

Expected: FAIL — "Failed to resolve import `@/components/ChartTooltip`". The file does not exist yet.

- [ ] **Step 3: Write the component**

Create `src/components/ChartTooltip.tsx`:

```tsx
/**
 * Recharts' default tooltip hardcodes a white surface and sets no text colour, so
 * in dark mode it renders white-on-white. This replaces it with a surface that
 * follows the app's theme. Recharts injects `active`, `label` and `payload` when
 * it clones the element passed to <Tooltip content={...}>.
 */
export type ChartTooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  stroke?: string;
};

export type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<ChartTooltipEntry>;
  /** Applied to numeric values only; non-numeric values render as-is. */
  formatValue?: (value: number) => string;
};

export default function ChartTooltip({ active, label, payload, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      {label != null && (
        <p className="mb-1 text-slate-500 dark:text-slate-400">{label}</p>
      )}
      {payload.map((entry, index) => {
        const swatch = entry.color ?? entry.fill ?? entry.stroke;
        const value =
          typeof entry.value === 'number' && formatValue ? formatValue(entry.value) : entry.value;

        return (
          <p key={`${entry.name ?? 'series'}-${index}`} className="flex items-center gap-1.5">
            {swatch && (
              <span
                data-testid="tooltip-swatch"
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: swatch }}
              />
            )}
            <span className="text-slate-500 dark:text-slate-400">{entry.name}</span>
            <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {value}
            </span>
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/ChartTooltip.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChartTooltip.tsx src/components/ChartTooltip.test.tsx
git commit -m "feat(stats): add a theme-aware chart tooltip"
```

---

### Task 4: Theme the chart chrome on the Statistics page

**Files:**
- Modify: `src/pages/StatsPage.tsx` — imports, and both chart blocks
- Verify: `src/pages/StatsPage.test.tsx` (must pass unmodified)

**Interfaces:**
- Consumes: `ChartTooltip`, its default export and its `formatValue` prop, from Task 3.
- Produces: nothing later tasks depend on. This is the last task.

**Context you need — read before editing.** Three facts were confirmed by reading the installed Recharts 3.10 source. They are why this approach works:

1. `recharts/es6/util/cursor/getCursorRectangle.js:5` returns `fill: '#ccc'`. It reaches the DOM as an SVG **presentation attribute**, which has lower precedence than any CSS rule — so a Tailwind `fill-*` class overrides it.
2. `recharts/es6/component/Cursor.js` builds the cursor's className as `clsx('recharts-tooltip-cursor', extraClassName)`, where `extraClassName` is taken from `cursor.className`. So `cursor={{ className: '...' }}` lands on the element.
3. `recharts/es6/cartesian/CartesianAxis.js:217` builds tick classNames as `clsx(tickProps.className, 'recharts-cartesian-axis-tick-value')`. So `tick={{ className: '...' }}` lands too.

The bar chart's cursor is a filled `Rectangle`, so it takes `fill-*`. The line chart's cursor is a stroked `Curve`, so it takes `stroke-*`. Using the wrong one is a silent no-op.

Both chart containers are wrapped in `aria-hidden="true"` and each already has an `sr-only` paragraph summarising the data. Leave both alone — that is the existing accessibility strategy, and it is why a tooltip inside an `aria-hidden` subtree is acceptable here.

- [ ] **Step 1: Verify the className assumption before writing the rest**

This is the plan's one load-bearing assumption. Confirm it against the installed package:

```bash
grep -n "extraClassName" node_modules/recharts/es6/component/Cursor.js
grep -n "combinedClassName" node_modules/recharts/es6/cartesian/CartesianAxis.js
```

Expected: `Cursor.js` shows `className: clsx('recharts-tooltip-cursor', extraClassName)`, and `CartesianAxis.js` shows `clsx(tickProps.className, 'recharts-cartesian-axis-tick-value')`.

If either grep comes back empty, **stop and report**. The fallback is CSS custom properties — define `--chart-cursor` and `--chart-ink` under `:root` and `.dark` in `src/index.css`, then pass `cursor={{ fill: 'var(--chart-cursor)' }}` and `tick={{ fill: 'var(--chart-ink)' }}` for whichever prop failed only. Do not switch approach wholesale.

- [ ] **Step 2: Add the import**

In `src/pages/StatsPage.tsx`, add alongside the other `@/components` imports:

```tsx
import ChartTooltip from '@/components/ChartTooltip';
```

- [ ] **Step 3: Theme the forecast bar chart**

Replace the `<BarChart>` block's children:

```tsx
                  <BarChart data={forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      interval={6}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      width={28}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ className: 'fill-slate-200/70 dark:fill-slate-700/60' }}
                    />
                    <Bar dataKey="dueCount" name="Due" fill="#0284c7" />
                  </BarChart>
```

`CartesianGrid` and the `Bar` fill are unchanged.

- [ ] **Step 4: Theme the retention line chart**

Replace the `<LineChart>` block's children:

```tsx
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        width={36}
                        tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                        tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip formatValue={(value) => `${Math.round(value * 100)}%`} />
                        }
                        cursor={{ className: 'stroke-slate-300 dark:stroke-slate-600' }}
                      />
                      <Line type="monotone" dataKey="rate" stroke="#16a34a" dot={false} />
                    </LineChart>
```

The old `<Tooltip formatter={...}>` is gone — that formatting now lives in `formatValue`. `CartesianGrid` and the `Line` stroke are unchanged.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS, all files. `src/pages/StatsPage.test.tsx` must pass with no edits.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

If `cursor={{ className: ... }}` is rejected by TypeScript, the cursor prop's type does accept SVG props — check that the object contains only `className` and no stray keys before assuming the type is wrong.

- [ ] **Step 7: Check the bundle cost of lucide-react**

```bash
npm run build
```

Expected: build succeeds. Note the reported size of the main JS chunk. The six icons should add on the order of a kilobyte, not tens of kilobytes. If the delta is large, lucide is not being tree-shaken — switch the six imports to per-icon paths (`import Library from 'lucide-react/icons/library'`) and rebuild.

- [ ] **Step 8: Look at the result**

```bash
npm run dev
```

Open the app, go to Settings and set Theme to Dark, then go to Statistics with a deck that has review history. Confirm, by looking:

- Hovering or tapping a bar in "Upcoming workload" highlights the column in a muted slate band, not a white slab.
- The tooltip is a dark slate card with legible light text and a coloured dot beside the series name.
- The retention chart's tooltip shows a percentage, and its cursor is a visible but recessive vertical line.
- Axis tick labels are legible against the dark background.
- The tooltip does not clip at the left or right edge of the 480px-wide layout — check the first and last bar specifically.
- Switch Theme back to Light and confirm both charts still look right.

- [ ] **Step 9: Run the e2e smoke test**

```bash
npx playwright test
```

Expected: PASS. If Playwright browsers are not installed, run `npx playwright install --with-deps chromium` first.

- [ ] **Step 10: Commit**

```bash
git add src/pages/StatsPage.tsx
git commit -m "fix(stats): make chart cursors, tooltips and axes readable in dark mode"
```

---

## Done When

- No emoji remain in `src/components/NavBar.tsx`, `src/pages/DeckPage.tsx`, `src/components/PageHeader.tsx`, or the close control in `src/pages/StudyPage.tsx`. The 🎉 on the "All done" screen remains.
- Both Statistics charts are legible in dark mode: muted cursor, themed tooltip, legible axis ticks.
- `npm test`, `npm run typecheck` and `npx playwright test` all pass.
- No existing test file was edited.
