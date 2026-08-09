# Dictionary re-pick and 汉字 prompt tone colour

Two independent fixes to the note editor and the study screen.

## Problem

**Re-picking a dictionary suggestion does nothing.** `applySuggestion` in
`src/pages/NoteEditorPage.tsx` fills Pinyin and Meaning only when those fields
are blank. Picking the wrong entry fills them, so a second pick changes only the
Hanzi and leaves the wrong pinyin and meaning in place. Recovering means
clearing both fields by hand.

**The 汉字 prompt gives away its tones.** `HanziText` colours each character by
the tone of the corresponding pinyin syllable whenever the "Colour hanzi by
tone" setting is on. On 汉字 → Meaning and 汉字 → Pinyin cards this applies to
the prompt, so the tone is visible before the learner has recalled it.

## Fix 1: picks always overwrite

`applySuggestion` sets Hanzi, Pinyin and Meaning unconditionally. The blank
checks and the comment describing the preserve-manual-edits behaviour are
removed, since that behaviour is what we are dropping.

Consequence, accepted deliberately: text typed by hand before picking a
suggestion is replaced. Predictable overwriting was preferred over tracking
which values came from a suggestion and which were typed.

`DictionarySuggestions` already invokes `onPick` on every click and needs no
change.

## Fix 2: suppress prompt colouring until reveal

`HanziText` gains a `colour` prop defaulting to `true`, folded into the existing
early return:

```
if (!colour || !settings.colourHanzi || syllables.length !== characters.length)
```

`FieldView` in `src/pages/StudyPage.tsx` takes a matching prop and forwards it on
its `field === 'hanzi'` branch only; `PinyinText` and the meaning span are
unaffected. `StudyPage` passes `colour={revealed}` on the prompt render and
leaves the answer-area render at `StudyPage.tsx:185` on the default.

The reveal rule therefore lives at the call site that owns reveal state, and
`HanziText` stays a presentational component usable outside a study session.
`BrowsePage` is untouched.

Two alternatives were rejected. A React context carrying reveal state would
remove the prop forwarding but hide non-obvious behaviour inside a leaf
component and couple it to the study screen. A second user setting would add a
preference nobody asked for and double the states to test.

### Resulting behaviour

| Direction | Prompt before reveal | Prompt after reveal |
| --- | --- | --- |
| 汉字 → Meaning | plain | tone-coloured |
| 汉字 → Pinyin | plain | tone-coloured |
| Meaning → Pinyin | unchanged (not hanzi) | unchanged |
| Pinyin → Meaning | unchanged (not hanzi) | unchanged |

The existing global setting is unchanged and still governs Browse and the answer
area. With it off, everything renders plain as before. The existing fallback for
a syllable/character count mismatch also still applies.

## Testing

`NoteEditorPage.test.tsx`: picking one suggestion and then another leaves Hanzi,
Pinyin and Meaning all matching the second entry.

`StudyPage.test.tsx`: on a `hanzi-meaning` card the prompt's character spans
carry no `data-tone` attribute before reveal and carry it after. `HanziText`
already emits `data-tone` per character, so this is assertable without
inspecting computed styles.
