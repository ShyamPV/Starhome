# Starhome

A scientifically grounded, fully explorable 3D model of the Milky Way in the browser.
You can fly from a planet's surface out to a view of the whole barred spiral, with
stars rendered everywhere, not just around the Sun.

> Status: **deliverable 3 of 7** (precise ephemerides, the live sky from anywhere on Earth,
> constellations, satellites, rise/set times). See [docs/PLAN.md](docs/PLAN.md) for the
> roadmap, the rendering approach and the risks.

## Quick start

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # Vitest: astro math + galaxy-model statistics
pnpm test:e2e            # Playwright smoke tests (uses local Edge by default)
pnpm data:hipparcos      # optional: download Hipparcos (~118k real stars)
pnpm data:globulars      # rebuild the bundled Harris globular-cluster table
pnpm data:constellations # rebuild the bundled constellation lines and names
```

Controls: drag to orbit, right-drag to pan, use the wheel to zoom (logarithmic). Fly
with W A S D, R/F for up/down, Shift for ×5. Ctrl/Cmd+K opens search. Double-click a
label to travel there. The Galaxy panel toggles dust, globular clusters and spiral-arm
labels; Settings has exposure and Milky Way glow (diffuse light) sliders.

**Sky view** (Sky tab, *Look up from Earth*): stand at your location (or any latitude and
longitude, or an observatory preset) and see the sky at the simulation time, with the
daylight and twilight sky, constellations, the Galactic equator, planets, the Moon and
Earth satellites. Drag to look around, scroll to change the field of view, W A S D to
turn; search turns the view toward an object. The Sky tab lists what is up tonight and
the next ISS pass; every object's panel shows where to find it and when it rises and
sets. Your location is remembered in this browser only.

## Repository layout

```
apps/web          React + Vite + Tailwind UI (Zustand state)
packages/astro    Pure, tested astronomy math: units, time, ICRS/ecliptic/Galactic/
                  Galactocentric frames, ephemerides (VSOP87, lunar theory), observer
                  alt/az and rise/set, SGP4 satellites, photometry
packages/galaxy   Galaxy model (arms, bar, discs, halo, satellites), light model, 3D dust,
                  seeded RNG, population synthesis, star/tile/cluster generators,
                  Web Worker pool
packages/engine   three.js renderer: floating origin, star shader with per-star
                  extinction, level-of-detail shells, globular clusters, auto exposure,
                  camera rig, solar system, sky view (horizon, daylight sky, grids,
                  constellations, planets and satellites), sky worker, bloom + tone
                  mapping, labels
packages/data     Named-star seed catalogue, Solar System data, Hipparcos loader,
                  Harris globular-cluster catalogue, constellations, CelesTrak TLE loader
