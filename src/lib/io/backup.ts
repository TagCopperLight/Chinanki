import { db } from '@/lib/db/db';
import type { AppSettings, Card, Deck, Note, ReviewLog } from '@/lib/db/types';

export const BACKUP_VERSION = 1;

interface Backup {
  version: number;
  exportedAt: number;
  decks: Deck[];
  notes: Note[];
  cards: Card[];
  reviews: ReviewLog[];
  settings: { key: 'app'; value: AppSettings }[];
}

export async function exportBackup(): Promise<string> {
  const [decks, notes, cards, reviews, settings] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.settings.toArray(),
  ]);
  const backup: Backup = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    decks,
    notes,
    cards,
    reviews,
    settings,
  };
  return JSON.stringify(backup);
}

function parseBackup(json: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That file is not a Chinanki backup');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    !('decks' in parsed)
  ) {
    throw new Error('That file is not a Chinanki backup');
  }
  const backup = parsed as Backup;
  if (backup.version > BACKUP_VERSION) {
    throw new Error('That backup came from a newer version of Chinanki');
  }
  return backup;
}

/** Replaces the entire database. The caller is responsible for confirming first. */
export async function importBackup(json: string): Promise<void> {
  const backup = parseBackup(json);
  await db.transaction('rw', db.decks, db.notes, db.cards, db.reviews, db.settings, async () => {
    await Promise.all([
      db.decks.clear(),
      db.notes.clear(),
      db.cards.clear(),
      db.reviews.clear(),
      db.settings.clear(),
    ]);
    await db.decks.bulkAdd(backup.decks ?? []);
    await db.notes.bulkAdd(backup.notes ?? []);
    await db.cards.bulkAdd(backup.cards ?? []);
    await db.reviews.bulkAdd(backup.reviews ?? []);
    await db.settings.bulkAdd(backup.settings ?? []);
  });
}

/** Triggers a browser download. No-op outside a DOM. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
