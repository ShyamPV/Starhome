/**
 * Level-of-detail tiles: cubes of aggregate particles that fill the gap between the
 * individually generated stars around the camera (cells.ts) and the galaxy-wide glow
 * (glow.ts). Each tile samples the model's luminosity density (light.ts) on a sub-grid,
 * so finer tiles carry fainter, denser particles, and a region looks equally bright
 * whichever level draws it. Tiles are seeded from their integer coordinates.
 */
import { SUN_ABS_MAG_V, type Vec3 } from '@starhome/astro';
import { StarBufferBuilder, type StarBuffers } from './buffers';
import { LIGHT_COMPONENTS, componentColor, luminosityDensities } from './light';
import { armEnhancement } from './model';
import { Rng, hash32 } from './rng';

export interface TileRequest {
  ix: number;
  iy: number;
  iz: number;
  /** Tile edge length, pc. */
  sizePc: number;
  /** Target V luminosity per particle, L_sun; raised in bright tiles to respect `cap`. */
  particleLum: number;
  cap: number;
  seed: number;
}

/** Horizontal sub-grid resolution; the vertical resolution is set so sub-boxes are <= 50 pc tall. */
const SUB_XY = 12;

export function tileCenter(ix: number, iy: number, iz: number, sizePc: number): Vec3 {
  return [(ix + 0.5) * sizePc, (iy + 0.5) * sizePc, (iz + 0.5) * sizePc];
}

export function generateTile(req: TileRequest): StarBuffers {
  const { ix, iy, iz, sizePc } = req;
  const center = tileCenter(ix, iy, iz, sizePc);
  const nz = Math.min(48, Math.max(8, Math.ceil(sizePc / 50)));
  const dxy = sizePc / SUB_XY;
  const dz = sizePc / nz;
  const volume = dxy * dxy * dz;
  const nComp = LIGHT_COMPONENTS.length;
  const light = new Float64Array(SUB_XY * SUB_XY * nz * nComp);
  const x0 = center[0] - sizePc / 2;
  const y0 = center[1] - sizePc / 2;
  const z0 = center[2] - sizePc / 2;

  let total = 0;
  for (let i = 0; i < SUB_XY; i++)
    for (let j = 0; j < SUB_XY; j++) {
      const xk = (x0 + (i + 0.5) * dxy) / 1000;
      const yk = (y0 + (j + 0.5) * dxy) / 1000;
      const arm = armEnhancement(xk, yk);
      for (let k = 0; k < nz; k++) {
        const d = luminosityDensities(xk, yk, (z0 + (k + 0.5) * dz) / 1000, arm);
        const base = ((i * SUB_XY + j) * nz + k) * nComp;
        for (let c = 0; c < nComp; c++) {
          const l = d[LIGHT_COMPONENTS[c]!] * volume;
          light[base + c] = l;
          total += l;
        }
      }
    }

  const rng = new Rng(hash32(req.seed, 0x711e, Math.round(sizePc), ix, iy, iz));
  const particleLum = Math.max(req.particleLum, total / req.cap);
  const expected = total / particleLum;
  const out = new StarBufferBuilder(center, Math.max(16, Math.ceil(expected * 1.1)));
  // Lognormal scatter of 0.25 dex around the particle luminosity, mean-preserving.
  const sigma = 0.25;
  const norm = 10 ** (-0.5 * sigma * sigma * Math.LN10);

  for (let i = 0; i < SUB_XY; i++)
    for (let j = 0; j < SUB_XY; j++)
      for (let k = 0; k < nz; k++) {
        const base = ((i * SUB_XY + j) * nz + k) * nComp;
        for (let c = 0; c < nComp; c++) {
          const n = rng.poisson(light[base + c]! / particleLum);
          for (let s = 0; s < n; s++) {
            const lum = particleLum * norm * 10 ** (sigma * rng.normal());
            out.add(
              x0 + (i + rng.next()) * dxy,
              y0 + (j + rng.next()) * dxy,
              z0 + (k + rng.next()) * dz,
              componentColor(LIGHT_COMPONENTS[c]!, rng),
              SUN_ABS_MAG_V - 2.5 * Math.log10(lum),
            );
          }
        }
      }
  return out.build();
}
