/**
 * Physical parameters of a star derived from catalogue observables (V magnitude,
 * distance, B-V colour, MK spectral type): temperature, luminosity, radius, a
 * main-sequence mass estimate and its life stage on the Hertzsprung-Russell diagram.
 * These are estimates (colour temperatures, bolometric corrections, mass-luminosity
 * relation) and are labelled as such in the UI.
 */
import { bolometricCorrectionV, bvToTeff } from './photometry';
import { SUN_ABS_MAG_BOL, SUN_TEFF_K } from './units';

export type LifeStage =
  | 'main sequence'
  | 'subgiant'
  | 'giant'
  | 'bright giant'
  | 'supergiant'
  | 'hypergiant'
  | 'white dwarf'
  | 'luminous blue variable'
  | 'brown dwarf';

export interface StarPhysics {
  teffK: number;
  /** Bolometric luminosity, L_sun. */
  lumSun: number;
  radiusSun: number;
  /** Main-sequence mass estimate from the mass-luminosity relation; null off the main sequence. */
  massSun: number | null;
  absMagV: number;
  stage: LifeStage;
}

/** Luminosity class from an MK spectral type ("B8Ia" -> "Ia", "G2V" -> "V", "DA2" -> "D"). */
export function luminosityClass(spectralType: string): string | null {
  const s = spectralType.trim();
  if (/^D[ABOQZCX]/.test(s) || /^wd/i.test(s)) return 'D';
  if (/LBV/.test(s)) return 'LBV';
  if (/^[LTY]\d/.test(s)) return 'BD';
  // Roman numerals after the temperature class ("A0V" is V); suffixes like "e", "n", "p" are fine.
  const m = s.match(/(Ia\+|Iab|Ia|Ib|III|II|IV|VI|V)(?![IV])/);
  return m ? m[1]! : null;
}

function stageOf(cls: string | null, absMagV: number, teff: number): LifeStage {
  switch (cls) {
    case 'D':
      return 'white dwarf';
    case 'LBV':
      return 'luminous blue variable';
    case 'BD':
      return 'brown dwarf';
    case 'Ia+':
      return 'hypergiant';
    case 'Ia':
    case 'Iab':
    case 'Ib':
      return 'supergiant';
    case 'II':
      return 'bright giant';
    case 'III':
      return 'giant';
    case 'IV':
      return 'subgiant';
    case 'V':
    case 'VI':
      return 'main sequence';
  }
  // No class: compare with the main sequence at this temperature.
  const msMag = mainSequenceAbsMag(teff);
  if (absMagV > msMag + 5) return 'white dwarf';
  if (absMagV < msMag - 5) return 'supergiant';
  if (absMagV < msMag - 2) return 'giant';
  return 'main sequence';
}

/** Approximate absolute V magnitude of the zero-age main sequence at a temperature. */
export function mainSequenceAbsMag(teffK: number): number {
  // Piecewise fit through Pecaut & Mamajek (2013) dwarf sequence points.
  const pts: [number, number][] = [
    [2800, 16.0],
    [3200, 12.4],
    [3600, 9.7],
    [4000, 8.0],
    [4600, 6.8],
    [5200, 5.8],
    [5800, 4.7],
    [6500, 3.6],
    [7500, 2.4],
    [9000, 1.1],
    [11000, 0.0],
    [15000, -1.1],
    [20000, -2.0],
    [30000, -3.8],
    [40000, -5.2],
  ];
  if (teffK <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, m1] = pts[i]!;
    const [t0, m0] = pts[i - 1]!;
    if (teffK <= t1) return m0 + ((m1 - m0) * Math.log(teffK / t0)) / Math.log(t1 / t0);
  }
  return pts[pts.length - 1]![1];
}

/** Inverse of the main-sequence mass-luminosity relation used for synthesis (photometry.ts). */
export function mainSequenceMassFromLuminosity(lumSun: number): number {
  if (lumSun < 0.23 * 0.43 ** 2.3) return (lumSun / 0.23) ** (1 / 2.3);
  if (lumSun < 16) return lumSun ** 0.25;
  if (lumSun < 1.4 * 55 ** 3.5) return (lumSun / 1.4) ** (1 / 3.5);
  return lumSun / 32_000;
}

