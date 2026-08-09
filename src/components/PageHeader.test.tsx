import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import PageHeader from '@/components/PageHeader';

function renderHeader(props: { title: string; backTo?: string }) {
  return render(
    <MemoryRouter initialEntries={['/deck/1']}>
      <PageHeader {...props} />
    </MemoryRouter>,
  );
}

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    renderHeader({ title: 'Statistics' });
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });

  it('omits the back control when there is nowhere to go back to', () => {
    renderHeader({ title: 'Statistics' });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('draws the back control as an svg icon that keeps the accessible name', () => {
    renderHeader({ title: 'HSK 1', backTo: '/' });

    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveAccessibleName('Back');
    expect(back.querySelector('svg')).toBeInTheDocument();
    expect(back.textContent).toBe('');
  });
});
