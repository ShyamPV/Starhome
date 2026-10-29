# Starhome

A scientifically grounded, fully explorable 3D model of the Milky Way in the browser.
Fly from a planet's surface out to a view of the whole barred spiral, with stars drawn
everywhere, not just around the Sun; visit nebulae, star clusters and 6,000+ exoplanet
systems; or stand on the Earth and see tonight's sky.

All seven planned deliverables are complete. [docs/PLAN.md](docs/PLAN.md) records how each
one was built, the rendering approach, the risks and what is not done yet.

## What you can do

- **Fly anywhere in the Galaxy.** Real stars near the Sun (named stars, optionally
  Hipparcos' 118,000) blend into a synthetic galaxy of arms, bar, discs, halo, globular
  clusters and satellite galaxies, dimmed and reddened by 3D dust. Zoom continuously from
  a planet to the whole disc; warp to anything with a speed read-out in multiples of c.
- **The Solar System** with real positions (VSOP87 and lunar theory), surface maps, rings,
  IAU rotation models and 20 major moons on orbits fitted to JPL's ephemerides.
- **Nebulae in 3D** (19 objects, from the Orion Nebula to the Crab), raymarched as volumes
  you can fly through, plus the nearby dust clouds of the Gould Belt.
- **Stars** with temperatures, sizes and life stages, white dwarfs, pulsars, a magnetar and
  black holes, and an interactive Hertzsprung-Russell diagram.
- **Exoplanets:** the full NASA Exoplanet Archive, with filters, a discovery timeline,
  habitable zones and 3D systems on their real orbits.
- **The sky from Earth** for any place and time: constellations, planets, the Moon, the ISS
  and bright satellites, rise and set times, the Milky Way band and the Galactic centre.
- **Explore and tours:** one searchable catalogue of every object with curated lists
  (highlights, closest, visible tonight, most extreme), favourites and visit history, an
  object of the day, and four guided tours.
- **Share** a link to exactly the current view; **install** it as an app that works offline.

## Quick start

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm build               # production build in apps/web/dist (with the offline service worker)
pnpm test                # Vitest: astronomy math, catalogues, galaxy-model statistics
pnpm test:e2e            # Playwright tests of the main flows (uses local Edge by default)
```

Data scripts (the results are committed, so none are needed to run the app):

```bash
pnpm data:hipparcos      # optional: download Hipparcos (~118k real stars) into public/data
pnpm data:exoplanets     # refresh the NASA Exoplanet Archive snapshot
pnpm data:textures       # Solar System surface maps (Solar System Scope, CC BY 4.0)
pnpm data:moons          # refit the moons' orbits to JPL Horizons
pnpm data:globulars      # rebuild the Harris globular-cluster table
pnpm data:constellations # rebuild the constellation lines and names
pnpm build:icons         # app icons from public/favicon.svg
```

## Using it

**Controls.** Drag to orbit, right-drag (or Shift-drag) to pan, wheel to zoom on a
logarithmic scale. Fly with W A S D, R/F for up and down, Q/E to turn, Shift for ×5.
Ctrl/Cmd+K searches; double-click a label to travel there; Esc closes the details; **?**
lists every control. **Surprise me** flies somewhere at random. **Share** copies a link
to this exact view (camera, time, selection); the address bar always holds the same link.

**Galaxy** panel: destinations and layers (orbits, labels, dust, clusters, spiral-arm
labels, nebulae, exoplanet hosts, habitable zones, Hubble-palette colours).

**Sky** panel, *Look up from Earth*: your location (or any place, or an observatory
preset) at the simulation time. Drag to look around, scroll to change the field of view.
It lists what is up tonight and the next ISS pass; every object's panel shows where to find
it and when it rises and sets.

**Explore** panel: *Discover* (the catalogue hub and curated lists), *Stars* (the star
catalogue and HR diagram), *Exoplanets* (filters, the discovery timeline that also filters
the hosts in 3D, sorting by distance or Earth Similarity) and *Tours* (the journey to the
galactic centre, the great nebulae, the closest exoplanets and the top 10 extreme stars).

**Settings:** quality preset (Low to Ultra), exposure, Milky Way glow, nebula brightness,
bloom, adaptive resolution, and the themes: default, red night vision (keeps your eyes
dark-adapted at the telescope) and high contrast (chosen automatically on first visit when
the system asks for more contrast). Motion is reduced when the system asks for it. Settings
are remembered in this browser.

**Install and offline.** In Chrome or Edge, *Install app* (Settings, or the address bar)
adds Starhome as an app. After the first visit the app, the star and exoplanet catalogues
work without a connection; planet maps are kept once you have been to that planet.
Satellite orbits come from CelesTrak and are reused from the last download while offline.
When a new version is published the app offers to reload into it.

**Performance.** Medium quality holds 60 fps on a mid-range laptop GPU (tested on an RTX
3050). If the frame rate falls below about 45 fps, adaptive resolution renders fewer pixels
until it recovers (shown next to the fps read-out). Lower the quality preset on integrated
graphics. Planet maps load only when you approach a planet, and libraries are split into
separately cached chunks so app updates download little.

## Repository layout

```
apps/web          React + Vite + Tailwind UI (Zustand state; favourites and visits in
                  IndexedDB via Dexie; shareable view links; service worker and manifest)
packages/astro    Pure, tested astronomy math: units, time, ICRS/ecliptic/Galactic/
                  Galactocentric frames, ephemerides (VSOP87, lunar theory), moons and
                  rotation models, observer alt/az, rise/set and night visibility, SGP4
                  satellites, photometry, stellar parameters
packages/galaxy   Galaxy model (arms, bar, discs, halo, satellites), light model, 3D dust,
                  nebula volumes, seeded RNG, population synthesis, generators, worker pool
packages/engine   three.js renderer: floating origin, star shader with per-star
                  extinction, level-of-detail shells, globular clusters, nebula raymarcher,
                  exoplanet systems, Solar System, sky view, camera rig, auto exposure,
                  adaptive resolution, bloom and tone mapping, labels, view-state links
packages/data     Catalogues and loaders: named stars, Solar System and moons, Hipparcos,
                  Harris globulars, constellations, CelesTrak TLEs, exoplanets, compact
                  objects, tours and superlatives
tools             Data preparation scripts (Node)
e2e               Playwright tests
```

## What is real and what is modeled

| Shown | Source | Real or modeled |
|-------|--------|-----------------|
| Sun, planets, Pluto | VSOP87 via astronomy-engine | Real ephemeris (better than 1′) |
| Moon | Lunar theory via astronomy-engine | Real ephemeris (better than 1′) |
| Galilean moons | L1.2 theory (Lieske) via astronomy-engine | Real (a few hundred km) |
| 16 other major moons | Mean elements fitted to JPL Horizons, 2000–2050 | Real (within 2° along the orbit; each moon's panel gives its own figure) |
| Rotation and orientation of the Sun, planets and Moon | IAU WGCCRE models; the Earth by sidereal time | Real (periodic terms omitted) |
| Surface maps of the Sun, planets and Moon | Solar System Scope, based on NASA imagery | Real imagery (Venus shows its cloud tops) |
| Other moons' surfaces | Single display colour | **Placeholder** |
| Orbit lines | JPL approximate Keplerian elements (Standish); moons from their own models | Real (display only) |
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
| Nearby dark clouds (Taurus, ρ Oph, Coalsack, Orion A/B, Aquila Rift, ...) | Gaia-based distances (Zucker et al. 2019/2020); smooth blobs | Real positions, **modeled** shapes |
| Nebulae (19): position, distance, size, brightness | Literature values (sources in each object's panel) | Real |
| Nebulae: 3D structure, colours | Parametric models of published morphology; emission-line colours | **Modeled** |
| Star temperature, luminosity, radius, mass, life stage | Derived from catalogue V, distance, spectral type (Pecaut & Mamajek 2013 scale) | Estimates (labelled "est.") |
| White dwarfs, pulsars, a magnetar, stellar black holes | Literature positions and distances (source per object) | Real |
| Exoplanets (≈6,450) and their host stars | NASA Exoplanet Archive, composite parameters | Real |
| Habitable zone, Earth Similarity Index | Kopparapu et al. 2014; Schulze-Makuch et al. 2011 | Computed estimates |
| Exoplanet orbital phase and orientation on the sky | Not measured for most planets | **Modeled** (assumed) |
| Exoplanet surfaces | Procedural from size and temperature | **Artist's impression** |
| HR-diagram background population | Population synthesis of the solar neighbourhood | **Modeled** |
| Tour narration, "most extreme" list, object of the day | Hand-written from the catalogues and sources above | Curated text |
| "Visible tonight" | Highest altitude after nautical dusk, from catalogue positions and ephemerides | Computed |
| Spiral arm positions near the Sun | Reid et al. 2019 (BeSSeL maser parallaxes) | Real fit |
| Spiral arms on the far side of the Galaxy | Extrapolated log spirals | **Modeled** |

The HUD shows **Modeled** whenever you are beyond real catalogue coverage (300 pc from
the Sun). Every object's panel labels it *Catalogue data*, *Ephemeris* or *Modeled*,
shows the model's extinction from the Sun next to measured values, and names its sources.

### How well the model matches the real Galaxy (checked in tests)

- **Light:** total V luminosity 2.5 × 10¹⁰ L☉; local disc surface brightness ~23 L☉/pc²
  (Flynn et al. 2006: 29). Seen from the Sun, the model sky is ~20 mag/arcsec² in the bulge
  windows, ~21.5 along the plane and ~23.6 at the Galactic poles, close to measured values.
- **Stars:** the synthetic sky from the Sun has about 8,500 stars brighter than V 6.5
  within 400 pc; the real sky has about 9,000.
- **Dust:** A_V ≈ 24 toward Sgr A*, ~2.6 through Baade's window (observed ~1.5–2), < 0.1 at
  the poles, ~0.7 mag/kpc in the plane. Against the measured reddening of all 157 Harris
  globular clusters it ranks sight lines correctly (Spearman ρ ≈ 0.88) and is typically
  0.7× the measured value; with the nearby clouds added, M4 behind ρ Ophiuchi comes out at
  A_V 1.1 (measured 1.1).
- **Moons:** every fitted moon is checked against JPL Horizons positions; Mimas needs a
  libration term (48°, 76 years), which matches its known resonance with Tethys.
- **Brightness on screen:** an automatic exposure brightens views from outside the Galaxy
  (where less light reaches the camera). Unresolved light gets a separate "Milky Way glow"
  gain, as planetarium software does: this is a display choice, not a physical change.

## Privacy

Starhome has no accounts, analytics or server of its own. Your location, settings,
favourites and visited objects stay in this browser (localStorage and IndexedDB). The app
fetches only its own files and CelesTrak's satellite elements. A shared link from the sky
view contains the location rounded to 0.1° (about 10 km), and the copy confirmation says
so; opening such a link uses that place for the visit without replacing your saved one.
Links from the galaxy view contain no location.

## Data sources and attributions

- ESA, 1997, *The Hipparcos and Tycho Catalogues*, ESA SP-1200; van Leeuwen F., 2007,
  A&A 474, 653. Retrieved via VizieR (CDS, Strasbourg).
- This research has made use of the NASA Exoplanet Archive, which is operated by the
  California Institute of Technology, under contract with the National Aeronautics and
  Space Administration under the Exoplanet Exploration Program.
- Harris W. E. 1996, AJ 112, 1487 (2010 edition), *Catalog of Parameters for Milky Way
  Globular Clusters*, https://physics.mcmaster.ca/~harris/mwgc.dat. Supplied free of
  charge; redistributions must refer to this source.
- Planet, Moon and Sun surface maps: Solar System Scope (INOVE),
  https://www.solarsystemscope.com/textures/, licensed CC BY 4.0, based on NASA mission
  imagery and elevation data (renamed, otherwise unmodified; see
  `apps/web/public/textures/ATTRIBUTION.txt`).
- Moon orbits: fitted to ephemerides from the JPL Horizons system (Solar System Dynamics
  Group, Jet Propulsion Laboratory): MAR099, SAT441, URA182, NEP098, PLU060. Moon radii:
  JPL Planetary Satellite Physical Parameters. Galilean moons: Lieske's L1.2 theory.
- NASA Planetary Fact Sheets; IAU WGCCRE 2015 rotation elements (Archinal et al. 2018).
- Standish E. M., *Keplerian Elements for Approximate Positions of the Major Planets*,
  JPL Solar System Dynamics.
- Reid M. J. et al., 2019, ApJ 885, 131: spiral-arm log-spiral fits.
- GRAVITY Collaboration 2019 (R₀ = 8.178 kpc); Bennett & Bovy 2019 (z☉ = 20.8 pc).
- Wegg & Gerhard 2013 and Wegg et al. 2015 (bar); Launhardt et al. 2002 (nuclear stellar
  disc); Kroupa 2001 (IMF); Flower 1996 / Torres 2010 (bolometric corrections);
  Ballesteros 2012 (B−V to T_eff).
- Pietrzyński et al. 2019 (LMC distance); Graczyk et al. 2020 (SMC distance); McConnachie
  2012 (satellite luminosities).
- Drimmel & Spergel 2001 (dust disc scale height); Lallement et al. 2014 (Local Bubble);
  Zucker et al. 2019, 2020 (distances to local molecular clouds); Cardelli, Clayton &
  Mathis 1989 (extinction law, R_V = 3.1); Flynn et al. 2006 (local disc luminosity).
- Kopparapu et al. 2014, ApJL 787, L29 (habitable zones); Schulze-Makuch et al. 2011
  (Earth Similarity Index); Chen & Kipping 2017 (mass-radius relation); Pecaut & Mamajek
  2013 (temperature and bolometric-correction scales); Levesque et al. 2005 (red
  supergiant temperatures).
- Wittkowski et al. 2012 (radius of VY Canis Majoris); Gaia Collaboration 2024 (Gaia BH3).
- Satellite orbital elements from CelesTrak (T. S. Kelso), cached for 4 hours as CelesTrak
  asks.
- Constellation lines and names: d3-celestial, Copyright (c) 2015, Olaf Frohn, BSD-3-Clause
  (lines after the IAU constellation charts). The full licence notice is reproduced in
  `packages/data/src/constellations.json`.

## Software

| Package | Use | Licence |
|---------|-----|---------|
| three.js | WebGL rendering | MIT |
| React, React DOM | Interface | MIT |
| Zustand | State | MIT |
| Dexie.js | IndexedDB (favourites, visits) | Apache-2.0 |
| astronomy-engine (Don Cross) | VSOP87 (Bretagnon & Francou 1988), lunar theory, IAU 2006 precession and 2000B nutation, rise/set, Galilean moons, constellation boundaries | MIT |
| satellite.js | SGP4/SDP4 after Vallado, Crawford, Hujsak & Kelso 2006 | MIT |
| Vite, Tailwind CSS, Vitest, Playwright | Build and test (not shipped) | MIT, MIT, MIT, Apache-2.0 |

## Licence

Code: to be decided by the project owner (MIT suggested). Data and imagery keep their
original terms, listed above; the surface maps require the CC BY 4.0 credit wherever the
app or its files are redistributed (see [docs/PLAN.md](docs/PLAN.md#data-licensing-risks)).
