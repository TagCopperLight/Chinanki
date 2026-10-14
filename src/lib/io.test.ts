import { describe, expect, it, beforeEach } from 'vitest';
import {
  parseCsv,
  toCsv,
  exportBackup,
  importBackup,
  exportDeckCsv,
  importCsvIntoDeck,
} from '@/lib/io';
import { db, createDeck, createNote, saveSettings } from '@/lib/db';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('好,hǎo,good\n水,shuǐ,water')).toEqual([
      ['好', 'hǎo', 'good'],
      ['水', 'shuǐ', 'water'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('好,hǎo,"good, fine"')).toEqual([['好', 'hǎo', 'good, fine']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a,"say ""hi"""')).toEqual([['a', 'say "hi"']]);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n')).toEqual([]);
  });

  it('preserves newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([['a', 'line1\nline2']]);
  });

  it('throws on an unterminated quoted field at end of input', () => {
    expect(() => parseCsv('好,hǎo,"good\n水,shuǐ,water')).toThrow(/unterminated|quote/i);
  });

  it('treats a lone CR as a row separator', () => {
    expect(parseCsv('a,b\rc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('does not produce a blank row for CRLF', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserves a CR inside a quoted field as literal content', () => {
    expect(parseCsv('a,"line1\rline2"')).toEqual([['a', 'line1\rline2']]);
  });
});

describe('toCsv', () => {
  it('quotes only the fields that need it', () => {
    expect(toCsv([['好', 'good, fine', 'say "hi"']])).toBe('好,"good, fine","say ""hi"""');
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['好', 'hǎo', 'good, fine'],
      ['水', 'shuǐ', 'water\nH2O'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('exportBackup / importBackup', () => {
  it('round-trips decks, notes, cards, reviews and settings', async () => {
    const deckId = await createDeck({ name: 'HSK 1', directions: ['hanzi-meaning'] });
    const noteId = await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    const cardId = (await db.cards.where('noteId').equals(noteId).toArray())[0]!.id!;
    await db.reviews.add({
      cardId, noteId, deckId, direction: 'hanzi-meaning', rating: 3, stateBefore: 'new',
      stateAfter: 'learning', reviewedAt: 123, elapsedDays: 0, scheduledDays: 0,
      stabilityAfter: 1, difficultyAfter: 5, durationMs: 900,
    });
    await saveSettings({ rolloverHour: 2 });

    const json = await exportBackup();
    await db.delete();
    await db.open();
    await importBackup(json);

    expect((await db.decks.toArray())[0]?.name).toBe('HSK 1');
    expect((await db.notes.toArray())[0]?.hanzi).toBe('好');
    expect(await db.cards.count()).toBe(1);
    expect((await db.reviews.toArray())[0]?.reviewedAt).toBe(123);
    expect((await db.settings.get('app'))?.value.rolloverHour).toBe(2);
  });

  it('records the schema version and an export timestamp', async () => {
    const backup = JSON.parse(await exportBackup()) as Record<string, unknown>;
    expect(backup.version).toBe(1);
    expect(typeof backup.exportedAt).toBe('number');
  });

  it('replaces the existing database rather than merging', async () => {
    await createDeck({ name: 'Keep me?' });
    const empty = await exportBackup();
    await createDeck({ name: 'Added later' });
    await importBackup(empty);
    expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['Keep me?']);
  });

  it('rejects a file that is not a Chinanki backup', async () => {
    await expect(importBackup('{"hello":true}')).rejects.toThrow('not a Chinanki backup');
    await expect(importBackup('not json at all')).rejects.toThrow('not a Chinanki backup');
  });

  it('rejects a backup from a newer schema version', async () => {
    await expect(importBackup('{"version":99,"decks":[]}')).rejects.toThrow('newer version');
  });

  it('rolls back the clear if a bulkAdd fails partway through the restore', async () => {
    const deckId = await createDeck({ name: 'Keep me', directions: ['hanzi-meaning'] });
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });

    const backup = JSON.parse(await exportBackup()) as Record<string, unknown>;
    const [deck] = backup.decks as unknown[];
    // Two decks sharing the same primary key in one bulkAdd call is a genuine
    // IndexedDB ConstraintError, thrown *after* the transaction's clear() calls
    // have already run — exactly the failure mode this test needs to force.
    backup.decks = [deck, deck];

    await expect(importBackup(JSON.stringify(backup))).rejects.toThrow();

    expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['Keep me']);
    expect(await db.notes.count()).toBe(1);
    expect((await db.notes.toArray())[0]?.hanzi).toBe('好');
  });
});

describe('deck CSV import/export', () => {
  let deckId: number;

  beforeEach(async () => {
    deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning', 'hanzi-pinyin'] });
  });

  describe('importCsvIntoDeck', () => {
    it('imports hanzi,pinyin,meaning rows and creates their cards', async () => {
      const result = await importCsvIntoDeck(deckId, '好,hǎo,good\n水,shuǐ,water');
      expect(result).toEqual({ imported: 2, skipped: 0, errors: [] });
      expect(await db.notes.count()).toBe(2);
      expect(await db.cards.count()).toBe(4);
    });

    it('accepts an optional fourth notes column', async () => {
      await importCsvIntoDeck(deckId, '好,hǎo,good,common greeting');
      expect((await db.notes.toArray())[0]!.notes).toBe('common greeting');
    });

    it('skips a header row', async () => {
      const result = await importCsvIntoDeck(deckId, 'hanzi,pinyin,meaning\n好,hǎo,good');
      expect(result.imported).toBe(1);
      expect(await db.notes.count()).toBe(1);
    });

    it('skips duplicates already in the deck and reports them', async () => {
      await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
      const result = await importCsvIntoDeck(deckId, '好,hǎo,good\n水,shuǐ,water');
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors[0]).toMatch(/好/);
    });

    it('skips duplicates within the file itself', async () => {
      const result = await importCsvIntoDeck(deckId, '好,hǎo,good\n好,hǎo,good again');
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('reports rows with too few columns without aborting the import', async () => {
      const result = await importCsvIntoDeck(deckId, '好,hǎo,good\nbroken\n水,shuǐ,water');
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.errors[0]).toMatch(/Row 2/);
    });

    it('imports nothing from an empty file', async () => {
      expect(await importCsvIntoDeck(deckId, '')).toEqual({ imported: 0, skipped: 0, errors: [] });
    });

    it('reports a malformed file with an unterminated quote instead of silently truncating', async () => {
      const result = await importCsvIntoDeck(deckId, '好,hǎo,"good\n水,shuǐ,water');
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors[0]).toMatch(/unterminated|quote/i);
      expect(await db.notes.count()).toBe(0);
    });
  });

  describe('exportDeckCsv', () => {
    it('round-trips through import', async () => {
      await importCsvIntoDeck(deckId, '好,hǎo,"good, fine",note here');
      const csv = await exportDeckCsv(deckId);

      const other = await createDeck({ name: 'Copy', directions: ['hanzi-meaning'] });
      await importCsvIntoDeck(other, csv);

      const copied = await db.notes.where('deckId').equals(other).first();
      expect(copied).toMatchObject({ hanzi: '好', pinyin: 'hǎo', meaning: 'good, fine', notes: 'note here' });
    });

    it('starts with a header row', async () => {
      expect((await exportDeckCsv(deckId)).split('\n')[0]).toBe('hanzi,pinyin,meaning,notes');
    });
  });
});

