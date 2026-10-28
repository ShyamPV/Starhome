import {
  KM_PER_AU,
  KM_PER_KPC,
  SUN_ABS_MAG_V,
  SUN_GALACTOCENTRIC_PC,
  absoluteMagnitude,
  bvToTeff,
  dateToJulian,
  galactocentricToLbd,
  raDecDistToGalactocentric,
  teffToLinearRgb,
  type Vec3,
} from '@starhome/astro';
import { HIPPARCOS_COMPLETE_TO_VMAG, NAMED_STARS, NAMED_STARS_COMPLETE_TO_VMAG, loadHipparcos } from '@starhome/data';
import { GalaxyWorkerPool, regionName } from '@starhome/galaxy';
import {
  ACESFilmicToneMapping,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type ShaderMaterial,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CameraRig } from './cameraRig';
import { worldKmToGalPc } from './frames';
import { SolarSystem } from './solarSystem';
import { createStarMaterial } from './starMaterial';
import { CellStreamer, StarBatch, starBatchFromBuffers } from './starLayers';
import { buildTargets, type Target } from './targets';

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY: Record<QualityPreset, { glow: number; cellCap: number; reach: number; bloom: boolean; maxPixelRatio: number }> = {
  low: { glow: 300_000, cellCap: 1200, reach: 2, bloom: false, maxPixelRatio: 1 },
  medium: { glow: 800_000, cellCap: 2500, reach: 3, bloom: true, maxPixelRatio: 1.5 },
  high: { glow: 1_600_000, cellCap: 4000, reach: 3, bloom: true, maxPixelRatio: 2 },
  ultra: { glow: 3_000_000, cellCap: 8000, reach: 4, bloom: true, maxPixelRatio: 2 },
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
  stars: { glow: number; cells: number; catalog: number; catalogSource: 'hipparcos' | 'named' | 'loading' };
  loading: string[];
}

export interface TargetSummary {
  id: string;
  name: string;
  kind: Target['kind'];
  subtitle: string;
  provenance: Target['provenance'];
  facts: string[];
  details: Record<string, string>;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  labelRoot: HTMLElement;
  quality?: QualityPreset;
  hipparcosUrl?: string;
  seed?: number;
  onHud?: (hud: Hud) => void;
  onSelect?: (target: TargetSummary | null) => void;
}

