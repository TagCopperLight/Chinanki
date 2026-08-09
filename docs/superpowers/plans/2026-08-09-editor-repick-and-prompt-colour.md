# Dictionary Re-pick and 汉字 Prompt Tone Colour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every dictionary suggestion pick overwrite Pinyin and Meaning, and stop tone-colouring the 汉字 prompt on 汉字 → cards until the answer is revealed.

**Architecture:** Two independent, small changes. Task 1 removes the blank-field guards in `NoteEditorPage.applySuggestion`. Task 2 adds an opt-out `colour` prop to the presentational `HanziText` component, which `StudyPage` drives from its existing `revealed` state. The tasks touch disjoint files and can be done in either order.

**Tech Stack:** React 19, TypeScript, Vite, Dexie (IndexedDB), Vitest + @testing-library/react, Tailwind classes inline.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-editor-and-prompt-colour-fixes-design.md`.
- Branch: `fix/editor-repick-and-prompt-colour` (already checked out; the spec is committed there).
- Run tests with `npm test` (Vitest, non-watch). Run a single file with `npm test -- src/pages/StudyPage.test.tsx`.
- Type-check with `npm run typecheck`. It must pass before each commit.
- The codebase spells the word "colour" (British), e.g. `colourHanzi`, `toneColours`. Match it.
- Imports use the `@/` alias for `src/`.
- Do not add new user-facing settings. The existing `colourHanzi` setting keeps its current meaning.
- Do not touch `src/pages/BrowsePage.tsx`.

---

### Task 1: Dictionary picks always overwrite Pinyin and Meaning

**Files:**
- Modify: `src/pages/NoteEditorPage.tsx:47-52`
- Test: `src/pages/NoteEditorPage.test.tsx:72-81` (replace this existing test)

**Interfaces:**
- Consumes: `DictEntry` from `@/lib/dictionary` — `{ simplified: string; traditional: string; pinyin: string; meanings: string[] }`. Already imported in the file.
- Produces: nothing consumed by Task 2. The tasks are independent.

**Context you need:** `applySuggestion` is passed to `<DictionarySuggestions onPick={applySuggestion} />`. `DictionarySuggestions` already calls `onPick` on every click, so no change is needed there — the bug is entirely in the guards.

**Note the existing test being replaced.** `NoteEditorPage.test.tsx` currently has a test named `'does not overwrite fields the user already filled in'` that asserts the behaviour we are deliberately removing. It must be deleted, not left alongside the new test — otherwise the suite will contradict itself and fail.

- [ ] **Step 1: Replace the outdated test with the failing re-pick test**

In `src/pages/NoteEditorPage.test.tsx`, delete this entire test:

```tsx
  it('does not overwrite fields the user already filled in', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Meaning'), 'my own gloss');
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(await screen.findByRole('button', { name: /好人/ }));

    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén'));
    expect(screen.getByLabelText('Meaning')).toHaveValue('my own gloss');
  });
```

and put these two tests in its place:

```tsx
  it('replaces pinyin and meaning when a different suggestion is picked', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Hanzi'), '好');

    await user.click(await screen.findByRole('button', { name: /好人/ }));
    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén'));

    await user.click(await screen.findByRole('button', { name: /good; well/ }));

    await waitFor(() => expect(screen.getByLabelText('Hanzi')).toHaveValue('好'));
    expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo');
    expect(screen.getByLabelText('Meaning')).toHaveValue('good; well');
  });

  it('overwrites values the user typed by hand', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Meaning'), 'my own gloss');
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(await screen.findByRole('button', { name: /好人/ }));

    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén'));
    expect(screen.getByLabelText('Meaning')).toHaveValue('good person');
  });
```

The `ENTRIES` fixture at the top of the file already supplies both entries this needs
(`好` → `hǎo` / `good; well`, and `好人` → `hǎo rén` / `good person`); do not change it.

The first test has to distinguish the two suggestion buttons. Each button's
accessible name is its hanzi, pinyin and meanings run together, so the two
matchers key off the parts that are unique and whitespace-independent: `/好人/`
only matches the two-character entry, and `/good; well/` only matches the
single-character one. Do not match on `/好/` alone — it is a substring of 好人.

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npm test -- src/pages/NoteEditorPage.test.tsx`

