import type { SurfaceStyle } from '@starhome/data';
import { BufferGeometry, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, SphereGeometry } from 'three';

/**
 * Surfaces for bodies with no global map in the bundle: generated from what is known of
 * each (its colour, cratering, and named features at their catalogued positions, such as
 * Stickney on Phobos, Herschel on Mimas or Pluto's Sputnik Planitia). They are
 * impressions, not maps, and the object panels say so. Coordinates follow the IAU
 * convention used by the renderer: longitude 0 faces the planet, east is positive, and
 * for synchronous moons the leading hemisphere is centred on 90° W.
 */

type Vec = [number, number, number];

/** Unit vector for planetocentric latitude and east longitude (degrees), in the mesh's local frame. */
export function dirOf(latDeg: number, lonDeg: number): Vec {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374_761_393) + Math.imul(y, 668_265_263) + Math.imul(z, 2_147_483_647) + Math.imul(seed, 1_274_126_177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

function vnoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const fz = s(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}

function fbm(p: Vec, freq: number, seed: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(p[0] * f + 17.3, p[1] * f - 9.1, p[2] * f + 3.7, seed + i);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

interface Crater {
  c: Vec;
  /** Angular radius, radians. */
  r: number;
  cosOuter: number;
  depth: number;
  /** Albedo change of the floor and rim (ice: fresh craters are bright). */
  floor: number;
  rim: number;
}

interface Style {
  /** Number of random craters and their largest angular radius (radians). */
  craters: number;
  maxCrater: number;
  /** Relief amplitude for the bump map. */
  relief: number;
  floor: number;
  rim: number;
  /** Large-scale mottling of the albedo. */
  mottle: number;
  /** Named features at their catalogued positions. */
  named?: { lat: number; lon: number; r: number; depth: number; floor?: number; rim?: number }[];
  /** Extra colouring after craters. */
  paint?: (d: Vec, base: Color, out: Color, n: number) => void;
}

const STYLES: Record<SurfaceStyle, Style> = {
  // Phobos and Deimos: dark, dusty, crater-saturated rubble.
  rubble: { craters: 110, maxCrater: 0.28, relief: 1, floor: -0.03, rim: 0.02, mottle: 0.15 },
  // Deimos: craters blanketed by dust, so smoother than Phobos.
  'rubble-smooth': { craters: 35, maxCrater: 0.14, relief: 0.5, floor: -0.01, rim: 0.01, mottle: 0.12 },
  // Callisto, Ariel, Umbriel, Titania, Oberon, Rhea, Charon: old cratered surfaces.
  cratered: { craters: 220, maxCrater: 0.22, relief: 0.7, floor: 0.04, rim: 0.12, mottle: 0.22 },
  'cratered-ice': { craters: 200, maxCrater: 0.2, relief: 0.6, floor: 0.06, rim: 0.1, mottle: 0.1 },
  io: {
    craters: 0,
    maxCrater: 0,
    relief: 0.2,
    floor: 0,
    rim: 0,
    mottle: 0.25,
    paint: (d, base, out, n) => {
      // Sulfur plains with dark volcanic centres; the red plume ring of Pele (18.7 S, 255.3 W).
      out.copy(base).lerp(new Color('#e8d27a'), 0.4 * n).lerp(new Color('#c9773a'), Math.max(0, 0.5 - n) * 0.6);
      const pele = Math.acos(Math.min(1, dot(d, dirOf(-18.7, -255.3))));
      out.lerp(new Color('#b44a2a'), Math.exp(-(((pele - 0.3) / 0.05) ** 2)) * 0.7);
      for (const [lat, lon] of [[13, -309], [-18.7, -255.3], [-10, -34], [40, -100], [-50, -150], [20, -170], [-30, -40], [5, -200]] as const) {
        const a = Math.acos(Math.min(1, dot(d, dirOf(lat, lon))));
        out.lerp(new Color('#2a1d16'), Math.exp(-((a / 0.035) ** 2)) * 0.9);
      }
    },
  },
  europa: {
    craters: 6,
    maxCrater: 0.05,
    relief: 0.25,
    floor: 0.05,
    rim: 0.05,
    mottle: 0.12,
    paint: (d, base, out) => {
      // Bright ice crossed by reddish-brown ridges (lineae); the trailing hemisphere (90 E) is darker and redder.
      const trailing = Math.max(0, -d[2]);
      out.copy(base).lerp(new Color('#a5765a'), 0.35 * trailing);
      for (let k = 0; k < 3; k++) {
        const v = fbm(d, 2.2 + k, 70 + k, 4);
        const line = Math.exp(-(((v - 0.5) / 0.012) ** 2));
        out.lerp(new Color('#8a5a40'), line * 0.65);
      }
    },
  },
  ganymede: {
    craters: 120,
    maxCrater: 0.12,
    relief: 0.5,
    floor: 0.12,
    rim: 0.15,
    mottle: 0.1,
    paint: (d, base, out, n) => {
      // Old dark terrain (largest: Galileo Regio, ~35 N 145 W) cut by bright grooved terrain.
      const regio = Math.acos(Math.min(1, dot(d, dirOf(35, -145))));
      const dark = Math.max(n > 0.52 ? 1 : 0, regio < 0.65 ? 1 : 0);
      out.copy(base).lerp(new Color('#5d554c'), dark * 0.65).lerp(new Color('#cfc8bd'), (1 - dark) * 0.35);
    },
  },
  titan: {
    craters: 0,
    maxCrater: 0,
    relief: 0,
    floor: 0,
    rim: 0,
    mottle: 0.05,
    paint: (d, base, out) => {
      // Seen through its haze: almost featureless orange, the north polar hood slightly darker.
      out.copy(base).multiplyScalar(1 - 0.12 * Math.max(0, d[1] - 0.6));
    },
  },
  enceladus: {
    craters: 70,
    maxCrater: 0.08,
    relief: 0.4,
    floor: 0.02,
    rim: 0.02,
    mottle: 0.04,
    paint: (d, _base, out) => {
      // The south-polar "tiger stripes": four parallel fractures that vent the ocean's water.
      if (d[1] < -0.75) {
        const x = d[0] * 6;
        const stripe = Math.exp(-(((((x % 1) + 1) % 1 - 0.5) / 0.06) ** 2));
        out.lerp(new Color('#6f8fa8'), stripe * Math.min(1, (-d[1] - 0.75) * 6) * 0.7);
      }
    },
  },
  iapetus: {
    craters: 160,
    maxCrater: 0.2,
    relief: 0.6,
    floor: 0.05,
    rim: 0.08,
    mottle: 0.08,
    paint: (d, _base, out) => {
      // Cassini Regio: the leading hemisphere (centred on 90 W, the +z axis) is coal-dark.
      const lead = d[2] + 0.15 * (fbm(d, 4, 91, 3) - 0.5);
      out.lerp(new Color('#2b2218'), Math.min(1, Math.max(0, (lead - 0.05) * 5)));
    },
  },
  triton: {
    craters: 25,
    maxCrater: 0.05,
    relief: 0.3,
    floor: 0.02,
    rim: 0.02,
    mottle: 0.08,
    paint: (d, base, out) => {
      // Pinkish nitrogen-frost south polar cap; "cantaloupe" terrain elsewhere.
      const cell = fbm(d, 9, 33, 3);
      out.copy(base).multiplyScalar(0.85 + 0.25 * Math.abs(Math.sin(cell * 18)));
      out.lerp(new Color('#f0d6cf'), Math.min(1, Math.max(0, (-d[1] - 0.15) * 3)));
    },
  },
  charon: {
    craters: 140,
    maxCrater: 0.15,
    relief: 0.5,
    floor: 0.04,
    rim: 0.08,
    mottle: 0.12,
    paint: (d, _base, out) => {
      // Mordor Macula: the dark red north polar cap.
      out.lerp(new Color('#6b3a2a'), Math.min(1, Math.max(0, (d[1] - 0.82) * 8)) * 0.85);
    },
  },
  pluto: {
    craters: 40,
    maxCrater: 0.08,
    relief: 0.35,
    floor: 0.02,
    rim: 0.04,
    mottle: 0.2,
    paint: (d, base, out, n) => {
      // Sputnik Planitia, the bright western lobe of the "heart" (~20 N, 180 E), the dimmer
      // eastern lobe, and dark red Cthulhu along the equator to its west.
      const sp = Math.acos(Math.min(1, dot(d, dirOf(20, 178))));
      const east = Math.acos(Math.min(1, dot(d, dirOf(10, 222))));
      const cth = Math.acos(Math.min(1, dot(d, dirOf(-3, 103))));
      out.copy(base).lerp(new Color('#d8c3a5'), 0.3 * n);
      out.lerp(new Color('#4a2a20'), Math.min(1, Math.max(0, 1.1 - cth / 0.55)) * Math.max(0, 1 - Math.abs(d[1]) * 2.5) * 0.9);
      out.lerp(new Color('#f4ece2'), Math.min(1, Math.max(0, (0.45 - sp) * 10)));
      out.lerp(new Color('#e6d8c4'), Math.min(1, Math.max(0, (0.5 - east) * 5)) * 0.7);
    },
  },
};

/** Named craters at their catalogued positions (planetocentric latitude, east longitude). */
const NAMED: Partial<Record<string, Style['named']>> = {
  phobos: [{ lat: -1, lon: -49, r: 0.42, depth: 0.7 }], // Stickney, 9 km
  mimas: [{ lat: 1.6, lon: -111.8, r: 0.35, depth: 0.9, rim: 0.12 }], // Herschel, 139 km
  tethys: [{ lat: 32.8, lon: -128.9, r: 0.42, depth: 0.8 }], // Odysseus, 445 km
  callisto: [{ lat: 14.7, lon: -56, r: 0.5, depth: 0.2, floor: 0.25, rim: 0.2 }], // Valhalla
};

/** Shared height and albedo model for a body, so its bump map and shape agree. */
export class SurfaceModel {
  private readonly craters: Crater[] = [];
  private readonly style: Style;
  private readonly base: Color;

  constructor(
    id: string,
    style: SurfaceStyle,
    baseColor: string,
    private readonly seed: number,
  ) {
    this.style = STYLES[style];
    this.base = new Color(baseColor);
    let s = seed;
    const rand = () => {
      s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
      return s / 4_294_967_296;
    };
    for (let i = 0; i < this.style.craters; i++) {
      const z = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const q = Math.sqrt(1 - z * z);
      // Many small craters, few large ones.
      const r = this.style.maxCrater * Math.pow(rand(), 2.2) + 0.008;
      this.craters.push({ c: [q * Math.cos(t), z, q * Math.sin(t)], r, cosOuter: Math.cos(r * 1.4), depth: 1, floor: this.style.floor, rim: this.style.rim });
    }
    for (const n of NAMED[id] ?? []) {
      this.craters.push({ c: dirOf(n.lat, n.lon), r: n.r, cosOuter: Math.cos(n.r * 1.4), depth: n.depth, floor: n.floor ?? this.style.floor, rim: n.rim ?? this.style.rim });
    }
  }

  /** Relief (roughly -1..1) and albedo at a unit direction. */
  sample(d: Vec, out: Color): number {
    const n = fbm(d, 3, this.seed, 5);
    out.copy(this.base).multiplyScalar(1 + this.style.mottle * (n - 0.5) * 2);
    let h = (n - 0.5) * 0.6;
    for (const c of this.craters) {
      const cd = dot(d, c.c);
      if (cd < c.cosOuter) continue;
      const x = Math.acos(Math.min(1, cd)) / c.r;
      // Bowl, raised rim, and a fading ejecta skirt.
      const bowl = x < 1 ? -(1 - x * x) : 0;
      const rim = Math.exp(-(((x - 1) / 0.12) ** 2));
      h += c.depth * c.r * 3 * (bowl * 0.8 + rim * 0.35);
      out.offsetHSL(0, 0, (x < 1 ? c.floor : 0) * (1 - x) + c.rim * rim * 0.5);
    }
    this.style.paint?.(d, this.base, out, n);
    return h;
  }

  /** Equirectangular colour and bump maps matching three.js sphere UVs. */
  textures(width = 512): { map: DataTexture; bump: DataTexture } {
    const height = width / 2;
    const color = new Uint8Array(width * height * 4);
    const bump = new Uint8Array(width * height * 4);
    const c = new Color();
    const hs = new Float32Array(width * height);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < height; j++) {
      // Row 0 is the bottom of the texture (south pole).
      const lat = -90 + ((j + 0.5) / height) * 180;
      for (let i = 0; i < width; i++) {
        // u = 0.5 is longitude 0; longitude increases eastward with u.
        const lon = ((i + 0.5) / width) * 360 - 180;
        const h = this.sample(dirOf(lat, lon), c);
        const k = j * width + i;
        hs[k] = h;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        // Colour is linear in three.js; store sRGB bytes.
        const srgb = c.clone().convertLinearToSRGB();
        color.set([srgb.r * 255, srgb.g * 255, srgb.b * 255, 255].map((v) => Math.max(0, Math.min(255, Math.round(v)))), k * 4);
      }
    }
    for (let k = 0; k < hs.length; k++) {
      const v = Math.round(((hs[k]! - lo) / (hi - lo || 1)) * 255);
      bump.set([v, v, v, 255], k * 4);
    }
    const make = (data: Uint8Array) => {
      const t = new DataTexture(data, width, height, RGBAFormat);
      t.wrapS = RepeatWrapping;
      t.magFilter = LinearFilter;
      t.minFilter = LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.needsUpdate = true;
      return t;
    };
    const map = make(color);
    map.colorSpace = SRGBColorSpace;
    return { map, bump: make(bump) };
  }

  /**
   * A lumpy triaxial body (radii in units of the mean radius: x toward the planet, y along
   * the pole, z along the orbit), with relief from the same craters as the bump map.
   */
  geometry(radii: [number, number, number], meanKm: number, relief = 0.05): BufferGeometry {
    const geo = new SphereGeometry(1, 160, 80);
    const pos = geo.getAttribute('position');
    const c = new Color();
    const [a, c3, b] = [radii[0] / meanKm, radii[2] / meanKm, radii[1] / meanKm];
    for (let i = 0; i < pos.count; i++) {
      const d: Vec = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const h = this.sample(d, c) + 0.6 * (fbm(d, 1.6, this.seed + 7, 3) - 0.5);
      // Distance to the ellipsoid surface along d, scaled by the relief.
      const r = 1 / Math.sqrt((d[0] / a) ** 2 + (d[1] / c3) ** 2 + (d[2] / b) ** 2);
      const k = r * (1 + relief * h);
      pos.setXYZ(i, d[0] * k, d[1] * k, d[2] * k);
    }
    geo.computeVertexNormals();
    return geo;
  }
}
