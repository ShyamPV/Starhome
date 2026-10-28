/**
 * The "glow" layer: aggregate particles that each stand for many stars, distributed
 * like the Galaxy's light. Seen from afar they form the spiral disc; seen from inside
 * they form the Milky Way band. The renderer fades them out around the camera, where
 * finer level-of-detail shells (tiles.ts, cells.ts) take over.
 */
import { SUN_ABS_MAG_V, type Vec3 } from '@starhome/astro';
import { StarBufferBuilder, type StarBuffers } from './buffers';
import { componentColor, type LightComponent } from './light';
import {
  BAR,
  DISC,
  NUCLEAR_DISC,
  SATELLITES,
  SPIRAL_ARMS,
  armEnhancement,
  armRadius,
  armWidth,
  barFrameToGalactocentric,
  satelliteToGalactocentric,
  xyFromRBeta,
  type Satellite,
  type SpiralArm,
} from './model';
import { LIGHT_TO_MASS } from './populations';
import { Rng, hash32 } from './rng';

/**
 * V-band luminosity of each component, L_sun (total ~2.5e10): the density model integrated
 * with the populations' light-to-mass ratios (integrateComponentLight; checked in tests).
 */
export const COMPONENT_LUMINOSITY = {
  young: 2.65e9,
  thin: 1.57e10,
  bulge: 3.73e9,
  thick: 2.84e9,
  halo: 4.85e8,
} as const;

const MIN_SHARE: Record<string, number> = { halo: 0.02, thick: 0.05, lmc: 0.04, smc: 0.015, 'sgr-dsph': 0.004 };

/** Fraction of the bulge's mass in the nuclear stellar disc (Launhardt et al. 2002 vs the bar). */
const NUCLEAR_FRACTION = (() => {
  const nuclear = NUCLEAR_DISC.rho0 * 2 * Math.PI * NUCLEAR_DISC.rd ** 2 * 2 * NUCLEAR_DISC.hz;
  const bar = BAR.rho0 * (2 * Math.PI) ** 1.5 * BAR.x0 * BAR.y0 * BAR.z0;
  return nuclear / (nuclear + bar);
})();

function absMagFromLum(l: number): number {
  return SUN_ABS_MAG_V - 2.5 * Math.log10(l);
}

function gammaDiscRadius(rng: Rng, rd: number, rMax: number): number {
  for (;;) {
    const r = -rd * (Math.log(rng.nextOpen()) + Math.log(rng.nextOpen()));
    if (r < rMax) return r;
  }
}

function discHoleAccept(rng: Rng, r: number): boolean {
  return rng.next() < 1 - Math.exp(-((r / DISC.holeRadius) ** 3));
}

function pickArm(rng: Rng): SpiralArm {
  const weights = SPIRAL_ARMS.map((a) => a.strength * (a.betaMax - a.betaMin) * 0.5 * (armRadius(a, a.betaMin) + armRadius(a, a.betaMax)));
  let u = rng.next() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < SPIRAL_ARMS.length; i++) {
    u -= weights[i]!;
    if (u <= 0) return SPIRAL_ARMS[i]!;
  }
  return SPIRAL_ARMS[SPIRAL_ARMS.length - 1]!;
}

/** A point on an arm centre line, uniform in arc length, in kpc. */
function pointOnArm(rng: Rng): { x: number; y: number; r: number; arm: SpiralArm } {
  for (;;) {
    const arm = pickArm(rng);
    const beta = rng.range(arm.betaMin, arm.betaMax);
    const r = armRadius(arm, beta);
    const rMax = Math.max(armRadius(arm, arm.betaMin), armRadius(arm, arm.betaMax));
    if (rng.next() * rMax > r) continue;
    const dr = rng.normal() * armWidth(arm, r);
    const [x, y] = xyFromRBeta(r + dr, beta);
    return { x, y, r: r + dr, arm };
  }
}

/** Sample a point (kpc) from a satellite's density profile (model.ts satelliteDensity). */
function pointInSatellite(rng: Rng, sat: Satellite): Vec3 {
  const [cx, cy, cz] = sat.center;
  const sh = sat.shape;
  if (sh.kind === 'disc') {
    let d: [number, number, number];
    if (rng.next() < sh.barFraction) {
      d = [rng.normal() * sh.bar[0], rng.normal() * sh.bar[1], rng.normal() * sh.bar[2]];
    } else {
      const r = gammaDiscRadius(rng, sh.rd, 3 * sat.radius);
      const phi = rng.next() * 2 * Math.PI;
      d = [r * Math.cos(phi), r * Math.sin(phi), rng.laplace(sh.hz)];
    }
    const g = satelliteToGalactocentric(sh, d);
    return [cx + g[0], cy + g[1], cz + g[2]];
  }
  // Triaxial Gaussian: isotropic core sigma[0] plus the long axis.
  const along = rng.normal() * Math.sqrt(Math.max(0, sh.sigma[2] ** 2 - sh.sigma[0] ** 2));
  return [
    cx + rng.normal() * sh.sigma[0] + along * sh.axis[0],
    cy + rng.normal() * sh.sigma[0] + along * sh.axis[1],
    cz + rng.normal() * sh.sigma[0] + along * sh.axis[2],
  ];
}

/** Which population a satellite particle's light comes from, weighted by light. */
function satelliteComponent(rng: Rng, sat: Satellite): LightComponent {
  const y = sat.mix.young * LIGHT_TO_MASS.young;
  const t = sat.mix.thin * LIGHT_TO_MASS.thin;
  const o = sat.mix.old * LIGHT_TO_MASS.old;
  const u = rng.next() * (y + t + o);
  return u < y ? 'young' : u < y + t ? 'thin' : 'halo';
}