tools             Catalogue preprocessing scripts (Node)
e2e               Playwright tests
```

## What is real and what is modeled

| Shown | Source | Real or modeled |
|-------|--------|-----------------|
| Sun, planets, Pluto | VSOP87 via astronomy-engine | Real ephemeris (better than 1′) |
| Moon | Lunar theory via astronomy-engine | Real ephemeris (better than 1′) |
| Orbit lines | JPL approximate Keplerian elements (Standish) | Real (display only) |
| Sky positions, rise/transit/set times | IAU 2006/2000B precession-nutation, refraction (astronomy-engine) | Real |
| Satellites | CelesTrak two-line elements, SGP4 | Real (a few km; brightness is a rough estimate) |
| Constellation lines | IAU charts via d3-celestial | Real (conventional figures) |
| Daylight and twilight sky colours | Simple analytic sky model | **Modeled** (illustrative) |
| Named stars (V < 2 plus notable stars) | SIMBAD / Hipparcos values, rounded | Real |
| Hipparcos stars (after `pnpm data:hipparcos`) | ESA Hipparcos (I/239) + new reduction (I/311) | Real |
| All other individual stars | Population synthesis from the Galaxy model | **Modeled** |
| Diffuse light of the disc, bar, halo, Magellanic Clouds | Aggregate particles from the Galaxy model | **Modeled** |
| Globular clusters (157): positions, distances, luminosities, sizes, metallicities | Harris 1996 (2010 edition) | Real |
| Individual stars inside globular clusters | Synthesized from each cluster's real luminosity, size and [Fe/H] | **Modeled** |
| Dust: extinction and reddening of every star, dust lanes, Great Rift | Smooth 3D model calibrated to observed extinction | **Modeled** (validated, see below) |
| Spiral arm positions near the Sun | Reid et al. 2019 (BeSSeL maser parallaxes) | Real fit |
| Spiral arms on the far side of the Galaxy | Extrapolated log spirals | **Modeled** |
| Planet colours | Flat approximations | Artistic placeholder (textures in deliverable 7) |

The HUD shows **Modeled** whenever you are beyond real catalogue coverage (300 pc from
the Sun). The object panel labels each item as *Catalogue data*, *Ephemeris* or
*Modeled*, and shows the model's extinction from the Sun next to measured values where
the catalogue has them.

### How well the model matches the real Galaxy (checked in tests)

- **Light:** total V luminosity 2.5 × 10¹⁰ L☉; local disc surface brightness ~23 L☉/pc²
  (Flynn et al. 2006: 29). Seen from the Sun, the model sky is ~20 mag/arcsec² in the bulge
  windows, ~21.5 along the plane and ~23.6 at the Galactic poles, close to measured values.
- **Dust:** A_V ≈ 24 toward Sgr A*, ~2.6 through Baade's window (observed ~1.5–2), < 0.1 at
  the poles, ~0.7 mag/kpc in the plane. Against the measured reddening of all 157 Harris
  globular clusters it ranks sight lines correctly (Spearman ρ ≈ 0.88) and is typically
  0.6–0.7× the measured value. It is smooth, so it misses individual clouds (ρ Ophiuchi in
  front of M4, for example).
- **Brightness on screen:** an automatic exposure brightens views from outside the Galaxy
  (where less light reaches the camera). Unresolved light gets a separate "Milky Way glow"
  gain, as planetarium software does: this is a display choice, not a physical change.

## Data sources and attributions

- ESA, 1997, *The Hipparcos and Tycho Catalogues*, ESA SP-1200; van Leeuwen F., 2007,
  A&A 474, 653. Retrieved via VizieR (CDS, Strasbourg).
- Standish E. M., *Keplerian Elements for Approximate Positions of the Major Planets*,
  JPL Solar System Dynamics.
- Reid M. J. et al., 2019, ApJ 885, 131: spiral-arm log-spiral fits.
- GRAVITY Collaboration 2019 (R₀ = 8.178 kpc); Bennett & Bovy 2019 (z☉ = 20.8 pc).
- Wegg & Gerhard 2013 (bar angle); Launhardt et al. 2002 (nuclear stellar disc);
  Kroupa 2001 (IMF); Flower 1996 / Torres 2010 (bolometric corrections); Ballesteros
  2012 (B−V to T_eff).
- Pietrzyński et al. 2019 (LMC distance); Graczyk et al. 2020 (SMC distance); McConnachie
  2012 (satellite luminosities).
- Harris W. E. 1996, AJ 112, 1487 (2010 edition), *Catalog of Parameters for Milky Way
  Globular Clusters*, https://physics.mcmaster.ca/~harris/mwgc.dat. Supplied free of
  charge; redistributions must refer to this source.
- Drimmel & Spergel 2001 (dust disc scale height); Lallement et al. 2014 (Local Bubble);
  Cardelli, Clayton & Mathis 1989 (extinction law, R_V = 3.1); Flynn et al. 2006 (local
  disc luminosity).
- NASA Planetary Fact Sheets; IAU WGCCRE 2015 rotation elements.
- astronomy-engine by Don Cross (MIT): VSOP87 (Bretagnon & Francou 1988), lunar theory,
  IAU 2006 precession, IAU 2000B nutation, rise/set searches, constellation boundaries.
- satellite.js (MIT): SGP4/SDP4 after Vallado, Crawford, Hujsak & Kelso 2006,
  *Revisiting Spacetrack Report #3*. Orbital elements from CelesTrak (T. S. Kelso),
  cached for 4 hours as CelesTrak asks.
- Constellation lines and names: d3-celestial, Copyright (c) 2015, Olaf Frohn, BSD-3-Clause
  (lines after the IAU constellation charts). The full licence notice is reproduced in
  `packages/data/src/constellations.json`.

## Licence

Code: to be decided by the project owner (MIT suggested). Data keeps its original terms
(see [docs/PLAN.md](docs/PLAN.md#data-licensing-risks)).
