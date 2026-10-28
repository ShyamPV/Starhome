# Starhome: plan, rendering approach and risks

The original brief lives in [`prompt.txt`](../prompt.txt). This document is the
"before coding" plan it asks for, kept current as deliverables land.

## Name

**Starhome** (renamed from the working title *Via Lactea*). The Milky Way is the
Sun's home, and the app covers all of it, not just the Sun's neighbourhood. Package
scope: `@starhome/*`.

## Plan by deliverable

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | Scaffold, floating-origin camera, GPU star instancing, solar system | **Done (this commit)** |
| 2 | Whole-galaxy model: octree tiles, dust/extinction, globular clusters, Hipparcos/Gaia blending, inside/outside views | Next |
| 3 | Ephemerides worker (VSOP87/ELP), Sky view, constellations, SGP4 satellites, time controls, HUD | Time bar and HUD done |
| 4 | Volumetric nebulae and 3D dust (Local Bubble, Gould Belt) | |
| 5 | Stars catalogue and HR diagram; exoplanet catalogue and 3D systems | |
| 6 | Free travel polish, tours, Explore tab, shareable URLs | Warp-to and search done |
| 7 | Polish, performance, PWA/offline, theming, README attributions | Themes done |

## Rendering a hundred-million-star galaxy in the browser

No browser can hold 10^8 to 10^11 individual stars, so the trick is never to need more
than a few million at once. Three layers share one point-sprite shader, which
computes apparent brightness per frame from each star's **absolute magnitude** and
its true distance to the camera:

1. **Glow layer (aggregate particles).** About 0.3 to 3 M particles, each standing for
   about 10^4 stars, sampled from the Galaxy model's light distribution: young
   OB-association clumps along the spiral arms, an old thin disc, the thick disc, the
   boxy/peanut bar and nuclear disc, the stellar halo, and the LMC, SMC and Sagittarius
   dSph. From outside they form the spiral; from inside they add up into the Milky Way
   band. Near the camera they become wide, faint splats with a 25 pc smoothing length,
   then fade out, so they read as haze rather than fake bright stars.
2. **Cell layer (resolved synthetic stars).** 50 pc cells around the camera, each
   generated in a Web Worker from a hash of its integer coordinates, so the same place
   always shows the same stars. Population synthesis uses a Kroupa IMF, main-sequence
   lifetimes, giants and supergiants, and Flower/Torres bolometric corrections. A per-cell
   budget keeps only the brightest stars (raising the minimum mass), which makes the
   bulge, with densities of 100+ M☉/pc³, manageable. Stars are stored brightest-first,
   so outer rings just draw a prefix: level of detail without regenerating.
   *Check:* the synthetic sky seen from the Sun has about 8,500 stars brighter than
   V = 6.5 within 400 pc; the real sky has about 9,000.
3. **Catalogue layer (real stars).** Hipparcos (about 118k stars, from
   `tools/build-hipparcos.mjs`) or the built-in named-star set. Real stars **override**
   synthetic ones: a cell drops any synthetic star that would look brighter, from the
   Sun, than the catalogue's completeness limit.

**Scale handling.** Positions are float64 km on the CPU (three.js `Vector3`). The
camera stays at the origin and every object or star batch is placed at
`origin - camera` each frame (floating origin). Star buffers are float32 parsecs
relative to a *local* batch origin, so precision is set by batch size, not by distance
from the Galactic centre. A logarithmic depth buffer covers 1 m to 1 Mpc. Rendering
goes through an HDR target, then bloom, then ACES tone mapping.

**Next (deliverable 2).** Replace the uniform glow buffer with an **octree of tiles**:
each node holds an importance-sampled impostor set sized to its screen footprint, with
the cell generator as the leaf level. Add dust as a 3D density field sampled for
per-star extinction and drawn as absorbing volumes. Move Hipparcos/Gaia into the same
tiles (Gaia DR3 regional tiles streamed on demand), and add WebGPU compute for culling.

## Volumetric nebulae (deliverable 4)

- **Representation:** each nebula is a sparse 3D density texture (64³ to 256³, plus a
  coarse occupancy grid for empty-space skipping), built in a worker from a parametric
  model of its published structure. Examples: ionised shells and pillars for M16,
  bipolar lobes for planetary nebulae, filament networks for the Veil (fBm-displaced
  shells), and the Orion "blister" with the Trapezium at the cavity's focus.
- **Emission:** separate channels for Hα (656 nm), [O III] (501 nm), [S II] (672 nm) and
  dust. Each channel's emissivity depends on the distance to the embedded ionising
  stars, so the colour layering is physical (O III closest to hot stars), with a
  "scientific vs enhanced" palette switch.
- **Rendering:** a raymarch in a bounding box drawn after the stars, with front-to-back
  compositing, jittered steps and temporal accumulation. Single scattering from the
  embedded stars uses a precomputed light-transmittance volume; dust absorbs the stars
  behind it, using the depth texture. When the camera is inside a nebula, the march
  starts at the camera (fly-through). Far away, an impostor billboard is rendered once
  from the volume.
- **3D dust:** Local Bubble and Gould Belt structure from public 3D extinction maps
  (Lallement et al., Edenhofer et al. 2024), resampled into the same volume format.

## Data licensing risks

| Source | Licence / terms | Risk |
|--------|-----------------|------|
| Hipparcos (ESA) / Gaia DR3 | Free use with acknowledgement (ESA/Gaia/DPAC) | Low: credit required |
| NASA Exoplanet Archive | Public; acknowledgement requested | Low |
| HYG database | CC BY-SA 4.0 | **Share-alike would apply to derived data.** Avoided: we build from Hipparcos directly |
| Harris globular clusters, Sharpless, NGC/IC, Messier | Academic catalogues, free with citation | Low |
| CelesTrak TLEs | Free; rate limits apply | Medium: cache and throttle |
| Planet textures (Solar System Scope) | CC BY 4.0 | Low: credit required |
| NASA/ESA nebula imagery (for palette reference only) | Varies; ESA/Hubble is CC BY 4.0; some NASA images contain third-party content | Medium: we use published line ratios, not images |
| Constellation art | Many sets are non-commercial | **Medium: choose Stellarium "western" lines (GPL) or draw our own** |
| 3D dust maps (Edenhofer 2024, Lallement 2022) | Open data with citation | Low, but files are large (GBs): resample offline |

## Performance risks

- **Fill rate:** millions of additive sprites over 4K screens. Mitigations: per-vertex
  culling of faint stars (already in the shader), level of detail via draw-range
  prefixes, and resolution scaling per quality preset.
- **Generation hitches:** all generation runs in a worker pool with transferable
  buffers; the glow layer for High/Ultra takes about 1 to 3 s at start-up. Plan: cache
  it in IndexedDB (Dexie) in deliverable 2.
- **Volumetric nebulae** are the most expensive feature: half-resolution raymarch with
  temporal upsampling, and one nebula marched at full quality at a time.
- **Precision:** float32 star tiles are good to roughly 1e-7 of the tile size. A star
  "visited" to AU scale gets its own double-precision anchor (the same mechanism as
  exoplanet systems in deliverable 5).
- **WebGPU:** optional path only; WebGL2 remains the baseline because WebGPU support
  is still uneven across browsers.
