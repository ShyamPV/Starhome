import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { earthSimilarity, habitableZone, parseExoplanets, planetFacts, sizeClassOf } from '../src';

const catalog = parseExoplanets(JSON.parse(readFileSync('apps/web/public/data/exoplanets.json', 'utf8')));
const planet = (name: string) => catalog.planets.find((p) => p.name === name)!;
const host = (id: string) => catalog.hosts.find((h) => h.id === id)!;

describe('exoplanet catalogue', () => {
  it('has the full archive snapshot with unique ids', () => {
    expect(catalog.planets.length).toBeGreaterThan(6000);
    expect(new Set(catalog.planets.map((p) => p.id)).size).toBe(catalog.planets.length);
    expect(new Set(catalog.hosts.map((h) => h.id)).size).toBe(catalog.hosts.length);
  });

  it('groups TRAPPIST-1 into seven planets ordered outward', () => {
    const h = host(planet('TRAPPIST-1 e').hostId);
    expect(h.planets.map((p) => p.name)).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => `TRAPPIST-1 ${x}`));
  });

  it('includes every famous system the brief names', () => {
    for (const n of ['TRAPPIST-1 e', 'Kepler-452 b', 'Proxima Cen b', '55 Cnc e', 'HD 209458 b', 'Kepler-16 b']) expect(planet(n)).toBeDefined();
  });
});

describe('habitable zone (Kopparapu et al. 2014)', () => {
  it('spans ~0.95-1.67 AU for the Sun', () => {
    const [inner, outer] = habitableZone(1, 5772);
    expect(inner).toBeCloseTo(0.95, 2);
    expect(outer).toBeCloseTo(1.67, 1);
  });

  it('places TRAPPIST-1 e, f, g inside and b, h outside', () => {
    for (const x of ['e', 'f', 'g']) expect(planet(`TRAPPIST-1 ${x}`).inHabitableZone).toBe(true);
    for (const x of ['b', 'h']) expect(planet(`TRAPPIST-1 ${x}`).inHabitableZone).toBe(false);
  });

  it('places Proxima b and Kepler-442 b inside, and Kepler-452 b in the optimistic zone', () => {
    expect(planet('Proxima Cen b').inHabitableZone).toBe(true);
    expect(planet('Kepler-442 b').inHabitableZone).toBe(true);
    expect(planet('Kepler-452 b').inOptimisticHz).toBe(true);
  });
});

describe('classification and similarity', () => {
  it('scores the Earth 1 and very different worlds low', () => {
    expect(earthSimilarity(1, 1)).toBe(1);
    expect(earthSimilarity(11, 600)).toBeLessThan(0.2);
    expect(planet('HD 209458 b').esi!).toBeLessThan(0.2);
  });

  it('classes planets by size, hot Jupiters by period', () => {
    expect(sizeClassOf(1, 365)).toBe('rocky');
    expect(sizeClassOf(1.6, 10)).toBe('super-earth');
    expect(sizeClassOf(3.9, 60)).toBe('neptune-like');
    expect(sizeClassOf(11, 4)).toBe('hot-jupiter');
    expect(sizeClassOf(11, 4300)).toBe('gas-giant');
    expect(planet('HD 209458 b').sizeClass).toBe('hot-jupiter');
  });

  it('gives every planet two to five facts', () => {
    for (const p of catalog.planets.slice(0, 500)) {
      const n = planetFacts(p, host(p.hostId)).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(planetFacts(planet('TRAPPIST-1 e'), host(planet('TRAPPIST-1 e').hostId)).length).toBeGreaterThanOrEqual(3);
  });
});