/** Dwarf temperature scale (Pecaut & Mamajek 2013), K, by spectral subtype O5..M9. */
const DWARF_TEFF: Record<string, [number, number][]> = {
  O: [[5, 41400], [6, 39000], [7, 36500], [8, 34500], [9, 32500], [9.5, 31900]],
  B: [[0, 31500], [1, 26000], [2, 20600], [3, 17000], [5, 15700], [6, 14500], [7, 14000], [8, 12300], [9, 10700], [9.5, 10000]],
  A: [[0, 9700], [1, 9300], [2, 8800], [3, 8600], [5, 8100], [7, 7650], [9, 7400]],
  F: [[0, 7200], [2, 6800], [5, 6550], [7, 6300], [8, 6150], [9, 6000]],
  G: [[0, 5920], [2, 5770], [5, 5660], [8, 5490], [9, 5340]],
  K: [[0, 5280], [1, 5170], [2, 4980], [3, 4780], [4, 4600], [5, 4440], [7, 4050]],
  M: [[0, 3850], [1, 3660], [2, 3560], [3, 3430], [4, 3210], [5, 3060], [6, 2810], [7, 2680], [8, 2570], [9, 2380]],
};
/** Cool giants and supergiants are hotter than dwarfs of the same type (Levesque et al. 2005 for M supergiants). */
const GIANT_TEFF: Record<string, [number, number][]> = {
  G: [[0, 5600], [5, 5100], [8, 4950]],
  K: [[0, 4750], [1, 4600], [2, 4450], [3, 4300], [4, 4100], [5, 3950]],
  M: [[0, 3850], [1, 3750], [2, 3650], [3, 3600], [4, 3500], [5, 3400], [6, 3300], [7, 3200]],
};

/** Effective temperature from an MK spectral type ("B8Ia", "M1-2Ia", "K1.5III"), or null. */
export function teffFromSpectralType(spectralType: string): number | null {
  // White dwarfs: the number is the temperature index 50400 / Teff ("DA2" ~ 25,000 K).
  const wd = spectralType.trim().match(/^D[A-Z]*(\d+(?:\.\d+)?)/);
  if (wd) return 50_400 / Math.max(0.5, Number(wd[1]));
  const m = spectralType.trim().match(/^([OBAFGKM])(\d+(?:\.\d+)?)?(?:-(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const cls = m[1]!;
  // A range like "M1-2" or "M3-5" takes the middle.
  const sub = m[2] === undefined ? 5 : m[3] !== undefined ? 0.5 * (Number(m[2]) + Number(m[3])) : Number(m[2]);
  const lc = luminosityClass(spectralType);
  const evolved = lc !== null && lc !== 'V' && lc !== 'VI' && lc !== 'IV';
  const table = (evolved && GIANT_TEFF[cls]) || DWARF_TEFF[cls]!;
  if (sub <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [s1, t1] = table[i]!;
    const [s0, t0] = table[i - 1]!;
    if (sub <= s1) return t0 + ((t1 - t0) * (sub - s0)) / (s1 - s0);
  }
  return table[table.length - 1]![1];
}

/**
 * V-band bolometric correction for M dwarfs (Pecaut & Mamajek 2013 table); the Flower
 * polynomial used elsewhere runs away below ~3300 K.
 */
function coolDwarfBolometricCorrection(teff: number): number {
  const pts: [number, number][] = [
    [2380, -5.6],
    [2570, -4.6],
    [2680, -4.2],
    [2810, -3.85],
    [3060, -2.73],
    [3210, -2.33],
    [3430, -1.95],
    [3560, -1.73],
    [3660, -1.57],
    [3850, -1.38],
    [3900, -1.32],
  ];
  if (teff <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, b1] = pts[i]!;
    const [t0, b0] = pts[i - 1]!;
    if (teff <= t1) return b0 + ((b1 - b0) * (teff - t0)) / (t1 - t0);
  }
  return pts[pts.length - 1]![1];
}

/**
 * Derive physical parameters from V magnitude, distance (pc), B-V and spectral type.
 * The temperature comes from the spectral type when it has one (B-V saturates for hot
 * stars and is reddened by dust), else from B-V. `avMag` corrects for interstellar
 * extinction.
 */
export function starPhysics(vmag: number, distPc: number, bv: number, spectralType: string, avMag = 0): StarPhysics {
  const teff = teffFromSpectralType(spectralType) ?? bvToTeff(bv - avMag / 3.1);
  const absMagV = vmag - avMag - 5 * Math.log10(distPc) + 5;
  const stage = stageOf(luminosityClass(spectralType), absMagV, teff);
  const mbol = absMagV + (stage === 'main sequence' && teff < 3900 ? coolDwarfBolometricCorrection(teff) : bolometricCorrectionV(teff));
  const lumSun = 10 ** (-0.4 * (mbol - SUN_ABS_MAG_BOL));
  const radiusSun = Math.sqrt(lumSun) * (SUN_TEFF_K / teff) ** 2;
  return { teffK: teff, lumSun, radiusSun, massSun: stage === 'main sequence' ? mainSequenceMassFromLuminosity(lumSun) : null, absMagV, stage };
}
