/**
 * Deterministic random numbers. Every generated region is seeded from a hash of
 * (global seed, region key), so the same place always produces the same stars.
 */

/** 32-bit integer hash combining any number of integers (murmur3-style finaliser). */
export function hash32(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    let k = Math.imul(v | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** sfc32 generator: fast, good statistical quality, 128-bit state. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform in (0, 1], safe for logarithms. */
  nextOpen(): number {
    return (this.nextU32() + 1) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Standard normal (Marsaglia polar method). */
  normal(): number {
    if (this.spareNormal !== null) {
      const s = this.spareNormal;
      this.spareNormal = null;
      return s;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * f;
    return u * f;
  }

  /** Exponential with the given scale (mean). */
  exponential(scale: number): number {
    return -Math.log(this.nextOpen()) * scale;
  }

  /** Two-sided exponential (Laplace) with the given scale. */
  laplace(scale: number): number {
    const e = this.exponential(scale);
    return this.next() < 0.5 ? -e : e;
  }

  /** Poisson variate; normal approximation above a mean of 50. */
  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 50) return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.normal()));
    const limit = Math.exp(-mean);
    let k = 0;
    let p = this.next();
    while (p > limit) {
      k++;
      p *= this.next();
    }
    return k;
  }
}

function lattice(ix: number, iy: number, iz: number): number {
  return hash32(0x5eed, ix, iy, iz) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic 3D value noise in [0, 1): smooth interpolation of hashed lattice values. */
export function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (k: number) =>
    lerp(lerp(lattice(ix, iy, k), lattice(ix + 1, iy, k), fx), lerp(lattice(ix, iy + 1, k), lattice(ix + 1, iy + 1, k), fx), fy);
  return lerp(plane(iz), plane(iz + 1), fz);
}
