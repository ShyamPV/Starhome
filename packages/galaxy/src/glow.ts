/**
 * The "glow" layer: aggregate particles that each stand for many stars, distributed
 * like the Galaxy's light. Seen from afar they form the spiral disc; seen from inside
 * they form the Milky Way band. The renderer fades them out near the camera, where
 * individually generated stars (cells.ts) take over.
 */
import { SUN_ABS_MAG_V, teffToLinearRgb, type Vec3 } from '@vialactea/astro';
import { StarBufferBuilder, type StarBuffers } from './buffers';
import {
  BAR,
  DISC,
  NUCLEAR_DISC,
  R0_KPC,
  SATELLITES,
  SPIRAL_ARMS,
  armEnhancement,
  armRadius,
  armWidth,
  barFrameToGalactocentric,
  xyFromRBeta,
  type SpiralArm,
} from './model';
import { Rng, hash32 } from './rng';

/** Approximate V-band luminosity budget of each component, L_sun (total ~2.7e10). */
export const COMPONENT_LUMINOSITY = {
  young: 6e9,
  thin: 1.4e10,
  bulge: 5e9,
  thick: 1.5e9,
  halo: 2e8,
} as const;

const MIN_SHARE: Record<string, number> = { halo: 0.02, thick: 0.05, lmc: 0.04, smc: 0.015, 'sgr-dsph': 0.004 };

const HII_RGB: [number, number, number] = [1.0, 0.22, 0.32];

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
    const teffRgb = (logMean: number, logSigma: number) => teffToLinearRgb(10 ** (logMean + logSigma * rng.normal()));

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
          const z = rng.laplace(0.07);
          const kind = rng.next();
          const rgb = kind < 0.1 ? HII_RGB : kind < 0.3 ? teffRgb(Math.log10(8000), 0.05) : teffRgb(Math.log10(14_000), 0.1);
          kpc(x, y, z, rgb, lum());
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
            if (rng.next() * 1.3 < 1 + 0.2 * armEnhancement(x, y)) break;
          }
          kpc(x, y, rng.laplace(DISC.thin.hz), teffRgb(Math.log10(5600), 0.05), lum());
        }
        break;
      }
      case 'thick': {
        for (let k = 0; k < n; k++) {
          const r = gammaDiscRadius(rng, DISC.thick.rd, 20);
          const phi = rng.next() * 2 * Math.PI;
          kpc(r * Math.cos(phi), r * Math.sin(phi), rng.laplace(DISC.thick.hz), teffRgb(Math.log10(5000), 0.03), lum());
        }
        break;
      }
      case 'bulge': {
        for (let k = 0; k < n; k++) {
          if (rng.next() < 0.08) {
            const r = gammaDiscRadius(rng, NUCLEAR_DISC.rd, 0.5) * 0.5;
            const phi = rng.next() * 2 * Math.PI;
            kpc(r * Math.cos(phi), r * Math.sin(phi), rng.laplace(NUCLEAR_DISC.hz), teffRgb(Math.log10(4600), 0.04), lum());
            continue;
          }
          const u = rng.normal() * BAR.x0;
          const v = rng.normal() * BAR.y0;
          // Boxy/peanut shape: vertical extent grows away from the centre along the bar.
          const z = rng.normal() * BAR.z0 * (0.7 + 0.35 * Math.min(1.5, Math.abs(u) / BAR.x0));
          const [x, y] = barFrameToGalactocentric(u, v);
          kpc(x, y, z, teffRgb(Math.log10(4500), 0.04), lum());
        }
        break;
      }
      case 'halo': {
        const a = 1 ** -0.5;
        const bb = 100 ** -0.5;
        for (let k = 0; k < n; k++) {
          const r = (a - rng.next() * (a - bb)) ** -2;
          const cz = rng.range(-1, 1);
          const phi = rng.next() * 2 * Math.PI;
          const s = Math.sqrt(1 - cz * cz);
          kpc(r * s * Math.cos(phi), r * s * Math.sin(phi), r * cz * 0.65, teffRgb(Math.log10(5300), 0.04), lum());
        }
        break;
      }
      default: {
        const sat = SATELLITES.find((s) => s.id === b.id)!;
        const [cx, cy, cz] = sat.center;
        for (let k = 0; k < n; k++) {
          let x: number;
          let y: number;
          let z: number;
          if (sat.id === 'lmc') {
            // Inclined exponential disc plus an off-centre bar.
            const r = rng.next() < 0.2 ? Math.abs(rng.normal()) * 0.5 : gammaDiscRadius(rng, 1.4, 9);
            const phi = rng.next() * 2 * Math.PI;
            const dx = rng.next() < 0.2 ? rng.normal() * 1.4 : r * Math.cos(phi);
            const dy = rng.next() < 0.2 ? rng.normal() * 0.35 : r * Math.sin(phi);
            const dz = rng.laplace(0.25);
            // Tilt ~35 deg about the x axis and ~20 deg about z.
            const t = 35 * (Math.PI / 180);
            const y1 = dy * Math.cos(t) - dz * Math.sin(t);
            const z1 = dy * Math.sin(t) + dz * Math.cos(t);
            const p = 20 * (Math.PI / 180);
            x = cx + dx * Math.cos(p) - y1 * Math.sin(p);
            y = cy + dx * Math.sin(p) + y1 * Math.cos(p);
            z = cz + z1;
          } else if (sat.id === 'smc') {
            // Elongated largely along our line of sight.
            const los = [-R0_KPC - cx, -cy, -cz];
            const ln = Math.hypot(los[0]!, los[1]!, los[2]!);
            const along = rng.normal() * 2.2;
            x = cx + rng.normal() * 0.9 + (along * los[0]!) / ln;
            y = cy + rng.normal() * 0.9 + (along * los[1]!) / ln;
            z = cz + rng.normal() * 0.9 + (along * los[2]!) / ln;
          } else {
            // Sagittarius dSph: elongated perpendicular to the Galactic plane.
            x = cx + rng.normal() * 0.6;
            y = cy + rng.normal() * 0.6;
            z = cz + rng.normal() * 2.2;
          }
          const young = sat.id !== 'sgr-dsph' && rng.next() < 0.55;
          const rgb = young ? teffRgb(Math.log10(11_000), 0.12) : teffRgb(Math.log10(5400), 0.05);
          kpc(x, y, z, rgb, lum());
        }
      }
    }
  });

  return out.build();
}
