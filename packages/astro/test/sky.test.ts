import * as A from 'astronomy-engine';
import * as S from 'satellite.js';
import { describe, expect, it } from 'vitest';
import {
  J2000,
  PLANET_IDS,
  bodySky,
  constellationAt,
  dateToJulian,
  equatorialToEcliptic,
  greenwichApparentSiderealTimeDeg,
  greenwichMeanSiderealTimeDeg,
  heliocentricEquatorialKm,
  horizontalFromJ2000,
  localFrameJ2000,
  moonGeocentricEcliptic,
  moonGeocentricEquatorialKm,
  nextPass,
  observerGeocentricEquatorialKm,
  planetHeliocentricEcliptic,
  riseTransitSet,
  satelliteFromTle,
  satelliteLook,
  satellitePositionJ2000,
  sphericalToCartesian,
  type GeoLocation,
  type Vec3,
} from '../src';

const GREENWICH: GeoLocation = { latDeg: 51.4769, lonDeg: -0.0005, heightM: 46 };
const EQUATOR: GeoLocation = { latDeg: 0, lonDeg: 0, heightM: 0 };
const utc = (...a: [number, number, number, number?, number?]) => dateToJulian(new Date(Date.UTC(a[0], a[1] - 1, a[2], a[3] ?? 0, a[4] ?? 0)));

function angleDeg(a: Vec3, b: Vec3): number {
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
}

describe('VSOP87 planets (astronomy-engine) vs independent Standish elements', () => {
  // Standish Table 1 errors reach ~1 arcmin for the inner planets and ~10 arcmin for Saturn.
  const tolerance: Record<string, number> = { mercury: 0.05, venus: 0.05, earth: 0.05, mars: 0.05, jupiter: 0.2, saturn: 0.3, uranus: 0.2, neptune: 0.2, pluto: 0.5 };
  for (const id of PLANET_IDS) {
    it(`${id} agrees in direction from 1950 to 2050`, () => {
      for (const year of [1950, 1987, 2000, 2026, 2049]) {
        const jd = utc(year, 6, 1);
        const vsop = equatorialToEcliptic(heliocentricEquatorialKm(id, jd));
        const standish = planetHeliocentricEcliptic(id, jd);
        expect(angleDeg(vsop, standish)).toBeLessThan(tolerance[id]!);
      }
    });
  }

  it('puts the Moon within the crude series error (~2 deg) of the old model', () => {
    for (const jd of [J2000, utc(2026, 10, 28), utc(1969, 7, 20)]) {
      const precise = equatorialToEcliptic(moonGeocentricEquatorialKm(jd));
      const m = moonGeocentricEcliptic(jd);
      // The short series is referred to the ecliptic of date: precess its longitude back to J2000.
      const lonJ2000 = m.lon - 1.3970 * ((jd - J2000) / 36_525);
      expect(angleDeg(precise, sphericalToCartesian(lonJ2000, m.lat))).toBeLessThan(2.5);
      expect(Math.hypot(...precise)).toBeGreaterThan(356_000);
      expect(Math.hypot(...precise)).toBeLessThan(407_000);
    }
  });
});

