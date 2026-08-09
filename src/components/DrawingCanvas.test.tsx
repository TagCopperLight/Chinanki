import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DrawingCanvas from '@/components/DrawingCanvas';

describe('DrawingCanvas', () => {
  it('renders a labelled canvas', () => {
    render(<DrawingCanvas strokes={[]} label="Draw character 1 of 2" />);
    const canvas = screen.getByRole('img', { name: 'Draw character 1 of 2' });
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('starts a stroke on pointer down', () => {
    const onStrokesChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />);
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    expect(onStrokesChange.mock.calls[0]![0]).toHaveLength(1);
  });

  it('ignores pointer movement until a stroke has started', () => {
    const onStrokesChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />);
    fireEvent.pointerMove(screen.getByRole('img', { name: 'Draw' }), {
      pointerId: 1,
      clientX: 5,
      clientY: 5,
    });
    expect(onStrokesChange).not.toHaveBeenCalled();
  });

  it('ignores a second pointer touching down mid-stroke', () => {
    const onStrokesChange = vi.fn();
    render(<DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />);
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 10, clientY: 10 });
    // Only the first pointer's down should have started a stroke.
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
    expect(onStrokesChange.mock.calls[0]![0]).toHaveLength(1);
  });

  it('ignores pointer moves from a pointer that did not start the stroke', () => {
    const onStrokesChange = vi.fn();
    const { rerender } = render(
      <DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />,
    );
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    const strokesAfterDown = onStrokesChange.mock.calls[0]![0];
    rerender(<DrawingCanvas strokes={strokesAfterDown} onStrokesChange={onStrokesChange} label="Draw" />);

    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 5, clientY: 5 });
    // The move came from a different pointer than the one that started the
    // stroke, so it must not extend it.
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
  });

  it('ignores later moves once the active pointer has lifted', () => {
    const onStrokesChange = vi.fn();
    const { rerender } = render(
      <DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />,
    );
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    const strokesAfterDown = onStrokesChange.mock.calls[0]![0];
    rerender(<DrawingCanvas strokes={strokesAfterDown} onStrokesChange={onStrokesChange} label="Draw" />);

    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    expect(onStrokesChange).toHaveBeenCalledTimes(1);
  });

  it('takes no pointer input when read-only', () => {
    const onStrokesChange = vi.fn();
    render(
      <DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} readOnly label="Your drawing" />,
    );
    const canvas = screen.getByRole('img', { name: 'Your drawing' });
    canvas.setPointerCapture = () => {};
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(onStrokesChange).not.toHaveBeenCalled();
  });
});
