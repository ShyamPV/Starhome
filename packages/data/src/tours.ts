/**
 * Guided tours and the "most extreme" list. Each stop names a target id (a named star,
 * nebula, cluster, compact object, spiral-arm label or exoplanet host) and a short
 * narration. The nearest-exoplanets tour is built from the archive snapshot, so it
 * stays right when the catalogue is refreshed.
 */
import { FAMOUS_SYSTEMS, type ExoplanetCatalog, type SizeClass } from './exoplanets';

const PLANET_NOUN: Record<SizeClass, string> = {
  rocky: 'a rocky planet',
  'super-earth': 'a super-Earth',
  'neptune-like': 'a Neptune-like planet',
  'gas-giant': 'a gas giant',
  'hot-jupiter': 'a hot Jupiter',
};

/** "an 11.2-day", "an 8-day", "an 18,000-day", but "a 110-day" and "a 20-day". */
export const indefiniteArticle = (n: string) => (/^(8|1[18](,\d{3})*(?![\d,]))/.test(n) ? 'an' : 'a');

export interface TourStop {
  /** Target id to fly to. */
  id: string;
  title: string;
  text: string;
  /** Seconds to stay once there (default: by reading time). */
  dwellS?: number;
  /** Camera distance on arrival, km, when the object's own close-up isn't the view the narration needs. */
  viewDistanceKm?: number;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  stops: TourStop[];
}

/** Superlatives, in tour order: the first ten are the "Top 10 extreme stars" tour. */
export const EXTREMES: readonly (TourStop & { short: string })[] = [
  {
    id: 'proxima',
    short: 'Closest star',
    title: 'The closest star: Proxima Centauri',
    text: 'At 1.30 pc (4.2 light-years), the nearest star to the Sun. A small red dwarf, far too faint to see without a telescope, with a planet in its habitable zone.',
  },
  {
    id: 'barnards-star',
    short: 'Fastest across our sky',
    title: 'Fastest across our sky: Barnard’s Star',
    text: 'It moves 10.4 arcseconds a year against the background stars: the width of the full Moon in about 180 years. Its speed and closeness both contribute.',
  },
  {
    id: 'trappist-1',
    short: 'One of the smallest stars',
    title: 'One of the smallest stars: TRAPPIST-1',
    text: 'Barely larger than Jupiter and about 9% of the Sun’s mass, this ultracool dwarf still holds seven Earth-sized planets on orbits tighter than Mercury’s.',
  },
  {
    id: 'sirius-b',
    short: 'Densest star in a small telescope',
    title: 'Crushed matter: Sirius B',
    text: 'A white dwarf with the Sun’s mass packed into a sphere smaller than the Earth. A teaspoonful of it would weigh about 12 tonnes.',
  },
  {
    id: 'betelgeuse',
    short: 'Supernova in waiting',
    title: 'A supernova in waiting: Betelgeuse',
    text: 'A red supergiant near the end of its life. Placed at the Sun it would reach beyond the orbit of Mars. It will explode, probably within the next 100,000 years.',
  },
  {
    id: 'vy-cma',
    short: 'One of the largest stars',
    title: 'One of the largest stars: VY Canis Majoris',
    text: 'About 1,400 times the Sun’s radius (Wittkowski et al. 2012): at the Sun’s place it would swallow Jupiter’s orbit. It is shedding its outer layers into a dusty cloud.',
  },
  {
    id: 'eta-carinae',
    short: 'Among the most luminous',
    title: 'Among the most luminous: Eta Carinae',
    text: 'A pair of very massive stars shining with about five million Suns. In its Great Eruption of the 1840s it briefly became the second-brightest star in the sky.',
  },
  {
    id: 'crab-pulsar',
    short: 'Spins 30 times a second',
    title: 'A spinning city: the Crab Pulsar',
    text: 'A neutron star about 20 km across, spinning 30 times a second. It was born in the supernova Chinese astronomers recorded in 1054.',
  },
  {
    id: 'sgr-1806',
    short: 'Strongest magnetic field',
    title: 'The strongest magnet: SGR 1806−20',
    text: 'A magnetar, with the strongest magnetic field known. Its giant flare of December 2004 disturbed the Earth’s ionosphere from the far side of the Galaxy’s disc.',
  },
  {
    id: 'gaia-bh3',
    short: 'Heaviest stellar black hole',
    title: 'The heaviest stellar black hole: Gaia BH3',
    text: 'About 33 times the Sun’s mass, the most massive black hole known that formed from a single star in the Milky Way. Found in 2024 from the wobble of its companion.',
  },
  {
    id: 'sgr-a-star',
    short: 'Most massive object in the Galaxy',
    title: 'The Galaxy’s heart: Sagittarius A*',
    text: 'A supermassive black hole of 4.3 million Suns, imaged by the Event Horizon Telescope in 2022.',
  },
  {
    id: 'ngc-5139',
    short: 'Largest globular cluster',
    title: 'Omega Centauri',
    text: 'The largest and brightest globular cluster, with millions of stars; it may be the core of a small galaxy the Milky Way swallowed.',
  },
  {
    id: 'gaia-bh1',
    short: 'Nearest known black hole',
    title: 'Gaia BH1',
    text: 'The nearest known black hole, found in 2022 from the wobble of its Sun-like companion in Gaia data.',
  },
  {
    id: 'psr-b1919',
    short: 'First pulsar discovered',
    title: 'PSR B1919+21',
    text: 'The first pulsar ever discovered, by Jocelyn Bell Burnell and Antony Hewish in 1967.',
  },
  {
    id: 'tarantula',
    short: 'Most luminous star-forming region nearby',
    title: 'Tarantula Nebula',
    text: 'The most luminous star-forming region in the Local Group, in the Large Magellanic Cloud.',
  },
];

