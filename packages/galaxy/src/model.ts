/**
 * Structural model of the Milky Way in the Galactocentric frame (see @starhome/astro
 * coords.ts): Sun at (-R0, 0, z0), +y along Galactic rotation at the Sun, +z to the NGP.
 * Lengths are kiloparsecs unless a name says otherwise; densities are stellar mass
 * densities in M_sun / pc^3.
 *
 * Spiral arms follow the log-spiral fits of Reid et al. 2019 (ApJ 885, 131; BeSSeL maser
 * parallaxes) near the Sun. Segments beyond the measured azimuth ranges, in particular
 * the far side of the Galaxy, are extrapolations and are flagged as modeled.
 */
import { DEG, R0_PC, galacticToEquatorial, sphericalToCartesian, raDecDistToGalactocentric } from '@starhome/astro';
import { LIGHT_TO_MASS } from './populations';
import { valueNoise } from './rng';

export const R0_KPC = R0_PC / 1000;

export interface SpiralArm {
  id: string;
  name: string;
  /** Radius at the kink, kpc. */
  rKink: number;
  /** Galactocentric azimuth of the kink, deg (0 toward the Sun, increasing with rotation). */
  betaKink: number;
  /** Pitch angles below / above the kink, deg. */
  pitchBelow: number;
  pitchAbove: number;
  /** Azimuth range drawn, deg. */
  betaMin: number;
  betaMax: number;
  /** Azimuth range actually constrained by maser parallaxes (Reid et al. 2019), deg. */
  measured: [number, number];
  /** Gaussian width (1 sigma) at the kink, kpc. */
  width: number;
  /** Relative strength of the young population along the arm. */
  strength: number;
}

export const SPIRAL_ARMS: readonly SpiralArm[] = [
  {
    id: 'perseus',
    name: 'Perseus Arm',
    rKink: 8.87,
    betaKink: 40,
    pitchBelow: 10.3,
    pitchAbove: 8.7,
    betaMin: -120,
    betaMax: 260,
    measured: [-23, 115],
    width: 0.35,
    strength: 1.0,
  },
  {
    id: 'sagittarius-carina',
    name: 'Sagittarius-Carina Arm',
    rKink: 6.04,
    betaKink: 24,
    pitchBelow: 17.1,
    pitchAbove: 1.0,
    betaMin: -120,
    betaMax: 97,
    measured: [-51, 97],
    width: 0.27,
    strength: 1.0,
  },
  {
    id: 'scutum-centaurus',
    name: 'Scutum-Centaurus Arm',
    rKink: 4.91,
    betaKink: 23,
    pitchBelow: 14.1,
    pitchAbove: 12.1,
    betaMin: -240,
    betaMax: 101,
    measured: [3, 101],
    width: 0.23,
    strength: 1.1,
  },
  {
    // Norma near the bar; continuing outward with a ~9 deg pitch it becomes the Outer arm
    // one turn later (Reid's Outer-arm kink at R = 12.24 kpc, beta = 18 - 360).
    id: 'norma-outer',
    name: 'Norma-Outer Arm',
    rKink: 4.46,
    betaKink: 18,
    pitchBelow: 9.13,
    pitchAbove: 19.5,
    betaMin: -420,
    betaMax: 56,
    measured: [-6, 56],
    width: 0.14,
    strength: 0.9,
  },
  {
    id: 'local',
    name: 'Orion Spur (Local Arm)',
    rKink: 8.26,
    betaKink: 9,
    pitchBelow: 11.4,
    pitchAbove: 11.4,
    betaMin: -20,
    betaMax: 40,
    measured: [-8, 27],
    width: 0.31,
    strength: 0.55,
  },
];

/** Arm centre-line radius (kpc) at azimuth beta (deg). */
export function armRadius(arm: SpiralArm, betaDeg: number): number {
  const pitch = betaDeg < arm.betaKink ? arm.pitchBelow : arm.pitchAbove;
  return arm.rKink * Math.exp(-(betaDeg - arm.betaKink) * DEG * Math.tan(pitch * DEG));
}

