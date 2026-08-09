import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck } from '@/lib/db/decks';
import { createNote } from '@/lib/db/notes';
import { clearDictionaryCache, setDictionaryFetch } from '@/lib/dictionary';
import NoteEditorPage from '@/pages/NoteEditorPage';

let deckId: number;

const ENTRIES = [
  { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good', 'well'] } },
  { simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] } },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
  deckId = await createDeck({ name: 'Test', directions: ['hanzi-meaning'] });
  clearDictionaryCache();
  setDictionaryFetch(
    vi.fn(async () => ({ ok: true, json: async () => ENTRIES }) as Response) as typeof fetch,
  );
});

function renderNew() {
  return render(
    <MemoryRouter initialEntries={[`/deck/${deckId}/note/new`]}>
      <Routes>
        <Route path="/deck/:deckId/note/new" element={<NoteEditorPage />} />
        <Route path="/deck/:deckId" element={<p>Deck page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NoteEditorPage: creating', () => {
  it('saves a note and returns to the deck', async () => {
    const user = userEvent.setup();
    renderNew();

    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.type(screen.getByLabelText('Pinyin'), 'hǎo');
    await user.type(screen.getByLabelText('Meaning'), 'good');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Deck page')).toBeInTheDocument();
    expect(await db.notes.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
  });

  it('offers dictionary suggestions as the user types hanzi', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Hanzi'), '好');
    expect(await screen.findByRole('button', { name: /好人/ })).toBeInTheDocument();
  });

  it('fills pinyin and meaning from a chosen suggestion', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(await screen.findByRole('button', { name: /好人/ }));

    await waitFor(() => expect(screen.getByLabelText('Hanzi')).toHaveValue('好人'));
    expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén');
    expect(screen.getByLabelText('Meaning')).toHaveValue('good person');
  });

  it('replaces pinyin and meaning when a different suggestion is picked', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Hanzi'), '好');

    await user.click(await screen.findByRole('button', { name: /好人/ }));
    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén'));

    // The suggestion list narrows to entries starting with the picked hanzi
    // ('好人'), so the '好' suggestion is no longer on screen. Retype '好' to
    // get back to a state where a different suggestion can be picked.
    await user.clear(screen.getByLabelText('Hanzi'));
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(await screen.findByRole('button', { name: /good; well/ }));

    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo'));
    expect(screen.getByLabelText('Meaning')).toHaveValue('good; well');
  });

  it('overwrites values the user typed by hand', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Meaning'), 'my own gloss');
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(await screen.findByRole('button', { name: /好人/ }));

    await waitFor(() => expect(screen.getByLabelText('Pinyin')).toHaveValue('hǎo rén'));
    expect(screen.getByLabelText('Meaning')).toHaveValue('good person');
  });

  it('shows the error when the word is already in the deck', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderNew();

    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.type(screen.getByLabelText('Meaning'), 'good');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/already in this deck/)).toBeInTheDocument();
  });

  it('reports a missing meaning', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText('Hanzi'), '好');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Meaning is required')).toBeInTheDocument();
  });
});

describe('NoteEditorPage: editing', () => {
  it('loads the note and saves changes', async () => {
    const user = userEvent.setup();
    const noteId = await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });

    render(
      <MemoryRouter initialEntries={[`/note/${noteId}`]}>
        <Routes>
          <Route path="/note/:noteId" element={<NoteEditorPage />} />
          <Route path="/deck/:deckId" element={<p>Deck page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('Hanzi')).toHaveValue('好'));
    await user.clear(screen.getByLabelText('Meaning'));
    await user.type(screen.getByLabelText('Meaning'), 'good; fine');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect((await db.notes.get(noteId))?.meaning).toBe('good; fine'));
  });

  it('shows an error state instead of a permanent blank page when the note no longer exists', async () => {
    render(
      <MemoryRouter initialEntries={['/note/999999']}>
        <Routes>
          <Route path="/note/:noteId" element={<NoteEditorPage />} />
          <Route path="/" element={<p>Deck list</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Couldn't load this word/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Deck list')).toBeInTheDocument();
  });
});
