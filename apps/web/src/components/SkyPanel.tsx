import type { GeoLocation } from '@starhome/astro';
import type { SatellitePass } from '@starhome/astro';
import type { SkyLayers, TonightRow } from '@starhome/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../state/store';
import { useShallow } from 'zustand/react/shallow';
import { formatLatLon, formatTime } from './skyFormat';

const PRESETS: { label: string; loc: GeoLocation }[] = [
  { label: 'Greenwich, UK', loc: { latDeg: 51.4769, lonDeg: -0.0005, heightM: 46 } },
  { label: 'Mauna Kea, Hawaii', loc: { latDeg: 19.8207, lonDeg: -155.468, heightM: 4205 } },
  { label: 'Paranal, Chile', loc: { latDeg: -24.6272, lonDeg: -70.4042, heightM: 2635 } },
  { label: 'Siding Spring, Australia', loc: { latDeg: -31.2733, lonDeg: 149.0617, heightM: 1165 } },
  { label: 'Equator, 0° E', loc: { latDeg: 0, lonDeg: 0, heightM: 0 } },
];

const LAYERS: { id: keyof SkyLayers; label: string }[] = [
  { id: 'constellations', label: 'Constellation lines' },
  { id: 'constellationNames', label: 'Constellation names' },
  { id: 'galacticEquator', label: 'Galactic equator' },
  { id: 'ecliptic', label: 'Ecliptic' },
  { id: 'altAzGrid', label: 'Alt-az grid' },
  { id: 'equatorialGrid', label: 'Equatorial grid' },
  { id: 'satellites', label: 'Satellites' },
  { id: 'atmosphere', label: 'Daylight sky' },
];

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase first:mt-0">{children}</h3>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-ink-dim hover:text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-violet" />
      {label}
    </label>
  );
}

function LocationEditor() {
  const { location, setLocation } = useApp(useShallow(({ location, setLocation }) => ({ location, setLocation })));
  const [lat, setLat] = useState(String(location.latDeg));
  const [lon, setLon] = useState(String(location.lonDeg));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setLat(String(Number(location.latDeg.toFixed(4))));
    setLon(String(Number(location.lonDeg.toFixed(4))));
  }, [location]);

  const apply = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || Math.abs(la) > 90 || !Number.isFinite(lo) || Math.abs(lo) > 180) {
      setStatus('Latitude must be within ±90°, longitude within ±180°.');
      return;
    }
    setStatus(null);
    setLocation({ latDeg: la, lonDeg: lo, heightM: location.heightM });
  };

  const useMine = () => {
    if (!navigator.geolocation) {
      setStatus('This browser cannot share its location.');
      return;
    }
    setStatus('Asking for your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setStatus(null);
        setLocation({ latDeg: p.coords.latitude, lonDeg: p.coords.longitude, heightM: p.coords.altitude ?? 0 });
      },
      () => setStatus('Location not available; enter it below.'),
      { maximumAge: 600_000, timeout: 15_000 },
    );
  };

  const input = 'w-full rounded-lg border border-line bg-white/5 px-2 py-1 font-mono text-xs text-ink focus:border-violet/60 focus:outline-none';
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink">{formatLatLon(location.latDeg, location.lonDeg)}</p>
      <button onClick={useMine} className="w-full rounded-lg border border-teal/40 bg-teal/10 py-1.5 text-xs font-medium text-teal hover:bg-teal/20">
        Use my location
      </button>
      <form
        className="grid grid-cols-[1fr_1fr_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input aria-label="Latitude" className={input} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="Lat" />
        <input aria-label="Longitude" className={input} value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" placeholder="Lon (E+)" />
        <button type="submit" className="rounded-lg bg-white/10 px-2 text-xs text-ink hover:bg-white/15">
          Set
        </button>
      </form>
      <select
        aria-label="Observatory presets"
        className="w-full rounded-lg border border-line bg-white/5 px-2 py-1 text-xs text-ink-dim [color-scheme:dark] focus:outline-none"
        value=""
        onChange={(e) => {
          const p = PRESETS[Number(e.target.value)];
          if (p) setLocation({ ...p.loc });
        }}
      >
        <option value="">Observatories and presets…</option>
        {PRESETS.map((p, i) => (
          <option key={p.label} value={i}>
            {p.label}
          </option>
        ))}
      </select>
      {status && <p className="text-[11px] text-amber">{status}</p>}
    </div>
  );
}

