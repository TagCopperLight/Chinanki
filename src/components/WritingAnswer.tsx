import { Eye, EyeOff } from 'lucide-react';
import DrawingCanvas from '@/components/DrawingCanvas';
import { useSettings } from '@/hooks/useSettings';
import type { DrawableCharacter } from '@/lib/writing';
import type { Stroke } from '@/lib/writing';

/**
 * The reveal: each drawing with the correct character ghosted behind it. The
 * overlay can be switched off for every cell at once, to look at one's own
 * writing unobstructed.
 */
export default function WritingAnswer({
  characters,
  strokes,
  ghost,
  onToggleGhost,
}: {
  characters: DrawableCharacter[];
  strokes: Stroke[][];
  ghost: boolean;
  onToggleGhost: () => void;
}) {
  const { settings } = useSettings();

  return (
    <div className="space-y-2" data-testid="writing-answer">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onToggleGhost}
          aria-pressed={ghost}
          className="flex min-h-11 items-center gap-2 px-3 text-sm text-slate-500"
        >
          {ghost ? <Eye size={16} /> : <EyeOff size={16} />}
          Overlay
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {characters.map((item, index) => (
          <div
            key={index}
            className="aspect-square w-20 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <DrawingCanvas
              readOnly
              label={`Your drawing of ${item.character}`}
              strokes={strokes[index] ?? []}
              ghost={ghost ? item.character : undefined}
              // The tone is already revealed here, so colouring the ghost
              // gives nothing away.
              ghostColour={
                settings.colourHanzi && item.tone !== null
                  ? settings.toneColours[item.tone]
                  : undefined
              }
              className="h-full w-full text-slate-900 dark:text-slate-100"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
