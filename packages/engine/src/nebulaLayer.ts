import { KM_PER_PC, SUN_ABS_MAG_V, SUN_GALACTOCENTRIC_PC, equatorialToGalactic, raDecDistToGalactocentric, type Vec3 } from '@starhome/astro';
import { NAMED_STARS } from '@starhome/data';
import { DUST, NEBULAE, extinctionV, hash32, type DustMap, type GalaxyWorkerPool, type NebulaInfo, type NebulaVolume } from '@starhome/galaxy';
import {
  BackSide,
  BoxGeometry,
  CustomBlending,
  Data3DTexture,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
} from 'three';
import { galPcToWorldKm, galToRender } from './frames';
import type { SharedStarUniforms } from './starMaterial';

const LOW_RES = 40;
const HIGH_RES = 112;
/** Load the high-resolution volume when the nebula's half-size subtends more than this (rad). */
const HIGH_RES_ANGLE = 0.12;
const MAX_HIGH_RES = 2;

/** Unit-luminance colours of each channel (Rec. 709 weights), scientific and Hubble (SHO) palettes. */
function unitLuminance(r: number, g: number, b: number): Vector3 {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return new Vector3(r / y, g / y, b / y);
}
const PALETTES = {
  scientific: {
    emission: [unitLuminance(1, 0.16, 0.22), unitLuminance(0.15, 1, 0.82), unitLuminance(0.85, 0.08, 0.12)],
    reflection: [unitLuminance(0.45, 0.62, 1), unitLuminance(1, 1, 1), unitLuminance(1, 1, 1)],
    synchrotron: [unitLuminance(1, 0.16, 0.22), unitLuminance(0.15, 1, 0.82), unitLuminance(0.6, 0.72, 1)],
  },
  // Hubble palette: [S II] red, Halpha green, [O III] blue.
  enhanced: {
    emission: [unitLuminance(0.3, 1, 0.25), unitLuminance(0.12, 0.45, 1), unitLuminance(1, 0.3, 0.1)],
    reflection: [unitLuminance(0.35, 0.55, 1), unitLuminance(1, 1, 1), unitLuminance(1, 1, 1)],
    synchrotron: [unitLuminance(0.3, 1, 0.25), unitLuminance(0.12, 0.45, 1), unitLuminance(0.6, 0.72, 1)],
  },
} as const;

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

/**
 * Front-to-back raymarch through the nebula's unit box. Each step adds emission
 * attenuated by the dust in front of it; the output is premultiplied, so what lies
 * behind the nebula (stars, the Milky Way) is dimmed by the dust it contains.
 */
const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
precision highp sampler3D;
uniform sampler3D uVolume;
uniform vec3 uCamLocal;
uniform vec3 uHalfPc;
uniform vec3 uChannelScale;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uEmit;
uniform float uKappa;
uniform float uSteps;
uniform vec3 uFg;
varying vec3 vLocal;

