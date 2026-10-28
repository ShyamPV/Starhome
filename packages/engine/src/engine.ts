import {
  KM_PER_AU,
  KM_PER_PC,
  SUN_ABS_MAG_V,
  SUN_GALACTOCENTRIC_PC,
  absoluteMagnitude,
  bvToTeff,
  dateToJulian,
  galactocentricToLbd,
  raDecDistToGalactocentric,
  starPhysics,
  teffToLinearRgb,
  type GeoLocation,
  type LifeStage,
  type Vec3,
} from '@starhome/astro';
import {
  HIPPARCOS_COMPLETE_TO_VMAG,
  NAMED_STARS,
  NAMED_STARS_COMPLETE_TO_VMAG,
  loadExoplanets,
  loadHipparcos,
  type ExoHost,
  type ExoplanetCatalog,
} from '@starhome/data';
import { CELL_SIZE_PC, DUST, GalaxyWorkerPool, extinctionV, regionName, type DustMap } from '@starhome/galaxy';
import {
  ACESFilmicToneMapping,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CameraRig } from './cameraRig';
import { CLUSTER_FADE_KM, GlobularClusterLayer } from './clusterLayer';
import { ExposureMeter } from './exposure';
import { ExoplanetLayer } from './exoplanetLayer';
import { NebulaLayer } from './nebulaLayer';
import { worldKmToGalPc } from './frames';
import { SkyMode, type SkyHud, type TonightRow, type WhereToFind } from './skyMode';
import type { SkyLayers } from './skyView';
import { SolarSystem } from './solarSystem';
import { createSharedStarUniforms, createStarMaterial, setFades } from './starMaterial';
import { GridStreamer, StarBatch, starBatchFromBuffers, type GridLayerOptions } from './starLayers';
import { buildTargets, starPhysicsDetails, type Target, type TargetKind } from './targets';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

interface TileLevel {
  /** Tile edge, pc. */
  sizePc: number;
  /** Target luminosity per particle, L_sun. */
  particleLum: number;
  /** Maximum particles per tile. */
  cap: number;
}

export interface QualitySettings {
  /** Galaxy-wide aggregate particles. */
  glow: number;
  /** Resolved stars per 50 pc cell nearest the camera, and cells loaded in each direction. */
  cellCap: number;
  cellReach: number;
  /** Level-of-detail tiles between the cells and the glow. */
  near: TileLevel;
  far: TileLevel;
  /** Resolved stars per globular cluster up close. */
  clusterCap: number;
  /** Samples per star along the line of sight through the dust. */
  dustSteps: number;
  /** Raymarch steps through each nebula (more when close). */
  nebulaSteps: number;
  bloom: boolean;
  maxPixelRatio: number;
}

export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: {
    glow: 300_000,
    cellCap: 1200,
    cellReach: 2,
    near: { sizePc: 500, particleLum: 600, cap: 8_000 },
    far: { sizePc: 2500, particleLum: 6000, cap: 20_000 },
    clusterCap: 8_000,
    dustSteps: 6,
    nebulaSteps: 32,
    bloom: false,
    maxPixelRatio: 1,
  },
  medium: {
    glow: 800_000,
    cellCap: 2500,
    cellReach: 3,
    near: { sizePc: 400, particleLum: 300, cap: 12_000 },
    far: { sizePc: 2000, particleLum: 3000, cap: 30_000 },
    clusterCap: 20_000,
    dustSteps: 10,
    nebulaSteps: 48,
    bloom: true,
    maxPixelRatio: 1.5,
  },
  high: {
    glow: 1_600_000,
    cellCap: 4000,
    cellReach: 3,
    near: { sizePc: 400, particleLum: 150, cap: 20_000 },
    far: { sizePc: 2000, particleLum: 1500, cap: 50_000 },
    clusterCap: 40_000,
    dustSteps: 14,
    nebulaSteps: 64,
    bloom: true,
    maxPixelRatio: 2,
  },
  ultra: {
    glow: 3_000_000,
    cellCap: 8000,
    cellReach: 4,
    near: { sizePc: 500, particleLum: 80, cap: 32_000 },
    far: { sizePc: 2500, particleLum: 800, cap: 80_000 },
    clusterCap: 80_000,
    dustSteps: 20,
    nebulaSteps: 96,
    bloom: true,
    maxPixelRatio: 2,
  },
};

export interface Hud {
  jd: number;
  timeRate: number;
  paused: boolean;
  /** Camera position in the Galactocentric frame, pc. */
  galactocentricPc: Vec3;
  /** Galactic longitude/latitude (deg) and distance (pc) of the camera as seen from the Sun. */
  l: number;
  b: number;
  dPc: number;
  region: string;
  /** True when the surroundings are synthetic (no real catalogue coverage). */
  modeled: boolean;
  nearest: { id: string; name: string; distanceKm: number } | null;
  targetName: string | null;
  distanceToTargetKm: number;
  speedKmS: number;
  kmPerPixel: number;
  fps: number;
  /** Current exposure multiplier from the automatic inside/outside adaptation. */
  autoExposure: number;
  stars: { glow: number; tiles: number; cells: number; catalog: number; catalogSource: 'hipparcos' | 'named' | 'loading' };
  loading: string[];
  view: ViewMode;
  /** Present in the sky view: the observer, the view direction and the Sun's altitude. */
  sky: SkyHud | null;
}

