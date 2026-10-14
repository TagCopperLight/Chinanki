import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_DECK_CONFIG,
  newSchedulingState,
  type CardState,
  type DeckConfig,
  type Rating,
  type SchedulingState,
} from '@/lib/fsrs';
import type { GlossLanguage } from '@/lib/dictionary';
import type { Tone } from '@/lib/pinyin';

export type Direction =
  | 'hanzi-meaning'
  | 'hanzi-pinyin'
  | 'meaning-pinyin'
  | 'pinyin-meaning'
  | 'meaning-hanzi'
  | 'pinyin-hanzi';

export const ALL_DIRECTIONS: readonly Direction[] = [
  'hanzi-meaning',
  'hanzi-pinyin',
  'meaning-pinyin',
  'pinyin-meaning',
  'meaning-hanzi',
  'pinyin-hanzi',
];

export const DIRECTION_LABELS: Record<Direction, string> = {
  'hanzi-meaning': '汉字 → Meaning',
  'hanzi-pinyin': '汉字 → Pinyin',
  'meaning-pinyin': 'Meaning → Pinyin',
  'pinyin-meaning': 'Pinyin → Meaning',
  'meaning-hanzi': 'Meaning → 汉字',
  'pinyin-hanzi': 'Pinyin → 汉字',
};

export interface Deck {
  id?: number;
  name: string;
  description: string;
  /** Which card directions this deck generates. */
  directions: Direction[];
  config: DeckConfig;
  createdAt: number;
}

export interface Note {
  id?: number;
  deckId: number;
  hanzi: string;
  /** Accented pinyin, e.g. "nǐ hǎo". */
  pinyin: string;
  /** English meaning; multiple senses separated by "; ". */
  meaning: string;
  /** Free-form user notes shown on the answer side. */
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Card extends SchedulingState {
  id?: number;
  noteId: number;
  deckId: number;
  direction: Direction;
  /** 0/1 rather than boolean so Dexie can index it. */
  suspended: 0 | 1;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  noteId: number;
  deckId: number;
  direction: Direction;
  rating: Rating;
  stateBefore: CardState;
  stateAfter: CardState;
  reviewedAt: number;
  /** Days since the previous review; 0 for a first answer. */
  elapsedDays: number;
  /** Days scheduled by this answer; 0 for intraday (re)learning steps. */
  scheduledDays: number;
  stabilityAfter: number;
  difficultyAfter: number;
  /** How long the user spent on the card, capped at 60s. */
  durationMs: number;
}

export interface AppSettings {
  /** Local hour at which the study day rolls over, 0–23. */
  rolloverHour: number;
  theme: 'system' | 'light' | 'dark';
  /** Colour the hanzi by tone as well as the pinyin. */
  colourHanzi: boolean;
  toneColours: Record<Tone, string>;
  /** Language of the dictionary suggestions in the note editor. */
  suggestionLanguage: GlossLanguage;
}

interface SettingsRow {
  key: 'app';
  value: AppSettings;
}

export class ChinankiDb extends Dexie {
  // TKey is pinned to `number` so add() is not typed as returning `number | undefined`.
  decks!: Table<Deck, number>;
  notes!: Table<Note, number>;
  cards!: Table<Card, number>;
  reviews!: Table<ReviewLog, number>;
  settings!: Table<SettingsRow, 'app'>;

  constructor() {
    super('chinanki');
    this.version(1).stores({
      decks: '++id, name, createdAt',
      notes: '++id, deckId, hanzi, createdAt, [deckId+hanzi]',
      // [noteId+direction] is not unique: reconcile() keeps it to one card per pair.
      cards: '++id, noteId, deckId, due, state, suspended, [deckId+state], [deckId+due], [noteId+direction], [deckId+suspended]',
      reviews: '++id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      settings: 'key',
    });
  }
}

export const db = new ChinankiDb();

export const DEFAULT_SETTINGS: AppSettings = {
  rolloverHour: 4,
  theme: 'system',
  colourHanzi: true,
  suggestionLanguage: 'en',
  toneColours: {
    0: '#94a3b8', // neutral — slate
    1: '#ef4444', // first  — red
    2: '#f59e0b', // second — amber
    3: '#22c55e', // third  — green
    4: '#3b82f6', // fourth — blue
  },
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...row.value,
    toneColours: { ...DEFAULT_SETTINGS.toneColours, ...row.value.toneColours },
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  if (patch.rolloverHour !== undefined) {
    const hour = patch.rolloverHour;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error('rolloverHour must be an integer between 0 and 23');
    }
  }
  const current = await getSettings();
  await db.settings.put({ key: 'app', value: { ...current, ...patch } });
}

export function listCardsForNote(noteId: number): Promise<Card[]> {
  return db.cards.where('noteId').equals(noteId).toArray();
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

  await db.transaction('rw', db.notes, async () => {
    const next = { ...patch };
    if (next.hanzi !== undefined) {
      const hanzi = next.hanzi.trim();
      next.hanzi = hanzi;
      const existing = await db.notes.get(id);
      if (existing) {
        const duplicate = await db.notes.where({ deckId: existing.deckId, hanzi }).first();
        if (duplicate && duplicate.id !== id) {
          throw new Error(`"${hanzi}" is already in this deck`);
        }
      }
    }
    await db.notes.update(id, { ...next, updatedAt: Date.now() });
  });
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

export interface CreateDeckInput {
  name: string;
  description?: string;
  directions?: Deck['directions'];
  config?: Deck['config'];
}

export async function createDeck(input: CreateDeckInput): Promise<number> {
  const name = input.name.trim();
  if (name === '') throw new Error('Deck name is required');
  return db.decks.add({
    name,
    description: input.description?.trim() ?? '',
    directions: input.directions ?? ['hanzi-meaning', 'hanzi-pinyin'],
    config: input.config ?? DEFAULT_DECK_CONFIG,
    createdAt: Date.now(),
  });
}

export function getDeck(id: number): Promise<Deck | undefined> {
  return db.decks.get(id);
}

export function listDecks(): Promise<Deck[]> {
  return db.decks.orderBy('createdAt').toArray();
}

export async function updateDeck(id: number, patch: Partial<Omit<Deck, 'id'>>): Promise<void> {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') throw new Error('Deck name is required');
    patch = { ...patch, name };
  }
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    await db.decks.update(id, patch);
    if (patch.directions !== undefined) {
      await syncCardsForDeck(id);
    }
  });
}

/** Deletes the deck and everything that belongs to it, atomically. */
export async function deleteDeck(id: number): Promise<void> {
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, async () => {
    await db.reviews.where('deckId').equals(id).delete();
    await db.cards.where('deckId').equals(id).delete();
    await db.notes.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}
