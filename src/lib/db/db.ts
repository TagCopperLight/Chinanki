import Dexie, { type Table } from 'dexie';
import type { AppSettings, Card, Deck, Note, ReviewLog } from '@/lib/db/types';

interface SettingsRow {
  key: 'app';
  value: AppSettings;
}

export class ChinankiDb extends Dexie {
  // `id` is optional on these domain types (for pre-insert objects), which
  // makes Dexie's `EntityTable<T, 'id'>` infer add()'s return type as
  // `number | undefined`. Pinning TKey explicitly to `number` avoids that.
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
      // [deckId+state+due] serves the study queue; [noteId+direction] enforces uniqueness.
      cards: '++id, noteId, deckId, due, state, suspended, [deckId+state], [deckId+due], [noteId+direction], [deckId+suspended]',
      reviews: '++id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      settings: 'key',
    });
  }
}

export const db = new ChinankiDb();
