import { db } from '@/lib/db/db';
import { schedule, schedulePreview } from '@/lib/fsrs';
import type { DeckConfig, Rating, SchedulingState } from '@/lib/fsrs';
import { buildQueue, type QueueItem } from '@/lib/study/queue';
import type { Card, ReviewLog } from '@/lib/db/types';
import { DAY_MS } from '@/lib/time';

/** A card scheduled sooner than this comes back in the same sitting. */
export const RE_QUEUE_WINDOW_MS = 20 * 60_000;
const MAX_RECORDED_DURATION_MS = 60_000;

interface UndoEntry {
  item: QueueItem;
  previousCard: Card;
  logId: number;
  queueIndex: number;
}

export class StudySession {
  private queue: QueueItem[];
  private readonly config: DeckConfig;
  private readonly undoStack: UndoEntry[] = [];

  private constructor(queue: QueueItem[], config: DeckConfig) {
    this.queue = queue;
    this.config = config;
  }

  static async start(deckId: number, now: number): Promise<StudySession> {
    const deck = await db.decks.get(deckId);
    if (!deck) throw new Error(`Deck ${deckId} does not exist`);
    return new StudySession(await buildQueue(deckId, now), deck.config);
  }

  get current(): QueueItem | null {
    return this.queue[0] ?? null;
  }

  get isFinished(): boolean {
    return this.queue.length === 0;
  }

  get counts(): { new: number; learning: number; review: number; answered: number } {
    let fresh = 0;
    let learning = 0;
    let review = 0;
    for (const { card } of this.queue) {
      if (card.state === 'new') fresh++;
      else if (card.state === 'review') review++;
      else learning++;
    }
    return { new: fresh, learning, review, answered: this.undoStack.length };
  }

  /** What each rating would schedule, for the button labels. */
  previews(now: number): Record<Rating, SchedulingState> {
    const item = this.current;
    if (!item) throw new Error('No current card');
    return schedulePreview(item.card, now, this.config);
  }

  async answer(rating: Rating, now: number, durationMs: number): Promise<void> {
    const item = this.current;
    if (!item) throw new Error('No current card');

    const previous = { ...item.card };
    const next = schedule(previous, rating, now, this.config);
    const elapsedDays = previous.lastReview === null ? 0 : (now - previous.lastReview) / DAY_MS;

    const log: Omit<ReviewLog, 'id'> = {
      cardId: previous.id!,
      noteId: previous.noteId,
      deckId: previous.deckId,
      direction: previous.direction,
      rating,
      stateBefore: previous.state,
      stateAfter: next.state,
      reviewedAt: now,
      elapsedDays,
      scheduledDays: next.scheduledDays,
      stabilityAfter: next.stability,
      difficultyAfter: next.difficulty,
      durationMs: Math.min(Math.max(durationMs, 0), MAX_RECORDED_DURATION_MS),
    };

    let logId = 0;
    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.update(previous.id!, next);
      logId = await db.reviews.add(log);
    });

    const updated: QueueItem = { note: item.note, card: { ...previous, ...next } };
    this.queue = this.queue.slice(1);

    let queueIndex = -1;
    if (next.due - now < RE_QUEUE_WINDOW_MS) {
      queueIndex = this.queue.findIndex((queued) => queued.card.due > next.due);
      if (queueIndex === -1) queueIndex = this.queue.length;
      this.queue.splice(queueIndex, 0, updated);
    }

    this.undoStack.push({ item, previousCard: previous, logId, queueIndex });
  }

  /** Reverts the last answer. Returns false when there is nothing to revert. */
  async undo(): Promise<boolean> {
    const entry = this.undoStack.pop();
    if (!entry) return false;

    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.put(entry.previousCard);
      await db.reviews.delete(entry.logId);
    });

    if (entry.queueIndex >= 0) {
      this.queue.splice(entry.queueIndex, 1);
    }
    this.queue.unshift(entry.item);
    return true;
  }
}
