/**
 * Individually resolved synthetic stars, generated per cubic cell around the camera.
 * Each cell is seeded from its integer coordinates, so revisiting a place always yields
 * the same stars. A per-cell star budget is met by keeping only the brightest stars
 * (raising the minimum mass), which keeps dense regions like the bulge tractable.
 */
import { SUN_GALACTOCENTRIC_PC, type Vec3 } from '@starhome/astro';
import { StarBufferBuilder, type StarBuffers } from './buffers';
import { armEnhancement, componentDensities } from './model';
import {
  MASS_FUNCTIONS,
  evolvedStar,
  fractionAbove,
  giantsPerMsun,
  mainSequenceStar,
  sampleMass,
  type PopulationId,
} from './populations';
import { Rng, hash32 } from './rng';

export const CELL_SIZE_PC = 50;
/** Lowest stellar mass ever generated; fainter dwarfs are invisible beyond a few pc. */
export const CELL_MASS_FLOOR = 0.15;

export interface CellRequest {
  ix: number;
  iy: number;
  iz: number;
  /** Maximum number of stars to generate. */
  cap: number;
  seed: number;
  /**
   * Real catalogues take precedence: synthetic stars that would appear brighter than this
   * from the Sun are dropped because the real catalogue already contains them.
   */
  realCatalogMagLimit: number;
}

export interface CellBuffers extends StarBuffers {
  key: string;
  /** Lowest main-sequence mass included in this cell, M_sun. */
  minMass: number;
  /** Expected number of stars brighter than the floor mass before the budget was applied. */
  expectedTotal: number;
}

export function cellKey(ix: number, iy: number, iz: number): string {
  return `${ix},${iy},${iz}`;
}

export function cellIndexOf(pPc: Vec3): [number, number, number] {
  return [Math.floor(pPc[0] / CELL_SIZE_PC), Math.floor(pPc[1] / CELL_SIZE_PC), Math.floor(pPc[2] / CELL_SIZE_PC)];
}

export function cellCenter(ix: number, iy: number, iz: number): Vec3 {
  return [(ix + 0.5) * CELL_SIZE_PC, (iy + 0.5) * CELL_SIZE_PC, (iz + 0.5) * CELL_SIZE_PC];
}

/** Expected number of main-sequence and evolved stars per population in a cell. */
export function cellExpectations(center: Vec3): Record<PopulationId, { ms: number; giants: number }> {
  const k = center.map((c) => c / 1000) as Vec3;
  const d = componentDensities(k[0], k[1], k[2], armEnhancement(k[0], k[1]));
  const volume = CELL_SIZE_PC ** 3;
  const rho: Record<PopulationId, number> = { young: d.young, thin: d.thin, old: d.thick + d.bulge + d.halo };
  const out = {} as Record<PopulationId, { ms: number; giants: number }>;
  for (const pop of Object.keys(rho) as PopulationId[]) {
    const mass = rho[pop] * volume;
    out[pop] = { ms: mass / MASS_FUNCTIONS[pop].meanMass, giants: mass * giantsPerMsun(pop) };
  }
  return out;
}

export function generateCell(req: CellRequest): CellBuffers {
  const { ix, iy, iz, cap } = req;
  const center = cellCenter(ix, iy, iz);
  const exp = cellExpectations(center);
  const pops = Object.keys(exp) as PopulationId[];

  const giantsTotal = pops.reduce((s, p) => s + exp[p].giants, 0);
  const giantScale = giantsTotal > 0 ? Math.min(1, (0.5 * cap) / giantsTotal) : 1;
  const msBudget = cap - giantsTotal * giantScale;
  const msAbove = (m: number) => pops.reduce((s, p) => s + exp[p].ms * fractionAbove(p, m), 0);

  let minMass = CELL_MASS_FLOOR;
  if (msAbove(minMass) > msBudget) {
    let lo = Math.log10(CELL_MASS_FLOOR);
    let hi = 2;
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (lo + hi);
      if (msAbove(10 ** mid) > msBudget) lo = mid;
      else hi = mid;
    }
    minMass = 10 ** hi;
  }

  const rng = new Rng(hash32(req.seed, ix, iy, iz));
  const out = new StarBufferBuilder(center, Math.min(cap, 4096));
  const half = CELL_SIZE_PC / 2;
  const sun = SUN_GALACTOCENTRIC_PC;

  const place = (absMag: number, teff: number) => {
    const x = center[0] + rng.range(-half, half);
    const y = center[1] + rng.range(-half, half);
    const z = center[2] + rng.range(-half, half);
    const dSun = Math.hypot(x - sun[0], y - sun[1], z - sun[2]);
    // Nothing synthetic inside the well-surveyed solar neighbourhood shell.
    if (dSun < 3) return;
    if (absMag + 5 * Math.log10(dSun) - 5 < req.realCatalogMagLimit) return;
    out.addTeff(x, y, z, teff, absMag);
  };

  for (const pop of pops) {
    const n = rng.poisson(exp[pop].ms * fractionAbove(pop, minMass));
    for (let i = 0; i < n; i++) {
      const s = mainSequenceStar(sampleMass(pop, rng, minMass), rng);
      place(s.absMagV, s.teff);
    }
    const g = rng.poisson(exp[pop].giants * giantScale);
    for (let i = 0; i < g; i++) {
      const s = evolvedStar(pop, rng);
      place(s.absMagV, s.teff);
    }
  }

  return {
    ...out.build(true),
    key: cellKey(ix, iy, iz),
    minMass,
    expectedTotal: msAbove(CELL_MASS_FLOOR) + giantsTotal,
  };
}
