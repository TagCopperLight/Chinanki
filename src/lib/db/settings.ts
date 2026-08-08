import { db } from '@/lib/db/db';
import type { AppSettings } from '@/lib/db/types';

export const DEFAULT_SETTINGS: AppSettings = {
  rolloverHour: 4,
  theme: 'system',
  colourHanzi: true,
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
