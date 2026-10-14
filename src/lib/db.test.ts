import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  createDeck,
  updateDeck,
  createNote,
  deleteNote,
  getNote,
  syncCardsForDeck,
  updateNote,
  listCardsForNote,
  resetCard,
  setCardSuspended,
  deleteDeck,
  getDeck,
  listDecks,
} from '@/lib/db';
import { DEFAULT_DECK_CONFIG } from '@/lib/fsrs';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('getSettings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in missing keys from the defaults', async () => {
    // Simulates a settings row written by an older version of the app.
    await db.settings.put({ key: 'app', value: { rolloverHour: 2 } as never });
    const settings = await getSettings();
    expect(settings.rolloverHour).toBe(2);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.toneColours).toEqual(DEFAULT_SETTINGS.toneColours);
  });
});

describe('saveSettings', () => {
  it('persists a patch and leaves other keys alone', async () => {
    await saveSettings({ rolloverHour: 3 });
    await saveSettings({ theme: 'dark' });
    const settings = await getSettings();
    expect(settings.rolloverHour).toBe(3);
    expect(settings.theme).toBe('dark');
  });

  it('rejects an out-of-range rollover hour', async () => {
    await expect(saveSettings({ rolloverHour: 24 })).rejects.toThrow('rolloverHour');
  });
});

describe('notes and cards', () => {
  let deckId: number;

  beforeEach(async () => {
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

    it('rejects a hanzi edit that collides with another note in the same deck', async () => {
      await createNote({ deckId, hanzi: '你', pinyin: 'nǐ', meaning: 'you' });
      const noteId = await createNote({ deckId, ...HAO });

      await expect(updateNote(noteId, { hanzi: '你' })).rejects.toThrow('already in this deck');
      expect((await getNote(noteId))?.hanzi).toBe('好');
    });

    it('allows editing a note without changing its own hanzi', async () => {
      const noteId = await createNote({ deckId, ...HAO });
      await expect(updateNote(noteId, { hanzi: '好', meaning: 'good; fine' })).resolves.toBeUndefined();
      expect((await getNote(noteId))?.meaning).toBe('good; fine');
    });

    it('allows the same hanzi to collide across different decks', async () => {
      const other = await createDeck({ name: 'Other' });
      await createNote({ deckId: other, ...HAO });
      const noteId = await createNote({ deckId, hanzi: '你', pinyin: 'nǐ', meaning: 'you' });

      await expect(updateNote(noteId, { hanzi: '好' })).resolves.toBeUndefined();
      expect((await getNote(noteId))?.hanzi).toBe('好');
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
