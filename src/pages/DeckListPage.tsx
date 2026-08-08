import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createDeck, listDecks } from '@/lib/db/decks';
import { useDeckCounts } from '@/hooks/useDeckCounts';
import Button from '@/components/Button';
import EmptyState from '@/components/EmptyState';
import Field, { inputClass } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import type { Deck } from '@/lib/db/types';

function DeckRow({ deck }: { deck: Deck }) {
  const counts = useDeckCounts(deck.id);
  return (
    <Link
      to={`/deck/${deck.id}`}
      className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"
    >
      <span className="flex-1 truncate font-medium">{deck.name}</span>
      <span data-testid={`new-count-${deck.id}`} className="w-8 text-right text-sky-600">
        {counts.new}
      </span>
      <span data-testid={`learning-count-${deck.id}`} className="w-8 text-right text-red-500">
        {counts.learning}
      </span>
      <span data-testid={`review-count-${deck.id}`} className="w-8 text-right text-green-600">
        {counts.review}
      </span>
    </Link>
  );
}

export default function DeckListPage() {
  const decks = useLiveQuery(() => listDecks(), [], []);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    try {
      await createDeck({ name });
      setName('');
      setError('');
      setIsCreating(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the deck');
    }
  }

  return (
    <>
      <PageHeader
        title="Decks"
        action={
          (decks.length > 0 || isCreating) && (
            <Button variant="ghost" onClick={() => setIsCreating(true)}>
              New deck
            </Button>
          )
        }
      />

      {isCreating && (
        <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <Field label="Deck name">
            <input
              className={inputClass}
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit}>Create</Button>
            <Button variant="secondary" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {decks.length === 0 && !isCreating ? (
        <EmptyState
          title="No decks yet"
          description="Create a deck to start adding vocabulary."
          action={<Button onClick={() => setIsCreating(true)}>New deck</Button>}
        />
      ) : (
        <ul>
          {decks.map((deck) => (
            <li key={deck.id}>
              <DeckRow deck={deck} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