/** Sun, Moon, planets and the Galactic centre: up now, and the next rise and set. */
function Tonight() {
  const engine = useApp((s) => s.engine);
  const location = useApp((s) => s.location);
  const [rows, setRows] = useState<TonightRow[] | null>(null);
  const [iss, setIss] = useState<{ pass: SatellitePass | null } | null | undefined>(undefined);
  const [jd, setJd] = useState(0);

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    const refresh = () => {
      const now = engine.jd;
      void engine.skyTonight().then((r) => {
        if (!alive) return;
        setRows(r);
        setJd(now);
      });
      void engine.satellitePass(25544).then((p) => alive && setIss(p));
    };
    refresh();
    const id = window.setInterval(refresh, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [engine, location]);

  if (!rows) return <p className="text-xs text-ink-faint">Computing…</p>;
  return (
    <>
      <ul className="space-y-0.5" aria-label="Tonight's sky">
        {rows.map((r) => {
          const up = r.alt > 0;
          const t = r.times;
          const when = t.circumpolar ? 'Never sets' : t.neverRises ? 'Never rises here' : up ? `Sets ${formatTime(t.set, jd)}` : `Rises ${formatTime(t.rise, jd)}`;
          return (
            <li key={r.id}>
              <button onClick={() => engine?.flyTo(r.id)} className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-violet/10">
                <span className="min-w-0">
                  <span className={`block truncate text-xs ${up ? 'text-ink' : 'text-ink-faint'}`}>{r.name}</span>
                  {r.note && <span className="block truncate text-[10px] text-ink-faint">{r.note}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`tabular block font-mono text-[11px] ${up ? 'text-teal' : 'text-ink-faint'}`}>{up ? `${r.alt.toFixed(0)}° up` : 'below'}</span>
                  <span className="block text-[10px] text-ink-faint">{when}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-ink-dim">
        <span className="text-ink">ISS</span>{' '}
        {iss === undefined
          ? 'loading…'
          : iss === null
            ? 'orbit data unavailable (offline?)'
            : iss.pass
              ? `next pass ${formatTime(iss.pass.rise, jd)}, up to ${iss.pass.maxAlt.toFixed(0)}°${iss.pass.visible ? ', visible' : ', in daylight or shadow'}`
              : 'no pass above 10° in the next day'}
      </div>
      <p className="mt-1 text-[10px] text-ink-faint">Times in your browser's time zone.</p>
    </>
  );
}

/** Left-panel section for the real-time sky from the Earth. */
export function SkyPanel() {
  const { view, set, skyLayers, setSkyLayer } = useApp(useShallow(({ view, set, skyLayers, setSkyLayer }) => ({ view, set, skyLayers, setSkyLayer })));
  const inSky = view === 'sky';
  return (
    <>
      <button
        onClick={() => set({ view: inSky ? 'galaxy' : 'sky' })}
        className="w-full rounded-xl bg-gradient-to-r from-violet-deep to-violet py-2 text-sm font-medium text-white shadow-[0_0_24px_-6px] shadow-violet/60 transition hover:brightness-110"
      >
        {inSky ? 'Back to the galaxy' : 'Look up from Earth'}
      </button>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
        {inSky ? 'Drag to look around, scroll to zoom, W A S D to turn. Search to point at anything.' : 'Stand at your location and see tonight’s sky, live.'}
      </p>
      <Heading>Location</Heading>
      <LocationEditor />
      <Heading>Tonight</Heading>
      <Tonight />
      <Heading>Sky layers</Heading>
      {LAYERS.map((l) => (
        <Check key={l.id} label={l.label} checked={skyLayers[l.id]} onChange={(v) => setSkyLayer(l.id, v)} />
      ))}
    </>
  );
}
