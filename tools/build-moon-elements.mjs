#!/usr/bin/env node
/**
 * Fits mean orbital elements for the major moons to JPL's own satellite ephemerides
 * (via the Horizons API), and writes packages/data/src/moonElements.json.
 *
 * Why fit rather than copy JPL's published mean-element tables: their conventions differ
 * between planets (Saturn's table in particular could not be reproduced reliably from
 * its description), whereas a fit to Horizons is checked against Horizons directly.
 *
 * Model, in a reference plane near each orbit (the Laplace plane or the planet's equator,
 * pole oriented along the orbital angular momentum): a, e, i constant; node, longitude of
 * periapsis and mean longitude linear in time. Fitted to planet-centred ICRF state vectors
 * sampled 2000-2050; the RMS and worst angular error over that span are stored with each
 * moon and shown in the app.
 *
 * Galilean moons are not fitted: astronomy-engine computes them from the L1.2 theory.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'data', 'src', 'moonElements.json');
const D = Math.PI / 180;
const EPOCH = 2461041.5; // 2026-01-01 00:00 TDB: elements are referred to here.

// Horizons id, planet centre id, GM of planet + moon (km^3/s^2), reference pole (ICRF RA, Dec).
const MOONS = {
  phobos: [401, 499, 42828.37, [317.7, 52.9]],
  deimos: [402, 499, 42828.37, [316.6, 53.5]],
  mimas: [601, 699, 37931207 + 2.5, [40.6, 83.5]],
  enceladus: [602, 699, 37931207 + 7.2, [40.6, 83.5]],
  tethys: [603, 699, 37931207 + 41.2, [40.6, 83.5]],
  dione: [604, 699, 37931207 + 73.1, [40.6, 83.5]],
  rhea: [605, 699, 37931207 + 153.9, [40.6, 83.5]],
  titan: [606, 699, 37931207 + 8978.1, [36.4, 84.0]],
  iapetus: [608, 699, 37931207 + 120.5, [288.7, 78.9]],
  // Uranus rotates and its moons orbit retrograde relative to the IAU "north" pole.
  miranda: [705, 799, 5793951 + 4.3, [77.311, 15.175]],
  ariel: [701, 799, 5793951 + 83.5, [77.311, 15.175]],
  umbriel: [702, 799, 5793951 + 85.1, [77.311, 15.175]],
  titania: [703, 799, 5793951 + 226.9, [77.311, 15.175]],
  oberon: [704, 799, 5793951 + 205.3, [77.311, 15.175]],
  triton: [801, 899, 6835100 + 1428.5, [299.36, 43.46]],
  charon: [901, 999, 869.6 + 106.1, [132.993, -6.163]],
};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const wrap = (x) => ((((x + 180) % 360) + 360) % 360) - 180;

function frame([ra, dec]) {
  const p = [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
  const x0 = cross([0, 0, 1], p);
  const x = x0.map((c) => c / len(x0));
  return { x, y: cross(p, x), p };
}

async function vectors(id, centre, start, stop, intervals) {
  const q = new URLSearchParams({
    format: 'text',
    COMMAND: `'${id}'`,
    CENTER: `'500@${centre}'`,
    EPHEM_TYPE: 'VECTORS',
    START_TIME: `'JD${start}'`,
    STOP_TIME: `'JD${stop}'`,
    STEP_SIZE: `'${intervals}'`,
    REF_PLANE: 'FRAME',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'KM-S',
    VEC_TABLE: '2',
    CSV_FORMAT: 'YES',
    TIME_TYPE: 'TDB',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${q}`);
    const text = await res.text();
    const body = text.split('$$SOE')[1]?.split('$$EOE')[0];
    if (body) {
      return body
        .trim()
        .split('\n')
        .map((l) => l.split(',').map((s) => s.trim()))
        .map((c) => ({ jd: Number(c[0]), r: [Number(c[2]), Number(c[3]), Number(c[4])], v: [Number(c[5]), Number(c[6]), Number(c[7])] }));
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Horizons gave no vectors for ${id}`);
}

/** Osculating elements in the reference frame (degrees, km). */
function elements(s, mu, f) {
  const r = [dot(s.r, f.x), dot(s.r, f.y), dot(s.r, f.p)];
  const v = [dot(s.v, f.x), dot(s.v, f.y), dot(s.v, f.p)];
  const h = cross(r, v);
  const i = Math.acos(h[2] / len(h)) / D;
  const node = Math.atan2(h[0], -h[1]) / D;
  const ev = cross(v, h).map((c, k) => c / mu - r[k] / len(r));
  const e = len(ev);
  const a = 1 / (2 / len(r) - dot(v, v) / mu);
  // Longitudes measured in the reference plane (as for planets, "broken" at the node).
  const inPlane = (u) => {
    // Angle within the orbit plane from the node, then add the node.
    const n = [Math.cos(node * D), Math.sin(node * D), 0];
    const m = cross(h.map((c) => c / len(h)), n);
    return node + Math.atan2(dot(u, m), dot(u, n)) / D;
  };
  const trueLon = inPlane(r);
  const peri = e > 1e-9 ? inPlane(ev) : 0;
  const nu = (trueLon - peri) * D;
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const M = (E - e * Math.sin(E)) / D;
  return { jd: s.jd, a, e, i, node, peri, lambda: peri + M };
}

