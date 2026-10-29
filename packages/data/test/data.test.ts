import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS, CONSTELLATION_DATA_LICENSE, parseTleText } from '../src';

describe('constellations', () => {
  it('has all 88 IAU constellations (Serpens in two parts) with valid lines', () => {
    expect(CONSTELLATIONS).toHaveLength(89);
    expect(new Set(CONSTELLATIONS.map((c) => c.name)).size).toBeGreaterThanOrEqual(88);
    for (const c of CONSTELLATIONS) {
      expect(c.label[0]).toBeGreaterThanOrEqual(0);
      expect(c.label[0]).toBeLessThan(360);
      for (const pl of c.lines) {
        expect(pl.length % 2).toBe(0);
        for (let i = 0; i < pl.length; i += 2) {
          expect(pl[i]!).toBeGreaterThanOrEqual(0);
          expect(pl[i]!).toBeLessThan(360);
          expect(Math.abs(pl[i + 1]!)).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it("draws Orion through Betelgeuse's position", () => {
    const ori = CONSTELLATIONS.find((c) => c.id === 'Ori')!;
    const pts = ori.lines.flatMap((pl) => pl.flatMap((_, i) => (i % 2 === 0 ? [[pl[i]!, pl[i + 1]!]] : [])));
    expect(pts.some(([ra, dec]) => Math.abs(ra! - 88.79) < 0.1 && Math.abs(dec! - 7.41) < 0.1)).toBe(true);
  });

  it('carries the BSD licence notice of its source', () => {
    expect(CONSTELLATION_DATA_LICENSE).toContain('Olaf Frohn');
  });
});

describe('TLE parsing', () => {
  it('reads three-line sets and skips junk, with CRLF line endings', () => {
    const text = [
      'ISS (ZARYA)             ',
      '1 25544U 98067A   26300.82187419  .00005456  00000+0  10681-3 0  9999',
      '2 25544  51.6336   3.7485 0007015 317.3678  42.6766 15.49080514592319',
      'garbage line',
      'CSS (TIANHE)',
      '1 48274U 21035A   26300.84762791  .00006899  00000+0  83028-4 0  9997',
      '2 48274  41.4695 236.0745 0003391 226.0973 133.9587 15.61208696313881',
    ].join('\r\n');
    const tles = parseTleText(text);
    expect(tles.map((t) => t.name)).toEqual(['ISS (ZARYA)', 'CSS (TIANHE)']);
    expect(tles[1]!.line2.startsWith('2 48274')).toBe(true);
  });
});
