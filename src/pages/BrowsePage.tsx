import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { resetCard, setCardSuspended } from '@/lib/db';
import { DIRECTION_LABELS } from '@/lib/db';
import { formatInterval } from '@/lib/time';
import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import HanziText from '@/components/HanziText';
import PageHeader from '@/components/PageHeader';
import PinyinText from '@/components/PinyinText';
import { inputClass } from '@/components/Field';
import type { Note } from '@/lib/db';

function CardRows({ note }: { note: Note }) {
  const cards = useLiveQuery(() => db.cards.where('noteId').equals(note.id!).toArray(), [note.id], []);
  return (
    <ul className="space-y-1 bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">
      {cards.map((card) => (
        <li key={card.id} className="flex items-center gap-2">
          <span className="flex-1">{DIRECTION_LABELS[card.direction]}</span>
          <span className="text-xs text-slate-500">
            {card.state === 'new' ? 'new' : `${card.state} · ${formatInterval(card.scheduledDays)}`}
          </span>
          <Button
            variant="ghost"
            className="px-2 text-xs"
            aria-label={`${card.suspended ? 'Unsuspend' : 'Suspend'} ${DIRECTION_LABELS[card.direction]}`}
            onClick={() => setCardSuspended(card.id!, card.suspended === 0)}
          >
            {card.suspended ? 'Unsuspend' : 'Suspend'}
          </Button>
          <Button
            variant="ghost"
            className="px-2 text-xs"
            aria-label={`Reset ${DIRECTION_LABELS[card.direction]}`}
            onClick={() => {
              if (
                !window.confirm(
                  `Reset "${note.hanzi}" (${DIRECTION_LABELS[card.direction]})? This discards its progress.`,
                )
              ) {
                return;
              }
              void resetCard(card.id!);
            }}
          >
            Reset
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function BrowsePage() {
  const { deckId: param } = useParams();
  const deckId = Number(param);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const notes = useLiveQuery(
    () => db.notes.where('deckId').equals(deckId).sortBy('createdAt'),
    [deckId],
    [],
  );

  const needle = query.trim().toLowerCase();
  const matches =
    needle === ''
      ? notes
      : notes.filter((note) =>
          `${note.hanzi} ${note.pinyin} ${note.meaning}`.toLowerCase().includes(needle),
        );

  return (
    <>
      <PageHeader title="Browse" backTo={`/deck/${deckId}`} />
      <div className="p-3">
        <input
          type="search"
          className={inputClass}
          placeholder="Search hanzi, pinyin or meaning"
          aria-label="Search words"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="mt-2 text-xs text-slate-500">
          {matches.length} word{matches.length === 1 ? '' : 's'}
        </p>
      </div>

      {matches.length === 0 ? (
        <EmptyState
          title={notes.length === 0 ? 'No words yet' : 'No matching words'}
          action={
            notes.length === 0 ? (
              <Button onClick={() => navigate(`/deck/${deckId}/note/new`)}>Add word</Button>
            ) : undefined
          }
        />
      ) : (
        <ul>
          {matches.map((note) => (
            <li key={note.id} className="border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={`Edit ${note.hanzi}, ${note.pinyin}, ${note.meaning}`}
                  onClick={() => navigate(`/note/${note.id}`)}
                  className="flex flex-1 items-baseline gap-3 px-4 py-3 text-left"
                >
                  <HanziText hanzi={note.hanzi} pinyin={note.pinyin} className="text-xl" />
                  <PinyinText pinyin={note.pinyin} className="text-sm" />
                  <span className="flex-1 truncate text-sm text-slate-500">{note.meaning}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Cards for ${note.hanzi}`}
                  onClick={() => setExpanded(expanded === note.id ? null : note.id!)}
                  className="min-h-11 min-w-11 text-slate-400"
                >
                  {expanded === note.id ? '▾' : '▸'}
                </button>
              </div>
              {expanded === note.id && <CardRows note={note} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
