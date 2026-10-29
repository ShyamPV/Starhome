import { formatDistance } from '@starhome/astro';
import { EXTREMES } from '@starhome/data';
import type { TargetSummary, VisibleTonight } from '@starhome/engine';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATEGORIES, CATEGORY_COLOR, KIND_LABEL, categoryOf, featuredOf, isHighlight, localDateKey, type Category } from '../catalog';
import { useApp } from '../state/store';
import { StarIcon } from './icons';
import { formatLatLon, formatTime } from './skyFormat';

type ListId = 'highlights' | 'all' | 'closest' | 'tonight' | 'extreme' | 'favourites' | 'visited';

const LISTS: { id: ListId; label: string }[] = [
  { id: 'highlights', label: 'Highlights' },
  { id: 'all', label: 'Everything A–Z' },
  { id: 'closest', label: 'Closest' },
  { id: 'tonight', label: 'Visible tonight' },
  { id: 'extreme', label: 'Most extreme' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'visited', label: 'Visited' },
];

const VISIBILITY = { 'naked eye': 'naked eye', binoculars: 'binoculars', telescope: 'telescope', 'hidden by dust': 'hidden by dust' } as const;

const ROW = 44;
const LIST_H = 340;

interface Row {
  t: TargetSummary;
  note: string;
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">{children}</h3>;
}

export function FavouriteButton({ t, className = '' }: { t: TargetSummary; className?: string }) {
  const on = useApp((s) => t.id in s.favourites);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        useApp.getState().toggleFavourite(t.id);
      }}
      aria-pressed={on}
      aria-label={on ? `Remove ${t.name} from favourites` : `Add ${t.name} to favourites`}
      className={`grid size-7 shrink-0 place-items-center rounded-lg hover:bg-white/5 ${on ? 'text-amber' : 'text-ink-faint hover:text-ink'} ${className}`}
    >
      <StarIcon width={15} height={15} filled={on} />
    </button>
  );
}

/** Object of the day. */
function Featured({ t }: { t: TargetSummary }) {
  const engine = useApp((s) => s.engine);
  return (
    <section className="rounded-xl border border-violet/30 bg-gradient-to-br from-violet/15 to-teal/5 p-3" aria-label="Featured today">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">Featured today</p>
          <h3 className="mt-0.5 truncate text-base font-semibold tracking-tight">{t.name}</h3>
          <p className="truncate text-[11px] text-ink-dim">
            {KIND_LABEL[t.kind]} · {t.subtitle}
          </p>
        </div>
        <FavouriteButton t={t} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-ink-dim">{t.facts[0]}</p>
      <button onClick={() => void engine?.flyTo(t.id)} className="mt-2 rounded-lg bg-violet/30 px-3 py-1 text-xs text-white hover:bg-violet/45">
        Go there
      </button>
    </section>
  );
}

/**
 * The catalogue hub: every object in one searchable, filterable, virtualized list, with
 * curated lists (closest, visible tonight, most extreme) and the visitor's favourites
 * and visits.
 */
