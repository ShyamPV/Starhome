/**
 * Confirmed exoplanets from the NASA Exoplanet Archive (Planetary Systems Composite
 * Parameters), shipped as a snapshot built by tools/build-exoplanets.mjs, plus derived
 * quantities: size class, habitable zone (Kopparapu et al. 2014) and an Earth Similarity
 * Index estimate (Schulze-Makuch et al. 2011, radius-flux form).
 */

export type DiscoveryMethod = string;

export type SizeClass = 'rocky' | 'super-earth' | 'neptune-like' | 'gas-giant' | 'hot-jupiter';

export const SIZE_CLASS_LABEL: Record<SizeClass, string> = {
  rocky: 'Rocky',
  'super-earth': 'Super-Earth',
  'neptune-like': 'Neptune-like',
  'gas-giant': 'Gas giant',
  'hot-jupiter': 'Hot Jupiter',
};

export interface Exoplanet {
  /** URL-safe id, e.g. "trappist-1-e". */
  id: string;
  name: string;
  hostId: string;
  host: string;
  ra: number;
  dec: number;
  distPc: number | null;
  method: string;
  year: number | null;
  facility: string | null;
  periodDays: number | null;
  /** Semi-major axis, AU (from Kepler's third law when the archive has none). */
  aAu: number | null;
  ecc: number;
  incDeg: number | null;
  /** Argument of periastron, degrees. */
  omegaDeg: number;
  radiusEarth: number | null;
  massEarth: number | null;
  teqK: number | null;
  /** Stellar flux at the planet, Earth = 1. */
  insolation: number | null;
  sizeClass: SizeClass;
  /** Within the host's conservative habitable zone (by orbital distance). */
  inHabitableZone: boolean;
  /** Within the wider optimistic habitable zone (recent Venus to early Mars). */
  inOptimisticHz: boolean;
  /** Earth Similarity Index estimate, 0-1; null without radius and flux. */
  esi: number | null;
}

export interface ExoHost {
  id: string;
  name: string;
  ra: number;
  dec: number;
  distPc: number | null;
  vmag: number | null;
  spectralType: string | null;
  teffK: number | null;
  radiusSun: number | null;
  massSun: number | null;
  /** Luminosity, L_sun. */
  lumSun: number | null;
  ageGyr: number | null;
  /** Conservative habitable zone (runaway to maximum greenhouse), AU. */
  hz: [number, number] | null;
  /** Optimistic habitable zone (recent Venus to early Mars), AU. */
  hzOptimistic: [number, number] | null;
  planets: Exoplanet[];
}

export interface ExoplanetCatalog {
  hosts: ExoHost[];
  planets: Exoplanet[];
  retrieved: string;
  acknowledgement: string;
}

/** Kopparapu et al. 2014 (1 Earth mass) coefficients: S_eff,sun, a, b, c, d. */
const HZ_COEFFS = {
  recentVenus: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runawayGreenhouse: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
  maximumGreenhouse: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
} as const;

function seff(c: readonly number[], teff: number): number {
  const t = Math.min(7200, Math.max(2600, teff)) - 5780;
  return c[0]! + c[1]! * t + c[2]! * t ** 2 + c[3]! * t ** 3 + c[4]! * t ** 4;
}

/** Habitable-zone edges (AU) for a star of luminosity L (L_sun) and Teff (K). */
export function habitableZone(lumSun: number, teffK: number, optimistic = false): [number, number] {
  const inner = optimistic ? HZ_COEFFS.recentVenus : HZ_COEFFS.runawayGreenhouse;
  const outer = optimistic ? HZ_COEFFS.earlyMars : HZ_COEFFS.maximumGreenhouse;
  return [Math.sqrt(lumSun / seff(inner, teffK)), Math.sqrt(lumSun / seff(outer, teffK))];
}

/** Earth Similarity Index from radius (Earth radii) and stellar flux (Earth = 1). */
export function earthSimilarity(radiusEarth: number, insolation: number): number {
  const r = (radiusEarth - 1) / (radiusEarth + 1);
  const s = (insolation - 1) / (insolation + 1);
  return 1 - Math.sqrt(0.5 * (r * r + s * s));
}

