import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { db } from '@/lib/db/db';
import { createDeck, updateDeck } from '@/lib/db/decks';
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

  it('does not colour the hanzi prompt by tone until the answer is revealed', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    const prompt = await screen.findByTestId('prompt');
    expect(prompt.querySelector('[data-tone]')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));

    await waitFor(() =>
      expect(screen.getByTestId('prompt').querySelector('[data-tone]')).not.toBeNull(),
    );
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

    // The deck has exactly one note, so rating it finishes the session. The
    // footer's own "Undo" button briefly stays in the DOM (disabled) while
    // rate()'s IndexedDB write is still in flight; querying for "Undo" before
    // that settles can grab that stale, disabled button instead of the real
    // one on the finished screen. Wait for the session to actually finish
    // before clicking Undo, so the click lands on the enabled button.
    await screen.findByText(/All done/);
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

  it('records the rating of a focused button activated via keyboard, not Good', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Show answer' }));
    const againButton = await screen.findByRole('button', { name: /Again/ });
    againButton.focus();
    await user.keyboard('{Enter}');

    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.rating).toBe(1);
    });
  });

  it('does not record a second review from an auto-repeated keydown', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show answer' }));

    // Simulate a held key: the browser fires repeat keydown events while the
    // key is down, all before the first rate() call's IndexedDB write resolves.
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });

    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
    });
  });

  it('does not record a second review from a fast double-click on a rating button', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show answer' }));
    const easyButton = await screen.findByRole('button', { name: /Easy/ });
    fireEvent.click(easyButton);
    fireEvent.click(easyButton);

    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
    });
  });

  it('still reveals and rates Good via Space/Enter when nothing specific is focused', async () => {
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    await screen.findByRole('button', { name: 'Show answer' });
    document.body.focus();
    fireEvent.keyDown(window, { key: 'Enter' });
    await screen.findByTestId('answer');
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.rating).toBe(3);
    });
  });

  it('shows an error state with a way back when the deck does not exist', async () => {
    render(
      <MemoryRouter initialEntries={['/deck/999999/study']}>
        <Routes>
          <Route path="/deck/:deckId/study" element={<StudyPage />} />
          <Route path="/" element={<p>Deck list</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Couldn't start this study session/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Back to decks' }));
    expect(await screen.findByText('Deck list')).toBeInTheDocument();
  });

  it('still allows Close and Undo buttons to be activated via keyboard', async () => {
    const user = userEvent.setup();
    await createNote({ deckId, hanzi: '好', pinyin: 'hǎo', meaning: 'good' });
    renderPage();

    const closeButton = await screen.findByRole('button', { name: 'Close' });
    closeButton.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Deck page')).toBeInTheDocument();
  });

  describe('writing cards', () => {
    // Every note must exist before renderPage(): StudySession.start snapshots
    // the queue, so a note added afterwards is not in this session.
    async function renderWritingCard(extra = false) {
      await updateDeck(deckId, { directions: ['meaning-hanzi'] });
      await createNote({ deckId, hanzi: '书店', pinyin: 'shū diàn', meaning: 'bookshop' });
      if (extra) {
        await createNote({ deckId, hanzi: '医院', pinyin: 'yī yuàn', meaning: 'hospital' });
      }
      renderPage();
      return userEvent.setup();
    }

    it('prompts with the meaning and offers a drawing box per character', async () => {
      await renderWritingCard();
      expect(await screen.findByTestId('prompt')).toHaveTextContent('bookshop');
      expect(await screen.findByTestId('writing-progress')).toHaveTextContent('1 / 2');
      expect(screen.queryByTestId('answer')).not.toBeInTheDocument();
    });

    it('advances through the characters before offering the answer', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      expect(await screen.findByTestId('writing-progress')).toHaveTextContent('2 / 2');
      expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('lets the answer be revealed from the first character', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      expect(await screen.findByTestId('answer')).toHaveTextContent('书店');
      expect(await screen.findByTestId('writing-answer')).toBeInTheDocument();
      expect(screen.getAllByRole('img', { name: /Your drawing of/ })).toHaveLength(2);
    });

    it('toggles the overlay off and on', async () => {
      const user = await renderWritingCard();
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      const toggle = await screen.findByRole('button', { name: 'Overlay' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await user.click(toggle);
      expect(screen.getByRole('button', { name: 'Overlay' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('starts the next card back at the first character with a clean box', async () => {
      const user = await renderWritingCard(true);

      // Draw on the first character so the reset has something to clear:
      // without it, "Undo stroke" would be disabled on the next card
      // regardless of whether drawings are actually reset.
      const canvas = await screen.findByRole('img', { name: 'Draw character 1 of 2' });
      canvas.setPointerCapture = () => {};
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
      expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();

      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      await user.click(await screen.findByRole('button', { name: /Easy/ }));

      await waitFor(() =>
        expect(screen.getByTestId('writing-progress')).toHaveTextContent('1 / 2'),
      );
      expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    });

    it('clears a drawing when the review is undone', async () => {
      // rate() already clears drawings on its own, so drawing on the first
      // card and then undoing proves nothing: by the time undo() runs there
      // is nothing left for it to clear. The only way to make undo's own
      // reset load-bearing is to draw on the *second* card (the one undo
      // navigates away from) and confirm that drawing does not leak onto the
      // restored first card.
      const user = await renderWritingCard(true);
      await user.click(await screen.findByRole('button', { name: 'Next' }));
      await user.click(await screen.findByRole('button', { name: 'Show answer' }));
      await user.click(await screen.findByRole('button', { name: /Easy/ }));

      await waitFor(() =>
        expect(screen.getByTestId('writing-progress')).toHaveTextContent('1 / 2'),
      );
      const secondCardCanvas = await screen.findByRole('img', { name: 'Draw character 1 of 2' });
      secondCardCanvas.setPointerCapture = () => {};
      fireEvent.pointerDown(secondCardCanvas, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerUp(secondCardCanvas, { pointerId: 1 });
      expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();

      await user.click(await screen.findByRole('button', { name: 'Undo' }));

      await waitFor(() => expect(screen.getByTestId('prompt')).toHaveTextContent('bookshop'));
      expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    });

    it('advances, reveals, and rates a writing card entirely by keyboard', async () => {
      await renderWritingCard();
      await screen.findByTestId('writing-progress');

      // Nothing is focused, so this Space must advance the character rather
      // than fall through to reveal or activate a button.
      fireEvent.keyDown(window, { key: ' ' });
      expect(await screen.findByTestId('writing-progress')).toHaveTextContent('2 / 2');
      expect(screen.queryByTestId('answer')).not.toBeInTheDocument();

      // On the last character, Space reveals instead of advancing further.
      fireEvent.keyDown(window, { key: ' ' });
      expect(await screen.findByTestId('answer')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: '3' });

      await waitFor(async () => {
        const logs = await db.reviews.toArray();
        expect(logs).toHaveLength(1);
        expect(logs[0]?.rating).toBe(3);
      });
    });
  });
});
