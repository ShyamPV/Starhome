import { SUN_GALACTOCENTRIC_PC, type Vec3 } from '@starhome/astro';
import type { StarBuffers } from '@starhome/galaxy';

const SAMPLES = 8192;
/** Partial compensation: dim places still look dimmer, just not as dim as they are. */
const GAMMA = 0.75;
const MIN_BOOST = 0.35;
const MAX_BOOST = 300;
const TIME_CONSTANT_S = 0.6;
/** Each sample stands for ~1/8000 of the Galaxy; soften so a nearby one doesn't dominate, pc. */
const SOFTENING_PC = 400;

/**
 * Automatic exposure for the inside-to-outside transition. It estimates how much
 * galactic light reaches the camera (summed over a fixed sample of glow particles, from
 * all directions) relative to the view from the Sun, and brightens the exposure where
 * there is less light, the way a camera or the dark-adapted eye would. It depends on
 * position only, so the exposure doesn't pump as the view rotates, and a dim direction
 * (the Galactic anticentre) still looks dimmer than a bright one.
 */
export class ExposureMeter {
  private pos = new Float32Array(0);
  private lum = new Float32Array(0);
  private reference = 0;
  private log = 0;

  /**
   * Take a fixed subsample of the glow layer (a sample of all the Galaxy's light, wherever
   * it is drawn) and measure the reference light at the Sun.
   */
  setGlow(glow: StarBuffers): void {
    const n = Math.min(SAMPLES, glow.count);
    const stride = glow.count / n;
    this.pos = new Float32Array(n * 3);
    this.lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const src = Math.floor(i * stride);
      this.pos[i * 3] = glow.originPc[0] + glow.positions[src * 3]!;
      this.pos[i * 3 + 1] = glow.originPc[1] + glow.positions[src * 3 + 1]!;
      this.pos[i * 3 + 2] = glow.originPc[2] + glow.positions[src * 3 + 2]!;
      this.lum[i] = 10 ** (-0.4 * glow.absMag[src]!);
    }
    this.reference = this.light(SUN_GALACTOCENTRIC_PC);
  }

  /** Relative light received at a Galactocentric point (pc). */
  private light(p: Vec3): number {
    let sum = 0;
    const soft2 = SOFTENING_PC * SOFTENING_PC;
    for (let i = 0; i < this.lum.length; i++) {
      const dx = this.pos[i * 3]! - p[0];
      const dy = this.pos[i * 3 + 1]! - p[1];
      const dz = this.pos[i * 3 + 2]! - p[2];
      sum += this.lum[i]! / (dx * dx + dy * dy + dz * dz + soft2);
    }
    return sum;
  }

  /** Target exposure multiplier at a point, before smoothing. */
  boostAt(p: Vec3): number {
    if (this.reference <= 0) return 1;
    const f = this.light(p);
    if (f <= 0) return MAX_BOOST;
    return Math.min(MAX_BOOST, Math.max(MIN_BOOST, (this.reference / f) ** GAMMA));
  }

  /** Advance the adaptation toward the target at the camera; returns the current multiplier. */
  update(dt: number, cameraGalPc: Vec3, instant = false): number {
    const target = Math.log(this.boostAt(cameraGalPc));
    this.log = instant ? target : this.log + (target - this.log) * (1 - Math.exp(-dt / TIME_CONSTANT_S));
    return Math.exp(this.log);
  }
}