/** Rough radius from mass (Chen & Kipping 2017 power laws), Earth units. */
export function radiusFromMass(massEarth: number): number {
  if (massEarth < 2.04) return massEarth ** 0.279;
  if (massEarth < 132) return 0.808 * massEarth ** 0.589;
  return 12.0;
}

export function sizeClassOf(radiusEarth: number, periodDays: number | null): SizeClass {
  if (radiusEarth < 1.25) return 'rocky';
  if (radiusEarth < 2) return 'super-earth';
  if (radiusEarth < 6) return 'neptune-like';
  return periodDays !== null && periodDays < 10 ? 'hot-jupiter' : 'gas-giant';
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface Snapshot {
  columns: string[];
  rows: (string | number | null)[][];
  retrieved: string;
  acknowledgement: string;
}

/** Build the catalogue (hosts with their planets) from the archive snapshot. */
export function parseExoplanets(doc: Snapshot): ExoplanetCatalog {
  const col = Object.fromEntries(doc.columns.map((c, i) => [c, i]));
  const hosts = new Map<string, ExoHost>();
  const planets: Exoplanet[] = [];
  for (const r of doc.rows) {
    const num = (k: string) => {
      const v = r[col[k]!];
      return typeof v === 'number' ? v : null;
    };
    const str = (k: string) => {
      const v = r[col[k]!];
      return typeof v === 'string' && v !== '' ? v : null;
    };
    const hostName = str('host')!;
    const hostId = `host-${slug(hostName)}`;
    let host = hosts.get(hostId);
    if (!host) {
      const teff = num('teff');
      // The archive gives log10(L/L_sun); fall back to R^2 T^4.
      const logL = num('slum');
      const srad = num('srad');
      const lum = logL !== null ? 10 ** logL : srad !== null && teff !== null ? srad * srad * (teff / 5772) ** 4 : null;
      host = {
        id: hostId,
        name: hostName,
        ra: num('ra')!,
        dec: num('dec')!,
        distPc: num('dist'),
        vmag: num('vmag'),
        spectralType: str('spt'),
        teffK: teff,
        radiusSun: srad,
        massSun: num('smass'),
        lumSun: lum,
        ageGyr: num('age'),
        hz: lum !== null && teff !== null ? habitableZone(lum, teff) : null,
        hzOptimistic: lum !== null && teff !== null ? habitableZone(lum, teff, true) : null,
        planets: [],
      };
      hosts.set(hostId, host);
    }
    const per = num('per');
    let a = num('a');
    if (a === null && per !== null && host.massSun !== null) a = Math.cbrt(host.massSun * (per / 365.25) ** 2);
    const mass = num('masse');
    const radius = num('rade') ?? (mass !== null ? radiusFromMass(mass) : null);
    let insol = num('insol');
    if (insol === null && host.lumSun !== null && a !== null) insol = host.lumSun / (a * a);
    const name = str('name')!;
    const p: Exoplanet = {
      id: slug(name),
      name,
      hostId,
      host: hostName,
      ra: host.ra,
      dec: host.dec,
      distPc: host.distPc,
      method: str('method') ?? 'Unknown',
      year: num('year'),
      facility: str('facility'),
      periodDays: per,
      aAu: a,
      ecc: Math.min(0.97, Math.max(0, num('e') ?? 0)),
      incDeg: num('inc'),
      omegaDeg: num('w') ?? 90,
      radiusEarth: radius,
      massEarth: mass,
      teqK: num('teq'),
      insolation: insol,
      sizeClass: sizeClassOf(radius ?? 1, per),
      inHabitableZone: host.hz !== null && a !== null && a >= host.hz[0] && a <= host.hz[1],
      inOptimisticHz: host.hzOptimistic !== null && a !== null && a >= host.hzOptimistic[0] && a <= host.hzOptimistic[1],
      esi: radius !== null && insol !== null ? earthSimilarity(radius, insol) : null,
    };
    host.planets.push(p);
    planets.push(p);
  }
  for (const h of hosts.values()) h.planets.sort((x, y) => (x.aAu ?? Infinity) - (y.aAu ?? Infinity));
  return { hosts: [...hosts.values()], planets, retrieved: doc.retrieved, acknowledgement: doc.acknowledgement };
}

export async function loadExoplanets(url: string): Promise<ExoplanetCatalog | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseExoplanets((await res.json()) as Snapshot);
  } catch {
    return null;
  }
}

