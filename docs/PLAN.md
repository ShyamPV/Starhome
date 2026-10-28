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
| 1 | Scaffold, floating-origin camera, GPU star instancing, solar system | **Done** |
| 2 | Whole-galaxy model: LOD tiles, dust/extinction, globular clusters, Hipparcos/Gaia blending, inside/outside views | **Done**, except Gaia DR3 tiles (see below) |
| 3 | Ephemerides worker (VSOP87/ELP), Sky view, constellations, SGP4 satellites, time controls, HUD | **Done** (see below) |
| 4 | Volumetric nebulae and 3D dust (Local Bubble, Gould Belt) | **Done** (see below) |
| 5 | Stars catalogue and HR diagram; exoplanet catalogue and 3D systems | |
| 6 | Free travel polish, tours, Explore tab, shareable URLs | Warp-to and search done |
| 7 | Polish, performance, PWA/offline, theming, README attributions | Themes done |

## Rendering a hundred-million-star galaxy in the browser

No browser can hold 10^8 to 10^11 individual stars, so the trick is never to need more
than a few million at once. All layers share one point-sprite shader, which
computes apparent brightness per frame from each star's **absolute magnitude**, its
true distance to the camera and the **dust extinction** along that line of sight:

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

### Deliverable 2: what landed

**Level-of-detail shells instead of an octree.** Between the cells and the glow there are
now two camera-centred grids of aggregate tiles (medium quality: 400 pc and 2 kpc tiles).
Each tile samples the model's *luminosity density* on a sub-grid, so finer tiles carry
fainter, denser particles. Neighbouring layers cross-fade over the same distance range
(weights sum to one), and every layer draws its light from one light model
(`light.ts`: mass densities × population light-to-mass ratios), so a region keeps its
brightness as it moves between layers. Cells whose star budget leaves light out (the
bulge) add soft "haze" particles for the expected missing light. A full octree would
also serve views from far outside; the glow layer already does that well, so nested
shells around the camera were simpler and seamless.

**Dust.** A 2D map of mid-plane extinction (exponential disc, arm dust lanes on the arms'
inner edges, molecular ring, bar lanes, Central Molecular Zone) times an exponential
vertical profile, with the Local Bubble carved out. The vertex shader integrates
extinction from the camera to every star with importance sampling in *z* (the vertical
integral is analytic), so both steep rays from outside the disc and long in-plane rays
resolve the thin dust layer with ~10 samples. Starlight is reddened per channel
(Cardelli R_V = 3.1). Real catalogue magnitudes are de-reddened with the same model, so
from the Sun the two cancel. Synthetic stars hidden by dust are no longer wrongly
suppressed as "already in the catalogue".

**Globular clusters.** All 157 Harris (2010) clusters: one soft particle each with the
real integrated magnitude from afar; within ~700 pc, a resolved old population (blue
horizontal branch for metal-poor clusters) on a Plummer profile with the real half-light
radius, plus haze for the unresolved light.

**Inside/outside.** An exposure meter sums the light reaching the camera from a fixed
sample of glow particles (all directions, so it does not pump when the view turns) and
brightens views from outside the Galaxy. A "Milky Way glow" gain brightens distant
unresolved light, ramped in with distance so nearby layers are unaffected.

### Deliverable 3: what landed

- **Ephemerides:** astronomy-engine (MIT) supplies VSOP87 planets, a lunar theory,
  precession/nutation, refraction and rise/set searches, replacing the Standish elements
  and the crude Moon series. Checked in tests against the old independent theory, the
  2024 April 8 total eclipse, the March 2024 equinox and sidereal time. The Earth now
  turns with apparent sidereal time.
- **Worker split (a deliberate change from the brief):** per-frame positions of ten bodies
  cost microseconds, so they stay on the main thread, where they stay in step with the
  render even at 1,000,000× time. The slow work (rise/transit/set searches, satellite pass
  predictions) runs in a dedicated sky worker.
- **Sky view:** the camera stands at the observer (WGS84 position from the ephemeris,
  2 m above the ground) with a field-of-view zoom. Ground, horizon and cardinal points;
  an additive daylight/twilight sky that also dims starlight (~8.5 magnitudes at noon);
  alt-az and equatorial grids, ecliptic, Galactic equator; constellation lines and names;
  planets as points with their real apparent magnitudes; satellites from CelesTrak TLEs
  propagated with SGP4, bright only when sunlit.