void main() {
  #include <logdepthbuf_fragment>
  vec3 ro = uCamLocal;
  vec3 rd = normalize(vLocal - ro);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-1.0 - ro) * inv;
  vec3 t1 = (1.0 - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  if (tf <= tn) discard;
  float dt = (tf - tn) / uSteps;
  float dsPc = length(rd * uHalfPc) * dt;
  // Interleaved gradient noise hides the step pattern.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 col = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    vec3 p = ro + rd * (tn + (float(i) + jitter) * dt);
    vec4 s = texture(uVolume, p * 0.5 + 0.5);
    s *= s;
    vec3 e = s.r * uChannelScale.x * uC0 + s.g * uChannelScale.y * uC1 + s.b * uChannelScale.z * uC2;
    float a = exp(-uKappa * s.a * dsPc);
    col += T * e * dsPc * (1.0 + a) * 0.5;
    T *= a;
    if (T < 0.01) break;
  }
  col *= uEmit * uFg;
  // Soft knee: bright cores roll off instead of clipping (and flooding the bloom).
  float peak = max(max(col.r, col.g), col.b);
  col *= 1.0 / (1.0 + peak / 6.0);
  gl_FragColor = vec4(col, 1.0 - T);
}
`;

interface NebulaEntry {
  info: NebulaInfo;
  mesh: Mesh;
  material: ShaderMaterial;
  centerPc: Vec3;
  axes: [Vec3, Vec3, Vec3];
  worldKm: Vector3;
  halfPc: Vector3;
  /** Intrinsic V luminosity (de-reddened), L_sun. */
  lumV: number;
  /** Display gain from the nebula's average surface brightness (see surfaceBrightnessGain). */
  sbGain: number;
  sources: Vec3[];
  volume: { res: number; emissionSum: number } | null;
  texture: Data3DTexture | null;
  highRes: 'none' | 'loading' | 'ready';
  lastHighUse: number;
  fgAv: number;
  fgFrame: number;
}

/**
 * Volumetric nebulae, raymarched through small 3D textures built in the galaxy workers.
 * Everything except the volume's internal structure is real: position, distance,
 * size, total brightness and the foreground dust.
 */
export class NebulaLayer {
  readonly group = new Group();
  private readonly entries: NebulaEntry[] = [];
  private palette: 'scientific' | 'enhanced' = 'scientific';
  /** User scale on top of each nebula's own exposure (see surfaceBrightnessGain). */
  boost = 1;
  private frame = 0;
  private disposed = false;
  private readonly inv = new Matrix4();
  private readonly scratch = new Vector3();

  constructor(
    private readonly pool: GalaxyWorkerPool,
    private readonly shared: SharedStarUniforms,
    private readonly seed: number,
  ) {
    const box = new BoxGeometry(2, 2, 2);
    for (const info of NEBULAE) {
      if (!info.model) continue;
      const centerPc = raDecDistToGalactocentric(info.ra, info.dec, info.distPc);
      const arcmin = info.distPc * (Math.PI / 10_800);
      const halfPc = new Vector3(0.5 * info.sizeArcmin[0] * arcmin, 0.5 * info.sizeArcmin[1] * arcmin, 0.25 * (info.sizeArcmin[0] + info.sizeArcmin[1]) * arcmin * info.depth);
      const axes = nebulaAxes(centerPc, info.paDeg);
      const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uVolume: { value: null },
          uCamLocal: { value: new Vector3() },
          uHalfPc: { value: halfPc },
          uChannelScale: { value: new Vector3(1, 1, 1) },
          uC0: { value: new Vector3() },
          uC1: { value: new Vector3() },
          uC2: { value: new Vector3() },
          uEmit: { value: 0 },
          uKappa: { value: 0 },
          uSteps: { value: 48 },
          uFg: { value: new Vector3(1, 1, 1) },
        },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      });
      const mesh = new Mesh(box, material);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      // Box axes in the render frame, scaled to the half-extents in km.
      const [x, y, z] = axes.map((a) => galToRender(a));
      mesh.matrix.makeBasis(x!.multiplyScalar(halfPc.x * KM_PER_PC), y!.multiplyScalar(halfPc.y * KM_PER_PC), z!.multiplyScalar(halfPc.z * KM_PER_PC));
      this.group.add(mesh);
      const sources = (info.sources ?? [])
        .map((id) => NAMED_STARS.find((s) => s.id === id))
        .filter((s) => s !== undefined)
        .map((s) => {
          const p = raDecDistToGalactocentric(s.ra, s.dec, s.distPc);
          const d: Vec3 = [p[0] - centerPc[0], p[1] - centerPc[1], p[2] - centerPc[2]];
          const dot = (a: Vec3) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
          return [dot(axes[0]) / halfPc.x, dot(axes[1]) / halfPc.y, dot(axes[2]) / halfPc.z] as Vec3;
        });
      this.entries.push({
        info,
        mesh,
        material,
        centerPc,
        axes,
        worldKm: galPcToWorldKm(centerPc),
        halfPc,
        lumV: 0,
        sbGain: surfaceBrightnessGain(info),
        sources,
        volume: null,
        texture: null,
        highRes: 'none',
        lastHighUse: 0,
        fgAv: 0,
        fgFrame: -1,
      });
      void this.load(this.entries[this.entries.length - 1]!, LOW_RES);
    }
    this.setPalette('scientific');
  }

  /** Intrinsic luminosities need the dust model to de-redden the observed magnitudes. */
  setDust(map: DustMap): void {
    const s = SUN_GALACTOCENTRIC_PC;
    const sun: Vec3 = [s[0] / 1000, s[1] / 1000, s[2] / 1000];
    for (const e of this.entries) {
      const av = extinctionV(map, sun, [e.centerPc[0] / 1000, e.centerPc[1] / 1000, e.centerPc[2] / 1000]);
      const absMag = e.info.vmag - 5 * Math.log10(e.info.distPc / 10) - av;
      e.lumV = 10 ** (-0.4 * (absMag - SUN_ABS_MAG_V));
    }
    this.dust = map;
  }

  private dust: DustMap | null = null;

  setPalette(p: 'scientific' | 'enhanced'): void {
    this.palette = p;
    for (const e of this.entries) {
      const c = PALETTES[p][e.info.palette];
      e.material.uniforms.uC0!.value.copy(c[0]);
      e.material.uniforms.uC1!.value.copy(c[1]);
      e.material.uniforms.uC2!.value.copy(c[2]);
    }
  }

  get currentPalette(): 'scientific' | 'enhanced' {
    return this.palette;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  private async load(e: NebulaEntry, res: number): Promise<void> {
    const vol = await this.pool
      .generateNebula({ seed: hash32(this.seed, hash32(...[...e.info.id].map((c) => c.charCodeAt(0)))), model: e.info.model!, res, sources: e.sources })
      .catch(() => null);
    if (!vol || this.disposed) return;
    this.applyVolume(e, vol);
  }

  private applyVolume(e: NebulaEntry, vol: NebulaVolume): void {
    const tex = new Data3DTexture(vol.data, vol.res, vol.res, vol.res);
    tex.format = RGBAFormat;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    e.texture?.dispose();
    e.texture = tex;
    e.volume = { res: vol.res, emissionSum: vol.emissionSum };
    const u = e.material.uniforms;
    u.uVolume!.value = tex;
    u.uChannelScale!.value.set(...vol.channelScale);
    // Dust: the densest column through the volume equals the nebula's peak extinction.
    u.uKappa!.value = vol.maxDustColumn > 0 ? (0.921 * e.info.dustPeakAv) / (vol.maxDustColumn * e.halfPc.z) : 0;
    e.highRes = vol.res >= HIGH_RES ? 'ready' : e.highRes === 'loading' ? 'loading' : 'none';
  }

  /** Place the boxes, pick the volume resolution and set brightness for this frame. */
  update(cameraKm: Vector3, cameraGalPc: Vec3, pixelsPerRadian: number, pixelRatio: number, steps: number): void {
    if (!this.group.visible) return;
    this.frame++;
    let highCount = this.entries.filter((e) => e.highRes !== 'none').length;
    for (const e of this.entries) {
      const ready = e.texture !== null && e.lumV > 0;
      e.mesh.visible = ready;
      if (!ready) continue;
      const m = e.mesh.matrix.elements;
      m[12] = e.worldKm.x - cameraKm.x;
      m[13] = e.worldKm.y - cameraKm.y;
      m[14] = e.worldKm.z - cameraKm.z;
      e.mesh.matrixWorldNeedsUpdate = true;
      // Camera in the box's unit coordinates (double precision on the CPU).
      this.inv.copy(e.mesh.matrix).invert();
      const camLocal = this.scratch.set(0, 0, 0).applyMatrix4(this.inv);
      e.material.uniforms.uCamLocal!.value.copy(camLocal);

      const dPc = Math.hypot(cameraGalPc[0] - e.centerPc[0], cameraGalPc[1] - e.centerPc[1], cameraGalPc[2] - e.centerPc[2]);
      const angle = Math.max(e.halfPc.x, e.halfPc.y) / Math.max(dPc, 1e-6);
      if (angle > HIGH_RES_ANGLE) {
        e.lastHighUse = this.frame;
        if (e.highRes === 'none' && highCount < MAX_HIGH_RES) {
          e.highRes = 'loading';
          highCount++;
          void this.load(e, HIGH_RES);
        }
      } else if (e.highRes === 'ready' && this.frame - e.lastHighUse > 600) {
        // Long out of close range: return to the low-resolution volume.
        e.highRes = 'none';
        void this.load(e, LOW_RES);
      }

      // Foreground dust between the camera and the nebula, refreshed now and then.
      if (this.dust && (e.fgFrame < 0 || this.frame - e.fgFrame > 30)) {
        e.fgFrame = this.frame;
        e.fgAv = this.shared.uDustOn.value > 0.5 ? extinctionV(this.dust, cameraGalPc.map((c) => c / 1000) as Vec3, e.centerPc.map((c) => c / 1000) as Vec3, 24) : 0;
        e.material.uniforms.uFg!.value.set(...DUST.rgb.map((k) => 10 ** (-0.4 * e.fgAv * k)));
      }

      // Same calibration as the star shader: a pixel receives exposure x (light in its solid
      // angle). Nebulae are extended light, so they get the full diffuse gain, plus the display boost.
      const ppr = pixelsPerRadian * pixelRatio;
      const gain = this.shared.uDiffuseGain.value * this.boost * e.sbGain;
      const voxelToPc3 = e.halfPc.x * e.halfPc.y * e.halfPc.z;
      const lumPerWeight = e.lumV / Math.max(1e-12, e.volume!.emissionSum * voxelToPc3);
      e.material.uniforms.uEmit!.value = (0.94 * this.shared.uExposure.value * gain * lumPerWeight) / (ppr * ppr);
      e.material.uniforms.uSteps!.value = angle > HIGH_RES_ANGLE ? Math.max(steps, 96) : steps;
    }
  }

  /** The nebula containing a Galactocentric point (pc), if any (inside its ellipsoid). */
  containing(galPc: Vec3): NebulaInfo | null {
    for (const e of this.entries) {
      const d: Vec3 = [galPc[0] - e.centerPc[0], galPc[1] - e.centerPc[1], galPc[2] - e.centerPc[2]];
      const q = (a: Vec3, h: number) => ((d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) / h) ** 2;
      if (q(e.axes[0], e.halfPc.x) + q(e.axes[1], e.halfPc.y) + q(e.axes[2], e.halfPc.z) < 0.7) return e.info;
    }
    return null;
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries) {
      e.texture?.dispose();
      e.material.dispose();
    }
  }
}

/**
 * Nebulae span ~10 magnitudes of surface brightness, from the Ring Nebula (~18 mag/arcsec^2)
 * to the Veil (~27), most fainter than the Milky Way band. Like a photographer exposing each
 * object, the display brightens faint nebulae and tones down bright ones toward ~21
 * mag/arcsec^2, keeping a quarter of the difference so they still differ.
 */
export function surfaceBrightnessGain(info: NebulaInfo): number {
  if (info.vmag > 50) return 1;
  const areaArcsec2 = (Math.PI / 4) * info.sizeArcmin[0] * info.sizeArcmin[1] * 3600;
  const sb = info.vmag + 2.5 * Math.log10(areaArcsec2);
  return Math.min(100, Math.max(0.05, 10 ** (0.3 * (sb - 21))));
}

/**
 * Nebula box axes in the Galactocentric frame: z toward the Sun, x along the position
 * angle on the sky (from celestial north through east), y completing a right-handed set.
 */
export function nebulaAxes(centerPc: Vec3, paDeg: number): [Vec3, Vec3, Vec3] {
  const s = SUN_GALACTOCENTRIC_PC;
  const toSun: Vec3 = [s[0] - centerPc[0], s[1] - centerPc[1], s[2] - centerPc[2]];
  const n = Math.hypot(...toSun);
  const z: Vec3 = [toSun[0] / n, toSun[1] / n, toSun[2] / n];
  const u: Vec3 = [-z[0], -z[1], -z[2]];
  const ncp = equatorialToGalactic([0, 0, 1]);
  const along = ncp[0] * u[0] + ncp[1] * u[1] + ncp[2] * u[2];
  const nRaw: Vec3 = [ncp[0] - along * u[0], ncp[1] - along * u[1], ncp[2] - along * u[2]];
  const nl = Math.hypot(...nRaw) || 1;
  const north: Vec3 = [nRaw[0] / nl, nRaw[1] / nl, nRaw[2] / nl];
  const east: Vec3 = [north[1] * u[2] - north[2] * u[1], north[2] * u[0] - north[0] * u[2], north[0] * u[1] - north[1] * u[0]];
  const pa = (paDeg * Math.PI) / 180;
  const x: Vec3 = [0, 1, 2].map((k) => Math.cos(pa) * north[k]! + Math.sin(pa) * east[k]!) as Vec3;
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x, y, z];
}
