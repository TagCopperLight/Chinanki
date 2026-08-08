import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import { saveSettings } from '@/lib/db/settings';
import { exportBackup, importBackup } from '@/lib/io/backup';

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
});
