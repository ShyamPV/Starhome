import { describe, expect, it } from 'vitest';
import { bodyOrientationJ2000, galileanMoonsJ2000Km, satelliteOffsetJ2000, type Vec3 } from '@starhome/astro';
import { MOONS, PLANETS } from '../src';

/** JPL Horizons, planet-centred ICRF vectors (km) at 2026-01-01 00:00 UT (JD 2461041.5). */
const HORIZONS: Record<string, Vec3> = {
  phobos: [-2501.35, -8367.04, -3007.95],
  deimos: [10789.87, 20196.85, 5072.65],
  io: [371756.5, -182954.0, -81416.7],
  enceladus: [-235772.4, -23289.6, 22023.8],
  titan: [1111984.3, -409351.3, -71094.8],
  iapetus: [-1569209.9, 3097668.3, 884907.8],
  miranda: [113391.7, -45235.1, 44385.2],
  titania: [362178.0, -14580.2, -241588.6],
  triton: [-284500.5, -110933.8, 180529.9],
  charon: [10154.7, 7209.0, -15128.6],
};
const JD = 2_461_041.5;

const angleDeg = (a: Vec3, b: Vec3) => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;
};

describe('major moons', () => {
  it('fits every non-Galilean moon to within 2.5 degrees of JPL over 2000-2050', () => {
    for (const m of MOONS) if (typeof m.orbit !== 'string') expect(m.orbit.maxErrorDeg, m.id).toBeLessThan(2.5);
  });

  it('has 20 moons with unique ids and known parents', () => {
    expect(MOONS).toHaveLength(20);
    expect(new Set(MOONS.map((m) => m.id)).size).toBe(20);
    for (const m of MOONS) expect(PLANETS.map((p) => p.id)).toContain(m.parent);
  });

  it('places each moon where JPL Horizons has it, within the error its fit records', () => {
    const galilean = galileanMoonsJ2000Km(JD);
    for (const [id, ref] of Object.entries(HORIZONS)) {
      const m = MOONS.find((x) => x.id === id)!;
      const p = typeof m.orbit === 'string' ? galilean[m.orbit] : satelliteOffsetJ2000(m.orbit, JD);
      // Galilean moons: the L1.2 theory. Others: the fit's own worst error over 2000-2050.
      const tol = typeof m.orbit === 'string' ? 0.2 : m.orbit.maxErrorDeg + 0.05;
      expect(angleDeg(p, ref), id).toBeLessThan(tol);
      expect(Math.hypot(...p) / Math.hypot(...ref), id).toBeCloseTo(1, 2);
    }
  });
});

describe('IAU rotation models', () => {
  it('keeps the axes orthonormal and repeats after one sidereal day', () => {
    const mars = PLANETS.find((p) => p.id === 'mars')!;
    const o = bodyOrientationJ2000({ poleRa: mars.poleRa, poleDec: mars.poleDec, w0: mars.w0, wDot: mars.wDot }, JD);
    const dot = o.pole[0] * o.primeMeridian[0] + o.pole[1] * o.primeMeridian[1] + o.pole[2] * o.primeMeridian[2];
    expect(Math.abs(dot)).toBeLessThan(1e-12);
    expect(Math.hypot(...o.primeMeridian)).toBeCloseTo(1, 12);
    // One sidereal day of Mars later, the prime meridian is back where it was.
    const later = bodyOrientationJ2000({ poleRa: mars.poleRa, poleDec: mars.poleDec, w0: mars.w0, wDot: mars.wDot }, JD + 360 / mars.wDot);
    expect(angleDeg(o.primeMeridian, later.primeMeridian)).toBeLessThan(1e-6);
  });
});
