/**
 * Low-precision geocentric Moon (Astronomical Almanac short series, ~0.3 deg).
 * Returns ecliptic-of-date coordinates, treated as J2000 ecliptic at this precision.
 * Deliverable 3 replaces this with ELP/MPP02.
 */
import { DEG, sphericalToCartesian, type Vec3 } from './coords';
import { J2000 } from './time';

export function moonGeocentricEcliptic(jd: number): { lon: number; lat: number; distKm: number } {
  const d = jd - J2000;
  const L = 218.316 + 13.176396 * d; // mean longitude
  const M = 134.963 + 13.064993 * d; // mean anomaly
  const F = 93.272 + 13.22935 * d; // argument of latitude
  const lon = L + 6.289 * Math.sin(M * DEG);
  const lat = 5.128 * Math.sin(F * DEG);
  const distKm = 385_001 - 20_905 * Math.cos(M * DEG);
  return { lon: ((lon % 360) + 360) % 360, lat, distKm };
}

/** Geocentric Moon position, ecliptic cartesian, km. */
export function moonGeocentricEclipticVec(jd: number): Vec3 {
  const { lon, lat, distKm } = moonGeocentricEcliptic(jd);
  return sphericalToCartesian(lon, lat, distKm);
}
