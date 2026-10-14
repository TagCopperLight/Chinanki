import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WritingPrompt from '@/components/WritingPrompt';
import type { Stroke } from '@/lib/writing';

const ONE_STROKE: Stroke[] = [[{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }]];

describe('WritingPrompt', () => {
  it('shows the position within the word', () => {
    render(<WritingPrompt count={3} index={1} strokes={[[], [], []]} onStrokesChange={vi.fn()} />);
    expect(screen.getByTestId('writing-progress')).toHaveTextContent('2 / 3');
  });

  it('gives the box a label naming the character being drawn', () => {
    render(<WritingPrompt count={2} index={0} strokes={[[], []]} onStrokesChange={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Draw character 1 of 2' })).toBeInTheDocument();
  });

  it('disables the controls until something is drawn', () => {
    render(<WritingPrompt count={1} index={0} strokes={[[]]} onStrokesChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('undoes the last stroke of the current character', async () => {
    const user = userEvent.setup();
    const onStrokesChange = vi.fn();
    render(
      <WritingPrompt count={2} index={1} strokes={[[], ONE_STROKE]} onStrokesChange={onStrokesChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Undo stroke' }));
    expect(onStrokesChange).toHaveBeenCalledWith(1, []);
  });

  it('clears the current character', async () => {
    const user = userEvent.setup();
    const onStrokesChange = vi.fn();
    render(
      <WritingPrompt count={1} index={0} strokes={[ONE_STROKE]} onStrokesChange={onStrokesChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onStrokesChange).toHaveBeenCalledWith(0, []);
  });
});
