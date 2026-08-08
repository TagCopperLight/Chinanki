export default function StatCard({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex-1 rounded-xl bg-white p-3 text-center dark:bg-slate-800">
      <p data-testid={id} className="text-2xl font-bold">
        {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
