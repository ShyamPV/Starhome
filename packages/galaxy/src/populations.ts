/**
 * Population synthesis: present-day mass functions built from a Kroupa (2001) IMF and
 * main-sequence lifetimes, plus a simple evolved-star (giant / supergiant) channel.
 * Accuracy target: plausible luminosity functions and colours, not individual stars.
 */
import {
  SUN_ABS_MAG_V,
  absMagVFromLuminosity,
  mainSequenceLifetimeYr,
  mainSequenceLuminosity,
  mainSequenceRadius,
  teffFromLR,
} from '@starhome/astro';
import { Rng } from './rng';

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

function lumV(absMagV: number): number {
  return 10 ** (-0.4 * (absMagV - SUN_ABS_MAG_V));
}

interface LightTable {
  /** Cumulative main-sequence V light per M_sun of population at each mass-bin edge. */
  msCumulative: Float64Array;
  /** Mean V luminosity of an evolved star, L_sun. */
  giantMean: number;
}

function buildLightTable(pop: PopulationId): LightTable {
  const t = MASS_FUNCTIONS[pop];
  const msCumulative = new Float64Array(BINS + 1);
  for (let i = 0; i < BINS; i++) {
    const m = 10 ** (0.5 * (t.logM[i]! + t.logM[i + 1]!));
    const lum = mainSequenceLuminosity(m);
    const light = (t.cdf[i + 1]! - t.cdf[i]!) * lumV(absMagVFromLuminosity(lum, teffFromLR(lum, mainSequenceRadius(m))));
    msCumulative[i + 1] = msCumulative[i]! + light / t.meanMass;
  }
  // Mean evolved-star light from a fixed-seed sample of the evolved channel.
  const rng = new Rng(0x6a1a);
  let giant = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) giant += lumV(evolvedStar(pop, rng).absMagV);
  return { msCumulative, giantMean: giant / n };
}

const LIGHT_TABLES: Record<PopulationId, LightTable> = {
  young: buildLightTable('young'),
  thin: buildLightTable('thin'),
  old: buildLightTable('old'),
};

/** V light per M_sun of population from main-sequence stars below mass m. */
export function msLightBelow(pop: PopulationId, m: number): number {
  const c = LIGHT_TABLES[pop].msCumulative;
  const x = ((Math.log10(Math.max(M_MIN, Math.min(M_MAX, m))) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * BINS;
  const i = Math.min(BINS - 1, Math.floor(x));
  const f = x - i;
  return c[i]! * (1 - f) + c[i + 1]! * f;
}

/** Mean V luminosity of the population's evolved stars, L_sun. */
export function meanGiantLight(pop: PopulationId): number {
  return LIGHT_TABLES[pop].giantMean;
}

/**
 * V-band light-to-mass ratio (L_sun / M_sun) of each population: living main-sequence
 * stars integrated over the present-day mass function, plus the evolved-star channel.
 * Everything that converts the density model into light (tiles, haze, glow budgets)
 * uses these, so aggregate light matches the individually generated stars.
 */
export const LIGHT_TO_MASS: Record<PopulationId, number> = {
  young: msLightBelow('young', M_MAX) + SPECS.young.giantsPerMsun * LIGHT_TABLES.young.giantMean,
  thin: msLightBelow('thin', M_MAX) + SPECS.thin.giantsPerMsun * LIGHT_TABLES.thin.giantMean,
  old: msLightBelow('old', M_MAX) + SPECS.old.giantsPerMsun * LIGHT_TABLES.old.giantMean,
};

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

export interface PopulationSample {
  teff: Float32Array;
  absMagV: Float32Array;
  evolved: Uint8Array;
  /** Index into the population ids, in the order of the density record. */
  pop: Uint8Array;
}

/**
 * A volume-limited sample of the synthetic stellar population, given local mass densities
 * per population (M_sun/pc^3): what a complete census of a patch of the Galaxy would
 * contain, for the background of the Hertzsprung-Russell diagram.
 */
export function samplePopulation(n: number, density: Record<PopulationId, number>, seed: number, minMass = 0.1): PopulationSample {
  const rng = new Rng(seed);
  const pops = Object.keys(density) as PopulationId[];
  // Stars per M_sun of population above minMass, and evolved stars per M_sun.
  const ms = pops.map((p) => (density[p] / MASS_FUNCTIONS[p].meanMass) * fractionAbove(p, minMass));
  const giants = pops.map((p) => density[p] * SPECS[p].giantsPerMsun);
  const total = ms.reduce((a, b) => a + b, 0) + giants.reduce((a, b) => a + b, 0);
  const out: PopulationSample = { teff: new Float32Array(n), absMagV: new Float32Array(n), evolved: new Uint8Array(n), pop: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    let u = rng.next() * total;
    let star: SynthStar | null = null;
    let popIndex = 1;
    for (let k = 0; k < pops.length && !star; k++) {
      popIndex = k;
      if ((u -= ms[k]!) < 0) star = mainSequenceStar(sampleMass(pops[k]!, rng, minMass), rng);
      else if ((u -= giants[k]!) < 0) star = evolvedStar(pops[k]!, rng);
    }
    star ??= mainSequenceStar(sampleMass('thin', rng, minMass), rng);
    out.teff[i] = star.teff;
    out.absMagV[i] = star.absMagV;
    out.evolved[i] = star.evolved ? 1 : 0;
    out.pop[i] = popIndex;
  }
  return out;
}

/** Vertical scale heights (pc) used for the naked-eye sample's survey volume. */
const SCALE_HEIGHT_PC: Record<PopulationId, number> = { young: 90, thin: 300, old: 900 };

/**
 * Stars brighter than `limitMag` as seen from the Sun: a large volume-limited sample
 * resampled with each star's survey volume (a sphere out to where it reaches the limit,
 * flattened by the disc's thickness, with ~0.7 mag/kpc of dust). Bright stars are seen
 * from much farther away, so giants and hot stars dominate, as in the real night sky.
 */
export function sampleVisible(n: number, density: Record<PopulationId, number>, limitMag: number, seed: number): PopulationSample {
  const pool = samplePopulation(Math.max(20 * n, 100_000), density, seed);
  const pops = Object.keys(density) as PopulationId[];
  const m = pool.teff.length;
  const cum = new Float64Array(m);
  let acc = 0;
  for (let i = 0; i < m; i++) {
    // Distance at which the star reaches the limit, with dust (fixed-point iteration).
    let d = 10 ** ((limitMag - pool.absMagV[i]! + 5) / 5);
    for (let k = 0; k < 6; k++) d = 10 ** ((limitMag - pool.absMagV[i]! + 5 - 0.0007 * Math.min(d, 3000)) / 5);
    d = Math.min(d, 3000);
    const h = SCALE_HEIGHT_PC[pops[pool.pop[i]!]!];
    acc += d < h ? d * d * d : h * d * d * 1.5;
    cum[i] = acc;
  }
  const rng = new Rng(seed ^ 0x5eed);
  const out: PopulationSample = { teff: new Float32Array(n), absMagV: new Float32Array(n), evolved: new Uint8Array(n), pop: new Uint8Array(n) };
  for (let j = 0; j < n; j++) {
    const u = rng.next() * acc;
    let lo = 0;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < u) lo = mid + 1;
      else hi = mid;
    }
    out.teff[j] = pool.teff[lo]!;
    out.absMagV[j] = pool.absMagV[lo]!;
    out.evolved[j] = pool.evolved[lo]!;
    out.pop[j] = pool.pop[lo]!;
  }
  return out;
}
