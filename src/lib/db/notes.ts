import { db } from '@/lib/db/db';
import { buildCard } from '@/lib/db/cards';
import type { Direction, Note } from '@/lib/db/types';

export interface CreateNoteInput {
  deckId: number;
  hanzi: string;
  pinyin: string;
  meaning: string;
  notes?: string;
  tags?: string[];
}

export function getNote(id: number): Promise<Note | undefined> {
  return db.notes.get(id);
}

export async function createNote(input: CreateNoteInput): Promise<number> {
  const hanzi = input.hanzi.trim();
  const meaning = input.meaning.trim();
  if (hanzi === '') throw new Error('Hanzi is required');
  if (meaning === '') throw new Error('Meaning is required');

  return db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    const deck = await db.decks.get(input.deckId);
    if (!deck) throw new Error(`Deck ${input.deckId} does not exist`);

    const duplicate = await db.notes.where({ deckId: input.deckId, hanzi }).first();
    if (duplicate) throw new Error(`"${hanzi}" is already in this deck`);

    const now = Date.now();
    const noteId = await db.notes.add({
      deckId: input.deckId,
      hanzi,
      pinyin: input.pinyin.trim(),
      meaning,
      notes: input.notes?.trim() ?? '',
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    });
    await db.cards.bulkAdd(
      deck.directions.map((direction) => buildCard(noteId, input.deckId, direction, now)),
    );
    return noteId;
  });
}

export async function updateNote(
  id: number,
  patch: Partial<Omit<Note, 'id' | 'deckId' | 'createdAt'>>,
): Promise<void> {
  if (patch.hanzi !== undefined && patch.hanzi.trim() === '') throw new Error('Hanzi is required');
  if (patch.meaning !== undefined && patch.meaning.trim() === '') {
    throw new Error('Meaning is required');
  }
  await db.notes.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteNote(id: number): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, db.reviews, async () => {
    const cards = await db.cards.where('noteId').equals(id).toArray();
    const cardIds = cards.map((card) => card.id!);
    if (cardIds.length > 0) {
      await db.reviews.where('cardId').anyOf(cardIds).delete();
    }
    await db.cards.where('noteId').equals(id).delete();
    await db.notes.delete(id);
  });
}

/** Adds cards for newly enabled directions and removes cards for disabled ones. */
export async function syncCardsForNote(noteId: number): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    const note = await db.notes.get(noteId);
    if (!note) return;
    const deck = await db.decks.get(note.deckId);
    if (!deck) return;
    await reconcile(noteId, note.deckId, deck.directions);
  });
}

export async function syncCardsForDeck(deckId: number): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    const deck = await db.decks.get(deckId);
    if (!deck) return;
    const notes = await db.notes.where('deckId').equals(deckId).toArray();
    for (const note of notes) {
      await reconcile(note.id!, deckId, deck.directions);
    }
  });
}

async function reconcile(
  noteId: number,
  deckId: number,
  directions: Direction[],
): Promise<void> {
  const existing = await db.cards.where('noteId').equals(noteId).toArray();
  const wanted = new Set(directions);

  const stale = existing.filter((card) => !wanted.has(card.direction));
  if (stale.length > 0) {
    const ids = stale.map((card) => card.id!);
    await db.reviews.where('cardId').anyOf(ids).delete();
    await db.cards.bulkDelete(ids);
  }

  const present = new Set(existing.map((card) => card.direction));
  const missing = directions.filter((direction) => !present.has(direction));
  if (missing.length > 0) {
    const now = Date.now();
    await db.cards.bulkAdd(missing.map((d) => buildCard(noteId, deckId, d, now)));
  }
}
