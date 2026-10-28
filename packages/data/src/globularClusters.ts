/**
 * Milky Way globular clusters from the Harris catalogue (Harris 1996, AJ 112, 1487;
 * 2010 edition): positions, distances, luminosities, metallicities, reddening and King
 * structural parameters for 157 clusters. Rebuild the JSON with tools/build-globulars.mjs.
 *
 * The catalogue is supplied free of charge by W. E. Harris; anyone passing it on must
 * refer to the original source (https://physics.mcmaster.ca/~harris/mwgc.dat).
 */
import catalogue from './globularClusters.json';

interface HarrisRow {
  id: string;
  alt: string | null;
  ra: number;
  dec: number;
  l: number;
  b: number;
  distKpc: number;
  feH?: number | null;
  ebv?: number | null;
  vt?: number | null;
  mv?: number | null;
  ellip?: number | null;
  concentration?: number | null;
  collapsed?: boolean;
  rcArcmin?: number | null;
  rhArcmin?: number | null;
}

export interface GlobularCluster {
  /** URL-safe id, e.g. "ngc-6205". */
  id: string;
  /** Display name, e.g. "M13 (Hercules Cluster)". */
  name: string;
  /** Harris catalogue identifier, e.g. "NGC 6205". */
  designation: string;
  /** Other common designation from the catalogue (e.g. "M 13"). */
  alt: string | null;
  /** ICRS right ascension and declination, degrees. */
  ra: number;
  dec: number;
  /** Galactic longitude and latitude, degrees. */
  l: number;
  b: number;
  distKpc: number;
  /** [Fe/H]; null when not measured. */
  feH: number | null;
  /** Foreground reddening E(B-V), mag. */
  ebv: number | null;
  /** Integrated apparent V magnitude. */
  vt: number | null;
  /** Integrated absolute V magnitude (cluster luminosity); estimated when missing. */
  absMagV: number;
  absMagEstimated: boolean;
  /** King concentration c = log10(r_t / r_c). */
  concentration: number | null;
  coreCollapsed: boolean;
  /** Core and half-light radii, arcmin. */
  rcArcmin: number | null;
  rhArcmin: number | null;
  /** Half-light radius in parsecs (from r_h and distance; 3 pc assumed when unknown). */
  rhPc: number;
  ellipticity: number | null;
  facts: string[];
}

/** Popular names and facts for well-known clusters, keyed by Harris id. */
const NOTABLE: Record<string, { name?: string; facts: string[] }> = {
  'NGC 5139': {
    name: 'Omega Centauri',
    facts: [
      'The most massive globular cluster in the Milky Way, with roughly ten million stars.',
      'Its several distinct stellar populations suggest it is the stripped core of a dwarf galaxy.',
      'Fast-moving stars near its centre point to an intermediate-mass black hole (Häberle et al. 2024).',
    ],
  },
  'NGC 104': {
    name: '47 Tucanae',
    facts: [
      'The second-brightest globular cluster in the sky, visible to the naked eye beside the Small Magellanic Cloud.',
      'Hosts dozens of millisecond pulsars spun up by companions in its crowded core.',
    ],
  },
  'NGC 6205': {
    name: 'M13 (Hercules Cluster)',
    facts: ['The brightest globular cluster in the northern sky.', 'Target of the Arecibo radio message sent in 1974.'],
  },
  'NGC 6656': { name: 'M22', facts: ['One of the nearest globular clusters and one of the first discovered (1665).'] },
  'NGC 6121': {
    name: 'M4',
    facts: ['The nearest globular cluster to the Sun, about 2.2 kpc away.', 'Hubble used its old white dwarfs to estimate the age of the Galaxy.'],
  },
  'NGC 7078': { name: 'M15', facts: ['A core-collapsed cluster with one of the densest centres known.', 'Contains Pease 1, the first planetary nebula found in a globular cluster.'] },
  'NGC 6397': { facts: ['One of the two nearest globular clusters, about 2.3 kpc away, with a collapsed core.'] },
  'NGC 5272': { name: 'M3', facts: ['Has one of the largest known populations of variable stars of any globular cluster, mostly RR Lyrae.'] },
  'NGC 6341': { name: 'M92', facts: ['One of the most metal-poor and oldest globular clusters in the Galaxy.'] },
  'NGC 6715': { name: 'M54', facts: ['Sits at the centre of the Sagittarius Dwarf Spheroidal galaxy, which the Milky Way is tearing apart.'] },
  'NGC 2808': { facts: ['Has three distinct main sequences, a classic case of multiple stellar populations.'] },
  'Terzan 5': {
    facts: [
      'Holds more known millisecond pulsars than any other globular cluster.',
      'Hidden behind heavy dust toward the bulge; its mix of stellar ages hints it is a fossil fragment of the young bulge.',
    ],
  },
};

const SPECIAL_NAMES: Record<string, string> = { '47 Tuc': '47 Tucanae', 'omega Cen': 'Omega Centauri' };

function displayName(row: HarrisRow): string {
  const notable = NOTABLE[row.id]?.name;
  if (notable) return notable;
  if (row.alt?.startsWith('M ')) return row.alt.replace(' ', '');
  return SPECIAL_NAMES[row.alt ?? ''] ?? row.id;
}

const ARCMIN = Math.PI / (180 * 60);

export const GLOBULAR_CLUSTERS: readonly GlobularCluster[] = (catalogue.clusters as HarrisRow[]).map((row) => {
  const dPc = row.distKpc * 1000;
  // Missing M_V (heavily obscured clusters): fall back to the median cluster luminosity.
  const mv = row.mv ?? (row.vt != null && row.ebv != null ? row.vt - 3.1 * row.ebv - 5 * Math.log10(dPc) + 5 : null);
  return {
    id: row.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: displayName(row),
    designation: row.id,
    alt: row.alt,
    ra: row.ra,
    dec: row.dec,
    l: row.l,
    b: row.b,
    distKpc: row.distKpc,
    feH: row.feH ?? null,
    ebv: row.ebv ?? null,
    vt: row.vt ?? null,
    absMagV: mv ?? -7.0,
    absMagEstimated: row.mv == null,
    concentration: row.concentration ?? null,
    coreCollapsed: row.collapsed ?? false,
    rcArcmin: row.rcArcmin ?? null,
    rhArcmin: row.rhArcmin ?? null,
    rhPc: row.rhArcmin != null ? dPc * row.rhArcmin * ARCMIN : 3,
    ellipticity: row.ellip ?? null,
    facts: NOTABLE[row.id]?.facts ?? [],
  };
});
