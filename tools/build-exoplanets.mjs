#!/usr/bin/env node
/**
 * Download the NASA Exoplanet Archive's Planetary Systems Composite Parameters table
 * (pscomppars: one row per confirmed planet, best available values) and pack it into
 * apps/web/public/data/exoplanets.json for the app.
 *
 *   node tools/build-exoplanets.mjs            # download + build
 *   node tools/build-exoplanets.mjs --offline  # rebuild from tools/raw/exoplanets.csv
 *
 * The archive is public; it asks for this acknowledgement: "This research has made use
 * of the NASA Exoplanet Archive, which is operated by the California Institute of
 * Technology, under contract with the National Aeronautics and Space Administration
 * under the Exoplanet Exploration Program." The browser cannot query the archive
 * directly (no CORS), so the app ships this snapshot; rerun to refresh it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = join(root, 'tools/raw/exoplanets.csv');
const outPath = join(root, 'apps/web/public/data/exoplanets.json');
const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

// Column -> short key in the output. Order matters: it is the row layout.
const COLUMNS = [
  ['pl_name', 'name'],
  ['hostname', 'host'],
  ['ra', 'ra'],
  ['dec', 'dec'],
  ['sy_dist', 'dist'],
  ['sy_pnum', 'np'],
  ['sy_vmag', 'vmag'],
  ['discoverymethod', 'method'],
  ['disc_year', 'year'],
  ['disc_facility', 'facility'],
  ['pl_orbper', 'per'],
  ['pl_orbsmax', 'a'],
  ['pl_orbeccen', 'e'],
  ['pl_orbincl', 'inc'],
  ['pl_orblper', 'w'],
  ['pl_rade', 'rade'],
  ['pl_bmasse', 'masse'],
  ['pl_eqt', 'teq'],
  ['pl_insol', 'insol'],
  ['st_spectype', 'spt'],
  ['st_teff', 'teff'],
  ['st_rad', 'srad'],
  ['st_mass', 'smass'],
  ['st_lum', 'slum'],
  ['st_age', 'age'],
];

async function download() {
  const query = `select ${COLUMNS.map((c) => c[0]).join(',')} from pscomppars`;
  const url = `${TAP}?query=${encodeURIComponent(query)}&format=csv`;
  console.log('Querying NASA Exoplanet Archive...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`archive returned HTTP ${res.status}`);
  const csv = await res.text();
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, csv);
  return csv;
}

/** Minimal CSV parser (quoted fields with commas, doubled quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const offline = process.argv.includes('--offline');
const csv = offline ? await readFile(rawPath, 'utf8') : await download();
const [header, ...data] = parseCsv(csv);
const idx = COLUMNS.map(([col]) => {
  const i = header.indexOf(col);
  if (i < 0) throw new Error(`column ${col} missing`);
  return i;
});
const numeric = new Set(['ra', 'dec', 'dist', 'np', 'vmag', 'year', 'per', 'a', 'e', 'inc', 'w', 'rade', 'masse', 'teq', 'insol', 'teff', 'srad', 'smass', 'slum', 'age']);
const digits = { ra: 5, dec: 5, dist: 3, vmag: 3, per: 6, a: 6, e: 4, inc: 3, w: 2, rade: 3, masse: 3, teq: 0, insol: 3, teff: 0, srad: 4, smass: 4, slum: 4, age: 3 };
const rows = data.map((r) =>
  COLUMNS.map(([, key], k) => {
    const v = r[idx[k]] ?? '';
    if (v === '') return null;
    if (!numeric.has(key)) return v;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return digits[key] === undefined ? n : Number(n.toFixed(digits[key]));
  }),
);
rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])));
if (rows.length < 5000) throw new Error(`only ${rows.length} planets`);
const doc = {
  source: 'NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)',
  acknowledgement:
    'This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.',
  retrieved: new Date().toISOString().slice(0, 10),
  columns: COLUMNS.map((c) => c[1]),
  rows,
};
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(doc));
console.log(`Wrote ${rows.length} planets (${(JSON.stringify(doc).length / 1e6).toFixed(2)} MB) to ${outPath}`);
