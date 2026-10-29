import { describe, expect, it } from 'vitest';
import { SUN_GALACTOCENTRIC_PC, raDecDistToGalactocentric, type Vec3 } from '@starhome/astro';
import { GLOBULAR_CLUSTERS } from '@starhome/data';
import { NEBULAE, buildDustMap, extinctionV, generateGlow } from '@starhome/galaxy';
import { ExposureMeter } from '../src/exposure';
import { nebulaAxes, surfaceBrightnessGain } from '../src/nebulaLayer';

describe('automatic exposure', () => {
  const meter = new ExposureMeter();
  meter.setGlow(generateGlow({ count: 100_000, seed: 1 }));

  it('is neutral at the Sun', () => {
    expect(meter.boostAt(SUN_GALACTOCENTRIC_PC)).toBeCloseTo(1, 5);
  });

  it('brightens the view of the whole Galaxy from outside', () => {
    expect(meter.boostAt([0, 0, 48_000])).toBeGreaterThan(8);
    expect(meter.boostAt([-35_000, 0, 1000])).toBeGreaterThan(5);
  });

  it('darkens inside the bright bulge', () => {
    expect(meter.boostAt([-1200, 400, 150])).toBeLessThan(0.6);
  });

  it('adapts smoothly over time', () => {
    const m = new ExposureMeter();
    m.setGlow(generateGlow({ count: 20_000, seed: 2 }));
    const far: Vec3 = [0, 0, 48_000];
    const first = m.update(0.1, far);
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(m.boostAt(far));
    let v = first;
    for (let i = 0; i < 100; i++) v = m.update(0.1, far);
    expect(v).toBeCloseTo(m.boostAt(far), 3);
  });
});

describe('Harris globular clusters', () => {
  it('loads all 157 clusters with their real parameters', () => {
    expect(GLOBULAR_CLUSTERS).toHaveLength(157);
    const omega = GLOBULAR_CLUSTERS.find((c) => c.designation === 'NGC 5139')!;
    expect(omega.name).toBe('Omega Centauri');
    expect(omega.absMagV).toBeCloseTo(-10.26, 2);
    expect(omega.rhPc).toBeGreaterThan(6);
    expect(omega.rhPc).toBeLessThan(9);
    const m13 = GLOBULAR_CLUSTERS.find((c) => c.designation === 'NGC 6205')!;
    expect(m13.name).toBe('M13 (Hercules Cluster)');
    expect(GLOBULAR_CLUSTERS.find((c) => c.alt === 'M 92')!.name).toBe('M92');
    expect(new Set(GLOBULAR_CLUSTERS.map((c) => c.id)).size).toBe(157);
  });

  it("places Omega Centauri at its Galactocentric position", () => {
    const c = GLOBULAR_CLUSTERS.find((g) => g.designation === 'NGC 5139')!;
    const p = raDecDistToGalactocentric(c.ra, c.dec, c.distKpc * 1000);
    expect(p[0] / 1000).toBeCloseTo(-5.0, 1);
    expect(p[1] / 1000).toBeCloseTo(-3.9, 1);
    expect(p[2] / 1000).toBeCloseTo(1.36, 1);
  });

  it("validates the dust model against the clusters' measured reddening", () => {
    const map = buildDustMap();
    const sun = SUN_GALACTOCENTRIC_PC.map((c) => c / 1000) as Vec3;
    const rows = GLOBULAR_CLUSTERS.filter((c) => c.ebv != null).map((c) => {
      const p = raDecDistToGalactocentric(c.ra, c.dec, c.distKpc * 1000).map((v) => v / 1000) as Vec3;
      return { model: extinctionV(map, sun, p), measured: 3.1 * c.ebv! };
    });
    const rank = (xs: number[]) => {
      const r = new Array<number>(xs.length);
      xs.map((x, i) => [x, i] as const)
        .sort((a, b) => a[0] - b[0])
        .forEach(([, i], k) => (r[i] = k));
      return r;
    };
    const rm = rank(rows.map((r) => r.model));
    const ro = rank(rows.map((r) => r.measured));
    const n = rows.length;
    const spearman = 1 - (6 * rm.reduce((s, v, i) => s + (v - ro[i]!) ** 2, 0)) / (n * (n * n - 1));
    expect(spearman).toBeGreaterThan(0.8);
    const ratios = rows
      .filter((r) => r.measured > 0.3)
      .map((r) => r.model / r.measured)
      .sort((a, b) => a - b);
    const median = ratios[ratios.length >> 1]!;
    expect(median).toBeGreaterThan(0.4);
    expect(median).toBeLessThan(1.5);
  });
});

describe('nebulae', () => {
  it('expose faint nebulae more than bright ones, keeping their order', () => {
    const g = (id: string) => surfaceBrightnessGain(NEBULAE.find((n) => n.id === id)!);
    // Ring Nebula is compact and bright, the Orion Nebula brighter overall, the Veil very faint.
    expect(g('m57')).toBeLessThan(g('m42'));
    expect(g('m42')).toBeLessThan(g('veil'));
  });

  it('orients each volume with +z toward the Sun and orthonormal axes', () => {
    const n = NEBULAE.find((x) => x.id === 'm1')!;
    const c = raDecDistToGalactocentric(n.ra, n.dec, n.distPc);
    const [x, y, z] = nebulaAxes(c, n.paDeg);
    const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(x, y)).toBeCloseTo(0, 9);
    expect(dot(y, z)).toBeCloseTo(0, 9);
    expect(dot(x, x)).toBeCloseTo(1, 9);
    const s = SUN_GALACTOCENTRIC_PC;
    const toSun: Vec3 = [s[0] - c[0], s[1] - c[1], s[2] - c[2]];
    expect(dot(z, toSun) / Math.hypot(...toSun)).toBeCloseTo(1, 9);
  });
});
