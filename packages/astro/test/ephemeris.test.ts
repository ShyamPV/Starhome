import { describe, expect, it } from 'vitest';
import {
  J2000,
  KM_PER_AU,
  dateToJulian,
  greenwichMeanSiderealTimeDeg,
  julianToDate,
  moonGeocentricEcliptic,
  planetHeliocentricEcliptic,
  solveKepler,
} from '../src';

describe('time', () => {
  it('J2000.0 is 2000-01-01T12:00Z (UTC approximation)', () => {
    expect(dateToJulian(new Date(Date.UTC(2000, 0, 1, 12)))).toBe(J2000);
    expect(julianToDate(J2000).toISOString()).toBe('2000-01-01T12:00:00.000Z');
  });

  it('GMST at J2000.0 is 280.46061837 deg', () => {
    expect(greenwichMeanSiderealTimeDeg(J2000)).toBeCloseTo(280.46061837, 8);
  });
});

describe('Kepler solver', () => {
  it('satisfies M = E - e sin E across eccentricities', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (const M of [-3, -1, 0.1, 1, 2.5]) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe('planet positions (vs JPL Horizons, J2000 ecliptic)', () => {
  // Horizons heliocentric ecliptic J2000 vectors at 2000-01-01 12:00 TDB.
  const horizons: Record<string, [number, number, number]> = {
    earth: [-0.1771, 0.9672, -0.0000],
    mars: [1.3907, -0.0134, -0.0344],
    jupiter: [4.0012, 2.9386, -0.1018],
  };

  for (const [id, ref] of Object.entries(horizons)) {
    it(`${id} is within 0.02 AU of Horizons`, () => {
      const p = planetHeliocentricEcliptic(id as 'earth', J2000);
      const err = Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]);
      expect(err).toBeLessThan(0.02);
    });
  }

  it('keeps Earth near 1 AU all year', () => {
    for (let d = 0; d < 366; d += 15) {
      const [x, y, z] = planetHeliocentricEcliptic('earth', J2000 + d);
      const r = Math.hypot(x, y, z);
      expect(r).toBeGreaterThan(0.983);
      expect(r).toBeLessThan(1.017);
    }
  });
});

describe('Moon', () => {
  it('stays between perigee and apogee and within 5.3 deg of the ecliptic', () => {
    for (let d = 0; d < 60; d += 0.7) {
      const m = moonGeocentricEcliptic(J2000 + d);
      expect(m.distKm).toBeGreaterThan(356_000);
      expect(m.distKm).toBeLessThan(407_000);
      expect(Math.abs(m.lat)).toBeLessThan(5.3);
    }
  });

  it('matches the Moon at J2000.0 (lon ~223.3, lat ~+5.2) to within 1 deg', () => {
    const m = moonGeocentricEcliptic(J2000);
    expect(Math.abs(m.lon - 223.3)).toBeLessThan(1);
    expect(Math.abs(m.lat - 5.2)).toBeLessThan(0.5);
    expect(m.distKm / KM_PER_AU).toBeCloseTo(0.0027, 3);
  });
});
