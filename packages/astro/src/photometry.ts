/** Stellar photometry helpers: colour indices, temperatures, bolometric corrections, display colours. */
import { SUN_ABS_MAG_BOL } from './units';

/** B-V colour index -> effective temperature (Ballesteros 2012, blackbody fit). */
export function bvToTeff(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * V-band bolometric correction from Teff (Flower 1996 polynomials, as corrected by
 * Torres 2010, PASP 122, 1158).
 */
export function bolometricCorrectionV(teff: number): number {
  const lt = Math.log10(teff);
  if (lt < 3.7) {
    return -0.190537291496456e5 + 0.155144866764412e5 * lt - 0.421278819301717e4 * lt ** 2 + 0.381476328422343e3 * lt ** 3;
  }
  if (lt < 3.9) {
    return (
      -0.370510203809015e5 +
      0.385672629965804e5 * lt -
      0.150651486316025e5 * lt ** 2 +
      0.261724637119416e4 * lt ** 3 -
      0.170623810323864e3 * lt ** 4
    );
  }
  return (
    -0.118115450538963e6 +
    0.137145973583929e6 * lt -
    0.636233812100225e5 * lt ** 2 +
    0.147412923562646e5 * lt ** 3 -
    0.170587278406872e4 * lt ** 4 +
    0.788731721804990e2 * lt ** 5
  );
}

/** Absolute V magnitude from bolometric luminosity (L_sun) and Teff. */
export function absMagVFromLuminosity(lumSolar: number, teff: number): number {
  return SUN_ABS_MAG_BOL - 2.5 * Math.log10(lumSolar) - bolometricCorrectionV(teff);
}

/**
 * Approximate display colour of a blackbody at the given temperature, as *linear* RGB
 * normalised so the brightest channel is 1. Based on Tanner Helland's fit to the
 * Mitchell Charity blackbody table, converted from sRGB to linear.
 */
export function teffToLinearRgb(teff: number): [number, number, number] {
  const t = Math.min(40_000, Math.max(1_000, teff)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  const lin = (c: number) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const rgb: [number, number, number] = [lin(r), lin(g), lin(b)];
  const m = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
  return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
}

/** Zero-age main-sequence approximations (solar units). Good to ~factor 1.5; for population synthesis only. */
export function mainSequenceLuminosity(mass: number): number {
  if (mass < 0.43) return 0.23 * mass ** 2.3;
  if (mass < 2) return mass ** 4;
  if (mass < 55) return 1.4 * mass ** 3.5;
  return 32_000 * mass;
}

export function mainSequenceRadius(mass: number): number {
  return mass < 1 ? mass ** 0.8 : mass ** 0.57;
}

/** Teff from L and R via Stefan-Boltzmann, solar units in, kelvin out. */
export function teffFromLR(lumSolar: number, radiusSolar: number): number {
  return 5772 * (lumSolar / (radiusSolar * radiusSolar)) ** 0.25;
}

/** Approximate main-sequence lifetime, years. */
export function mainSequenceLifetimeYr(mass: number): number {
  return 1e10 * mass ** -2.5;
}

export function spectralClassFromTeff(teff: number): string {
  if (teff >= 30_000) return 'O';
  if (teff >= 10_000) return 'B';
  if (teff >= 7_500) return 'A';
  if (teff >= 6_000) return 'F';
  if (teff >= 5_200) return 'G';
  if (teff >= 3_700) return 'K';
  return 'M';
}
