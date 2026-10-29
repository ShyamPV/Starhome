import type { WhereToFind } from '@starhome/engine';
import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { FavouriteButton } from './DiscoverTab';
import { CloseIcon } from './icons';
import { formatAltAz, formatLatLon, formatRaDec, formatTime } from './skyFormat';

const PROVENANCE = {
  catalog: { label: 'Catalogue data', cls: 'text-teal border-teal/40 bg-teal/10' },
  ephemeris: { label: 'Ephemeris', cls: 'text-teal border-teal/40 bg-teal/10' },
  model: { label: 'Modeled', cls: 'text-amber border-amber/40 bg-amber/10' },
} as const;

const VISIBILITY = {
  'naked eye': 'Naked eye',
  binoculars: 'Binoculars',
  telescope: 'Telescope',
  'hidden by dust': 'Hidden by dust (radio and infrared only)',
} as const;

/** Position in the observer's sky now, and when it rises, crosses the meridian and sets. */
function WhereToFindSection({ id }: { id: string }) {
  const engine = useApp((s) => s.engine);
  const location = useApp((s) => s.location);
  const [info, setInfo] = useState<{ w: WhereToFind; jd: number } | null>(null);

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    setInfo(null);
    const refresh = () => {
      const jd = engine.jd;
      void engine.whereToFind(id).then((w) => alive && setInfo(w ? { w, jd } : null));
    };
    refresh();
    const t = window.setInterval(refresh, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [engine, id, location]);

  if (!info) return null;
  const { w, jd } = info;
  const t = w.times;
  const rows: [string, string][] = [
    ['Now', w.alt > 0 ? formatAltAz(w.alt, w.az) : 'Below the horizon'],
    ['RA, Dec (J2000)', formatRaDec(w.ra, w.dec)],
    ['Constellation', w.constellation],
  ];
  if (t.circumpolar) rows.push(['Rise / set', 'Never sets here']);
  else if (t.neverRises) rows.push(['Rise / set', 'Never rises here']);
  else rows.push(['Rises', formatTime(t.rise, jd)], ['Highest', t.transit !== null ? `${formatTime(t.transit, jd)} at ${t.transitAlt!.toFixed(0)}°` : '—'], ['Sets', formatTime(t.set, jd)]);
  if (w.visibility) rows.push(['See it with', `${VISIBILITY[w.visibility]}${w.mag !== null && w.visibility !== 'hidden by dust' ? ` (V ${w.mag.toFixed(1)})` : ''}`]);

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="Where to find it">
      <h3 className="mb-1.5 flex items-baseline justify-between text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
        Where to find it
        <span className="font-normal tracking-normal normal-case">{formatLatLon(location.latDeg, location.lonDeg)}</span>
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-faint">{k}</dt>
            <dd className="tabular text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Right-hand panel describing the selected object. */
export function InfoPanel() {
  const selected = useApp((s) => s.selected);
  const engine = useApp((s) => s.engine);
  const view = useApp((s) => s.view);
  const visits = useApp((s) => (selected ? s.visited[selected.id]?.count : undefined));
  if (!selected) return null;
  const prov = PROVENANCE[selected.provenance];

  return (
    <aside className="glass pointer-events-auto absolute top-20 right-4 z-20 flex max-h-[calc(100%-11rem)] w-80 flex-col overflow-hidden rounded-2xl" aria-label={`${selected.name} details`}>
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{selected.name}</h2>
          <p className="mt-0.5 text-xs text-ink-dim">{selected.subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${prov.cls}`}>{prov.label}</span>
            {visits !== undefined && (
              <span className="inline-block rounded-full border border-line px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-dim uppercase" title={`Visited ${visits} time${visits === 1 ? '' : 's'} in this browser`}>
                Visited
              </span>
            )}
          </div>
        </div>
        <FavouriteButton t={selected} />
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
        <WhereToFindSection id={selected.id} />
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
        <p className="mb-2 text-[10px] leading-snug text-ink-faint">
          <span className="font-semibold tracking-wide uppercase">Source</span> {selected.source}
        </p>
        <button
          onClick={() => void engine?.flyTo(selected.id)}
          className="w-full rounded-xl bg-gradient-to-r from-violet-deep to-violet py-2 text-sm font-medium text-white shadow-[0_0_24px_-6px] shadow-violet/60 transition hover:brightness-110"
        >
          {view === 'sky' ? 'Point to it' : 'Go there'}
        </button>
      </footer>
    </aside>
  );
}
