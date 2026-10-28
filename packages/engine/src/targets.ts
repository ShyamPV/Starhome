import { KM_PER_AU, KM_PER_KPC, KM_PER_PC, absoluteMagnitude, bvToTeff, raDecDistToGalactocentric, spectralClassFromTeff, type Vec3 } from '@starhome/astro';
import { GLOBULAR_CLUSTERS, MOON, NAMED_STARS, PLANETS, SUN } from '@starhome/data';
import { SATELLITES, SPIRAL_ARMS, armRadius, isModeledArmSegment, xyFromRBeta } from '@starhome/galaxy';
import { Vector3 } from 'three';
import { galPcToWorldKm } from './frames';
import type { SolarSystem } from './solarSystem';

export type TargetKind = 'star' | 'planet' | 'dwarf-planet' | 'moon' | 'black-hole' | 'cluster' | 'galaxy' | 'region';

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
  /** Fixed Galactocentric position (pc) for objects outside the Solar System. */
  galPc?: Vec3;
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
    const galPc = raDecDistToGalactocentric(s.ra, s.dec, s.distPc);
    const world = galPcToWorldKm(galPc);
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
      galPc,
    });
  }

  for (const c of GLOBULAR_CLUSTERS) {
    const galPc = raDecDistToGalactocentric(c.ra, c.dec, c.distKpc * 1000);
    const ly = Math.round(c.distKpc * 3261.56).toLocaleString('en-US');
    const details: Record<string, string> = {
      Designation: c.alt && c.name !== c.designation ? `${c.designation} · ${c.alt}` : c.designation,
      Distance: `${c.distKpc} kpc (${ly} ly)`,
      'Absolute mag (V)': c.absMagEstimated ? `≈ ${c.absMagV.toFixed(1)} (estimated)` : c.absMagV.toFixed(2),
    };
    if (c.vt != null) details['Apparent mag (V)'] = c.vt.toFixed(2);
    if (c.feH != null) details['Metallicity [Fe/H]'] = c.feH.toFixed(2);
    details['Half-light radius'] = c.rhArcmin != null ? `${c.rhPc.toFixed(1)} pc (${c.rhArcmin}′)` : 'unknown';
    if (c.concentration != null) details['King concentration'] = `${c.concentration.toFixed(2)}${c.coreCollapsed ? ' (core-collapsed)' : ''}`;
    if (c.ebv != null) details['E(B−V) measured'] = `${c.ebv.toFixed(2)} (A_V ≈ ${(3.1 * c.ebv).toFixed(1)})`;
    details['RA / Dec'] = `${c.ra.toFixed(3)}°, ${c.dec.toFixed(3)}°`;
    details['Galactic l, b'] = `${c.l.toFixed(2)}°, ${c.b.toFixed(2)}°`;
    // Famous clusters are labelled across the Galaxy, bright ones nearby, the rest only up close.
    const labelKpc = c.facts.length > 0 ? 25 : c.absMagV < -8.5 ? 6 : 0.8;
    targets.push({
      id: c.id,
      name: c.name,
      kind: 'cluster',
      subtitle: c.name === c.designation ? 'Globular cluster' : `Globular cluster · ${c.designation}`,
      position: fixed(galPcToWorldKm(galPc)),
      radiusKm: c.rhPc * KM_PER_PC,
      viewDistanceKm: Math.max(15, c.rhPc * 6) * KM_PER_PC,
      provenance: 'catalog',
      facts: [
        ...c.facts,
        'Position, distance, brightness and size are from the Harris catalogue; the individual stars drawn up close are modeled from them.',
      ],
      details,
      labelRange: labelKpc * KM_PER_KPC,
      galPc,
    });
  }

  // Spiral-arm labels at a representative point on each arm (Reid et al. 2019 fits).
  const armLabels: { armId: string; name: string; beta: number }[] = [
    { armId: 'perseus', name: 'Perseus Arm', beta: 40 },
    { armId: 'sagittarius-carina', name: 'Sagittarius-Carina Arm', beta: 24 },
    { armId: 'scutum-centaurus', name: 'Scutum-Centaurus Arm', beta: 23 },
    { armId: 'norma-outer', name: 'Norma Arm', beta: 18 },
    { armId: 'norma-outer', name: 'Outer Arm', beta: 18 - 360 },
    { armId: 'local', name: 'Orion Spur (Local Arm)', beta: 9 },
  ];
  for (const a of armLabels) {
    const arm = SPIRAL_ARMS.find((s) => s.id === a.armId)!;
    const r = armRadius(arm, a.beta);
    const [x, y] = xyFromRBeta(r, a.beta);
    const galPc: Vec3 = [x * 1000, y * 1000, 0];
    targets.push({
      id: `arm-${a.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`,
      name: a.name,
      kind: 'region',
      subtitle: 'Spiral arm',
      position: fixed(galPcToWorldKm(galPc)),
      radiusKm: 1.2 * KM_PER_KPC,
      viewDistanceKm: 7 * KM_PER_KPC,
      pitch: 1.0,
      provenance: 'model',
      facts: [
        `Log-spiral fit to maser parallaxes (Reid et al. 2019), measured between Galactocentric azimuths ${arm.measured[0]}° and ${arm.measured[1]}°.`,
        isModeledArmSegment(arm, a.beta) ? 'This part of the arm lies outside the measured range and is extrapolated.' : 'Beyond the measured range the arm is extrapolated and marked as modeled.',
      ],
      details: {
        'Radius here': `${r.toFixed(2)} kpc from the centre`,
        'Pitch angle': arm.pitchBelow === arm.pitchAbove ? `${arm.pitchBelow}°` : `${arm.pitchBelow}° / ${arm.pitchAbove}° (kink at ${arm.betaKink}°)`,
        Width: `${Math.round(arm.width * 1000)} pc`,
      },
      labelRange: 200 * KM_PER_KPC,
      galPc,
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
