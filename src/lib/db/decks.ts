import { db } from '@/lib/db/db';
import { DEFAULT_DECK_CONFIG } from '@/lib/fsrs';
import type { Deck } from '@/lib/db/types';

export interface CreateDeckInput {
  name: string;
  description?: string;
  directions?: Deck['directions'];
  config?: Deck['config'];
}

export async function createDeck(input: CreateDeckInput): Promise<number> {
  const name = input.name.trim();
  if (name === '') throw new Error('Deck name is required');
  return db.decks.add({
    name,
    description: input.description?.trim() ?? '',
    directions: input.directions ?? ['hanzi-meaning', 'hanzi-pinyin'],
    config: input.config ?? DEFAULT_DECK_CONFIG,
    createdAt: Date.now(),
  });
}

export function getDeck(id: number): Promise<Deck | undefined> {
  return db.decks.get(id);
}

export function listDecks(): Promise<Deck[]> {
  return db.decks.orderBy('createdAt').toArray();
}

export async function updateDeck(id: number, patch: Partial<Omit<Deck, 'id'>>): Promise<void> {
  if (patch.name !== undefined && patch.name.trim() === '') {
    throw new Error('Deck name is required');
  }
  await db.decks.update(id, patch);
  if (patch.directions !== undefined) {
    const { syncCardsForDeck } = await import('@/lib/db/notes');
    await syncCardsForDeck(id);
  }
}

/** Deletes the deck and everything that belongs to it, atomically. */
export async function deleteDeck(id: number): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    await db.reviews.where('deckId').equals(id).delete();
    await db.cards.where('deckId').equals(id).delete();
    await db.notes.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}
