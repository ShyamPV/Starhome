/**
 * Coordinate frames.
 *
 * - Equatorial: ICRS/J2000, x to the vernal equinox, z to the celestial north pole.
 * - Ecliptic: J2000 mean ecliptic, x to the equinox, z to the ecliptic north pole.
 * - Galactic (heliocentric): x toward the Galactic centre (l=0, b=0), y toward l=90,
 *   z toward the North Galactic Pole.
 * - Galactocentric: Sun at (-R0, 0, z0), x through the centre away from the Sun,
 *   y in the direction of Galactic rotation at the Sun, z toward the NGP.
 *   (Same orientation as astropy's Galactocentric frame; the small solar-height tilt
 *   of the plane is neglected.)
 */

export type Vec3 = [number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Mean obliquity of the ecliptic at J2000 (IAU 2006), degrees. */
export const OBLIQUITY_J2000_DEG = 23.439_279_44;

/** Distance from the Sun to the Galactic centre (GRAVITY 2019), parsecs. */
export const R0_PC = 8178;
/** Height of the Sun above the Galactic mid-plane (Bennett & Bovy 2019), parsecs. */
export const Z0_PC = 20.8;

export function wrapDeg360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function sphericalToCartesian(lonDeg: number, latDeg: number, r = 1): Vec3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const c = Math.cos(lat);
  return [r * c * Math.cos(lon), r * c * Math.sin(lon), r * Math.sin(lat)];
}

export function cartesianToSpherical(v: Vec3): { lon: number; lat: number; r: number } {
  const [x, y, z] = v;
  const r = Math.hypot(x, y, z);
  if (r === 0) return { lon: 0, lat: 0, r: 0 };
  return {
    lon: wrapDeg360(Math.atan2(y, x) * RAD),
    lat: Math.asin(Math.max(-1, Math.min(1, z / r))) * RAD,
    r,
  };
}

type Mat3 = readonly [Vec3, Vec3, Vec3];

function mul(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function mulT(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

export function eclipticToEquatorial(v: Vec3, obliquityDeg = OBLIQUITY_J2000_DEG): Vec3 {
  const e = obliquityDeg * DEG;
  const c = Math.cos(e);
  const s = Math.sin(e);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

export function equatorialToEcliptic(v: Vec3, obliquityDeg = OBLIQUITY_J2000_DEG): Vec3 {
  const e = obliquityDeg * DEG;
  const c = Math.cos(e);
  const s = Math.sin(e);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

/**
 * ICRS -> Galactic rotation, Hipparcos definition (ESA 1997, Vol. 1, eq. 1.5.11).
 * Galactic = A * ICRS.
 */
export const ICRS_TO_GALACTIC: Mat3 = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

export function equatorialToGalactic(v: Vec3): Vec3 {
  return mul(ICRS_TO_GALACTIC, v);
}

export function galacticToEquatorial(v: Vec3): Vec3 {
  return mulT(ICRS_TO_GALACTIC, v);
}

export function raDecToGalactic(raDeg: number, decDeg: number): { l: number; b: number } {
  const { lon, lat } = cartesianToSpherical(equatorialToGalactic(sphericalToCartesian(raDeg, decDeg)));
  return { l: lon, b: lat };
}

export function galacticToRaDec(lDeg: number, bDeg: number): { ra: number; dec: number } {
  const { lon, lat } = cartesianToSpherical(galacticToEquatorial(sphericalToCartesian(lDeg, bDeg)));
  return { ra: lon, dec: lat };
}

/** Heliocentric Galactic cartesian (pc) -> Galactocentric cartesian (pc). */
export function heliocentricToGalactocentric(v: Vec3): Vec3 {
  return [v[0] - R0_PC, v[1], v[2] + Z0_PC];
}

/** Galactocentric cartesian (pc) -> heliocentric Galactic cartesian (pc). */
export function galactocentricToHeliocentric(v: Vec3): Vec3 {
  return [v[0] + R0_PC, v[1], v[2] - Z0_PC];
}

/** Sun's position in the Galactocentric frame, parsecs. */
export const SUN_GALACTOCENTRIC_PC: Vec3 = [-R0_PC, 0, Z0_PC];

/** RA/Dec (deg) and distance (pc) -> Galactocentric cartesian (pc). */
export function raDecDistToGalactocentric(raDeg: number, decDeg: number, distPc: number): Vec3 {
  return heliocentricToGalactocentric(equatorialToGalactic(sphericalToCartesian(raDeg, decDeg, distPc)));
}

/** Galactocentric cartesian (pc) -> Galactic longitude, latitude (deg) and distance (pc) from the Sun. */
export function galactocentricToLbd(v: Vec3): { l: number; b: number; d: number } {
  const { lon, lat, r } = cartesianToSpherical(galactocentricToHeliocentric(v));
  return { l: lon, b: lat, d: r };
}
