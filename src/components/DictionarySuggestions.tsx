import { useEffect, useState } from 'react';
import { glossesFor, lookupPrefix } from '@/lib/dictionary';
import type { DictEntry, GlossLanguage } from '@/lib/dictionary';
import { useSettings } from '@/hooks/useSettings';
import PinyinText from '@/components/PinyinText';

/** Debounced prefix search. Renders nothing until there is something to show. */
const LANGUAGE_NAMES: Record<GlossLanguage, string> = { en: 'English', fr: 'French' };

export default function DictionarySuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (entry: DictEntry, meaning: string) => void;
}) {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<DictEntry[]>([]);

  useEffect(() => {
    if (query.trim() === '') {
      setEntries([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await lookupPrefix(query, 8);
      if (!cancelled) setEntries(results);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (entries.length === 0) return null;

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
      {entries.map((entry) => {
        const gloss = glossesFor(entry, settings.suggestionLanguage);
        const meaning = gloss.meanings.join('; ');
        return (
          // `simplified|pinyin` is better than `simplified` alone but still not
          // guaranteed unique: CC-CEDICT can carry multiple traditional forms
          // for the same simplified/pinyin pair (e.g. 檯/臺/颱 all map to
          // simplified 台, pinyin tái), and those collapse to one key here.
          <li key={`${entry.simplified}|${entry.pinyin}`}>
            <button
              type="button"
              onClick={() => onPick(entry, meaning)}
              className="flex w-full min-h-11 items-baseline gap-2 px-3 py-2 text-left"
            >
              <span className="text-lg">{entry.simplified}</span>
              <PinyinText pinyin={entry.pinyin} className="text-sm" />
              <span className="flex-1 truncate text-sm text-slate-500">{meaning}</span>
              {gloss.language !== settings.suggestionLanguage && (
                <span
                  className="rounded bg-slate-100 px-1 text-xs uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  aria-label={`shown in ${LANGUAGE_NAMES[gloss.language]}`}
                  title={`shown in ${LANGUAGE_NAMES[gloss.language]}`}
                >
                  {gloss.language}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
