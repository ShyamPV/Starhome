/**
 * Low-precision planetary positions from Keplerian elements.
 *
 * Source: E. M. Standish, "Keplerian Elements for Approximate Positions of the Major
 * Planets", JPL/SSD, Table 1 (valid 1800-2050 AD). Accuracy is roughly arc-minutes for
 * the inner planets; deliverable 3 replaces this with VSOP87 / JPL Chebyshev data.
 */
import { DEG, type Vec3 } from './coords';
import { centuriesSinceJ2000 } from './time';

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

/** [a (AU), e, I (deg), L (deg), long. perihelion (deg), long. asc. node (deg)] at J2000, then rates per century. */
type Elements = readonly [number, number, number, number, number, number];

const ELEMENTS: Record<PlanetId, { el: Elements; rate: Elements }> = {
  mercury: {
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  // Earth-Moon barycentre
  earth: {
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
  pluto: {
    el: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  },
};

export const PLANET_IDS = Object.keys(ELEMENTS) as PlanetId[];

export interface OrbitalElements {
  a: number; // AU
  e: number;
  i: number; // rad
  node: number; // rad, longitude of ascending node
  argPeri: number; // rad, argument of perihelion
  meanAnomaly: number; // rad
}

export function planetElements(id: PlanetId, jd: number): OrbitalElements {
  const t = centuriesSinceJ2000(jd);
  const { el, rate } = ELEMENTS[id];
  const a = el[0] + rate[0] * t;
  const e = el[1] + rate[1] * t;
  const i = el[2] + rate[2] * t;
  const L = el[3] + rate[3] * t;
  const peri = el[4] + rate[4] * t;
  const node = el[5] + rate[5] * t;
  return {
    a,
    e,
    i: i * DEG,
    node: node * DEG,
    argPeri: (peri - node) * DEG,
    meanAnomaly: (L - peri) * DEG,
  };
}

/** Solve Kepler's equation M = E - e sin E for E (radians). */
export function solveKepler(meanAnomaly: number, e: number, tol = 1e-12): number {
  const M = Math.atan2(Math.sin(meanAnomaly), Math.cos(meanAnomaly));
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let k = 0; k < 50; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/** Position from elements in the reference plane of the elements (same units as a). */
export function positionFromElements(el: OrbitalElements): Vec3 {
  const E = solveKepler(el.meanAnomaly, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cw = Math.cos(el.argPeri);
  const sw = Math.sin(el.argPeri);
  const cO = Math.cos(el.node);
  const sO = Math.sin(el.node);
  const cI = Math.cos(el.i);
  const sI = Math.sin(el.i);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Heliocentric position, J2000 ecliptic, AU. */
export function planetHeliocentricEcliptic(id: PlanetId, jd: number): Vec3 {
  return positionFromElements(planetElements(id, jd));
}

/** Sample a full orbit ellipse (heliocentric ecliptic AU) for drawing. */
export function sampleOrbit(id: PlanetId, jd: number, segments = 256): Vec3[] {
  const el = planetElements(id, jd);
  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    // Sample in eccentric anomaly for even spacing along the ellipse.
    const E = (k / segments) * 2 * Math.PI;
    const M = E - el.e * Math.sin(E);
    pts.push(positionFromElements({ ...el, meanAnomaly: M }));
  }
  return pts;
}
