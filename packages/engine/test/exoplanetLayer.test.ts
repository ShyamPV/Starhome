import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseExoplanets } from '@starhome/data';
import { ShaderMaterial } from 'three';
import { ExoplanetLayer } from '../src/exoplanetLayer';
import { SolarSystem } from '../src/solarSystem';
import { buildTargets } from '../src/targets';

describe('exoplanet hosts and named stars', () => {
  const catalog = parseExoplanets(JSON.parse(readFileSync('apps/web/public/data/exoplanets.json', 'utf8')));
  const targets = new Map(buildTargets(new SolarSystem()).map((t) => [t.id, t]));
  const layer = new ExoplanetLayer(new ShaderMaterial(), () => {});
  layer.setCatalog(catalog, targets);
  const hostOf = (planet: string) => catalog.planets.find((p) => p.name === planet)!.hostId;

  it('gives each host its own named star, not a neighbour within the tolerance', () => {
    // Proxima is 0.06 pc from Alpha Centauri A and B: it must keep its own planets.
    expect(layer.targetIdOf(hostOf('Proxima Cen b'))).toBe('proxima');
    expect(layer.targetIdOf(hostOf('TRAPPIST-1 e'))).toBe('trappist-1');
    expect(targets.get('alpha-cen-a')!.details['Known planets']).toBeUndefined();
    expect(targets.get('proxima')!.details['Known planets']).toBeDefined();
  });
});