/** Fly through the Galaxy, or stand on the Earth and look up. */
export type ViewMode = 'galaxy' | 'sky';

export interface TargetSummary {
  id: string;
  name: string;
  kind: Target['kind'];
  subtitle: string;
  provenance: Target['provenance'];
  facts: string[];
  details: Record<string, string>;
}

export type LayerId = 'dust' | 'clusters' | 'arms' | 'nebulae' | 'exoplanets';

/** A star on the Hertzsprung-Russell diagram. */
export interface HrStar {
  id: string;
  name: string;
  teffK: number;
  absMagV: number;
  stage: LifeStage | null;
  /** Named catalogue star, or exoplanet host from the NASA archive. */
  source: 'named' | 'host';
}

export interface HrData {
  real: HrStar[];
  /** Synthetic neighbourhood population (modeled). */
  modeled: { teff: Float32Array; absMagV: Float32Array; evolved: Uint8Array };
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  labelRoot: HTMLElement;
  quality?: QualityPreset;
  hipparcosUrl?: string;
  seed?: number;
  onHud?: (hud: Hud) => void;
  onSelect?: (target: TargetSummary | null) => void;
  /** NASA Exoplanet Archive snapshot built by tools/build-exoplanets.mjs. */
  exoplanetsUrl?: string;
  /** Called when targets are added after start-up (the exoplanet catalogue loads asynchronously). */
  onTargetsChanged?: (targets: TargetSummary[]) => void;
  onExoplanets?: (catalog: ExoplanetCatalog) => void;
}

/** Real catalogue coverage: beyond this distance from the Sun the scene is mostly modeled. */
const CATALOG_REACH_PC = 300;
const ARM_LABEL_MIN_ZOOM_KM = 4 * KM_PER_PC * 1000;
/** Level-of-detail cross-fades run over this fraction of each layer's guaranteed radius. */
const FADE_FRACTION: [number, number] = [0.55, 0.95];

