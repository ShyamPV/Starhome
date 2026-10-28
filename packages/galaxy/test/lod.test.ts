import { describe, expect, it } from 'vitest';
import { SUN_ABS_MAG_V, SUN_GALACTOCENTRIC_PC } from '@starhome/astro';
import {
  COMPONENT_LUMINOSITY,
  LIGHT_TO_MASS,
  R0_KPC,
  Rng,
  SATELLITES,
  cellIndexOf,
  generateCell,
  generateClusterStars,
  generateTile,
  integrateComponentLight,
  luminosityDensities,
  satelliteDensity,
  youngClumping,
  type StarBuffers,
} from '../src';

const lumOf = (absMag: number) => 10 ** (-0.4 * (absMag - SUN_ABS_MAG_V));
const totalLight = (b: StarBuffers) => {
  let s = 0;
  for (let i = 0; i < b.count; i++) s += lumOf(b.absMag[i]!);
  return s;
};

describe('light model', () => {
  it('has plausible V-band light-to-mass ratios', () => {
    expect(LIGHT_TO_MASS.old).toBeGreaterThan(0.15); // M/L ~ 3-6 for an 11 Gyr population
    expect(LIGHT_TO_MASS.old).toBeLessThan(0.4);
    expect(LIGHT_TO_MASS.thin).toBeGreaterThan(0.5);
    expect(LIGHT_TO_MASS.thin).toBeLessThan(1.5);
    expect(LIGHT_TO_MASS.young).toBeGreaterThan(3);
  });

  it('gives the Milky Way a total V luminosity of ~2-3e10 L_sun', () => {
    const L = integrateComponentLight(0.2);
    const total = Object.values(L).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(2e10);
    expect(total).toBeLessThan(3.5e10);
  });

  it('keeps the glow budgets equal to the integrated model (so LOD shells match)', () => {
    const L = integrateComponentLight();
    for (const [k, v] of Object.entries(COMPONENT_LUMINOSITY)) {
      expect(Math.abs(v / L[k as keyof typeof L] - 1)).toBeLessThan(0.03);
    }
  });

  it('reproduces the local disc surface brightness (~25-30 L_sun/pc^2, Flynn et al. 2006)', () => {
    let sigma = 0;
    for (let z = -3; z < 3; z += 0.002) {
      const d = luminosityDensities(-R0_KPC, 0, z + 0.001);
      sigma += (d.young + d.thin + d.thick + d.bulge + d.halo) * 2;
    }
    expect(sigma).toBeGreaterThan(15);
    expect(sigma).toBeLessThan(40);
  });

  it('clumps young stars with unit mean', () => {
    const rng = new Rng(9);
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) sum += youngClumping(rng.range(-15, 15), rng.range(-15, 15), rng.range(-0.3, 0.3));
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.1);
  });

  it('normalises each satellite galaxy to its stellar mass', () => {
    for (const s of SATELLITES) {
      const step = s.radius / 20;
      let mass = 0;
      for (let x = -3 * s.radius; x < 3 * s.radius; x += step)
        for (let y = -3 * s.radius; y < 3 * s.radius; y += step)
          for (let z = -3 * s.radius; z < 3 * s.radius; z += step / 4)
            mass += satelliteDensity(s, s.center[0] + x + step / 2, s.center[1] + y + step / 2, s.center[2] + z + step / 8) * step * step * (step / 4) * 1e9;
      expect(mass / s.mass).toBeGreaterThan(0.9);
      expect(mass / s.mass).toBeLessThan(1.05);
    }
  });
});

