import { describe, expect, it } from 'vitest';
import { altitudeAt, bestAltitude, darkWindow, dateToJulian, horizontalFromJ2000, localSiderealTimeDeg, sunAltitude, windowSamples, type GeoLocation } from '../src';

const AUCKLAND: GeoLocation = { latDeg: -36.85, lonDeg: 174.76, heightM: 0 };
const TROMSO: GeoLocation = { latDeg: 69.65, lonDeg: 18.96, heightM: 0 };

describe('dark window', () => {
  it('finds the coming night, bounded by nautical twilight', () => {
    // Midday in Auckland, 15 January 2026 (00:00 UTC).
    const jd = dateToJulian(new Date('2026-01-15T00:00:00Z'));
    const w = darkWindow(jd, AUCKLAND)!;
    expect(w).not.toBeNull();
    expect(w.start).toBeGreaterThan(jd);
    // Summer night: a few hours of real darkness.
    const hours = (w.end - w.start) * 24;
    expect(hours).toBeGreaterThan(5);
    expect(hours).toBeLessThan(9);
    expect(sunAltitude(w.start, AUCKLAND)).toBeCloseTo(-12, 0);
    expect(sunAltitude(w.end, AUCKLAND)).toBeCloseTo(-12, 0);
    expect(sunAltitude(0.5 * (w.start + w.end), AUCKLAND)).toBeLessThan(-12);
  });

  it('starts now when it is already dark', () => {
    const jd = dateToJulian(new Date('2026-01-15T13:00:00Z')); // 02:00 NZDT
    expect(darkWindow(jd, AUCKLAND)!.start).toBe(jd);
  });

  it('has no dark window in the polar summer', () => {
    expect(darkWindow(dateToJulian(new Date('2026-06-21T12:00:00Z')), TROMSO)).toBeNull();
  });
});

describe('best altitude tonight', () => {
  it('matches the full horizontal transform to within refraction and precession', () => {
    const jd = dateToJulian(new Date('2026-01-15T11:00:00Z'));
    const geo = altitudeAt(101.2872, -16.7161, AUCKLAND.latDeg, localSiderealTimeDeg(jd, AUCKLAND.lonDeg));
    const full = horizontalFromJ2000(jd, AUCKLAND, 101.2872, -16.7161, false).alt;
    expect(Math.abs(geo - full)).toBeLessThan(0.5);
  });

  it('puts Sirius high in a January night from Auckland, and Polaris never above the horizon', () => {
    const jd = dateToJulian(new Date('2026-01-15T00:00:00Z'));
    const samples = windowSamples(darkWindow(jd, AUCKLAND)!, AUCKLAND);
    // Sirius culminates at 90 - |lat - dec| = 70 degrees.
    const sirius = bestAltitude(101.2872, -16.7161, AUCKLAND.latDeg, samples);
    expect(sirius.alt).toBeGreaterThan(65);
    expect(sirius.alt).toBeLessThan(70.2);
    expect(bestAltitude(37.95, 89.264, AUCKLAND.latDeg, samples).alt).toBeLessThan(0);
  });
});
