import { KM_PER_AU, KM_PER_KPC, KM_PER_PC, SUN_GALACTOCENTRIC_PC, absoluteMagnitude, raDecDistToGalactocentric, starPhysics, type LifeStage, type Vec3 } from '@starhome/astro';
import { COMPACT_OBJECTS, GLOBULAR_CLUSTERS, MOON, NAMED_STARS, PLANETS, SUN, type NamedStar } from '@starhome/data';
import { NEBULAE, SATELLITES, SPIRAL_ARMS, armRadius, isModeledArmSegment, xyFromRBeta } from '@starhome/galaxy';
import { Vector3 } from 'three';
import { galPcToWorldKm } from './frames';
import type { SolarSystem } from './solarSystem';

export type TargetKind =
  | 'star'
  | 'planet'
  | 'dwarf-planet'
  | 'moon'
  | 'exoplanet'
  | 'black-hole'
  | 'neutron-star'
  | 'cluster'
  | 'nebula'
  | 'galaxy'
  | 'region';

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
  /** Arrive looking from this direction (render frame, target to camera), e.g. from the Sun. */
  approachFrom?: Vector3;
  /** Real data vs. modelled. */
  provenance: 'catalog' | 'ephemeris' | 'model';
  /** Where the data comes from, for the citation line. */
  source: string;
  facts: string[];
  details: Record<string, string>;
  /** Show a label only when the camera is closer than this, km. */
  labelRange: number;
  /** Fixed Galactocentric position (pc) for objects outside the Solar System. */
  galPc?: Vec3;
  /** Apparent V magnitude from Earth, for objects outside the Solar System. */
  apparentMag?: number;
  /** Invisible to the eye whatever its brightness (hidden behind dust). */
  obscured?: boolean;
  /** Catalogue star: physical parameters are derived (with modeled extinction) for the details. */
  star?: NamedStar;
}

const SOLAR_SYSTEM_SOURCE = 'Positions: astronomy-engine (VSOP87, lunar theory). Physical data: NASA Planetary Fact Sheets.';
const SGR_A_STAR_RS_KM = 1.27e7; // Schwarzschild radius for 4.3e6 M_sun

export const STAGE_LABEL: Record<LifeStage, string> = {
  'main sequence': 'Main sequence',
  subgiant: 'Subgiant',
  giant: 'Giant',
  'bright giant': 'Bright giant',
  supergiant: 'Supergiant',
  hypergiant: 'Hypergiant',
  'white dwarf': 'White dwarf',
  'luminous blue variable': 'Luminous blue variable',
  'brown dwarf': 'Brown dwarf',
};

function sig(v: number, digits = 3): string {
  if (v >= 1e5) return v.toExponential(1).replace('e+', ' × 10^');
  if (v < 0.01) return v.toPrecision(2);
  return Number(v.toPrecision(digits)).toLocaleString('en-US');
}

