import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description && <p className="text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}
