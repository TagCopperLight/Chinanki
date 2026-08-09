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

  it('ignores moves from a pointer after that same pointer has lifted', () => {
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

  it('keeps drawing with the active pointer after a stray cancel from another pointer', () => {
    const onStrokesChange = vi.fn();
    const { rerender } = render(
      <DrawingCanvas strokes={[]} onStrokesChange={onStrokesChange} label="Draw" />,
    );
    const canvas = screen.getByRole('img', { name: 'Draw' });
    canvas.setPointerCapture = () => {};
    // jsdom reports a zero-size rect by default, which would normalise every
    // point to the same (0, 0) and hide any growth in the stroke.
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    const strokesAfterDown = onStrokesChange.mock.calls[0]![0];
    rerender(<DrawingCanvas strokes={strokesAfterDown} onStrokesChange={onStrokesChange} label="Draw" />);

    // A stray cancel from a pointer that never started a stroke (e.g. a palm
    // touch) must not tear down pointer 1's in-progress stroke.
    fireEvent.pointerCancel(canvas, { pointerId: 2 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 });

    expect(onStrokesChange).toHaveBeenCalledTimes(2);
    const strokesAfterMove = onStrokesChange.mock.calls[1]![0];
    expect(strokesAfterMove).toHaveLength(1);
    expect(strokesAfterMove[0].length).toBeGreaterThan(strokesAfterDown[0].length);
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
