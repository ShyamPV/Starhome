/**
 * Light of the Galaxy model: V-band luminosity densities of each component, from the
 * mass densities (model.ts) and the populations' light-to-mass ratios (populations.ts).
 * The aggregate layers (glow, tiles, cell haze) all draw their light from here, so the
 * brightness of a region does not change as the camera crosses level-of-detail shells.
 */
import { teffToLinearRgb } from '@starhome/astro';
import {
  BAR,
  DISC,
  HALO,
  NUCLEAR_DISC,
  R0_KPC,
  armEnhancement,
  componentDensities,
  type ComponentDensities,
} from './model';
import { LIGHT_TO_MASS, type PopulationId } from './populations';
import type { Rng } from './rng';

export type LightComponent = keyof ComponentDensities;

export const LIGHT_COMPONENTS: readonly LightComponent[] = ['young', 'thin', 'thick', 'bulge', 'halo'];

export const COMPONENT_POPULATION: Record<LightComponent, PopulationId> = {
  young: 'young',
  thin: 'thin',
  thick: 'old',
  bulge: 'old',
  halo: 'old',
};

/** V-band luminosity densities (L_sun/pc^3) of each component at a Galactocentric point (kpc). */
export function luminosityDensities(x: number, y: number, z: number, armSum = armEnhancement(x, y)): Record<LightComponent, number> {
  const d = componentDensities(x, y, z, armSum);
  return {
    young: d.young * LIGHT_TO_MASS.young,
    thin: d.thin * LIGHT_TO_MASS.thin,
    thick: d.thick * LIGHT_TO_MASS.old,
    bulge: d.bulge * LIGHT_TO_MASS.old,
    halo: d.halo * LIGHT_TO_MASS.old,
  };
}

const HII_RGB: [number, number, number] = [1.0, 0.22, 0.32];

function teffRgb(rng: Rng, teff: number, logSigma: number): [number, number, number] {
  return teffToLinearRgb(teff * 10 ** (logSigma * rng.normal()));
}

/**
 * Display colour of an aggregate particle of a component: the light-weighted colour of
 * its population, with scatter. A tenth of the young light is drawn as H II regions.
 */
export function componentColor(c: LightComponent, rng: Rng): [number, number, number] {
  switch (c) {
    case 'young': {
      const u = rng.next();
      return u < 0.1 ? HII_RGB : u < 0.3 ? teffRgb(rng, 8000, 0.05) : teffRgb(rng, 14_000, 0.1);
    }
    case 'thin':
      return teffRgb(rng, 5600, 0.05);
    case 'thick':
      return teffRgb(rng, 5000, 0.03);
    case 'bulge':
      return teffRgb(rng, 4500, 0.04);
    case 'halo':
      return teffRgb(rng, 5300, 0.04);
  }
}

/**
 * Total V-band luminosity of each Milky Way component (satellites excluded), L_sun,
 * integrated numerically over the model. Used to check the glow layer's budgets.
 */
export function integrateComponentLight(stepKpc = 0.1, rMaxKpc = 22): Record<LightComponent, number> {
  const PC3_PER_KPC3 = 1e9;
  let thinArea = 0;
  let youngArea = 0;
  const n = Math.ceil(rMaxKpc / stepKpc);
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++) {
      const x = (i + 0.5) * stepKpc;
      const y = (j + 0.5) * stepKpc;
      const r = Math.hypot(x, y);
      if (r > rMaxKpc) continue;
      const radial = Math.exp(-(r - R0_KPC) / DISC.thin.rd) * (1 - Math.exp(-((r / DISC.holeRadius) ** 3)));
      const arm = armEnhancement(x, y);
      thinArea += radial * (1 + DISC.thinArmContrast * arm);
      youngArea += radial * (0.25 + 2.5 * arm);
    }
  const cell = stepKpc * stepKpc;
  const thin = DISC.thin.rhoSun * thinArea * cell * 2 * DISC.thin.hz * PC3_PER_KPC3;
  // Young clumping has unit mean, so it drops out of the integral.
  const young = DISC.young.rhoSun * youngArea * cell * 2 * DISC.young.hz * PC3_PER_KPC3;
  const thick = DISC.thick.rhoSun * Math.exp(R0_KPC / DISC.thick.rd) * 2 * Math.PI * DISC.thick.rd ** 2 * 2 * DISC.thick.hz * PC3_PER_KPC3;
  const bar = BAR.rho0 * (2 * Math.PI) ** 1.5 * BAR.x0 * BAR.y0 * BAR.z0 * PC3_PER_KPC3;
  const nuclear = NUCLEAR_DISC.rho0 * 2 * Math.PI * NUCLEAR_DISC.rd ** 2 * 2 * NUCLEAR_DISC.hz * PC3_PER_KPC3;
  // Oblate halo: volume element 4 pi q r^2 dr in the spheroidal radius r.
  let halo = 0;
  const norm = R0_KPC ** 2 + HALO.core ** 2;
  for (let r = 0.005; r < 150; r += 0.01) halo += 4 * Math.PI * HALO.flattening * r * r * ((r * r + HALO.core ** 2) / norm) ** (-HALO.slope / 2) * 0.01;
  halo *= HALO.rhoSun * PC3_PER_KPC3;
  return {
    young: young * LIGHT_TO_MASS.young,
    thin: thin * LIGHT_TO_MASS.thin,
    thick: thick * LIGHT_TO_MASS.old,
    bulge: (bar + nuclear) * LIGHT_TO_MASS.old,
    halo: halo * LIGHT_TO_MASS.old,
  };
}
