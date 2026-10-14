import { describe, expect, it, beforeEach } from 'vitest';
import {
  answerFor,
  isWritingDirection,
  promptFor,
  buildQueue,
  deckCounts,
  StudySession,
} from '@/lib/study';
import { ALL_DIRECTIONS, db, createDeck, createNote } from '@/lib/db';

describe('promptFor / answerFor', () => {
  it('maps each direction to its prompt and answer field', () => {
    expect(promptFor('hanzi-meaning')).toBe('hanzi');
    expect(answerFor('hanzi-meaning')).toBe('meaning');
    expect(promptFor('hanzi-pinyin')).toBe('hanzi');
    expect(answerFor('hanzi-pinyin')).toBe('pinyin');
    expect(promptFor('meaning-pinyin')).toBe('meaning');
    expect(answerFor('meaning-pinyin')).toBe('pinyin');
    expect(promptFor('pinyin-meaning')).toBe('pinyin');
    expect(answerFor('pinyin-meaning')).toBe('meaning');
  });

  it('maps the writing directions to their prompt and answer field', () => {
    expect(promptFor('meaning-hanzi')).toBe('meaning');
    expect(answerFor('meaning-hanzi')).toBe('hanzi');
    expect(promptFor('pinyin-hanzi')).toBe('pinyin');
    expect(answerFor('pinyin-hanzi')).toBe('hanzi');
  });
});

describe('isWritingDirection', () => {
  it('is true exactly for the directions answered by writing the character', () => {
    expect(isWritingDirection('meaning-hanzi')).toBe(true);
    expect(isWritingDirection('pinyin-hanzi')).toBe(true);
    expect(isWritingDirection('hanzi-meaning')).toBe(false);
    expect(isWritingDirection('hanzi-pinyin')).toBe(false);
    expect(isWritingDirection('meaning-pinyin')).toBe(false);
    expect(isWritingDirection('pinyin-meaning')).toBe(false);
  });

  it('covers every direction', () => {
    for (const direction of ALL_DIRECTIONS) {
      expect(typeof isWritingDirection(direction)).toBe('boolean');
    }
  });
});

const NOW = Date.UTC(2026, 5, 1, 10, 0, 0);
const DAY = 86_400_000;
let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning'] });
});