/** Curated notes on famous systems (by host name), shown before the generated facts. */
export const FAMOUS_SYSTEMS: Record<string, string[]> = {
  'TRAPPIST-1': [
    'Seven Earth-sized planets orbit this ultracool dwarf, all closer to it than Mercury is to the Sun.',
    'Three or four of them lie in the habitable zone; JWST is measuring whether they keep atmospheres.',
    'The planets are locked in a chain of orbital resonances, so their orbits fit together like a musical chord.',
  ],
  'Proxima Cen': ['The nearest star to the Sun hosts the nearest known exoplanet, Proxima b, in its habitable zone.', 'Proxima is a flare star, so its planets are bathed in strong ultraviolet and X-ray bursts.'],
  'Kepler-452': ['Kepler-452 b was announced in 2015 as an “Earth cousin”: a super-Earth on a 385-day orbit around a Sun-like star.'],
  '55 Cnc': ['55 Cancri e is a lava world: its dayside is hot enough to melt rock, and JWST has seen hints of an atmosphere.'],
  'HD 209458': ['HD 209458 b was the first exoplanet seen to transit its star (1999) and the first with a detected atmosphere.', 'It is losing hydrogen into a comet-like tail, earning it the nickname Osiris.'],
  'Kepler-16': ['Kepler-16 b orbits two stars at once, like Tatooine: the first such planet found by transits (2011).'],
  '51 Peg': ['51 Pegasi b was the first planet found around a Sun-like star (1995), earning a share of the 2019 Nobel Prize in Physics.'],
};

const METHOD_NOTE: Record<string, string> = {
  Transit: 'Found by the transit method: the star dims slightly each time the planet passes in front of it.',
  'Radial Velocity': 'Found by the radial-velocity method: the star wobbles toward and away from us as the planet tugs on it.',
  Imaging: 'Seen directly in images, with the star’s glare blocked out.',
  Microlensing: 'Found by gravitational microlensing: its gravity briefly magnified the light of a background star.',
  'Transit Timing Variations': 'Found from small shifts in the transit times of another planet in the system.',
};

/** 2-5 facts for a planet: curated ones for famous systems, then data-generated ones. */
export function planetFacts(p: Exoplanet, host: ExoHost): string[] {
  const facts = [...(FAMOUS_SYSTEMS[host.name] ?? [])].slice(0, 2);
  if (p.periodDays !== null) {
    const per = p.periodDays < 2 ? `${(p.periodDays * 24).toFixed(1)} hours` : p.periodDays < 1000 ? `${p.periodDays.toFixed(p.periodDays < 20 ? 2 : 0)} days` : `${(p.periodDays / 365.25).toFixed(1)} years`;
    facts.push(`One year here lasts ${per}.`);
  }
  if (p.teqK !== null) {
    const c = Math.round(p.teqK - 273);
    facts.push(
      p.teqK > 1000
        ? `At an equilibrium temperature of ~${Math.round(p.teqK)} K (${c} °C), rock could be molten.`
        : p.teqK < 200
          ? `At ~${Math.round(p.teqK)} K (${c} °C) it would be colder than Antarctica in winter.`
          : `Its equilibrium temperature is ~${Math.round(p.teqK)} K (${c} °C), before any greenhouse warming.`,
    );
  }
  if (p.inHabitableZone) facts.push('It orbits within its star’s conservative habitable zone, where liquid water could exist on a suitable surface.');
  else if (p.inOptimisticHz) facts.push('It lies in the optimistic habitable zone, near its edge: whether it could hold liquid water depends on its atmosphere.');
  const m = METHOD_NOTE[p.method];
  if (m && facts.length < 5) facts.push(`${m}${p.year ? ` (${p.year})` : ''}`);
  return facts.slice(0, 5);
}
