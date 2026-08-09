import { useEffect, useState } from 'react';
import { lookupPrefix } from '@/lib/dictionary';
import type { DictEntry } from '@/lib/dictionary';
import PinyinText from '@/components/PinyinText';

/** Debounced prefix search. Renders nothing until there is something to show. */
export default function DictionarySuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (entry: DictEntry) => void;
}) {
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
      {entries.map((entry) => (
        <li key={entry.simplified}>
          <button
            type="button"
            onClick={() => onPick(entry)}
            className="flex w-full min-h-11 items-baseline gap-2 px-3 py-2 text-left"
          >
            <span className="text-lg">{entry.simplified}</span>
            <PinyinText pinyin={entry.pinyin} className="text-sm" />
            <span className="flex-1 truncate text-sm text-slate-500">
              {(entry.meanings.en ?? []).join('; ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