export function armWidth(arm: SpiralArm, rKpc: number): number {
  return Math.max(arm.width, 0.045 * rKpc);
}

/** Galactocentric azimuth beta (deg), 0 toward the Sun, increasing with Galactic rotation. */
export function betaOf(xKpc: number, yKpc: number): number {
  return Math.atan2(yKpc, -xKpc) / DEG;
}

export function xyFromRBeta(rKpc: number, betaDeg: number): [number, number] {
  const b = betaDeg * DEG;
  return [-rKpc * Math.cos(b), rKpc * Math.sin(b)];
}

/** Perpendicular distance (kpc) from a point to an arm's centre line, with a taper factor at the arm ends. */
export function distanceToArm(arm: SpiralArm, xKpc: number, yKpc: number): { dist: number; taper: number } {
  const r = Math.hypot(xKpc, yKpc);
  const beta0 = betaOf(xKpc, yKpc);
  const taperDeg = 15;
  let best = Infinity;
  let bestTaper = 0;
  const kMin = Math.floor((arm.betaMin - taperDeg - beta0) / 360);
  const kMax = Math.ceil((arm.betaMax + taperDeg - beta0) / 360);
  for (let k = kMin; k <= kMax; k++) {
    const beta = beta0 + 360 * k;
    if (beta < arm.betaMin - taperDeg || beta > arm.betaMax + taperDeg) continue;
    const pitch = beta < arm.betaKink ? arm.pitchBelow : arm.pitchAbove;
    const d = Math.abs(r - armRadius(arm, beta)) * Math.cos(pitch * DEG);
    if (d < best) {
      best = d;
      const over = Math.max(arm.betaMin - beta, beta - arm.betaMax, 0);
      bestTaper = 1 - over / taperDeg;
    }
  }
  return { dist: best, taper: bestTaper };
}

/** Sum of Gaussian arm profiles at a point, weighted by arm strength (0 far from any arm). */
export function armEnhancement(xKpc: number, yKpc: number): number {
  const r = Math.hypot(xKpc, yKpc);
  let sum = 0;
  for (const arm of SPIRAL_ARMS) {
    const { dist, taper } = distanceToArm(arm, xKpc, yKpc);
    if (!Number.isFinite(dist)) continue;
    const w = armWidth(arm, r);
    sum += arm.strength * taper * Math.exp((-0.5 * dist * dist) / (w * w));
  }
  return sum;
}

export function nearestArm(xKpc: number, yKpc: number): { arm: SpiralArm; dist: number; within: boolean } {
  const r = Math.hypot(xKpc, yKpc);
  let best = { arm: SPIRAL_ARMS[0]!, dist: Infinity, within: false };
  for (const arm of SPIRAL_ARMS) {
    const { dist, taper } = distanceToArm(arm, xKpc, yKpc);
    if (taper <= 0) continue;
    if (dist < best.dist) best = { arm, dist, within: dist < 1.5 * armWidth(arm, r) };
  }
  return best;
}

// --- Bar / bulge -----------------------------------------------------------------

export const BAR = {
  /** Angle of the near end from the Sun-GC line toward positive l, deg (Wegg & Gerhard 2013: ~27). */
  angleDeg: 27,
  /** Gaussian scale lengths along the bar major, minor and vertical axes, kpc. */
  x0: 1.49,
  y0: 0.58,
  z0: 0.4,
  /** Central density, M_sun/pc^3 (normalised to ~1.5e10 M_sun). */
  rho0: 2.75,
  /** Half-length of the long bar, kpc. */
  halfLength: 5.0,
};

/** Unit vector of the bar major axis in the Galactocentric plane. */
export const BAR_AXIS: [number, number] = [-Math.cos(BAR.angleDeg * DEG), Math.sin(BAR.angleDeg * DEG)];

function barFrame(x: number, y: number): [number, number] {
  const [ax, ay] = BAR_AXIS;
  return [x * ax + y * ay, -x * ay + y * ax];
}

export function barFrameToGalactocentric(u: number, v: number): [number, number] {
  const [ax, ay] = BAR_AXIS;
  return [u * ax - v * ay, u * ay + v * ax];
}

// --- Densities ---------------------------------------------------------------------

