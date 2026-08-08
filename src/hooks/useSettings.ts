import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/db/settings';
import type { AppSettings } from '@/lib/db/types';

/** Live app settings. Falls back to the defaults on the first render. */
export function useSettings(): {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
} {
  const settings = useLiveQuery(() => getSettings(), [], DEFAULT_SETTINGS);
  const update = useCallback((patch: Partial<AppSettings>) => saveSettings(patch), []);
  return { settings, update };
}
