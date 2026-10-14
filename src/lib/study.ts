import { db, type Card, type Direction, type Note, type ReviewLog } from '@/lib/db';
import {
  schedule,
  schedulePreview,
  type DeckConfig,
  type Rating,
  type SchedulingState,
} from '@/lib/fsrs';
import { DAY_MS } from '@/lib/time';

export type NoteField = 'hanzi' | 'pinyin' | 'meaning';

/** A direction is literally "<prompt>-<answer>", so the split is the mapping. */
export function promptFor(direction: Direction): NoteField {
  return direction.split('-')[0] as NoteField;
}

export function answerFor(direction: Direction): NoteField {
  return direction.split('-')[1] as NoteField;
}

/** Writing directions are answered by drawing the character rather than reading it. */
export function isWritingDirection(direction: Direction): boolean {
  return answerFor(direction) === 'hanzi';
}

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
