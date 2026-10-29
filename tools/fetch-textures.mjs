#!/usr/bin/env node
/**
 * Downloads the Solar System surface maps into apps/web/public/textures.
 *
 * Source: Solar System Scope (INOVE), https://www.solarsystemscope.com/textures/,
 * released under Creative Commons Attribution 4.0 International (CC BY 4.0); the maps are
 * based on NASA mission imagery and elevation data. Attribution is given in the README
 * and in public/textures/ATTRIBUTION.txt.
 *
 * The 2k (2048 x 1024) set keeps the download near 5 MB; textures are fetched by the app
 * only when a planet is drawn large enough to need them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'textures');
const BASE = 'https://www.solarsystemscope.com/textures/download/';
const FILES = {
  'sun.jpg': '2k_sun.jpg',
  'mercury.jpg': '2k_mercury.jpg',
  // Venus' surface is hidden under cloud: the cloud tops are what an eye would see.
  'venus.jpg': '2k_venus_atmosphere.jpg',
  'earth-day.jpg': '2k_earth_daymap.jpg',
  'earth-night.jpg': '2k_earth_nightmap.jpg',
  'earth-clouds.jpg': '2k_earth_clouds.jpg',
  'moon.jpg': '2k_moon.jpg',
  'mars.jpg': '2k_mars.jpg',
  'jupiter.jpg': '2k_jupiter.jpg',
  'saturn.jpg': '2k_saturn.jpg',
  'saturn-ring.png': '2k_saturn_ring_alpha.png',
  'uranus.jpg': '2k_uranus.jpg',
  'neptune.jpg': '2k_neptune.jpg',
};

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, remote] of Object.entries(FILES)) {
  const res = await fetch(BASE + remote);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`${remote}: HTTP ${res.status} ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT, name), buf);
  total += buf.length;
  console.log(`${name.padEnd(18)} ${(buf.length / 1024).toFixed(0).padStart(6)} kB`);
}
writeFileSync(
  join(OUT, 'ATTRIBUTION.txt'),
  `Planet, Moon and Sun surface maps: Solar System Scope (INOVE), https://www.solarsystemscope.com/textures/
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/
Based on NASA mission imagery and elevation data. Files renamed; otherwise unmodified.
Rebuild with: pnpm data:textures
`,
);
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB -> ${OUT}`);