export const TOURS: readonly Tour[] = [
  {
    id: 'galactic-centre',
    title: 'Journey to the galactic centre',
    summary: 'From the Sun across the spiral arms to the black hole at the heart of the Milky Way.',
    stops: [
      {
        id: 'sun',
        title: 'Home',
        // The planetary system rather than the solar disc: 40 AU.
        viewDistanceKm: 40 * 149_597_870.7,
        text: 'We start at the Sun, 8.2 kpc (about 26,700 light-years) from the centre of the Milky Way. Ahead, toward Sagittarius, lies the heart of the Galaxy.',
      },
      {
        id: 'arm-orion-spur-local-arm',
        title: 'The Orion Spur',
        text: 'The Sun lies in this short arm segment between two larger arms. Its young stars and star-forming clouds, like the Orion Nebula, were mapped from maser parallaxes.',
      },
      {
        id: 'm8',
        title: 'The Sagittarius-Carina Arm',
        text: 'The first major arm toward the centre. The Lagoon Nebula is one of its star-forming regions, bright enough to see with the naked eye from a dark site.',
      },
      {
        id: 'arm-scutum-centaurus-arm',
        title: 'The Scutum-Centaurus Arm',
        text: 'With the Perseus Arm, one of the two major arms that carry old stars as well as young ones; infrared surveys see it as a clear excess of stars.',
      },
      {
        id: 'arm-norma-arm',
        title: 'The Norma Arm',
        text: 'The innermost major arm, wrapping close to the ends of the central bar. From the Sun its light is heavily dimmed by dust.',
      },
      {
        id: 'galactic-bar',
        title: 'The bar and bulge',
        text: 'Old stars in a bar about 10 kpc long, which puffs up into a boxy, peanut-shaped bulge. Seen from the Sun, dust dims its visible light more than a billion times; we see it in infrared, radio and X-rays.',
      },
      {
        id: 'sgr-a-star',
        title: 'Sagittarius A*',
        text: 'The supermassive black hole at the very centre: 4.3 million solar masses. The star S2 orbits it every 16 years, which is how its mass was weighed.',
      },
    ],
  },
  {
    id: 'great-nebulae',
    title: 'Tour of the great nebulae',
    summary: 'Star nurseries, dark clouds, dying stars and supernova remnants, flown through in 3D.',
    stops: [
      {
        id: 'm42',
        title: 'Orion Nebula',
        text: 'The nearest region of massive star formation, lit by the young Trapezium stars at its heart. Fly through: it is a bright blister on the face of a dark cloud.',
      },
      {
        id: 'horsehead',
        title: 'Horsehead Nebula',
        text: 'A dark nebula: a pillar of dust in silhouette against glowing hydrogen, part of the same Orion cloud complex.',
      },
      {
        id: 'rosette',
        title: 'Rosette Nebula',
        text: 'Winds from the young cluster at its centre have blown a hole in this shell of glowing gas.',
      },
      {
        id: 'm1',
        title: 'Crab Nebula',
        text: 'A supernova remnant: the wreck of a star that exploded in 1054. The pulsar at its centre still powers its blue-white glow.',
      },
      {
        id: 'veil',
        title: 'Veil Nebula',
        text: 'An older supernova remnant: the shock wave of an explosion 10,000 to 20,000 years ago, now spread across six full Moons of sky.',
      },
      {
        id: 'm57',
        title: 'Ring Nebula',
        text: 'A planetary nebula: the shed layers of a dying Sun-like star. It is a barrel we happen to see end-on.',
      },
      {
        id: 'm16',
        title: 'Eagle Nebula',
        text: 'Home of the Pillars of Creation: columns of cold gas being worn away by ultraviolet light from a young cluster.',
      },
      {
        id: 'm8',
        title: 'Lagoon Nebula',
        text: 'A star-forming region toward the Galactic centre, named for the dark lane of dust that crosses it.',
      },
      {
        id: 'carina-nebula',
        title: 'Carina Nebula',
        text: 'One of the largest and brightest star-forming regions in the Galaxy, home to the eruptive giant Eta Carinae.',
      },
      {
        id: 'helix',
        title: 'Helix Nebula',
        text: 'One of the nearest planetary nebulae. This is the fate of the Sun, about five billion years from now.',
      },
    ],
  },
  {
    id: 'extreme-stars',
    title: 'Top 10 extreme stars',
    summary: 'The closest, smallest, densest, largest, most magnetic and most massive.',
    stops: EXTREMES.slice(0, 10).map(({ id, title, text }) => ({ id, title, text })),
  },
];

