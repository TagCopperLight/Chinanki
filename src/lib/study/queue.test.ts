import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import { buildQueue, deckCounts } from '@/lib/study/queue';

const NOW = Date.UTC(2026, 5, 1, 10, 0, 0);
const DAY = 86_400_000;
let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning'] });
});

/** Adds a note and forces its single card into a given scheduling state. */
async function addCard(hanzi: string, patch: Partial<import('@/lib/db/types').Card> = {}) {
  const noteId = await createNote({ deckId, hanzi, pinyin: 'x', meaning: 'x' });
  const card = (await db.cards.where('noteId').equals(noteId).toArray())[0]!;
  await db.cards.update(card.id!, patch);
  return card.id!;
}

describe('buildQueue', () => {
  it('is empty for a deck with no notes', async () => {
    expect(await buildQueue(deckId, NOW)).toEqual([]);
  });

  it('includes new cards', async () => {
    await addCard('一');
    const queue = await buildQueue(deckId, NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.note.hanzi).toBe('一');
  });

  it('includes review cards that are due and excludes ones that are not', async () => {
    await addCard('一', { state: 'review', due: NOW - DAY });
    await addCard('二', { state: 'review', due: NOW + DAY });
    const queue = await buildQueue(deckId, NOW);
    expect(queue.map((item) => item.note.hanzi)).toEqual(['一']);
  });

  it('excludes suspended cards', async () => {
    await addCard('一', { suspended: 1 });
    expect(await buildQueue(deckId, NOW)).toEqual([]);
  });

  it('puts due learning cards before reviews, and reviews before new cards', async () => {
    await addCard('新');
    await addCard('复', { state: 'review', due: NOW - DAY });
    await addCard('学', { state: 'learning', due: NOW - 60_000 });
    const queue = await buildQueue(deckId, NOW);
    expect(queue.map((item) => item.note.hanzi)).toEqual(['学', '复', '新']);
  });

  it('orders due reviews by how overdue they are', async () => {
    await addCard('晚', { state: 'review', due: NOW - 5 * DAY });
    await addCard('早', { state: 'review', due: NOW - DAY });
    const queue = await buildQueue(deckId, NOW);
    expect(queue.map((item) => item.note.hanzi)).toEqual(['晚', '早']);
  });

  it('orders new cards by creation order', async () => {
    await addCard('一');
    await addCard('二');
    await addCard('三');
    const queue = await buildQueue(deckId, NOW);
    expect(queue.map((item) => item.note.hanzi)).toEqual(['一', '二', '三']);
  });

  it('ignores cards from other decks', async () => {
    const other = await createDeck({ name: 'Other' });
    await createNote({ deckId: other, hanzi: '别', pinyin: 'bié', meaning: 'other' });
    await addCard('一');
    const queue = await buildQueue(deckId, NOW);
    expect(queue).toHaveLength(1);
  });

  it('attaches the note to every item', async () => {
    await addCard('好');
    const [item] = await buildQueue(deckId, NOW);
    expect(item!.note.id).toBe(item!.card.noteId);
  });
});

describe('deckCounts', () => {
  it('counts new, due learning and due review cards separately', async () => {
    await addCard('新1');
    await addCard('新2');
    await addCard('学', { state: 'learning', due: NOW - 60_000 });
    await addCard('复', { state: 'review', due: NOW - DAY });
    await addCard('未', { state: 'review', due: NOW + DAY });
    expect(await deckCounts(deckId, NOW)).toEqual({ new: 2, learning: 1, review: 1 });
  });

  it('counts relearning cards as learning', async () => {
    await addCard('挂', { state: 'relearning', due: NOW - 60_000 });
    expect((await deckCounts(deckId, NOW)).learning).toBe(1);
  });

  it('returns zeroes for an empty deck', async () => {
    expect(await deckCounts(deckId, NOW)).toEqual({ new: 0, learning: 0, review: 0 });
  });
});
