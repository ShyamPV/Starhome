/**
 * Physical data for Solar System bodies (NASA Planetary Fact Sheets; IAU WGCCRE 2015
 * rotation models) and their major moons (JPL Planetary Satellite Mean Elements and
 * physical parameters). Surface maps: Solar System Scope (CC BY 4.0), where available;
 * other bodies are drawn in a display colour.
 */
import type { GalileanId, PlanetId, MoonOrbitElements } from '@starhome/astro';
import moonElements from './moonElements.json';

export interface BodyInfo {
  id: PlanetId | 'sun' | 'moon';
  name: string;
  kind: 'star' | 'planet' | 'dwarf-planet' | 'moon';
  /** Mean radius, km. */
  radiusKm: number;
  /** Sidereal rotation period, hours (negative = retrograde). */
  rotationHours: number;
  /** North pole, ICRS RA/Dec degrees. */
  poleRa: number;
  poleDec: number;
  /** IAU prime meridian: W = w0 + wDot * days since J2000 (degrees). */
  w0: number;
  wDot: number;
  color: string;
  /** Surface map in public/textures, if one exists. */
  texture?: string;
  ring?: { innerKm: number; outerKm: number; color: string; texture?: string };
  facts: string[];
}

export interface SatelliteInfo {
  id: string;
  name: string;
  parent: PlanetId;
  /** Mean radius, km. */
  radiusKm: number;
  color: string;
  /** Fitted mean orbital elements (with their error against JPL), or a Galilean moon computed by astronomy-engine. */
  orbit: (MoonOrbitElements & { rmsErrorDeg: number; maxErrorDeg: number }) | GalileanId;
  facts: string[];
}

export const SUN: BodyInfo = {
  id: 'sun',
  name: 'Sun',
  kind: 'star',
  radiusKm: 695_700,
  rotationHours: 609.12,
  poleRa: 286.13,
  poleDec: 63.87,
  w0: 84.176,
  wDot: 14.1844,
  color: '#fff4e0',
  texture: 'sun.jpg',
  facts: [
    'A G2V main-sequence star about 4.6 billion years old.',
    'Orbits the Galactic centre at ~8.2 kpc, taking ~230 million years per lap.',
    'Holds 99.86% of the Solar System\'s mass.',
  ],
};

