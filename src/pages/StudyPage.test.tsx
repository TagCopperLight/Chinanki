import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import StudyPage from '@/pages/StudyPage';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning'] });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}/study`]}>
      <Routes>
        <Route path="/deck/:deckId/study" element={<StudyPage />} />
        <Route path="/deck/:deckId" element={<p>Deck page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudyPage', () => {
  it('shows the prompt field and hides the answer', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();
    expect(await screen.findByTestId('prompt')).toHaveTextContent('好');
    expect(screen.queryByTestId('answer')).not.toBeInTheDocument();
  });

  it('reveals the answer, including every field', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    const answer = await screen.findByTestId('answer');
    expect(answer).toHaveTextContent('good');
    expect(answer).toHaveTextContent('hǎo');
  });

  it('shows all four rating buttons with their intervals once revealed', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it('advances to the next card after rating', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '一', pinyin: 'yī', meaning: 'one' });
    await createNote({ deckId, hanzi: '二', pinyin: 'èr', meaning: 'two' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    await user.click(await screen.findByRole('button', { name: /Easy/ }));

    await waitFor(() => expect(screen.getByTestId('prompt')).toHaveTextContent('二'));
    expect(screen.queryByTestId('answer')).not.toBeInTheDocument();
  });

  it('congratulates the user when the queue empties', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    await user.click(await screen.findByRole('button', { name: /Easy/ }));

    expect(await screen.findByText(/All done/)).toBeInTheDocument();
  });

  it('shows the finished state immediately for an empty deck', async () => {
    renderPage();
    expect(await screen.findByText(/All done/)).toBeInTheDocument();
  });

  it('undoes the last answer', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    await user.click(await screen.findByRole('button', { name: /Easy/ }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(screen.getByTestId('prompt')).toHaveTextContent('好'));
    expect(await db.reviews.count()).toBe(0);
  });

  it('records a review with the chosen rating', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    await user.click(await screen.findByRole('button', { name: /Again/ }));

    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs[0]?.rating).toBe(1);
    });
  });
});
