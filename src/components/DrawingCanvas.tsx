import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  beginStroke,
  extendStroke,
  normalise,
  strokePath,
  type Stroke,
} from '@/lib/writing';

/** How faint the correct character sits behind the learner's own strokes. */
const GHOST_ALPHA = 0.3;
/** Stroke width and ghost size, as fractions of the box. */
const LINE_WIDTH = 0.045;
const GHOST_SIZE = 0.85;

/**
 * Paints a set of normalised strokes, optionally over a ghosted character, and
 * captures new ones from pointer input. The same component renders the study
 * box and — with `readOnly` — every cell of the reveal row.
 */
export default function DrawingCanvas({
  strokes,
  onStrokesChange,
  ghost,
  ghostColour,
  readOnly = false,
  label,
  className = '',
}: {
  strokes: Stroke[];
  onStrokesChange?: (strokes: Stroke[]) => void;
  /** Character painted behind the strokes; omit for a blank box. */
  ghost?: string;
  /** Defaults to the canvas's own text colour. */
  ghostColour?: string;
  readOnly?: boolean;
  label: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The pointer currently mid-stroke, or null between strokes. A stroke
  // belongs to exactly one pointer, so a second contact (e.g. palm while
  // writing with a stylus) must not touch it — hence tracking the id, not
  // just a drawing/not-drawing flag. A ref, not state: it must not re-render.
  const activePointerId = useRef<number | null>(null);
  const [size, setSize] = useState(0);

  // The bitmap has to follow the CSS box, or the strokes land offset from the
  // finger and blur on high-density screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      setSize(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === 0) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    const ink = getComputedStyle(canvas).color;

    if (ghost) {
      context.save();
      context.globalAlpha = GHOST_ALPHA;
      context.fillStyle = ghostColour ?? ink;
      context.font = `${size * GHOST_SIZE}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(ghost, size / 2, size / 2);
      context.restore();
    }

    const width = size * LINE_WIDTH;
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    for (const stroke of strokes) {
      const path = strokePath(stroke, size);
      if (!path) continue;
      context.beginPath();
      if (path.segments.length === 0) {
        // A tap, not a drag: a line with no length draws nothing, so dot it.
        context.arc(path.start.x, path.start.y, width / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.moveTo(path.start.x, path.start.y);
      for (const segment of path.segments) {
        context.quadraticCurveTo(segment.control.x, segment.control.y, segment.end.x, segment.end.y);
      }
      context.stroke();
    }
  }, [strokes, ghost, ghostColour, size]);

  if (readOnly) {
    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={`pointer-events-none ${className}`}
      />
    );
  }

  function pointOf(event: PointerEvent<HTMLCanvasElement>) {
    return normalise(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      // touch-none, or drawing scrolls the page instead of marking the box.
      className={`touch-none ${className}`}
      onPointerDown={(event) => {
        // Ignore a second pointer touching down mid-stroke instead of
        // starting a new stroke over the one in progress.
        if (activePointerId.current !== null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointerId.current = event.pointerId;
        onStrokesChange?.(beginStroke(strokes, pointOf(event)));
      }}
      onPointerMove={(event) => {
        if (event.pointerId !== activePointerId.current) return;
        onStrokesChange?.(extendStroke(strokes, pointOf(event)));
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== activePointerId.current) return;
        activePointerId.current = null;
      }}
      onPointerCancel={(event) => {
        if (event.pointerId !== activePointerId.current) return;
        activePointerId.current = null;
      }}
    />
  );
}
