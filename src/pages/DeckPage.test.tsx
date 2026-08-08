import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import DeckPage from '@/pages/DeckPage';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'HSK 1', directions: ['hanzi-meaning', 'hanzi-pinyin'] });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}`]}>
      <Routes>
        <Route path="/deck/:deckId" element={<DeckPage />} />
        <Route path="/deck/:deckId/study" element={<p>Studying</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DeckPage', () => {
  it('shows the deck name and its counts', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'HSK 1' })).toBeInTheDocument();
    expect(await screen.findByTestId('count-new')).toHaveTextContent('2');
  });

  it('enables Study when something is due', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();
    const study = await screen.findByRole('button', { name: /Study/ });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(study).not.toBeDisabled();
  });

  it('tells the user when the deck is finished for now', async () => {
    renderPage();
    expect(await screen.findByText(/Nothing due/)).toBeInTheDocument();
  });

  it('navigates to the study screen', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Study/ }));
    expect(await screen.findByText('Studying')).toBeInTheDocument();
  });
});
