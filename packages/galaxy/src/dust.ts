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

/**
 * V-band extinction (mag) along the straight path from `a` to `b` (Galactocentric kpc).
 * `jitter` in [0, 1) offsets the samples within their strata.
 */
export function extinctionV(map: DustMap, a: Vec3, b: Vec3, samples = 48, jitter = 0.5): number {
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
