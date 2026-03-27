type AppDebugSectionProps = {
  lines: string[];
  facts: Array<{ label: string; value: string }>;
  onClear: () => void;
};

export default function AppDebugSection({ lines, facts, onClear }: AppDebugSectionProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Tijdelijke app-debug</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Tijdelijke logging voor de instellingenpagina tijdens het debuggen van iFrame en OAuth.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Wissen
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border border-amber-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{fact.label}</div>
            <div className="mt-1 break-all text-sm text-slate-800">{fact.value}</div>
          </div>
        ))}
      </div>
      <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {lines.length ? lines.join('\n') : 'Nog geen debugregels.'}
      </pre>
    </div>
  );
}
