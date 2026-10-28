/// <reference lib="webworker" />
import { transferables } from './buffers';
import { generateCell, type CellRequest } from './cells';
import { generateGlow, type GlowOptions } from './glow';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'glow') {
      const buffers = generateGlow(msg.options as GlowOptions);
      const res: WorkerResponse = { id: msg.id, type: 'glow', buffers };
      self.postMessage(res, transferables(buffers));
    } else {
      const buffers = generateCell(msg.request as CellRequest);
      const res: WorkerResponse = { id: msg.id, type: 'cell', buffers };
      self.postMessage(res, transferables(buffers));
    }
  } catch (err) {
    const res: WorkerResponse = { id: msg.id, type: 'error', message: String(err) };
    self.postMessage(res);
  }
};
