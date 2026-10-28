import type { Vec3 } from '@starhome/astro';
import { teffToLinearRgb } from '@starhome/astro';

/**
 * A batch of stars ready for the GPU. Positions are float32 parsecs *relative to
 * originPc* (Galactocentric frame) so precision stays local to the batch; the renderer
 * places the batch at its double-precision origin each frame (floating origin).
 */
export interface StarBuffers {
  count: number;
  originPc: Vec3;
  positions: Float32Array;
  /** Linear RGB, normalised 0-255, 3 bytes per star. */
  colors: Uint8Array;
  absMag: Float32Array;
}

export class StarBufferBuilder {
  private positions: Float32Array;
  private colors: Uint8Array;
  private absMag: Float32Array;
  count = 0;

  constructor(
    private readonly originPc: Vec3,
    capacity = 1024,
  ) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Uint8Array(capacity * 3);
    this.absMag = new Float32Array(capacity);
  }

  private grow(): void {
    const cap = this.absMag.length * 2;
    const p = new Float32Array(cap * 3);
    p.set(this.positions);
    const c = new Uint8Array(cap * 3);
    c.set(this.colors);
    const m = new Float32Array(cap);
    m.set(this.absMag);
    this.positions = p;
    this.colors = c;
    this.absMag = m;
  }

  /** Add a star at a Galactocentric position (pc). */
  add(xPc: number, yPc: number, zPc: number, rgb: readonly [number, number, number], absMag: number): void {
    if (this.count === this.absMag.length) this.grow();
    const i = this.count++;
    this.positions[i * 3] = xPc - this.originPc[0];
    this.positions[i * 3 + 1] = yPc - this.originPc[1];
    this.positions[i * 3 + 2] = zPc - this.originPc[2];
    this.colors[i * 3] = Math.round(rgb[0] * 255);
    this.colors[i * 3 + 1] = Math.round(rgb[1] * 255);
    this.colors[i * 3 + 2] = Math.round(rgb[2] * 255);
    this.absMag[i] = absMag;
  }

  addTeff(xPc: number, yPc: number, zPc: number, teff: number, absMag: number): void {
    this.add(xPc, yPc, zPc, teffToLinearRgb(teff), absMag);
  }

  /**
   * @param brightestFirst order stars by absolute magnitude so a renderer can draw only
   *   the first N (the brightest) as a level of detail without regenerating.
   */
  build(brightestFirst = false): StarBuffers {
    const n = this.count;
    if (!brightestFirst) {
      return {
        count: n,
        originPc: this.originPc,
        positions: this.positions.slice(0, n * 3),
        colors: this.colors.slice(0, n * 3),
        absMag: this.absMag.slice(0, n),
      };
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => this.absMag[a]! - this.absMag[b]!);
    const positions = new Float32Array(n * 3);
    const colors = new Uint8Array(n * 3);
    const absMag = new Float32Array(n);
    order.forEach((src, dst) => {
      positions.set(this.positions.subarray(src * 3, src * 3 + 3), dst * 3);
      colors.set(this.colors.subarray(src * 3, src * 3 + 3), dst * 3);
      absMag[dst] = this.absMag[src]!;
    });
    return { count: n, originPc: this.originPc, positions, colors, absMag };
  }
}

export function transferables(b: StarBuffers): Transferable[] {
  return [b.positions.buffer, b.colors.buffer, b.absMag.buffer];
}