export const DISC = {
  thin: { rhoSun: 0.04, rd: 2.6, hz: 0.3 },
  /**
   * Density-wave amplitude of the old thin disc: density x (1 + c * arms). Spiral arms are
   * clearly visible in near-infrared light from old stars, at roughly this contrast.
   */
  thinArmContrast: 0.4,
  young: { rhoSun: 0.0025, rd: 2.6, hz: 0.09 },
  thick: { rhoSun: 0.0045, rd: 2.0, hz: 0.9 },
  /** Thin-disc inner hole, kpc: the bar dominates inside this radius. */
  holeRadius: 3.0,
};

export const HALO = { rhoSun: 1e-4, flattening: 0.65, core: 1.0, slope: 3.5 };

/** Nuclear stellar disc (Launhardt et al. 2002), ~1e9 M_sun inside ~200 pc. */
export const NUCLEAR_DISC = { rho0: 218, rd: 0.09, hz: 0.045 };

function discHole(r: number): number {
  return 1 - Math.exp(-((r / DISC.holeRadius) ** 3));
}

export interface ComponentDensities {
  /** Thin disc, plus the intermediate-age light of the Magellanic Clouds. */
  thin: number;
  /** Young (< 100 Myr) disc population, plus the Clouds' young stars. */
  young: number;
  thick: number;
  bulge: number;
  /** Stellar halo, plus the old Sagittarius dwarf. */
  halo: number;
}

/**
 * Clumping of the young population into OB associations and star-forming complexes:
 * a smooth, deterministic multiplier with mean ~1 on a ~120 pc lattice.
 */
export function youngClumping(x: number, y: number, z: number): number {
  const v = 0.65 * valueNoise(x / 0.12, y / 0.12, z / 0.06) + 0.35 * valueNoise(x / 0.04 + 17.3, y / 0.04 - 4.1, z / 0.03);
  // E[v^4] = 0.0912 for this blend, so the mean multiplier is 1.
  return 0.2 + 8.77 * v ** 4;
}

/** Stellar mass densities (M_sun/pc^3) of each component at a Galactocentric point (kpc). */
export function componentDensities(x: number, y: number, z: number, armSum = armEnhancement(x, y)): ComponentDensities {
  const r = Math.hypot(x, y);
  const az = Math.abs(z);
  const radialThin = Math.exp(-(r - R0_KPC) / DISC.thin.rd) * discHole(r);
  let thin = DISC.thin.rhoSun * radialThin * Math.exp(-az / DISC.thin.hz) * (1 + DISC.thinArmContrast * armSum);
  let young = DISC.young.rhoSun * radialThin * Math.exp(-az / DISC.young.hz) * (0.25 + 2.5 * armSum);
  if (young > 1e-7) young *= youngClumping(x, y, z);
  const thick = DISC.thick.rhoSun * Math.exp(-(r - R0_KPC) / DISC.thick.rd) * Math.exp(-az / DISC.thick.hz);

  const [u, v] = barFrame(x, y);
  const rs2 = (u / BAR.x0) ** 2 + (v / BAR.y0) ** 2 + (z / BAR.z0) ** 2;
  const nuclear = NUCLEAR_DISC.rho0 * Math.exp(-r / NUCLEAR_DISC.rd - az / NUCLEAR_DISC.hz);
  const bulge = BAR.rho0 * Math.exp(-0.5 * rs2) + nuclear;

  const rq2 = r * r + (z / HALO.flattening) ** 2;
  let halo = HALO.rhoSun * ((rq2 + HALO.core ** 2) / (R0_KPC ** 2 + HALO.core ** 2)) ** (-HALO.slope / 2);

  for (const s of SATELLITES) {
    const rho = satelliteDensity(s, x, y, z);
    if (rho === 0) continue;
    thin += rho * s.mix.thin;
    young += rho * s.mix.young;
    halo += rho * s.mix.old;
  }

  return { thin, young, thick, bulge, halo };
}

// --- Satellites ---------------------------------------------------------------------

