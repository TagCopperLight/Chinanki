import { db } from '@/lib/db/db';
import type { Card, Note } from '@/lib/db/types';

export interface QueueItem {
  card: Card;
  note: Note;
}

export interface DeckCounts {
  new: number;
  learning: number;
  review: number;
}

function isDueLearning(card: Card, now: number): boolean {
  return (card.state === 'learning' || card.state === 'relearning') && card.due <= now;
}

function isDueReview(card: Card, now: number): boolean {
  return card.state === 'review' && card.due <= now;
}

/**
 * Every card the user can study right now, ordered: overdue (re)learning steps
 * first so they do not drift, then reviews most-overdue first, then new cards.
 * There is no daily cap by design.
 */
export async function buildQueue(deckId: number, now: number): Promise<QueueItem[]> {
  const cards = (await db.cards.where('deckId').equals(deckId).toArray()).filter(
    (card) => card.suspended === 0,
  );

  const learning = cards.filter((card) => isDueLearning(card, now)).sort((a, b) => a.due - b.due);
  const review = cards.filter((card) => isDueReview(card, now)).sort((a, b) => a.due - b.due);
  const fresh = cards.filter((card) => card.state === 'new').sort((a, b) => a.id! - b.id!);

  const ordered = [...learning, ...review, ...fresh];
  if (ordered.length === 0) return [];

  const notes = await db.notes.bulkGet([...new Set(ordered.map((card) => card.noteId))]);
  const byId = new Map(notes.filter((note): note is Note => note !== undefined).map((n) => [n.id!, n]));

  return ordered.flatMap((card) => {
    const note = byId.get(card.noteId);
    return note ? [{ card, note }] : [];
  });
}

export async function deckCounts(deckId: number, now: number): Promise<DeckCounts> {
  const cards = (await db.cards.where('deckId').equals(deckId).toArray()).filter(
    (card) => card.suspended === 0,
  );
  return {
    new: cards.filter((card) => card.state === 'new').length,
    learning: cards.filter((card) => isDueLearning(card, now)).length,
    review: cards.filter((card) => isDueReview(card, now)).length,
  };
}
