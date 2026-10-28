import { KM_PER_PC, type Vec3 } from '@starhome/astro';
import type { StarBuffers } from '@starhome/galaxy';
import { BufferAttribute, BufferGeometry, Group, Points, Vector3, type ShaderMaterial } from 'three';
import { GAL_PC_BASIS, galPcToWorldKm } from './frames';

export interface StarArrays {
  count: number;
  positions: Float32Array;
  colors: Uint8Array;
  absMag: Float32Array;
}

/**
 * A star batch anchored at a double-precision world origin. The float32 positions are
 * parsecs relative to that origin; the floating origin moves the batch each frame.
 */
export class StarBatch {
  readonly points: Points;
  readonly originKm: Vector3;

  constructor(arrays: StarArrays, originPc: Vec3, material: ShaderMaterial, cull = true) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(arrays.positions, 3));
    geo.setAttribute('starColor', new BufferAttribute(arrays.colors, 3, true));
    geo.setAttribute('absMag', new BufferAttribute(arrays.absMag, 1));
    this.points = new Points(geo, material);
    this.points.matrixAutoUpdate = false;
    this.points.matrix.copy(GAL_PC_BASIS);
    this.points.frustumCulled = cull;
    this.originKm = galPcToWorldKm(originPc);
  }

  get count(): number {
    return this.points.geometry.drawRange.count === Infinity
      ? this.points.geometry.getAttribute('position').count
      : this.points.geometry.drawRange.count;
  }

  /** Floating origin: place the batch relative to the camera. */
  rebase(cameraKm: Vector3): void {
    const e = this.points.matrix.elements;
    e[12] = this.originKm.x - cameraKm.x;
    e[13] = this.originKm.y - cameraKm.y;
    e[14] = this.originKm.z - cameraKm.z;
    this.points.matrixWorldNeedsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
  }
}

export interface GridLayerOptions {
  /** Grid cell edge, pc. */
  sizePc: number;
  /** Cells loaded in each direction around the camera cell. */
  reach: number;
  /** Generate one grid cell: one buffer per material slot (null or empty = nothing to draw). */
  load: (ix: number, iy: number, iz: number) => Promise<(StarBuffers | null)[]>;
  /**
   * Level of detail for slot 0, whose buffers are sorted brightest-first: the fraction of
   * stars drawn at each ring (Chebyshev distance in cells from the camera's cell).
   */
  ringFraction?: (ring: number) => number;
  maxInFlight?: number;
}

interface GridEntry {
  batches: (StarBatch | null)[];
  ix: number;
  iy: number;
  iz: number;
}

/**
 * Streams procedurally generated grid cells (resolved-star cells or aggregate tiles)
 * around the camera, nearest first, keeping one ring of hysteresis.
 */
export class GridStreamer {
  readonly group = new Group();
  private readonly entries = new Map<string, GridEntry>();
  private lastKey = '';
  private inFlight = 0;
  private queue: { ix: number; iy: number; iz: number; ring: number }[] = [];
  private center: [number, number, number] = [0, 0, 0];
  private disposed = false;

  constructor(
    private readonly materials: ShaderMaterial[],
    private opts: GridLayerOptions,
  ) {}

  get sizePc(): number {
    return this.opts.sizePc;
  }

  /** Radius (km) out to which the grid is always fully loaded, wherever the camera is in its cell. */
  get guaranteedKm(): number {
    return this.opts.reach * this.opts.sizePc * KM_PER_PC;
  }

  get starCount(): number {
    let n = 0;
    for (const e of this.entries.values()) for (const b of e.batches) if (b) n += b.count;
    return n;
  }

  get pending(): number {
    return this.queue.length + this.inFlight;
  }

  reset(opts: GridLayerOptions): void {
    this.opts = opts;
    for (const e of this.entries.values()) for (const b of e.batches) b?.dispose();
    this.entries.clear();
    this.group.clear();
    this.queue = [];
    this.lastKey = '';
  }

  private ringOf(ix: number, iy: number, iz: number): number {
    return Math.max(Math.abs(ix - this.center[0]), Math.abs(iy - this.center[1]), Math.abs(iz - this.center[2]));
  }

  private applyLod(e: GridEntry): void {
    const b = e.batches[0];
    if (!b || !this.opts.ringFraction) return;
    const total = b.points.geometry.getAttribute('position').count;
    b.points.geometry.setDrawRange(0, Math.ceil(total * this.opts.ringFraction(this.ringOf(e.ix, e.iy, e.iz))));
  }

  update(cameraGalPc: Vec3, cameraKm: Vector3): void {
    const s = this.opts.sizePc;
    const idx: [number, number, number] = [Math.floor(cameraGalPc[0] / s), Math.floor(cameraGalPc[1] / s), Math.floor(cameraGalPc[2] / s)];
    const key = idx.join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.center = idx;
      this.retarget();
    }
    this.pump();
    for (const e of this.entries.values()) for (const b of e.batches) b?.rebase(cameraKm);
  }

  private retarget(): void {
    const r = this.opts.reach;
    const [cx, cy, cz] = this.center;
    for (const [k, e] of this.entries) {
      if (this.ringOf(e.ix, e.iy, e.iz) > r + 1) {
        for (const b of e.batches) {
          if (!b) continue;
          this.group.remove(b.points);
          b.dispose();
        }
        this.entries.delete(k);
      } else {
        this.applyLod(e);
      }
    }
    this.queue = [];
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (let k = -r; k <= r; k++) {
          const ix = cx + i;
          const iy = cy + j;
          const iz = cz + k;
          if (!this.entries.has(`${ix},${iy},${iz}`)) this.queue.push({ ix, iy, iz, ring: Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) });
        }
    this.queue.sort((a, b) => b.ring - a.ring); // pop() takes the nearest first
  }

  private pump(): void {
    const max = this.opts.maxInFlight ?? 8;
    while (this.inFlight < max && this.queue.length) {
      const q = this.queue.pop()!;
      const key = `${q.ix},${q.iy},${q.iz}`;
      if (this.entries.has(key)) continue;
      const entry: GridEntry = { batches: [], ix: q.ix, iy: q.iy, iz: q.iz };
      this.entries.set(key, entry);
      this.inFlight++;
      this.opts
        .load(q.ix, q.iy, q.iz)
        .then((bufs) => {
          this.inFlight--;
          if (this.disposed || this.entries.get(key) !== entry) return;
          entry.batches = bufs.map((buf, slot) => {
            if (!buf || buf.count === 0) return null;
            const batch = new StarBatch(buf, buf.originPc, this.materials[slot]!);
            this.group.add(batch.points);
            return batch;
          });
          this.applyLod(entry);
        })
        .catch(() => {
          this.inFlight--;
          if (this.entries.get(key) === entry) this.entries.delete(key);
        });
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) for (const b of e.batches) b?.dispose();
    this.entries.clear();
  }
}

export function starBatchFromBuffers(b: StarBuffers, material: ShaderMaterial, cull = true): StarBatch {
  return new StarBatch(b, b.originPc, material, cull);
}
