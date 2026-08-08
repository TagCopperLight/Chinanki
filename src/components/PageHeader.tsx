import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

export default function PageHeader({
  title,
  backTo,
  action,
}: {
  title: string;
  backTo?: string;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] dark:border-slate-700 dark:bg-slate-900">
      {backTo && (
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(backTo)}
          className="min-h-11 min-w-11 text-xl text-slate-500"
        >
          ←
        </button>
      )}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}
