# French dictionary suggestions

## Goal

The note editor's auto-fill suggestions come from CC-CEDICT and are always
English. Add a setting that makes them French, so a French-speaking learner
fills the meaning field in their own language.

Scope is the suggestion list only. The app's own interface stays English;
interface translation is a separate, larger project and is not part of this
work.

## Source data

CFDICT (Chine Informations, <https://chine.in/mandarin/dictionnaire/CFDICT/>),
licensed CC BY-SA 3.0, distributed as a zip containing `cfdict.u8`. It uses the
CC-CEDICT line format exactly, so `parseCedictLine` reads it unchanged.

Measured against the current shards (CC-CEDICT, 124,790 entries):

| Fact | Value |
| --- | --- |
| CFDICT entries | 56,299 |
| CC-CEDICT headwords with a French entry | 38.7% |
| CFDICT headwords also in CC-CEDICT | 84.9% |
| Of those, matching on `simplified` + accent-stripped pinyin | 98.6% |
| CFDICT entries with no CC-CEDICT counterpart | ~7,500 |

Two consequences drive the design. French coverage is a minority of the
dictionary, so falling back to English is the common path, not an edge case.
And a meaningful number of entries exist only in French, so they must survive
the merge rather than being dropped.

## Decisions

- **Fallback, not blanks.** When the selected language has no gloss for an
  entry, show the other language, marked. Never render an empty suggestion.
- **One global setting**, not per-deck and not per-lookup. The language is a
  fact about the user.
- **Merged shards**, not parallel or overlay shard sets. Because fallback means
  both languages are needed at the same moment, merging makes that a local
  lookup instead of a second network request.
- **CFDICT is required at build time.** A missing or truncated download must
  fail the build, not ship a dictionary that quietly has no French in it.

## Data model

`DictEntry.meanings` changes from `string[]` to:

```ts
meanings: { en?: string[]; fr?: string[] }
```

At least one side is non-empty. Each side stays capped at 6 glosses, as today.

## Merge

New pure module `src/lib/dictionary/merge.ts`:

```ts
export function mergeDictionaries(en: DictEntry[], fr: DictEntry[]): DictEntry[]
```

- Key: `simplified` + normalised pinyin, where normalisation lowercases, strips
  whitespace, strips combining accents, and maps `u:` to `v`. Both sides are
  parsed by `parseCedictLine` first, so both keys are derived identically.
- CFDICT entries whose key matches attach their glosses as `fr` on every
  matching English entry.
- CFDICT entries whose key does not match are emitted as French-only entries.
- Multiple CFDICT entries sharing one key union their glosses, then re-cap at 6.
- Output ordering and shape are otherwise what the sharder already expects.

`scripts/build-dictionary.ts` becomes a thin I/O wrapper: read both files, parse
both, call `mergeDictionaries`, shard as before. Its usage becomes
`npm run build:dict -- <cedict.u8> <cfdict.u8>`, in that order, and it exits
non-zero when either argument is missing.

It also fails when the merged output carries fewer than 10,000 French glosses.
Without that floor, a redirected or truncated CFDICT download yields a valid
English-only dictionary and ships a feature that silently does nothing.

## Build and deploy

`Dockerfile` gains a `CFDICT_URL` build arg in the same early cached layer as
`CEDICT_URL`, following its existing conventions: `curl -fsSL`, the `${VAR%%#*}`
cache-busting suffix strip, and a `test -s` guard on the result. `unzip` joins
`curl` in the `apk add` line, since CFDICT ships as a zip rather than gzip.

## Runtime

`AppSettings` gains:

```ts
/** Language of the dictionary suggestions shown in the note editor. */
suggestionLanguage: 'en' | 'fr'
```

defaulting to `'en'`. `getSettings` already spreads `DEFAULT_SETTINGS` over the
stored row, so existing rows and imported pre-change backups pick the default up
with no migration.

`lookup.ts` stays language-agnostic and returns entries carrying both gloss
lists. A new pure function resolves the display rule:

```ts
export function glossesFor(
  entry: DictEntry,
  language: 'en' | 'fr',
): { meanings: string[]; language: 'en' | 'fr' }
```

It returns the requested language when present, otherwise the other one, and
reports which it returned. The rule is symmetric: in English mode a French-only
entry resolves to French. Keeping it pure and separate makes the fallback
testable without a fetch, a component, or a database.

## UI

`DictionarySuggestions` reads `suggestionLanguage` and renders the resolved
glosses. When the resolved language differs from the setting, the row shows a
small muted badge naming the language actually shown (`EN` or `FR`). No badge
when they match — a badge on every row would be noise, and given 39% coverage
the badge is a genuinely useful signal about which words CFDICT lacks.

`onPick` passes the resolved meaning string alongside the entry.
`NoteEditorPage` writes that into `meaning` and stays language-unaware, keeping
its current behaviour of overwriting all three fields on a pick. Resolving in
one place avoids the display and the write disagreeing.

The Settings page gains an English / Français control in the existing
preferences block, and the credits section gains CFDICT attribution under
CC BY-SA 3.0 next to the CC-CEDICT line.

Sorting, shard loading, the runtime cache and the service worker rule are
unchanged.

## Testing

- `mergeDictionaries`: matched pair carries both languages; the same headword
  with a different reading stays a separate entry rather than merging a wrong
  pinyin; a French-only entry survives; duplicate CFDICT entries for one key
  union and re-cap at 6.
- `parseCedictLine`: a CFDICT line with accented French and `u:` pinyin.
- `glossesFor`: all four combinations of setting and available languages,
  asserting both the glosses and the reported language.
- `DictionarySuggestions`: French glosses render under the French setting; a
  fallback row shows its badge; a matching row shows none.
- `SettingsPage`: choosing a language persists it.
- E2E is unchanged — the flows it covers do not depend on gloss language.

## Docs

README's dictionary section gains the CFDICT download for local development.
The deploy section documents `CFDICT_URL` next to `CEDICT_URL` and notes that
refreshing the dictionary now means refreshing both.

## Out of scope

- Translating the app interface.
- Per-deck or per-lookup language choice.
- Changing existing notes. `meaning` is free text; saved English notes stay as
  they are.