export type SatelliteShape =
  /** Inclined exponential disc plus a Gaussian bar, in the satellite's own frame (kpc). */
  | { kind: 'disc'; rd: number; hz: number; barFraction: number; bar: [number, number, number]; tiltDeg: number; spinDeg: number }
  /** Triaxial Gaussian; `axis` is the unit vector of the long axis (sigma[2]). */
  | { kind: 'gaussian'; sigma: [number, number, number]; axis: [number, number, number] };

export interface Satellite {
  id: string;
  name: string;
  /** Galactocentric centre, kpc. */
  center: [number, number, number];
  /** Characteristic radius, kpc. */
  radius: number;
  /** V-band luminosity, L_sun. */
  luminosity: number;
  /** Stellar mass, M_sun. */
  mass: number;
  /** Mass fractions in the young / intermediate (thin-disc-like) / old populations. */
  mix: { young: number; thin: number; old: number };
  shape: SatelliteShape;
}

function lbdToGalactocentricKpc(l: number, b: number, dKpc: number): [number, number, number] {
  const eq = galacticToEquatorial(sphericalToCartesian(l, b));
  const ra = (Math.atan2(eq[1], eq[0]) / DEG + 360) % 360;
  const dec = Math.asin(eq[2]) / DEG;
  const p = raDecDistToGalactocentric(ra, dec, dKpc * 1000);
  return [p[0] / 1000, p[1] / 1000, p[2] / 1000];
}

function unitFromSun(c: [number, number, number]): [number, number, number] {
  const d: [number, number, number] = [c[0] + R0_KPC, c[1], c[2]];
  const n = Math.hypot(...d);
  return [d[0] / n, d[1] / n, d[2] / n];
}

const LMC_CENTER = lbdToGalactocentricKpc(280.47, -32.89, 49.6);
const SMC_CENTER = lbdToGalactocentricKpc(302.8, -44.3, 62.4);
const SGR_CENTER = lbdToGalactocentricKpc(5.6, -14.2, 26.5);

/** Derive the stellar mass from the observed luminosity and the population mix, so the light matches. */
function satellite(s: Omit<Satellite, 'mass'>): Satellite {
  const lightToMass = s.mix.young * LIGHT_TO_MASS.young + s.mix.thin * LIGHT_TO_MASS.thin + s.mix.old * LIGHT_TO_MASS.old;
  return { ...s, mass: s.luminosity / lightToMass };
}

export const SATELLITES: readonly Satellite[] = [
  // Distances: Pietrzynski et al. 2019 (LMC), Graczyk et al. 2020 (SMC), ~26.5 kpc (Sgr).
  // Luminosities: McConnachie 2012. Population mixes and shapes are simplified.
  satellite({
    id: 'lmc',
    name: 'Large Magellanic Cloud',
    center: LMC_CENTER,
    radius: 4.5,
    luminosity: 1.5e9,
    mix: { young: 0.012, thin: 0.788, old: 0.2 },
    shape: { kind: 'disc', rd: 1.4, hz: 0.25, barFraction: 0.2, bar: [1.4, 0.35, 0.25], tiltDeg: 35, spinDeg: 20 },
  }),
  satellite({
    id: 'smc',
    name: 'Small Magellanic Cloud',
    center: SMC_CENTER,
    radius: 2.5,
    luminosity: 4.6e8,
    mix: { young: 0.02, thin: 0.78, old: 0.2 },
    // Elongated largely along our line of sight.
    shape: { kind: 'gaussian', sigma: [0.9, 0.9, Math.hypot(0.9, 2.2)], axis: unitFromSun(SMC_CENTER) },
  }),
  satellite({
    id: 'sgr-dsph',
    name: 'Sagittarius Dwarf Spheroidal',
    center: SGR_CENTER,
    radius: 2.5,
    luminosity: 2.1e7,
    mix: { young: 0, thin: 0, old: 1 },
    // Elongated perpendicular to the Galactic plane, along its polar orbit.
    shape: { kind: 'gaussian', sigma: [0.6, 0.6, 2.2], axis: [0, 0, 1] },
  }),
];

