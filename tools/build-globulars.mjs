#!/usr/bin/env node
/**
 * Build packages/data/src/globularClusters.json from the Harris catalogue of Milky Way
 * globular clusters (Harris 1996, AJ 112, 1487; 2010 edition, 157 clusters).
 *
 *   node tools/build-globulars.mjs            # download (if needed) + build
 *   node tools/build-globulars.mjs --download # force a fresh download
 *
 * The catalogue is free to use; anyone redistributing it must refer to the original
 * source (https://physics.mcmaster.ca/~harris/mwgc.dat) and must not charge for it.
 * The raw file is kept in tools/raw/ (git-ignored).
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawPath = join(root, 'tools/raw/mwgc.dat');
const outPath = join(root, 'packages/data/src/globularClusters.json');
const SOURCE = 'https://physics.mcmaster.ca/~harris/mwgc.dat';

async function load() {
  const exists = await access(rawPath).then(() => true, () => false);
  if (exists && !process.argv.includes('--download')) return readFile(rawPath, 'utf8');
  console.log(`Downloading ${SOURCE}...`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${SOURCE}`);
  const text = await res.text();
  await mkdir(dirname(rawPath), { recursive: true });
  await writeFile(rawPath, text);
  return text;
}

/** Fixed-width field as a number, or null when blank. */
function num(line, from, to) {
  const s = line.slice(from, to).trim();
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function sexagesimal(s, hours) {
  const parts = s.trim().split(/\s+/).map(Number);
  const sign = s.trim().startsWith('-') ? -1 : 1;
  const [a, b = 0, c = 0] = parts.map(Math.abs);
  const deg = a + b / 60 + c / 3600;
  return sign * deg * (hours ? 15 : 1);
}

function parse(text) {
  const lines = text.split(/\r?\n/);
  const part = (title) => lines.findIndex((l) => l.includes(title));
  const p1 = part('Part I:');
  const p2 = part('Part II:');
  const p3 = part('Part III:');
  if (p1 < 0 || p2 < 0 || p3 < 0) throw new Error('unexpected catalogue layout');
  // Data rows start with a space and an identifier in columns 1-11.
  const rows = (from, to) => lines.slice(from, to).filter((l) => /^ \S/.test(l) && !/^ +ID/.test(l) && l.length > 40);

  const clusters = new Map();
  for (const l of rows(p1, p2)) {
    if (!/\d\d \d\d/.test(l.slice(25, 33))) continue;
    const id = l.slice(1, 12).trim();
    const rest = l.slice(49).trim().split(/\s+/).map(Number);
    clusters.set(id, {
      id,
      alt: l.slice(12, 25).trim() || null,
      ra: Number(sexagesimal(l.slice(25, 37), true).toFixed(5)),
      dec: Number(sexagesimal(l.slice(37, 50), false).toFixed(5)),
      l: rest[0],
      b: rest[1],
      distKpc: rest[2],
    });
  }
  for (const l of rows(p2, p3)) {
    const c = clusters.get(l.slice(1, 12).trim());
    if (!c) continue;
    Object.assign(c, {
      feH: num(l, 12, 18),
      ebv: num(l, 21, 28),
      vt: num(l, 40, 46),
      mv: num(l, 46, 53),
      ellip: num(l, 84, 92),
    });
  }
  for (const l of rows(p3, lines.length)) {
    const c = clusters.get(l.slice(1, 12).trim());
    if (!c) continue;
    Object.assign(c, {
      concentration: num(l, 47, 54),
      collapsed: l.slice(54, 58).includes('c'),
      rcArcmin: num(l, 58, 64),
      rhArcmin: num(l, 64, 70),
    });
  }
  return [...clusters.values()];
}

const clusters = parse(await load());
if (clusters.length < 150) throw new Error(`only parsed ${clusters.length} clusters`);
const check = (id, key, want) => {
  const got = clusters.find((c) => c.id === id)?.[key];
  if (got !== want) throw new Error(`parse check failed: ${id}.${key} = ${got}, expected ${want}`);
};
check('NGC 104', 'mv', -9.42);
check('NGC 5139', 'rhArcmin', 5);
check('NGC 6205', 'alt', 'M 13');
check('NGC 362', 'collapsed', true);

const doc = {
  source: 'Harris 1996, AJ 112, 1487 (2010 edition)',
  url: SOURCE,
  note: 'Free of charge; redistributors must refer to the original source. Built by tools/build-globulars.mjs.',
  clusters,
};
await writeFile(outPath, `${JSON.stringify(doc, null, 0).replace(/\},\{/g, '},\n{')}\n`);
console.log(`Wrote ${clusters.length} globular clusters to ${outPath}`);