/** Least-squares line y = y0 + k (t - t0). */
function line(ts, ys, t0) {
  const n = ts.length;
  const mt = ts.reduce((s, t) => s + (t - t0), 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let k = 0; k < n; k++) {
    sxy += (ts[k] - t0 - mt) * (ys[k] - my);
    sxx += (ts[k] - t0 - mt) ** 2;
  }
  const k = sxx ? sxy / sxx : 0;
  return { y0: my - k * mt, k };
}

/** Gaussian elimination for a small dense system. */
function solve(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = m[r][c] / m[c][c];
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Unwrap a sequence of angles (degrees) in time order. */
function unwrap(xs) {
  const out = [xs[0]];
  for (let k = 1; k < xs.length; k++) out.push(out[k - 1] + wrap(xs[k] - xs[k - 1]));
  return out;
}

/** Same model as packages/astro/src/moons.ts satelliteOffsetJ2000. */
function position(el, jd) {
  const dt = jd - el.epochJd;
  const node = (el.nodeDeg + el.nodeRate * dt) * D;
  const peri = el.periDeg + el.periRate * dt;
  const lambda = el.lambdaDeg + el.meanMotion * dt + (el.libration ? el.libration.ampDeg * Math.sin((2 * Math.PI * dt) / el.libration.periodDays + el.libration.phaseDeg * D) : 0);
  const M = (lambda - peri) * D;
  let E = M;
  for (let k = 0; k < 20; k++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
  const r = el.aKm * (1 - el.e * Math.cos(E));
  const u = (peri * D - node) + nu;
  const i = el.iDeg * D;
  const l = [r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(i)), r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(i)), r * Math.sin(u) * Math.sin(i)];
  const f = frame([el.refPoleRa, el.refPoleDec]);
  return [0, 1, 2].map((k) => f.x[k] * l[0] + f.y[k] * l[1] + f.p[k] * l[2]);
}

