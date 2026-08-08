import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck, updateDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
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

  it('rejects a blank name, shows an error and restores the last saved value', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText('Name');
    await user.clear(input);
    await user.tab();

    expect(await screen.findByText(/Deck name is required/)).toBeInTheDocument();
    const deck = await db.decks.get(deckId);
    expect(deck?.name).toBe('HSK 1');
  });

  it('saves a trimmed name', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText('Name');
    await user.clear(input);
    await user.type(input, '  HSK 2  ');
    await user.tab();

    await waitFor(async () => expect((await db.decks.get(deckId))?.name).toBe('HSK 2'));
  });

  describe('disabling a direction', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cancelling the confirm leaves cards and directions unchanged', async () => {
      const user = userEvent.setup();
      const noteId = await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
      await updateDeck(deckId, { directions: ['hanzi-meaning', 'hanzi-pinyin'] });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderPage();

      const checkbox = await screen.findByRole('checkbox', { name: '汉字 → Pinyin' });
      await user.click(checkbox);

      expect(confirmSpy).toHaveBeenCalled();
      expect(checkbox).toBeChecked();
      const deck = await db.decks.get(deckId);
      expect(deck?.directions.slice().sort()).toEqual(['hanzi-meaning', 'hanzi-pinyin']);
      const cards = await db.cards.where('noteId').equals(noteId).toArray();
      expect(cards.map((c) => c.direction).sort()).toEqual(['hanzi-meaning', 'hanzi-pinyin']);
    });

    it('accepting the confirm deletes only that direction, only in this deck', async () => {
      const user = userEvent.setup();
      const otherDeckId = await createDeck({
        name: 'Other deck',
        directions: ['hanzi-meaning', 'hanzi-pinyin'],
      });
      const noteId = await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
      const otherNoteId = await createNote({
        deckId: otherDeckId,
        hanzi: '水',
        pinyin: 'shuǐ',
        meaning: 'water',
      });
      await updateDeck(deckId, { directions: ['hanzi-meaning', 'hanzi-pinyin'] });

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderPage();

      const checkbox = await screen.findByRole('checkbox', { name: '汉字 → Pinyin' });
      await user.click(checkbox);

      await waitFor(async () => {
        const deck = await db.decks.get(deckId);
        expect(deck?.directions).toEqual(['hanzi-meaning']);
      });
      const cards = await db.cards.where('noteId').equals(noteId).toArray();
      expect(cards.map((c) => c.direction)).toEqual(['hanzi-meaning']);
      const otherCards = await db.cards.where('noteId').equals(otherNoteId).toArray();
      expect(otherCards.map((c) => c.direction).sort()).toEqual(['hanzi-meaning', 'hanzi-pinyin']);
    });
  });

  describe('deleting the deck', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cancelling the confirm leaves the deck in place', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Delete deck' }));

      expect(await db.decks.get(deckId)).toBeDefined();
    });
  });
});
