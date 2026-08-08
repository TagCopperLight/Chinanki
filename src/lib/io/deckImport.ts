import { db } from '@/lib/db/db';
import { createNote } from '@/lib/db/notes';
import { parseCsv, toCsv } from '@/lib/io/csv';

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
