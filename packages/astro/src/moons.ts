/**
 * Planetary satellites and body orientation.
 *
 * - Galilean moons: astronomy-engine's implementation of the L1.2 theory (Lieske), a few
 *   hundred km.
 * - Other major moons: secular mean elements fitted to JPL's satellite ephemerides
 *   (tools/build-moon-elements.mjs), with each moon's measured error over 2000-2050.
 * - Orientation: IAU WGCCRE rotation models, W = W0 + Wdot d (periodic terms omitted).
 */
import * as A from 'astronomy-engine';
import { DEG, type Vec3 } from './coords';
import { astroTime } from './ephemeris';
import { solveKepler } from './planets';
import { J2000 } from './time';
import { KM_PER_AU } from './units';

export interface MoonOrbitElements {
  aKm: number;
  e: number;
  /** Inclination to the reference plane, degrees. */
  iDeg: number;
  /** Ascending node, measured from the reference plane's node on the ICRF equator, and its rate (deg/day). */
  nodeDeg: number;
  nodeRate: number;
  /** Longitude of periapsis and its rate (deg, deg/day). */
  periDeg: number;
  periRate: number;
  /** Mean longitude at the epoch and mean motion (deg, deg/day). */
  lambdaDeg: number;
  meanMotion: number;
  /** Resonant libration of the mean longitude (Mimas with Tethys). */
  libration?: { ampDeg: number; periodDays: number; phaseDeg: number };
  /** Pole of the reference plane, oriented along the orbital angular momentum (ICRF degrees). */
  refPoleRa: number;
  refPoleDec: number;
  epochJd: number;
}

const unit = (raDeg: number, decDeg: number): Vec3 => [
  Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG),
  Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG),
  Math.sin(decDeg * DEG),
];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const comb = (a: Vec3, sa: number, b: Vec3, sb: number): Vec3 => [a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, a[2] * sa + b[2] * sb];

/** Basis of a plane with pole p: x toward its ascending node on the ICRF equator. */
function planeBasis(p: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const x = norm(cross([0, 0, 1], p));
  return { x, y: cross(p, x), z: p };
}

/** Position of a satellite relative to its planet, ICRF (J2000 equatorial) km; jd is UTC. */
export function satelliteOffsetJ2000(el: MoonOrbitElements, jd: number): Vec3 {
  // Elements are in TDB; our dates are UTC (about 69 s apart, a degree for Phobos).
  const dt = astroTime(jd).tt + J2000 - el.epochJd;
  const node = (el.nodeDeg + el.nodeRate * dt) * DEG;
  const peri = el.periDeg + el.periRate * dt;
  const lib = el.libration ? el.libration.ampDeg * Math.sin((2 * Math.PI * dt) / el.libration.periodDays + el.libration.phaseDeg * DEG) : 0;
  const lambda = el.lambdaDeg + el.meanMotion * dt + lib;
  const E = solveKepler((lambda - peri) * DEG, el.e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = el.aKm * (1 - el.e * Math.cos(E));
  // Argument of latitude: longitudes are measured in the reference plane to the node, then along the orbit.
  const u = peri * DEG - node + nu;
  const i = el.iDeg * DEG;
  const lx = r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(i));
  const ly = r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(i));
  const lz = r * Math.sin(u) * Math.sin(i);
  const b = planeBasis(unit(el.refPoleRa, el.refPoleDec));
  return comb(comb(b.x, lx, b.y, ly), 1, b.z, lz);
}

/** Unit normal of a satellite's orbit (ICRF), for orienting a synchronously rotating moon. */
export function satelliteOrbitNormalJ2000(el: MoonOrbitElements, jd: number): Vec3 {
  const a = satelliteOffsetJ2000(el, jd);
  const b = satelliteOffsetJ2000(el, jd + 45 / el.meanMotion);
  return norm(cross(a, b));
}

export type GalileanId = 'io' | 'europa' | 'ganymede' | 'callisto';

/** The Galilean moons relative to Jupiter, ICRF km (astronomy-engine, L1.2 theory). */
export function galileanMoonsJ2000Km(jd: number): Record<GalileanId, Vec3> {
  const m = A.JupiterMoons(astroTime(jd));
  const km = (s: A.StateVector): Vec3 => [s.x * KM_PER_AU, s.y * KM_PER_AU, s.z * KM_PER_AU];
  return { io: km(m.io), europa: km(m.europa), ganymede: km(m.ganymede), callisto: km(m.callisto) };
}

export interface RotationModel {
  /** North pole, ICRF degrees. */
  poleRa: number;
  poleDec: number;
  /** Prime meridian angle at J2000 and its rate, degrees and degrees per day. */
  w0: number;
  wDot: number;
}

/**
 * Pole and prime-meridian direction (ICRF unit vectors) of a body at a Julian Date,
 * from its IAU rotation model: W is measured eastward along the body's equator from
 * the node of that equator on the ICRF equator.
 */
export function bodyOrientationJ2000(rot: RotationModel, jd: number): { pole: Vec3; primeMeridian: Vec3 } {
  const pole = unit(rot.poleRa, rot.poleDec);
  const { x: q, y: east } = planeBasis(pole);
  const w = ((rot.w0 + rot.wDot * (jd - J2000)) % 360) * DEG;
  return { pole, primeMeridian: comb(q, Math.cos(w), east, Math.sin(w)) };
}
