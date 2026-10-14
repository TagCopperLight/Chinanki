import {
  createNote,
  db,
  type AppSettings,
  type Card,
  type Deck,
  type Note,
  type ReviewLog,
} from '@/lib/db';

/** RFC 4180 subset: comma separated, optional double quotes, doubled quotes escape. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let hasContent = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    if (hasContent) rows.push(row);
    row = [];
    hasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      hasContent = true;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (char === ',') {
      endField();
      hasContent = true;
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      // Treat CRLF as a single terminator; a lone CR still ends the row.
      if (text[i + 1] !== '\n') endRow();
    } else {
      field += char;
      if (char.trim() !== '') hasContent = true;
    }
  }
  if (inQuotes) {
    throw new Error(
      `Unterminated quoted field starting in row ${rows.length + 1}: a closing " is missing`,
    );
  }
  endRow();
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) =>
          /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field,
        )
        .join(','),
    )
    .join('\n');
}

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

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const HEADER = ['hanzi', 'pinyin', 'meaning', 'notes'];
const MAX_REPORTED_ERRORS = 20;

function isHeaderRow(row: string[]): boolean {
  return row[0]?.trim().toLowerCase() === 'hanzi';
}

/** Imports `hanzi,pinyin,meaning[,notes]` rows. Bad rows are reported, not fatal. */
export async function importCsvIntoDeck(deckId: number, text: string): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (cause) {
    result.errors.push(cause instanceof Error ? cause.message : 'The file could not be parsed as CSV');
    return result;
  }

  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (index === 0 && isHeaderRow(row)) continue;

    const [hanzi = '', pinyin = '', meaning = '', notes = ''] = row.map((field) => field.trim());
    if (hanzi === '' || meaning === '') {
      result.skipped++;
      if (result.errors.length < MAX_REPORTED_ERRORS) {
        result.errors.push(`Row ${index + 1}: needs at least a hanzi and a meaning`);
      }
      continue;
    }
    if (seen.has(hanzi)) {
      result.skipped++;
      if (result.errors.length < MAX_REPORTED_ERRORS) {
        result.errors.push(`Row ${index + 1}: "${hanzi}" appears more than once in the file`);
      }
      continue;
    }
    seen.add(hanzi);

    try {
      await createNote({ deckId, hanzi, pinyin, meaning, notes });
      result.imported++;
    } catch (cause) {
      result.skipped++;
      if (result.errors.length < MAX_REPORTED_ERRORS) {
        result.errors.push(
          `Row ${index + 1}: ${cause instanceof Error ? cause.message : 'could not be imported'}`,
        );
      }
    }
  }

  return result;
}

export async function exportDeckCsv(deckId: number): Promise<string> {
  const notes = await db.notes.where('deckId').equals(deckId).sortBy('createdAt');
  return toCsv([HEADER, ...notes.map((n) => [n.hanzi, n.pinyin, n.meaning, n.notes])]);
}
