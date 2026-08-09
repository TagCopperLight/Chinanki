import Button from '@/components/Button';
import DrawingCanvas from '@/components/DrawingCanvas';
import { isEmpty, undoLastStroke, type Stroke } from '@/lib/writing/strokes';

/**
 * The drawing box for one character of the answer. Deliberately blank — the
 * character is what the learner is trying to recall — and controlled, because
 * the footer's primary button depends on which character is showing.
 */
export default function WritingPrompt({
  count,
  index,
  strokes,
  onStrokesChange,
}: {
  count: number;
  index: number;
  /** One entry per character of the answer, in order. */
  strokes: Stroke[][];
  onStrokesChange: (index: number, strokes: Stroke[]) => void;
}) {
  const current = strokes[index] ?? [];
  const blank = isEmpty(current);

  return (
    <div className="flex flex-col items-center gap-2" data-testid="writing-prompt">
      <div className="aspect-square w-64 max-w-[70vw] rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
        <DrawingCanvas
          label={`Draw character ${index + 1} of ${count}`}
          strokes={current}
          onStrokesChange={(next) => onStrokesChange(index, next)}
          className="h-full w-full text-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="flex w-64 max-w-[70vw] items-center justify-between">
        <Button
          variant="ghost"
          disabled={blank}
          onClick={() => onStrokesChange(index, undoLastStroke(current))}
        >
          Undo stroke
        </Button>
        <span className="text-xs tabular-nums text-slate-500" data-testid="writing-progress">
          {index + 1} / {count}
        </span>
        <Button variant="ghost" disabled={blank} onClick={() => onStrokesChange(index, [])}>
          Clear
        </Button>
      </div>
    </div>
  );
}
