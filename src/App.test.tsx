import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { saveSettings } from '@/lib/db/settings';
import App from '@/App';

const originalMatchMedia = window.matchMedia;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
  window.matchMedia = originalMatchMedia;
});

function stubMatchMedia(matches: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

describe('App', () => {
  it('renders the deck list at the root route', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Decks' })).toBeInTheDocument();
  });

  it('renders the bottom navigation', async () => {
    render(<App />);
    expect(await screen.findByRole('link', { name: /Stats/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown route', async () => {
    window.history.pushState({}, '', '/nope');
    render(<App />);
    expect(await screen.findByText(/Page not found/)).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('applies the dark class to <html> when the theme is dark', async () => {
    await saveSettings({ theme: 'dark' });
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('does not apply the dark class to <html> when the theme is light', async () => {
    await saveSettings({ theme: 'light' });
    document.documentElement.classList.add('dark');
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
  });

  it('resolves the dark class from the OS preference when the theme is "system"', async () => {
    stubMatchMedia(true);
    await saveSettings({ theme: 'system' });
    render(<App />);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });

  it('does not apply the dark class for "system" when the OS prefers light', async () => {
    stubMatchMedia(false);
    await saveSettings({ theme: 'system' });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Decks' })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
