import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { getSettings } from '@/lib/db/settings';
import { exportBackup } from '@/lib/io';
import * as backupModule from '@/lib/io/backup';
import SettingsPage from '@/pages/SettingsPage';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  it('changes the theme', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Theme'), 'dark');
    await waitFor(async () => expect((await getSettings()).theme).toBe('dark'));
  });

  it('changes the day rollover hour', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('New day starts at'), '2');
    await waitFor(async () => expect((await getSettings()).rolloverHour).toBe(2));
  });

  it('toggles hanzi tone colouring', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByLabelText('Colour hanzi by tone'));
    await waitFor(async () => expect((await getSettings()).colourHanzi).toBe(false));
  });

  it('changes a tone colour and shows a live preview', async () => {
    renderPage();
    const input = await screen.findByLabelText('Tone 1 colour');
    expect(input).toHaveValue('#ef4444');
    expect(screen.getByTestId('tone-preview')).toBeInTheDocument();
  });

  it('carries the CC-CEDICT attribution', async () => {
    renderPage();
    expect(await screen.findByText(/CC-CEDICT/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 4.0/)).toBeInTheDocument();
  });

  it('changes the suggestion language', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Suggestion language'), 'fr');
    await waitFor(async () => expect((await getSettings()).suggestionLanguage).toBe('fr'));
  });

  it('carries the CFDICT attribution', async () => {
    renderPage();
    expect(await screen.findByText(/CFDICT/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 3.0/)).toBeInTheDocument();
  });

  it('offers backup export and import', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Export backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeInTheDocument();
  });

  describe('export failures', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a message when export throws instead of failing silently', async () => {
      const user = userEvent.setup();
      vi.spyOn(backupModule, 'exportBackup').mockRejectedValueOnce(new Error('disk is on fire'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Export backup' }));

      expect(await screen.findByText('disk is on fire')).toBeInTheDocument();
    });
  });

  describe('restoring a backup', () => {
    let importSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      importSpy = vi.spyOn(backupModule, 'importBackup');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not touch the database when the user cancels the confirm dialog', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await createDeck({ name: 'Keep me', directions: ['hanzi-meaning'] });

      renderPage();
      const input = await screen.findByLabelText('Backup file');
      const file = new File(['{"version":1,"decks":[]}'], 'backup.json', {
        type: 'application/json',
      });
      await user.upload(input, file);

      expect(confirmSpy).toHaveBeenCalled();
      expect(importSpy).not.toHaveBeenCalled();
      expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['Keep me']);
    });

    it('restores real data and shows a success message on a valid backup', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      // Seed data, export it as a genuine backup, then wipe the database so
      // the import has to actually restore it rather than being a no-op.
      const seedDeckId = await createDeck({ name: 'Source deck', directions: ['hanzi-meaning'] });
      const json = await exportBackup();
      await db.decks.clear();
      expect(await db.decks.get(seedDeckId)).toBeUndefined();

      renderPage();
      const input = await screen.findByLabelText('Backup file');
      const file = new File([json], 'backup.json', { type: 'application/json' });
      await user.upload(input, file);

      expect(await screen.findByText('Backup restored.')).toBeInTheDocument();
      const decks = await db.decks.toArray();
      expect(decks.map((d) => d.name)).toEqual(['Source deck']);
    });

    it('shows an error and leaves existing data intact on a corrupt file', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await createDeck({ name: 'Untouched', directions: ['hanzi-meaning'] });

      renderPage();
      const input = await screen.findByLabelText('Backup file');
      const file = new File(['not json at all'], 'backup.json', { type: 'application/json' });
      await user.upload(input, file);

      expect(await screen.findByText('That file is not a Chinanki backup')).toBeInTheDocument();
      expect((await db.decks.toArray()).map((d) => d.name)).toEqual(['Untouched']);
    });
  });
});
