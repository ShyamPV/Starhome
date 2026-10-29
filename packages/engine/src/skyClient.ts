import type { GeoLocation, RiseSetTarget, RiseSetTimes, SatelliteElements, SatellitePass } from '@starhome/astro';
import type { SkyRequest, SkyResponse } from './skyProtocol';

// Distributive Omit, so each request variant keeps its own fields.
type RequestBody = SkyRequest extends infer R ? (R extends SkyRequest ? Omit<R, 'id'> : never) : never;

/** Client for the sky worker (rise/set and satellite-pass searches). */
export class SkyWorkerClient {
  private readonly worker = new Worker(new URL('./skyWorker.ts', import.meta.url), { type: 'module', name: 'sky' });
  private readonly pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<SkyResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.type === 'error') p.reject(new Error(ev.data.message));
      else p.resolve(ev.data.result as never);
    };
  }

  private send<T>(body: RequestBody): Promise<T> {
    const req = { ...body, id: this.nextId++ } as SkyRequest;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (v: never) => void, reject });
      this.worker.postMessage(req);
    });
  }

  riseSet(target: RiseSetTarget, location: GeoLocation, jd: number): Promise<RiseSetTimes> {
    return this.send({ type: 'riseSet', target, location, jd });
  }

  nextPass(elements: SatelliteElements, location: GeoLocation, jd: number, hours = 24): Promise<SatellitePass | null> {
    return this.send({ type: 'pass', elements, location, jd, hours });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('sky worker disposed'));
    this.pending.clear();
  }
}
