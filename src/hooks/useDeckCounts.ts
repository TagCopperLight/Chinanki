import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { deckCounts, type DeckCounts } from '@/lib/study';

const ZERO: DeckCounts = { new: 0, learning: 0, review: 0 };

/** Live due counts. Re-runs whenever any card changes. */
export function useDeckCounts(deckId: number | undefined): DeckCounts {
  return (
    useLiveQuery(async () => {
      if (deckId === undefined) return ZERO;
      // Touch the table so Dexie subscribes to card mutations.
      await db.cards.where('deckId').equals(deckId).count();
      return deckCounts(deckId, Date.now());
    }, [deckId]) ?? ZERO
  );
}