/** Real catalogue coverage: beyond this distance from the Sun the scene is mostly modeled. */
const CATALOG_REACH_PC = 300;

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
  private readonly glowMaterial = createStarMaterial({ soft: true, smoothingPc: 25 });
  private readonly cellMaterial = createStarMaterial();
  private readonly catalogMaterial = createStarMaterial();
  /** The Sun as a point of light, faded in only once we are well outside the planetary system. */
  private readonly sunMaterial = createStarMaterial({ fadeIn: [300 * KM_PER_AU, 20_000 * KM_PER_AU] });
  private readonly sunPoint: StarBatch;
  private readonly cells: CellStreamer;
  private readonly sgrA: Mesh;
  private glow: StarBatch | null = null;
  private catalog: StarBatch | null = null;
  private catalogSource: Hud['stars']['catalogSource'] = 'loading';
  private readonly targets: Target[];
  private readonly targetById = new Map<string, Target>();
  private readonly labelObjects = new Map<string, CSS2DObject>();
  private selected: Target | null = null;
  private quality: QualityPreset;
  private readonly seed: number;
  private exposure = 8;
  private loading = new Set<string>();

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
    this.cells = new CellStreamer(this.pool, this.cellMaterial, {
      reach: q.reach,
      cap: q.cellCap,
      seed: this.seed,
      realCatalogMagLimit: NAMED_STARS_COMPLETE_TO_VMAG,
    });
    this.scene.add(this.cells.group);

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

    this.applyPixelSizes();
    this.loadGlow();
    void this.loadCatalog();

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
    const hip = this.opts.hipparcosUrl ? await loadHipparcos(this.opts.hipparcosUrl) : null;
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

    this.catalog = new StarBatch({ count: i, positions, colors, absMag }, sun, this.catalogMaterial, false);
    this.scene.add(this.catalog.points);
    this.catalogSource = hip ? 'hipparcos' : 'named';
    if (hip) this.cells.reset(this.cellOptions());
    this.loading.delete('Star catalogue');
  }

  private cellOptions() {
    const q = QUALITY[this.quality];
    return {
      reach: q.reach,
      cap: q.cellCap,
      seed: this.seed,
      realCatalogMagLimit: this.catalogSource === 'hipparcos' ? HIPPARCOS_COMPLETE_TO_VMAG : NAMED_STARS_COMPLETE_TO_VMAG,
    };
  }

  // --- Public API -------------------------------------------------------------------

  setQuality(q: QualityPreset): void {
    if (q === this.quality) return;
    this.quality = q;
    const p = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.maxPixelRatio));
    this.bloom.enabled = p.bloom;
    this.cells.reset(this.cellOptions());
    this.applyPixelSizes();
    this.resize();
    this.loadGlow();
  }

  setExposure(ev: number): void {
    this.exposure = ev;
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

  setTime(jd: number): void {
    this.jd = jd;
  }

  getTargets(): TargetSummary[] {
    return this.targets.map((t) => this.summary(t));
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
    this.rig.minDistance = Math.max(0.001, t.radiusKm * 1.05);
    this.rig.flyTo(t.position, t.viewDistanceKm, { pitch: t.pitch });
  }

  private summary(t: Target): TargetSummary {
    return { id: t.id, name: t.name, kind: t.kind, subtitle: t.subtitle, provenance: t.provenance, facts: t.facts, details: t.details };
  }

  // --- Frame loop -------------------------------------------------------------------

  private applyPixelSizes(): void {
    const pr = this.renderer.getPixelRatio();
    for (const m of [this.glowMaterial, this.cellMaterial, this.catalogMaterial, this.sunMaterial] as ShaderMaterial[]) {
      m.uniforms.uPixelRatio!.value = pr;
    }
    this.glowMaterial.uniforms.uMinSize!.value = 2.6;
    this.glowMaterial.uniforms.uMaxSize!.value = 64;
  }

  private resize = (): void => {
    const canvas = this.opts.canvas;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.glowMaterial.uniforms.uPixelsPerRadian!.value = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (!this.paused) this.jd += (dt * this.timeRate) / 86_400;
    this.solar.update(this.jd);
    this.rig.update(dt);

    const cam = this.rig.position;
    this.camera.quaternion.copy(this.rig.quaternion);
    this.camera.updateMatrixWorld();

    this.solar.rebase(cam);
    this.sgrA.position.set(-cam.x, -cam.y, -cam.z);
    this.glow?.rebase(cam);
    this.catalog?.rebase(cam);
    this.sunPoint.rebase(cam);
    const camGal = worldKmToGalPc(cam);
    this.cells.update(camGal, cam);

    // Exposure: the glow particles hand over to resolved stars near the camera, and are
    // boosted when viewing the whole Galaxy from outside so surface brightness holds.
    const coverage = this.cells.coverageKm;
    const dGcKpc = cam.length() / KM_PER_KPC;
    const outside = Math.max(1, dGcKpc / 9) ** 2;
    const glowU = this.glowMaterial.uniforms;
    glowU.uExposure!.value = this.exposure * outside;
    (glowU.uFadeIn!.value as number[])[0] = coverage * 0.6;
    (glowU.uFadeIn!.value as number[])[1] = coverage * 2.5;
    const cellU = this.cellMaterial.uniforms;
    cellU.uExposure!.value = this.exposure;
    (cellU.uFadeOut!.value as number[])[0] = coverage * 0.6;
    (cellU.uFadeOut!.value as number[])[1] = coverage * 0.95;
    this.catalogMaterial.uniforms.uExposure!.value = this.exposure;
    this.sunMaterial.uniforms.uExposure!.value = this.exposure;

    this.updateLabels(cam);

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

  private updateLabels(cam: Vector3): void {
    for (const [id, obj] of this.labelObjects) {
      const t = this.targetById.get(id)!;
      const p = t.position();
      obj.position.set(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      const d = obj.position.length();
      // Hide when out of range, or when we're right on top of it (the body fills the view).
      // Star labels would clutter planetary-scale views.
      const planetaryZoom = t.kind === 'star' && id !== 'sun' && this.rig.distance < 5000 * KM_PER_AU;
      obj.visible = (d < t.labelRange && d > t.radiusKm * 3 && !planetaryZoom) || this.selected?.id === id;
      if (id === 'sun') {
        const text = d > 0.2 * KM_PER_KPC ? 'Sun · you are here' : 'Sun';
        if (obj.element.textContent !== text) obj.element.textContent = text;
      }
    }
  }

  private buildHud(camGal: Vec3): Hud {
    const lbd = galactocentricToLbd(camGal);
    const kpc = camGal.map((c) => c / 1000) as Vec3;
    const cam = this.rig.position;
    let nearest: Hud['nearest'] = null;
    for (const t of this.targets) {
      if (t.kind === 'galaxy') continue;
      const d = t.position().distanceTo(cam);
      // From outside the planetary system, report the Sun rather than an individual planet.
      if ((t.kind === 'planet' || t.kind === 'dwarf-planet' || t.kind === 'moon') && d > 2000 * KM_PER_AU) continue;
      if (!nearest || d < nearest.distanceKm) nearest = { id: t.id, name: t.name, distanceKm: Math.max(0, d - t.radiusKm) };
    }
    const h = this.opts.canvas.clientHeight || 1;
    const kmPerPixel = (2 * this.rig.distance * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    return {
      jd: this.jd,
      timeRate: this.timeRate,
      paused: this.paused,
      galactocentricPc: camGal,
      l: lbd.l,
      b: lbd.b,
      dPc: lbd.d,
      region: regionName(kpc[0], kpc[1], kpc[2]),
      modeled: lbd.d > CATALOG_REACH_PC,
      nearest,
      targetName: this.selected?.name ?? null,
      distanceToTargetKm: this.rig.distance,
      speedKmS: this.rig.speedKmS,
      kmPerPixel,
      fps: this.fps,
      stars: {
        glow: this.glow?.count ?? 0,
        cells: this.cells.starCount,
        catalog: this.catalog?.count ?? 0,
        catalogSource: this.catalogSource,
      },
      loading: [...this.loading, ...(this.cells.pending > 0 ? [`Star cells (${this.cells.pending})`] : [])],
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.rig.dispose();
    this.pool.dispose();
    this.cells.dispose();
    this.glow?.dispose();
    this.catalog?.dispose();
    for (const obj of this.labelObjects.values()) obj.element.remove();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

