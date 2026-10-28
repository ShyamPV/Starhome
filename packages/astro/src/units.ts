/** Physical constants and unit conversions. Internal length unit is the kilometre. */

export const KM_PER_AU = 149_597_870.7; // IAU 2012, exact
export const KM_PER_PC = 30_856_775_814_913.673; // IAU 2015: 648000/pi AU
export const KM_PER_LY = 9_460_730_472_580.8; // Julian year * c
export const KM_PER_KPC = KM_PER_PC * 1000;
export const C_KM_S = 299_792.458; // exact
export const SUN_RADIUS_KM = 695_700; // IAU 2015 nominal
export const SUN_ABS_MAG_V = 4.83;
export const SUN_ABS_MAG_BOL = 4.74; // IAU 2015
export const SUN_TEFF_K = 5772; // IAU 2015 nominal
export const SECONDS_PER_DAY = 86_400;

export type DistanceUnit = 'm' | 'km' | 'AU' | 'ly' | 'pc' | 'kpc';

export const KM_PER_UNIT: Record<DistanceUnit, number> = {
  m: 0.001,
  km: 1,
  AU: KM_PER_AU,
  ly: KM_PER_LY,
  pc: KM_PER_PC,
  kpc: KM_PER_KPC,
};

/** Pick the most readable unit for a distance in km. */
export function bestDistanceUnit(km: number): DistanceUnit {
  const a = Math.abs(km);
  if (a < 1) return 'm';
  if (a < 0.05 * KM_PER_AU) return 'km';
  if (a < 0.05 * KM_PER_LY) return 'AU';
  if (a < 1000 * KM_PER_LY) return 'ly';
  if (a < 1000 * KM_PER_PC) return 'pc';
  return 'kpc';
}

function formatNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return v.toExponential(2);
  if (a >= 100) return Math.round(v).toLocaleString('en-US');
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatDistance(km: number, unit: DistanceUnit = bestDistanceUnit(km)): string {
  return `${formatNumber(km / KM_PER_UNIT[unit])} ${unit}`;
}

/** Speed in km/s, shown in km/s below 0.01 c and as multiples of c above. */
export function formatSpeed(kmPerS: number): string {
  const c = kmPerS / C_KM_S;
  if (c < 0.01) return `${formatNumber(kmPerS)} km/s`;
  return `${formatNumber(c)} c`;
}

/** Distance modulus: apparent = absolute + 5 log10(d_pc) - 5. */
export function apparentMagnitude(absMag: number, distancePc: number): number {
  return absMag + 5 * Math.log10(distancePc) - 5;
}

export function absoluteMagnitude(appMag: number, distancePc: number): number {
  return appMag - 5 * Math.log10(distancePc) + 5;
}
