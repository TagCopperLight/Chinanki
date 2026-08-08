import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/db/settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('getSettings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in missing keys from the defaults', async () => {
    // Simulates a settings row written by an older version of the app.
    await db.settings.put({ key: 'app', value: { rolloverHour: 2 } as never });
    const settings = await getSettings();
    expect(settings.rolloverHour).toBe(2);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.toneColours).toEqual(DEFAULT_SETTINGS.toneColours);
  });
});

describe('saveSettings', () => {
  it('persists a patch and leaves other keys alone', async () => {
    await saveSettings({ rolloverHour: 3 });
    await saveSettings({ theme: 'dark' });
    const settings = await getSettings();
    expect(settings.rolloverHour).toBe(3);
    expect(settings.theme).toBe('dark');
  });

  it('rejects an out-of-range rollover hour', async () => {
    await expect(saveSettings({ rolloverHour: 24 })).rejects.toThrow('rolloverHour');
  });
});
