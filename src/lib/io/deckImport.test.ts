import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import { exportDeckCsv, importCsvIntoDeck } from '@/lib/io/deckImport';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
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
