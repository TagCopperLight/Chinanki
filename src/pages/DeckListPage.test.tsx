import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { db } from '@/lib/db';
import { createDeck } from '@/lib/db';
import { createNote } from '@/lib/db';
import DeckListPage from '@/pages/DeckListPage';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DeckListPage />
    </MemoryRouter>,
  );
}

describe('DeckListPage', () => {
  it('invites the user to create a deck when there are none', async () => {
    renderPage();
    expect(await screen.findByText(/No decks yet/)).toBeInTheDocument();
  });

  it('lists decks with their due counts', async () => {
    const deckId = await createDeck({ name: 'HSK 1', directions: ['hanzi-meaning'] });
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    expect(await screen.findByText('HSK 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId(`new-count-${deckId}`)).toHaveTextContent('1'));
  });

  it('creates a deck from the dialog', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'New deck' }));
    await user.type(screen.getByLabelText('Deck name'), 'Kitchen words');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Kitchen words')).toBeInTheDocument();
  });

  it('refuses to create a deck with a blank name', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'New deck' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Deck name is required')).toBeInTheDocument();
    expect(await db.decks.count()).toBe(0);
  });

  it('clears the name and error when the create dialog is cancelled', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'New deck' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Deck name is required')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(await screen.findByRole('button', { name: 'New deck' }));
    expect(screen.queryByText('Deck name is required')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Deck name')).toHaveValue('');
  });
});
