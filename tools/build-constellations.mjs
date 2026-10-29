#!/usr/bin/env node
/**
 * Build packages/data/src/constellations.json: IAU constellation names, label positions
 * and stick-figure lines from d3-celestial (Olaf Frohn, BSD-3-Clause; lines after the IAU
 * constellation charts with small modifications by the author).
 *
 *   node tools/build-constellations.mjs            # download (if needed) + build
 *   node tools/build-constellations.mjs --download # force a fresh download
 *
 * Raw files are kept in tools/raw/ (git-ignored).
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master';
const FILES = ['data/constellations.json', 'data/constellations.lines.json', 'LICENSE'];
const outPath = join(root, 'packages/data/src/constellations.json');

async function load(file) {
  const raw = join(root, 'tools/raw', file.split('/').pop());
  const exists = await access(raw).then(() => true, () => false);
  if (exists && !process.argv.includes('--download')) return readFile(raw, 'utf8');
  console.log(`Downloading ${file}...`);
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  const text = await res.text();
  await mkdir(dirname(raw), { recursive: true });
  await writeFile(raw, text);
  return text;
}

/** GeoJSON longitude (-180..180) -> right ascension (0..360), degrees. */
const ra = (lon) => Number((lon < 0 ? lon + 360 : lon).toFixed(4));
const dec = (lat) => Number(lat.toFixed(4));

const [names, lines, license] = await Promise.all(FILES.map(load));
const lineById = new Map(JSON.parse(lines).features.map((f) => [f.id, f.geometry.coordinates]));
const constellations = JSON.parse(names).features.map((f) => ({
  id: f.id,
  name: f.properties.name,
  genitive: f.properties.gen,
  rank: Number(f.properties.rank),
  label: [ra(f.geometry.coordinates[0]), dec(f.geometry.coordinates[1])],
  // Each polyline flattened to [ra0, dec0, ra1, dec1, ...].
  lines: (lineById.get(f.id) ?? []).map((pl) => pl.flatMap(([lon, lat]) => [ra(lon), dec(lat)])),
}));
if (constellations.length < 88) throw new Error(`only ${constellations.length} constellations`);
const ori = constellations.find((c) => c.id === 'Ori');
if (!ori || ori.lines.length === 0) throw new Error('Orion has no lines');

const doc = {
  source: 'd3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial); lines after the IAU constellation charts',
  license: license.trim(),
  constellations,
};
await writeFile(outPath, `${JSON.stringify(doc).replace(/\},\{"id"/g, '},\n{"id"')}\n`);
console.log(`Wrote ${constellations.length} constellations to ${outPath}`);
