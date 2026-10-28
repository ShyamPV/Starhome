/**
 * Volumetric nebula models: parametric 3D structure for each kind of nebula, sampled
 * into a small RGBA volume the renderer raymarches. Channels are emission in Halpha,
 * [O III] and a third line or continuum (see NebulaPalette), plus dust.
 *
 * Coordinates are the nebula's unit box [-1, 1]^3 with +z pointing at the Sun (so
 * "behind" is -z) and +x along the position angle on the sky. The structure is modeled
 * from each object's published morphology (blisters, shells, pillars, lobes, filaments);
 * fine detail is fractal noise. Position, distance, size and total brightness are real.
 *
 * Physical layering: [O III] needs the hardest photons, so it is concentrated near the
 * ionising stars; Halpha fills the ionised volume; [S II] glows near the ionisation front.
 */
import type { Vec3 } from '@starhome/astro';
import { hash32, valueNoise } from './rng';

export interface DarkLane {
  /** Unit normal of the lane's plane, nebula unit coordinates. */
  normal: Vec3;
  offset: number;
  width: number;
  /** Peak dust density (relative). */
  strength: number;
}

export type NebulaModel =
  | { shape: 'blister'; lanes?: DarkLane[] }
  | { shape: 'pillars' }
  | { shape: 'shell'; inner: number; outer: number }
  | { shape: 'complex'; lanes?: DarkLane[] }
  | { shape: 'horsehead' }
  | { shape: 'ring' }
  | { shape: 'helix' }
  | { shape: 'bipolar'; waist: number }
  | { shape: 'crab' }
  | { shape: 'snr-shell' }
  | { shape: 'reflection' };

/** What the third colour channel holds. */
export type NebulaPalette = 'emission' | 'reflection' | 'synchrotron';

export interface NebulaRequest {
  seed: number;
  model: NebulaModel;
  /** Voxels per axis. */
  res: number;
  /** Ionising or illuminating stars, nebula unit coordinates (default: the centre). */
  sources?: Vec3[];
}

export interface NebulaVolume {
  res: number;
  /** RGBA, x fastest; each channel stores sqrt(value / channel max) for precision. */
  data: Uint8Array;
  /** Relative strength of the three emission channels (largest = 1). */
  channelScale: [number, number, number];
  /** Sum over voxels of the decoded, scaled emission, times the voxel volume in unit-box units. */
  emissionSum: number;
  /** Largest dust column straight through the box along z, in unit-box lengths. */
  maxDustColumn: number;
}

function fbm(x: number, y: number, z: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f + seed * 0.37, y * f - seed * 0.11, z * f + seed * 0.23);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - 0.5 ** octaves);
}