export interface GlowOptions {
  count: number;
  seed: number;
}

export function generateGlow({ count, seed }: GlowOptions): StarBuffers {
  const rng = new Rng(hash32(seed, 0x6c0));
  const origin: Vec3 = [0, 0, 0];
  const out = new StarBufferBuilder(origin, count + 16);

  const budgets: { id: string; lum: number }[] = [
    ...Object.entries(COMPONENT_LUMINOSITY).map(([id, lum]) => ({ id, lum })),
    ...SATELLITES.map((s) => ({ id: s.id, lum: s.luminosity })),
  ];
  const totalLum = budgets.reduce((s, b) => s + b.lum, 0);
  const shares = budgets.map((b) => Math.max(b.lum / totalLum, MIN_SHARE[b.id] ?? 0));
  const shareSum = shares.reduce((s, x) => s + x, 0);

  budgets.forEach((b, i) => {
    const n = Math.max(1, Math.round((count * shares[i]!) / shareSum));
    const meanLum = b.lum / n;
    // Lognormal scatter of 0.35 dex, renormalised to keep the total luminosity.
    const sigma = 0.35;
    const norm = 10 ** (-0.5 * sigma * sigma * Math.LN10);
    const lum = () => meanLum * norm * 10 ** (sigma * rng.normal());
    const kpc = (x: number, y: number, z: number, rgb: [number, number, number], l: number) =>
      out.add(x * 1000, y * 1000, z * 1000, rgb, absMagFromLum(l));

    switch (b.id) {
      case 'young': {
        // OB associations: clumps strung along the arms, plus a diffuse young disc.
        const clumps: { x: number; y: number }[] = [];
        const nClumps = Math.max(1, Math.round(n / 60));
        for (let k = 0; k < nClumps; k++) clumps.push(pointOnArm(rng));
        for (let k = 0; k < n; k++) {
          let x: number;
          let y: number;
          const u = rng.next();
          if (u < 0.45) {
            const c = clumps[Math.floor(rng.next() * clumps.length)]!;
            x = c.x + rng.normal() * 0.06;
            y = c.y + rng.normal() * 0.06;
          } else if (u < 0.85) {
            ({ x, y } = pointOnArm(rng));
          } else {
            let r: number;
            do r = gammaDiscRadius(rng, DISC.young.rd, 18);
            while (!discHoleAccept(rng, r));
            const phi = rng.next() * 2 * Math.PI;
            x = r * Math.cos(phi);
            y = r * Math.sin(phi);
          }
          kpc(x, y, rng.laplace(DISC.young.hz), componentColor('young', rng), lum());
        }
        break;
      }
      case 'thin': {
        for (let k = 0; k < n; k++) {
          let r: number;
          let x: number;
          let y: number;
          for (;;) {
            r = gammaDiscRadius(rng, DISC.thin.rd, 20);
            if (!discHoleAccept(rng, r)) continue;
            const phi = rng.next() * 2 * Math.PI;
            x = r * Math.cos(phi);
            y = r * Math.sin(phi);
            // Same arm modulation as the density model.
            if (rng.next() * (1 + 1.7 * DISC.thinArmContrast) < 1 + DISC.thinArmContrast * armEnhancement(x, y)) break;
          }
          kpc(x, y, rng.laplace(DISC.thin.hz), componentColor('thin', rng), lum());
        }
        break;
      }
      case 'thick': {
        for (let k = 0; k < n; k++) {
          const r = gammaDiscRadius(rng, DISC.thick.rd, 20);
          const phi = rng.next() * 2 * Math.PI;
          kpc(r * Math.cos(phi), r * Math.sin(phi), rng.laplace(DISC.thick.hz), componentColor('thick', rng), lum());
        }
        break;
      }
      case 'bulge': {
        for (let k = 0; k < n; k++) {
          if (rng.next() < NUCLEAR_FRACTION) {
            const r = gammaDiscRadius(rng, NUCLEAR_DISC.rd, 0.5);
            const phi = rng.next() * 2 * Math.PI;
            kpc(r * Math.cos(phi), r * Math.sin(phi), rng.laplace(NUCLEAR_DISC.hz), componentColor('bulge', rng), lum());
            continue;
          }
          const u = rng.normal() * BAR.x0;
          const v = rng.normal() * BAR.y0;
          // Boxy/peanut shape: vertical extent grows away from the centre along the bar.
          const z = rng.normal() * BAR.z0 * (0.7 + 0.35 * Math.min(1.5, Math.abs(u) / BAR.x0));
          const [x, y] = barFrameToGalactocentric(u, v);
          kpc(x, y, z, componentColor('bulge', rng), lum());
        }
        break;
      }
      case 'halo': {
        // Power law rho ~ r^-3.5 between 1 and 100 kpc, flattened to q = 0.65.
        const a = 1 ** -0.5;
        const bb = 100 ** -0.5;
        for (let k = 0; k < n; k++) {
          const r = (a - rng.next() * (a - bb)) ** -2;
          const cz = rng.range(-1, 1);
          const phi = rng.next() * 2 * Math.PI;
          const s = Math.sqrt(1 - cz * cz);
          kpc(r * s * Math.cos(phi), r * s * Math.sin(phi), r * cz * 0.65, componentColor('halo', rng), lum());
        }
        break;
      }
      default: {
        const sat = SATELLITES.find((s) => s.id === b.id)!;
        for (let k = 0; k < n; k++) {
          const [x, y, z] = pointInSatellite(rng, sat);
          kpc(x, y, z, componentColor(satelliteComponent(rng, sat), rng), lum());
        }
      }
    }
  });

  return out.build();
}