export class Engine {
  private readonly renderer: WebGLRenderer;
  private readonly labels: CSS2DRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  readonly rig: CameraRig;
  private readonly solar = new SolarSystem();
  private readonly pool = new GalaxyWorkerPool();
  private readonly shared = createSharedStarUniforms();
  // Level-of-detail shells, nearest first: cells -> near tiles -> far tiles -> glow.
  private readonly cellMaterial = createStarMaterial(this.shared);
  private readonly cellHazeMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 4 });
  private readonly nearMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 1.5 });
  private readonly farMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 5 });
  private readonly glowMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 12 });
  /** Real stars; faded out within a few hundred AU, where a planetary system's star sphere takes over. */
  private readonly catalogMaterial = createStarMaterial(this.shared, { fadeIn: [300 * KM_PER_AU, 3000 * KM_PER_AU] });
  /** The Sun as a point of light, faded in only once we are well outside the planetary system. */
  private readonly sunMaterial = createStarMaterial(this.shared, { fadeIn: [300 * KM_PER_AU, 20_000 * KM_PER_AU] });
  private readonly clusterAggregateMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 4, fadeOut: CLUSTER_FADE_KM });
  private readonly clusterStarMaterial = createStarMaterial(this.shared, { fadeIn: CLUSTER_FADE_KM });
  private readonly clusterHazeMaterial = createStarMaterial(this.shared, { soft: true, smoothingPc: 4, fadeIn: CLUSTER_FADE_KM });
  /** Planets and satellites as points in the sky view. */
  private readonly skyPointMaterial = createStarMaterial(this.shared);
  readonly sky: SkyMode;
  private readonly nebulae: NebulaLayer;
  readonly exoplanets: ExoplanetLayer;
  private viewMode: ViewMode = 'galaxy';
  /** Daylight dimming of starlight in the sky view. */
  private skyDim = 1;
  /** Orbit-camera state to return to when leaving the sky view. */
  private galaxyCamera: { distance: number; yaw: number; pitch: number } | null = null;
  private readonly sunPoint: StarBatch;
  private readonly cells: GridStreamer;
  private readonly nearTiles: GridStreamer;
  private readonly farTiles: GridStreamer;
  private readonly clusters: GlobularClusterLayer;
  private readonly exposureMeter = new ExposureMeter();
  private readonly sgrA: Mesh;
  private glow: StarBatch | null = null;
  private catalog: StarBatch | null = null;
  private catalogSource: Hud['stars']['catalogSource'] = 'loading';
  private dustMap: DustMap | null = null;
  private readonly dustReady: Promise<DustMap | null>;
  private dustEnabled = true;
  private readonly hiddenKinds = new Set<TargetKind>();
  private readonly targets: Target[];
  private readonly targetById = new Map<string, Target>();
  private readonly labelObjects = new Map<string, CSS2DObject>();
  private selected: Target | null = null;
  private quality: QualityPreset;
  private readonly seed: number;
  private exposure = 20;
  private diffuseGain = 4;
  private autoExposure = 1;
  private loading = new Set<string>();
  private readonly labelScratch = new Vector3();
  private readonly labelScratch2 = new Vector3();

  jd = dateToJulian(new Date());
  timeRate = 1;
  paused = false;

  private raf = 0;
  private lastFrame = performance.now();
  private lastHud = 0;
  private frames = 0;
  private fps = 0;
  private fpsTime = performance.now();
  private disposed = false;

  constructor(private readonly opts: EngineOptions) {
    this.quality = opts.quality ?? 'medium';
    this.seed = opts.seed ?? 20_251_028;
    const q = QUALITY[this.quality];

    this.renderer = new WebGLRenderer({ canvas: opts.canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor(0x000000, 1);

    this.camera = new PerspectiveCamera(60, 1, 1e-3, 1e21);
    this.camera.position.set(0, 0, 0);

    this.labels = new CSS2DRenderer({ element: opts.labelRoot });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.35, 0.85);
    this.bloom.enabled = q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.rig = new CameraRig(opts.canvas);
    this.rig.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.scene.add(this.solar.group);
    this.cells = new GridStreamer([this.cellMaterial, this.cellHazeMaterial], this.cellOptions());
    this.nearTiles = new GridStreamer([this.nearMaterial], this.tileOptions('near'));
    this.farTiles = new GridStreamer([this.farMaterial], this.tileOptions('far'));
    this.clusters = new GlobularClusterLayer(this.pool, this.clusterAggregateMaterial, this.clusterStarMaterial, this.clusterHazeMaterial, {
      seed: this.seed,
      cap: q.clusterCap,
    });
    for (const layer of [this.cells, this.nearTiles, this.farTiles, this.clusters]) this.scene.add(layer.group);
    this.sky = new SkyMode(this.skyPointMaterial, this.solar);
    this.scene.add(this.sky.group);
    this.nebulae = new NebulaLayer(this.pool, this.shared, this.seed);
    this.scene.add(this.nebulae.group);
    this.exoplanets = new ExoplanetLayer(this.catalogMaterial, (id) => this.select(id));
    this.scene.add(this.exoplanets.group);
    this.applyFades();

    // Sgr A*: a black sphere at the event-horizon scale.
    const sgrA = new Mesh(new SphereGeometry(1.27e7, 48, 24), new MeshBasicMaterial({ color: 0x000000 }));
    sgrA.name = 'sgr-a-star';
    this.scene.add(sgrA);
    this.sgrA = sgrA;

    const sunRgb = teffToLinearRgb(5772).map((c) => Math.round(c * 255));
    this.sunPoint = new StarBatch(
      { count: 1, positions: new Float32Array(3), colors: new Uint8Array(sunRgb), absMag: new Float32Array([SUN_ABS_MAG_V]) },
      SUN_GALACTOCENTRIC_PC,
      this.sunMaterial,
      false,
    );
    this.scene.add(this.sunPoint.points);

    this.targets = buildTargets(this.solar);
    for (const t of this.targets) {
      this.targetById.set(t.id, t);
      if (t.labelRange > 0) this.addLabel(t);
    }

    this.solar.update(this.jd);
    const sun = this.solar.sunWorld;
    this.rig.target.copy(sun);
    this.rig.distance = 25 * 149_597_870.7;
    this.rig.pitch = 0.45;
    this.rig.follow = () => sun;

    this.shared.uDustSteps.value = q.dustSteps;
    this.dustReady = this.loadDust();
    this.applyPixelSizes();
    this.loadGlow();
    void this.loadCatalog();
    void this.loadExoplanetCatalog();

    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  private addLabel(t: Target): void {
    const el = document.createElement('button');
    el.className = `vl-label vl-label--${t.kind}`;
    el.dataset.label = t.id;
    el.textContent = t.name;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.select(t.id);
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.flyTo(t.id);
    });
    const obj = new CSS2DObject(el);
    obj.center.set(-0.08, 0.5);
    this.scene.add(obj);
    this.labelObjects.set(t.id, obj);
  }

  private async loadDust(): Promise<DustMap | null> {
    this.loading.add('Dust');
    try {
      const map = await this.pool.buildDustMap();
      if (this.disposed) return null;
      const half = new Uint16Array(map.data.length);
      for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(map.data[i]!);
      const tex = new DataTexture(half, map.size, map.size, RedFormat, HalfFloatType);
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.needsUpdate = true;
      this.shared.uDustMap.value.dispose();
      this.shared.uDustMap.value = tex;
      this.shared.uDustOn.value = this.dustEnabled ? 1 : 0;
      this.dustMap = map;
      this.nebulae.setDust(map);
      this.exoplanets.setDust(map);
      // The selected object's details gain the modeled extinction now that it can be computed.
      if (this.selected) this.opts.onSelect?.(this.summary(this.selected));
      return map;
    } catch (err) {
      if (!this.disposed) console.error('Dust model failed', err);
      return null;
    } finally {
      this.loading.delete('Dust');
    }
  }

  private async loadExoplanetCatalog(): Promise<void> {
    if (!this.opts.exoplanetsUrl) return;
    this.loading.add('Exoplanets');
    const catalog = await loadExoplanets(this.opts.exoplanetsUrl);
    this.loading.delete('Exoplanets');
    if (!catalog || this.disposed) return;
    const added = this.exoplanets.setCatalog(catalog, this.targetById);
    if (this.dustMap) this.exoplanets.setDust(this.dustMap);
    for (const t of added) {
      this.targets.push(t);
      this.targetById.set(t.id, t);
      if (t.labelRange > 0) this.addLabel(t);
    }
    this.opts.onTargetsChanged?.(this.getTargets());
    this.opts.onExoplanets?.(catalog);
  }

  private loadGlow(): void {
    this.loading.add('Galaxy model');
    const count = QUALITY[this.quality].glow;
    this.pool
      .generateGlow({ count, seed: this.seed })
      .then((buf) => {
        if (this.disposed) return;
        if (this.glow) {
          this.scene.remove(this.glow.points);
          this.glow.dispose();
        }
        this.exposureMeter.setGlow(buf);
        this.glow = starBatchFromBuffers(buf, this.glowMaterial, false);
        this.scene.add(this.glow.points);
        this.loading.delete('Galaxy model');
      })
      .catch((err: unknown) => {
        if (!this.disposed) console.error('Galaxy model generation failed', err);
      });
  }

  private async loadCatalog(): Promise<void> {
    this.loading.add('Star catalogue');
    const [hip, dust] = await Promise.all([this.opts.hipparcosUrl ? loadHipparcos(this.opts.hipparcosUrl) : null, this.dustReady]);
    if (this.disposed) return;

    // Named stars are always drawn when Hipparcos lacks them (faint or missing entries).
    const named = NAMED_STARS.filter((s) => !hip || s.vmag > 12);
    const n = (hip?.count ?? 0) + named.length;
    const positions = new Float32Array(n * 3);
    const colors = new Uint8Array(n * 3);
    const absMag = new Float32Array(n);
    let i = 0;
    if (hip) {
      positions.set(hip.positions);
      colors.set(hip.colors);
      absMag.set(hip.absMag);
      i = hip.count;
    }
    const push = (pos: Vec3, rgb: [number, number, number], m: number) => {
      positions.set(pos, i * 3);
      colors.set(rgb.map((c) => Math.round(c * 255)), i * 3);
      absMag[i++] = m;
    };
    const sun = SUN_GALACTOCENTRIC_PC;
    for (const s of named) {
      const p = raDecDistToGalactocentric(s.ra, s.dec, s.distPc);
      push([p[0] - sun[0], p[1] - sun[1], p[2] - sun[2]], teffToLinearRgb(bvToTeff(s.bv)), absoluteMagnitude(s.vmag, s.distPc));
    }
    if (dust) deredden(dust, positions, colors, absMag, i);

    this.catalog = new StarBatch({ count: i, positions, colors, absMag }, sun, this.catalogMaterial, false);
    this.scene.add(this.catalog.points);
    this.catalogSource = hip ? 'hipparcos' : 'named';
    if (hip) this.cells.reset(this.cellOptions());
    this.loading.delete('Star catalogue');
  }

  private cellOptions(): GridLayerOptions {
    const q = QUALITY[this.quality];
    const realCatalogMagLimit = this.catalogSource === 'hipparcos' ? HIPPARCOS_COMPLETE_TO_VMAG : NAMED_STARS_COMPLETE_TO_VMAG;
    return {
      sizePc: CELL_SIZE_PC,
      reach: q.cellReach,
      // Cells are sorted brightest-first; outer rings draw only their brightest stars.
      ringFraction: (ring) => (ring <= 1 ? 1 : ring === 2 ? 0.35 : ring === 3 ? 0.15 : 0.08),
      load: (ix, iy, iz) =>
        this.pool.generateCell({ ix, iy, iz, cap: q.cellCap, seed: this.seed, realCatalogMagLimit }).then((b) => [b, b.haze]),
    };
  }

  private tileOptions(level: 'near' | 'far'): GridLayerOptions {
    const t = QUALITY[this.quality][level];
    return {
      sizePc: t.sizePc,
      reach: 1,
      maxInFlight: 4,
      load: (ix, iy, iz) => this.pool.generateTile({ ix, iy, iz, sizePc: t.sizePc, particleLum: t.particleLum, cap: t.cap, seed: this.seed }).then((b) => [b]),
    };
  }

  /**
   * Cross-fades between the level-of-detail shells. Each layer hands over to the next
   * coarser one over the same distance range, so the weights always sum to one and a
   * region's brightness doesn't change as it moves between layers.
   */
  private fadeOf(layer: GridStreamer): [number, number] {
    return [layer.guaranteedKm * FADE_FRACTION[0], layer.guaranteedKm * FADE_FRACTION[1]];
  }

  private applyFades(): void {
    const cell = this.fadeOf(this.cells);
    const near = this.fadeOf(this.nearTiles);
    const far = this.fadeOf(this.farTiles);
    setFades(this.cellMaterial, null, cell);
    setFades(this.cellHazeMaterial, null, cell);
    setFades(this.nearMaterial, cell, near);
    setFades(this.farMaterial, near, far);
    setFades(this.glowMaterial, far, null);
  }

  // --- Public API -------------------------------------------------------------------

  setQuality(q: QualityPreset): void {
    if (q === this.quality) return;
    this.quality = q;
    const p = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.maxPixelRatio));
    this.bloom.enabled = p.bloom;
    this.shared.uDustSteps.value = p.dustSteps;
    this.cells.reset(this.cellOptions());
    this.nearTiles.reset(this.tileOptions('near'));
    this.farTiles.reset(this.tileOptions('far'));
    this.clusters.setCap(p.clusterCap);
    this.applyFades();
    this.applyPixelSizes();
    this.resize();
    this.loadGlow();
  }

  setExposure(ev: number): void {
    this.exposure = ev;
  }

  /** Brightness of unresolved light (the Milky Way glow) relative to resolved stars. */
  setDiffuseGain(gain: number): void {
    this.diffuseGain = gain;
  }

  setBloom(on: boolean): void {
    this.bloom.enabled = on;
  }

  setOrbitsVisible(on: boolean): void {
    this.solar.setOrbitsVisible(on);
  }

  setLabelsVisible(on: boolean): void {
    this.opts.labelRoot.style.display = on ? '' : 'none';
  }

  setLayerVisible(layer: LayerId, on: boolean): void {
    if (layer === 'dust') {
      this.dustEnabled = on;
      this.shared.uDustOn.value = on && this.dustMap ? 1 : 0;
    } else if (layer === 'exoplanets') {
      this.exoplanets.setMarkersVisible(on);
    } else if (layer === 'nebulae') {
      this.nebulae.visible = on;
      if (on) this.hiddenKinds.delete('nebula');
      else this.hiddenKinds.add('nebula');
    } else if (layer === 'clusters') {
      this.clusters.group.visible = on;
      if (on) this.hiddenKinds.delete('cluster');
      else this.hiddenKinds.add('cluster');
    } else {
      if (on) this.hiddenKinds.delete('region');
      else this.hiddenKinds.add('region');
    }
  }

  setTime(jd: number): void {
    this.jd = jd;
  }

  /** Nebula colours: true emission-line colours, or the Hubble ([S II], Halpha, [O III]) palette. */
  setNebulaPalette(p: 'scientific' | 'enhanced'): void {
    this.nebulae.setPalette(p);
  }

  /** Filter the exoplanet host markers in 3D (e.g. to the planets known by a given year). */
  setExoplanetHostFilter(keep: ((h: ExoHost) => boolean) | null): void {
    this.exoplanets.setHostFilter(keep);
  }

  setHabitableZonesVisible(on: boolean): void {
    this.exoplanets.setHabitableZoneVisible(on);
  }

  /**
   * Stars for the Hertzsprung-Russell diagram: named stars and exoplanet hosts (real,
   * de-reddened with the dust model) over a synthetic population of the neighbourhood.
   */
  async hrData(mode: 'volume' | 'visible'): Promise<HrData> {
    const modeled = await this.pool.samplePopulation(mode, 4000, this.seed);
    const real: HrStar[] = [];
    for (const s of NAMED_STARS) {
      const av = this.extinctionFromSun(raDecDistToGalactocentric(s.ra, s.dec, s.distPc)) ?? 0;
      const p = starPhysics(s.vmag, s.distPc, s.bv, s.spectralType, av);
      real.push({ id: s.id, name: s.name, teffK: p.teffK, absMagV: p.absMagV, stage: p.stage, source: 'named' });
    }
    const named = new Set(real.map((r) => r.id));
    for (const h of this.exoplanets.catalog?.hosts ?? []) {
      if (h.teffK === null || h.vmag === null || h.distPc === null) continue;
      const id = this.exoplanets.targetIdOf(h.id);
      if (named.has(id)) continue;
      real.push({ id, name: h.name, teffK: h.teffK, absMagV: h.vmag - 5 * Math.log10(h.distPc / 10), stage: null, source: 'host' });
    }
    return { real, modeled };
  }

  /** Display brightness of nebulae (a long-exposure look; 1 = their true surface brightness). */
  setNebulaBrightness(boost: number): void {
    this.nebulae.boost = boost;
  }

  get view(): ViewMode {
    return this.viewMode;
  }

  /** Switch between flying through the Galaxy and standing on the Earth looking up. */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    const earth = this.solar.bodies.get('earth')!;
    if (mode === 'sky') {
      this.galaxyCamera = { distance: this.rig.distance, yaw: this.rig.yaw, pitch: this.rig.pitch };
      this.rig.cancelFlight();
      this.rig.mode = 'sky';
      this.rig.skyFrame = this.sky.updateFrame(this.jd);
      // The view from the ground: the Earth's globe would only get in the way of the horizon.
      earth.mesh.visible = false;
      this.sky.setActive(true);
    } else {
      this.rig.mode = 'orbit';
      this.rig.skyFrame = null;
      earth.mesh.visible = true;
      this.sky.setActive(false);
      this.skyDim = 1;
      // Back above the Earth, looking down on where we stood.
      this.rig.target.copy(earth.world);
      this.rig.follow = () => earth.world;
      this.rig.minDistance = earth.info.radiusKm * 1.05;
      this.rig.distance = Math.max(this.galaxyCamera?.distance ?? 0, earth.info.radiusKm * 4);
      if (this.galaxyCamera) {
        this.rig.yaw = this.galaxyCamera.yaw;
        this.rig.pitch = this.galaxyCamera.pitch;
      }
    }
    this.applyFov();
  }

  get location(): GeoLocation {
    return this.sky.location;
  }

  setLocation(loc: GeoLocation): void {
    this.sky.location = { ...loc };
  }

  setSkyLayers(layers: Partial<SkyLayers>): void {
    this.sky.setLayers(layers);
  }

  /** Where to find an object in the observer's sky, with rise, transit and set times. */
  async whereToFind(id: string): Promise<WhereToFind | null> {
    const t = this.targetById.get(id);
    if (!t || t.id === 'earth' || t.id === 'milky-way' || t.kind === 'region') return null;
    this.sky.updateFrame(this.jd);
    const solarBody = t.kind === 'planet' || t.kind === 'dwarf-planet' || t.id === 'moon' || t.id === 'sun';
    const body = solarBody ? (t.id as Parameters<SkyMode['whereToFind']>[0]['body']) : undefined;
    return this.sky.whereToFind({ body, worldKm: t.position().clone(), mag: t.apparentMag ?? null, obscured: t.obscured }, this.jd);
  }

  /** Sun, Moon, planets and the Galactic centre for the observer, now and their next rise/set. */
  skyTonight(): Promise<TonightRow[]> {
    this.sky.updateFrame(this.jd);
    return this.sky.tonight(this.jd, [0, 0, 0]);
  }

  /** Next pass of a satellite (e.g. 25544, the ISS) over the observer. */
  satellitePass(noradId: number) {
    return this.sky.nextPass(noradId, this.jd);
  }

  /** All targets, for search and lists (details without the derived and modeled extras). */
  getTargets(): TargetSummary[] {
    return this.targets.map((t) => ({ id: t.id, name: t.name, kind: t.kind, subtitle: t.subtitle, provenance: t.provenance, facts: t.facts, details: t.details }));
  }

  select(id: string | null): void {
    this.selected = id ? (this.targetById.get(id) ?? null) : null;
    for (const [tid, obj] of this.labelObjects) obj.element.classList.toggle('is-selected', tid === id);
    this.opts.onSelect?.(this.selected ? this.summary(this.selected) : null);
  }

  flyTo(id: string): void {
    const t = this.targetById.get(id);
    if (!t) return;
    this.select(id);
    if (this.viewMode === 'sky') {
      // From the ground "going there" means turning to look at it.
      if (t.id === 'earth') return;
      const { alt, az } = this.sky.altAzOf(t.position());
      // Below the horizon: face the point where it will rise rather than the ground.
      this.rig.lookAt(alt > 0 ? alt : 12, az);
      return;
    }
    this.rig.minDistance = Math.max(0.001, t.radiusKm * 1.05);
    const from = t.approachFrom ? CameraRig.anglesFor(t.approachFrom) : null;
    this.rig.flyTo(t.position, t.viewDistanceKm, from ? { pitch: from.pitch, yaw: from.yaw } : { pitch: t.pitch });
  }

  /** Modeled V-band extinction from the Sun to a Galactocentric point (pc), or null before the dust map loads. */
  extinctionFromSun(galPc: Vec3): number | null {
    if (!this.dustMap) return null;
    const s = SUN_GALACTOCENTRIC_PC;
    return extinctionV(this.dustMap, [s[0] / 1000, s[1] / 1000, s[2] / 1000], [galPc[0] / 1000, galPc[1] / 1000, galPc[2] / 1000]);
  }

  private summary(t: Target): TargetSummary {
    const av = t.galPc && t.kind !== 'region' ? this.extinctionFromSun(t.galPc) : null;
    const details = t.star ? { ...t.details, ...starPhysicsDetails(t.star, av) } : { ...t.details };
    if (av !== null) details['Extinction from Sun (model)'] = `A_V ≈ ${av < 10 ? av.toFixed(2) : av.toFixed(0)} mag`;
    return { id: t.id, name: t.name, kind: t.kind, subtitle: t.subtitle, provenance: t.provenance, facts: t.facts, details };
  }

  // --- Frame loop -------------------------------------------------------------------

  private applyPixelSizes(): void {
    this.shared.uPixelRatio.value = this.renderer.getPixelRatio();
    this.exoplanets?.setPixelRatio(this.renderer.getPixelRatio());
  }

  private resize = (): void => {
    const canvas = this.opts.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyFov(true);
  };

  /** Field of view: fixed in the galaxy view, zoomable in the sky view. */
  private applyFov(force = false): void {
    const fov = this.viewMode === 'sky' ? this.rig.sky.fov : 60;
    if (!force && Math.abs(fov - this.camera.fov) < 1e-6) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const h = this.opts.canvas.clientHeight || window.innerHeight;
    this.shared.uPixelsPerRadian.value = h / (2 * Math.tan((fov * Math.PI) / 360));
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!this.paused) this.jd += (dt * this.timeRate) / 86_400;
    this.solar.update(this.jd);
    if (this.viewMode === 'sky') this.rig.skyFrame = this.sky.updateFrame(this.jd);
    this.rig.update(dt);

    const cam = this.rig.position;
    this.applyFov();
    this.camera.quaternion.copy(this.rig.quaternion);
    this.camera.updateMatrixWorld();
    if (this.viewMode === 'sky') this.skyDim = this.sky.update(this.jd, cam, this.camera.fov);

    this.solar.rebase(cam);
    this.sgrA.position.set(-cam.x, -cam.y, -cam.z);
    this.glow?.rebase(cam);
    this.catalog?.rebase(cam);
    this.sunPoint.rebase(cam);
    const camGal = worldKmToGalPc(cam);
    this.shared.uCamGalKpc.value.set(camGal[0] / 1000, camGal[1] / 1000, camGal[2] / 1000);
    this.cells.update(camGal, cam);
    this.nearTiles.update(camGal, cam);
    this.farTiles.update(camGal, cam);
    this.clusters.update(camGal, cam);

    // Exposure adapts to how much galactic light reaches the camera (inside vs outside).
    this.autoExposure = this.exposureMeter.update(dt, camGal, this.rig.reducedMotion);
    this.shared.uExposure.value = this.exposure * this.autoExposure * this.skyDim;
    // Outside the Galaxy all light is unresolved and the auto exposure already brightens
    // it, so the extra diffuse gain (an inside-the-disc perception effect) eases off.
    this.shared.uDiffuseGain.value = 1 + (this.diffuseGain - 1) / Math.max(1, this.autoExposure);
    this.exoplanets.jd = this.jd;
    this.exoplanets.update(cam, this.selected?.id ?? null);
    this.nebulae.update(cam, camGal, this.shared.uPixelsPerRadian.value, this.renderer.getPixelRatio(), QUALITY[this.quality].nebulaSteps);

    this.updateLabels(cam);
    this.cullLabelsBehindCamera();

    this.composer.render(dt);
    this.labels.render(this.scene, this.camera);

    this.frames++;
    if (now - this.fpsTime > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime);
      this.frames = 0;
      this.fpsTime = now;
    }
    if (now - this.lastHud > 100) {
      this.lastHud = now;
      this.opts.onHud?.(this.buildHud(camGal));
    }
  };

  /**
   * CSS labels behind the camera would be mirrored onto the screen: with a far plane of
   * 1e21 km their projected depth rounds to exactly 1, which the label renderer accepts.
   */
  private cullLabelsBehindCamera(): void {
    const forward = this.labelScratch.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const p = this.labelScratch2;
    this.scene.traverseVisible((o) => {
      if (o instanceof CSS2DObject && o.getWorldPosition(p).dot(forward) <= 0) o.visible = false;
    });
  }

  private updateLabels(cam: Vector3): void {
    for (const [id, obj] of this.labelObjects) {
      const t = this.targetById.get(id)!;
      const p = t.position();
      obj.position.set(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const d = obj.position.length();
      // Hide when out of range, or when we're right on top of it (the body fills the view).
      // Star labels would clutter planetary-scale views.
      const sky = this.viewMode === 'sky';
      const planetaryZoom = !sky && (t.kind === 'star' || t.kind === 'cluster') && id !== 'sun' && this.rig.distance < 5000 * KM_PER_AU;
      // Spiral arms are labelled only in zoomed-out, galaxy-scale views; from the ground,
      // nothing below the horizon is labelled.
      const hidden =
        this.hiddenKinds.has(t.kind) ||
        (t.kind === 'region' && (sky || this.rig.distance < ARM_LABEL_MIN_ZOOM_KM)) ||
        (sky && this.sky.altAzOf(p).alt < 0);
      obj.visible = !hidden && ((d < t.labelRange && d > t.radiusKm * 3 && !planetaryZoom) || this.selected?.id === id);
      if (id === 'sun') {
        const text = d > 200 * KM_PER_PC ? 'Sun · you are here' : 'Sun';
        if (obj.element.textContent !== text) obj.element.textContent = text;
      }
    }
  }

  private buildHud(camGal: Vec3): Hud {
    const lbd = galactocentricToLbd(camGal);
    const kpc = camGal.map((c) => c / 1000) as Vec3;
    const cam = this.rig.position;
    let nearest: Hud['nearest'] = null;
    let nearestTarget: Target | null = null;
    for (const t of this.targets) {
      if (t.kind === 'galaxy' || t.kind === 'region') continue;
      const d = t.position().distanceTo(cam);
      // From outside the planetary system, report the Sun rather than an individual planet.
      if ((t.kind === 'planet' || t.kind === 'dwarf-planet' || t.kind === 'moon') && d > 2000 * KM_PER_AU) continue;
      if (!nearest || d < nearest.distanceKm) {
        nearest = { id: t.id, name: t.name, distanceKm: Math.max(0, d - t.radiusKm) };
        nearestTarget = t;
      }
    }
    // Inside a globular cluster (within ~10 half-light radii), name the cluster as the region.
    const inCluster = nearestTarget?.kind === 'cluster' && nearest!.distanceKm < Math.max(30 * KM_PER_PC, 10 * nearestTarget.radiusKm);
    const h = this.opts.canvas.clientHeight || 1;
    const insideNebula = this.nebulae.containing(camGal);
    const sky = this.viewMode === 'sky';
    const kmPerPixel = sky ? 0 : (2 * this.rig.distance * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    const pendingTiles = this.nearTiles.pending + this.farTiles.pending;
    return {
      jd: this.jd,
      timeRate: this.timeRate,
      paused: this.paused,
      galactocentricPc: camGal,
      l: lbd.l,
      b: lbd.b,
      dPc: lbd.d,
      region: this.exoplanets.activeSystem
        ? `${this.exoplanets.activeSystem.name} planetary system`
        : insideNebula
          ? `Inside the ${insideNebula.name}`
          : inCluster ? `${nearestTarget!.name} (globular cluster)` : regionName(kpc[0], kpc[1], kpc[2]),
      modeled: lbd.d > CATALOG_REACH_PC,
      nearest,
      targetName: this.selected?.name ?? null,
      distanceToTargetKm: this.rig.distance,
      speedKmS: this.rig.speedKmS,
      kmPerPixel,
      fps: this.fps,
      autoExposure: this.autoExposure,
      stars: {
        glow: this.glow?.count ?? 0,
        tiles: this.nearTiles.starCount + this.farTiles.starCount,
        cells: this.cells.starCount + this.clusters.starCount,
        catalog: this.catalog?.count ?? 0,
        catalogSource: this.catalogSource,
      },
      loading: [
        ...this.loading,
        ...(this.cells.pending > 0 ? [`Star cells (${this.cells.pending})`] : []),
        ...(pendingTiles > 0 ? [`Galaxy tiles (${pendingTiles})`] : []),
        ...(this.clusters.pending > 0 ? ['Cluster stars'] : []),
      ],
      view: this.viewMode,
      sky: sky ? this.sky.hud(this.rig.sky.alt, this.rig.sky.az, this.rig.sky.fov) : null,
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.rig.dispose();
    this.pool.dispose();
    for (const layer of [this.cells, this.nearTiles, this.farTiles, this.clusters]) layer.dispose();
    this.sky.dispose();
    this.nebulae.dispose();
    this.exoplanets.dispose();
    this.glow?.dispose();
    this.catalog?.dispose();
    this.shared.uDustMap.value.dispose();
    for (const obj of this.labelObjects.values()) obj.element.remove();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

/**
 * Real catalogue magnitudes and colours already include the dust between the star and the
 * Sun. Remove the modeled extinction so the shader can apply the right amount from
 * wherever the camera is (from the Sun the two cancel exactly).
 */
function deredden(dust: DustMap, positions: Float32Array, colors: Uint8Array, absMag: Float32Array, n: number): void {
  const s = SUN_GALACTOCENTRIC_PC;
  const sun: Vec3 = [s[0] / 1000, s[1] / 1000, s[2] / 1000];
  for (let i = 0; i < n; i++) {
    const star: Vec3 = [sun[0] + positions[i * 3]! / 1000, sun[1] + positions[i * 3 + 1]! / 1000, sun[2] + positions[i * 3 + 2]! / 1000];
    const av = extinctionV(dust, sun, star, 16);
    if (av < 1e-3) continue;
    absMag[i] = absMag[i]! - av;
    let max = 0;
    const rgb = DUST.rgb.map((k, c) => {
      const v = colors[i * 3 + c]! * 10 ** (0.4 * av * (k - 1));
      max = Math.max(max, v);
      return v;
    });
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = Math.round((rgb[c]! / max) * 255);
  }
}
