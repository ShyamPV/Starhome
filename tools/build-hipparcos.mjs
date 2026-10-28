#!/usr/bin/env node
/**
 * Download the Hipparcos catalogue from VizieR and pack it into apps/web/public/data/hipparcos.bin.
 *
 *   node tools/build-hipparcos.mjs            # download + build
 *   node tools/build-hipparcos.mjs --offline  # rebuild from tools/raw/hipparcos.csv
 *
 * Positions and parallaxes: Hipparcos new reduction (van Leeuwen 2007, VizieR I/311).
 * V magnitudes: original Hipparcos catalogue (ESA 1997, VizieR I/239).
 * Both are free to use with acknowledgement (see README "Data sources").
 *
 * Binary layout is documented in packages/data/src/hipparcos.ts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = join(root, 'tools/raw/hipparcos.csv');
const outPath = join(root, 'apps/web/public/data/hipparcos.bin');

const TAP = 'https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync';
const QUERY = `
SELECT n.HIP, n.RArad, n.DErad, n.Plx, m.Vmag, n."B-V"
FROM "I/311/hip2" AS n JOIN "I/239/hip_main" AS m ON m.HIP = n.HIP
WHERE m.Vmag IS NOT NULL`;

// ICRS -> Galactic (Hipparcos definition), same matrix as packages/astro/src/coords.ts
const A = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
const DEG = Math.PI / 180;
/** Stars with poor or negative parallax are placed no farther than this. */
const MAX_DIST_PC = 2000;

function bvToTeff(bv) {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

function teffToLinearRgb(teff) {
  const t = Math.min(40000, Math.max(1000, teff)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  const lin = (c) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const rgb = [lin(r), lin(g), lin(b)];
  const m = Math.max(...rgb) || 1;
  return rgb.map((c) => Math.round((c / m) * 255));
}

async function download() {
  const body = new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: '200000', QUERY });
  console.log('Querying VizieR TAP...');
  const res = await fetch(TAP, { method: 'POST', body });
  if (!res.ok) throw new Error(`VizieR returned HTTP ${res.status}`);
  const csv = await res.text();
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, csv);
  return csv;
}

function parse(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift().split(',').map((h) => h.replace(/"/g, '').trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`column ${name} missing; got ${header.join(', ')}`);
    return i;
  };
  const iHip = col('HIP');
  const iRa = col('RArad');
  const iDe = col('DErad');
  const iPlx = col('Plx');
  const iV = col('Vmag');
  const iBv = col('B-V');
  const stars = [];
  for (const line of lines) {
    const f = line.split(',');
    const hip = Number(f[iHip]);
    const ra = Number(f[iRa]);
    const de = Number(f[iDe]);
    const plx = Number(f[iPlx]);
    const v = Number(f[iV]);
    const bv = f[iBv] === '' ? 0.6 : Number(f[iBv]);
    if (!Number.isFinite(ra) || !Number.isFinite(de) || !Number.isFinite(v)) continue;
    const d = plx > 1000 / MAX_DIST_PC ? 1000 / plx : MAX_DIST_PC;
    stars.push({ hip, ra, de, d, v, bv });
  }
  return stars;
}

function pack(stars) {
  const n = stars.length;
  const buf = new ArrayBuffer(16 + n * (12 + 4 + 4 + 4));
  const view = new DataView(buf);
  'VLHP'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
  view.setUint32(4, 1, true);
  view.setUint32(8, n, true);
  let off = 16;
  const pos = new Float32Array(buf, off, n * 3);
  off += n * 12;
  const mag = new Float32Array(buf, off, n);
  off += n * 4;
  const hip = new Uint32Array(buf, off, n);
  off += n * 4;
  const rgba = new Uint8Array(buf, off, n * 4);
  stars.forEach((s, i) => {
    const c = Math.cos(s.de * DEG);
    const e = [c * Math.cos(s.ra * DEG) * s.d, c * Math.sin(s.ra * DEG) * s.d, Math.sin(s.de * DEG) * s.d];
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = A[k][0] * e[0] + A[k][1] * e[1] + A[k][2] * e[2];
    mag[i] = s.v - 5 * Math.log10(s.d) + 5;
    hip[i] = s.hip;
    const [r, g, b] = teffToLinearRgb(bvToTeff(s.bv));
    rgba.set([r, g, b, 255], i * 4);
  });
  return new Uint8Array(buf);
}

const offline = process.argv.includes('--offline');
const csv = offline ? await readFile(rawPath, 'utf8') : await download();
const stars = parse(csv);
const bin = pack(stars);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, bin);
console.log(`Wrote ${stars.length} stars (${(bin.length / 1e6).toFixed(1)} MB) to ${outPath}`);