describe('observer sky', () => {
  it('reproduces the total solar eclipse of 2024 April 8 at greatest eclipse (Nazas, Mexico)', () => {
    const loc: GeoLocation = { latDeg: 25.29, lonDeg: -104.14, heightM: 1300 };
    const jd = utc(2024, 4, 8, 18, 17);
    const sun = bodySky('sun', jd, loc);
    const moon = bodySky('moon', jd, loc);
    expect(angleDeg(sphericalToCartesian(sun.ra, sun.dec), sphericalToCartesian(moon.ra, moon.dec))).toBeLessThan(0.1);
    expect(sun.alt).toBeGreaterThan(60);
  });

  it('has the Sun on the celestial equator at the March 2024 equinox (03:06 UTC)', () => {
    const t = A.MakeTime(utc(2024, 3, 20, 3, 6) - J2000);
    const eq = A.Equator(A.Body.Sun, t, new A.Observer(0, 0, 0), true, true);
    expect(Math.abs(eq.dec)).toBeLessThan(0.01);
  });

  it('keeps apparent and mean sidereal time within the equation of the equinoxes', () => {
    for (const jd of [J2000, utc(2026, 10, 28, 9)]) {
      const d = ((greenwichApparentSiderealTimeDeg(jd) - greenwichMeanSiderealTimeDeg(jd) + 540) % 360) - 180;
      expect(Math.abs(d)).toBeLessThan(0.01);
    }
  });

  it('places Polaris at an altitude close to the latitude, due north', () => {
    for (const jd of [utc(2026, 1, 1), utc(2026, 7, 1, 13)]) {
      const h = horizontalFromJ2000(jd, GREENWICH, 37.9529, 89.2641);
      expect(Math.abs(h.alt - GREENWICH.latDeg)).toBeLessThan(1);
      expect(Math.min(h.az, 360 - h.az)).toBeLessThan(2);
    }
  });

  it('builds an orthonormal local frame whose zenith points away from the Earth', () => {
    const jd = utc(2026, 10, 28, 21);
    const { east, north, up } = localFrameJ2000(jd, GREENWICH);
    const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(east, north)).toBeCloseTo(0, 6);
    expect(dot(east, up)).toBeCloseTo(0, 6);
    expect(dot(north, up)).toBeCloseTo(0, 6);
    // Geodetic zenith vs geocentric radius differ by at most ~0.2 deg.
    expect(angleDeg(up, observerGeocentricEquatorialKm(jd, GREENWICH))).toBeLessThan(0.25);
    // North tilts toward the celestial pole by the colatitude.
    expect(Math.acos(north[2]) * (180 / Math.PI)).toBeCloseTo(GREENWICH.latDeg, 0);
  });

  it('gives equinox sunrise and sunset at the equator about 12 hours apart around 12:07 UTC', () => {
    const r = riseTransitSet('sun', EQUATOR, utc(2024, 3, 20, 0));
    const hours = (jd: number | null) => ((jd! - utc(2024, 3, 20, 0)) * 24);
    expect(hours(r.transit)).toBeCloseTo(12.12, 1); // equation of time ~ -7.5 min
    expect(Math.abs(hours(r.rise) - 6.07)).toBeLessThan(0.15);
    expect(Math.abs(hours(r.set) - 18.18)).toBeLessThan(0.15);
    expect(r.transitAlt!).toBeGreaterThan(89);
  });

  it('knows circumpolar and never-rising stars', () => {
    const jd = utc(2026, 10, 28);
    expect(riseTransitSet({ raDeg: 37.95, decDeg: 89.26 }, GREENWICH, jd).circumpolar).toBe(true); // Polaris
    expect(riseTransitSet({ raDeg: 95.99, decDeg: -52.7 }, GREENWICH, jd).neverRises).toBe(true); // Canopus
  });

  it('finds the constellation of a position', () => {
    expect(constellationAt(88.79, 7.41).symbol).toBe('Ori'); // Betelgeuse
    expect(constellationAt(266.42, -29.0).symbol).toBe('Sgr'); // Galactic centre
  });
});

describe('satellites (SGP4)', () => {
  it('matches the Vallado et al. (2006) verification case 00005 at epoch', () => {
    const rec = S.twoline2satrec(
      '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
      '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
    );
    const pv = S.sgp4(rec, 0);
    expect(pv).toBeTruthy();
    const p = pv!.position as { x: number; y: number; z: number };
    expect(Math.hypot(p.x - 7022.46529266, p.y + 1400.08296755, p.z - 0.03995155)).toBeLessThan(0.01);
  });

  // ISS elements from CelesTrak, epoch 2026-10-27.
  const iss = satelliteFromTle({
    name: 'ISS (ZARYA)',
    line1: '1 25544U 98067A   26300.82187419  .00005456  00000+0  10681-3 0  9999',
    line2: '2 25544  51.6336   3.7485 0007015 317.3678  42.6766 15.49080514592319',
  })!;

  it('keeps the ISS in a ~420 km orbit inclined 51.6 deg', () => {
    for (let h = 0; h < 6; h++) {
      const p = satellitePositionJ2000(iss, utc(2026, 10, 28, h))!;
      const r = Math.hypot(...p);
      expect(r - 6378).toBeGreaterThan(350);
      expect(r - 6378).toBeLessThan(450);
      expect(Math.abs(Math.asin(p[2] / r)) * (180 / Math.PI)).toBeLessThan(52);
    }
  });

  it('predicts a well-formed pass over Greenwich within a day', () => {
    const jd = utc(2026, 10, 28, 0);
    const pass = nextPass(iss, GREENWICH, jd, 24)!;
    expect(pass).not.toBeNull();
    expect(pass.rise).toBeGreaterThan(jd);
    expect(pass.culmination).toBeGreaterThan(pass.rise);
    expect(pass.set).toBeGreaterThan(pass.culmination);
    expect((pass.set - pass.rise) * 1440).toBeLessThan(15);
    expect(pass.maxAlt).toBeGreaterThanOrEqual(10);
    const look = satelliteLook(iss, pass.culmination, GREENWICH)!;
    expect(look.rangeKm).toBeLessThan(2000);
  });
});
