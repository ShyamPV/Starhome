import { FAMOUS_SYSTEMS } from '@starhome/data';
import type { TargetSummary } from '@starhome/engine';

export const KIND_LABEL: Record<TargetSummary['kind'], string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Moon',
  'black-hole': 'Black hole',
  cluster: 'Globular cluster',
  nebula: 'Nebula',
  exoplanet: 'Exoplanet',
  'neutron-star': 'Neutron star',
  galaxy: 'Galaxy',
  region: 'Region',
};

export type Category = 'stars' | 'exoplanets' | 'nebulae' | 'clusters' | 'remnants' | 'solar' | 'galaxies';

/** Explore categories, in display order. Colours: the validated categorical palette (dark), fixed order. */
export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: 'stars', label: 'Stars', color: '#3987e5' },
  { id: 'exoplanets', label: 'Exoplanets', color: '#d95926' },
  { id: 'nebulae', label: 'Nebulae', color: '#199e70' },
  { id: 'clusters', label: 'Clusters', color: '#c98500' },
  { id: 'remnants', label: 'Black holes & neutron stars', color: '#d55181' },
  { id: 'solar', label: 'Solar System', color: '#008300' },
  { id: 'galaxies', label: 'Galaxies & regions', color: '#9085e9' },
];

export const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color])) as Record<Category, string>;

export function categoryOf(t: Pick<TargetSummary, 'id' | 'kind'>): Category {
  if (t.id === 'sun') return 'solar';
  switch (t.kind) {
    case 'star':
      return 'stars';
    case 'exoplanet':
      return 'exoplanets';
    case 'nebula':
      return 'nebulae';
    case 'cluster':
      return 'clusters';
    case 'black-hole':
    case 'neutron-star':
      return 'remnants';
    case 'planet':
    case 'dwarf-planet':
    case 'moon':
      return 'solar';
    default:
      return 'galaxies';
  }
}

/** Exoplanets whose systems have hand-written facts (TRAPPIST-1, Proxima, 55 Cnc...). */
export function famousPlanet(t: TargetSummary): boolean {
  return t.kind === 'exoplanet' && Object.keys(FAMOUS_SYSTEMS).some((h) => t.subtitle.endsWith(`· ${h}`));
}

/**
 * "Surprise me": pick a category first, then an object in it, so the 157 globular
 * clusters and thousands of exoplanets don't crowd out the nebulae. Exoplanets come from
 * the famous systems or the habitable zone; unnamed hosts are skipped.
 */
export function pickSurprise(targets: TargetSummary[], exclude: string | null, rand = Math.random): TargetSummary | null {
  const pools = new Map<Category, TargetSummary[]>();
  for (const t of targets) {
    if (t.id === exclude || t.id === 'earth' || t.kind === 'region') continue;
    if (t.kind === 'star' && t.subtitle.startsWith('Exoplanet host')) continue;
    if (t.kind === 'exoplanet' && !(famousPlanet(t) || t.details['Habitable zone']?.startsWith('Yes'))) continue;
    const c = categoryOf(t);
    if (!pools.has(c)) pools.set(c, []);
    pools.get(c)!.push(t);
  }
  const cats = [...pools.keys()];
  if (cats.length === 0) return null;
  const pool = pools.get(cats[Math.floor(rand() * cats.length)]!)!;
  return pool[Math.floor(rand() * pool.length)]!;
}

/**
 * Named and curated objects: everything except archive-only exoplanet hosts, exoplanets
 * outside the famous systems, and globular clusters with nothing but catalogue data.
 */
export function isHighlight(t: TargetSummary): boolean {
  if (t.kind === 'exoplanet') return famousPlanet(t);
  if (t.kind === 'star') return !t.subtitle.startsWith('Exoplanet host');
  // Every cluster carries the Harris provenance note; famous ones have more.
  if (t.kind === 'cluster') return t.facts.length >= 2;
  return true;
}

/** Local calendar date, YYYY-MM-DD. */
export function localDateKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Object of the day: the same for everyone on a given date, from objects with curated facts. */
export function featuredOf(targets: TargetSummary[], dateKey: string): TargetSummary | null {
  const pool = targets.filter((t) => t.kind !== 'exoplanet' && t.kind !== 'region' && t.id !== 'milky-way' && t.facts.length >= 2).sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length === 0) return null;
  // FNV-1a over the date string.
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) h = Math.imul(h ^ dateKey.charCodeAt(i), 0x01000193);
  return pool[(h >>> 0) % pool.length]!;
}
