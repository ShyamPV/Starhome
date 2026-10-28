/// <reference lib="webworker" />
/**
 * Searches that take milliseconds to seconds and don't need to run every frame: rise,
 * transit and set times, and satellite pass predictions.
 */
import { nextPass, riseTransitSet, satelliteFromTle } from '@starhome/astro';
import type { SkyRequest, SkyResponse } from './skyProtocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (ev: MessageEvent<SkyRequest>) => {
  const msg = ev.data;
  let res: SkyResponse;
  try {
    if (msg.type === 'riseSet') {
      res = { id: msg.id, type: 'riseSet', result: riseTransitSet(msg.target, msg.location, msg.jd) };
    } else {
      const sat = satelliteFromTle(msg.elements);
      res = { id: msg.id, type: 'pass', result: sat ? nextPass(sat, msg.location, msg.jd, msg.hours) : null };
    }
  } catch (err) {
    res = { id: msg.id, type: 'error', message: String(err) };
  }
  self.postMessage(res);
};
