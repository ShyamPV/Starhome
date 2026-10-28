import { useApp } from '../state/store';
import { CloseIcon } from './icons';

const PROVENANCE = {
  catalog: { label: 'Catalogue data', cls: 'text-teal border-teal/40 bg-teal/10' },
  ephemeris: { label: 'Ephemeris', cls: 'text-teal border-teal/40 bg-teal/10' },
  model: { label: 'Modeled', cls: 'text-amber border-amber/40 bg-amber/10' },
} as const;

/** Right-hand panel describing the selected object. */
export function InfoPanel() {
  const selected = useApp((s) => s.selected);
  const engine = useApp((s) => s.engine);
  if (!selected) return null;
  const prov = PROVENANCE[selected.provenance];

  return (
    <aside className="glass pointer-events-auto absolute top-20 right-4 z-20 flex max-h-[calc(100%-11rem)] w-80 flex-col overflow-hidden rounded-2xl" aria-label={`${selected.name} details`}>
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{selected.name}</h2>
          <p className="mt-0.5 text-xs text-ink-dim">{selected.subtitle}</p>
          <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${prov.cls}`}>{prov.label}</span>
        </div>
        <button onClick={() => engine?.select(null)} className="rounded-lg p-1 text-ink-dim hover:bg-white/5 hover:text-ink" aria-label="Close details">
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          {Object.entries(selected.details).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-faint">{k}</dt>
              <dd className="tabular text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {selected.facts.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-line pt-3 text-[13px] leading-snug text-ink-dim">
            {selected.facts.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-violet" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="border-t border-line p-3">
        <button
          onClick={() => engine?.flyTo(selected.id)}
          className="w-full rounded-xl bg-gradient-to-r from-violet-deep to-violet py-2 text-sm font-medium text-white shadow-[0_0_24px_-6px] shadow-violet/60 transition hover:brightness-110"
        >
          Go there
        </button>
      </footer>
    </aside>
  );
}
