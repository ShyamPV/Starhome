import { KM_PER_AU, KM_PER_KPC, KM_PER_PC, absoluteMagnitude, bvToTeff, raDecDistToGalactocentric, spectralClassFromTeff } from '@vialactea/astro';
import { NAMED_STARS, PLANETS, MOON, SUN } from '@vialactea/data';
import { SATELLITES } from '@vialactea/galaxy';
import { Vector3 } from 'three';
import { galPcToWorldKm } from './frames';
import type { SolarSystem } from './solarSystem';

export type TargetKind = 'star' | 'planet' | 'dwarf-planet' | 'moon' | 'black-hole' | 'galaxy' | 'region';

export interface Target {
  id: string;
  name: string;
  kind: TargetKind;
  /** Short subtitle, e.g. spectral type or "Satellite galaxy". */
  subtitle: string;
  /** Current double-precision world position, km. */
  position: () => Vector3;
  /** Physical radius for the arrival distance and zoom limit, km. */
  radiusKm: number;
  /** Comfortable viewing distance on arrival, km. */
  viewDistanceKm: number;
  /** Preferred camera pitch on arrival (radians), if any. */
  pitch?: number;
  /** Real data vs. modelled. */
  provenance: 'catalog' | 'ephemeris' | 'model';
  facts: string[];
  details: Record<string, string>;
  /** Show a label only when the camera is closer than this, km. */
  labelRange: number;
}

const SGR_A_STAR_RS_KM = 1.27e7; // Schwarzschild radius for 4.3e6 M_sun

export function buildTargets(ss: SolarSystem): Target[] {
  const targets: Target[] = [];
  const fixed = (v: Vector3) => () => v;

  const sun = ss.bodies.get('sun')!;
  targets.push({
    id: 'sun',
    name: 'Sun',
    kind: 'star',
    subtitle: 'G2V · our star',
    position: () => sun.world,
    radiusKm: SUN.radiusKm,
    viewDistanceKm: SUN.radiusKm * 8,
    provenance: 'ephemeris',
    facts: SUN.facts,
    details: { 'Spectral type': 'G2V', 'Radius': '695,700 km', 'Teff': '5,772 K', 'Distance to Galactic centre': '8.18 kpc' },
    labelRange: 300 * KM_PER_KPC,
  });

  for (const info of [...PLANETS, MOON]) {
    const body = ss.bodies.get(info.id)!;
    targets.push({
      id: info.id,
      name: info.name,
      kind: info.kind === 'moon' ? 'moon' : info.kind === 'dwarf-planet' ? 'dwarf-planet' : 'planet',
      subtitle: info.kind === 'moon' ? "Earth's moon" : info.kind === 'dwarf-planet' ? 'Dwarf planet' : 'Planet',
      position: () => body.world,
      radiusKm: info.radiusKm,
      viewDistanceKm: info.radiusKm * (info.ring ? 9 : 5),
      provenance: 'ephemeris',
      facts: info.facts,
      details: { Radius: `${info.radiusKm.toLocaleString('en-US')} km`, 'Rotation period': `${Math.abs(info.rotationHours).toFixed(2)} h${info.rotationHours < 0 ? ' (retrograde)' : ''}` },
      labelRange: info.id === 'moon' ? 0.05 * KM_PER_AU : 400 * KM_PER_AU,
    });
  }

  for (const s of NAMED_STARS) {
    const world = galPcToWorldKm(raDecDistToGalactocentric(s.ra, s.dec, s.distPc));
    const teff = bvToTeff(s.bv);
    const absMag = absoluteMagnitude(s.vmag, s.distPc);
    const ly = (s.distPc * 3.26156).toFixed(s.distPc < 10 ? 2 : 0);
    targets.push({
      id: s.id,
      name: s.name,
      kind: 'star',
      subtitle: `${s.spectralType} · ${s.constellation}`,
      position: fixed(world),
      // Rough radius from L and Teff, only for zoom limits.
      radiusKm: 695_700 * Math.max(0.1, Math.sqrt(10 ** (-0.4 * (absMag - 4.83))) * (5772 / teff) ** 2),
      viewDistanceKm: 2 * KM_PER_AU,
      provenance: 'catalog',
      facts: s.note ? [s.note] : [],
      details: {
        Designation: s.designation,
        'Spectral type': s.spectralType,
        'Apparent mag (V)': s.vmag.toFixed(2),
        'Absolute mag (V)': absMag.toFixed(2),
        Distance: `${s.distPc} pc (${ly} ly)`,
        'Teff (from B-V)': `${Math.round(teff / 10) * 10} K (class ${spectralClassFromTeff(teff)})`,
        'RA / Dec': `${s.ra.toFixed(4)}°, ${s.dec.toFixed(4)}°`,
        Constellation: s.constellation,
      },
      labelRange: s.vmag < 1.5 ? 1500 * KM_PER_PC : 300 * KM_PER_PC,
    });
  }

  targets.push({
    id: 'sgr-a-star',
    name: 'Sagittarius A*',
    kind: 'black-hole',
    subtitle: 'Supermassive black hole · Galactic centre',
    position: fixed(new Vector3(0, 0, 0)),
    radiusKm: SGR_A_STAR_RS_KM,
    viewDistanceKm: SGR_A_STAR_RS_KM * 40,
    provenance: 'catalog',
    facts: [
      'About 4.3 million solar masses (GRAVITY Collaboration, Event Horizon Telescope).',
      'Imaged by the Event Horizon Telescope in 2022.',
      'The star S2 orbits it every 16 years, coming within ~120 AU.',
    ],
    details: { Mass: '4.3 × 10⁶ M☉', 'Schwarzschild radius': '1.27 × 10⁷ km (0.08 AU)', Distance: '8.18 kpc (26,700 ly)' },
    labelRange: 60 * KM_PER_KPC,
  });

  targets.push({
    id: 'milky-way',
    name: 'Milky Way (overview)',
    kind: 'galaxy',
    subtitle: 'Barred spiral galaxy · seen from above',
    position: fixed(new Vector3(0, 0, 0)),
    radiusKm: 15 * KM_PER_KPC,
    viewDistanceKm: 55 * KM_PER_KPC,
    pitch: 1.2,
    provenance: 'model',
    facts: [
      'Contains an estimated 100-400 billion stars.',
      'The stellar disc is ~30 kpc across but only ~0.3 kpc thick.',
      'Its central bar is ~10 kpc long, tilted ~27° to the Sun-centre line.',
    ],
    details: { Type: 'SBbc barred spiral', 'Stellar mass': '~5 × 10¹⁰ M☉', 'Sun–centre distance': '8.18 kpc' },
    labelRange: 0,
  });

  for (const s of SATELLITES) {
    targets.push({
      id: s.id,
      name: s.name,
      kind: 'galaxy',
      subtitle: 'Satellite galaxy',
      position: fixed(galPcToWorldKm([s.center[0] * 1000, s.center[1] * 1000, s.center[2] * 1000])),
      radiusKm: s.radius * KM_PER_KPC,
      viewDistanceKm: s.radius * 5 * KM_PER_KPC,
      provenance: 'model',
      facts: [],
      details: { 'V-band luminosity': `${s.luminosity.toExponential(1)} L☉` },
      labelRange: 400 * KM_PER_KPC,
    });
  }

  return targets;
}
