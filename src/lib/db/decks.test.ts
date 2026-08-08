import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DECK_CONFIG } from '@/lib/fsrs';
import { createDeck, deleteDeck, getDeck, listDecks, updateDeck } from '@/lib/db/decks';
import { db } from '@/lib/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('createDeck', () => {
  it('returns the new id and applies defaults', async () => {
    const id = await createDeck({ name: 'HSK 1' });
    const deck = await getDeck(id);
    expect(deck?.name).toBe('HSK 1');
    expect(deck?.description).toBe('');
    expect(deck?.directions).toEqual(['hanzi-meaning', 'hanzi-pinyin']);
    expect(deck?.config).toEqual(DEFAULT_DECK_CONFIG);
    expect(deck?.createdAt).toBeGreaterThan(0);
  });

  it('accepts explicit directions and config', async () => {
    const id = await createDeck({
      name: 'All four',
      directions: ['hanzi-meaning', 'hanzi-pinyin', 'meaning-pinyin', 'pinyin-meaning'],
      config: { ...DEFAULT_DECK_CONFIG, desiredRetention: 0.95 },
    });
    const deck = await getDeck(id);
    expect(deck?.directions).toHaveLength(4);
    expect(deck?.config.desiredRetention).toBe(0.95);
  });

  it('rejects a blank name', async () => {
    await expect(createDeck({ name: '   ' })).rejects.toThrow('Deck name is required');
  });
});

describe('listDecks', () => {
  it('returns decks in creation order', async () => {
    await createDeck({ name: 'First' });
    await createDeck({ name: 'Second' });
    expect((await listDecks()).map((d) => d.name)).toEqual(['First', 'Second']);
  });

  it('returns an empty array when there are none', async () => {
    expect(await listDecks()).toEqual([]);
  });
});

describe('updateDeck', () => {
  it('patches only the given fields', async () => {
    const id = await createDeck({ name: 'HSK 1' });
    await updateDeck(id, { description: 'Beginner words' });
    const deck = await getDeck(id);
    expect(deck?.name).toBe('HSK 1');
    expect(deck?.description).toBe('Beginner words');
  });
});

describe('deleteDeck', () => {
  it('removes the deck and all of its notes, cards and reviews', async () => {
    const deckId = await createDeck({ name: 'Temp' });
    const noteId = await db.notes.add({
      deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good', notes: '',
      tags: [], createdAt: 1, updatedAt: 1,
    });
    const cardId = await db.cards.add({
      noteId, deckId, direction: 'hanzi-meaning', suspended: 0, state: 'new',
      stability: 0, difficulty: 0, due: 0, lastReview: null, reps: 0, lapses: 0,
      learningStep: 0, scheduledDays: 0,
    });
    await db.reviews.add({
      cardId, noteId, deckId, direction: 'hanzi-meaning', rating: 3, stateBefore: 'new',
      stateAfter: 'learning', reviewedAt: 1, elapsedDays: 0, scheduledDays: 0,
      stabilityAfter: 1, difficultyAfter: 5, durationMs: 100,
    });

    await deleteDeck(deckId);

    expect(await getDeck(deckId)).toBeUndefined();
    expect(await db.notes.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it('leaves other decks untouched', async () => {
    const keep = await createDeck({ name: 'Keep' });
    const drop = await createDeck({ name: 'Drop' });
    await db.notes.add({
      deckId: keep, hanzi: '好', pinyin: 'hǎo', meaning: 'good', notes: '',
      tags: [], createdAt: 1, updatedAt: 1,
    });
    await deleteDeck(drop);
    expect(await db.notes.count()).toBe(1);
    expect(await listDecks()).toHaveLength(1);
  });
});
