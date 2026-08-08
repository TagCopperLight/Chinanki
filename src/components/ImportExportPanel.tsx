import { useRef, useState } from 'react';
import { downloadText, exportDeckCsv, importCsvIntoDeck, type ImportResult } from '@/lib/io';
import Button from '@/components/Button';

export default function ImportExportPanel({
  deckId,
  deckName,
}: {
  deckId: number;
  deckName: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File) {
    setResult(await importCsvIntoDeck(deckId, await file.text()));
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">Import / export</h2>
      <p className="text-xs text-slate-500">
        CSV columns: <code>hanzi,pinyin,meaning,notes</code>. A header row is optional.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => fileInput.current?.click()}>
          Import CSV
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () =>
            downloadText(`${deckName || 'deck'}.csv`, await exportDeckCsv(deckId))
          }
        >
          Export CSV
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="CSV file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
          event.target.value = '';
        }}
      />
      {result && (
        <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
          <p>
            Imported {result.imported}, skipped {result.skipped}.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-amber-600">
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
