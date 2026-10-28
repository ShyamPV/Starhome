import type { StarBuffers } from './buffers';
import type { CellBuffers, CellRequest } from './cells';
import type { GlowOptions } from './glow';

export type WorkerRequest =
  | { id: number; type: 'glow'; options: GlowOptions }
  | { id: number; type: 'cell'; request: CellRequest };

export type WorkerResponse =
  | { id: number; type: 'glow'; buffers: StarBuffers }
  | { id: number; type: 'cell'; buffers: CellBuffers }
  | { id: number; type: 'error'; message: string };
