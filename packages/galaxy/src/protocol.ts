import type { StarBuffers } from './buffers';
import type { CellBuffers, CellRequest } from './cells';
import type { ClusterBuffers, ClusterRequest } from './clusters';
import type { DustMap } from './dust';
import type { GlowOptions } from './glow';
import type { TileRequest } from './tiles';

export type WorkerRequest =
  | { id: number; type: 'glow'; options: GlowOptions }
  | { id: number; type: 'cell'; request: CellRequest }
  | { id: number; type: 'tile'; request: TileRequest }
  | { id: number; type: 'cluster'; request: ClusterRequest }
  | { id: number; type: 'dust' };

export type WorkerResponse =
  | { id: number; type: 'glow'; buffers: StarBuffers }
  | { id: number; type: 'cell'; buffers: CellBuffers }
  | { id: number; type: 'tile'; buffers: StarBuffers }
  | { id: number; type: 'cluster'; buffers: ClusterBuffers }
  | { id: number; type: 'dust'; buffers: DustMap }
  | { id: number; type: 'error'; message: string };
