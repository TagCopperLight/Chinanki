import { useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { downloadText, exportBackup, importBackup } from '@/lib/io';
import Button from '@/components/Button';
import Field, { inputClass } from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import PinyinText from '@/components/PinyinText';
import type { Tone } from '@/lib/pinyin';

const TONES: { tone: Tone; label: string }[] = [
  { tone: 1, label: 'Tone 1' },
  { tone: 2, label: 'Tone 2' },
  { tone: 3, label: 'Tone 3' },
  { tone: 4, label: 'Tone 4' },
  { tone: 0, label: 'Neutral' },
];

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  async function onExport() {
    try {
      downloadText(
        `chinanki-backup-${new Date().toISOString().slice(0, 10)}.json`,
        await exportBackup(),
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not export backup');
    }
  }

  async function onBackupFile(file: File) {
    if (!window.confirm('Importing a backup replaces everything currently in the app. Continue?')) {
      return;
    }
    try {
      await importBackup(await file.text());
      setMessage('Backup restored.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not read that backup');
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 p-4">
        <Field label="Theme">
          <select
            className={inputClass}
            value={settings.theme}
            onChange={(event) => update({ theme: event.target.value as typeof settings.theme })}
          >
            <option value="system">Match device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>

        <Field
          label="New day starts at"
          hint="Reviews before this hour count towards the previous day."
        >
          <select
            className={inputClass}
            value={String(settings.rolloverHour)}
            onChange={(event) => update({ rolloverHour: Number(event.target.value) })}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </Field>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">Tone colours</h2>
          <p data-testid="tone-preview" className="text-2xl">
            <PinyinText pinyin="mā má mǎ mà ma" />
          </p>
          {TONES.map(({ tone, label }) => (
            <label key={tone} className="flex min-h-11 items-center gap-3">
              <input
                type="color"
                aria-label={`${label} colour`}
                className="size-9 rounded border-0 bg-transparent p-0"
                value={settings.toneColours[tone]}
                onChange={(event) =>
                  update({ toneColours: { ...settings.toneColours, [tone]: event.target.value } })
                }
              />
              <span className="flex-1">{label}</span>
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={settings.colourHanzi}
              onChange={(event) => update({ colourHanzi: event.target.checked })}
            />
            <span>Colour hanzi by tone</span>
          </label>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">Backup</h2>
          <p className="text-xs text-slate-500">
            Everything lives on this device only. Export regularly — clearing your browser data
            deletes your decks.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onExport}>
              Export backup
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => fileInput.current?.click()}>
              Import backup
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onBackupFile(file);
              event.target.value = '';
            }}
          />
          {message && <p className="text-sm text-slate-500">{message}</p>}
        </section>

        <section className="space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700">
          <p>Chinanki — Mandarin vocabulary, spaced.</p>
          <p>
            Dictionary data from CC-CEDICT, licensed CC BY-SA 4.0.{' '}
            <a
              className="underline"
              href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict"
              target="_blank"
              rel="noreferrer"
            >
              www.mdbg.net
            </a>
          </p>
          <p>Scheduling by FSRS-4.5.</p>
        </section>
      </div>
    </>
  );
}