const result = {};
for (const [name, [id, centre, mu, pole]] of Object.entries(MOONS)) {
  const f = frame(pole);
  // Mean motion from a dense run over a few orbits around the epoch.
  const probe = elements((await vectors(id, centre, EPOCH, EPOCH + 1, 2))[0], mu, f);
  const period = (2 * Math.PI * Math.sqrt(probe.a ** 3 / mu)) / 86400;
  const dense = (await vectors(id, centre, EPOCH, EPOCH + 4 * period, 600)).map((s) => elements(s, mu, f));
  const dl = unwrap(dense.map((e) => e.lambda));
  let fitL = line(
    dense.map((e) => e.jd),
    dl,
    EPOCH,
  );
  // Then 2000-2050, refining the mean motion over growing windows so each step unwraps safely.
  const sparse = (await vectors(id, centre, 2451545.0, 2469807.5, 2400)).map((s) => elements(s, mu, f));
  for (const span of [30, 120, 500, 2000, 6000, 20000]) {
    const win = sparse.filter((e) => Math.abs(e.jd - EPOCH) <= span);
    if (win.length < 4) continue;
    const ys = win.map((e) => fitL.y0 + fitL.k * (e.jd - EPOCH) + wrap(e.lambda - (fitL.y0 + fitL.k * (e.jd - EPOCH))));
    fitL = line(
      win.map((e) => e.jd),
      ys,
      EPOCH,
    );
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  // Resonant moons (Mimas with Tethys) librate in longitude by tens of degrees over decades:
  // fit one sinusoid to what the straight line leaves, if that is large.
  let libration = null;
  const resid = sparse.map((x) => wrap(x.lambda - (fitL.y0 + fitL.k * (x.jd - EPOCH))));
  if (Math.sqrt(mean(resid.map((r) => r * r))) > 3) {
    let best = null;
    for (let P = 20 * 365.25; P <= 120 * 365.25; P += 30) {
      // Linear least squares for y = c0 + c1 t + A sin + B cos (the line is refitted with it).
      const rows = sparse.map((x) => { const t = x.jd - EPOCH; const w = (2 * Math.PI * t) / P; return [1, t, Math.sin(w), Math.cos(w)]; });
      const ys = resid;
      const ata = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => rows.reduce((s, row) => s + row[r] * row[c], 0)));
      const aty = [0, 1, 2, 3].map((r) => rows.reduce((s, row, k) => s + row[r] * ys[k], 0));
      const sol = solve(ata, aty);
      const err = rows.reduce((s, row, k) => s + (ys[k] - row.reduce((q, v, j) => q + v * sol[j], 0)) ** 2, 0);
      if (!best || err < best.err) best = { err, P, sol };
    }
    fitL = { y0: fitL.y0 + best.sol[0], k: fitL.k + best.sol[1] };
    libration = { ampDeg: Number(Math.hypot(best.sol[2], best.sol[3]).toFixed(3)), periodDays: Math.round(best.P), phaseDeg: Number(((Math.atan2(best.sol[3], best.sol[2]) / D + 360) % 360).toFixed(2)) };
  }
  const e = mean(sparse.map((x) => x.e));
  const i = mean(sparse.map((x) => x.i));
  const ts = sparse.map((x) => x.jd);
  // Node and periapsis drift slowly enough to unwrap sample to sample; when the
  // inclination or eccentricity is tiny they are meaningless and held fixed.
  const fitNode = i > 0.05 ? line(ts, unwrap(sparse.map((x) => x.node)), EPOCH) : { y0: 0, k: 0 };
  const fitPeri = e > 0.002 ? line(ts, unwrap(sparse.map((x) => x.peri)), EPOCH) : { y0: 0, k: 0 };
  const el = {
    aKm: Math.round(mean(sparse.map((x) => x.a))),
    e: e > 0.002 ? Number(e.toFixed(5)) : 0,
    iDeg: i > 0.05 ? Number(i.toFixed(3)) : 0,
    nodeDeg: Number((((fitNode.y0 % 360) + 360) % 360).toFixed(3)),
    nodeRate: Number(fitNode.k.toPrecision(8)),
    periDeg: Number((((fitPeri.y0 % 360) + 360) % 360).toFixed(3)),
    periRate: Number(fitPeri.k.toPrecision(8)),
    lambdaDeg: Number((((fitL.y0 % 360) + 360) % 360).toFixed(4)),
    meanMotion: Number(fitL.k.toPrecision(12)),
    refPoleRa: pole[0],
    refPoleDec: pole[1],
    epochJd: EPOCH,
    ...(libration ? { libration } : {}),
  };
  // Check against the Horizons positions themselves.
  const raw = await vectors(id, centre, 2451545.0, 2469807.5, 600);
  const errs = raw.map((s) => {
    const p = position(el, s.jd);
    return Math.acos(Math.min(1, dot(p, s.r) / len(p) / len(s.r))) / D;
  });
  el.rmsErrorDeg = Number(Math.sqrt(mean(errs.map((x) => x * x))).toFixed(2));
  el.maxErrorDeg = Number(Math.max(...errs).toFixed(2));
  result[name] = el;
  console.log(`${name.padEnd(10)} a ${String(el.aKm).padStart(8)} km  e ${el.e.toFixed(4)}  i ${el.iDeg.toFixed(2)}  rms ${el.rmsErrorDeg}°  max ${el.maxErrorDeg}°`);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      source: 'Fitted by tools/build-moon-elements.mjs to JPL Horizons satellite ephemerides (planet-centred ICRF vectors, 2000-2050).',
      retrieved: new Date().toISOString().slice(0, 10),
      moons: result,
    },
    null,
    2,
  )}\n`,
);
console.log(`-> ${OUT}`);
