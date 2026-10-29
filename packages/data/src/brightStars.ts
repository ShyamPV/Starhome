/**
 * Seed catalogue of named stars: every star brighter than V = 2.0, plus notable nearby
 * and extreme stars. Values are rounded from SIMBAD / Hipparcos (van Leeuwen 2007) and
 * serve as the always-available core set; the Hipparcos pipeline in /tools supplies the
 * full ~118k-star catalogue when present.
 */

export interface NamedStar {
  id: string;
  name: string;
  /** Bayer / Flamsteed or catalogue designation. */
  designation: string;
  /** ICRS right ascension and declination, degrees. */
  ra: number;
  dec: number;
  /** Distance, parsecs. */
  distPc: number;
  /** Apparent V magnitude. */
  vmag: number;
  /** B-V colour index. */
  bv: number;
  spectralType: string;
  constellation: string;
  note?: string;
}

// prettier-ignore
export const NAMED_STARS: readonly NamedStar[] = [
  { id: 'sirius', name: 'Sirius', designation: 'α CMa A', ra: 101.2872, dec: -16.7161, distPc: 2.64, vmag: -1.46, bv: 0.0, spectralType: 'A1V', constellation: 'Canis Major', note: 'Brightest star in the night sky; has a white-dwarf companion, Sirius B.' },
  { id: 'canopus', name: 'Canopus', designation: 'α Car', ra: 95.988, dec: -52.6957, distPc: 95, vmag: -0.74, bv: 0.15, spectralType: 'A9II', constellation: 'Carina' },
  { id: 'alpha-cen-a', name: 'Rigil Kentaurus', designation: 'α Cen A', ra: 219.9021, dec: -60.834, distPc: 1.34, vmag: -0.01, bv: 0.71, spectralType: 'G2V', constellation: 'Centaurus', note: 'Nearest Sun-like star.' },
  { id: 'alpha-cen-b', name: 'Toliman', designation: 'α Cen B', ra: 219.8961, dec: -60.8375, distPc: 1.34, vmag: 1.33, bv: 0.88, spectralType: 'K1V', constellation: 'Centaurus' },
  { id: 'proxima', name: 'Proxima Centauri', designation: 'α Cen C', ra: 217.429, dec: -62.6795, distPc: 1.302, vmag: 11.13, bv: 1.82, spectralType: 'M5.5Ve', constellation: 'Centaurus', note: 'Nearest star to the Sun; hosts the exoplanet Proxima b.' },
  { id: 'arcturus', name: 'Arcturus', designation: 'α Boo', ra: 213.9153, dec: 19.1824, distPc: 11.26, vmag: -0.05, bv: 1.23, spectralType: 'K1.5III', constellation: 'Boötes' },
  { id: 'vega', name: 'Vega', designation: 'α Lyr', ra: 279.2347, dec: 38.7837, distPc: 7.68, vmag: 0.03, bv: 0.0, spectralType: 'A0V', constellation: 'Lyra' },
  { id: 'capella', name: 'Capella', designation: 'α Aur', ra: 79.1723, dec: 45.998, distPc: 13.12, vmag: 0.08, bv: 0.8, spectralType: 'G3III+G0III', constellation: 'Auriga' },
  { id: 'rigel', name: 'Rigel', designation: 'β Ori', ra: 78.6345, dec: -8.2016, distPc: 264, vmag: 0.13, bv: -0.03, spectralType: 'B8Ia', constellation: 'Orion' },
  { id: 'procyon', name: 'Procyon', designation: 'α CMi', ra: 114.8255, dec: 5.225, distPc: 3.51, vmag: 0.34, bv: 0.42, spectralType: 'F5IV', constellation: 'Canis Minor' },
  { id: 'achernar', name: 'Achernar', designation: 'α Eri', ra: 24.4285, dec: -57.2368, distPc: 42.7, vmag: 0.46, bv: -0.16, spectralType: 'B6Vep', constellation: 'Eridanus' },
  { id: 'betelgeuse', name: 'Betelgeuse', designation: 'α Ori', ra: 88.7929, dec: 7.4071, distPc: 168, vmag: 0.5, bv: 1.85, spectralType: 'M1-2Ia', constellation: 'Orion', note: 'Red supergiant; semi-regular variable (V 0.0-1.6).' },
  { id: 'hadar', name: 'Hadar', designation: 'β Cen', ra: 210.9559, dec: -60.373, distPc: 120, vmag: 0.61, bv: -0.23, spectralType: 'B1III', constellation: 'Centaurus' },
  { id: 'altair', name: 'Altair', designation: 'α Aql', ra: 297.6958, dec: 8.8683, distPc: 5.13, vmag: 0.76, bv: 0.22, spectralType: 'A7V', constellation: 'Aquila' },
  { id: 'acrux', name: 'Acrux', designation: 'α Cru', ra: 186.6496, dec: -63.0991, distPc: 99, vmag: 0.76, bv: -0.24, spectralType: 'B0.5IV', constellation: 'Crux' },
  { id: 'aldebaran', name: 'Aldebaran', designation: 'α Tau', ra: 68.9802, dec: 16.5093, distPc: 20.0, vmag: 0.86, bv: 1.54, spectralType: 'K5III', constellation: 'Taurus' },
  { id: 'antares', name: 'Antares', designation: 'α Sco', ra: 247.3519, dec: -26.432, distPc: 170, vmag: 0.96, bv: 1.83, spectralType: 'M1.5Iab', constellation: 'Scorpius' },
  { id: 'spica', name: 'Spica', designation: 'α Vir', ra: 201.2982, dec: -11.1613, distPc: 77, vmag: 0.97, bv: -0.23, spectralType: 'B1V', constellation: 'Virgo' },
  { id: 'pollux', name: 'Pollux', designation: 'β Gem', ra: 116.329, dec: 28.0262, distPc: 10.36, vmag: 1.14, bv: 1.0, spectralType: 'K0III', constellation: 'Gemini' },
  { id: 'fomalhaut', name: 'Fomalhaut', designation: 'α PsA', ra: 344.4127, dec: -29.6222, distPc: 7.7, vmag: 1.16, bv: 0.09, spectralType: 'A3V', constellation: 'Piscis Austrinus' },
  { id: 'deneb', name: 'Deneb', designation: 'α Cyg', ra: 310.358, dec: 45.2803, distPc: 800, vmag: 1.25, bv: 0.09, spectralType: 'A2Ia', constellation: 'Cygnus', note: 'Distance is uncertain (roughly 450-1000 pc).' },
  { id: 'mimosa', name: 'Mimosa', designation: 'β Cru', ra: 191.9303, dec: -59.6888, distPc: 85, vmag: 1.25, bv: -0.23, spectralType: 'B0.5III', constellation: 'Crux' },
  { id: 'regulus', name: 'Regulus', designation: 'α Leo', ra: 152.093, dec: 11.9672, distPc: 24.3, vmag: 1.4, bv: -0.11, spectralType: 'B8IVn', constellation: 'Leo' },
  { id: 'adhara', name: 'Adhara', designation: 'ε CMa', ra: 104.6565, dec: -28.9721, distPc: 124, vmag: 1.5, bv: -0.21, spectralType: 'B2II', constellation: 'Canis Major' },
  { id: 'castor', name: 'Castor', designation: 'α Gem', ra: 113.6495, dec: 31.8883, distPc: 15.6, vmag: 1.58, bv: 0.03, spectralType: 'A1V', constellation: 'Gemini' },
  { id: 'shaula', name: 'Shaula', designation: 'λ Sco', ra: 263.4022, dec: -37.1038, distPc: 175, vmag: 1.62, bv: -0.22, spectralType: 'B2IV', constellation: 'Scorpius' },
  { id: 'gacrux', name: 'Gacrux', designation: 'γ Cru', ra: 187.7915, dec: -57.1132, distPc: 27.2, vmag: 1.64, bv: 1.59, spectralType: 'M3.5III', constellation: 'Crux' },
  { id: 'bellatrix', name: 'Bellatrix', designation: 'γ Ori', ra: 81.2828, dec: 6.3497, distPc: 77, vmag: 1.64, bv: -0.22, spectralType: 'B2III', constellation: 'Orion' },
  { id: 'elnath', name: 'Elnath', designation: 'β Tau', ra: 81.573, dec: 28.6074, distPc: 41, vmag: 1.65, bv: -0.13, spectralType: 'B7III', constellation: 'Taurus' },
  { id: 'miaplacidus', name: 'Miaplacidus', designation: 'β Car', ra: 138.2999, dec: -69.7172, distPc: 34.7, vmag: 1.67, bv: 0.07, spectralType: 'A1III', constellation: 'Carina' },
  { id: 'alnilam', name: 'Alnilam', designation: 'ε Ori', ra: 84.0534, dec: -1.2019, distPc: 600, vmag: 1.69, bv: -0.18, spectralType: 'B0Ia', constellation: 'Orion', note: 'Middle star of Orion\'s Belt; distance uncertain.' },
  { id: 'alnair', name: 'Alnair', designation: 'α Gru', ra: 332.0583, dec: -46.961, distPc: 31, vmag: 1.73, bv: -0.13, spectralType: 'B6V', constellation: 'Grus' },
  { id: 'alnitak', name: 'Alnitak', designation: 'ζ Ori', ra: 85.1897, dec: -1.9426, distPc: 226, vmag: 1.77, bv: -0.21, spectralType: 'O9.5Ib', constellation: 'Orion' },
  { id: 'alioth', name: 'Alioth', designation: 'ε UMa', ra: 193.5073, dec: 55.9598, distPc: 25.3, vmag: 1.77, bv: -0.02, spectralType: 'A1III', constellation: 'Ursa Major' },
  { id: 'dubhe', name: 'Dubhe', designation: 'α UMa', ra: 165.932, dec: 61.751, distPc: 37.7, vmag: 1.79, bv: 1.07, spectralType: 'K0III', constellation: 'Ursa Major' },
  { id: 'mirfak', name: 'Mirfak', designation: 'α Per', ra: 51.0807, dec: 49.8612, distPc: 155, vmag: 1.79, bv: 0.48, spectralType: 'F5Ib', constellation: 'Perseus' },
  { id: 'wezen', name: 'Wezen', designation: 'δ CMa', ra: 107.0979, dec: -26.3932, distPc: 490, vmag: 1.83, bv: 0.68, spectralType: 'F8Ia', constellation: 'Canis Major' },
  { id: 'kaus-australis', name: 'Kaus Australis', designation: 'ε Sgr', ra: 276.043, dec: -34.3846, distPc: 44, vmag: 1.85, bv: -0.03, spectralType: 'B9.5III', constellation: 'Sagittarius' },
  { id: 'sargas', name: 'Sargas', designation: 'θ Sco', ra: 264.3297, dec: -42.9978, distPc: 91, vmag: 1.86, bv: 0.4, spectralType: 'F1II', constellation: 'Scorpius' },
  { id: 'avior', name: 'Avior', designation: 'ε Car', ra: 125.6285, dec: -59.5095, distPc: 185, vmag: 1.86, bv: 1.2, spectralType: 'K3III+B', constellation: 'Carina' },
  { id: 'alkaid', name: 'Alkaid', designation: 'η UMa', ra: 206.8852, dec: 49.3133, distPc: 31.9, vmag: 1.86, bv: -0.1, spectralType: 'B3V', constellation: 'Ursa Major' },
  { id: 'menkalinan', name: 'Menkalinan', designation: 'β Aur', ra: 89.8822, dec: 44.9474, distPc: 25, vmag: 1.9, bv: 0.08, spectralType: 'A1IV', constellation: 'Auriga' },
  { id: 'atria', name: 'Atria', designation: 'α TrA', ra: 252.1662, dec: -69.0277, distPc: 119, vmag: 1.91, bv: 1.44, spectralType: 'K2II', constellation: 'Triangulum Australe' },
  { id: 'alhena', name: 'Alhena', designation: 'γ Gem', ra: 99.428, dec: 16.3993, distPc: 33.5, vmag: 1.93, bv: 0.0, spectralType: 'A1IV', constellation: 'Gemini' },
  { id: 'peacock', name: 'Peacock', designation: 'α Pav', ra: 306.4119, dec: -56.7351, distPc: 54.7, vmag: 1.94, bv: -0.2, spectralType: 'B2IV', constellation: 'Pavo' },
  { id: 'polaris', name: 'Polaris', designation: 'α UMi', ra: 37.9546, dec: 89.2641, distPc: 133, vmag: 1.98, bv: 0.6, spectralType: 'F7Ib', constellation: 'Ursa Minor', note: 'The current North Star; a Cepheid variable.' },
  { id: 'mirzam', name: 'Mirzam', designation: 'β CMa', ra: 95.6749, dec: -17.9559, distPc: 150, vmag: 1.98, bv: -0.24, spectralType: 'B1II', constellation: 'Canis Major' },
  { id: 'alphard', name: 'Alphard', designation: 'α Hya', ra: 141.8968, dec: -8.6586, distPc: 55, vmag: 1.98, bv: 1.44, spectralType: 'K3II', constellation: 'Hydra' },
  { id: 'hamal', name: 'Hamal', designation: 'α Ari', ra: 31.7934, dec: 23.4624, distPc: 20.2, vmag: 2.0, bv: 1.15, spectralType: 'K2III', constellation: 'Aries' },
  { id: 'saiph', name: 'Saiph', designation: 'κ Ori', ra: 86.9391, dec: -9.6696, distPc: 198, vmag: 2.06, bv: -0.17, spectralType: 'B0.5Ia', constellation: 'Orion' },
  { id: 'mintaka', name: 'Mintaka', designation: 'δ Ori', ra: 83.0017, dec: -0.2991, distPc: 380, vmag: 2.23, bv: -0.22, spectralType: 'O9.5II', constellation: 'Orion' },
  { id: 'barnards-star', name: "Barnard's Star", designation: 'GJ 699', ra: 269.4521, dec: 4.6934, distPc: 1.83, vmag: 9.51, bv: 1.74, spectralType: 'M4V', constellation: 'Ophiuchus', note: 'Largest proper motion of any star.' },
  { id: 'wolf-359', name: 'Wolf 359', designation: 'GJ 406', ra: 164.1203, dec: 7.0147, distPc: 2.41, vmag: 13.5, bv: 2.0, spectralType: 'M6V', constellation: 'Leo' },
  { id: 'trappist-1', name: 'TRAPPIST-1', designation: '2MASS J23062928-0502285', ra: 346.6223, dec: -5.0414, distPc: 12.43, vmag: 18.8, bv: 2.2, spectralType: 'M8V', constellation: 'Aquarius', note: 'Ultracool dwarf with seven known rocky planets.' },
  { id: 'eta-carinae', name: 'Eta Carinae', designation: 'η Car', ra: 161.2648, dec: -59.6845, distPc: 2300, vmag: 4.3, bv: 0.61, spectralType: 'LBV', constellation: 'Carina', note: 'Luminous blue variable binary; underwent the "Great Eruption" in the 1840s.' },
  { id: 'vy-cma', name: 'VY Canis Majoris', designation: 'VY CMa', ra: 110.743, dec: -25.7675, distPc: 1170, vmag: 7.9, bv: 2.24, spectralType: 'M3-5e Ia', constellation: 'Canis Major', note: 'One of the largest known stars by radius.' },
  { id: 'uy-scuti', name: 'UY Scuti', designation: 'UY Sct', ra: 276.9028, dec: -12.4664, distPc: 2900, vmag: 11.2, bv: 3.0, spectralType: 'M4Ia', constellation: 'Scutum', note: 'Red supergiant; radius estimates have ranged widely.' },
  // Nearby white dwarfs (spectral type number = 50400 / Teff). Sirius B and Procyon B sit at
  // their measured separations from their primaries (~11″ and ~4.5″, about 29 and 16 AU);
  // the direction is approximate and their orbits are not modelled.
  { id: 'sirius-b', name: 'Sirius B', designation: 'α CMa B', ra: 101.2902, dec: -16.715, distPc: 2.64, vmag: 8.44, bv: -0.03, spectralType: 'DA2', constellation: 'Canis Major', note: 'The nearest white dwarf: about the Sun’s mass packed into a sphere the size of the Earth. Companion of Sirius A, every 50 years.' },
  { id: 'procyon-b', name: 'Procyon B', designation: 'α CMi B', ra: 114.8264, dec: 5.2259, distPc: 3.51, vmag: 10.7, bv: 0.0, spectralType: 'DQZ6.5', constellation: 'Canis Minor', note: 'White-dwarf companion of Procyon A, orbiting every 41 years.' },
  { id: '40-eri-b', name: '40 Eridani B', designation: 'ο² Eri B', ra: 63.818, dec: -7.653, distPc: 5.01, vmag: 9.52, bv: 0.03, spectralType: 'DA2.9', constellation: 'Eridanus', note: 'The easiest white dwarf to see in a small telescope; one of the first identified (1910).' },
  { id: 'van-maanen-2', name: "van Maanen's Star", designation: 'van Maanen 2', ra: 12.291, dec: 5.389, distPc: 4.31, vmag: 12.37, bv: 0.55, spectralType: 'DZ7.5', constellation: 'Pisces', note: 'The nearest solitary white dwarf; metals in its atmosphere are the remains of planetary debris it swallowed.' },
  // Stars embedded in nebulae (distances are their clusters': Orion Nebula Cluster, Pleiades).
  { id: 'theta1-ori-c', name: 'θ¹ Orionis C', designation: 'θ¹ Ori C', ra: 83.8186, dec: -5.3897, distPc: 414, vmag: 5.13, bv: 0.02, spectralType: 'O7Vp', constellation: 'Orion', note: 'Brightest star of the Trapezium; its ultraviolet light makes the Orion Nebula glow.' },
  { id: 'alcyone', name: 'Alcyone', designation: 'η Tau', ra: 56.8712, dec: 24.1051, distPc: 136, vmag: 2.87, bv: -0.09, spectralType: 'B7III', constellation: 'Taurus', note: 'Brightest star of the Pleiades.' },
  { id: 'atlas', name: 'Atlas', designation: '27 Tau', ra: 57.2906, dec: 24.0534, distPc: 136, vmag: 3.62, bv: -0.07, spectralType: 'B8III', constellation: 'Taurus' },
  { id: 'electra', name: 'Electra', designation: '17 Tau', ra: 56.2189, dec: 24.1133, distPc: 136, vmag: 3.7, bv: -0.11, spectralType: 'B6III', constellation: 'Taurus' },
  { id: 'maia', name: 'Maia', designation: '20 Tau', ra: 56.4567, dec: 24.3678, distPc: 136, vmag: 3.87, bv: -0.07, spectralType: 'B8III', constellation: 'Taurus' },
  { id: 'merope', name: 'Merope', designation: '23 Tau', ra: 56.5815, dec: 23.9484, distPc: 136, vmag: 4.18, bv: -0.06, spectralType: 'B6IV', constellation: 'Taurus', note: 'Lights the Merope Nebula, the brightest patch of the Pleiades’ reflection nebula.' },
  { id: 'taygeta', name: 'Taygeta', designation: '19 Tau', ra: 56.3021, dec: 24.4672, distPc: 136, vmag: 4.29, bv: -0.11, spectralType: 'B6V', constellation: 'Taurus' },
  { id: 'pleione', name: 'Pleione', designation: '28 Tau', ra: 57.2967, dec: 24.1367, distPc: 136, vmag: 5.05, bv: -0.08, spectralType: 'B8IVpe', constellation: 'Taurus' },
];

/** Magnitude to which NAMED_STARS is complete; synthetic stars brighter than this (from the Sun) are suppressed. */
export const NAMED_STARS_COMPLETE_TO_VMAG = 2.0;
