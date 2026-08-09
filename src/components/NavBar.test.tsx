import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import NavBar from '@/components/NavBar';

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>,
  );
}

describe('NavBar', () => {
  it('keeps a visible text label on every tab', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Decks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('draws an svg icon in each tab rather than an emoji character', () => {
    const { container } = renderNav();

    for (const name of ['Decks', 'Stats', 'Settings']) {
      const tab = screen.getByRole('link', { name });
      expect(tab.querySelector('svg')).toBeInTheDocument();
    }

    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('marks the icon decorative so the label alone names the tab', () => {
    renderNav();
    const tab = screen.getByRole('link', { name: 'Decks' });
    expect(tab.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(tab).toHaveAccessibleName('Decks');
  });
});