/** Ridged noise: thin bright filaments where the noise crosses its middle value. */
function ridged(x: number, y: number, z: number, octaves: number, seed: number): number {
  const n = fbm(x, y, z, octaves, seed);
  return (1 - Math.abs(2 * n - 1)) ** 3;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function laneDust(p: Vec3, lanes: DarkLane[] | undefined, n: number, seed: number): number {
  if (!lanes) return 0;
  let d = 0;
  // Lanes meander: their centre line wanders with low-frequency noise.
  const wander = 0.18 * (fbm(p[0] * 1.3, p[1] * 1.3, p[2] * 1.3, 3, seed + 11) - 0.5);
  for (const l of lanes) {
    const s = p[0] * l.normal[0] + p[1] * l.normal[1] + p[2] * l.normal[2] - l.offset + wander;
    d += l.strength * Math.exp(-0.5 * (s / l.width) ** 2) * (0.5 + n);
  }
  return d;
}

type Sample = [number, number, number, number];

/** Evaluate one model at a point: [Halpha, [O III], third channel, dust]. */
function evaluate(model: NebulaModel, p: Vec3, seed: number, sources: Vec3[]): Sample {
  const [x, y, z] = p;
  const r = Math.hypot(x, y, z);
  // Distance to the nearest source drives the ionisation layering.
  let rs = Infinity;
  for (const s of sources) rs = Math.min(rs, Math.hypot(x - s[0], y - s[1], z - s[2]));
  const n = fbm(x * 2.2, y * 2.2, z * 2.2, 5, seed);
  const clump = n * n * 2.2;

  switch (model.shape) {
    case 'blister':
    case 'complex': {
      // Ionised cavity carved out of the front of a molecular cloud (Orion-like): bright
      // gas in front of a dusty wall behind; for 'complex', several lumpy regions.
      const radius = model.shape === 'complex' ? 0.9 : 0.8;
      const body = 1 - smoothstep(radius * 0.55, radius, r + 0.25 * (n - 0.5));
      const ion = body * clump;
      // Gas is densest, and glows most (emission ~ density squared), near the ionising stars.
      const core = 1 + 10 * Math.exp(-rs / 0.16);
      const ha = ion * ion * core;
      // [O III] lies close to the hottest stars; it carries most of the visible (V-band) light.
      const oiii = ha * Math.exp(-rs / 0.3) * 2.5;
      const front = smoothstep(radius * 0.45, radius * 0.8, r) * (1 - smoothstep(radius * 0.8, radius, r));
      const sii = ha * front * 1.5;
      const wall = smoothstep(-0.15, -0.55, z) * (0.4 + n) * 1.2;
      const dust = wall + laneDust(p, model.lanes, n, seed);
      return [ha, oiii, sii, dust];
    }
    case 'pillars': {
      // Eagle Nebula: a cavity around the cluster with dusty columns pointing at it.
      // The glow comes mostly from the cavity wall behind the pillars; little gas lies in front.
      const cavity = (1 - smoothstep(0.7, 0.95, r)) * clump * (1 + 1.5 * Math.exp(-rs / 0.35)) * smoothstep(0.35, 0.05, z);
      let dust = smoothstep(-0.1, -0.6, z) * (0.3 + n);
      let rim = 0;
      // On the near side of the cavity, so we see them in silhouette against its glow.
      const pillars: [number, number, number][] = [
        [-0.22, 0.25, 0.75],
        [0.0, 0.3, 0.9],
        [0.2, 0.2, 0.65],
      ];
      for (const [px, pz, h] of pillars) {
        // Columns rising from the cavity floor (-y) toward the cluster at the centre.
        const along = (y + 0.8) / h;
        if (along < 0 || along > 1.15) continue;
        // Rounded tips instead of flat-cut tops.
        const tip = 1 - smoothstep(0.8, 1.15, along);
        const width = 0.075 * (1.25 - 0.6 * along) * (0.8 + 0.4 * n);
        const d = Math.hypot(x - px - 0.05 * Math.sin(along * 3), z - pz) / width;
        const core = Math.exp(-0.5 * d * d) * tip;
        dust += 10 * core;
        // Bright ionised skins where the cluster light strikes the columns; brightest at the tips.
        rim += Math.exp(-0.5 * ((d - 1.15) / 0.4) ** 2) * (0.2 + 1.2 * along ** 4) * tip;
      }
      const ha = cavity * cavity + rim;
      return [ha, ha * Math.exp(-rs / 0.3), rim * 1.2 + cavity * cavity * 0.2, dust];
    }
    case 'shell': {
      // Rosette: a thick shell with a central cavity blown out by the cluster's winds.
      const shell = smoothstep(model.inner - 0.1, model.inner + 0.1, r) * (1 - smoothstep(model.outer - 0.1, model.outer + 0.1, r));
      const ha = (shell * clump) ** 2;
      const oiii = ha * (1 - smoothstep(model.inner, model.outer, r)) * 1.3;
      const sii = ha * smoothstep(model.inner, model.outer, r);
      const globules = (1 - smoothstep(0.6, 0.75, fbm(x * 5, y * 5, z * 5, 3, seed + 7))) * shell * 0.8;
      return [ha, oiii, sii, globules + smoothstep(model.outer - 0.05, 1, r) * 0.6 * n];
    }
    case 'horsehead': {
      // IC 434: a glowing curtain behind; Barnard 33 rising from the dark cloud in front.
      const curtain = Math.exp(-0.5 * ((z + 0.45) / 0.18) ** 2) * (0.6 + 0.8 * n) * smoothstep(-1, -0.4, y + 0.3 * x);
      const ha = curtain * curtain;
      const zf = Math.exp(-0.5 * ((z - 0.1) / 0.25) ** 2);
      const cloud = smoothstep(-0.25, -0.35, y + 0.08 * (n - 0.5));
      // Head and muzzle: two ellipses on top of a neck.
      const head = Math.exp(-0.5 * (((x - 0.05) / 0.16) ** 2 + ((y - 0.08) / 0.2) ** 2));
      const muzzle = Math.exp(-0.5 * (((x + 0.14) / 0.13) ** 2 + ((y - 0.18) / 0.08) ** 2));
      const neck = Math.exp(-0.5 * ((x / 0.12) ** 2)) * smoothstep(0.1, -0.3, y);
      const dust = zf * (cloud + 1.6 * Math.max(head, muzzle, neck * (y > -0.35 ? 1 : 0))) * 4;
      return [ha, ha * 0.05, ha * 0.4, dust];
    }
    case 'ring': {
      // Ring Nebula: a barrel-shaped (prolate) shell seen almost end-on, so it looks like a
      // ring; [O III] fills the inside, a red rim lies outside. The ends are open and faint.
      const rho = Math.hypot(x, y);
      const rz = Math.abs(z) / 0.9;
      const shellR = 0.62 * Math.sqrt(Math.max(0, 1 - rz * rz * 0.75));
      const barrel = Math.exp(-0.5 * ((rho - shellR) / 0.11) ** 2) * (1 - smoothstep(0.45, 0.85, Math.abs(z)));
      const inner = (1 - smoothstep(0.2, 0.55, Math.hypot(rho, z * 0.8))) * 0.8;
      const ha = barrel * (0.7 + 0.6 * n);
      return [ha * ha, (inner * 0.5 + barrel * 0.4) * (0.8 + 0.4 * n), ha * ha * smoothstep(0.55, 0.75, rho) * 1.5, barrel * 0.2 * n];
    }
    case 'helix': {
      // Helix: two nearly perpendicular rings (a bipolar shell seen near pole-on) and knots.
      const ring = (u: number, v: number, w: number, R: number) => Math.exp(-0.5 * ((Math.hypot(u, v) - R) / 0.09) ** 2) * Math.exp(-0.5 * (w / 0.2) ** 2);
      const a = ring(x, y, z, 0.62);
      const c = Math.cos(1.1);
      const s = Math.sin(1.1);
      const b = ring(x, y * c - z * s, y * s + z * c, 0.5) * 0.7;
      const knots = (1 - smoothstep(0.55, 0.7, fbm(x * 9, y * 9, z * 9, 2, seed + 3))) * (a + b);
      const ha = (a + b) * (0.6 + 0.6 * n);
      return [ha * ha, (1 - smoothstep(0.2, 0.55, r)) * 0.5 * (0.7 + 0.6 * n), ha * ha * 0.8, knots * 1.5];
    }
    case 'bipolar': {
      // Cat's Eye / Dumbbell: a bright waist and two lobes along y, with nested shells.
      const w = model.waist;
      const lobe = (sgn: number) => Math.exp(-0.5 * ((Math.hypot(x / 0.5, (y - sgn * 0.45) / 0.55, z / 0.5) - 1) / 0.22) ** 2);
      const lobes = lobe(1) + lobe(-1);
      const waist = Math.exp(-0.5 * ((Math.hypot(x / w, y / (w * 0.6), z / w) - 1) / 0.25) ** 2);
      const shells = 0.5 + 0.5 * Math.cos(r * 28 + n * 4);
      const ha = (lobes * 0.8 + waist) * (0.6 + 0.6 * n);
      return [ha * ha * 0.8, (ha * shells + (1 - smoothstep(0.1, 0.35, r)) * 0.8) ** 2, ha * ha * smoothstep(0.3, 0.8, r), 0];
    }
    case 'crab': {
      // Crab Nebula: a filled ellipsoid of synchrotron light caged by Halpha filaments.
      const e = Math.hypot(x / 0.95, y / 0.7, z / 0.75);
      const body = 1 - smoothstep(0.75, 1, e);
      const fil = ridged(x * 3, y * 3, z * 3, 4, seed) * smoothstep(0.4, 0.9, e) * body;
      return [fil * 2, fil * 0.6, body * (0.6 + 0.4 * n) * Math.exp(-e), fil * 0.1];
    }
    case 'snr-shell': {
      // Veil / Cygnus Loop: a thin, wrinkled shock shell; [O III] runs just outside Halpha.
      const wobble = 0.08 * (fbm(x * 1.5, y * 1.5, z * 1.5, 3, seed + 5) - 0.5);
      const fil = ridged(x * 4, y * 4, z * 4, 4, seed);
      const ha = Math.exp(-0.5 * ((r - 0.84 - wobble) / 0.045) ** 2) * fil;
      const oiii = Math.exp(-0.5 * ((r - 0.88 - wobble) / 0.045) ** 2) * fil;
      return [ha * 1.5, oiii * 1.5, ha * 0.6, 0];
    }
    case 'reflection': {
      // Pleiades: wispy dust the cluster happens to be passing through, lit by its stars.
      const wisps = fbm(x * 1.6, y * 4, z * 1.6, 5, seed);
      const dust = smoothstep(0.45, 0.8, wisps) * (1 - smoothstep(0.7, 1, r));
      let light = 0;
      // Softened inverse square, so the nebulosity glows between the stars too.
      for (const s of sources) light += 1 / ((x - s[0]) ** 2 + (y - s[1]) ** 2 + (z - s[2]) ** 2 + 0.06);
      return [dust * light, 0, 0, dust * 0.3];
    }
  }
}

/** Sample a nebula model into a volume (runs in a worker). */
export function generateNebula(req: NebulaRequest): NebulaVolume {
  const { res, model } = req;
  const seed = hash32(req.seed) % 1000;
  const sources = req.sources?.length ? req.sources : [[0, 0, 0] as Vec3];
  const raw = new Float32Array(res * res * res * 4);
  const max = [0, 0, 0, 0];
  for (let k = 0; k < res; k++)
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) {
        const p: Vec3 = [((i + 0.5) / res) * 2 - 1, ((j + 0.5) / res) * 2 - 1, ((k + 0.5) / res) * 2 - 1];
        const s = evaluate(model, p, seed, sources);
        // Fade everything toward the inscribed sphere, so neither glow nor dust shows the box.
        const edge = 1 - smoothstep(0.8, 1, Math.hypot(p[0], p[1], p[2]));
        const o = ((k * res + j) * res + i) * 4;
        for (let c = 0; c < 4; c++) {
          const v = Math.max(0, s[c]! * edge);
          raw[o + c] = v;
          if (v > max[c]!) max[c] = v;
        }
      }

  const data = new Uint8Array(res * res * res * 4);
  const top = Math.max(max[0]!, max[1]!, max[2]!) || 1;
  const channelScale: [number, number, number] = [max[0]! / top, max[1]! / top, max[2]! / top];
  const voxel = (2 / res) ** 3;
  let emissionSum = 0;
  const columns = new Float64Array(res * res);
  for (let v = 0; v < res * res * res; v++) {
    let w = 0;
    for (let c = 0; c < 4; c++) {
      const m = max[c]! || 1;
      const q = Math.round(Math.sqrt(raw[v * 4 + c]! / m) * 255);
      data[v * 4 + c] = q;
      const decoded = (q / 255) ** 2;
      if (c < 3) w += decoded * channelScale[c]!;
      else columns[v % (res * res)] = columns[v % (res * res)]! + decoded * (2 / res);
    }
    emissionSum += w * voxel;
  }
  let maxDustColumn = 0;
  for (const c of columns) maxDustColumn = Math.max(maxDustColumn, c);
  return { res, data, channelScale, emissionSum, maxDustColumn };
}
