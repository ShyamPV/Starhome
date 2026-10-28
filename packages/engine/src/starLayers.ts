import { KM_PER_PC, type Vec3 } from '@vialactea/astro';
import { CELL_SIZE_PC, cellCenter, cellIndexOf, cellKey, type GalaxyWorkerPool, type StarBuffers } from '@vialactea/galaxy';
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

export interface CellStreamerOptions {
  /** Cells loaded in each direction around the camera cell. */
  reach: number;
  /** Stars per cell nearest the camera; farther rings draw only their brightest subset. */
  cap: number;
  seed: number;
  realCatalogMagLimit: number;
}

interface CellEntry {
  batch?: StarBatch;
  loading: boolean;
  ix: number;
  iy: number;
  iz: number;
}

/**
 * Streams procedurally generated star cells around the camera. Each cell is generated
 * once at full budget with stars sorted brightest-first; outer rings simply draw fewer.
 */
export class CellStreamer {
  readonly group = new Group();
  private readonly cells = new Map<string, CellEntry>();
  private lastKey = '';
  private inFlight = 0;
  private queue: { ix: number; iy: number; iz: number; ring: number }[] = [];
  private center: [number, number, number] = [0, 0, 0];
  private disposed = false;

  constructor(
    private readonly pool: GalaxyWorkerPool,
    private readonly material: ShaderMaterial,
    private opts: CellStreamerOptions,
  ) {}

  /** Radius (km) out to which cells are always fully present. */
  get coverageKm(): number {
    return (this.opts.reach + 0.5) * CELL_SIZE_PC * KM_PER_PC;
  }

  get starCount(): number {
    let n = 0;
    for (const c of this.cells.values()) if (c.batch) n += c.batch.count;
    return n;
  }

  get pending(): number {
    return this.queue.length + this.inFlight;
  }

  reset(opts: CellStreamerOptions): void {
    this.opts = opts;
    for (const c of this.cells.values()) c.batch?.dispose();
    this.cells.clear();
    this.group.clear();
    this.queue = [];
    this.lastKey = '';
  }

  private ringOf(ix: number, iy: number, iz: number): number {
    return Math.max(Math.abs(ix - this.center[0]), Math.abs(iy - this.center[1]), Math.abs(iz - this.center[2]));
  }

  private drawCountForRing(ring: number, total: number): number {
    const frac = ring <= 1 ? 1 : ring === 2 ? 0.35 : ring === 3 ? 0.15 : 0.08;
    return Math.ceil(total * frac);
  }

  update(cameraGalPc: Vec3, cameraKm: Vector3): void {
    const idx = cellIndexOf(cameraGalPc);
    const key = cellKey(...idx);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.center = idx;
      this.retarget();
    }
    this.pump();
    for (const c of this.cells.values()) c.batch?.rebase(cameraKm);
  }

  private retarget(): void {
    const r = this.opts.reach;
    const [cx, cy, cz] = this.center;
    // Drop cells beyond reach + 1 (one ring of hysteresis).
    for (const [k, c] of this.cells) {
      const ring = this.ringOf(c.ix, c.iy, c.iz);
      if (ring > r + 1) {
        if (c.batch) {
          this.group.remove(c.batch.points);
          c.batch.dispose();
        }
        this.cells.delete(k);
      } else if (c.batch) {
        const total = c.batch.points.geometry.getAttribute('position').count;
        c.batch.points.geometry.setDrawRange(0, this.drawCountForRing(ring, total));
      }
    }
    this.queue = [];
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (let k = -r; k <= r; k++) {
          const ix = cx + i;
          const iy = cy + j;
          const iz = cz + k;
          if (!this.cells.has(cellKey(ix, iy, iz))) this.queue.push({ ix, iy, iz, ring: Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) });
        }
    this.queue.sort((a, b) => b.ring - a.ring); // pop() takes the nearest first
  }

  private pump(): void {
    while (this.inFlight < 8 && this.queue.length) {
      const q = this.queue.pop()!;
      const key = cellKey(q.ix, q.iy, q.iz);
      if (this.cells.has(key)) continue;
      const entry: CellEntry = { loading: true, ix: q.ix, iy: q.iy, iz: q.iz };
      this.cells.set(key, entry);
      this.inFlight++;
      this.pool
        .generateCell({ ix: q.ix, iy: q.iy, iz: q.iz, cap: this.opts.cap, seed: this.opts.seed, realCatalogMagLimit: this.opts.realCatalogMagLimit })
        .then((buf) => {
          this.inFlight--;
          if (this.disposed || this.cells.get(key) !== entry) return;
          entry.loading = false;
          if (buf.count === 0) return;
          entry.batch = new StarBatch(buf, cellCenter(q.ix, q.iy, q.iz), this.material);
          entry.batch.points.geometry.setDrawRange(0, this.drawCountForRing(this.ringOf(q.ix, q.iy, q.iz), buf.count));
          this.group.add(entry.batch.points);
        })
        .catch(() => {
          this.inFlight--;
          this.cells.delete(key);
        });
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.cells.values()) c.batch?.dispose();
    this.cells.clear();
  }
}

export function starBatchFromBuffers(b: StarBuffers, material: ShaderMaterial, cull = true): StarBatch {
  return new StarBatch(b, b.originPc, material, cull);
}