- **Panels:** location (geolocation, coordinates, observatory presets), tonight's Sun,
  Moon, planets and Galactic centre with rise/set times, next ISS pass, and "where to find
  it" (alt/az, RA/Dec, constellation, rise/transit/set, naked eye/binoculars/telescope)
  for any object.
- **Fixed along the way:** labels behind the camera were mirrored onto the screen (with a
  1e21 km far plane their projected depth rounds to exactly 1); the LMC's disc was oriented
  arbitrarily and looked like a streak from Earth, it is now inclined ~30° to our line of
  sight.

**Not yet:** constellation *art* (most sets are non-commercial or share-alike; needs a
licensing decision), atmospheric extinction near the horizon, and light pollution.

**Deferred to later deliverables.**
- *Gaia DR3 regional tiles:* needs an offline pipeline (Gaia archive queries, tiling,
  hosting) that cannot be built or verified without network access to the archives;
  the blending hook (`realCatalogMagLimit`, extinction-aware) is ready for it.
- *IndexedDB caching of generated layers* and *WebGPU culling* (deliverable 7, perf).

## Volumetric nebulae (deliverable 4)

### What landed

- **19 nebulae** with real positions, distances (source shown per object), sizes and
  integrated magnitudes: Orion, Carina, Eagle, Lagoon, Trifid, Omega, Rosette, Horsehead,
  North America, Pelican, Tarantula, Helix, Ring, Dumbbell, Cat's Eye, Crab, Veil, the
  Pleiades reflection nebula, and the Coalsack (as dust).
- **Volumes:** each is an RGBA 3D texture (40³, 112³ when it fills the view) built in the
  galaxy workers from a parametric model: blister cavity in front of a dusty wall
  (Orion), dark pillars silhouetted against a glowing wall (Eagle), shell (Rosette), dust
  curtain and head (Horsehead), barrel seen end-on (Ring), two tilted rings (Helix),
  bipolar lobes (Dumbbell, Cat's Eye), synchrotron body caged by filaments (Crab), a thin
  wrinkled shock (Veil), wisps lit by real Pleiades stars. Channels are Hα, [O III], [S II]
  (or synchrotron / scattered light) and dust; [O III] sits closest to the ionising
  stars (tested). The boxes are oriented on the sky by position angle with +z toward the
  Sun, so arriving from the Sun's side shows the familiar view and you can orbit to see
  the 3D shape.
- **Rendering:** front-to-back raymarch in the box (jittered, up to 128 steps), starting
  at the camera when inside, so you can fly through. Dust attenuates the emission behind
  it and, through premultiplied blending, the stars and Milky Way behind the nebula.
  Brightness is calibrated from the integrated magnitude (de-reddened with the dust
  model) with the same flux convention as the stars, then exposed per object for its
  surface brightness (like a photograph; a Settings slider scales all of them). Colours:
  scientific emission-line colours or the Hubble palette.
- **Nearby clouds:** 13 Gould Belt and Local Bubble wall clouds as Gaussian blobs with
  Gaia-based distances, added to the dust model with a closed-form line integral (the
  shader evaluates the same formula per star). This darkens the Coalsack, Taurus and
  ρ Oph, and fixes the model's reddening toward M4.

**Simplified versus the original plan:** no occupancy grid or impostors (the volumes are
small enough to march directly at 60 fps); no single-scattering pass (reflection nebulae
use a precomputed inverse-square illumination); no temporal accumulation; nearby dust
from a hand-built list of clouds rather than resampled Edenhofer/Lallement 3D maps
(those files are gigabytes and need an offline pipeline).

### Original design notes

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
| Harris globular clusters (bundled) | Free of charge; anyone passing it on must cite the McMaster source and not charge for it | Low: cited in README and the data file |
| Sharpless, NGC/IC, Messier | Academic catalogues, free with citation | Low |
| CelesTrak TLEs | Free; rate limits apply | Low now: cached in the browser for 4 h per group |
| Constellation lines (d3-celestial) | BSD-3-Clause; keep the copyright notice | Low: notice kept in the data file and README |
| astronomy-engine, satellite.js | MIT | Low |
| Planet textures (Solar System Scope) | CC BY 4.0 | Low: credit required |
| NASA/ESA nebula imagery (for palette reference only) | Varies; ESA/Hubble is CC BY 4.0; some NASA images contain third-party content | Medium: we use published line ratios, not images |
| Constellation art (figures) | Many sets are non-commercial or share-alike | **Medium: lines solved with BSD data; art still needs a permissive set or our own drawings** |
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
