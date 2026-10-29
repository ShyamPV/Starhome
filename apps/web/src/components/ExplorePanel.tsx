import { SIZE_CLASS_LABEL, type Exoplanet, type ExoplanetCatalog, type SizeClass } from '@starhome/data';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/store';
import { useShallow } from 'zustand/react/shallow';
import { DiscoverTab } from './DiscoverTab';
import { HrDiagram } from './HrDiagram';
import { ToursTab } from './ToursTab';

const CLASS_COLOR: Record<SizeClass, string> = {
  rocky: '#c9a27a',
  'super-earth': '#8fd18a',
  'neptune-like': '#7fb8ff',
  'gas-giant': '#f2c88b',
  'hot-jupiter': '#ff7a59',
};
const FAMOUS = ['TRAPPIST-1 e', 'Proxima Cen b', 'Kepler-452 b', '55 Cnc e', 'HD 209458 b', 'Kepler-16 b'];
const DISTANCES = [10, 50, 100, 500, 1000, Infinity];
const ROW = 46;
const LIST_H = 330;

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">{children}</h3>;
}

/** Star catalogue: the HR diagram and a searchable list of named and extreme objects. */
function StarsTab() {
  const targets = useApp((s) => s.targets);
  const engine = useApp((s) => s.engine);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return targets
      .filter((t) => (t.kind === 'star' && !t.subtitle.startsWith('Exoplanet host')) || t.kind === 'neutron-star' || t.kind === 'black-hole')
      .filter((t) => !query || t.name.toLowerCase().includes(query) || t.subtitle.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, q]);
  return (
    <>
      <HrDiagram />
      <Heading>Catalogue · {list.length}</Heading>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter: name, type, stage, constellation…"
        aria-label="Filter stars"
        className="mb-1 w-full rounded-lg border border-line bg-white/5 px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:border-violet/60 focus:outline-none"
      />
      <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="Star catalogue">
        {list.map((t) => (
          <li key={t.id}>
            <button onClick={() => engine?.flyTo(t.id)} className="w-full rounded-lg px-2 py-1 text-left hover:bg-violet/10">
              <span className="block text-xs text-ink">{t.name}</span>
              <span className="block truncate text-[10px] text-ink-faint">{t.subtitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Discoveries per year, with the timeline cut-off highlighted. */
function Timeline({ catalog, year, onYear }: { catalog: ExoplanetCatalog; year: number; onYear: (y: number) => void }) {
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of catalog.planets) if (p.year) m.set(p.year, (m.get(p.year) ?? 0) + 1);
    return m;
  }, [catalog]);
  const years = [...counts.keys()];
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const max = Math.max(...counts.values());
  const [hover, setHover] = useState<number | null>(null);
  const total = useMemo(() => catalog.planets.filter((p) => (p.year ?? 0) <= year).length, [catalog, year]);
  const n = y1 - y0 + 1;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-ink-dim">Discovery timeline</span>
        <span className="tabular font-mono text-ink">
          {total.toLocaleString('en-US')} known by {year}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${n * 6} 48`} className="block h-12 w-full" preserveAspectRatio="none" role="img" aria-label="Planets discovered per year">
          {Array.from({ length: n }, (_, i) => {
            const yr = y0 + i;
            const c = counts.get(yr) ?? 0;
            const h = (c / max) * 46;
            return (
              <rect
                key={yr}
                x={i * 6 + 1}
                y={48 - h}
                width={4}
                height={Math.max(h, c ? 1 : 0)}
                rx={1}
                fill={yr <= year ? '#8b7cff' : 'rgb(139 124 255 / 0.2)'}
                onMouseEnter={() => setHover(yr)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        {hover !== null && (
          <div className="glass pointer-events-none absolute -top-7 right-0 rounded-md px-1.5 py-0.5 text-[10px] text-ink">
            {hover}: {counts.get(hover) ?? 0} planets
          </div>
        )}
      </div>
      <input type="range" min={y0} max={y1} value={year} onChange={(e) => onYear(Number(e.target.value))} className="w-full" aria-label="Discovery year" />
    </div>
  );
}

/** Exoplanet catalogue: filters, discovery timeline and a virtualized list. */
function ExoplanetsTab() {
  const catalog = useApp((s) => s.exoplanets);
  const engine = useApp((s) => s.engine);
  const [method, setMethod] = useState('');
  const [classes, setClasses] = useState<Set<SizeClass>>(new Set());
  const [hzOnly, setHzOnly] = useState(false);
  const [maxDist, setMaxDist] = useState(Infinity);
  const [minPlanets, setMinPlanets] = useState(1);
  const [year, setYear] = useState(2100);
  const [sort, setSort] = useState<'distance' | 'esi' | 'year'>('distance');
  const [scroll, setScroll] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hostOf = useMemo(() => new Map(catalog?.hosts.map((h) => [h.id, h]) ?? []), [catalog]);
  const methods = useMemo(() => [...new Set(catalog?.planets.map((p) => p.method) ?? [])].sort(), [catalog]);
  const lastYear = useMemo(() => Math.max(...(catalog?.planets.map((p) => p.year ?? 0) ?? [0])), [catalog]);
  const yearLimit = Math.min(year, lastYear || year);

  const pass = useMemo(
    () => (p: Exoplanet) =>
      (!method || p.method === method) &&
      (classes.size === 0 || classes.has(p.sizeClass)) &&
      (!hzOnly || p.inHabitableZone) &&
      (p.distPc ?? Infinity) <= maxDist &&
      (hostOf.get(p.hostId)?.planets.length ?? 1) >= minPlanets &&
      (p.year ?? 0) <= yearLimit,
    [method, classes, hzOnly, maxDist, minPlanets, yearLimit, hostOf],
  );

  const rows = useMemo(() => {
    if (!catalog) return [];
    const r = catalog.planets.filter(pass);
    if (sort === 'distance') r.sort((a, b) => (a.distPc ?? Infinity) - (b.distPc ?? Infinity));
    else if (sort === 'esi') r.sort((a, b) => (b.esi ?? -1) - (a.esi ?? -1));
    else r.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return r;
  }, [catalog, pass, sort]);

  // Mirror the filters onto the host markers in 3D.
  useEffect(() => {
    engine?.setExoplanetHostFilter((h) => h.planets.some(pass));
    return () => engine?.setExoplanetHostFilter(null);
  }, [engine, pass]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setScroll(0);
  }, [rows]);

  if (!catalog) return <p className="text-xs text-ink-faint">Loading the NASA Exoplanet Archive snapshot…</p>;
  const first = Math.max(0, Math.floor(scroll / ROW) - 4);
  const visible = rows.slice(first, first + Math.ceil(LIST_H / ROW) + 8);
  const select = 'w-full rounded-lg border border-line bg-white/5 px-2 py-1 text-xs text-ink [color-scheme:dark] focus:outline-none';

  return (
    <>
      <Heading>Famous systems</Heading>
      <div className="flex flex-wrap gap-1">
        {FAMOUS.map((n) => {
          const p = catalog.planets.find((x) => x.name === n);
          return p ? (
            <button key={n} onClick={() => engine?.flyTo(p.id)} className="rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[11px] text-ink hover:bg-violet/20">
              {n}
            </button>
          ) : null;
        })}
      </div>
      <Heading>Filters</Heading>
      <div className="grid grid-cols-2 gap-1.5">
        <select aria-label="Discovery method" className={select} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">All methods</option>
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select aria-label="Maximum distance" className={select} value={String(maxDist)} onChange={(e) => setMaxDist(Number(e.target.value))}>
          {DISTANCES.map((d) => (
            <option key={d} value={String(d)}>
              {d === Infinity ? 'Any distance' : `Within ${d} pc`}
            </option>
          ))}
        </select>
        <select aria-label="Planets in system" className={select} value={minPlanets} onChange={(e) => setMinPlanets(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7].map((k) => (
            <option key={k} value={k}>
              {k === 1 ? 'Any number of planets' : `${k}+ planets in system`}
            </option>
          ))}
        </select>
        <select aria-label="Sort" className={select} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="distance">Nearest first</option>
          <option value="esi">Most Earth-like (ESI)</option>
          <option value="year">Newest first</option>
        </select>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Planet type">
        {(Object.keys(SIZE_CLASS_LABEL) as SizeClass[]).map((c) => {
          const on = classes.has(c);
          return (
            <button
              key={c}
              aria-pressed={on}
              onClick={() => {
                const next = new Set(classes);
                if (on) next.delete(c);
                else next.add(c);
                setClasses(next);
              }}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-white/40 bg-white/10 text-ink' : 'border-line text-ink-dim hover:text-ink'}`}
            >
              <span className="size-2 rounded-full" style={{ background: CLASS_COLOR[c] }} />
              {SIZE_CLASS_LABEL[c]}
            </button>
          );
        })}
      </div>
      <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-dim">
        <input type="checkbox" checked={hzOnly} onChange={(e) => setHzOnly(e.target.checked)} className="accent-violet" />
        In the habitable zone (conservative)
      </label>
      <div className="mt-3">
        <Timeline catalog={catalog} year={yearLimit} onYear={setYear} />
      </div>
      <Heading>Planets · {rows.length.toLocaleString('en-US')}</Heading>
      <div ref={listRef} className="relative overflow-y-auto" style={{ height: LIST_H }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} aria-label="Exoplanet list" role="list">
        <div style={{ height: rows.length * ROW }}>
          {visible.map((p, k) => (
            <button
              key={p.id}
              role="listitem"
              onClick={() => engine?.flyTo(p.id)}
              className="absolute right-0 left-0 flex items-center gap-2 rounded-lg px-2 text-left hover:bg-violet/10"
              style={{ top: (first + k) * ROW, height: ROW }}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: CLASS_COLOR[p.sizeClass] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink">
                  {p.name}
                  {p.inHabitableZone && <span className="ml-1.5 text-[10px] text-teal">HZ</span>}
                </span>
                <span className="block truncate text-[10px] text-ink-faint">
                  {SIZE_CLASS_LABEL[p.sizeClass]} · {p.method} {p.year ?? ''}
                </span>
              </span>
              <span className="tabular shrink-0 text-right font-mono text-[10px] text-ink-dim">
                {p.distPc !== null ? `${p.distPc < 100 ? p.distPc.toFixed(1) : Math.round(p.distPc).toLocaleString('en-US')} pc` : '—'}
                {p.esi !== null && <span className="block text-ink-faint">ESI {p.esi.toFixed(2)}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-ink-faint">
        NASA Exoplanet Archive, retrieved {catalog.retrieved}. ESI is an estimate from radius and stellar flux. Planet surfaces are artist’s impressions.
      </p>
    </>
  );
}

/** Explore: the catalogue hub, the star catalogue with its HR diagram, the exoplanet catalogue and tours. */
export function ExplorePanel() {
  const { exploreTab, set } = useApp(useShallow(({ exploreTab, set }) => ({ exploreTab, set })));
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1" role="tablist">
        {(
          [
            ['discover', 'Discover'],
            ['stars', 'Stars'],
            ['exoplanets', 'Exoplanets'],
            ['tours', 'Tours'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={exploreTab === id} onClick={() => set({ exploreTab: id })} className={`rounded-lg py-1 text-xs ${exploreTab === id ? 'bg-violet/40 text-white' : 'text-ink-dim hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      {exploreTab === 'discover' && <DiscoverTab />}
      {exploreTab === 'stars' && <StarsTab />}
      {exploreTab === 'exoplanets' && <ExoplanetsTab />}
      {exploreTab === 'tours' && <ToursTab />}
    </>
  );
}