export const PLANETS: readonly BodyInfo[] = [
  { id: 'mercury', name: 'Mercury', kind: 'planet', radiusKm: 2439.7, rotationHours: 1407.6, poleRa: 281.01, poleDec: 61.41, w0: 329.5988, wDot: 6.1385108, texture: 'mercury.jpg', color: '#a8a39d', facts: ['Smallest planet; a day-night cycle lasts 176 Earth days.', 'Surface temperatures swing from -180 °C to 430 °C.'] },
  { id: 'venus', name: 'Venus', kind: 'planet', radiusKm: 6051.8, rotationHours: -5832.5, poleRa: 272.76, poleDec: 67.16, w0: 160.2, wDot: -1.4813688, texture: 'venus.jpg', color: '#e8d3a2', facts: ['Rotates backwards, more slowly than it orbits the Sun.', 'Its CO2 atmosphere makes it the hottest planet (~465 °C).'] },
  { id: 'earth', name: 'Earth', kind: 'planet', radiusKm: 6371.0, rotationHours: 23.9345, poleRa: 0, poleDec: 90, w0: 190.147, wDot: 360.9856235, texture: 'earth-day.jpg', color: '#4f86d9', facts: ['The only world known to host life.', 'Axial tilt of 23.44° drives the seasons.'] },
  { id: 'mars', name: 'Mars', kind: 'planet', radiusKm: 3389.5, rotationHours: 24.6229, poleRa: 317.68, poleDec: 52.89, w0: 176.049863, wDot: 350.891982443297, texture: 'mars.jpg', color: '#c1440e', facts: ['Home of Olympus Mons, the tallest volcano in the Solar System.', 'A Martian day (sol) lasts 24 h 39 min.'] },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', radiusKm: 69_911, rotationHours: 9.925, poleRa: 268.06, poleDec: 64.5, w0: 284.95, wDot: 870.536, texture: 'jupiter.jpg', color: '#d8b48a', facts: ['More than twice as massive as all other planets combined.', 'The Great Red Spot is a storm larger than Earth.'] },
  { id: 'saturn', name: 'Saturn', kind: 'planet', radiusKm: 58_232, rotationHours: 10.656, poleRa: 40.59, poleDec: 83.54, w0: 38.9, wDot: 810.7939024, texture: 'saturn.jpg', color: '#e3cf9c', ring: { innerKm: 74_500, outerKm: 140_220, color: '#cbb994', texture: 'saturn-ring.png' }, facts: ['Its main rings are ~280,000 km across but mostly only ~10 m thick.', 'Less dense than water on average.'] },
  { id: 'uranus', name: 'Uranus', kind: 'planet', radiusKm: 25_362, rotationHours: -17.24, poleRa: 257.31, poleDec: -15.18, w0: 203.81, wDot: -501.1600928, texture: 'uranus.jpg', color: '#9fd8e0', facts: ['Spins on its side with an axial tilt of ~98°.', 'Each pole gets ~42 years of continuous sunlight.'] },
  { id: 'neptune', name: 'Neptune', kind: 'planet', radiusKm: 24_622, rotationHours: 16.11, poleRa: 299.36, poleDec: 43.46, w0: 249.978, wDot: 541.1397757, texture: 'neptune.jpg', color: '#4b70dd', facts: ['Found in 1846 by mathematical prediction before it was seen.', 'Has the fastest winds measured in the Solar System (~2,100 km/h).'] },
  { id: 'pluto', name: 'Pluto', kind: 'dwarf-planet', radiusKm: 1188.3, rotationHours: -153.29, poleRa: 132.99, poleDec: -6.16, w0: 302.695, wDot: 56.3625225, color: '#c9b39b', facts: ['Reclassified as a dwarf planet in 2006.', 'Its heart-shaped Sputnik Planitia is a glacier of nitrogen ice.'] },
];

export const MOON: BodyInfo = {
  id: 'moon',
  name: 'Moon',
  kind: 'moon',
  radiusKm: 1737.4,
  rotationHours: 655.72,
  poleRa: 269.99,
  poleDec: 66.54,
  w0: 38.3213,
  wDot: 13.17635815,
  color: '#bdbab3',
  texture: 'moon.jpg',
  facts: ['Tidally locked: the same face always points at Earth.', 'Recedes from Earth by ~3.8 cm per year.'],
};

type FittedElements = MoonOrbitElements & { rmsErrorDeg: number; maxErrorDeg: number };
const FIT = (moonElements as unknown as { moons: Record<string, FittedElements> }).moons;
const fit = (id: string): FittedElements => FIT[id]!;

/** Where the moon orbits come from, for the citation line. */
export const MOON_ELEMENTS_SOURCE = moonElements.source;

/**
 * Major moons. Orbits: mean elements fitted to JPL's satellite ephemerides
 * (tools/build-moon-elements.mjs; the fit's error is kept with each moon), or the L1.2
 * theory for the Galilean moons. Radii: JPL Planetary Satellite Physical Parameters.
 * Colours are display approximations (no surface maps).
 */