Expected: `replaces pinyin and meaning when a different suggestion is picked` FAILS, with Pinyin still `hǎo rén` instead of `hǎo` (the second pick changed only Hanzi). `overwrites values the user typed by hand` also FAILS, with Meaning still `my own gloss`.

Both must fail on an assertion, not on a missing element. A `findByRole` timeout means the matcher is wrong, not that the bug reproduced.

- [ ] **Step 3: Remove the blank-field guards**

In `src/pages/NoteEditorPage.tsx`, replace:

```tsx
  /** Fills only the fields the user has left blank, so manual edits survive. */
  function applySuggestion(entry: DictEntry) {
    setHanzi(entry.simplified);
    if (pinyin.trim() === '') setPinyin(entry.pinyin);
    if (meaning.trim() === '') setMeaning(entry.meanings.join('; '));
  }
```

with:

```tsx
  /**
   * Overwrites all three fields. Picking a second suggestion must visibly
   * correct a wrong first pick, which a fill-only-if-blank rule cannot do.
   */
  function applySuggestion(entry: DictEntry) {
    setHanzi(entry.simplified);
    setPinyin(entry.pinyin);
    setMeaning(entry.meanings.join('; '));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/pages/NoteEditorPage.test.tsx`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/NoteEditorPage.tsx src/pages/NoteEditorPage.test.tsx
git commit -m "fix(editor): let a second dictionary pick replace pinyin and meaning"
```

---

### Task 2: Leave the 汉字 prompt uncoloured until reveal

**Files:**
- Modify: `src/components/HanziText.tsx:9-24`
- Modify: `src/pages/StudyPage.tsx:14-24` and `:171`
- Test: `src/pages/StudyPage.test.tsx` (add one test)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `HanziText({ hanzi, pinyin, className = '', colour = true }): JSX.Element` — `colour?: boolean`, when `false` renders plain text regardless of the `colourHanzi` setting.
  - `FieldView({ field, item, large, colour = true })` — local to `StudyPage.tsx`, forwards `colour` to `HanziText` only.

**Context you need:**
- `HanziText` colours the *n*th character with the tone of the *n*th pinyin syllable, reading `settings.colourHanzi` and `settings.toneColours` from `useSettings()`. Each coloured character span carries a `data-tone` attribute — that is what the test asserts on, so no computed-style inspection is needed.
- `DEFAULT_SETTINGS.colourHanzi` is `true` and `useSettings` falls back to the defaults before IndexedDB resolves, so study tests get colouring on with no setup.
- Directions are literally `"<prompt>-<answer>"`. The four are `hanzi-meaning`, `hanzi-pinyin`, `meaning-pinyin`, `pinyin-meaning` — hanzi is never an *answer*, so only the prompt render needs the new prop.
- `StudyPage` already holds `revealed` state, and `StudyPage.tsx:185` renders hanzi in the answer area only when it is neither prompt nor answer (so it is only ever on screen post-reveal). Leave that call on the default.
- The test deck created in `beforeEach` uses `directions: ['hanzi-meaning']`, so a plain `createNote` gives you a 汉字-prompt card.

- [ ] **Step 1: Write the failing test**

Add this test to the `describe('StudyPage', ...)` block in `src/pages/StudyPage.test.tsx`, directly after the `'shows the prompt field and hides the answer'` test:

```tsx
  it('does not colour the hanzi prompt by tone until the answer is revealed', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    const prompt = await screen.findByTestId('prompt');
    expect(prompt.querySelector('[data-tone]')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));

    await waitFor(() =>
      expect(screen.getByTestId('prompt').querySelector('[data-tone]')).not.toBeNull(),
    );
  });
