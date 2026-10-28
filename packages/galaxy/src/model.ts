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
  thin: number;
  young: number;
  thick: number;
  bulge: number;
  halo: number;
}

/** Stellar mass densities (M_sun/pc^3) of each component at a Galactocentric point (kpc). */
export function componentDensities(x: number, y: number, z: number, armSum = armEnhancement(x, y)): ComponentDensities {
  const r = Math.hypot(x, y);
  const az = Math.abs(z);
  const radialThin = Math.exp(-(r - R0_KPC) / DISC.thin.rd) * discHole(r);
  const thin = DISC.thin.rhoSun * radialThin * Math.exp(-az / DISC.thin.hz) * (1 + 0.15 * armSum);
  const young = DISC.young.rhoSun * radialThin * Math.exp(-az / DISC.young.hz) * (0.25 + 2.5 * armSum);
  const thick = DISC.thick.rhoSun * Math.exp(-(r - R0_KPC) / DISC.thick.rd) * Math.exp(-az / DISC.thick.hz);

  const [u, v] = barFrame(x, y);
  const rs2 = (u / BAR.x0) ** 2 + (v / BAR.y0) ** 2 + (z / BAR.z0) ** 2;
  const nuclear = NUCLEAR_DISC.rho0 * Math.exp(-r / NUCLEAR_DISC.rd - az / NUCLEAR_DISC.hz);
  const bulge = BAR.rho0 * Math.exp(-0.5 * rs2) + nuclear;

  const rq2 = r * r + (z / HALO.flattening) ** 2;
  const halo = HALO.rhoSun * ((rq2 + HALO.core ** 2) / (R0_KPC ** 2 + HALO.core ** 2)) ** (-HALO.slope / 2);

  return { thin, young, thick, bulge, halo };
}

// --- Satellites ---------------------------------------------------------------------

export interface Satellite {
  id: string;
  name: string;
  /** Galactocentric centre, kpc. */
  center: [number, number, number];
  /** Characteristic radius, kpc. */
  radius: number;
  /** V-band luminosity, L_sun. */
  luminosity: number;
}

function lbdToGalactocentricKpc(l: number, b: number, dKpc: number): [number, number, number] {
  const eq = galacticToEquatorial(sphericalToCartesian(l, b));
  const ra = (Math.atan2(eq[1], eq[0]) / DEG + 360) % 360;
  const dec = Math.asin(eq[2]) / DEG;
  const p = raDecDistToGalactocentric(ra, dec, dKpc * 1000);
  return [p[0] / 1000, p[1] / 1000, p[2] / 1000];
}

export const SATELLITES: readonly Satellite[] = [
  // Pietrzynski et al. 2019 (LMC distance), McConnachie 2012 (luminosities)
  { id: 'lmc', name: 'Large Magellanic Cloud', center: lbdToGalactocentricKpc(280.47, -32.89, 49.6), radius: 4.5, luminosity: 1.5e9 },
  { id: 'smc', name: 'Small Magellanic Cloud', center: lbdToGalactocentricKpc(302.8, -44.3, 62.4), radius: 2.5, luminosity: 4.6e8 },
  { id: 'sgr-dsph', name: 'Sagittarius Dwarf Spheroidal', center: lbdToGalactocentricKpc(5.6, -14.2, 26.5), radius: 2.5, luminosity: 2.1e7 },
];

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
