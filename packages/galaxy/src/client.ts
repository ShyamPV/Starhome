import type { StarBuffers } from './buffers';
import type { CellBuffers, CellRequest } from './cells';
import type { ClusterBuffers, ClusterRequest } from './clusters';
import type { DustMap } from './dust';
import type { GlowOptions } from './glow';
import type { NebulaRequest, NebulaVolume } from './nebulae';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { TileRequest } from './tiles';

type Pending = { resolve: (b: never) => void; reject: (e: Error) => void };

// Distributive Omit, so each request variant keeps its own fields.
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

/** Small pool of generation workers; requests are dealt round-robin. */
export class GalaxyWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private turn = 0;

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: `galaxy-${i}` });
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
      this.workers.push(w);
    }
  }

  private onMessage(res: WorkerResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.type === 'error') p.reject(new Error(res.message));
    else p.resolve(res.buffers as never);
  }

  private send<T>(body: RequestBody): Promise<T> {
    const req = { ...body, id: this.nextId++ } as WorkerRequest;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (b: never) => void, reject });
      this.workers[this.turn++ % this.workers.length]!.postMessage(req);
    });
  }

  generateGlow(options: GlowOptions): Promise<StarBuffers> {
    return this.send({ type: 'glow', options });
  }

  generateCell(request: CellRequest): Promise<CellBuffers> {
    return this.send({ type: 'cell', request });
  }

  generateTile(request: TileRequest): Promise<StarBuffers> {
    return this.send({ type: 'tile', request });
  }

  generateCluster(request: ClusterRequest): Promise<ClusterBuffers> {
    return this.send({ type: 'cluster', request });
  }

  generateNebula(request: NebulaRequest): Promise<NebulaVolume> {
    return this.send({ type: 'nebula', request });
  }

  buildDustMap(): Promise<DustMap> {
    return this.send({ type: 'dust' });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.pending.values()) p.reject(new Error('worker pool disposed'));
    this.pending.clear();
  }
}
