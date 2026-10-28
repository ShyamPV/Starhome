/**
 * Interstellar dust as V-band extinction per unit length (mag/kpc) in the Galactocentric
 * frame (kpc):
 *
 *   a(x, y, z) = a_mid(x, y) * exp(-|z| / hz) * bubble(x, y, z)
 *
 * a_mid is a 2D map: an exponential dust disc cleared inside the bar, concentrated along
 * the spiral arms with the lanes on the arms' inner (concave) edges, the molecular ring
 * at 4-5 kpc, two lanes along the bar's leading edges, and the Central Molecular Zone.
 * The Sun sits in the Local Bubble, a ~100-200 pc cavity of hot gas with very little
 * dust (Lallement et al. 2014).
 *
 * Extinction along a straight path is integrated with importance sampling in z: the
 * vertical profile is integrated analytically and the map is sampled at points spaced
 * evenly in that integral, so a steep ray through the thin dust layer (a view from far
 * outside the disc) and a long ray in the plane are both resolved with a few samples.
 * The renderer runs the same algorithm per star in its vertex shader (starMaterial.ts).
 *
 * Calibration (tested): A_V ~ 24 toward Sgr A*, ~2.6 through Baade's window (l, b = 1,
 * -3.9; observed ~1.5-2), < 0.1 toward the Galactic poles, ~0.7 mag/kpc in the plane near
 * the Sun. Against the measured reddening of all 157 Harris globular clusters the model
 * ranks sight lines correctly (Spearman rho ~ 0.88) and is typically 0.6-0.7x the measured
 * value: it is smooth, so it misses individual clouds such as rho Ophiuchi in front of M4.
 */
import { R0_PC, Z0_PC, type Vec3 } from '@starhome/astro';
import { BAR_AXIS, R0_KPC, armEnhancement } from './model';

export const DUST = {
  /** Smooth mid-plane extinction at the solar circle, between the arms, mag/kpc. */
  a0: 0.45,
  /** Extra mid-plane extinction at an arm's dust lane, per unit arm strength, mag/kpc. */
  arm: 0.9,
  /** Lanes sit this far inside the stellar arm centre line, kpc. */
  armOffset: 0.15,
  /** Radial scale length, kpc. */
  rd: 4.0,
  /** Exponential scale height, kpc (Drimmel & Spergel 2001 find ~0.11). */
  hz: 0.11,
  /** The bar has swept the inner disc of most of its dust, kpc. */
  holeRadius: 3.2,
  /** Outer truncation of the dust disc, kpc. */
  outerRadius: 17,
  /** Molecular ring: radius, width (1 sigma) and peak extinction, kpc and mag/kpc. */
  ring: { r: 4.6, sigma: 0.6, peak: 2.0 },
  /** Bar dust lanes: offset from the major axis, width (1 sigma), length, peak extinction. */
  barLane: { offset: 0.25, width: 0.1, length: 3.4, peak: 4 },
  /** Central Molecular Zone: sigmas along / across the bar, kpc, and peak extinction. */
  cmz: { su: 0.15, sv: 0.07, peak: 160 },
  /** Local Bubble: centre (offset from the Sun, kpc), inner and outer radii (kpc), floor factor. */
  bubble: { offset: [0.0, 0.0, 0.0] as Vec3, inner: 0.07, outer: 0.15, floor: 0.15 },
  /** A_lambda / A_V for the display R, G, B channels (Cardelli et al. 1989, R_V = 3.1). */
  rgb: [0.78, 1.0, 1.3] as const,
};

/** Half-size of the dust map, kpc. */
export const DUST_MAP_EXTENT_KPC = 20;

export interface DustMap {
  size: number;
  extentKpc: number;
  /** Row-major (y rows, x columns) mid-plane extinction, mag/kpc. */
  data: Float32Array;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Mid-plane extinction per kpc at a Galactocentric point (kpc), before the Local Bubble. */
export function midplaneExtinction(x: number, y: number): number {
  const r = Math.hypot(x, y);
  const radial = Math.exp(-(r - R0_KPC) / DUST.rd) * (1 - Math.exp(-((r / DUST.holeRadius) ** 4))) * Math.exp(-((r / DUST.outerRadius) ** 8));
  // Dust lanes: arm profile evaluated slightly outward, so the peak lies inside the stellar arm.
  const s = r > 1e-6 ? (r + DUST.armOffset) / r : 1;
  const lanes = armEnhancement(x * s, y * s);
  let a = radial * (DUST.a0 + DUST.arm * lanes) + DUST.ring.peak * Math.exp(-0.5 * ((r - DUST.ring.r) / DUST.ring.sigma) ** 2);

  // Bar frame: u along the major axis (near end toward positive l), v across it.
  const [ax, ay] = BAR_AXIS;
  const u = x * ax + y * ay;
  const v = -x * ay + y * ax;
  // The Galaxy rotates clockwise seen from the north, so the leading edge is at v < 0 for u > 0.
  const L = DUST.barLane;
  const lane = (side: number) => {
    const uu = side * u;
    const along = smoothstep(0.15, 0.5, uu) * (1 - smoothstep(L.length - 0.8, L.length, uu));
    return along * Math.exp(-0.5 * ((v + side * L.offset) / L.width) ** 2);
  };
  a += L.peak * (lane(1) + lane(-1));
  a += DUST.cmz.peak * Math.exp(-0.5 * ((u / DUST.cmz.su) ** 2 + (v / DUST.cmz.sv) ** 2));
  return a;
}

export function buildDustMap(size = 512, extentKpc = DUST_MAP_EXTENT_KPC): DustMap {
  const data = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    const y = ((j + 0.5) / size) * 2 * extentKpc - extentKpc;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 * extentKpc - extentKpc;
      data[j * size + i] = midplaneExtinction(x, y);
    }
  }
  return { size, extentKpc, data };
}

