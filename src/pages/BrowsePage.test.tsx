import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import BrowsePage from '@/pages/BrowsePage';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning', 'hanzi-pinyin'] });
  await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
  await createNote({ deckId, hanzi: '水', pinyin: 'shuǐ', meaning: 'water' });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}/browse`]}>
      <Routes>
        <Route path="/deck/:deckId/browse" element={<BrowsePage />} />
        <Route path="/note/:noteId" element={<p>Note editor</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BrowsePage', () => {
  it('lists every note in the deck', async () => {
    renderPage();
    expect(await screen.findByText('好')).toBeInTheDocument();
    expect(screen.getByText('水')).toBeInTheDocument();
  });

  it('filters by hanzi, pinyin or meaning', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('好');

    await user.type(screen.getByRole('searchbox'), 'water');
    await waitFor(() => expect(screen.queryByText('好')).not.toBeInTheDocument());
    expect(screen.getByText('水')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'shuǐ');
    await waitFor(() => expect(screen.getByText('水')).toBeInTheDocument());
  });

  it('reports how many notes match', async () => {
    renderPage();
    expect(await screen.findByText('2 words')).toBeInTheDocument();
  });

  it('opens a note for editing', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit 好' }));
    expect(await screen.findByText('Note editor')).toBeInTheDocument();
  });

  it('shows each note card state and lets the user suspend a card', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Cards for 好/ }));

    const suspend = await screen.findByRole('button', { name: /Suspend 汉字 → Meaning/ });
    await user.click(suspend);

    await waitFor(async () => {
      const cards = await db.cards.toArray();
      expect(cards.filter((card) => card.suspended === 1)).toHaveLength(1);
    });
  });

  it('resets a card back to new', async () => {
    const user = userEvent.setup();
    const note = (await db.notes.toArray())[0]!;
    const card = (await db.cards.where('noteId').equals(note.id!).toArray())[0]!;
    await db.cards.update(card.id!, { state: 'review', stability: 30, reps: 5 });

    renderPage();
    await user.click(await screen.findByRole('button', { name: new RegExp(`Cards for ${note.hanzi}`) }));
    await user.click((await screen.findAllByRole('button', { name: /^Reset/ }))[0]!);

    await waitFor(async () => expect((await db.cards.get(card.id!))?.state).toBe('new'));
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByRole('searchbox'), 'zzz');
    expect(await screen.findByText(/No matching words/)).toBeInTheDocument();
  });
});
