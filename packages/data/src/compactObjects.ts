/**
 * Neutron stars and stellar black holes: famous pulsars, a magnetar and the best-known
 * black holes in binaries. Positions (J2000) and distances are rounded literature values;
 * the distance source is given for each. White dwarfs are in brightStars.ts.
 */
export type CompactKind = 'pulsar' | 'magnetar' | 'black-hole';

export interface CompactObject {
  id: string;
  name: string;
  designation: string;
  kind: CompactKind;
  ra: number;
  dec: number;
  distPc: number;
  distanceSource: string;
  constellation: string;
  details: Record<string, string>;
  facts: string[];
  /** What to draw up close: a neutron star (with pulsar beams), or a black hole with its companion. */
  closeUp: { beams: boolean } | { bhMassSun: number; companion: { radiusSun: number; teffK: number; sepAu: number; periodDays: number }; disk: boolean };
}

/*
 * Binary separations follow from Kepler's third law with the published periods and masses:
 * Cyg X-1 (Miller-Jones et al. 2021: 21.2 + 40.6 M☉, companion 22.3 R☉, 31,100 K),
 * V404 Cyg (9 + 0.7 M☉; K0 IV subgiant ~6 R☉, 4,300 K), Gaia BH1 (El-Badry et al. 2023:
 * 9.6 + 0.93 M☉, 1.4 AU), Gaia BH3 (Gaia Collaboration 2024: 32.7 + 0.76 M☉, ~16 AU).
 */

export const COMPACT_OBJECTS: readonly CompactObject[] = [
  {
    id: 'crab-pulsar',
    name: 'Crab Pulsar',
    designation: 'PSR B0531+21',
    kind: 'pulsar',
    ra: 83.6332,
    dec: 22.0145,
    distPc: 2000,
    distanceSource: 'Crab Nebula expansion (approx.)',
    constellation: 'Taurus',
    details: { 'Spin period': '33.7 ms', Mass: '≈ 1.4 M☉ (typical neutron star)', Radius: '≈ 10–12 km' },
    facts: ['The neutron star left by the supernova of 1054, spinning 30 times a second.', 'Its spin-down energy lights up the whole Crab Nebula.'],
    closeUp: { beams: true },
  },
  {
    id: 'vela-pulsar',
    name: 'Vela Pulsar',
    designation: 'PSR B0833−45',
    kind: 'pulsar',
    ra: 128.8359,
    dec: -45.1764,
    distPc: 287,
    distanceSource: 'VLBI parallax (Dodson et al. 2003)',
    constellation: 'Vela',
    details: { 'Spin period': '89 ms', Age: '≈ 11,000 years' },
    facts: ['One of the brightest pulsars in radio and gamma rays.', 'Famous for “glitches”: sudden spin-ups as its interior superfluid recouples to the crust.'],
    closeUp: { beams: true },
  },
  {
    id: 'psr-b1919',
    name: 'PSR B1919+21',
    designation: 'CP 1919',
    kind: 'pulsar',
    ra: 290.4367,
    dec: 21.884,
    distPc: 300,
    distanceSource: 'dispersion measure (approx.)',
    constellation: 'Vulpecula',
    details: { 'Spin period': '1.337 s' },
    facts: ['The first pulsar ever discovered, by Jocelyn Bell Burnell and Antony Hewish in 1967.', 'Its stacked pulse profiles became the cover of Joy Division’s album “Unknown Pleasures”.'],
    closeUp: { beams: true },
  },
  {
    id: 'sgr-1806',
    name: 'SGR 1806−20',
    designation: 'SGR 1806−20',
    kind: 'magnetar',
    ra: 272.1638,
    dec: -20.4111,
    distPc: 8700,
    distanceSource: 'host cluster (approx.)',
    constellation: 'Sagittarius',
    details: { 'Magnetic field': '≈ 10¹¹ T (10¹⁵ gauss)', 'Spin period': '7.5 s' },
    facts: ['A magnetar: a neutron star with the strongest magnetic field known.', 'Its giant flare of 27 December 2004 briefly outshone the full Moon in gamma rays and disturbed Earth’s ionosphere from 8.7 kpc away.'],
    closeUp: { beams: false },
  },
  {
    id: 'cyg-x1',
    name: 'Cygnus X-1',
    designation: 'V1357 Cyg · HDE 226868',
    kind: 'black-hole',
    ra: 299.5903,
    dec: 35.2016,
    distPc: 2220,
    distanceSource: 'VLBA parallax (Miller-Jones et al. 2021)',
    constellation: 'Cygnus',
    details: { 'Black-hole mass': '≈ 21 M☉', Companion: 'O9.7 Iab supergiant', 'Orbital period': '5.6 days' },
    facts: ['The first black hole widely accepted as one: an X-ray source discovered in 1964.', 'Subject of a famous 1974 bet between Stephen Hawking and Kip Thorne, which Hawking conceded in 1990.'],
    closeUp: { bhMassSun: 21.2, companion: { radiusSun: 22.3, teffK: 31_100, sepAu: 0.244, periodDays: 5.5998 }, disk: true },
  },
  {
    id: 'v404-cyg',
    name: 'V404 Cygni',
    designation: 'GS 2023+338',
    kind: 'black-hole',
    ra: 306.0159,
    dec: 33.8672,
    distPc: 2390,
    distanceSource: 'VLBI parallax (Miller-Jones et al. 2009)',
    constellation: 'Cygnus',
    details: { 'Black-hole mass': '≈ 9 M☉', 'Orbital period': '6.5 days' },
    facts: ['A black hole feeding on a companion star; its 2015 outburst was one of the brightest X-ray events of the decade.'],
    closeUp: { bhMassSun: 9, companion: { radiusSun: 6, teffK: 4_300, sepAu: 0.145, periodDays: 6.473 }, disk: true },
  },
  {
    id: 'gaia-bh1',
    name: 'Gaia BH1',
    designation: 'Gaia BH1',
    kind: 'black-hole',
    ra: 262.1712,
    dec: -0.5809,
    distPc: 480,
    distanceSource: 'Gaia DR3 parallax',
    constellation: 'Ophiuchus',
    details: { 'Black-hole mass': '≈ 9.6 M☉', Companion: 'Sun-like G dwarf', 'Orbital period': '186 days' },
    facts: ['The nearest known black hole (2022), found from the wobble of its Sun-like companion in Gaia data.', 'It is dormant: nothing falls into it, so it gives off no X-rays.'],
    closeUp: { bhMassSun: 9.6, companion: { radiusSun: 0.99, teffK: 5_850, sepAu: 1.4, periodDays: 185.6 }, disk: false },
  },
  {
    id: 'gaia-bh3',
    name: 'Gaia BH3',
    designation: 'Gaia BH3',
    kind: 'black-hole',
    ra: 294.8279,
    dec: 14.9318,
    distPc: 590,
    distanceSource: 'Gaia parallax',
    constellation: 'Aquila',
    details: { 'Black-hole mass': '≈ 33 M☉', Companion: 'metal-poor giant', 'Orbital period': '11.6 years' },
    facts: ['The most massive stellar black hole known in the Milky Way (2024), found in early Gaia DR4 data.', 'Its companion is an ancient, metal-poor star from the Galaxy’s halo.'],
    closeUp: { bhMassSun: 32.7, companion: { radiusSun: 4.9, teffK: 5_210, sepAu: 16.2, periodDays: 4_253 }, disk: false },
  },
];
