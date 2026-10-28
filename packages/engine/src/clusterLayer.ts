import { KM_PER_PC, raDecDistToGalactocentric, teffToLinearRgb, type Vec3 } from '@starhome/astro';
import { GLOBULAR_CLUSTERS } from '@starhome/data';
import { clusterIntegratedTeff, type GalaxyWorkerPool } from '@starhome/galaxy';
import { Group, type ShaderMaterial, type Vector3 } from 'three';
import { StarBatch } from './starLayers';

/** Resolved stars fade in (and the aggregate particle fades out) between these distances, pc. */
export const CLUSTER_RESOLVE_FADE_PC: [number, number] = [250, 600];
const LOAD_PC = 700;
const DROP_PC = 900;

interface Resolved {
  batches: StarBatch[];
  loading: boolean;
}

/**
 * Globular clusters: each is a single soft particle with the cluster's real integrated
 * magnitude from afar, and a cloud of resolved (modeled) stars plus unresolved haze once
 * the camera is within a few hundred parsecs.
 */
export class GlobularClusterLayer {
  readonly group = new Group();
  private readonly aggregate: StarBatch;
  private readonly centers: Vec3[];
  private readonly resolved = new Map<number, Resolved>();
  private disposed = false;

  constructor(
    private readonly pool: GalaxyWorkerPool,
    aggregateMaterial: ShaderMaterial,
    private readonly starMaterial: ShaderMaterial,
    private readonly hazeMaterial: ShaderMaterial,
    private opts: { seed: number; cap: number },
  ) {
    const n = GLOBULAR_CLUSTERS.length;
    const positions = new Float32Array(n * 3);
    const colors = new Uint8Array(n * 3);
    const absMag = new Float32Array(n);
    this.centers = GLOBULAR_CLUSTERS.map((c, i) => {
      const p = raDecDistToGalactocentric(c.ra, c.dec, c.distKpc * 1000);
      positions.set(p, i * 3);
      colors.set(teffToLinearRgb(clusterIntegratedTeff(c.feH ?? -1.3)).map((v) => Math.round(v * 255)), i * 3);
      absMag[i] = c.absMagV;
      return p;
    });
    this.aggregate = new StarBatch({ count: n, positions, colors, absMag }, [0, 0, 0], aggregateMaterial, false);
    this.group.add(this.aggregate.points);
  }

  get starCount(): number {
    let n = 0;
    for (const r of this.resolved.values()) for (const b of r.batches) n += b.count;
    return n;
  }

  get pending(): number {
    let n = 0;
    for (const r of this.resolved.values()) if (r.loading) n++;
    return n;
  }

  setCap(cap: number): void {
    if (cap === this.opts.cap) return;
    this.opts = { ...this.opts, cap };
    for (const r of this.resolved.values()) for (const b of r.batches) this.dropBatch(b);
    this.resolved.clear();
  }

  private dropBatch(b: StarBatch): void {
    this.group.remove(b.points);
    b.dispose();
  }

  update(cameraGalPc: Vec3, cameraKm: Vector3): void {
    this.aggregate.rebase(cameraKm);
    for (let i = 0; i < this.centers.length; i++) {
      const c = this.centers[i]!;
      const d = Math.hypot(c[0] - cameraGalPc[0], c[1] - cameraGalPc[1], c[2] - cameraGalPc[2]);
      const entry = this.resolved.get(i);
      if (entry && d > DROP_PC) {
        for (const b of entry.batches) this.dropBatch(b);
        this.resolved.delete(i);
      } else if (!entry && d < LOAD_PC) {
        this.load(i);
      }
    }
    for (const r of this.resolved.values()) for (const b of r.batches) b.rebase(cameraKm);
  }

  private load(i: number): void {
    const entry: Resolved = { batches: [], loading: true };
    this.resolved.set(i, entry);
    const c = GLOBULAR_CLUSTERS[i]!;
    this.pool
      .generateCluster({ index: i, centerPc: this.centers[i]!, absMagV: c.absMagV, rhPc: c.rhPc, feH: c.feH ?? -1.3, cap: this.opts.cap, seed: this.opts.seed })
      .then(({ stars, haze }) => {
        if (this.disposed || this.resolved.get(i) !== entry) return;
        entry.loading = false;
        for (const [buf, mat] of [
          [stars, this.starMaterial],
          [haze, this.hazeMaterial],
        ] as const) {
          if (buf.count === 0) continue;
          const b = new StarBatch(buf, buf.originPc, mat);
          entry.batches.push(b);
          this.group.add(b.points);
        }
      })
      .catch(() => {
        if (this.resolved.get(i) === entry) this.resolved.delete(i);
      });
  }

  dispose(): void {
    this.disposed = true;
    this.aggregate.dispose();
    for (const r of this.resolved.values()) for (const b of r.batches) b.dispose();
    this.resolved.clear();
  }
}

export const CLUSTER_FADE_KM: [number, number] = [CLUSTER_RESOLVE_FADE_PC[0] * KM_PER_PC, CLUSTER_RESOLVE_FADE_PC[1] * KM_PER_PC];
