/**
 * Precise positions of the Sun, Moon and planets, and everything an observer on Earth
 * needs: topocentric altitude/azimuth, sidereal time, rise/transit/set times.
 *
 * Backed by astronomy-engine (Don Cross, MIT): truncated VSOP87 for the planets, a
 * Chapront-style lunar theory for the Moon, IAU 2006 precession and IAU 2000B nutation,
 * with TT - UT handled internally. Accuracy is better than 1 arcminute over several
 * centuries around the present (checked in tests against an independent theory and
 * against well-known events).
 *
 * Julian Dates in this package are UTC; astronomy-engine takes UT days since J2000.
 * Positions are returned in the J2000 equatorial frame (ICRS orientation) unless the
 * name says otherwise.
 */
import * as A from 'astronomy-engine';
import { DEG, type Vec3 } from './coords';
import type { PlanetId } from './planets';
import { J2000 } from './time';
import { KM_PER_AU } from './units';

export type SkyBodyId = PlanetId | 'sun' | 'moon';

const BODY: Record<SkyBodyId, A.Body> = {
  sun: A.Body.Sun,
  moon: A.Body.Moon,
  mercury: A.Body.Mercury,
  venus: A.Body.Venus,
  earth: A.Body.Earth,
  mars: A.Body.Mars,
  jupiter: A.Body.Jupiter,
  saturn: A.Body.Saturn,
  uranus: A.Body.Uranus,
  neptune: A.Body.Neptune,
  pluto: A.Body.Pluto,
};

/** Observer on the Earth's surface (WGS84 geodetic). */
export interface GeoLocation {
  latDeg: number;
  /** East-positive longitude, degrees. */
  lonDeg: number;
  heightM: number;
}

export function astroTime(jd: number): A.AstroTime {
  return A.MakeTime(jd - J2000);
}

function observer(o: GeoLocation): A.Observer {
  return new A.Observer(o.latDeg, o.lonDeg, o.heightM);
}

function vec(v: A.Vector, scale = 1): Vec3 {
  return [v.x * scale, v.y * scale, v.z * scale];
}

/** Heliocentric position of a planet (or the Earth), J2000 equatorial, km. */
export function heliocentricEquatorialKm(id: PlanetId, jd: number): Vec3 {
  return vec(A.HelioVector(BODY[id], astroTime(jd)), KM_PER_AU);
}

/** Geocentric position of the Moon, J2000 equatorial, km. */
export function moonGeocentricEquatorialKm(jd: number): Vec3 {
  return vec(A.GeoMoon(astroTime(jd)), KM_PER_AU);
}

/** Observer's position relative to the Earth's centre, J2000 equatorial, km. */
export function observerGeocentricEquatorialKm(jd: number, loc: GeoLocation): Vec3 {
  return vec(A.ObserverVector(astroTime(jd), observer(loc), false), KM_PER_AU);
}

/** Greenwich apparent sidereal time, degrees. */
export function greenwichApparentSiderealTimeDeg(jd: number): number {
  return A.SiderealTime(astroTime(jd)) * 15;
}

/** Local apparent sidereal time, degrees. */
export function localSiderealTimeDeg(jd: number, lonDeg: number): number {
  return (((greenwichApparentSiderealTimeDeg(jd) + lonDeg) % 360) + 360) % 360;
}

const ROT_EQD_EQJ = (jd: number) => A.Rotation_EQD_EQJ(astroTime(jd));

/**
 * The observer's local horizontal frame (east, north, zenith unit vectors) expressed in
 * J2000 equatorial coordinates, so a renderer working in J2000 can orient a camera.
 */
export function localFrameJ2000(jd: number, loc: GeoLocation): { east: Vec3; north: Vec3; up: Vec3 } {
  const lst = localSiderealTimeDeg(jd, loc.lonDeg) * DEG;
  const lat = loc.latDeg * DEG;
  // In the true equator and equinox of date.
  const up: Vec3 = [Math.cos(lat) * Math.cos(lst), Math.cos(lat) * Math.sin(lst), Math.sin(lat)];
  const east: Vec3 = [-Math.sin(lst), Math.cos(lst), 0];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lst), -Math.sin(lat) * Math.sin(lst), Math.cos(lat)];
  const r = ROT_EQD_EQJ(jd);
  const t = astroTime(jd);
  const toJ2000 = (v: Vec3) => vec(A.RotateVector(r, new A.Vector(v[0], v[1], v[2], t)));
  return { east: toJ2000(east), north: toJ2000(north), up: toJ2000(up) };
}

export interface Horizontal {
  /** Altitude above the horizon, degrees (refracted when requested). */
  alt: number;
  /** Azimuth, degrees east of north. */
  az: number;
}

