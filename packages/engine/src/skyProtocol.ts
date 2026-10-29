import type { GeoLocation, RiseSetTarget, RiseSetTimes, SatelliteElements, SatellitePass } from '@starhome/astro';

export type SkyRequest =
  | { id: number; type: 'riseSet'; target: RiseSetTarget; location: GeoLocation; jd: number }
  | { id: number; type: 'pass'; elements: SatelliteElements; location: GeoLocation; jd: number; hours: number };

export type SkyResponse =
  | { id: number; type: 'riseSet'; result: RiseSetTimes }
  | { id: number; type: 'pass'; result: SatellitePass | null }
  | { id: number; type: 'error'; message: string };
