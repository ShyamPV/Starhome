/**
 * Resolved stars for a globular cluster seen up close. The cluster's real luminosity,
 * size and metallicity (Harris catalogue) set an old single-burst population: main-sequence
 * stars from the present-day mass function plus red giants and a horizontal branch, which
 * is blue in metal-poor clusters. Positions follow a Plummer profile with the cluster's
 * half-light radius. Individual stars are modeled; the cluster's total light is real.
 */
import { SUN_ABS_MAG_V, absMagVFromLuminosity, type Vec3 } from '@starhome/astro';
import { StarBufferBuilder, type StarBuffers } from './buffers';
import {
  LIGHT_TO_MASS,
  MASS_FUNCTIONS,
  M_MAX,
  fractionAbove,
  giantsPerMsun,
  mainSequenceStar,
  meanGiantLight,
  msLightBelow,
  sampleMass,
} from './populations';
import { Rng, hash32 } from './rng';

export interface ClusterRequest {
  /** Stable integer id used for seeding. */
  index: number;
  /** Galactocentric centre, pc. */
  centerPc: Vec3;
  /** Integrated absolute V magnitude. */
  absMagV: number;
  /** Half-light radius, pc. */
  rhPc: number;
  feH: number;
  cap: number;
  seed: number;
}

export interface ClusterBuffers {
  stars: StarBuffers;
  /** Unresolved light (stars below the budget's mass limit) as soft aggregate particles. */
  haze: StarBuffers;
}

const HAZE_PARTICLES = 96;

/** Plummer sphere: the projected half-light radius equals the scale length a. Truncated at 12 a. */
function plummerOffset(rng: Rng, rh: number): Vec3 {
  const a = rh;
  let r: number;
  do r = a / Math.sqrt(rng.nextOpen() ** (-2 / 3) - 1);
  while (r > 12 * a);
  const cz = rng.range(-1, 1);
  const phi = rng.next() * 2 * Math.PI;
  const s = Math.sqrt(1 - cz * cz);
  return [r * s * Math.cos(phi), r * s * Math.sin(phi), r * cz];
}

/** Evolved star of an old cluster: red giant / AGB, or horizontal branch (bluer when metal-poor). */
function clusterGiant(rng: Rng, feH: number): { teff: number; absMag: number } {
  // Lower metallicity: hotter giant branch and a bluer horizontal branch.
  const metalShift = Math.min(400, Math.max(-200, -260 * (feH + 1)));
  let lum: number;
  let teff: number;
  if (rng.next() < 0.4) {
    lum = 45 * 10 ** (0.08 * rng.normal());
    const blueFraction = Math.min(0.95, Math.max(0.05, -0.75 * (feH + 0.9)));
    teff = rng.next() < blueFraction ? rng.range(7_200, 12_000) : 5_000 + 250 * rng.normal();
  } else {
    lum = Math.min(4_000, 25 * 10 ** (0.6 * Math.abs(rng.normal())));
    teff = Math.max(3_500, 4_900 - 520 * Math.log10(lum / 10) + metalShift);
  }
  return { teff, absMag: absMagVFromLuminosity(lum, teff) };
}

export function generateClusterStars(req: ClusterRequest): ClusterBuffers {
  const rng = new Rng(hash32(req.seed, 0xc105, req.index));
  const light = 10 ** (-0.4 * (req.absMagV - SUN_ABS_MAG_V));
  const mass = light / LIGHT_TO_MASS.old;
  const msTotal = mass / MASS_FUNCTIONS.old.meanMass;
  const giants = mass * giantsPerMsun('old');
  const giantScale = Math.min(1, (0.4 * req.cap) / Math.max(1, giants));
  const msBudget = req.cap - giants * giantScale;

  // Raise the minimum mass until the main sequence fits the budget (brightest stars kept).
  let lo = Math.log10(0.1);
  let hi = Math.log10(M_MAX);
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (msTotal * fractionAbove('old', 10 ** mid) > msBudget) lo = mid;
    else hi = mid;
  }
  const minMass = 10 ** hi;

  const stars = new StarBufferBuilder(req.centerPc, Math.min(req.cap, 8192));
  const [cx, cy, cz] = req.centerPc;
  const add = (teff: number, absMag: number) => {
    const o = plummerOffset(rng, req.rhPc);
    stars.addTeff(cx + o[0], cy + o[1], cz + o[2], teff, absMag);
  };
  const nMs = rng.poisson(msTotal * fractionAbove('old', minMass));
  for (let i = 0; i < nMs; i++) {
    const s = mainSequenceStar(sampleMass('old', rng, minMass), rng);
    add(s.teff, s.absMagV);
  }
  const nGiants = rng.poisson(giants * giantScale);
  for (let i = 0; i < nGiants; i++) {
    const g = clusterGiant(rng, req.feH);
    add(g.teff, g.absMag);
  }

  const deficit = mass * msLightBelow('old', minMass) + (1 - giantScale) * giants * meanGiantLight('old');
  const haze = new StarBufferBuilder(req.centerPc, HAZE_PARTICLES);
  if (deficit > 0) {
    const absMag = SUN_ABS_MAG_V - 2.5 * Math.log10(deficit / HAZE_PARTICLES);
    for (let i = 0; i < HAZE_PARTICLES; i++) {
      const o = plummerOffset(rng, req.rhPc);
      haze.addTeff(cx + o[0], cy + o[1], cz + o[2], 4800, absMag);
    }
  }
  return { stars: stars.build(true), haze: haze.build() };
}

/** Display temperature for a cluster's integrated light: metal-poor clusters are bluer. */
export function clusterIntegratedTeff(feH: number): number {
  return Math.min(6400, Math.max(4700, 5300 - 500 * (feH + 1.3)));
}
