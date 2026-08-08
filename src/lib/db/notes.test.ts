import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { createDeck, updateDeck } from '@/lib/db/decks';
import { createNote, deleteNote, getNote, syncCardsForDeck, updateNote } from '@/lib/db/notes';
import { listCardsForNote, resetCard, setCardSuspended } from '@/lib/db/cards';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning', 'hanzi-pinyin'] });
});

const HAO = { hanzi: '好', pinyin: 'hǎo', meaning: 'good' };

describe('createNote', () => {
  it('creates one new card per enabled direction', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const cards = await listCardsForNote(noteId);
    expect(cards.map((c) => c.direction).sort()).toEqual(['hanzi-meaning', 'hanzi-pinyin']);
    expect(cards.every((c) => c.state === 'new')).toBe(true);
    expect(cards.every((c) => c.deckId === deckId)).toBe(true);
    expect(cards.every((c) => c.suspended === 0)).toBe(true);
  });

  it('trims fields and sets timestamps', async () => {
    const noteId = await createNote({ deckId, hanzi: ' 好 ', pinyin: ' hǎo ', meaning: ' good ' });
    const note = await getNote(noteId);
    expect(note?.hanzi).toBe('好');
    expect(note?.pinyin).toBe('hǎo');
    expect(note?.meaning).toBe('good');
    expect(note?.createdAt).toBe(note?.updatedAt);
  });

  it('requires hanzi and meaning', async () => {
    await expect(createNote({ deckId, hanzi: '', pinyin: 'hǎo', meaning: 'good' })).rejects.toThrow(
      'Hanzi is required',
    );
    await expect(createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: '' })).rejects.toThrow(
      'Meaning is required',
    );
  });

  it('rejects a duplicate hanzi within the same deck', async () => {
    await createNote({ deckId, ...HAO });
    await expect(createNote({ deckId, ...HAO })).rejects.toThrow('already in this deck');
  });

  it('allows the same hanzi in a different deck', async () => {
    const other = await createDeck({ name: 'Other' });
    await createNote({ deckId, ...HAO });
    await expect(createNote({ deckId: other, ...HAO })).resolves.toBeGreaterThan(0);
  });
});

describe('updateNote', () => {
  it('bumps updatedAt without touching cards', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const before = await listCardsForNote(noteId);
    await updateNote(noteId, { meaning: 'good; fine' });
    const note = await getNote(noteId);
    expect(note?.meaning).toBe('good; fine');
    expect(note?.updatedAt).toBeGreaterThanOrEqual(note!.createdAt);
    expect(await listCardsForNote(noteId)).toHaveLength(before.length);
  });
});

describe('deleteNote', () => {
  it('removes the note, its cards and its reviews', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const cards = await listCardsForNote(noteId);
    await db.reviews.add({
      cardId: cards[0]!.id!, noteId, deckId, direction: 'hanzi-meaning', rating: 3,
      stateBefore: 'new', stateAfter: 'learning', reviewedAt: 1, elapsedDays: 0,
      scheduledDays: 0, stabilityAfter: 1, difficultyAfter: 5, durationMs: 10,
    });
    await deleteNote(noteId);
    expect(await getNote(noteId)).toBeUndefined();
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });
});

describe('syncCardsForDeck', () => {
  it('creates cards when a direction is enabled', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    await updateDeck(deckId, {
      directions: ['hanzi-meaning', 'hanzi-pinyin', 'pinyin-meaning'],
    });
    await syncCardsForDeck(deckId);
    expect(await listCardsForNote(noteId)).toHaveLength(3);
  });

  it('deletes cards and their reviews when a direction is disabled', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const cards = await listCardsForNote(noteId);
    const pinyinCard = cards.find((c) => c.direction === 'hanzi-pinyin')!;
    await db.reviews.add({
      cardId: pinyinCard.id!, noteId, deckId, direction: 'hanzi-pinyin', rating: 3,
      stateBefore: 'new', stateAfter: 'learning', reviewedAt: 1, elapsedDays: 0,
      scheduledDays: 0, stabilityAfter: 1, difficultyAfter: 5, durationMs: 10,
    });

    await updateDeck(deckId, { directions: ['hanzi-meaning'] });
    await syncCardsForDeck(deckId);

    expect(await listCardsForNote(noteId)).toHaveLength(1);
    expect(await db.reviews.count()).toBe(0);
  });

  it('preserves the scheduling state of cards that stay enabled', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const card = (await listCardsForNote(noteId)).find((c) => c.direction === 'hanzi-meaning')!;
    await db.cards.update(card.id!, { state: 'review', stability: 12, due: 999 });

    await updateDeck(deckId, { directions: ['hanzi-meaning', 'hanzi-pinyin', 'meaning-pinyin'] });
    await syncCardsForDeck(deckId);

    const after = (await listCardsForNote(noteId)).find((c) => c.direction === 'hanzi-meaning')!;
    expect(after.state).toBe('review');
    expect(after.stability).toBe(12);
    expect(after.due).toBe(999);
  });

  it('is idempotent', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    await syncCardsForDeck(deckId);
    await syncCardsForDeck(deckId);
    expect(await listCardsForNote(noteId)).toHaveLength(2);
  });
});

describe('setCardSuspended / resetCard', () => {
  it('toggles suspension', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const card = (await listCardsForNote(noteId))[0]!;
    await setCardSuspended(card.id!, true);
    expect((await db.cards.get(card.id!))?.suspended).toBe(1);
    await setCardSuspended(card.id!, false);
    expect((await db.cards.get(card.id!))?.suspended).toBe(0);
  });

  it('resets scheduling back to new but keeps the review history', async () => {
    const noteId = await createNote({ deckId, ...HAO });
    const card = (await listCardsForNote(noteId))[0]!;
    await db.cards.update(card.id!, { state: 'review', stability: 40, reps: 9, lapses: 2 });
    await db.reviews.add({
      cardId: card.id!, noteId, deckId, direction: card.direction, rating: 3,
      stateBefore: 'review', stateAfter: 'review', reviewedAt: 1, elapsedDays: 5,
      scheduledDays: 10, stabilityAfter: 40, difficultyAfter: 5, durationMs: 10,
    });

    await resetCard(card.id!);

    const after = await db.cards.get(card.id!);
    expect(after?.state).toBe('new');
    expect(after?.stability).toBe(0);
    expect(after?.reps).toBe(0);
    expect(after?.lapses).toBe(0);
    expect(await db.reviews.count()).toBe(1);
  });
});
