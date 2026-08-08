import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export default function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const hintId = useId();

  const child =
    hint && isValidElement(children)
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby':
            [(children as ReactElement<{ 'aria-describedby'?: string }>).props['aria-describedby'], hintId]
              .filter(Boolean)
              .join(' ') || undefined,
        })
      : children;

  return (
    <div className="block">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          {label}
        </span>
        {child}
      </label>
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-slate-500">
          {hint}
        </span>
      )}
    </div>
  );
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base ' +
  'text-slate-900 outline-none focus:border-sky-500 dark:border-slate-600 ' +
  'dark:bg-slate-800 dark:text-slate-100';
