import type { HrData, HrStar } from '@starhome/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';

/** Series colours, validated for the dark surface (dataviz validate_palette.js: all checks pass). */
const NAMED = '#25a597';
const HOST = '#8b7cff';
const MODELED = '#6b6889';
const AXIS = 'rgb(157 154 184 / 0.7)';
const GRID = 'rgb(150 140 255 / 0.08)';

const W = 440;
const H = 360;
const PAD = { l: 40, r: 10, t: 22, b: 30 };
const T_MAX = 42_000;
const T_MIN = 2_300;
const M_MIN = -10;
const M_MAX = 17;

const x = (teff: number) => PAD.l + ((Math.log(T_MAX) - Math.log(Math.min(T_MAX, Math.max(T_MIN, teff)))) / (Math.log(T_MAX) - Math.log(T_MIN))) * (W - PAD.l - PAD.r);
const y = (m: number) => PAD.t + ((Math.min(M_MAX, Math.max(M_MIN, m)) - M_MIN) / (M_MAX - M_MIN)) * (H - PAD.t - PAD.b);

const LABELLED = new Set(['sirius', 'betelgeuse', 'rigel', 'proxima', 'sirius-b', 'deneb', 'aldebaran', 'sun', 'barnards-star', 'polaris']);
const SPECTRAL: [string, number][] = [
  ['O', 36_000],
  ['B', 18_000],
  ['A', 8_700],
  ['F', 6_700],
  ['G', 5_600],
  ['K', 4_400],
  ['M', 3_200],
];

const SUN: HrStar = { id: 'sun', name: 'Sun', teffK: 5772, absMagV: 4.83, stage: 'main sequence', source: 'named' };

/**
 * Interactive Hertzsprung-Russell diagram: real named stars and exoplanet hosts over the
 * modeled population of the solar neighbourhood. Click a star to select it and fly there.
 */
export function HrDiagram() {
  const engine = useApp((s) => s.engine);
  const exoplanets = useApp((s) => s.exoplanets);
  const selected = useApp((s) => s.selected);
  const [mode, setMode] = useState<'visible' | 'volume'>('visible');
  const [data, setData] = useState<HrData | null>(null);
  const [hover, setHover] = useState<{ star: HrStar; px: number; py: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    void engine.hrData(mode).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [engine, mode, exoplanets]);

  const real = useMemo(() => (data ? [SUN, ...data.real] : []), [data]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);

    // Grid and axes (recessive).
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    for (let m = -10; m <= 15; m += 5) {
      g.beginPath();
      g.moveTo(PAD.l, y(m));
      g.lineTo(W - PAD.r, y(m));
      g.stroke();
    }
    g.fillStyle = AXIS;
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let m = -10; m <= 15; m += 5) g.fillText(String(m), PAD.l - 6, y(m));
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const t of [30_000, 10_000, 6_000, 4_000, 3_000]) g.fillText(t >= 10_000 ? `${t / 1000}k` : t.toLocaleString('en-US'), x(t), H - PAD.b + 6);
    g.textBaseline = 'bottom';
    for (const [cls, t] of SPECTRAL) g.fillText(cls, x(t), PAD.t - 6);

    // Modeled background.
    const mdl = data.modeled;
    g.fillStyle = MODELED;
    g.globalAlpha = 0.55;
    for (let i = 0; i < mdl.teff.length; i++) g.fillRect(x(mdl.teff[i]!) - 1, y(mdl.absMagV[i]!) - 1, 2, 2);
    g.globalAlpha = 1;

    // Exoplanet hosts: rings.
    g.strokeStyle = HOST;
    g.lineWidth = 1;
    for (const s of real) {
      if (s.source !== 'host') continue;
      g.beginPath();
      g.arc(x(s.teffK), y(s.absMagV), 2.2, 0, Math.PI * 2);
      g.stroke();
    }
    // Named stars: filled dots with a surface ring, direct labels for a few.
    for (const s of real) {
      if (s.source !== 'named') continue;
      const px = x(s.teffK);
      const py = y(s.absMagV);
      g.beginPath();
      g.arc(px, py, 4, 0, Math.PI * 2);
      g.fillStyle = NAMED;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#05060d';
      g.stroke();
    }
    g.fillStyle = 'rgb(232 230 245 / 0.85)';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const s of real) {
      if (s.source === 'named' && (LABELLED.has(s.id) || s.id === selected?.id)) g.fillText(s.name, x(s.teffK) + 7, y(s.absMagV));
    }
    // Selection.
    const sel = real.find((s) => s.id === selected?.id);
    if (sel) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x(sel.teffK), y(sel.absMagV), 8, 0, Math.PI * 2);
      g.stroke();
    }
  }, [data, real, selected]);

  const nearest = (px: number, py: number): HrStar | null => {
    let best: HrStar | null = null;
    let bd = 10 * 10;
    for (const s of real) {
      const d = (x(s.teffK) - px) ** 2 + (y(s.absMagV) - py) ** 2;
      // Named stars win ties against the denser host rings.
      const w = s.source === 'named' ? d * 0.5 : d;
      if (w < bd) {
        bd = w;
        best = s;
      }
    }
    return best;
  };

  const local = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };

  return (
    <figure className="relative" aria-label="Hertzsprung-Russell diagram">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-[11px] text-ink-dim">Brightness (absolute V mag) against temperature</figcaption>
        <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px]" role="group" aria-label="Background population">
          {(
            [
              ['visible', 'Naked-eye sky'],
              ['volume', 'Census'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-md px-2 py-0.5 ${mode === m ? 'bg-violet/40 text-white' : 'text-ink-dim hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvas}
        className="block w-full cursor-crosshair rounded-lg bg-[#05060d]"
        style={{ aspectRatio: `${W} / ${H}` }}
        onMouseMove={(e) => {
          const [px, py] = local(e);
          const s = nearest(px, py);
          setHover(s ? { star: s, px, py } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const [px, py] = local(e);
          const s = nearest(px, py);
          if (s) engine?.flyTo(s.id);
        }}
        role="img"
        aria-label="Hertzsprung-Russell diagram of named stars, exoplanet hosts and the modeled local population"
      />
      {hover && (
        <div
          className="glass pointer-events-none absolute z-10 rounded-lg px-2 py-1 text-[11px]"
          style={{ left: `${(hover.px / W) * 100}%`, top: `${(hover.py / H) * 100}%`, transform: 'translate(10px, 18px)' }}
        >
          <div className="font-medium text-ink">{hover.star.name}</div>
          <div className="tabular font-mono text-ink-dim">
            {Math.round(hover.star.teffK).toLocaleString('en-US')} K · M<sub>V</sub> {hover.star.absMagV.toFixed(1)}
          </div>
          <div className="text-ink-faint">{hover.star.stage ?? 'Exoplanet host'} · click to fly there</div>
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: NAMED }} />
          Named stars (real)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border" style={{ borderColor: HOST }} />
          Exoplanet hosts (real)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-1.5" style={{ background: MODELED }} />
          {mode === 'visible' ? 'Synthetic stars brighter than V 6.5 (modeled)' : 'Synthetic census of a local volume (modeled)'}
        </li>
      </ul>
      {!data && <p className="absolute inset-0 grid place-items-center text-xs text-ink-faint">Computing…</p>}
    </figure>
  );
}