```

`waitFor` is already imported at the top of this file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/pages/StudyPage.test.tsx`
Expected: FAIL on the first assertion — `expected <span data-tone="3"> to be null` — because the prompt is coloured from the start today.

- [ ] **Step 3: Add the `colour` prop to `HanziText`**

Replace the component signature and early return in `src/components/HanziText.tsx`:

```tsx
/**
 * Renders hanzi, optionally colouring the nth character with the tone of the
 * nth pinyin syllable. When the counts disagree (rare: erhua, punctuation) the
 * extra characters are left uncoloured rather than mis-coloured.
 *
 * `colour={false}` suppresses colouring even when the setting is on, for the
 * prompt side of 汉字 → cards where the tone is what the learner must recall.
 */
export default function HanziText({
  hanzi,
  pinyin,
  className = '',
  colour = true,
}: {
  hanzi: string;
  pinyin: string;
  className?: string;
  colour?: boolean;
}) {
  const { settings } = useSettings();
  const syllables = parseAccentedPinyin(pinyin).filter((token) => token.tone !== null);
  const characters = [...hanzi];

  if (!colour || !settings.colourHanzi || syllables.length !== characters.length) {
    return <span className={className}>{hanzi}</span>;
  }
```

Leave the rest of the component unchanged.

- [ ] **Step 4: Forward the prop from `StudyPage`**

In `src/pages/StudyPage.tsx`, replace the `FieldView` component:

```tsx
function FieldView({
  field,
  item,
  large,
  colour = true,
}: {
  field: NoteField;
  item: QueueItem;
  large: boolean;
  colour?: boolean;
}) {
  const { note } = item;
  const size = large ? 'text-5xl' : 'text-2xl';
  if (field === 'hanzi') {
    return (
      <HanziText
        hanzi={note.hanzi}
        pinyin={note.pinyin}
        colour={colour}
        className={`${size} leading-tight`}
      />
    );
  }
  if (field === 'pinyin') {
    return <PinyinText pinyin={note.pinyin} className={large ? 'text-4xl' : 'text-xl'} />;
  }
  return <span className={large ? 'text-3xl' : 'text-xl'}>{note.meaning}</span>;
}
```

Then, in the render, replace the prompt line:

```tsx
          <FieldView field={promptFor(item.card.direction)} item={item} large />
```

with:

```tsx
          <FieldView field={promptFor(item.card.direction)} item={item} large colour={revealed} />
```

Do not change the answer `FieldView` at `large={false}` or the `HanziText` in the answer's extra-fields block — both should keep the default `colour`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/pages/StudyPage.test.tsx`
Expected: PASS, all tests in the file.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. `HanziText` is also used by `BrowsePage`, and the new prop defaults to `true`, so `BrowsePage.test.tsx` must be unaffected. If it fails, the default was dropped somewhere — fix that rather than editing the Browse tests.

- [ ] **Step 7: Type-check**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/HanziText.tsx src/pages/StudyPage.tsx src/pages/StudyPage.test.tsx
git commit -m "fix(study): keep the hanzi prompt uncoloured until the answer is revealed"
```

---

### Task 3: Verify the whole change end to end

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the finished state of Tasks 1 and 2.
- Produces: nothing.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS, no skipped tests.

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: exits 0, Vite writes `dist/`.

- [ ] **Step 3: Run the end-to-end smoke test**

Run: `npm run test:e2e`
Expected: PASS. If Playwright browsers are missing, run `npx playwright install chromium` first. If e2e cannot run in this environment, say so explicitly rather than reporting it as passing.

- [ ] **Step 4: Confirm the behaviour by hand**

Run `npm run dev`, then:
1. In a deck, add a word: type `好`, click the `好人` suggestion, then click the `好` suggestion. Pinyin and Meaning must both change to `hǎo` / `good; well`.
2. Check Settings has "Colour hanzi by tone" on, then study a deck with a 汉字 → Meaning card. The prompt characters must be plain, and must become tone-coloured after "Show answer".
3. Open Browse. Hanzi there must still be tone-coloured.