/** Bilinear lookup matching GPU linear filtering with clamp-to-edge. */
export function sampleDustMap(map: DustMap, x: number, y: number): number {
  const n = map.size;
  const fx = ((x / (2 * map.extentKpc) + 0.5) * n - 0.5);
  const fy = ((y / (2 * map.extentKpc) + 0.5) * n - 0.5);
  const cx = Math.min(n - 1, Math.max(0, fx));
  const cy = Math.min(n - 1, Math.max(0, fy));
  const i0 = Math.floor(cx);
  const j0 = Math.floor(cy);
  const i1 = Math.min(n - 1, i0 + 1);
  const j1 = Math.min(n - 1, j0 + 1);
  const tx = cx - i0;
  const ty = cy - j0;
  const d = map.data;
  const top = d[j0 * n + i0]! * (1 - tx) + d[j0 * n + i1]! * tx;
  const bottom = d[j1 * n + i0]! * (1 - tx) + d[j1 * n + i1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Local Bubble centre in the Galactocentric frame, kpc. */
export const BUBBLE_CENTER_KPC: Vec3 = [-R0_PC / 1000 + DUST.bubble.offset[0], DUST.bubble.offset[1], Z0_PC / 1000 + DUST.bubble.offset[2]];

function bubbleFactor(x: number, y: number, z: number): number {
  const d = Math.hypot(x - BUBBLE_CENTER_KPC[0], y - BUBBLE_CENTER_KPC[1], z - BUBBLE_CENTER_KPC[2]);
  const b = DUST.bubble;
  return b.floor + (1 - b.floor) * smoothstep(b.inner, b.outer, d);
}

/** Integral of exp(-|z'|/hz) from 0 to z (odd, monotonic, bounded by +-hz). */
function vertF(z: number): number {
  return Math.sign(z) * DUST.hz * (1 - Math.exp(-Math.abs(z) / DUST.hz));
}

function vertFInv(u: number): number {
  const a = Math.min(Math.abs(u) / DUST.hz, 1 - 1e-9);
  return -Math.sign(u) * DUST.hz * Math.log(1 - a);
}

// --- Nearby molecular clouds ------------------------------------------------------------

export interface DustCloud {
  id: string;
  name: string;
  /** Galactic longitude and latitude (deg) and distance from the Sun (pc) of the centre. */
  l: number;
  b: number;
  distPc: number;
  /** Gaussian radius (1 sigma), pc. */
  sigmaPc: number;
  /** V extinction through the centre, as seen from the Sun, mag. */
  peakAv: number;
}

/**
 * The Gould Belt and other nearby dark-cloud complexes, as Gaussian blobs of dust on the
 * wall of the Local Bubble and beyond. Distances follow Zucker et al. 2019/2020 (Gaia
 * parallaxes of stars behind and in front of each cloud); sizes and peak extinctions are
 * smooth-cloud approximations, far below the dense cores.
 */
export const DUST_CLOUDS: readonly DustCloud[] = [
  { id: 'taurus', name: 'Taurus clouds', l: 172, b: -15, distPc: 140, sigmaPc: 7, peakAv: 2.5 },
  { id: 'rho-oph', name: 'Rho Ophiuchi cloud', l: 353, b: 17, distPc: 139, sigmaPc: 4, peakAv: 2.2 },
  { id: 'lupus', name: 'Lupus clouds', l: 340, b: 13, distPc: 160, sigmaPc: 6, peakAv: 1.2 },
  { id: 'chamaeleon', name: 'Chamaeleon clouds', l: 299, b: -16, distPc: 185, sigmaPc: 6, peakAv: 2 },
  { id: 'coalsack', name: 'Coalsack', l: 301, b: -1, distPc: 185, sigmaPc: 6, peakAv: 1.5 },
  { id: 'cra', name: 'Corona Australis cloud', l: 0, b: -18, distPc: 150, sigmaPc: 3, peakAv: 2 },
  { id: 'pipe', name: 'Pipe Nebula', l: 0, b: 5, distPc: 160, sigmaPc: 3, peakAv: 2 },
  { id: 'perseus', name: 'Perseus molecular cloud', l: 159, b: -20, distPc: 295, sigmaPc: 10, peakAv: 2 },
  { id: 'orion-a', name: 'Orion A cloud', l: 211, b: -19, distPc: 410, sigmaPc: 14, peakAv: 2.5 },
  { id: 'orion-b', name: 'Orion B cloud', l: 206, b: -15, distPc: 410, sigmaPc: 9, peakAv: 2 },
  { id: 'cepheus', name: 'Cepheus Flare', l: 110, b: 15, distPc: 350, sigmaPc: 15, peakAv: 1.2 },
  { id: 'aquila-rift', name: 'Aquila Rift', l: 28, b: 4, distPc: 250, sigmaPc: 25, peakAv: 2.5 },
  { id: 'cygnus-rift', name: 'Cygnus Rift', l: 78, b: 0, distPc: 800, sigmaPc: 60, peakAv: 2 },
];

/** Cloud centres (Galactocentric kpc), sigmas (kpc) and the constant k = rho0 sigma sqrt(pi/2) of the line integral. */
export const CLOUD_PARAMS: readonly { center: Vec3; sigma: number; k: number }[] = DUST_CLOUDS.map((c) => {
  const lr = c.l * (Math.PI / 180);
  const br = c.b * (Math.PI / 180);
  const d = c.distPc / 1000;
  const center: Vec3 = [-R0_PC / 1000 + d * Math.cos(br) * Math.cos(lr), d * Math.cos(br) * Math.sin(lr), Z0_PC / 1000 + d * Math.sin(br)];
  const sigma = c.sigmaPc / 1000;
  // Peak column through the centre = rho0 sigma sqrt(2 pi); the line integral uses rho0 sigma sqrt(pi/2).
  return { center, sigma, k: c.peakAv / 2 };
});

/** Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7); the shader uses the same formula. */
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/**
 * Extinction (mag) by the nearby clouds along the segment a -> b (Galactocentric kpc).
 * The line integral of a Gaussian blob is closed-form:
 *   A = rho0 sigma sqrt(pi/2) exp(-c/2) [erf((1+beta)|v|/sqrt2) - erf(beta|v|/sqrt2)]
 * with o = (a - centre)/sigma, v = (b - a)/sigma, beta = o.v/|v|^2, c = |o|^2 - (o.v)^2/|v|^2.
 */
export function cloudExtinction(a: Vec3, b: Vec3): number {
  let sum = 0;
  for (const cl of CLOUD_PARAMS) {
    const ox = (a[0] - cl.center[0]) / cl.sigma;
    const oy = (a[1] - cl.center[1]) / cl.sigma;
    const oz = (a[2] - cl.center[2]) / cl.sigma;
    const vx = (b[0] - a[0]) / cl.sigma;
    const vy = (b[1] - a[1]) / cl.sigma;
    const vz = (b[2] - a[2]) / cl.sigma;
    const vv = vx * vx + vy * vy + vz * vz;
    if (vv < 1e-12) continue;
    const ov = ox * vx + oy * vy + oz * vz;
    const c = ox * ox + oy * oy + oz * oz - (ov * ov) / vv;
    if (c > 30) continue;
    const vl = Math.sqrt(vv);
    const beta = ov / vv;
    sum += cl.k * Math.exp(-c / 2) * (erf(((1 + beta) * vl) / Math.SQRT2) - erf((beta * vl) / Math.SQRT2));
  }
  return sum;
}

/**
 * V-band extinction (mag) along the straight path from `a` to `b` (Galactocentric kpc):
 * the smooth Galactic dust plus the nearby clouds. `jitter` in [0, 1) offsets the samples
 * within their strata.
 */
export function extinctionV(map: DustMap, a: Vec3, b: Vec3, samples = 48, jitter = 0.5): number {
  return smoothExtinctionV(map, a, b, samples, jitter) + cloudExtinction(a, b);
}

function smoothExtinctionV(map: DustMap, a: Vec3, b: Vec3, samples: number, jitter: number): number {
  const rel: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(rel[0], rel[1], rel[2]);
  if (len === 0) return 0;
  const dz = rel[2];
  const vertical = Math.abs(dz) > 1e-4;
  const Fa = vertF(a[2]);
  const Fb = vertF(a[2] + dz);
  // Integral of the vertical profile along the path, kpc.
  const iv = vertical ? ((Fb - Fa) / dz) * len : Math.exp(-Math.abs(a[2]) / DUST.hz) * len;
  if (iv < 1e-9) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const f = (i + jitter) / samples;
    const t = vertical ? Math.min(1, Math.max(0, (vertFInv(Fa + (Fb - Fa) * f) - a[2]) / dz)) : f;
    const x = a[0] + rel[0] * t;
    const y = a[1] + rel[1] * t;
    const z = a[2] + rel[2] * t;
    sum += sampleDustMap(map, x, y) * bubbleFactor(x, y, z);
  }
  return (iv * sum) / samples;
}

/** Per-channel attenuation factors (linear) for a V-band extinction. */
export function reddeningFactors(av: number): [number, number, number] {
  return [10 ** (-0.4 * av * DUST.rgb[0]), 10 ** (-0.4 * av * DUST.rgb[1]), 10 ** (-0.4 * av * DUST.rgb[2])];
}

let sharedMap: DustMap | null = null;

/** The dust map at default resolution, built once per thread on first use. */
export function defaultDustMap(): DustMap {
  return (sharedMap ??= buildDustMap());
}
