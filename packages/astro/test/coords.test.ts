import { describe, expect, it } from 'vitest';
import {
  R0_PC,
  cartesianToSpherical,
  eclipticToEquatorial,
  equatorialToEcliptic,
  galacticToRaDec,
  galactocentricToLbd,
  raDecDistToGalactocentric,
  raDecToGalactic,
  sphericalToCartesian,
} from '../src';

describe('ICRS <-> Galactic', () => {
  it('maps the North Galactic Pole (RA 192.85948, Dec +27.12825) to b = +90', () => {
    const { b } = raDecToGalactic(192.85948, 27.12825);
    expect(b).toBeCloseTo(90, 4);
  });

  it('maps l=0, b=0 to RA 266.405, Dec -28.936 (Hipparcos definition)', () => {
    const { ra, dec } = galacticToRaDec(0, 0);
    expect(ra).toBeCloseTo(266.40499, 3);
    expect(dec).toBeCloseTo(-28.93617, 3);
  });

  it('places Sgr A* (SIMBAD: 266.41684, -29.00781) at l=359.944, b=-0.046', () => {
    const { l, b } = raDecToGalactic(266.41684, -29.00781);
    expect(l).toBeCloseTo(359.944, 2);
    expect(b).toBeCloseTo(-0.046, 2);
  });

  it('places Deneb (SIMBAD: 310.35798, +45.28034) at l=84.28, b=+1.998', () => {
    const { l, b } = raDecToGalactic(310.35798, 45.28034);
    expect(l).toBeCloseTo(84.28, 1);
    expect(b).toBeCloseTo(2.0, 1);
  });

  it('round-trips', () => {
    const { l, b } = raDecToGalactic(83.8221, -5.3911);
    const { ra, dec } = galacticToRaDec(l, b);
    expect(ra).toBeCloseTo(83.8221, 9);
    expect(dec).toBeCloseTo(-5.3911, 9);
  });
});

describe('ecliptic <-> equatorial', () => {
  it('puts the ecliptic pole at RA 270, Dec 66.56', () => {
    const { lon, lat } = cartesianToSpherical(eclipticToEquatorial([0, 0, 1]));
    expect(lon).toBeCloseTo(270, 6);
    expect(lat).toBeCloseTo(66.5607, 3);
  });

  it('round-trips', () => {
    const v = sphericalToCartesian(123.4, -12.3, 7);
    const back = equatorialToEcliptic(eclipticToEquatorial(v));
    back.forEach((c, i) => expect(c).toBeCloseTo(v[i]!, 12));
  });
});

describe('Galactocentric', () => {
  it('puts the Sun at distance 0 and the Galactic centre at d = R0 toward l = 0', () => {
    const gc = galactocentricToLbd([0, 0, 0]);
    expect(gc.d).toBeCloseTo(Math.hypot(R0_PC, 20.8), 6);
    expect(Math.min(gc.l, 360 - gc.l)).toBeLessThan(1e-9);
    expect(gc.b).toBeLessThan(0); // the Sun sits slightly above the plane
  });

  it('round-trips a star (Betelgeuse at 168 pc)', () => {
    const p = raDecDistToGalactocentric(88.79294, 7.40706, 168);
    const { d } = galactocentricToLbd(p);
    expect(d).toBeCloseTo(168, 6);
  });
});
