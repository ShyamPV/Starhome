#!/usr/bin/env node
/**
 * Builds emission and dust maps for the nebulae from the Digitized Sky Survey (DSS2 red
 * and blue plates, fetched as FITS from NASA's SkyView), so that seen from Earth's
 * direction each volumetric nebula looks like the real one. Output, per nebula:
 * apps/web/public/nebulae/<id>.png (RGBA = Halpha-band, blue-band, third line, dust) and
 * an entry in apps/web/public/nebulae/maps.json with channel scales and credits.
 *
 * Steps, all from the survey pixels:
 * 1. Stars removed: round, compact peaks above the smooth background (filaments, which are
 *    long, survive) are masked and filled from the background.
 * 2. Emission: the red plate carries Halpha, [N II] and [S II]; the blue plate carries
 *    [O III], Hbeta and scattered starlight.
 * 3. Dust: where background stars are missing (star counts, the classic extinction method)
 *    and where a dark silhouette cuts into brighter glow.
 * 4. Resampled into the nebula's own box (x along its position angle, as in nebulaLayer).
 *
 * The renderer spreads each map along the line of sight with the nebula's modeled depth
 * structure. DSS acknowledgement: see the README (free for non-commercial use).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { NEBULAE } from '../packages/galaxy/src/nebulaCatalog.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'nebulae');
/** Too small for the survey (a few dozen pixels, burned out) or swamped by star halos. */
const SKIP = new Set(['m57', 'cats-eye', 'pleiades-nebula', 'coalsack']);
/** Where the DSS2 plates meet with very different exposures across the nebula, the first-generation survey has one plate. */
/**
 * Plates to try for each band, in order. DSS2 is sharper; where its plates meet with very
 * different exposures across a nebula, the single-plate first generation (DSS1) is used. The
 * original combined 'DSS' is red (POSS-E) in the north and blue (SERC-J) in the south.
 */
const CHAINS = {
  default: { red: ['DSS2 Red', 'DSS1 Red', 'DSS'], blue: ['DSS2 Blue', 'DSS1 Blue', 'DSS'] },
  dss1: { red: ['DSS1 Red', 'DSS2 Red', 'DSS'], blue: ['DSS1 Blue', 'DSS2 Blue', 'DSS'] },
};
const PREFER_DSS1 = new Set(['m16', 'm8']);

// --- FITS and PNG --------------------------------------------------------------------

function parseFits(buf) {
  const cards = {};
  let off = 0;
  for (;;) {
    const card = buf.toString('latin1', off, off + 80);
    off += 80;
    const key = card.slice(0, 8).trim();
    if (key === 'END') break;
    if (card[8] === '=') cards[key] = card.slice(10).split('/')[0].trim().replace(/'/g, '').trim();
  }
  off = Math.ceil(off / 2880) * 2880;
  const w = Number(cards.NAXIS1);
  const h = Number(cards.NAXIS2);
  const bitpix = Number(cards.BITPIX);
  const scale = Number(cards.BSCALE ?? 1);
  const zero = Number(cards.BZERO ?? 0);
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = bitpix === -32 ? buf.readFloatBE(off + i * 4) : bitpix === 16 ? buf.readInt16BE(off + i * 2) : buf.readInt32BE(off + i * 4);
    data[i] = Number.isFinite(v) ? v * scale + zero : 0;
  }
  return { w, h, data, cdelt1: Number(cards.CDELT1), cdelt2: Number(cards.CDELT2) };
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** PNG of 1 (grey) or 3 (RGB) 8-bit channels. Data maps carry no alpha: browsers premultiply it. */
function png(width, height, pixels, channels) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, channels === 3 ? 2 : 0, 0, 0, 0], 8);
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- Image operations ----------------------------------------------------------------

function percentile(arr, q) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/** Smooth background: a percentile (default the median) of blocks, smoothed, bilinearly upsampled. */
function background(img, w, h, block, q = 0.5) {
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const med = new Float32Array(bw * bh);
  const tmp = [];
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      tmp.length = 0;
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y++) for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x++) tmp.push(img[y * w + x]);
      tmp.sort((a, b) => a - b);
      med[by * bw + bx] = tmp[Math.floor(tmp.length * q)];
    }
  // 3x3 median of the block medians, against stray bright blocks.
  const med2 = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const v = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v.push(med[Math.min(bh - 1, Math.max(0, y + dy)) * bw + Math.min(bw - 1, Math.max(0, x + dx))]);
      v.sort((a, b) => a - b);
      med2[y * bw + x] = v[4];
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, (x + 0.5) / block - 0.5));
      const fy = Math.min(bh - 1.001, Math.max(0, (y + 0.5) / block - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const at = (xx, yy) => med2[Math.min(bh - 1, yy) * bw + Math.min(bw - 1, xx)];
      out[y * w + x] = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    }
  return out;
}