/** Adds a note and forces its single card into a given scheduling state. */
async function addCard(hanzi: string, patch: Partial<import('@/lib/db').Card> = {}) {
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

const MINUTE = 60_000;

/** Adds a note and pins its card's `due` to a deterministic time relative to NOW,
 * independent of the real system clock (mirroring `addCard` above). */
async function addNote(hanzi: string) {
  const noteId = await createNote({ deckId, hanzi, pinyin: 'x', meaning: 'x' });
  const card = (await db.cards.where('noteId').equals(noteId).toArray())[0]!;
  await db.cards.update(card.id!, { due: NOW });
  return noteId;
}

describe('StudySession', () => {
  it('exposes the first queue item as current', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    expect(session.current?.note.hanzi).toBe('一');
  });

  it('is finished when the deck is empty', async () => {
    const session = await StudySession.start(deckId, NOW);
    expect(session.current).toBeNull();
    expect(session.isFinished).toBe(true);
  });

  it('persists the card and appends a review log on answer', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    await session.answer(3, NOW, 2500);

    const card = (await db.cards.toArray())[0]!;
    expect(card.state).toBe('learning');
    expect(card.reps).toBe(1);

    const logs = await db.reviews.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cardId: card.id,
      deckId,
      rating: 3,
      stateBefore: 'new',
      stateAfter: 'learning',
      reviewedAt: NOW,
      durationMs: 2500,
    });
  });

  it('caps a recorded duration at 60 seconds', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    await session.answer(3, NOW, 10 * 60_000);
    expect((await db.reviews.toArray())[0]!.durationMs).toBe(60_000);
  });

  it('re-queues a card whose next step falls inside the session window', async () => {
    await addNote('一');
    await addNote('二');
    const session = await StudySession.start(deckId, NOW);

    await session.answer(1, NOW, 100); // 一 → due in 1 minute
    expect(session.current?.note.hanzi).toBe('二');

    await session.answer(3, NOW + 1000, 100); // 二 → due in 10 minutes
    expect(session.current?.note.hanzi).toBe('一');
  });

  it('drops a card from the session once it is scheduled days away', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    await session.answer(4, NOW, 100); // Easy graduates it
    expect(session.current).toBeNull();
    expect((await db.cards.toArray())[0]!.due).toBeGreaterThan(NOW + DAY - 1);
  });

  it('orders the in-session queue by due time', async () => {
    await addNote('一');
    await addNote('二');
    const session = await StudySession.start(deckId, NOW);
    await session.answer(3, NOW, 100); // 一 → +10m
    await session.answer(1, NOW, 100); // 二 → +1m, sooner
    expect(session.current?.note.hanzi).toBe('二');
  });

  it('counts answers', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    expect(session.counts.answered).toBe(0);
    await session.answer(4, NOW, 100);
    expect(session.counts.answered).toBe(1);
  });

  it('reports remaining counts by state', async () => {
    await addNote('一');
    await addNote('二');
    const session = await StudySession.start(deckId, NOW);
    expect(session.counts).toMatchObject({ new: 2, learning: 0, review: 0 });
    await session.answer(3, NOW, 100);
    expect(session.counts).toMatchObject({ new: 1, learning: 1 });
  });

  it('previews all four ratings without persisting anything', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    const previews = session.previews(NOW);
    expect(previews[1].due).toBeLessThan(previews[4]!.due);
    expect((await db.cards.toArray())[0]!.reps).toBe(0);
  });

  it('undoes the last answer, restoring the card and removing the log', async () => {
    await addNote('一');
    const session = await StudySession.start(deckId, NOW);
    await session.answer(4, NOW, 100);
    expect(await session.undo()).toBe(true);

    const card = (await db.cards.toArray())[0]!;
    expect(card.state).toBe('new');
    expect(card.reps).toBe(0);
    expect(await db.reviews.count()).toBe(0);
    expect(session.current?.note.hanzi).toBe('一');
    expect(session.counts.answered).toBe(0);
  });

  it('returns false when there is nothing to undo', async () => {
    const session = await StudySession.start(deckId, NOW);
    expect(await session.undo()).toBe(false);
  });

  it('fully restores queue, cards, review logs and counts after answer, answer, undo, undo', async () => {
    await addNote('一');
    await addNote('二');
    const session = await StudySession.start(deckId, NOW);

    // 一 → good: learning, due NOW+10m (learningSteps[1] = 10). Requeued behind
    // 二 (still due NOW), so the queue becomes [二, 一].
    await session.answer(3, NOW, 100);
    expect(session.current?.note.hanzi).toBe('二');

    // 二 → again: learning, due (NOW+1000)+1m = NOW+61000. Requeued ahead of 一
    // (due NOW+600000), so the queue becomes [二, 一] again, now both answered.
    await session.answer(1, NOW + 1000, 100);
    expect(session.current?.note.hanzi).toBe('二');
    expect(session.counts.answered).toBe(2);
    expect(await db.reviews.count()).toBe(2);

    // Undo 二's answer: restores 二 to its pre-answer (new) row, drops its
    // review log, and puts the original 二 back at the front of the queue.
    expect(await session.undo()).toBe(true);
    expect(session.current?.note.hanzi).toBe('二');
    expect(session.counts.answered).toBe(1);
    expect(await db.reviews.count()).toBe(1);

    // Undo 一's answer: same, restoring 一 and leaving the queue exactly as it
    // started.
    expect(await session.undo()).toBe(true);
    expect(session.current?.note.hanzi).toBe('一');
    expect(session.counts).toMatchObject({ new: 2, learning: 0, review: 0, answered: 0 });

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.state).toBe('new');
      expect(card.reps).toBe(0);
      expect(card.due).toBe(NOW);
    }
    expect(await db.reviews.count()).toBe(0);
  });

  it('stays coherent through an interleaved answer, undo, answer sequence', async () => {
    await addNote('一');
    await addNote('二');
    const session = await StudySession.start(deckId, NOW);

    // 一 → good: learning, due NOW+10m, requeued behind 二. Queue: [二, 一].
    await session.answer(3, NOW, 100);
    expect(session.current?.note.hanzi).toBe('二');

    // Undo restores 一 to 'new' and puts the queue back to [一, 二].
    expect(await session.undo()).toBe(true);
    expect(session.current?.note.hanzi).toBe('一');
    expect(session.counts.answered).toBe(0);
    expect(await db.reviews.count()).toBe(0);

    // 一 → easy: a new card graduates straight to 'review', due days away, so
    // it is not requeued. Queue: [二].
    await session.answer(4, NOW + 2000, 50);
    expect(session.current?.note.hanzi).toBe('二');
    expect(session.counts.answered).toBe(1);

    const logs = await db.reviews.toArray();
    expect(logs).toHaveLength(1);
    const yiCard = (await db.cards.toArray()).find((card) => card.due !== NOW)!;
    expect(logs[0]).toMatchObject({
      cardId: yiCard.id,
      rating: 4,
      stateBefore: 'new',
      stateAfter: 'review',
      reviewedAt: NOW + 2000,
    });
    expect(yiCard.state).toBe('review');
  });

  it('uses the deck config for learning steps', async () => {
    const fast = await createDeck({
      name: 'Fast',
      directions: ['hanzi-meaning'],
      config: {
        learningSteps: [5],
        relearningSteps: [5],
        desiredRetention: 0.9,
        maximumInterval: 36500,
        fsrsParams: (await import('@/lib/fsrs')).DEFAULT_FSRS_PARAMS,
      },
    });
    await createNote({ deckId: fast, hanzi: '快', pinyin: 'kuài', meaning: 'fast' });
    const session = await StudySession.start(fast, NOW);
    await session.answer(1, NOW, 100);
    expect((await db.cards.where('deckId').equals(fast).toArray())[0]!.due).toBe(NOW + 5 * MINUTE);
  });
});
