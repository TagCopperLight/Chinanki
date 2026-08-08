import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import DeckSettingsPage from '@/pages/DeckSettingsPage';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'HSK 1', directions: ['hanzi-meaning'] });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}/settings`]}>
      <Routes>
        <Route path="/deck/:deckId/settings" element={<DeckSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DeckSettingsPage', () => {
  it('refuses to disable the only remaining direction and keeps the checkbox checked', async () => {
    const user = userEvent.setup();
    renderPage();

    const checkbox = await screen.findByRole('checkbox', { name: '汉字 → Meaning' });
    await user.click(checkbox);

    expect(await screen.findByText(/at least one card direction/i)).toBeInTheDocument();
    expect(checkbox).toBeChecked();
    const deck = await db.decks.get(deckId);
    expect(deck?.directions).toEqual(['hanzi-meaning']);
  });

  it('rejects a blank desired retention and restores the last saved value', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/Desired retention/);
    await user.clear(input);
    await user.tab();

    expect(await screen.findByText(/must be between/i)).toBeInTheDocument();
    const deck = await db.decks.get(deckId);
    expect(deck?.config.desiredRetention).toBeGreaterThanOrEqual(0.7);
    expect(deck?.config.desiredRetention).toBeLessThanOrEqual(0.98);
    expect((input as HTMLInputElement).value).toBe(String(deck?.config.desiredRetention));
  });

  it('rejects a blank learning steps value and restores the last saved value', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText(/Learning steps/i);
    const savedValue = (input as HTMLInputElement).value;
    await user.clear(input);
    await user.tab();

    expect(await screen.findByText(/at least one positive learning step/i)).toBeInTheDocument();
    const deck = await db.decks.get(deckId);
    expect(deck?.config.learningSteps.length).toBeGreaterThan(0);
    expect(deck?.config.learningSteps.every((n) => n > 0)).toBe(true);
    expect((input as HTMLInputElement).value).toBe(savedValue);
  });
});
