import { KM_PER_AU, teffToLinearRgb } from '@starhome/astro';
import type { CompactObject } from '@starhome/data';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';

const R_SUN_KM = 695_700;
/** Schwarzschild radius per solar mass, km. */
const RS_PER_MSUN_KM = 2.953;

const starVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;
void main() {
  vLocal = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const starFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uGranulation;
uniform float uScale;
uniform float uTime;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  #include <logdepthbuf_fragment>
  float mu = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
  // Quadratic limb darkening, roughly solar.
  float limb = 1.0 - 0.6 * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu);
  // Convection cells: tiny on dwarfs, a handful of giant cells on red supergiants.
  vec3 p = vLocal * uScale + vec3(0.0, uTime * 0.03, 0.0);
  float g = 0.6 * n3(p) + 0.3 * n3(p * 2.1) + 0.1 * n3(p * 4.3);
  gl_FragColor = vec4(uColor * limb * (1.0 + uGranulation * (g - 0.5) * 2.0), 1.0);
}
`;

/** A glowing stellar surface: colour from temperature, limb darkening and convection. */
export function createStarSurfaceMaterial(teffK: number, opts: { granulation?: number; cellScale?: number; brightness?: number } = {}): ShaderMaterial {
  const rgb = teffToLinearRgb(teffK);
  const max = Math.max(...rgb);
  // Just above the bloom threshold: a glowing disc whose limb and cells still show.
  const b = opts.brightness ?? 1.5;
  return new ShaderMaterial({
    vertexShader: starVertex,
    fragmentShader: starFragment,
    uniforms: {
      uColor: { value: new Color(rgb[0] / max, rgb[1] / max, rgb[2] / max).multiplyScalar(b) },
      uGranulation: { value: opts.granulation ?? 0.08 },
      uScale: { value: opts.cellScale ?? 18 },
      uTime: { value: 0 },
    },
  });
}

/** Granulation for a star's size: red supergiants show a few huge cells (as seen on Betelgeuse). */
export function convectionFor(radiusSun: number, teffK: number): { granulation: number; cellScale: number } {
  if (radiusSun > 100 && teffK < 4500) return { granulation: 0.35, cellScale: 2.5 };
  if (radiusSun > 10) return { granulation: 0.18, cellScale: 6 };
  return { granulation: 0.08, cellScale: 18 };
}

let glowTexture: CanvasTexture | null = null;
function glow(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(c);
  return glowTexture;
}

function halo(color: Color, sizeKm: number, opacity = 0.2): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glow(), color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(sizeKm);
  return s;
}

/** The Event Horizon Telescope's ring around Sagittarius A*, as a camera-facing sprite. */
export function photonRing(schwarzschildKm: number): Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const dx = (x - 128) / 128;
      const dy = (y - 128) / 128;
      const r = Math.hypot(dx, dy);
      // A ring at half the sprite radius, brighter along one side (Doppler beaming).
      const ring = Math.exp(-(((r - 0.5) / 0.09) ** 2)) * (0.65 + 0.35 * Math.cos(Math.atan2(dy, dx) - 1.2));
      const k = (y * 256 + x) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 150 + 80 * ring;
      img.data[k + 2] = 60 + 40 * ring;
      img.data[k + 3] = Math.round(255 * Math.min(1, ring));
    }
  }
  g.putImageData(img, 0, 0);
  const s = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  // The EHT ring is about 5 Schwarzschild radii across; it sits at half the sprite's radius.
  s.scale.setScalar(10 * schwarzschildKm);
  return s;
}

export interface CloseUpSubject {
  id: string;
  position: () => Vector3;
  /** Star: temperature and radius. Compact object: its data. */
  star?: { teffK: number; radiusKm: number };
  compact?: CompactObject;
}

/**
 * What a star or compact object looks like when you get there: the star as a glowing
 * sphere at its estimated size and colour; a neutron star at its real 12 km size (pulsars
 * with illustrative beams); a black hole's companion star on its real orbit, with an
 * accretion disc where the black hole is feeding. One subject is built at a time.
 */
export class CloseUps {
  readonly group = new Group();
  private current: { id: string; build: Group; animate: (jd: number, seconds: number) => void } | null = null;
  private readonly start = performance.now();

  /** Show the subject nearest the camera if it is close enough to matter; hide otherwise. */
  update(subject: CloseUpSubject | null, cameraKm: Vector3, jd: number): void {
    if (subject?.id !== this.current?.id) {
      if (this.current) this.dispose();
      if (subject) this.current = this.build(subject);
    }
    if (!this.current || !subject) return;
    const p = subject.position();
    this.group.position.set(p.x - cameraKm.x, p.y - cameraKm.y, p.z - cameraKm.z);
    this.current.animate(jd, (performance.now() - this.start) / 1000);
  }

  private build(s: CloseUpSubject): { id: string; build: Group; animate: (jd: number, seconds: number) => void } {
    const g = new Group();
    this.group.add(g);
    let animate: (jd: number, seconds: number) => void = () => {};
    if (s.star) {
      const { teffK, radiusKm } = s.star;
      const material = createStarSurfaceMaterial(teffK, convectionFor(radiusKm / R_SUN_KM, teffK));
      g.add(new Mesh(new SphereGeometry(radiusKm, 96, 48), material));
      g.add(halo(new Color(...teffToLinearRgb(teffK)), radiusKm * 4));
      animate = (_jd, t) => (material.uniforms.uTime!.value = t);
    } else if (s.compact && 'beams' in s.compact.closeUp) {
      // A neutron star: about 12 km, white-hot.
      const r = 12;
      g.add(new Mesh(new SphereGeometry(r, 48, 24), createStarSurfaceMaterial(600_000, { granulation: 0.02, brightness: 2.5 })));
      g.add(halo(new Color(0.75, 0.85, 1), r * 10, 0.35));
      if (s.compact.closeUp.beams) {
        // Radiation beams along the magnetic axis, tilted from the spin axis: the lighthouse.
        const spin = new Group();
        const tilt = new Group();
        tilt.rotation.z = 0.6;
        for (const sign of [1, -1]) {
          const cone = new Mesh(
            new ConeGeometry(70, 900, 32, 1, true),
            new MeshBasicMaterial({ color: new Color(0.55, 0.7, 1), transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
          );
          // Cone tip at the star.
          cone.position.y = sign * 450;
          cone.rotation.z = sign > 0 ? Math.PI : 0;
          tilt.add(cone);
        }
        spin.add(tilt);
        g.add(spin);
        // Not the real spin (tens of times a second): slowed so the sweep can be seen.
        animate = (_jd, t) => (spin.rotation.y = t * 1.2);
      }
    } else if (s.compact && 'bhMassSun' in s.compact.closeUp) {
      const c = s.compact.closeUp;
      const rs = c.bhMassSun * RS_PER_MSUN_KM;
      g.add(new Mesh(new SphereGeometry(rs, 32, 16), new MeshBasicMaterial({ color: 0x000000 })));
      const companion = new Group();
      const starR = c.companion.radiusSun * R_SUN_KM;
      const material = createStarSurfaceMaterial(c.companion.teffK, convectionFor(c.companion.radiusSun, c.companion.teffK));
      companion.add(new Mesh(new SphereGeometry(starR, 64, 32), material));
      const tint = new Color(...teffToLinearRgb(c.companion.teffK));
      companion.add(halo(tint, starR * 4));
      // From a few AU a Sun-sized star is under a pixel: keep a small glow on screen.
      const beacon = halo(tint, 0.03, 0.9);
      (beacon.material as SpriteMaterial).sizeAttenuation = false;
      companion.add(beacon);
      g.add(companion);
      const a = c.companion.sepAu * KM_PER_AU;
      // The orbit, faintly.
      const orbit = new Mesh(new RingGeometry(a * 0.998, a * 1.002, 256, 1), new MeshBasicMaterial({ color: 0x8b7cff, transparent: true, opacity: 0.25, side: DoubleSide, depthWrite: false }));
      orbit.rotation.x = -Math.PI / 2;
      g.add(orbit);
      if (c.disk) {
        // A hot accretion disc fed from the companion, out to about a third of the separation.
        const disk = new Mesh(new RingGeometry(rs * 6, a * 0.3, 256, 32), diskMaterial(rs * 6, a * 0.3));
        disk.rotation.x = -Math.PI / 2;
        g.add(disk);
      }
      animate = (jd) => {
        const th = ((jd % c.companion.periodDays) / c.companion.periodDays) * Math.PI * 2;
        companion.position.set(Math.cos(th) * a, 0, Math.sin(th) * a);
        material.uniforms.uTime!.value = jd * 86_400 * 1e-4;
      };
    }
    return { id: s.id, build: g, animate };
  }

  private dispose(): void {
    if (!this.current) return;
    this.current.build.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material | undefined;
      if (mat && (mat as SpriteMaterial).map !== glowTexture) (mat as SpriteMaterial).map?.dispose();
      mat?.dispose();
    });
    this.group.remove(this.current.build);
    this.current = null;
  }
}

/** Accretion disc: white-hot inside, cooling to orange at the rim. */
function diskMaterial(inner: number, outer: number): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uInner: { value: inner }, uOuter: { value: outer } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying float vR;
      void main() {
        vR = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uInner;
      uniform float uOuter;
      varying float vR;
      void main() {
        #include <logdepthbuf_fragment>
        // Temperature falls as r^-3/4 (a standard thin disc).
        float x = clamp(log(vR / uInner) / log(uOuter / uInner), 0.0, 1.0);
        vec3 hot = vec3(0.75, 0.85, 1.0) * 6.0;
        vec3 warm = vec3(1.0, 0.55, 0.2) * 1.2;
        vec3 c = mix(hot, warm, pow(x, 0.5));
        float a = (1.0 - x) * (1.0 - x) * 0.9;
        gl_FragColor = vec4(c * a, a);
      }`,
  });
}
