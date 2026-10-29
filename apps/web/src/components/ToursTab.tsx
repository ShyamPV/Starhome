import { TOURS, closestExoplanetsTour, type Tour } from '@starhome/data';
import { useMemo } from 'react';
import { useApp } from '../state/store';
import { dwellOf } from './TourPlayer';

/** Rough running time: narration dwell plus the flights between stops. */
function minutes(t: Tour): number {
  const s = t.stops.reduce((acc, stop) => acc + dwellOf(stop.text, stop.dwellS) + 4, 0);
  return Math.max(1, Math.round(s / 60));
}

/** Guided tours: pick one and the player at the bottom of the screen takes over. */
export function ToursTab() {
  const exoplanets = useApp((s) => s.exoplanets);
  const active = useApp((s) => s.tour);
  const tours = useMemo(() => {
    const list = [...TOURS];
    // Data-driven: the nearest systems in the archive snapshot, after the galactic-centre journey.
    if (exoplanets) list.splice(2, 0, closestExoplanetsTour(exoplanets));
    return list;
  }, [exoplanets]);

  return (
    <ul className="space-y-2" aria-label="Tours">
      {tours.map((t) => {
        const playing = active?.tour.id === t.id;
        return (
          <li key={t.id} className={`rounded-xl border p-3 ${playing ? 'border-violet/50 bg-violet/10' : 'border-line bg-white/[0.03]'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{t.title}</h3>
              <span className="tabular shrink-0 text-[10px] text-ink-faint">
                {t.stops.length} stops · ~{minutes(t)} min
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-dim">{t.summary}</p>
            <p className="mt-1 truncate text-[10px] text-ink-faint">{t.stops.map((s) => s.title).join(' → ')}</p>
            <button
              onClick={() => useApp.getState().startTour(t)}
              className="mt-2 rounded-lg bg-gradient-to-r from-violet-deep to-violet px-3 py-1 text-xs font-medium text-white hover:brightness-110"
            >
              {playing ? 'Restart tour' : 'Start tour'}
            </button>
          </li>
        );
      })}
      {!exoplanets && <li className="text-[11px] text-ink-faint">The closest-exoplanets tour appears once the exoplanet catalogue has loaded.</li>}
    </ul>
  );
}
