import { DEG, sphericalToCartesian, type Vec3 } from '@starhome/astro';
import { CONSTELLATIONS } from '@starhome/data';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { eclipticToRender, equatorialToRender, galToRender } from './frames';

/**
 * Camera-centred radii (km) of the sky view's parts. The ground is nearest, so it hides
 * everything below the horizon (lines, stars, planets) through the depth test.
 */
const GROUND_KM = 5;
const LINES_KM = 8;
const DOME_KM = 9;

export interface SkyLayers {
  constellations: boolean;
  constellationNames: boolean;
  altAzGrid: boolean;
  equatorialGrid: boolean;
  ecliptic: boolean;
  galacticEquator: boolean;
  satellites: boolean;
  /** Daylight and twilight sky (and the dimming of stars it causes). */
  atmosphere: boolean;
}

export const DEFAULT_SKY_LAYERS: SkyLayers = {
  constellations: true,
  constellationNames: true,
  altAzGrid: false,
  equatorialGrid: false,
  ecliptic: false,
  galacticEquator: true,
  satellites: true,
  atmosphere: true,
};

function lineMaterial(color: string, opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false });
}

function segments(points: Vector3[], material: LineBasicMaterial): LineSegments {
  const arr = new Float32Array(points.length * 3);
  points.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(arr, 3));
  const lines = new LineSegments(geo, material);
  lines.frustumCulled = false;
  return lines;
}

/** Great or small circle as segments: f(t) for t in [0, 1). */
function circle(f: (t: number) => Vec3, toRender: (v: Vec3) => Vector3, n = 180): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i < n; i++) pts.push(toRender(f(i / n)), toRender(f((i + 1) / n)));
  return pts;
}

function label(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 0.5);
  return obj;
}

const domeVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

/**
 * Daylight and twilight sky, in the local frame (x east, y up, z south). A simple
 * analytic model: blue zenith brightening toward the horizon, a glow around the Sun,
 * and warm horizon colours toward the Sun during twilight. Drawn additively.
 */
const domeFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir;
uniform float uSunAlt;
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vDir);
  float alt = max(dir.y, 0.0);
  float day = smoothstep(-6.0, 10.0, uSunAlt);
  float twilight = smoothstep(-18.0, -4.0, uSunAlt) * (1.0 - smoothstep(-1.0, 12.0, uSunAlt));
  float horizon = pow(1.0 - alt, 3.0);
  float cosSun = dot(dir, uSunDir);
  vec3 sky = mix(vec3(0.08, 0.2, 0.55), vec3(0.42, 0.55, 0.72), horizon) * day;
  sky += day * vec3(1.0, 0.95, 0.85) * (0.5 * pow(max(cosSun, 0.0), 80.0) + 0.12 * pow(max(cosSun, 0.0), 4.0));
  float towardSun = pow(cosSun * 0.5 + 0.5, 3.0);
  sky += twilight * (vec3(0.5, 0.22, 0.08) * towardSun * horizon + vec3(0.015, 0.03, 0.08) * (1.0 - horizon * 0.5));
  gl_FragColor = vec4(sky, 1.0);
}
`;

/**
 * The view from the Earth's surface: ground, horizon, cardinal points, the daylight sky,
 * coordinate grids, the Galactic equator and the constellations.
 */
export class SkyView {
  readonly group = new Group();
  /** Children oriented with the observer's horizon (x east, y up, z south). */
  private readonly local = new Group();
  private readonly ground: Mesh;
  private readonly groundMaterial = new MeshBasicMaterial({ color: 0x000000, side: BackSide });
  private readonly dome: Mesh;
  private readonly domeMaterial: ShaderMaterial;
  private readonly altAz: Group;
  private readonly equatorial: LineSegments;
  private readonly ecliptic: LineSegments;
  private readonly galactic: LineSegments;
  private readonly constellationLines: LineSegments;
  private readonly constellationLabels: { obj: CSS2DObject; dir: Vector3; rank: number }[] = [];
  private readonly cardinals: CSS2DObject[] = [];
  private layers: SkyLayers = { ...DEFAULT_SKY_LAYERS };
  private readonly overlays: [LineSegments, number][] = [];
  private readonly basis = new Matrix4();
  private readonly up = new Vector3(0, 1, 0);

  constructor() {
    this.group.visible = false;
    this.group.add(this.local);

    this.ground = new Mesh(new SphereGeometry(GROUND_KM, 96, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.groundMaterial);
    this.local.add(this.ground);
    const horizonPts: Vector3[] = [];
    for (let i = 0; i < 360; i++) horizonPts.push(new Vector3(Math.sin(i * DEG), 0, -Math.cos(i * DEG)).multiplyScalar(LINES_KM));
    const horizon = new LineLoop(new BufferGeometry().setFromPoints(horizonPts), lineMaterial('#3dd6c6', 0.45));
    this.local.add(horizon);

    this.domeMaterial = new ShaderMaterial({
      vertexShader: domeVertex,
      fragmentShader: domeFragment,
      uniforms: { uSunDir: { value: new Vector3(0, 1, 0) }, uSunAlt: { value: -90 } },
      blending: AdditiveBlending,
      side: BackSide,
      transparent: true,
      depthWrite: false,
    });
    this.dome = new Mesh(new SphereGeometry(DOME_KM, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.domeMaterial);
    this.dome.renderOrder = 10;
    this.local.add(this.dome);

    // Alt-az grid: altitude circles every 10 deg, azimuth lines every 30 deg (local frame).
    const local = (alt: number, az: number) =>
      new Vector3(Math.cos(alt * DEG) * Math.sin(az * DEG), Math.sin(alt * DEG), -Math.cos(alt * DEG) * Math.cos(az * DEG)).multiplyScalar(LINES_KM);
    const grid: Vector3[] = [];
    for (let alt = 10; alt < 90; alt += 10) for (let az = 0; az < 360; az += 2) grid.push(local(alt, az), local(alt, az + 2));
    for (let az = 0; az < 360; az += 30) for (let alt = 0; alt < 88; alt += 2) grid.push(local(alt, az), local(alt + 2, az));
    this.altAz = new Group();
    this.altAz.add(segments(grid, lineMaterial('#3dd6c6', 0.16)));
    this.local.add(this.altAz);

    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    names.forEach((n, i) => {
      const obj = label(n, n.length === 1 ? 'vl-cardinal' : 'vl-cardinal vl-cardinal--minor');
      obj.position.copy(local(1.2, i * 45));
      this.cardinals.push(obj);
      this.local.add(obj);
    });

    // Fixed on the celestial sphere (render frame, J2000-oriented directions).
    const eq = (v: Vec3) => equatorialToRender(v).multiplyScalar(LINES_KM);
    const eqGrid: Vector3[] = [];
    for (let dec = -75; dec <= 75; dec += 15) eqGrid.push(...circle((t) => sphericalToCartesian(t * 360, dec), eq, 120));
    for (let ra = 0; ra < 360; ra += 30)
      for (let dec = -88; dec < 88; dec += 4) eqGrid.push(eq(sphericalToCartesian(ra, dec)), eq(sphericalToCartesian(ra, dec + 4)));
    this.equatorial = segments(eqGrid, lineMaterial('#8b7cff', 0.18));
    this.ecliptic = segments(
      circle((t) => sphericalToCartesian(t * 360, 0), (v) => eclipticToRender(v).multiplyScalar(LINES_KM)),
      lineMaterial('#f2b95b', 0.35),
    );
    this.galactic = segments(
      circle((t) => sphericalToCartesian(t * 360, 0), (v) => galToRender(v).multiplyScalar(LINES_KM)),
      lineMaterial('#ff8fb0', 0.3),
    );

    const cl: Vector3[] = [];
    for (const c of CONSTELLATIONS) {
      for (const pl of c.lines) {
        for (let i = 0; i + 3 < pl.length; i += 2) cl.push(eq(sphericalToCartesian(pl[i]!, pl[i + 1]!)), eq(sphericalToCartesian(pl[i + 2]!, pl[i + 3]!)));
      }
      const obj = label(c.name, `vl-const-label vl-const-label--rank${c.rank}`);
      const dir = equatorialToRender(sphericalToCartesian(c.label[0], c.label[1]));
      obj.position.copy(dir).multiplyScalar(LINES_KM);
      this.constellationLabels.push({ obj, dir, rank: c.rank });
      this.group.add(obj);
    }
    this.constellationLines = segments(cl, lineMaterial('#8fb4ff', 0.32));
    this.group.add(this.equatorial, this.ecliptic, this.galactic, this.constellationLines);
    for (const l of [this.equatorial, this.ecliptic, this.galactic, this.constellationLines, this.altAz.children[0] as LineSegments]) {
      this.overlays.push([l, (l.material as LineBasicMaterial).opacity]);
    }
    this.setLayers(this.layers);
  }

  setLayers(layers: SkyLayers): void {
    this.layers = { ...layers };
    this.constellationLines.visible = layers.constellations;
    this.altAz.visible = layers.altAzGrid;
    this.equatorial.visible = layers.equatorialGrid;
    this.ecliptic.visible = layers.ecliptic;
    this.galactic.visible = layers.galacticEquator;
    this.dome.visible = layers.atmosphere;
  }

  get currentLayers(): SkyLayers {
    return this.layers;
  }

  set visible(v: boolean) {
    this.group.visible = v;
    // CSS2D labels ignore their parents' visibility, so hide them explicitly.
    for (const c of this.cardinals) c.visible = v;
    if (!v) for (const c of this.constellationLabels) c.obj.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /**
   * Orient the horizon for the observer and update the daylight sky. Directions are unit
   * vectors in the render frame; returns the factor by which daylight dims the stars.
   */
  update(frame: { east: Vector3; north: Vector3; up: Vector3 }, sunDir: Vector3, fovDeg: number): number {
    const south = new Vector3().copy(frame.north).negate();
    this.basis.makeBasis(frame.east, frame.up, south);
    this.local.quaternion.setFromRotationMatrix(this.basis);
    this.up.copy(frame.up);

    const sunAlt = Math.asin(Math.max(-1, Math.min(1, sunDir.dot(frame.up)))) / DEG;
    const u = this.domeMaterial.uniforms;
    (u.uSunDir!.value as Vector3).set(sunDir.dot(frame.east), sunDir.dot(frame.up), sunDir.dot(south));
    u.uSunAlt!.value = sunAlt;

    const day = this.layers.atmosphere ? smoothstep(-6, 10, sunAlt) : 0;
    const twilight = this.layers.atmosphere ? smoothstep(-18, -4, sunAlt) * (1 - smoothstep(-1, 12, sunAlt)) : 0;
    this.groundMaterial.color.setRGB(0.004 + 0.05 * day, 0.005 + 0.06 * day, 0.008 + 0.04 * day);
    // Overlays fade against a bright sky.
    for (const [line, base] of this.overlays) (line.material as LineBasicMaterial).opacity = base * (1 - 0.75 * day);

    // Labels are re-shown every frame (the engine hides any that end up behind the camera).
    for (const c of this.cardinals) c.visible = this.group.visible;
    // Labels: only above the horizon; fainter constellations' names only when zoomed in.
    const maxRank = fovDeg > 80 ? 1 : fovDeg > 40 ? 2 : 3;
    for (const c of this.constellationLabels) {
      c.obj.visible = this.group.visible && this.layers.constellationNames && c.rank <= maxRank && c.dir.dot(this.up) > 0.02;
    }
    // Daylight drowns the stars: roughly 8-9 magnitudes at noon, ~4 in deep twilight.
    return 1 / (1 + 3000 * day * day + 30 * twilight);
  }

  /** Altitude (deg) of a render-frame direction for the current observer. */
  altitudeOf(dir: Vector3): number {
    return Math.asin(Math.max(-1, Math.min(1, dir.dot(this.up) / (dir.length() || 1)))) / DEG;
  }

  dispose(): void {
    for (const c of [...this.cardinals, ...this.constellationLabels.map((l) => l.obj)]) c.element.remove();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
