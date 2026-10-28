/**
 * Population synthesis: present-day mass functions built from a Kroupa (2001) IMF and
 * main-sequence lifetimes, plus a simple evolved-star (giant / supergiant) channel.
 * Accuracy target: plausible luminosity functions and colours, not individual stars.
 */
import {
  absMagVFromLuminosity,
  mainSequenceLifetimeYr,
  mainSequenceLuminosity,
  mainSequenceRadius,
  teffFromLR,
} from '@vialactea/astro';
import type { Rng } from './rng';

export type PopulationId = 'young' | 'thin' | 'old';

export const M_MIN = 0.08;
export const M_MAX = 100;

/** Kroupa 2001 IMF, dN/dm (unnormalised, continuous at 0.5 M_sun). */
export function kroupaImf(m: number): number {
  return m < 0.5 ? (m / 0.5) ** -1.3 : (m / 0.5) ** -2.3;
}

interface PopulationSpec {
  /** Fraction of stars of mass m still on the main sequence. */
  survival(m: number): number;
  /** Evolved stars brighter than the main sequence turn-off, per M_sun of population. */
  giantsPerMsun: number;
}

const SPECS: Record<PopulationId, PopulationSpec> = {
  // Ages uniform in 0-100 Myr (spiral-arm OB associations and open clusters).
  young: { survival: (m) => Math.min(1, mainSequenceLifetimeYr(m) / 1e8), giantsPerMsun: 1e-4 },
  // Constant star formation over 10 Gyr.
  thin: { survival: (m) => Math.min(1, mainSequenceLifetimeYr(m) / 1e10), giantsPerMsun: 2e-3 },
  // Single burst ~11 Gyr ago (thick disc, bulge, halo).
  old: { survival: (m) => (mainSequenceLifetimeYr(m) > 1.1e10 ? 1 : 0), giantsPerMsun: 2.5e-3 },
};

const BINS = 512;
const LOG_MIN = Math.log10(M_MIN);
const LOG_MAX = Math.log10(M_MAX);

export interface MassFunctionTable {
  /** Bin edges in log10(m). */
  logM: Float64Array;
  /** Cumulative number fraction at each edge (0 at M_MIN, 1 at M_MAX). */
  cdf: Float64Array;
  /** Mean stellar mass of living main-sequence stars, M_sun. */
  meanMass: number;
}

function buildTable(spec: PopulationSpec): MassFunctionTable {
  const logM = new Float64Array(BINS + 1);
  const cdf = new Float64Array(BINS + 1);
  let n = 0;
  let mass = 0;
  for (let i = 0; i <= BINS; i++) logM[i] = LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / BINS;
  for (let i = 0; i < BINS; i++) {
    const m0 = 10 ** logM[i]!;
    const m1 = 10 ** logM[i + 1]!;
    const mc = Math.sqrt(m0 * m1);
    const dn = kroupaImf(mc) * spec.survival(mc) * (m1 - m0);
    n += dn;
    mass += dn * mc;
    cdf[i + 1] = n;
  }
  for (let i = 0; i <= BINS; i++) cdf[i] = cdf[i]! / n;
  return { logM, cdf, meanMass: mass / n };
}

export const MASS_FUNCTIONS: Record<PopulationId, MassFunctionTable> = {
  young: buildTable(SPECS.young),
  thin: buildTable(SPECS.thin),
  old: buildTable(SPECS.old),
};

export function giantsPerMsun(pop: PopulationId): number {
  return SPECS[pop].giantsPerMsun;
}

function cdfAt(t: MassFunctionTable, m: number): number {
  const x = ((Math.log10(Math.max(M_MIN, Math.min(M_MAX, m))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * BINS;
  const i = Math.min(BINS - 1, Math.floor(x));
  const f = x - i;
  return t.cdf[i]! * (1 - f) + t.cdf[i + 1]! * f;
}

/** Fraction of living main-sequence stars with mass above m. */
export function fractionAbove(pop: PopulationId, m: number): number {
  return 1 - cdfAt(MASS_FUNCTIONS[pop], m);
}

/** Draw a main-sequence mass >= mMin from the population's present-day mass function. */
export function sampleMass(pop: PopulationId, rng: Rng, mMin = M_MIN): number {
  const t = MASS_FUNCTIONS[pop];
  const lo = cdfAt(t, mMin);
  const u = lo + (1 - lo) * rng.next();
  let a = 0;
  let b = BINS;
  while (b - a > 1) {
    const mid = (a + b) >> 1;
    if (t.cdf[mid]! < u) a = mid;
    else b = mid;
  }
  const c0 = t.cdf[a]!;
  const c1 = t.cdf[b]!;
  const f = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
  return 10 ** (t.logM[a]! + f * (t.logM[b]! - t.logM[a]!));
}

export interface SynthStar {
  teff: number;
  /** Bolometric luminosity, L_sun. */
  lum: number;
  absMagV: number;
  evolved: boolean;
}

export function mainSequenceStar(mass: number, rng: Rng): SynthStar {
  // Small scatter for age and metallicity spread along the main sequence.
  const lum = mainSequenceLuminosity(mass) * 10 ** (0.08 * rng.normal());
  const teff = teffFromLR(lum, mainSequenceRadius(mass));
  return { teff, lum, absMagV: absMagVFromLuminosity(lum, teff), evolved: false };
}

export function evolvedStar(pop: PopulationId, rng: Rng): SynthStar {
  let lum: number;
  let teff: number;
  if (pop === 'young') {
    // Blue, yellow and red supergiants.
    lum = 10 ** rng.range(3.5, 5.3);
    const u = rng.next();
    teff = u < 0.4 ? rng.range(12_000, 25_000) : u < 0.55 ? rng.range(5_500, 7_500) : rng.range(3_450, 4_100);
  } else if (rng.next() < 0.45) {
    // Red clump.
    lum = 50 * 10 ** (0.1 * rng.normal());
    teff = 4_750 + 150 * rng.normal();
  } else {
    // Red giant and asymptotic giant branches: brighter giants are cooler.
    lum = Math.min(8_000, 30 * 10 ** (0.55 * Math.abs(rng.normal())));
    teff = Math.max(3_200, 4_900 - 520 * Math.log10(lum / 10));
  }
  return { teff, lum, absMagV: absMagVFromLuminosity(lum, teff), evolved: true };
}
