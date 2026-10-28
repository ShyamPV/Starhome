/// <reference lib="webworker" />
import { transferables } from './buffers';
import { generateCell } from './cells';
import { generateClusterStars } from './clusters';
import { buildDustMap } from './dust';
import { generateGlow } from './glow';
import { R0_KPC, componentDensities } from './model';
import { generateNebula } from './nebulae';
import { samplePopulation, sampleVisible } from './populations';
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
      case 'hrSample': {
        // Local densities at the Sun (arm strength of the Orion Spur), without clumping noise.
        const d = componentDensities(-R0_KPC, 0, 0.02, 0.5);
        const density = { young: d.young, thin: d.thin, old: d.thick + d.halo };
        const buffers = msg.mode === 'visible' ? sampleVisible(msg.n, density, 6.5, msg.seed) : samplePopulation(msg.n, density, msg.seed);
        respond({ id: msg.id, type: 'hrSample', buffers }, [buffers.teff.buffer, buffers.absMagV.buffer, buffers.evolved.buffer, buffers.pop.buffer]);
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