/** Topocentric altitude/azimuth of a J2000 RA/Dec (degrees), with precession and nutation to date. */
export function horizontalFromJ2000(jd: number, loc: GeoLocation, raDeg: number, decDeg: number, refraction = true): Horizontal {
  const t = astroTime(jd);
  const v = A.VectorFromSphere(new A.Spherical(decDeg, raDeg, 1), t);
  const eqd = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(t), v));
  const h = A.Horizon(t, observer(loc), eqd.ra, eqd.dec, refraction ? 'normal' : undefined);
  return { alt: h.altitude, az: h.azimuth };
}

export interface BodySky extends Horizontal {
  /** Apparent topocentric J2000 RA/Dec, degrees. */
  ra: number;
  dec: number;
  distanceKm: number;
  /** Apparent visual magnitude (none for the Earth). */
  mag: number | null;
}

/** Where a Solar System body is in the observer's sky. */
export function bodySky(id: Exclude<SkyBodyId, 'earth'>, jd: number, loc: GeoLocation): BodySky {
  const t = astroTime(jd);
  const obs = observer(loc);
  const j2000 = A.Equator(BODY[id], t, obs, false, true);
  const ofDate = A.Equator(BODY[id], t, obs, true, true);
  const h = A.Horizon(t, obs, ofDate.ra, ofDate.dec, 'normal');
  let mag: number | null = null;
  try {
    mag = A.Illumination(BODY[id], t).mag;
  } catch {
    mag = null;
  }
  return { alt: h.altitude, az: h.azimuth, ra: j2000.ra * 15, dec: j2000.dec, distanceKm: j2000.dist * KM_PER_AU, mag };
}

/** A fixed object (star, cluster, the Galactic centre) by its J2000 RA/Dec. */
export interface FixedTarget {
  raDeg: number;
  decDeg: number;
}

export type RiseSetTarget = Exclude<SkyBodyId, 'earth'> | FixedTarget;

export interface RiseSetTimes {
  /** Julian Dates (UTC) of the next rise, transit and set after the start; null if none in the window. */
  rise: number | null;
  transit: number | null;
  set: number | null;
  /** Altitude at transit, degrees. */
  transitAlt: number | null;
  /** Never sets / never rises at this latitude (within the window). */
  circumpolar: boolean;
  neverRises: boolean;
}

function bodyFor(target: RiseSetTarget): A.Body {
  if (typeof target === 'string') return BODY[target];
  // astronomy-engine's user-defined stars take RA in hours and a distance (only used for parallax).
  A.DefineStar(A.Body.Star1, target.raDeg / 15, target.decDeg, 1000);
  return A.Body.Star1;
}

/** Next rise, upper transit and set within `days` of `jd` for an observer. */
export function riseTransitSet(target: RiseSetTarget, loc: GeoLocation, jd: number, days = 1.2): RiseSetTimes {
  const body = bodyFor(target);
  const obs = observer(loc);
  const t0 = astroTime(jd);
  const rise = A.SearchRiseSet(body, obs, +1, t0, days);
  const set = A.SearchRiseSet(body, obs, -1, t0, days);
  const transit = A.SearchHourAngle(body, obs, 0, t0, +1);
  const toJd = (t: A.AstroTime | null) => (t ? t.ut + J2000 : null);
  const transitJd = transit.time.ut + J2000;
  const transitAlt = transit.hor.altitude;
  return {
    rise: toJd(rise),
    transit: transitJd - jd <= days ? transitJd : null,
    set: toJd(set),
    transitAlt,
    circumpolar: !rise && !set && transitAlt > 0,
    neverRises: !rise && !set && transitAlt <= 0,
  };
}

/** Constellation (IAU boundaries) containing a J2000 RA/Dec. */
export function constellationAt(raDeg: number, decDeg: number): { symbol: string; name: string } {
  const c = A.Constellation(raDeg / 15, decDeg);
  return { symbol: c.symbol, name: c.name };
}

/** Moon phase angle (0 new, 90 first quarter, 180 full, 270 last quarter) and illuminated fraction. */
export function moonPhase(jd: number): { angle: number; illuminated: number } {
  const t = astroTime(jd);
  return { angle: A.MoonPhase(t), illuminated: A.Illumination(A.Body.Moon, t).phase_fraction };
}

/**
 * Orientation of the Earth in the J2000 frame: the true rotation pole of date and the
 * direction of the prime meridian on the equator (so a globe turns with sidereal time).
 */
export function earthOrientationJ2000(jd: number): { pole: Vec3; primeMeridian: Vec3 } {
  const r = ROT_EQD_EQJ(jd);
  const t = astroTime(jd);
  const gast = greenwichApparentSiderealTimeDeg(jd) * DEG;
  const toJ2000 = (v: Vec3) => vec(A.RotateVector(r, new A.Vector(v[0], v[1], v[2], t)));
  return { pole: toJ2000([0, 0, 1]), primeMeridian: toJ2000([Math.cos(gast), Math.sin(gast), 0]) };
}
