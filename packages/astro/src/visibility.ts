/**
 * "Visible tonight": the dark part of the coming night for an observer, and how high an
 * object climbs during it. Fixed objects use the hour angle against local sidereal time
 * (J2000 coordinates, so a few tenths of a degree of precession are ignored); that is
 * plenty for deciding whether something is worth looking for.
 */
import { DEG } from './coords';
import { localSiderealTimeDeg, type GeoLocation } from './ephemeris';
import { sunAltitude } from './satellites';

export interface DarkWindow {
  /** Julian dates; `start` is now when it is already dark. */
  start: number;
  end: number;
}

/** Sun below this altitude counts as dark enough for stars (nautical twilight). */
export const DARK_SUN_ALT_DEG = -12;

/**
 * The current or next dark window within a day of `jd`, or null when the Sun never gets
 * low enough (polar summer). Searched in `stepMin` steps, then refined to about a minute.
 */
export function darkWindow(jd: number, loc: GeoLocation, sunLimitDeg = DARK_SUN_ALT_DEG, stepMin = 10): DarkWindow | null {
  const step = stepMin / 1440;
  const dark = (t: number) => sunAltitude(t, loc) < sunLimitDeg;
  const refine = (a: number, b: number, darkAtB: boolean) => {
    // Bisect the crossing between a and b to ~1 minute.
    while (b - a > 1 / 1440) {
      const m = 0.5 * (a + b);
      if (dark(m) === darkAtB) b = m;
      else a = m;
    }
    return b;
  };
  let start: number | null = dark(jd) ? jd : null;
  let t = jd;
  if (start === null) {
    for (let i = 1; i <= 1440 / stepMin; i++) {
      const next = jd + i * step;
      if (dark(next)) {
        start = refine(t, next, true);
        break;
      }
      t = next;
    }
    if (start === null) return null;
  }
  // From the start, walk until it gets light again (at most a day: polar night ends there).
  t = start;
  for (let i = 1; i <= 1440 / stepMin; i++) {
    const next = start + i * step;
    if (!dark(next)) return { start, end: refine(t, next, false) };
    t = next;
  }
  return { start, end: start + 1 };
}

/** Geometric altitude (degrees) of a J2000 RA/Dec at a local sidereal time. */
export function altitudeAt(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): number {
  const h = (lstDeg - raDeg) * DEG;
  const lat = latDeg * DEG;
  const dec = decDeg * DEG;
  const s = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}

export interface BestAltitude {
  /** Highest altitude reached in the window, degrees. */
  alt: number;
  /** When, Julian date. */
  jd: number;
}

/**
 * Sidereal times sampled across a window, shared by every fixed object so a long list of
 * candidates costs one sidereal-time evaluation per sample.
 */
export function windowSamples(win: DarkWindow, loc: GeoLocation, stepMin = 15): { jd: number; lst: number }[] {
  const n = Math.max(1, Math.ceil(((win.end - win.start) * 1440) / stepMin));
  const out: { jd: number; lst: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = win.start + ((win.end - win.start) * i) / n;
    out.push({ jd: t, lst: localSiderealTimeDeg(t, loc.lonDeg) });
  }
  return out;
}

/** Highest altitude of a fixed J2000 RA/Dec over pre-computed window samples. */
export function bestAltitude(raDeg: number, decDeg: number, latDeg: number, samples: { jd: number; lst: number }[]): BestAltitude {
  let best: BestAltitude = { alt: -90, jd: samples[0]?.jd ?? 0 };
  for (const s of samples) {
    const alt = altitudeAt(raDeg, decDeg, latDeg, s.lst);
    if (alt > best.alt) best = { alt, jd: s.jd };
  }
  return best;
}
