/**
 * Physical data for Solar System bodies (NASA Planetary Fact Sheets; IAU WGCCRE 2015
 * pole orientations). Colours are display approximations until real textures are added.
 */
import type { PlanetId } from '@vialactea/astro';

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
  color: string;
  ring?: { innerKm: number; outerKm: number; color: string };
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
  color: '#fff4e0',
  facts: [
    'A G2V main-sequence star about 4.6 billion years old.',
    'Orbits the Galactic centre at ~8.2 kpc, taking ~230 million years per lap.',
    'Holds 99.86% of the Solar System\'s mass.',
  ],
};

export const PLANETS: readonly BodyInfo[] = [
  { id: 'mercury', name: 'Mercury', kind: 'planet', radiusKm: 2439.7, rotationHours: 1407.6, poleRa: 281.01, poleDec: 61.41, color: '#a8a39d', facts: ['Smallest planet; a day-night cycle lasts 176 Earth days.', 'Surface temperatures swing from -180 °C to 430 °C.'] },
  { id: 'venus', name: 'Venus', kind: 'planet', radiusKm: 6051.8, rotationHours: -5832.5, poleRa: 272.76, poleDec: 67.16, color: '#e8d3a2', facts: ['Rotates backwards, more slowly than it orbits the Sun.', 'Its CO2 atmosphere makes it the hottest planet (~465 °C).'] },
  { id: 'earth', name: 'Earth', kind: 'planet', radiusKm: 6371.0, rotationHours: 23.9345, poleRa: 0, poleDec: 90, color: '#4f86d9', facts: ['The only world known to host life.', 'Axial tilt of 23.44° drives the seasons.'] },
  { id: 'mars', name: 'Mars', kind: 'planet', radiusKm: 3389.5, rotationHours: 24.6229, poleRa: 317.68, poleDec: 52.89, color: '#c1440e', facts: ['Home of Olympus Mons, the tallest volcano in the Solar System.', 'A Martian day (sol) lasts 24 h 39 min.'] },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', radiusKm: 69_911, rotationHours: 9.925, poleRa: 268.06, poleDec: 64.5, color: '#d8b48a', facts: ['More than twice as massive as all other planets combined.', 'The Great Red Spot is a storm larger than Earth.'] },
  { id: 'saturn', name: 'Saturn', kind: 'planet', radiusKm: 58_232, rotationHours: 10.656, poleRa: 40.59, poleDec: 83.54, color: '#e3cf9c', ring: { innerKm: 74_500, outerKm: 140_220, color: '#cbb994' }, facts: ['Its main rings are ~280,000 km across but mostly only ~10 m thick.', 'Less dense than water on average.'] },
  { id: 'uranus', name: 'Uranus', kind: 'planet', radiusKm: 25_362, rotationHours: -17.24, poleRa: 257.31, poleDec: -15.18, color: '#9fd8e0', facts: ['Spins on its side with an axial tilt of ~98°.', 'Each pole gets ~42 years of continuous sunlight.'] },
  { id: 'neptune', name: 'Neptune', kind: 'planet', radiusKm: 24_622, rotationHours: 16.11, poleRa: 299.36, poleDec: 43.46, color: '#4b70dd', facts: ['Found in 1846 by mathematical prediction before it was seen.', 'Has the fastest winds measured in the Solar System (~2,100 km/h).'] },
  { id: 'pluto', name: 'Pluto', kind: 'dwarf-planet', radiusKm: 1188.3, rotationHours: -153.29, poleRa: 132.99, poleDec: -6.16, color: '#c9b39b', facts: ['Reclassified as a dwarf planet in 2006.', 'Its heart-shaped Sputnik Planitia is a glacier of nitrogen ice.'] },
];

export const MOON: BodyInfo = {
  id: 'moon',
  name: 'Moon',
  kind: 'moon',
  radiusKm: 1737.4,
  rotationHours: 655.72,
  poleRa: 269.99,
  poleDec: 66.54,
  color: '#bdbab3',
  facts: ['Tidally locked: the same face always points at Earth.', 'Recedes from Earth by ~3.8 cm per year.'],
};