/**
 * Stars: local peaks whose half-maximum radius is about the same in all eight directions
 * (a filament stays bright along its length). Saturated stars have flat cores, so the
 * radius is measured rather than tested at a fixed distance. Returns centre and radius.
 */
function findStars(img, bg, w, h, sigma) {
  const stars = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, -0.7071], [0.7071, -0.7071], [-0.7071, 0.7071]];
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const peak = img[i] - bg[i];
      if (peak < 4 * sigma) continue;
      let isMax = true;
      for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && img[i + dy * w + dx] > img[i]) isMax = false;
      if (!isMax) continue;
      // Skip the inside of a plateau already claimed by a brighter neighbour.
      if (img[i - 1] === img[i] || img[i - w] === img[i]) continue;
      let rMin = Infinity;
      let rMax = 0;
      for (const [dx, dy] of dirs) {
        let r = 1;
        for (; r <= 40; r++) {
          const xx = Math.round(x + dx * r);
          const yy = Math.round(y + dy * r);
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
          if (img[yy * w + xx] - bg[yy * w + xx] < 0.5 * peak) break;
        }
        rMin = Math.min(rMin, r);
        rMax = Math.max(rMax, r);
      }
      if (rMax <= 30 && rMax <= 1.8 * rMin + 1) stars.push({ x, y, peak, r: 0.5 * (rMin + rMax) });
    }
  return stars;
}

/**
 * Fill each star's disc (core plus photographic halo) with the level just outside it: the
 * median of a thin ring, so a star inside bright nebulosity leaves no dark hole.
 */
function removeStars(img, bg, w, h, stars, sigma) {
  const out = Float32Array.from(img);
  for (const s of stars) {
    const rad = 2.2 * s.r + 1.5 * Math.log10(1 + s.peak / (4 * sigma));
    const R = Math.ceil(rad);
    const ring = [];
    for (let a = 0; a < 24; a++) {
      const x = Math.round(s.x + Math.cos((a / 24) * 2 * Math.PI) * (rad + 2));
      const y = Math.round(s.y + Math.sin((a / 24) * 2 * Math.PI) * (rad + 2));
      if (x >= 0 && y >= 0 && x < w && y < h) ring.push(img[y * w + x]);
    }
    ring.sort((p, q) => p - q);
    const fill = ring.length ? ring[Math.floor(ring.length * 0.4)] : bg[s.y * w + s.x];
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = s.x + dx;
        const y = s.y + dy;
        if (x < 0 || y < 0 || x >= w || y >= h || dx * dx + dy * dy > rad * rad) continue;
        out[y * w + x] = Math.min(out[y * w + x], fill);
      }
  }
  // Leftover single-pixel specks (stars below the threshold): replace by the neighbours' median.
  const res = Float32Array.from(out);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const v = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) v.push(out[(y + dy) * w + x + dx]);
      v.sort((a, b) => a - b);
      if (out[y * w + x] > v[7] && out[y * w + x] - v[4] > 2.5 * sigma) res[y * w + x] = v[4];
    }
  return res;
}

function blur(img, w, h, sigmaPx) {
  const k = Math.max(1, Math.ceil(sigmaPx * 2.5));
  const wts = Array.from({ length: 2 * k + 1 }, (_, i) => Math.exp(-0.5 * ((i - k) / sigmaPx) ** 2));
  const sum = wts.reduce((a, b) => a + b, 0);
  const pass = (src, horizontal) => {
    const dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let i = -k; i <= k; i++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x;
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i));
          acc += src[yy * w + xx] * wts[i + k];
        }
        dst[y * w + x] = acc / sum;
      }
    return dst;
  };
  return pass(pass(img, true), false);
}

// --- Fetching ------------------------------------------------------------------------

async function skyview(survey, ra, dec, sizeDeg, pixels) {
  const url = `https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Survey=${encodeURIComponent(survey)}&Position=${ra},${dec}&Size=${sizeDeg}&Pixels=${pixels}&Return=FITS`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      // SkyView sometimes answers with a header and no pixels: retry those too.
      if (res.ok && buf.toString('latin1', 0, 6) === 'SIMPLE' && buf.length >= pixels * pixels * 2) return parseFits(buf);
    } catch {
      // Retry below.
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  // Large fields occasionally fail outright: try once more at half the sampling.
  if (pixels > 600) return skyview(survey, ra, dec, sizeDeg, Math.round(pixels / 2));
  throw new Error(`SkyView ${survey} failed at ${ra}, ${dec}`);
}

