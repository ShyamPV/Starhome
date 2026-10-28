import { describe, expect, it } from 'vitest';
import { SUN_GALACTOCENTRIC_PC } from '@starhome/astro';
import {
  CELL_SIZE_PC,
  MASS_FUNCTIONS,
  R0_KPC,
  SPIRAL_ARMS,
  armRadius,
  cellIndexOf,
  componentDensities,
  generateCell,
  generateGlow,
  hash32,
  regionName,
  Rng,
} from '../src';

const arm = (id: string) => SPIRAL_ARMS.find((a) => a.id === id)!;

describe('deterministic seeding', () => {
  it('hash32 is stable and sensitive to every input', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
  });

  it('Rng produces the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('generates identical cells for identical coordinates', () => {
    const req = { ix: -164, iy: 3, iz: 0, cap: 2000, seed: 7, realCatalogMagLimit: -99 };
    const a = generateCell(req);
    const b = generateCell(req);
    expect(a.count).toBeGreaterThan(0);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.absMag)).toEqual(Array.from(b.absMag));
  });
});

describe('spiral arms (vs Reid et al. 2019 at the Sun azimuth)', () => {
  it('places the Perseus arm ~1.9 kpc outside the solar circle', () => {
    expect(armRadius(arm('perseus'), 0) - R0_KPC).toBeCloseTo(1.9, 0);
  });

  it('places the Sagittarius-Carina arm ~1.3 kpc inside the solar circle', () => {
    expect(R0_KPC - armRadius(arm('sagittarius-carina'), 0)).toBeCloseTo(1.3, 0);
  });

  it('has the Local arm passing within 0.5 kpc of the Sun', () => {
    expect(Math.abs(armRadius(arm('local'), 0) - R0_KPC)).toBeLessThan(0.5);
  });

  it('joins Norma to the Outer arm one turn later (R ~ 12.2 kpc)', () => {
    expect(armRadius(arm('norma-outer'), 18 - 360)).toBeCloseTo(12.24, 1);
  });
});

describe('density model', () => {
  it('reproduces the local stellar mass density (~0.04-0.06 M_sun/pc^3)', () => {
    const d = componentDensities(-R0_KPC, 0, 0.0208);
    const total = d.thin + d.young + d.thick + d.bulge + d.halo;
    expect(total).toBeGreaterThan(0.035);
    expect(total).toBeLessThan(0.07);
  });

  it('is far denser in the bulge than at the Sun', () => {
    const c = componentDensities(0, 0, 0.1);
    expect(c.bulge).toBeGreaterThan(100 * componentDensities(-R0_KPC, 0, 0).thin);
  });

  it('names regions sensibly', () => {
    expect(regionName(0, 0, 0.0001)).toBe('Sagittarius A* vicinity');
    expect(regionName(0.5, 0.2, 0.1)).toBe('Galactic bulge and bar');
    expect(regionName(-R0_KPC, 0, 0.02)).toMatch(/Orion Spur|Inter-arm/);
    expect(regionName(-R0_KPC, 0, 30)).toBe('Stellar halo');
  });
});

describe('population synthesis', () => {
  it('has a Kroupa mean stellar mass of ~0.3-0.6 M_sun', () => {
    for (const t of Object.values(MASS_FUNCTIONS)) {
      expect(t.meanMass).toBeGreaterThan(0.25);
      expect(t.meanMass).toBeLessThan(0.65);
    }
  });

  it('produces roughly the observed naked-eye sky (V < 6.5: ~9000 stars) around the Sun', () => {
    // All cells within 400 pc; brighter real-catalogue stars are not suppressed here.
    const sun = SUN_GALACTOCENTRIC_PC;
    const [cx, cy, cz] = cellIndexOf(sun);
    const reach = Math.ceil(400 / CELL_SIZE_PC);
    let nakedEye = 0;
    for (let i = -reach; i <= reach; i++)
      for (let j = -reach; j <= reach; j++)
        for (let k = -reach; k <= reach; k++) {
          const cell = generateCell({ ix: cx + i, iy: cy + j, iz: cz + k, cap: 1500, seed: 1, realCatalogMagLimit: -99 });
          for (let s = 0; s < cell.count; s++) {
            const x = cell.originPc[0] + cell.positions[s * 3]! - sun[0];
            const y = cell.originPc[1] + cell.positions[s * 3 + 1]! - sun[1];
            const z = cell.originPc[2] + cell.positions[s * 3 + 2]! - sun[2];
            const d = Math.hypot(x, y, z);
            if (d <= 400 && cell.absMag[s]! + 5 * Math.log10(d) - 5 < 6.5) nakedEye++;
          }
        }
    // Stars beyond 400 pc contribute too, so accept a broad range.
    expect(nakedEye).toBeGreaterThan(2500);
    expect(nakedEye).toBeLessThan(15000);
  }, 60_000);
});

describe('glow layer', () => {
  it('is deterministic and puts most light in the disc', () => {
    const a = generateGlow({ count: 20_000, seed: 3 });
    const b = generateGlow({ count: 20_000, seed: 3 });
    expect(Array.from(a.positions.slice(0, 300))).toEqual(Array.from(b.positions.slice(0, 300)));
    let inDisc = 0;
    for (let i = 0; i < a.count; i++) if (Math.abs(a.positions[i * 3 + 2]!) < 1000) inDisc++;
    expect(inDisc / a.count).toBeGreaterThan(0.7);
  });
});