describe('level-of-detail tiles', () => {
  const req = { ix: -21, iy: 0, iz: 0, sizePc: 400, particleLum: 300, cap: 50_000, seed: 3 };

  it('are deterministic', () => {
    const a = generateTile(req);
    const b = generateTile(req);
    expect(a.count).toBeGreaterThan(100);
    expect(Array.from(a.absMag)).toEqual(Array.from(b.absMag));
  });

  it("carry the model's light for their volume", () => {
    const t = generateTile(req);
    // Fine-grid integral of the luminosity density over the same cube.
    const n = 40;
    const dz = 400 / 200;
    let expected = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < 200; k++) {
          const x = (t.originPc[0] - 200 + ((i + 0.5) * 400) / n) / 1000;
          const y = (t.originPc[1] - 200 + ((j + 0.5) * 400) / n) / 1000;
          const z = (t.originPc[2] - 200 + (k + 0.5) * dz) / 1000;
          const d = luminosityDensities(x, y, z);
          expected += (d.young + d.thin + d.thick + d.bulge + d.halo) * (400 / n) ** 2 * dz;
        }
    expect(totalLight(t) / expected).toBeGreaterThan(0.85);
    expect(totalLight(t) / expected).toBeLessThan(1.15);
  }, 30_000);

  it('raise the particle luminosity rather than exceed the cap in the bulge', () => {
    const t = generateTile({ ix: -1, iy: 0, iz: 0, sizePc: 400, particleLum: 50, cap: 4000, seed: 1 });
    expect(t.count).toBeLessThan(4600);
    expect(totalLight(t)).toBeGreaterThan(1e7);
  });
});

describe('cells', () => {
  it('add unresolved haze only where the star budget leaves light out', () => {
    const sun = SUN_GALACTOCENTRIC_PC;
    const local = generateCell({ ix: cellIndexOf(sun)[0] + 2, iy: 0, iz: 0, cap: 2500, seed: 1, realCatalogMagLimit: -99 });
    expect(local.haze.count).toBe(0);
    const bulge = generateCell({ ix: -4, iy: 1, iz: 0, cap: 2500, seed: 1, realCatalogMagLimit: -99 });
    expect(bulge.haze.count).toBeGreaterThan(0);
    // Most of the bulge cell's light is unresolved at this budget.
    expect(totalLight(bulge.haze)).toBeGreaterThan(totalLight(bulge));
  });

  it('drop synthetic stars the real catalogue already contains, allowing for extinction', () => {
    const sun = SUN_GALACTOCENTRIC_PC;
    const [cx, cy, cz] = cellIndexOf(sun);
    const cell = generateCell({ ix: cx + 2, iy: cy, iz: cz, cap: 4000, seed: 2, realCatalogMagLimit: 7.3 });
    for (let i = 0; i < cell.count; i++) {
      const d = Math.hypot(
        cell.originPc[0] + cell.positions[i * 3]! - sun[0],
        cell.originPc[1] + cell.positions[i * 3 + 1]! - sun[1],
        cell.originPc[2] + cell.positions[i * 3 + 2]! - sun[2],
      );
      // Extinction only makes stars fainter, so none can be brighter than the limit unextincted... minus A_V (< 0.5 here).
      expect(cell.absMag[i]! + 5 * Math.log10(d) - 5).toBeGreaterThan(7.3 - 0.5);
    }
  });
});

describe('globular cluster stars', () => {
  // 47 Tucanae: M_V = -9.42, r_h = 4.1 pc, [Fe/H] = -0.72 (Harris 2010).
  const req = { index: 0, centerPc: [0, 0, 0] as [number, number, number], absMagV: -9.42, rhPc: 4.1, feH: -0.72, cap: 20_000, seed: 5 };

  it("conserve the cluster's integrated light (stars plus haze)", () => {
    const { stars, haze } = generateClusterStars(req);
    const ratio = (totalLight(stars) + totalLight(haze)) / lumOf(req.absMagV);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });

  it('follow the half-light radius (projected median radius ~ r_h)', () => {
    const { stars } = generateClusterStars(req);
    const r = Array.from({ length: stars.count }, (_, i) => Math.hypot(stars.positions[i * 3]!, stars.positions[i * 3 + 1]!)).sort((a, b) => a - b);
    const median = r[r.length >> 1]!;
    expect(median).toBeGreaterThan(0.8 * req.rhPc);
    expect(median).toBeLessThan(1.2 * req.rhPc);
  });

  it('respect the star budget', () => {
    expect(generateClusterStars(req).stars.count).toBeLessThan(req.cap * 1.1);
  });
});
