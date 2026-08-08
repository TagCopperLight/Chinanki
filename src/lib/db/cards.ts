import { db } from '@/lib/db/db';
import { newSchedulingState } from '@/lib/fsrs';
import type { Card, Direction } from '@/lib/db/types';

export function listCardsForNote(noteId: number): Promise<Card[]> {
  return db.cards.where('noteId').equals(noteId).toArray();
}

export function listCardsForDeck(deckId: number): Promise<Card[]> {
  return db.cards.where('deckId').equals(deckId).toArray();
}

export function buildCard(noteId: number, deckId: number, direction: Direction, now: number): Card {
  return { noteId, deckId, direction, suspended: 0, ...newSchedulingState(now) };
}

export async function setCardSuspended(cardId: number, suspended: boolean): Promise<void> {
  await db.cards.update(cardId, { suspended: suspended ? 1 : 0 });
}

/** Forgets the scheduling state. The review log is deliberately kept for statistics. */
export async function resetCard(cardId: number): Promise<void> {
  await db.cards.update(cardId, newSchedulingState(Date.now()));
}