/** Title of the tour built from the exoplanet catalogue. */
export const CLOSEST_EXOPLANETS_TOUR = { id: 'closest-exoplanets', title: 'Closest exoplanets', summary: 'The nearest planetary systems to the Sun, from the NASA Exoplanet Archive.' } as const;

/** The nearest planetary systems, nearest first. Stop ids are archive host ids. */
export function closestExoplanetsTour(catalog: ExoplanetCatalog, n = 7): Tour {
  const hosts = catalog.hosts
    .filter((h) => h.distPc !== null && h.planets.length > 0)
    .sort((a, b) => a.distPc! - b.distPc!)
    .slice(0, n);
  return {
    ...CLOSEST_EXOPLANETS_TOUR,
    stops: hosts.map((h) => {
      const d = h.distPc!;
      const k = h.planets.length;
      const cls = h.spectralType?.match(/^[OBAFGKM]/)?.[0];
      const star = cls ? `${'AFMO'.includes(cls) ? 'an' : 'a'} ${cls}-type star` : 'a star';
      const intro = `${d.toFixed(2)} pc (${(d * 3.26156).toFixed(1)} light-years) away: ${star} with ${k} known planet${k > 1 ? 's' : ''}.`;
      const famous = FAMOUS_SYSTEMS[h.name]?.[0];
      // Otherwise describe its most habitable (or else its first) planet.
      const p = h.planets.find((x) => x.inHabitableZone) ?? h.planets.find((x) => x.inOptimisticHz) ?? h.planets[0]!;
      const where = p.inHabitableZone ? ', in the habitable zone' : p.inOptimisticHz ? ', at the edge of the habitable zone' : '';
      const days = p.periodDays === null ? null : p.periodDays < 100 ? p.periodDays.toFixed(1) : Math.round(p.periodDays).toLocaleString('en-US');
      const orbit = days !== null ? ` on ${indefiniteArticle(days)} ${days}-day orbit` : '';
      const found = p.year ? ` Found in ${p.year} by ${p.method.toLowerCase()}.` : '';
      const planet = `${p.name} is ${PLANET_NOUN[p.sizeClass]}${orbit}${where}.${found}`;
      return { id: h.id, title: h.name, text: `${intro} ${famous ?? planet}` };
    }),
  };
}
