import { describe, expect, it } from 'vitest';
import { SUN_GALACTOCENTRIC_PC, sphericalToCartesian, type Vec3 } from '@starhome/astro';
import { BUBBLE_CENTER_KPC, DUST, buildDustMap, extinctionV, midplaneExtinction, reddeningFactors, sampleDustMap } from '../src';

const map = buildDustMap();
const sun = SUN_GALACTOCENTRIC_PC.map((c) => c / 1000) as Vec3;

function toward(l: number, b: number, dKpc: number, samples?: number): number {
  const v = sphericalToCartesian(l, b, dKpc);
  return extinctionV(map, sun, [sun[0] + v[0], sun[1] + v[1], sun[2] + v[2]], samples);
}

/** Brute-force reference: march the full 3D density with tiny steps. */
function marchedExtinction(a: Vec3, b: Vec3, steps = 40_000): number {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const d = Math.hypot(x - BUBBLE_CENTER_KPC[0], y - BUBBLE_CENTER_KPC[1], z - BUBBLE_CENTER_KPC[2]);
    const s = Math.min(1, Math.max(0, (d - DUST.bubble.inner) / (DUST.bubble.outer - DUST.bubble.inner)));
    const bubble = DUST.bubble.floor + (1 - DUST.bubble.floor) * s * s * (3 - 2 * s);
    sum += sampleDustMap(map, x, y) * Math.exp(-Math.abs(z) / DUST.hz) * bubble;
  }
  return (sum * len) / steps;
}

describe('dust calibration (V-band extinction)', () => {
  it('hides the Galactic centre behind ~20-40 magnitudes', () => {
    const av = toward(0, -0.046, 8.178);
    expect(av).toBeGreaterThan(18);
    expect(av).toBeLessThan(40);
  });

  it("leaves Baade's window (l=1, b=-3.9) relatively clear", () => {
    const av = toward(1, -3.9, 8);
    expect(av).toBeGreaterThan(1.2);
    expect(av).toBeLessThan(3);
  });

  it('is nearly transparent toward the Galactic poles', () => {
    expect(toward(0, 90, 50)).toBeLessThan(0.1);
    expect(toward(0, -90, 50)).toBeLessThan(0.1);
  });

  it('averages ~0.4-1.2 mag/kpc in the plane near the Sun', () => {
    for (const l of [0, 60, 90, 120, 180, 240, 300]) {
      const av = toward(l, 0, 1);
      expect(av).toBeGreaterThan(0.35);
      expect(av).toBeLessThan(1.2);
    }
  });

  it('keeps the Local Bubble almost dust-free', () => {
    expect(toward(0, 0, 0.08)).toBeLessThan(0.03);
  });

  it('reddens: blue is absorbed more than red', () => {
    const [r, g, b] = reddeningFactors(1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('puts the dust lanes on the inner edge of the arms', () => {
    // Near the Sagittarius-Carina arm (R ~ 6.9 kpc at the Sun's azimuth), the dust peaks
    // inside the stellar arm centre line.
    let best = 0;
    let bestR = 0;
    for (let r = 6; r < 8; r += 0.01) {
      const a = midplaneExtinction(-r, 0) * Math.exp((r - 8.178) / DUST.rd);
      if (a > best) {
        best = a;
        bestR = r;
      }
    }
    expect(bestR).toBeLessThan(6.9);
  });
});

describe('dust integration', () => {
  it('matches the GPU texel layout: map samples equal the model at texel centres', () => {
    const n = map.size;
    const e = map.extentKpc;
    for (const [i, j] of [
      [100, 200],
      [256, 256],
      [400, 30],
    ] as const) {
      const x = ((i + 0.5) / n) * 2 * e - e;
      const y = ((j + 0.5) / n) * 2 * e - e;
      expect(sampleDustMap(map, x, y)).toBeCloseTo(midplaneExtinction(x, y), 5);
    }
  });

  it('agrees with a brute-force march for in-plane, oblique and outside-the-disc rays', () => {
    const rays: [Vec3, Vec3][] = [
      [sun, [-2, 1, 0.05]],
      [sun, [-6, -3, -0.6]],
      [[-3, -2, 30], [-5, 1, -0.2]], // from far above the disc to a star below the mid-plane
      [[-30, 5, 2], [4, -2, 0.1]], // nearly edge-on from outside
    ];
    for (const [a, b] of rays) {
      const ref = marchedExtinction(a, b);
      // The default sample count (48) should be within a few per cent; the shader's 10 within ~15%.
      expect(extinctionV(map, a, b)).toBeCloseTo(ref, ref > 1 ? 0 : 1);
      expect(Math.abs(extinctionV(map, a, b, 10) - ref)).toBeLessThan(0.15 * ref + 0.02);
    }
  });
});
