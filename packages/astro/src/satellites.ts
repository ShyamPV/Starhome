/**
 * Earth satellites from two-line element sets, propagated with SGP4 (satellite.js, MIT;
 * Vallado et al. 2006 "Revisiting Spacetrack Report #3"). Positions come out in the TEME
 * frame (true equator, mean equinox of date); for display they are rotated to J2000.
 */
import * as A from 'astronomy-engine';
import * as S from 'satellite.js';
import { DEG, type Vec3 } from './coords';
import { astroTime, type GeoLocation } from './ephemeris';
import { julianToDate } from './time';

export interface SatelliteElements {
  name: string;
  line1: string;
  line2: string;
}

export interface Satellite {
  name: string;
  noradId: number;
  satrec: S.SatRec;
  /** Standard magnitude at 1000 km range and half phase (rough; used for display only). */
  stdMag: number;
}

/** Known standard magnitudes; everything else gets a typical value for the brightest satellites. */
const STD_MAG: Record<number, number> = { 25544: -1.8 };
const DEFAULT_STD_MAG = 3.5;

export function satelliteFromTle(t: SatelliteElements): Satellite | null {
  try {
    const satrec = S.twoline2satrec(t.line1, t.line2);
    if (satrec.error) return null;
    const noradId = Number(t.line1.slice(2, 7));
    return { name: t.name, noradId, satrec, stdMag: STD_MAG[noradId] ?? DEFAULT_STD_MAG };
  } catch {
    return null;
  }
}

/** SGP4 position in the TEME frame, km; null if the propagation fails (e.g. decayed). */
export function satellitePositionTeme(sat: Satellite, jd: number): Vec3 | null {
  const pv = S.propagate(sat.satrec, julianToDate(jd));
  if (!pv || typeof pv.position !== 'object') return null;
  return [pv.position.x, pv.position.y, pv.position.z];
}

/** Geocentric position in the J2000 equatorial frame, km. */
export function satellitePositionJ2000(sat: Satellite, jd: number): Vec3 | null {
  const p = satellitePositionTeme(sat, jd);
  if (!p) return null;
  // TEME differs from the true equator and equinox of date only by the equation of the
  // equinoxes (< 1.2 s of time), far below what matters for display.
  const t = astroTime(jd);
  const v = A.RotateVector(A.Rotation_EQD_EQJ(t), new A.Vector(p[0], p[1], p[2], t));
  return [v.x, v.y, v.z];
}

/** True if the satellite is in sunlight (not in the Earth's umbra or penumbra). */
export function satelliteSunlit(sat: Satellite, jd: number): boolean {
  const p = satellitePositionTeme(sat, jd);
  if (!p) return false;
  const sun = S.sunPos(jd).rsun;
  return S.shadowFraction(sun, { x: p[0], y: p[1], z: p[2] }) < 0.5;
}

export interface SatelliteLook {
  alt: number;
  az: number;
  rangeKm: number;
  sunlit: boolean;
  /** Rough apparent magnitude (phase ignored); null in shadow. */
  mag: number | null;
}

/** Where a satellite is in an observer's sky. */
export function satelliteLook(sat: Satellite, jd: number, loc: GeoLocation): SatelliteLook | null {
  const p = satellitePositionTeme(sat, jd);
  if (!p) return null;
  const gmst = S.gstime(jd);
  const ecf = S.eciToEcf({ x: p[0], y: p[1], z: p[2] }, gmst);
  const look = S.ecfToLookAngles({ latitude: loc.latDeg * DEG, longitude: loc.lonDeg * DEG, height: loc.heightM / 1000 }, ecf);
  const sunlit = S.shadowFraction(S.sunPos(jd).rsun, { x: p[0], y: p[1], z: p[2] }) < 0.5;
  return {
    alt: look.elevation / DEG,
    az: ((look.azimuth / DEG) % 360 + 360) % 360,
    rangeKm: look.rangeSat,
    sunlit,
    mag: sunlit ? sat.stdMag + 5 * Math.log10(look.rangeSat / 1000) : null,
  };
}

/** Sun altitude for the observer, degrees (for "is it dark enough to see satellites"). */
export function sunAltitude(jd: number, loc: GeoLocation): number {
  const t = astroTime(jd);
  const eq = A.Equator(A.Body.Sun, t, new A.Observer(loc.latDeg, loc.lonDeg, loc.heightM), true, true);
  return A.Horizon(t, new A.Observer(loc.latDeg, loc.lonDeg, loc.heightM), eq.ra, eq.dec).altitude;
}

export interface SatellitePass {
  /** Julian Dates (UTC). */
  rise: number;
  culmination: number;
  set: number;
  maxAlt: number;
  /** Azimuths at rise and set, degrees. */
  riseAz: number;
  setAz: number;
  /** Sunlit while the observer is in twilight or darkness at some point above minAlt. */
  visible: boolean;
}

/**
 * The next pass above `minAlt` within `hours` of `jd`, found by stepping the orbit and
 * refining the crossing times by bisection.
 */
export function nextPass(sat: Satellite, loc: GeoLocation, jd: number, hours = 24, minAlt = 10, stepMin = 0.5): SatellitePass | null {
  const step = stepMin / 1440;
  const altAt = (t: number) => satelliteLook(sat, t, loc)?.alt ?? -90;
  const refine = (a: number, b: number, rising: boolean) => {
    for (let i = 0; i < 20; i++) {
      const m = 0.5 * (a + b);
      if (altAt(m) >= minAlt === rising) b = m;
      else a = m;
    }
    return 0.5 * (a + b);
  };
  // A pass already in progress: back up to its start (passes last minutes, so ~1 h is ample).
  let start = jd;
  while (altAt(start) >= minAlt && jd - start < 0.05) start -= step;
  let prevAlt = altAt(start);
  const end = jd + hours / 24;
  let rise: number | null = null;
  let best = { t: 0, alt: -90 };
  let visible = false;
  for (let t = start + step; t <= end; t += step) {
    const look = satelliteLook(sat, t, loc);
    const alt = look?.alt ?? -90;
    if (rise === null && prevAlt < minAlt && alt >= minAlt) rise = refine(t - step, t, true);
    if (rise !== null) {
      if (alt > best.alt) best = { t, alt };
      if (alt >= minAlt && look?.sunlit && sunAltitude(t, loc) < -6) visible = true;
      if (alt < minAlt) {
        const set = refine(t - step, t, false);
        const riseLook = satelliteLook(sat, rise, loc)!;
        const setLook = satelliteLook(sat, set, loc)!;
        return { rise, culmination: best.t, set, maxAlt: best.alt, riseAz: riseLook.az, setAz: setLook.az, visible };
      }
    }
    prevAlt = alt;
  }
  return null;
}

/** Position (J2000 equatorial, km, geocentric) and illumination in one propagation, for animation. */
export function satelliteState(sat: Satellite, jd: number): { j2000: Vec3; sunlit: boolean } | null {
  const p = satellitePositionTeme(sat, jd);
  if (!p) return null;
  const t = astroTime(jd);
  const v = A.RotateVector(A.Rotation_EQD_EQJ(t), new A.Vector(p[0], p[1], p[2], t));
  const sunlit = S.shadowFraction(S.sunPos(jd).rsun, { x: p[0], y: p[1], z: p[2] }) < 0.5;
  return { j2000: [v.x, v.y, v.z], sunlit };
}