/** Physical parameters of a catalogue star, corrected for modeled extinction when known. */
export function starPhysicsDetails(s: NamedStar, avMag: number | null): Record<string, string> {
  const p = starPhysics(s.vmag, s.distPc, s.bv, s.spectralType, avMag ?? 0);
  const out: Record<string, string> = {
    'Temperature (est.)': `${(Math.round(p.teffK / 50) * 50).toLocaleString('en-US')} K`,
    'Luminosity (est.)': `${sig(p.lumSun)} L☉`,
    'Radius (est.)': p.radiusSun < 0.05 ? `${Math.round(p.radiusSun * 695_700).toLocaleString('en-US')} km` : `${sig(p.radiusSun)} R☉`,
  };
  if (p.massSun !== null) out['Mass (est., main sequence)'] = `${sig(p.massSun, 2)} M☉`;
  out['Life stage'] = STAGE_LABEL[p.stage];
  return out;
}

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
    source: SOLAR_SYSTEM_SOURCE,
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
      source: SOLAR_SYSTEM_SOURCE,
      facts: info.facts,
      details: { Radius: `${info.radiusKm.toLocaleString('en-US')} km`, 'Rotation period': `${Math.abs(info.rotationHours).toFixed(2)} h${info.rotationHours < 0 ? ' (retrograde)' : ''}` },
      labelRange: info.id === 'moon' ? 0.05 * KM_PER_AU : 400 * KM_PER_AU,
    });
  }

  for (const s of NAMED_STARS) {
    const galPc = raDecDistToGalactocentric(s.ra, s.dec, s.distPc);
    const world = galPcToWorldKm(galPc);
    const phys = starPhysics(s.vmag, s.distPc, s.bv, s.spectralType);
    const absMag = absoluteMagnitude(s.vmag, s.distPc);
    const ly = (s.distPc * 3.26156).toFixed(s.distPc < 10 ? 2 : 0);
    targets.push({
      id: s.id,
      name: s.name,
      kind: 'star',
      subtitle: `${s.spectralType} · ${STAGE_LABEL[phys.stage]} · ${s.constellation}`,
      position: fixed(world),
      radiusKm: 695_700 * phys.radiusSun,
      viewDistanceKm: 2 * KM_PER_AU,
      provenance: 'catalog',
      source: 'SIMBAD and Hipparcos (van Leeuwen 2007). Temperature, size and mass derived on the Pecaut & Mamajek (2013) scale.',
      facts: s.note ? [s.note] : [],
      details: {
        Designation: s.designation,
        'Spectral type': s.spectralType,
        'Apparent mag (V)': s.vmag.toFixed(2),
        'Absolute mag (V)': absMag.toFixed(2),
        Distance: `${s.distPc} pc (${ly} ly)`,
        'RA / Dec': `${s.ra.toFixed(4)}°, ${s.dec.toFixed(4)}°`,
        Constellation: s.constellation,
      },
      labelRange: s.vmag < 1.5 ? 1500 * KM_PER_PC : 300 * KM_PER_PC,
      galPc,
      apparentMag: s.vmag,
      star: s,
    });
  }

  for (const c of COMPACT_OBJECTS) {
    const galPc = raDecDistToGalactocentric(c.ra, c.dec, c.distPc);
    const ly = Math.round(c.distPc * 3.26156).toLocaleString('en-US');
    const bh = c.kind === 'black-hole';
    targets.push({
      id: c.id,
      name: c.name,
      kind: bh ? 'black-hole' : 'neutron-star',
      subtitle: `${bh ? 'Stellar black hole' : c.kind === 'magnetar' ? 'Magnetar' : 'Pulsar'} · ${c.constellation}`,
      position: fixed(galPcToWorldKm(galPc)),
      radiusKm: bh ? 60 : 12,
      viewDistanceKm: 0.5 * KM_PER_AU,
      provenance: 'catalog',
      source: `Distance: ${c.distanceSource}. Position: SIMBAD.`,
      facts: c.facts,
      details: {
        Designation: c.designation,
        Type: bh ? 'Black hole in a binary' : c.kind === 'magnetar' ? 'Magnetar (neutron star)' : 'Pulsar (neutron star)',
        ...c.details,
        Distance: `${c.distPc.toLocaleString('en-US')} pc (${ly} ly)`,
        'Distance source': c.distanceSource,
        'RA / Dec': `${c.ra.toFixed(4)}°, ${c.dec.toFixed(4)}°`,
        'Life stage': bh ? 'Remnant of a massive star (black hole)' : 'Remnant of a massive star (neutron star)',
      },
      labelRange: 1.5 * KM_PER_KPC,
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
      source: 'Harris (1996; 2010 edition) catalogue of Milky Way globular clusters.',
      facts: [
        ...c.facts,
        'Position, distance, brightness and size are from the Harris catalogue; the individual stars drawn up close are modeled from them.',
      ],
      details,
      labelRange: labelKpc * KM_PER_KPC,
      galPc,
      apparentMag: c.vt ?? undefined,
    });
  }

  const NEBULA_KIND: Record<string, string> = {
    emission: 'Emission nebula',
    reflection: 'Reflection nebula',
    planetary: 'Planetary nebula',
    snr: 'Supernova remnant',
    dark: 'Dark nebula',
  };
  for (const n of NEBULAE) {
    const galPc = raDecDistToGalactocentric(n.ra, n.dec, n.distPc);
    const arcminPc = n.distPc * (Math.PI / 10_800);
    const sizePc = n.sizeArcmin.map((a) => a * arcminPc);
    const ly = Math.round(n.distPc * 3.26156).toLocaleString('en-US');
    const details: Record<string, string> = {
      Designation: n.designation,
      Type: NEBULA_KIND[n.kind]!,
      Distance: `${n.distPc.toLocaleString('en-US')} pc (${ly} ly)`,
      'Distance source': n.distanceSource,
      'Apparent size': `${n.sizeArcmin[0]}′ × ${n.sizeArcmin[1]}′`,
      'True size': sizePc[0]! >= 1 ? `${sizePc[0]!.toFixed(1)} × ${sizePc[1]!.toFixed(1)} pc` : `${(sizePc[0]! * 206_265).toFixed(0)} × ${(sizePc[1]! * 206_265).toFixed(0)} AU`,
    };
    if (n.vmag < 50) details['Apparent mag (V)'] = n.vmag.toFixed(1);
    details['RA / Dec'] = `${n.ra.toFixed(3)}°, ${n.dec.toFixed(3)}°`;
    targets.push({
      id: n.id,
      name: n.name,
      kind: 'nebula',
      subtitle: `${NEBULA_KIND[n.kind]} · ${n.designation}`,
      position: fixed(galPcToWorldKm(galPc)),
      radiusKm: 0.5 * sizePc[0]! * KM_PER_PC,
      viewDistanceKm: 2.2 * sizePc[0]! * KM_PER_PC,
      provenance: 'catalog',
      source: `Distance: ${n.distanceSource}. Size and position: SIMBAD; 3D structure modeled.`,
      facts: [
        ...n.facts,
        n.model
          ? 'Position, distance, size and brightness are measured; the 3D structure is modeled from its published shape.'
          : 'Drawn as the dust it is: it dims the stars and Milky Way behind it.',
      ],
      details,
      labelRange: 3 * KM_PER_KPC,
      galPc,
      apparentMag: n.vmag < 50 ? n.vmag : undefined,
      // Arrive on the Sun's side, so the first view matches the familiar one from Earth.
      approachFrom: galPcToWorldKm(SUN_GALACTOCENTRIC_PC).sub(galPcToWorldKm(galPc)).normalize(),
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
      source: 'Reid et al. 2019 (ApJ 885, 131), BeSSeL maser parallaxes.',
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
    source: 'GRAVITY Collaboration 2019; Event Horizon Telescope Collaboration 2022.',
    facts: [
      'About 4.3 million solar masses (GRAVITY Collaboration, Event Horizon Telescope).',
      'Imaged by the Event Horizon Telescope in 2022.',
      'The star S2 orbits it every 16 years, coming within ~120 AU.',
    ],
    details: { Mass: '4.3 × 10⁶ M☉', 'Schwarzschild radius': '1.27 × 10⁷ km (0.08 AU)', Distance: '8.18 kpc (26,700 ly)' },
    labelRange: 60 * KM_PER_KPC,
    obscured: true,
  });

  targets.push({
    id: 'galactic-bar',
    name: 'Galactic bar and bulge',
    kind: 'region',
    subtitle: 'Old stars at the centre of the Galaxy',
    position: fixed(new Vector3(0, 0, 0)),
    radiusKm: 2 * KM_PER_KPC,
    viewDistanceKm: 9 * KM_PER_KPC,
    pitch: 0.45,
    provenance: 'model',
    source: 'Starhome galaxy model; bar geometry after Wegg & Gerhard 2013 and Wegg et al. 2015.',
    facts: [
      'A bar about 10 kpc long, angled about 27° to the line from the Sun, puffed up into a boxy, peanut-shaped bulge.',
      'Its stars are mostly old (around 10 billion years) and rich in metals.',
    ],
    details: { Length: '≈ 10 kpc (long bar)', 'Angle to Sun–centre line': '≈ 27°', 'Distance from Sun': '8.18 kpc' },
    labelRange: 0,
    galPc: [0, 0, 0],
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
    source: 'Starhome galaxy model; arms from Reid et al. 2019, bar after Wegg & Gerhard 2013 and Wegg et al. 2015.',
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
      source: 'Distances: Pietrzyński et al. 2019, Graczyk et al. 2020. Luminosity: McConnachie 2012.',
      facts: [],
      details: { 'V-band luminosity': `${s.luminosity.toExponential(1)} L☉` },
      labelRange: 400 * KM_PER_KPC,
    });
  }

  return targets;
}
