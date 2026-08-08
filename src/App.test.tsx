import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import App from '@/App';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

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
});
