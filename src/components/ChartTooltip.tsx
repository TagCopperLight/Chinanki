/**
 * Recharts' default tooltip hardcodes a white surface and sets no text colour, so
 * in dark mode it renders white-on-white. This replaces it with a surface that
 * follows the app's theme. Recharts injects `active`, `label` and `payload` when
 * it clones the element passed to <Tooltip content={...}>.
 */
export type ChartTooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  stroke?: string;
};

export type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<ChartTooltipEntry>;
  /** Applied to numeric values only; non-numeric values render as-is. */
  formatValue?: (value: number) => string;
};

export default function ChartTooltip({ active, label, payload, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
      {label != null && (
        <p className="mb-1 text-slate-500 dark:text-slate-400">{label}</p>
      )}
      {payload.map((entry, index) => {
        const swatch = entry.color ?? entry.fill ?? entry.stroke;
        const value =
          typeof entry.value === 'number' && formatValue ? formatValue(entry.value) : entry.value;

        return (
          <p key={`${entry.name ?? 'series'}-${index}`} className="flex items-center gap-1.5">
            {swatch && (
              <span
                data-testid="tooltip-swatch"
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: swatch }}
              />
            )}
            <span className="text-slate-500 dark:text-slate-400">{entry.name}</span>
            <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
              {value}
            </span>
          </p>
        );
      })}
    </div>
  );
}