// --- Per nebula ----------------------------------------------------------------------

async function build(n) {
  const [majArc, minArc] = n.sizeArcmin;
  const N = majArc >= 100 ? 768 : 512;
  // A north-up square that contains the box at any position angle.
  const sideDeg = (Math.hypot(majArc, minArc) / 60) * 1.04;
  // Sample the sky a little finer than the map, so stars are found before resampling.
  const pixels = Math.min(2400, Math.round(N * 1.5 * (sideDeg * 60) / majArc));
  const chain = PREFER_DSS1.has(n.id) ? CHAINS.dss1 : CHAINS.default;
  // The first plate in each band's chain that has data here (some come back empty).
  const band = async (surveys) => {
    for (const survey of surveys) {
      const img = await skyview(survey, n.ra, n.dec, sideDeg.toFixed(4), pixels).catch(() => null);
      if (img && img.w === pixels && img.data.some((v) => v !== 0)) return { survey, img };
    }
    throw new Error(`${n.id}: no survey data`);
  };
  const r = await band(chain.red);
  const b = await band(chain.blue);
  const red = r.img;
  const blue = b.img;
  const [redSurvey, blueSurvey] = [r.survey, b.survey];
  const { w, h } = red;
  const psArcsec = Math.abs(red.cdelt2) * 3600;

  // Find stars on both plates; a star found on either is removed from both.
  const bands = [red, blue].map((band) => {
    const bg = background(band.data, w, h, Math.max(8, Math.round((24 / psArcsec) * 4)));
    const sigma = percentile(band.data.map((v, i) => Math.abs(v - bg[i])), 0.5) * 1.4826 || 1;
    return { band, bg, sigma, stars: findStars(band.data, bg, w, h, sigma) };
  });
  const starList = [...bands[0].stars, ...bands[1].stars];
  const clean = bands.map(({ band, bg, sigma }) => removeStars(band.data, bg, w, h, starList, sigma));
  // Sky floor: unresolved starlight, plate-to-plate offsets and sky glow vary smoothly across
  // the field; a low percentile in large blocks follows them and leaves the nebula.
  // Capped at the field's lower quartile, so a nebula filling the field keeps its glow; then
  // a soft pedestal, so faint diffuse Galactic light does not fill the whole volume as fog.
  const [R, B] = clean.map((c) => {
    const cap = percentile(c, 0.25);
    const floor = background(c, w, h, Math.round(w / 8), 0.15);
    // Outside a plate (no data, read as 0 in either band): nothing.
    const lifted = c.map((v, i) => (red.data[i] === 0 || blue.data[i] === 0 ? 0 : Math.max(0, v - Math.min(floor[i], cap))));
    const pedestal = percentile(lifted, 0.5);
    return lifted.map((v) => Math.max(0, v - pedestal));
  });

  // Dust: a silhouette darker than the surrounding glow, at two scales (a pillar, a cloud).
  const glowNear = blur(R, w, h, w / 40);
  const glowLarge = blur(R, w, h, w / 12);
  const smoothR = n.palette === 'synchrotron' ? blur(R, w, h, 1) : R;
  const rMax = percentile(R, 0.995) || 1;

  // Resample into the box: u along the position angle, v perpendicular (see nebulaAxes).
  const pa = (n.paDeg * Math.PI) / 180;
  const hx = majArc / 120; // half-size in degrees
  const hy = minArc / 120;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const degPerPx = Math.abs(red.cdelt2);
  const sample = (img, x, y) => {
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
    const tx = Math.min(1, Math.max(0, x - x0));
    const ty = Math.min(1, Math.max(0, y - y0));
    return (img[y0 * w + x0] * (1 - tx) + img[y0 * w + x0 + 1] * tx) * (1 - ty) + (img[(y0 + 1) * w + x0] * (1 - tx) + img[(y0 + 1) * w + x0 + 1] * tx) * ty;
  };
  const ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      // Texture row 0 is v = -1 (as the shader samples p.xy * 0.5 + 0.5).
      const u = ((i + 0.5) / N) * 2 - 1;
      const v = ((j + 0.5) / N) * 2 - 1;
      const north = u * hx * Math.cos(pa) - v * hy * Math.sin(pa);
      const east = u * hx * Math.sin(pa) + v * hy * Math.cos(pa);
      // FITS: east toward lower x (CDELT1 < 0), north toward higher row.
      const x = cx - east / degPerPx;
      const y = cy + north / degPerPx;
      const r = sample(R, x, y);
      const b = sample(B, x, y);
      const k = j * N + i;
      if (n.palette === 'reflection') {
        ch[0][k] = b;
      } else if (n.palette === 'synchrotron') {
        // Crab: filaments (red, sharper than their surroundings) over a smooth continuum.
        const smooth = sample(smoothR, x, y);
        ch[0][k] = Math.max(0, r - 0.7 * sample(glowLarge, x, y));
        ch[1][k] = Math.max(0, b - 0.5 * r) * 0.5;
        ch[2][k] = smooth * 0.5;
      } else {
        // Red plate: Halpha (+[N II], [S II]); blue plate minus the Hbeta that comes with Halpha: [O III].
        ch[0][k] = r;
        ch[1][k] = Math.max(0, b - 0.3 * r);
        ch[2][k] = r * 0.25;
      }
      let silhouette = 0;
      for (const glow of [glowNear, glowLarge]) {
        const g = sample(glow, x, y);
        // Darker than its surroundings by more than plate noise.
        if (g > 0.06 * rMax) silhouette = Math.max(silhouette, (g - r - 0.06 * rMax) / g);
      }
      ch[3][k] = Math.max(0, silhouette) ** 1.5;
    }
  // Fade to the volume's inscribed sphere (as the 3D models do), so no box corner shows.
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const rr = Math.hypot(((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1);
      const t = Math.min(1, Math.max(0, (rr - 0.8) / 0.2));
      const fade = 1 - t * t * (3 - 2 * t);
      for (let c = 0; c < 4; c++) ch[c][j * N + i] *= fade;
    }
  // Soften plate grain (it would otherwise twinkle as 3D speckle), then encode
  // sqrt(value / channel max), like the volumes.
  for (let c = 0; c < 4; c++) ch[c] = blur(ch[c], N, N, c === 3 ? 1.5 : 0.7);
  const max = ch.map((c) => percentile(c, 0.999) || 1);
  const rgb = new Uint8Array(N * N * 3);
  const dust = new Uint8Array(N * N);
  const top = Math.max(max[0], max[1], max[2]);
  const channelScale = [max[0] / top, max[1] / top, max[2] / top];
  // Emission summed exactly as the renderer will decode it: the brightness calibration.
  let emissionSum = 0;
  for (let k = 0; k < N * N; k++) {
    for (let c = 0; c < 3; c++) {
      const q = Math.round(Math.sqrt(Math.min(1, ch[c][k] / max[c])) * 255);
      rgb[k * 3 + c] = q;
      emissionSum += (q / 255) ** 2 * channelScale[c];
    }
    dust[k] = Math.round(Math.sqrt(Math.min(1, ch[3][k] / max[3])) * 255);
  }
  writeFileSync(join(OUT, `${n.id}.png`), png(N, N, rgb, 3));
  writeFileSync(join(OUT, `${n.id}-dust.png`), png(N, N, dust, 1));
  return {
    survey: [redSurvey, blueSurvey],
    size: N,
    channelScale: channelScale.map((v) => Number(v.toFixed(4))),
    // Sum over pixels of the decoded emission times the pixel area, in unit-box units (2 x 2).
    emissionSum: Number(((emissionSum * 4) / (N * N)).toPrecision(6)),
    starsRemoved: starList.length,
    pixelArcsec: Number(psArcsec.toFixed(2)),
  };
}

