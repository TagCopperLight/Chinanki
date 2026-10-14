import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { db } from '@/lib/db';
import { createDeck } from '@/lib/db';
import { createNote } from '@/lib/db';
import StatsPage from '@/pages/StatsPage';

let deckId: number;

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'HSK 1', directions: ['hanzi-meaning'] });
});

/** Adds `count` review-state answers, `correct` of which were not "Again". */
async function addReviews(count: number, correct: number, at = Date.now()) {
  for (let index = 0; index < count; index++) {
    await db.reviews.add({
      cardId: 1, noteId: 1, deckId, direction: 'hanzi-meaning',
      rating: index < correct ? 3 : 1,
      stateBefore: 'review', stateAfter: 'review', reviewedAt: at,
      elapsedDays: 3, scheduledDays: 6, stabilityAfter: 6, difficultyAfter: 5, durationMs: 2000,
    });
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  );
}

describe('StatsPage', () => {
  it('shows an empty state before any reviews exist', async () => {
    renderPage();
    expect(await screen.findByText(/No reviews yet/)).toBeInTheDocument();
  });

  it('shows the streak, reviews today and retention', async () => {
    await addReviews(10, 9);
    renderPage();
    expect(await screen.findByTestId('stat-streak')).toHaveTextContent('1');
    expect(await screen.findByTestId('stat-today')).toHaveTextContent('10');
    expect(await screen.findByTestId('stat-retention')).toHaveTextContent('90%');
  });

  it('renders one heatmap cell per day in the window', async () => {
    await addReviews(3, 3);
    renderPage();
    const cells = await screen.findAllByTestId('heatmap-cell');
    expect(cells).toHaveLength(182);
  });

  it('shows the card breakdown', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    await addReviews(1, 1);
    renderPage();
    expect(await screen.findByTestId('breakdown-new')).toHaveTextContent('1');
  });

  it('scopes the figures to a chosen deck', async () => {
    const other = await createDeck({ name: 'Other' });
    await addReviews(10, 10);
    await db.reviews.add({
      cardId: 2, noteId: 2, deckId: other, direction: 'hanzi-meaning', rating: 1,
      stateBefore: 'review', stateAfter: 'relearning', reviewedAt: Date.now(),
      elapsedDays: 1, scheduledDays: 0, stabilityAfter: 1, difficultyAfter: 7, durationMs: 500,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('stat-today');

    await user.selectOptions(screen.getByLabelText('Deck'), String(deckId));
    expect(await screen.findByTestId('stat-today')).toHaveTextContent('10');
    expect(await screen.findByTestId('stat-retention')).toHaveTextContent('100%');
  });
});
