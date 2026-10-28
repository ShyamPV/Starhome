/**
 * The 88 IAU constellations (Serpens in two parts): names, label positions and
 * stick-figure lines in J2000 RA/Dec. Data from d3-celestial by Olaf Frohn
 * (BSD-3-Clause; the notice travels in constellations.json). Rebuild with
 * tools/build-constellations.mjs.
 */
import data from './constellations.json';

export interface Constellation {
  /** IAU three-letter abbreviation (Serpens: Ser1 caput, Ser2 cauda). */
  id: string;
  name: string;
  genitive: string;
  /** 1 = major, 3 = faint; for thinning labels. */
  rank: number;
  /** Label position, J2000 RA/Dec degrees. */
  label: [number, number];
  /** Polylines, each flattened as [ra0, dec0, ra1, dec1, ...] in degrees. */
  lines: number[][];
}

export const CONSTELLATIONS: readonly Constellation[] = data.constellations as Constellation[];
export const CONSTELLATION_DATA_LICENSE: string = data.license;