/** Rotate a satellite-frame offset into the Galactocentric frame (disc satellites). */
export function satelliteToGalactocentric(shape: Extract<SatelliteShape, { kind: 'disc' }>, d: [number, number, number]): [number, number, number] {
  const t = shape.tiltDeg * DEG;
  const p = shape.spinDeg * DEG;
  const y1 = d[1] * Math.cos(t) - d[2] * Math.sin(t);
  const z1 = d[1] * Math.sin(t) + d[2] * Math.cos(t);
  return [d[0] * Math.cos(p) - y1 * Math.sin(p), d[0] * Math.sin(p) + y1 * Math.cos(p), z1];
}

function galactocentricToSatellite(shape: Extract<SatelliteShape, { kind: 'disc' }>, d: [number, number, number]): [number, number, number] {
  const t = shape.tiltDeg * DEG;
  const p = shape.spinDeg * DEG;
  const x0 = d[0] * Math.cos(p) + d[1] * Math.sin(p);
  const y1 = -d[0] * Math.sin(p) + d[1] * Math.cos(p);
  return [x0, y1 * Math.cos(t) + d[2] * Math.sin(t), -y1 * Math.sin(t) + d[2] * Math.cos(t)];
}

const TWO_PI_3_2 = (2 * Math.PI) ** 1.5;

/** Stellar mass density of a satellite galaxy, M_sun/pc^3, at a Galactocentric point (kpc). */
export function satelliteDensity(s: Satellite, x: number, y: number, z: number): number {
  const d: [number, number, number] = [x - s.center[0], y - s.center[1], z - s.center[2]];
  const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (r2 > (3 * s.radius) ** 2) return 0;
  let perKpc3: number;
  if (s.shape.kind === 'disc') {
    const sh = s.shape;
    const [a, b, c] = galactocentricToSatellite(sh, d);
    const disc = (1 - sh.barFraction) / (2 * Math.PI * sh.rd * sh.rd * 2 * sh.hz);
    const rr = Math.hypot(a, b);
    const bar = sh.barFraction / (TWO_PI_3_2 * sh.bar[0] * sh.bar[1] * sh.bar[2]);
    perKpc3 =
      disc * Math.exp(-rr / sh.rd - Math.abs(c) / sh.hz) +
      bar * Math.exp(-0.5 * ((a / sh.bar[0]) ** 2 + (b / sh.bar[1]) ** 2 + (c / sh.bar[2]) ** 2));
  } else {
    const { sigma, axis } = s.shape;
    const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const perp2 = Math.max(0, r2 - along * along);
    perKpc3 = Math.exp(-0.5 * (perp2 / (sigma[0] * sigma[1]) + (along / sigma[2]) ** 2)) / (TWO_PI_3_2 * sigma[0] * sigma[1] * sigma[2]);
  }
  return (s.mass * perKpc3) / 1e9;
}

// --- Regions ----------------------------------------------------------------------

/** Human-readable region name for a Galactocentric position (kpc). */
export function regionName(x: number, y: number, z: number): string {
  for (const s of SATELLITES) {
    const d = Math.hypot(x - s.center[0], y - s.center[1], z - s.center[2]);
    if (d < s.radius * 1.5) return s.name;
  }
  const r = Math.hypot(x, y);
  const rr = Math.hypot(r, z);
  if (rr < 0.001) return 'Sagittarius A* vicinity';
  if (rr < 0.25) return 'Central Molecular Zone';
  if (rr > 120) return 'Intergalactic space';
  if (Math.abs(z) > 3 || r > 25) return 'Stellar halo';
  const [u, v] = barFrame(x, y);
  if (Math.abs(u) < 2.5 && Math.abs(v) < 1.2 && Math.abs(z) < 1.5) return 'Galactic bulge and bar';
  if (Math.abs(z) > 1.2) return 'Thick disc';
  const near = nearestArm(x, y);
  if (near.within) return near.arm.name;
  if (r > 16) return 'Outer disc';
  return 'Inter-arm disc';
}

/** True if the arm segment at this azimuth is an extrapolation rather than measured. */
export function isModeledArmSegment(arm: SpiralArm, betaDeg: number): boolean {
  return betaDeg < arm.measured[0] || betaDeg > arm.measured[1];
}