// prettier-ignore
export const MOONS: readonly SatelliteInfo[] = [
  { id: 'phobos', name: 'Phobos', parent: 'mars', radiusKm: 11.08, color: '#6b5e55', orbit: fit('phobos'), facts: ['Orbits Mars three times a day, closer to its planet than any other known moon.', 'Tides are pulling it inward: in some tens of millions of years it will break up or crash.'] },
  { id: 'deimos', name: 'Deimos', parent: 'mars', radiusKm: 6.2, color: '#8a7d6e', orbit: fit('deimos'), facts: ['Only about 12 km across; from Mars it would look like a bright star.'] },
  { id: 'io', name: 'Io', parent: 'jupiter', radiusKm: 1821.6, color: '#d9c96b', orbit: 'io', facts: ['The most volcanically active world known, heated by tides from Jupiter.'] },
  { id: 'europa', name: 'Europa', parent: 'jupiter', radiusKm: 1560.8, color: '#c9bfa8', orbit: 'europa', facts: ['An ice shell over a global salt-water ocean: one of the best places to look for life.'] },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radiusKm: 2631.2, color: '#9c8f80', orbit: 'ganymede', facts: ['The largest moon in the Solar System, bigger than Mercury, with its own magnetic field.'] },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', radiusKm: 2410.3, color: '#6e655c', orbit: 'callisto', facts: ['One of the most heavily cratered surfaces in the Solar System.'] },
  { id: 'mimas', name: 'Mimas', parent: 'saturn', radiusKm: 198.2, color: '#bdbdbd', orbit: fit('mimas'), facts: ['Its giant crater Herschel is a third as wide as the moon itself.'] },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', radiusKm: 252.1, color: '#f3f6f8', orbit: fit('enceladus'), facts: ['Geysers at its south pole spray water from an ocean under the ice into space.'] },
  { id: 'tethys', name: 'Tethys', parent: 'saturn', radiusKm: 531.1, color: '#d8d8d4', orbit: fit('tethys'), facts: ['Almost pure water ice, scarred by the 400 km crater Odysseus.'] },
  { id: 'dione', name: 'Dione', parent: 'saturn', radiusKm: 561.4, color: '#c9c9c4', orbit: fit('dione'), facts: ['Bright ice cliffs streak its trailing hemisphere.'] },
  { id: 'rhea', name: 'Rhea', parent: 'saturn', radiusKm: 763.8, color: '#bfbcb5', orbit: fit('rhea'), facts: ['Saturn’s second-largest moon: an icy, heavily cratered world.'] },
  { id: 'titan', name: 'Titan', parent: 'saturn', radiusKm: 2574.7, color: '#d7a85a', orbit: fit('titan'), facts: ['The only moon with a thick atmosphere; lakes of liquid methane and ethane lie on its surface.', 'The Huygens probe landed there in 2005.'] },
  { id: 'iapetus', name: 'Iapetus', parent: 'saturn', radiusKm: 734.5, color: '#8d8577', orbit: fit('iapetus'), facts: ['Two-toned: one hemisphere is as dark as coal, the other as bright as snow.'] },
  { id: 'miranda', name: 'Miranda', parent: 'uranus', radiusKm: 235.8, color: '#a9a9a9', orbit: fit('miranda'), facts: ['A patchwork surface with cliffs up to 20 km high.'] },
  { id: 'ariel', name: 'Ariel', parent: 'uranus', radiusKm: 578.9, color: '#b5b2ac', orbit: fit('ariel'), facts: ['The brightest of Uranus’ large moons, crossed by long rift valleys.'] },
  { id: 'umbriel', name: 'Umbriel', parent: 'uranus', radiusKm: 584.7, color: '#6e6c6a', orbit: fit('umbriel'), facts: ['The darkest of Uranus’ large moons.'] },
  { id: 'titania', name: 'Titania', parent: 'uranus', radiusKm: 788.9, color: '#a59e95', orbit: fit('titania'), facts: ['The largest moon of Uranus.'] },
  { id: 'oberon', name: 'Oberon', parent: 'uranus', radiusKm: 761.4, color: '#8f857c', orbit: fit('oberon'), facts: ['The outermost of Uranus’ large moons, old and heavily cratered.'] },
  { id: 'triton', name: 'Triton', parent: 'neptune', radiusKm: 1353.4, color: '#d6c9c0', orbit: fit('triton'), facts: ['Orbits backwards: probably a dwarf planet captured from the Kuiper Belt.', 'Voyager 2 saw nitrogen geysers on its surface in 1989.'] },
  { id: 'charon', name: 'Charon', parent: 'pluto', radiusKm: 606.0, color: '#9a9089', orbit: fit('charon'), facts: ['Half Pluto’s size; the two are locked face to face, each always showing the other the same side.'] },
];
