/// <reference lib="webworker" />
import { transferables } from './buffers';
import { generateCell } from './cells';
import { generateClusterStars } from './clusters';
import { buildDustMap } from './dust';
import { generateGlow } from './glow';
import { generateNebula } from './nebulae';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { generateTile } from './tiles';

declare const self: DedicatedWorkerGlobalScope;

function respond(res: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(res, transfer);
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'glow': {
        const buffers = generateGlow(msg.options);
        respond({ id: msg.id, type: 'glow', buffers }, transferables(buffers));
        break;
      }
      case 'cell': {
        const buffers = generateCell(msg.request);
        respond({ id: msg.id, type: 'cell', buffers }, [...transferables(buffers), ...transferables(buffers.haze)]);
        break;
      }
      case 'tile': {
        const buffers = generateTile(msg.request);
        respond({ id: msg.id, type: 'tile', buffers }, transferables(buffers));
        break;
      }
      case 'cluster': {
        const buffers = generateClusterStars(msg.request);
        respond({ id: msg.id, type: 'cluster', buffers }, [...transferables(buffers.stars), ...transferables(buffers.haze)]);
        break;
      }
      case 'nebula': {
        const buffers = generateNebula(msg.request);
        respond({ id: msg.id, type: 'nebula', buffers }, [buffers.data.buffer]);
        break;
      }
      case 'dust': {
        const buffers = buildDustMap();
        respond({ id: msg.id, type: 'dust', buffers }, [buffers.data.buffer]);
        break;
      }
    }
  } catch (err) {
    respond({ id: msg.id, type: 'error', message: String(err) });
  }
};
