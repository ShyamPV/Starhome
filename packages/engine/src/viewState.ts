import type { Vec3 } from '@starhome/astro';

/**
 * Everything a shared link restores: view mode, time, selection and camera. The camera
 * is stored relative to a target (the one it follows, or the nearest one), so a link
 * keeps kilometre precision near a planet and still fits in a URL out in the halo.
 */
export interface ViewState {
  view: 'galaxy' | 'sky';
  /** Simulation time, Julian date; null follows the clock. */
  jd: number | null;
  selected: string | null;
  /** Target the camera is centred on or measured from. */
  anchor: string | null;
  /** Camera focus point relative to the anchor, km; null when it follows the anchor. */
  offsetKm: Vec3 | null;
  distanceKm: number;
  yaw: number;
  pitch: number;
  /** Sky view: observer (rounded to ~10 km for privacy) and where they look. */
  sky: { location: { latDeg: number; lonDeg: number } | null; az: number; alt: number; fov: number } | null;
}

const num = (s: string | null): number | null => {
  if (s === null || s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

const nums = (s: string | null, n: number): number[] | null => {
  if (!s) return null;
  const parts = s.split(',').map((x) => num(x));
  return parts.length === n && parts.every((x) => x !== null) ? (parts as number[]) : null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One decimal, without a "-0.0". */
const fixed1 = (v: number) => (Math.round(v * 10) / 10 || 0).toFixed(1);

/** URL query string (without the leading '#') for a view. */
export function encodeViewState(v: ViewState): string {
  const p = new URLSearchParams();
  if (v.view === 'sky') p.set('v', 'sky');
  if (v.jd !== null) p.set('t', v.jd.toFixed(5));
  if (v.selected) p.set('sel', v.selected);
  if (v.view === 'sky' && v.sky) {
    if (v.sky.location) p.set('loc', `${fixed1(v.sky.location.latDeg)},${fixed1(v.sky.location.lonDeg)}`);
    p.set('look', `${v.sky.az.toFixed(1)},${v.sky.alt.toFixed(1)},${v.sky.fov.toFixed(1)}`);
  } else {
    if (v.anchor) p.set('at', v.anchor);
    if (v.offsetKm) p.set('o', v.offsetKm.map((c) => Number(c.toPrecision(9))).join(','));
    p.set('d', String(Number(v.distanceKm.toPrecision(6))));
    p.set('a', `${v.yaw.toFixed(4)},${v.pitch.toFixed(4)}`);
  }
  return p.toString();
}

/** Parse a shared view; null when the string holds none. Out-of-range values are clamped. */
export function decodeViewState(query: string): ViewState | null {
  const p = new URLSearchParams(query.replace(/^[#?]/, ''));
  const view = p.get('v') === 'sky' ? 'sky' : 'galaxy';
  const jd = num(p.get('t'));
  const d = num(p.get('d'));
  const angles = nums(p.get('a'), 2);
  const loc = nums(p.get('loc'), 2);
  const look = nums(p.get('look'), 3);
  const anchor = p.get('at');
  const selected = p.get('sel');
  if (jd === null && d === null && !anchor && !selected && !look) return null;
  return {
    view,
    // Ephemerides cover roughly 4000 BC to AD 4000 well; keep links inside that.
    jd: jd !== null && jd > 260_000 && jd < 3_200_000 ? jd : null,
    selected: selected || null,
    anchor: anchor || null,
    offsetKm: (nums(p.get('o'), 3) as Vec3 | null) ?? null,
    distanceKm: d !== null && d > 0 ? d : 1e9,
    yaw: angles ? angles[0]! : 0.6,
    pitch: angles ? clamp(angles[1]!, -1.5697, 1.5697) : 0.35,
    sky:
      view === 'sky'
        ? {
            location: loc ? { latDeg: clamp(loc[0]!, -90, 90), lonDeg: Math.abs(loc[1]!) <= 180 ? loc[1]! : ((((loc[1]! + 180) % 360) + 360) % 360) - 180 } : null,
            az: look ? ((look[0]! % 360) + 360) % 360 : 180,
            alt: look ? clamp(look[1]!, -89, 89) : 25,
            fov: look ? clamp(look[2]!, 1, 110) : 70,
          }
        : null,
  };
}
