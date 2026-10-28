import { describe, expect, it } from 'vitest';
import { luminosityClass, mainSequenceAbsMag, starPhysics, teffFromSpectralType } from '../src';

describe('spectral types', () => {
  it('parses luminosity classes, including suffixes and ranges', () => {
    expect(luminosityClass('A0V')).toBe('V');
    expect(luminosityClass('B8IVn')).toBe('IV');
    expect(luminosityClass('M5.5Ve')).toBe('V');
    expect(luminosityClass('M1.5Iab')).toBe('Iab');
    expect(luminosityClass('M3-5e Ia')).toBe('Ia');
    expect(luminosityClass('K3III+B')).toBe('III');
    expect(luminosityClass('DA2')).toBe('D');
  });

  it('gives temperatures on the Pecaut & Mamajek scale', () => {
    expect(teffFromSpectralType('G2V')).toBe(5770);
    expect(teffFromSpectralType('O7Vp')).toBe(36500);
    // Red supergiants are hotter than M dwarfs of the same type.
    expect(teffFromSpectralType('M2Ia')!).toBeGreaterThan(teffFromSpectralType('M2V')!);
  });
});

describe('derived physical parameters (vs literature)', () => {
  it('recovers the Sun from its own observables', () => {
    const sun = starPhysics(4.83, 10, 0.65, 'G2V');
    expect(sun.lumSun).toBeCloseTo(1, 0);
    expect(sun.radiusSun).toBeCloseTo(1, 0);
    expect(sun.massSun!).toBeCloseTo(1, 0);
    expect(sun.stage).toBe('main sequence');
  });

  it('puts Betelgeuse among red supergiants (~600-1000 R_sun)', () => {
    const b = starPhysics(0.42, 168, 1.85, 'M1-2Ia');
    expect(b.stage).toBe('supergiant');
    expect(b.radiusSun).toBeGreaterThan(500);
    expect(b.radiusSun).toBeLessThan(1100);
  });

  it("estimates Barnard's Star at ~0.2 R_sun", () => {
    const b = starPhysics(9.51, 1.83, 1.74, 'M4V');
    expect(b.radiusSun).toBeGreaterThan(0.15);
    expect(b.radiusSun).toBeLessThan(0.25);
  });

  it('finds white dwarfs far below the main sequence', () => {
    expect(mainSequenceAbsMag(9000)).toBeLessThan(2);
    const siriusB = starPhysics(8.44, 2.64, -0.03, 'DA2', 0);
    expect(siriusB.stage).toBe('white dwarf');
    expect(siriusB.teffK).toBeCloseTo(25_200, -2);
    expect(siriusB.radiusSun).toBeGreaterThan(0.005);
    expect(siriusB.radiusSun).toBeLessThan(0.012);
  });
});
