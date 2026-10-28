# Via Lactea

A scientifically grounded, fully explorable 3D model of the Milky Way in the browser.
You can fly from a planet's surface out to a view of the whole barred spiral, with
stars rendered everywhere, not just around the Sun.

> Status: **deliverable 1 of 7** (scaffold, floating-origin renderer, GPU star layers,
> solar system). See [docs/PLAN.md](docs/PLAN.md) for the roadmap, the rendering
> approach and the risks.

## Quick start

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # Vitest: astro math + galaxy-model statistics
pnpm test:e2e            # Playwright smoke tests (uses local Edge by default)
pnpm data:hipparcos      # optional: download Hipparcos (~118k real stars)
```

Controls: drag to orbit, right-drag to pan, use the wheel to zoom (logarithmic). Fly
with W A S D, R/F for up/down, Shift for ×5. Ctrl/Cmd+K opens search. Double-click a
label to travel there.

## Repository layout

```
apps/web          React + Vite + Tailwind UI (Zustand state)
packages/astro    Pure, tested astronomy math: units, time, ICRS/ecliptic/Galactic/
                  Galactocentric frames, Kepler orbits, Moon, photometry
packages/galaxy   Galaxy model (arms, bar, discs, halo, satellites), seeded RNG,
                  population synthesis, star generators, Web Worker pool
packages/engine   three.js renderer: floating origin, star shader, cell streaming,
                  camera rig, solar system, bloom + tone mapping, labels
packages/data     Named-star seed catalogue, Solar System data, Hipparcos loader
tools             Catalogue preprocessing scripts (Node)
e2e               Playwright tests
```

## What is real and what is modeled

| Shown | Source | Real or modeled |
|-------|--------|-----------------|
| Sun, planets, Pluto | JPL approximate Keplerian elements (Standish), J2000 | Real ephemeris (low precision, arc-minutes) |
| Moon | Astronomical Almanac short series | Real ephemeris (about 0.3°) |
| Named stars (V < 2 plus notable stars) | SIMBAD / Hipparcos values, rounded | Real |
| Hipparcos stars (after `pnpm data:hipparcos`) | ESA Hipparcos (I/239) + new reduction (I/311) | Real |
| All other individual stars | Population synthesis from the Galaxy model | **Modeled** |
| Diffuse light of the disc, bar, halo, Magellanic Clouds | Aggregate particles from the Galaxy model | **Modeled** |
| Spiral arm positions near the Sun | Reid et al. 2019 (BeSSeL maser parallaxes) | Real fit |
| Spiral arms on the far side of the Galaxy | Extrapolated log spirals | **Modeled** |
| Planet colours | Flat approximations | Artistic placeholder (textures in deliverable 7) |

The HUD shows **Modeled** whenever you are beyond real catalogue coverage (300 pc from
the Sun). The object panel labels each item as *Catalogue data*, *Ephemeris* or
*Modeled*.

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
- Pietrzyński et al. 2019 (LMC distance); McConnachie 2012 (satellite luminosities).
- NASA Planetary Fact Sheets; IAU WGCCRE 2015 rotation elements.

## Licence

Code: to be decided by the project owner (MIT suggested). Data keeps its original terms
(see [docs/PLAN.md](docs/PLAN.md#data-licensing-risks)).
