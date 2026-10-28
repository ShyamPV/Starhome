import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@starhome/astro';
import { NEBULAE, generateNebula } from '../src';

const res = 32;
const at = (data: Uint8Array, c: number, i: number, j: number, k: number) => (data[((k * res + j) * res + i) * 4 + c]! / 255) ** 2;

describe('nebula catalogue', () => {
  it('has unique ids, real positions and sizes', () => {
    expect(new Set(NEBULAE.map((n) => n.id)).size).toBe(NEBULAE.length);
    for (const n of NEBULAE) {
      expect(n.ra).toBeGreaterThanOrEqual(0);
      expect(n.ra).toBeLessThan(360);
      expect(Math.abs(n.dec)).toBeLessThanOrEqual(90);
      expect(n.distPc).toBeGreaterThan(50);
      expect(n.sizeArcmin[0]).toBeGreaterThan(0);
    }
  });

  it('covers every kind the brief asks for', () => {
    const kinds = new Set(NEBULAE.map((n) => n.kind));
    for (const k of ['emission', 'reflection', 'planetary', 'snr', 'dark']) expect(kinds.has(k as never)).toBe(true);
  });
});

describe('nebula volumes', () => {
  for (const n of NEBULAE.filter((x) => x.model)) {
    it(`${n.id}: is deterministic, finite and emits light`, () => {
      const a = generateNebula({ seed: 3, model: n.model!, res });
      const b = generateNebula({ seed: 3, model: n.model!, res });
      expect(Array.from(a.data.slice(0, 4000))).toEqual(Array.from(b.data.slice(0, 4000)));
      expect(a.emissionSum).toBeGreaterThan(0);
      expect(Number.isFinite(a.maxDustColumn)).toBe(true);
    });
  }

  it('fades to nothing at the box corners (no visible box)', () => {
    for (const n of NEBULAE.filter((x) => x.model)) {
      const v = generateNebula({ seed: 1, model: n.model!, res });
      for (let c = 0; c < 4; c++) expect(at(v.data, c, 0, 0, 0)).toBe(0);
    }
  });

  it('puts [O III] closer to the ionising star than Halpha (ionisation layering)', () => {
    const m42 = NEBULAE.find((n) => n.id === 'm42')!;
    const v = generateNebula({ seed: 1, model: m42.model!, res, sources: [[0, 0, 0]] });
    // Light-weighted mean radius of each channel.
    const meanR = (c: number) => {
      let w = 0;
      let wr = 0;
      for (let k = 0; k < res; k++)
        for (let j = 0; j < res; j++)
          for (let i = 0; i < res; i++) {
            const p: Vec3 = [((i + 0.5) / res) * 2 - 1, ((j + 0.5) / res) * 2 - 1, ((k + 0.5) / res) * 2 - 1];
            const e = at(v.data, c, i, j, k);
            w += e;
            wr += e * Math.hypot(...p);
          }
      return wr / w;
    };
    expect(meanR(1)).toBeLessThan(meanR(0));
  });
});
