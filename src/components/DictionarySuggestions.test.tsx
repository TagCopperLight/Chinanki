import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DictionarySuggestions from '@/components/DictionarySuggestions';
import { db } from '@/lib/db';
import { saveSettings } from '@/lib/db';
import { clearDictionaryCache, setDictionaryFetch } from '@/lib/dictionary';

const ENTRIES = [
  { simplified: '好', traditional: '好', pinyin: 'hǎo', meanings: { en: ['good'], fr: ['bon'] } },
  { simplified: '好人', traditional: '好人', pinyin: 'hǎo rén', meanings: { en: ['good person'] } },
  { simplified: '好客', traditional: '好客', pinyin: 'hào kè', meanings: { fr: ['hospitalier'] } },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearDictionaryCache();
  setDictionaryFetch(
    vi.fn(async () => ({ ok: true, json: async () => ENTRIES }) as Response) as typeof fetch,
  );
});

describe('DictionarySuggestions', () => {
  it('shows English glosses by default, unbadged', async () => {
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('good')).toBeInTheDocument();
    // Nothing fell back *to* English, so no row carries an "en" badge — the
    // French-only 好客 row does carry an "fr" one.
    expect(screen.queryByText('en')).not.toBeInTheDocument();
  });

  it('shows French glosses when French is chosen', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('bon')).toBeInTheDocument();
  });

  it('badges a row that fell back to the other language', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('good person')).toBeInTheDocument();
    expect(screen.getByText('en')).toBeInTheDocument();
  });

  it('falls back to French for an English reader when there is no English', async () => {
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    expect(await screen.findByText('hospitalier')).toBeInTheDocument();
    expect(screen.getByText('fr')).toBeInTheDocument();
  });

  it('names the fallback language in full for assistive tech, not just the badge letters', async () => {
    render(<DictionarySuggestions query="好" onPick={vi.fn()} />);
    // 好客 is French-only, so English-language readers fall back to it and
    // get an "fr" badge. The badge must not read as a bare "fr" text node
    // inside the button's accessible name.
    expect(await screen.findByText('hospitalier')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /好客.*shown in French/ }),
    ).toBeInTheDocument();
  });

  it('passes the resolved meaning to onPick', async () => {
    await saveSettings({ suggestionLanguage: 'fr' });
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<DictionarySuggestions query="好" onPick={onPick} />);

    await user.click(await screen.findByRole('button', { name: /bon/ }));
    expect(onPick).toHaveBeenCalledWith(ENTRIES[0], 'bon');
  });
});
