import type { HeatmapDay } from '@/lib/stats';

const LEVEL_CLASSES = [
  'bg-slate-200 dark:bg-slate-700',
  'bg-green-200 dark:bg-green-900',
  'bg-green-400 dark:bg-green-700',
  'bg-green-500 dark:bg-green-600',
  'bg-green-600 dark:bg-green-500',
] as const;

/** Column-major grid of weeks, matching the familiar contribution-graph layout. */
export default function Heatmap({ days }: { days: HeatmapDay[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {days.map((day) => (
          <div
            key={day.date}
            data-testid="heatmap-cell"
            data-level={day.level}
            title={`${day.date}: ${day.count} review${day.count === 1 ? '' : 's'}`}
            className={`size-[10px] rounded-[2px] ${LEVEL_CLASSES[day.level]}`}
          />
        ))}
      </div>
    </div>
  );
}
