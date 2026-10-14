import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import WritingAnswer from '@/components/WritingAnswer';
import { drawableCharacters } from '@/lib/writing';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const CHARACTERS = drawableCharacters('书店', 'shū diàn');

describe('WritingAnswer', () => {
  it('shows one cell per character, labelled with that character', async () => {
    render(
      <WritingAnswer characters={CHARACTERS} strokes={[[], []]} ghost onToggleGhost={vi.fn()} />,
    );
    expect(await screen.findByRole('img', { name: 'Your drawing of 书' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Your drawing of 店' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('reports the overlay state on the toggle and calls back when pressed', async () => {
    const user = userEvent.setup();
    const onToggleGhost = vi.fn();
    render(
      <WritingAnswer
        characters={CHARACTERS}
        strokes={[[], []]}
        ghost
        onToggleGhost={onToggleGhost}
      />,
    );
    const toggle = await screen.findByRole('button', { name: 'Overlay' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(onToggleGhost).toHaveBeenCalledTimes(1);
  });

  it('reports the overlay as off when it is hidden', async () => {
    render(
      <WritingAnswer
        characters={CHARACTERS}
        strokes={[[], []]}
        ghost={false}
        onToggleGhost={vi.fn()}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Overlay' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
