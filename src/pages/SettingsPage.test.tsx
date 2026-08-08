import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { db } from '@/lib/db/db';
import { getSettings } from '@/lib/db/settings';
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

  it('offers backup export and import', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Export backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeInTheDocument();
  });
});
