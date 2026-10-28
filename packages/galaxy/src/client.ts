import type { StarBuffers } from './buffers';
import type { CellBuffers, CellRequest } from './cells';
import type { GlowOptions } from './glow';
import type { WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (b: never) => void; reject: (e: Error) => void };

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

  private send<T>(req: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (b: never) => void, reject });
      this.workers[this.turn++ % this.workers.length]!.postMessage(req);
    });
  }

  generateGlow(options: GlowOptions): Promise<StarBuffers> {
    return this.send({ id: this.nextId++, type: 'glow', options });
  }

  generateCell(request: CellRequest): Promise<CellBuffers> {
    return this.send({ id: this.nextId++, type: 'cell', request });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.pending.values()) p.reject(new Error('worker pool disposed'));
    this.pending.clear();
  }
}