export function DiscoverTab() {
  const engine = useApp((s) => s.engine);
  const targets = useApp((s) => s.targets);
  const favourites = useApp((s) => s.favourites);
  const visited = useApp((s) => s.visited);
  const location = useApp((s) => s.location);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [list, setList] = useState<ListId>('highlights');
  const [scroll, setScroll] = useState(0);
  const [tonight, setTonight] = useState<VisibleTonight | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const featured = useMemo(() => featuredOf(targets, localDateKey()), [targets]);

  // Visible tonight: computed when the list opens, and again if the place changes.
  useEffect(() => {
    if (list !== 'tonight' || !engine) return;
    setTonight(null);
    // Let the "computing" state paint first.
    const id = window.setTimeout(() => setTonight(engine.visibleTonight()), 30);
    return () => window.clearTimeout(id);
  }, [list, engine, location]);

  const rows = useMemo((): Row[] => {
    const query = q.trim().toLowerCase();
    const keep = (t: TargetSummary) => (cat === 'all' || categoryOf(t) === cat) && (!query || t.name.toLowerCase().includes(query) || t.subtitle.toLowerCase().includes(query));
    // "Globular cluster · NGC 104", not "Globular cluster · Globular cluster · NGC 104".
    const plain = (t: TargetSummary): Row => ({ t, note: t.subtitle.startsWith(KIND_LABEL[t.kind]) ? t.subtitle : `${KIND_LABEL[t.kind]} · ${t.subtitle}` });
    const known = <T,>(ids: T[], id: (x: T) => string) => ids.map((x) => ({ x, t: byId.get(id(x)) })).filter((r): r is { x: T; t: TargetSummary } => !!r.t && keep(r.t));
    switch (list) {
      case 'highlights':
        return targets
          .filter((t) => isHighlight(t) && keep(t))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(plain);
      case 'all':
        return targets
          .filter(keep)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(plain);
      case 'closest':
        return targets
          .filter((t) => keep(t) && t.id !== 'earth' && t.kind !== 'region' && t.kind !== 'galaxy')
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .map(plain);
      case 'tonight':
        return known(tonight?.rows ?? [], (r) => r.id).map(({ x, t }) => ({
          t,
          note: `Best ${formatTime(x.jd)} · ${Math.round(x.alt)}° up · ${VISIBILITY[x.visibility]} (V ${x.mag.toFixed(1)})`,
        }));
      case 'extreme':
        return known([...EXTREMES], (e) => e.id).map(({ x, t }) => ({ t, note: x.short }));
      case 'favourites':
        return known(
          Object.entries(favourites).sort((a, b) => b[1] - a[1]),
          ([id]) => id,
        ).map(({ t }) => plain(t));
      case 'visited':
        return known(
          Object.values(visited).sort((a, b) => b.lastAt - a.lastAt),
          (v) => v.id,
        ).map(({ x, t }) => ({ t, note: `${KIND_LABEL[t.kind]} · visited ${x.count === 1 ? 'once' : `${x.count} times`}, last ${new Date(x.lastAt).toLocaleDateString()}` }));
    }
  }, [list, q, cat, targets, byId, tonight, favourites, visited]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setScroll(0);
  }, [list, q, cat]);

  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const visible = rows.slice(first, first + Math.ceil(LIST_H / ROW) + 8);
  const empty =
    list === 'favourites'
      ? 'No favourites yet: star an object to keep it here.'
      : list === 'visited'
        ? 'Nowhere yet. Objects you fly to are remembered here, in this browser only.'
        : list === 'tonight' && tonight && !tonight.window
          ? 'The Sun does not set far enough below the horizon tonight for a dark sky here.'
          : list === 'tonight' && !tonight
            ? 'Working out tonight’s sky…'
            : 'Nothing matches.';

  return (
    <>
      {featured && <Featured t={featured} />}
      <Heading>Catalogue</Heading>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything: stars, nebulae, exoplanets…"
        aria-label="Search the catalogue"
        className="w-full rounded-lg border border-line bg-white/5 px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-violet/60 focus:outline-none"
      />
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Category">
        {[{ id: 'all' as const, label: 'All', color: '' }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            aria-pressed={cat === c.id}
            onClick={() => setCat(c.id)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${cat === c.id ? 'border-white/40 bg-white/10 text-ink' : 'border-line text-ink-dim hover:text-ink'}`}
          >
            {c.color && <span className="size-2 rounded-full" style={{ background: c.color }} />}
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-0.5 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Lists">
        {LISTS.map((l) => (
          <button key={l.id} role="tab" aria-selected={list === l.id} onClick={() => setList(l.id)} className={`rounded-lg px-2 py-0.5 text-[11px] ${list === l.id ? 'bg-violet/40 text-white' : 'text-ink-dim hover:text-ink'}`}>
            {l.label}
            {l.id === 'favourites' && Object.keys(favourites).length > 0 ? ` ${Object.keys(favourites).length}` : ''}
          </button>
        ))}
      </div>
      <p className="mt-2 mb-1 flex justify-between gap-2 text-[11px] text-ink-faint">
        <span className="tabular">{rows.length.toLocaleString('en-US')} objects</span>
        {list === 'tonight' && tonight?.window && (
          <span className="truncate">
            Dark {formatTime(tonight.window.start)}–{formatTime(tonight.window.end)} · {formatLatLon(location.latDeg, location.lonDeg)}
          </span>
        )}
        {list === 'closest' && <span>Distance from Earth now</span>}
      </p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-faint">{empty}</p>
      ) : (
        <div ref={listRef} className="relative overflow-y-auto" style={{ height: LIST_H }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} role="list" aria-label="Catalogue results">
          <div style={{ height: rows.length * ROW }}>
            {visible.map(({ t, note }, k) => (
              <div key={t.id} role="listitem" className="absolute right-0 left-0 flex items-center gap-1 rounded-lg pr-1 hover:bg-violet/10" style={{ top: (first + k) * ROW, height: ROW }}>
                <button onClick={() => void engine?.flyTo(t.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[categoryOf(t)] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink">{t.name}</span>
                    <span className="block truncate text-[10px] text-ink-faint">{note}</span>
                  </span>
                  <span className="tabular shrink-0 font-mono text-[10px] text-ink-dim">{t.distanceKm > 0 ? formatDistance(t.distanceKm) : ''}</span>
                </button>
                <FavouriteButton t={t} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-snug text-ink-faint">Favourites and visits are kept in this browser only. “Visible tonight” lists objects brighter than V 10 that climb 20° or more after nautical dusk.</p>
    </>
  );
}
