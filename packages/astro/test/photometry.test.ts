import { describe, expect, it } from 'vitest';
import {
  absMagVFromLuminosity,
  apparentMagnitude,
  bolometricCorrectionV,
  bvToTeff,
  formatDistance,
  formatSpeed,
  KM_PER_LY,
  teffToLinearRgb,
} from '../src';

describe('photometry', () => {
  it('gives the Sun (B-V 0.65) a Teff near 5800 K', () => {
    expect(bvToTeff(0.65)).toBeGreaterThan(5600);
    expect(bvToTeff(0.65)).toBeLessThan(6000);
  });

  it('has BC_V(Sun) close to -0.07', () => {
    expect(bolometricCorrectionV(5772)).toBeCloseTo(-0.07, 1);
  });

  it('has strongly negative BC for hot and cool stars', () => {
    expect(bolometricCorrectionV(30_000)).toBeLessThan(-2.5);
    expect(bolometricCorrectionV(3_200)).toBeLessThan(-2);
  });

  it('recovers the Sun absolute V magnitude', () => {
    expect(absMagVFromLuminosity(1, 5772)).toBeCloseTo(4.81, 1);
  });

  it('applies the distance modulus', () => {
    expect(apparentMagnitude(4.83, 10)).toBeCloseTo(4.83, 12);
    expect(apparentMagnitude(0, 100)).toBeCloseTo(5, 12);
  });

  it('colours hot stars blue and cool stars red', () => {
    const hot = teffToLinearRgb(25_000);
    const cool = teffToLinearRgb(3_000);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(cool[0]).toBeGreaterThan(cool[2]);
  });
});

describe('formatting', () => {
  it('chooses sensible units', () => {
    expect(formatDistance(12_742)).toBe('12,742 km');
    expect(formatDistance(4.2465 * KM_PER_LY)).toBe('4.25 ly');
    expect(formatDistance(26_670 * KM_PER_LY)).toMatch(/kpc$/);
  });

  it('shows speeds as multiples of c', () => {
    expect(formatSpeed(29.78)).toBe('29.8 km/s');
    expect(formatSpeed(299_792.458 * 1500)).toBe('1,500 c');
  });
});
