import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXTREMES, TOURS, closestExoplanetsTour, parseExoplanets } from '@starhome/data';
import { SolarSystem } from '../src/solarSystem';
import { buildTargets } from '../src/targets';
import { decodeViewState, encodeViewState, type ViewState } from '../src/viewState';

const galaxyView: ViewState = {
  view: 'galaxy',
  jd: 2_461_000.123_456,
  selected: 'm42',
  anchor: 'm42',
  offsetKm: [1.234_567_891e13, -9.87e12, 4.5e11],
  distanceKm: 6.2e14,
  yaw: 1.2345,
  pitch: -0.4321,
  sky: null,
};

describe('shareable view state', () => {
  it('round-trips a galaxy view', () => {
    const v = decodeViewState(encodeViewState(galaxyView))!;
    expect(v.view).toBe('galaxy');
    expect(v.jd).toBeCloseTo(galaxyView.jd!, 5);
    expect(v.selected).toBe('m42');
    expect(v.anchor).toBe('m42');
    // Nine significant digits on the offset: a few km at 10^13 km.
    v.offsetKm!.forEach((c, i) => expect(Math.abs(c - galaxyView.offsetKm![i]!)).toBeLessThan(Math.abs(galaxyView.offsetKm![i]!) * 1e-8));
    expect(v.distanceKm / galaxyView.distanceKm).toBeCloseTo(1, 5);
    expect(v.yaw).toBeCloseTo(1.2345, 4);
    expect(v.pitch).toBeCloseTo(-0.4321, 4);
  });

  it('follows the clock when no time is given, and omits the camera offset when following', () => {
    const s = encodeViewState({ ...galaxyView, jd: null, offsetKm: null });
    const p = new URLSearchParams(s);
    expect(p.has('t')).toBe(false);
    expect(p.has('o')).toBe(false);
    const v = decodeViewState(s)!;
    expect(v.jd).toBeNull();
    expect(v.offsetKm).toBeNull();
  });

  it('round-trips a sky view with the location rounded to ~10 km', () => {
    const s = encodeViewState({ ...galaxyView, view: 'sky', anchor: null, offsetKm: null, sky: { location: { latDeg: -36.84853, lonDeg: 174.76349 }, az: 123.45, alt: 33.3, fov: 45 } });
    expect(s).toContain('loc=-36.8%2C174.8');
    const v = decodeViewState(s)!;
    expect(v.view).toBe('sky');
    expect(v.sky).toEqual({ location: { latDeg: -36.8, lonDeg: 174.8 }, az: 123.5, alt: 33.3, fov: 45 });
  });

  it('writes Greenwich as 0.0, not -0.0', () => {
    const s = encodeViewState({ ...galaxyView, view: 'sky', sky: { location: { latDeg: 51.4769, lonDeg: -0.0005 }, az: 0, alt: 0, fov: 70 } });
    expect(new URLSearchParams(s).get('loc')).toBe('51.5,0.0');
  });

  it('rejects junk and clamps out-of-range values', () => {
    expect(decodeViewState('')).toBeNull();
    expect(decodeViewState('#foo=bar')).toBeNull();
    const v = decodeViewState('#at=sun&d=-5&a=0.5,9&t=nonsense')!;
    expect(v.distanceKm).toBeGreaterThan(0);
    expect(v.pitch).toBeLessThan(Math.PI / 2);
    expect(v.jd).toBeNull();
    const sky = decodeViewState('v=sky&look=400,120,500&loc=95,190')!;
    expect(sky.sky).toEqual({ location: { latDeg: 90, lonDeg: -170 }, az: 40, alt: 89, fov: 110 });
  });
});

describe('tours', () => {
  const ids = new Set(buildTargets(new SolarSystem()).map((t) => t.id));

  it('every stop of the curated tours and the extremes list is a real target', () => {
    for (const tour of TOURS) {
      expect(tour.stops.length).toBeGreaterThanOrEqual(5);
      for (const s of tour.stops) expect(ids, `${tour.id}: ${s.id}`).toContain(s.id);
    }
    for (const e of EXTREMES) expect(ids, e.id).toContain(e.id);
    expect(TOURS.find((t) => t.id === 'extreme-stars')!.stops).toHaveLength(10);
  });

  it('builds the nearest-exoplanets tour from the archive, nearest first', () => {
    const catalog = parseExoplanets(JSON.parse(readFileSync('apps/web/public/data/exoplanets.json', 'utf8')));
    const tour = closestExoplanetsTour(catalog, 7);
    expect(tour.stops).toHaveLength(7);
    expect(tour.stops[0]!.title).toBe('Proxima Cen');
    expect(tour.stops[0]!.text).toMatch(/^1\.30 pc/);
    const host = (id: string) => catalog.hosts.find((h) => h.id === id)!;
    const d = tour.stops.map((s) => host(s.id).distPc!);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
});