mkdirSync(OUT, { recursive: true });
const only = process.argv[2]?.split(',');
// Rebuilding some nebulae keeps the others' entries.
const previous = only && existsSync(join(OUT, 'maps.json')) ? JSON.parse(readFileSync(join(OUT, 'maps.json'), 'utf8')).maps : {};
const maps = { ...previous };
for (const n of NEBULAE) {
  if (SKIP.has(n.id) || !n.model || (only && !only.includes(n.id))) continue;
  const t0 = Date.now();
  maps[n.id] = await build(n);
  console.log(`${n.id.padEnd(16)} ${maps[n.id].size}px  ${maps[n.id].starsRemoved} stars removed  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(
  join(OUT, 'maps.json'),
  `${JSON.stringify(
    {
      source: 'Digitized Sky Survey (DSS2 red and blue) via NASA SkyView; stars removed and dust estimated by tools/build-nebula-maps.mjs.',
      credit:
        'The Digitized Sky Surveys were produced at the Space Telescope Science Institute under U.S. Government grant NAG W-2166, based on photographic data from the Oschin Schmidt Telescope (Palomar) and the UK Schmidt Telescope (AAO).',
      retrieved: new Date().toISOString().slice(0, 10),
      maps,
    },
    null,
    2,
  )}\n`,
);
console.log(`-> ${OUT}`);
