import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDeck } from '@/lib/db/decks';
import { db } from '@/lib/db/db';
import { useDeckCounts } from '@/hooks/useDeckCounts';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';

function Stat({ id, label, value, className }: { id: string; label: string; value: number; className: string }) {
  return (
    <div className="flex-1 text-center">
      <p data-testid={id} className={`text-2xl font-bold ${className}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function DeckPage() {
  const { deckId: param } = useParams();
  const deckId = Number(param);
  const navigate = useNavigate();
  const deck = useLiveQuery(() => getDeck(deckId), [deckId]);
  const noteCount = useLiveQuery(() => db.notes.where('deckId').equals(deckId).count(), [deckId], 0);
  const counts = useDeckCounts(deckId);
  const due = counts.new + counts.learning + counts.review;

  if (!deck) return <PageHeader title="Deck" backTo="/" />;

  return (
    <>
      <PageHeader
        title={deck.name}
        backTo="/"
        action={
          <Link
            to={`/deck/${deckId}/settings`}
            className="flex min-h-11 min-w-11 items-center justify-center px-2 py-2 text-xl"
            aria-label="Deck settings"
          >
            ⚙️
          </Link>
        }
      />

      <div className="flex gap-2 p-4">
        <Stat id="count-new" label="New" value={counts.new} className="text-sky-600" />
        <Stat id="count-learning" label="Learning" value={counts.learning} className="text-red-500" />
        <Stat id="count-review" label="Review" value={counts.review} className="text-green-600" />
      </div>

      <div className="space-y-2 px-4">
        <Button
          className="w-full"
          disabled={due === 0}
          onClick={() => navigate(`/deck/${deckId}/study`)}
        >
          Study {due > 0 ? `(${due})` : ''}
        </Button>
        {due === 0 && (
          <p className="text-center text-sm text-slate-500">Nothing due right now. Well done.</p>
        )}
        <Button variant="secondary" className="w-full" onClick={() => navigate(`/deck/${deckId}/note/new`)}>
          Add word
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => navigate(`/deck/${deckId}/browse`)}>
          Browse ({noteCount})
        </Button>
      </div>
    </>
  );
}
