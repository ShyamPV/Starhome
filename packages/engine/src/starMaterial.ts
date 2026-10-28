import { KM_PER_PC } from '@starhome/astro';
import { BUBBLE_CENTER_KPC, DUST, DUST_MAP_EXTENT_KPC } from '@starhome/galaxy';
import { AdditiveBlending, DataTexture, RedFormat, ShaderMaterial, Vector3, type Texture } from 'three';

/**
 * Point-sprite star shader. Each vertex is a star (or an aggregate of stars) with an
 * absolute V magnitude; apparent brightness is computed per frame from the true
 * distance to the camera, so the same buffers work from 1 AU to 100 kpc away.
 *
 * Interstellar extinction is integrated per vertex along the line of sight from the
 * camera through the dust model (@starhome/galaxy dust.ts, same algorithm), dimming and
 * reddening each star as seen from wherever the camera is.
 *
 * Faint stars are drawn at a minimum sprite size with reduced intensity; bright stars
 * grow (and eventually bloom) instead of saturating.
 */
export interface StarMaterialOptions {
  /** Fade in with distance from the camera between these radii (km); for aggregate layers. */
  fadeIn?: [number, number];
  /** Fade out with distance from the camera between these radii (km); for nearer layers. */
  fadeOut?: [number, number];
  /** Aggregate particles use a softer, wider profile. */
  soft?: boolean;
  /** Physical smoothing radius for aggregate particles, pc. */
  smoothingPc?: number;
}

/** Uniforms shared by every star material (one object each, so one update reaches all). */
export interface SharedStarUniforms {
  /** Exposure, including the automatic inside/outside adaptation. */
  uExposure: { value: number };
  /**
   * Extra gain for unresolved (aggregate) light. Dark-adapted eyes sum light over large
   * areas (Ricco's law), so diffuse glow looks brighter than the same light in points;
   * planetariums expose the Milky Way separately from the stars for the same reason.
   * The gain ramps in with distance (DIFFUSE_RAMP_PC), so nearby aggregate particles,
   * which read as individual points, are not brightened, and every layer at the same
   * distance gets the same gain (the level-of-detail cross-fades stay seamless).
   */
  uDiffuseGain: { value: number };
  uPixelRatio: { value: number };
  /** Viewport height / vertical field of view, for sizing smoothed aggregate particles. */
  uPixelsPerRadian: { value: number };
  uDustMap: { value: Texture };
  uDustOn: { value: number };
  uDustSteps: { value: number };
  uDustExtent: { value: number };
  uDustHz: { value: number };
  uCamGalKpc: { value: Vector3 };
  uBubbleCenter: { value: Vector3 };
  /** Local Bubble inner radius, outer radius (kpc) and floor factor. */
  uBubble: { value: Vector3 };
  /** A_lambda / A_V for the R, G, B channels. */
  uRedden: { value: Vector3 };
}

export function createSharedStarUniforms(): SharedStarUniforms {
  const empty = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat);
  empty.needsUpdate = true;
  return {
    uExposure: { value: 20 },
    uDiffuseGain: { value: 4 },
    uPixelRatio: { value: 1 },
    uPixelsPerRadian: { value: 700 },
    uDustMap: { value: empty },
    uDustOn: { value: 0 },
    uDustSteps: { value: 10 },
    uDustExtent: { value: DUST_MAP_EXTENT_KPC },
    uDustHz: { value: DUST.hz },
    uCamGalKpc: { value: new Vector3() },
    uBubbleCenter: { value: new Vector3(...BUBBLE_CENTER_KPC) },
    uBubble: { value: new Vector3(DUST.bubble.inner, DUST.bubble.outer, DUST.bubble.floor) },
    uRedden: { value: new Vector3(...DUST.rgb) },
  };
}

/** Distances (pc) over which the diffuse gain ramps from 1 to its full value. */
const DIFFUSE_RAMP_PC = [300, 3000];

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 starColor;
attribute float absMag;

uniform float uExposure;
uniform float uDiffuseGain;
uniform float uSoft;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uPixelRatio;
uniform vec2 uFadeIn;
uniform vec2 uFadeOut;
uniform float uKmPerPc;
uniform float uCull;
// Aggregate particles: physical smoothing radius (km) and pixels per radian, so nearby
// particles spread into faint haze instead of reading as individual bright stars.
uniform float uSmoothingKm;
uniform float uPixelsPerRadian;

uniform sampler2D uDustMap;
uniform float uDustOn;
uniform float uDustSteps;
uniform float uDustExtent;
uniform float uDustHz;
uniform vec3 uCamGalKpc;
uniform vec3 uBubbleCenter;
uniform vec3 uBubble;
uniform vec3 uRedden;

varying vec3 vColor;
varying float vIntensity;

// Integral of exp(-|z|/hz) from 0 to z, and its inverse (see dust.ts).
float dustVertF(float z) {
  return sign(z) * uDustHz * (1.0 - exp(-abs(z) / uDustHz));
}
float dustVertFInv(float u) {
  float a = min(abs(u) / uDustHz, 0.999999);
  return -sign(u) * uDustHz * log(1.0 - a);
}
float dustAt(vec3 p) {
  float a = texture2D(uDustMap, p.xy / (2.0 * uDustExtent) + 0.5).r;
  return a * mix(uBubble.z, 1.0, smoothstep(uBubble.x, uBubble.y, distance(p, uBubbleCenter)));
}
// V-band extinction (mag) from the camera to a point rel (kpc) away.
float extinctionV(vec3 rel, float jitter) {
  vec3 a = uCamGalKpc;
  float len = length(rel);
  float dz = rel.z;
  bool vertical = abs(dz) > 1e-4;
  float fa = dustVertF(a.z);
  float fb = dustVertF(a.z + dz);
  float iv = vertical ? (fb - fa) / dz * len : exp(-abs(a.z) / uDustHz) * len;
  if (iv < 1e-7) return 0.0;
  float sum = 0.0;
  for (int i = 0; i < 24; i++) {
    if (float(i) >= uDustSteps) break;
    float f = (float(i) + jitter) / uDustSteps;
    float t = vertical ? clamp((dustVertFInv(mix(fa, fb, f)) - a.z) / dz, 0.0, 1.0) : f;
    sum += dustAt(a + rel * t);
  }
  return iv * sum / uDustSteps;
}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dKm = length(mv.xyz);
  float dPc = max(dKm / uKmPerPc, 1e-12);
  float appMag = absMag + 5.0 * (log2(dPc) * 0.30103) - 5.0;
  // 10^(-0.4 m) = 2^(-1.328771 m)
  float gain = mix(1.0, uDiffuseGain, uSoft * smoothstep(${DIFFUSE_RAMP_PC[0].toFixed(1)}, ${DIFFUSE_RAMP_PC[1].toFixed(1)}, dPc));
  float flux = uExposure * gain * exp2(-1.328771 * appMag);
  if (uFadeIn.y > 0.0) flux *= smoothstep(uFadeIn.x, uFadeIn.y, dKm);
  if (uFadeOut.y > 0.0) flux *= 1.0 - smoothstep(uFadeOut.x, uFadeOut.y, dKm);

  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>

  vec3 tint = vec3(1.0);
  if (flux >= uCull && uDustOn > 0.5) {
    // Camera-relative Galactocentric offset (kpc): the batch's local parsecs plus its
    // floating-origin translation (render km, axes x, z, -y) converted back to parsecs.
    vec3 t = modelMatrix[3].xyz;
    vec3 rel = (position + vec3(t.x, -t.z, t.y) / uKmPerPc) * 0.001;
    float jitter = fract(sin(dot(position.xy, vec2(12.9898, 78.233)) + position.z * 0.3183) * 43758.5453);
    float av = extinctionV(rel, jitter);
    flux *= exp2(-1.328771 * av);
    tint = exp2(-1.328771 * av * (uRedden - 1.0));
  }

  if (flux < uCull) {
    // Too faint to contribute: push outside the clip volume to skip rasterisation.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vIntensity = 0.0;
    vColor = vec3(0.0);
    return;
  }

  float size = uMinSize * sqrt(max(1.0, flux));
  if (uSmoothingKm > 0.0) size = max(size, uSmoothingKm / dKm * uPixelsPerRadian);
  size = min(size, uMaxSize);
  vIntensity = min(flux * (uMinSize * uMinSize) / (size * size), 40.0);
  vColor = starColor * tint;
  gl_PointSize = size * uPixelRatio;
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uSoft;

varying vec3 vColor;
varying float vIntensity;

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Sharp Gaussian core plus a faint halo; aggregate particles use a broad profile.
  float core = exp(-r2 * 6.0);
  float halo = 0.12 * (1.0 - r2) * (1.0 - r2);
  float profile = mix(core + halo, (1.0 - r2) * (1.0 - r2) * 0.7, uSoft);
  gl_FragColor = vec4(vColor * vIntensity * profile, 1.0);
}
`;

export function createStarMaterial(shared: SharedStarUniforms, opts: StarMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...shared,
      uMinSize: { value: opts.soft ? 2.6 : 2.2 },
      uMaxSize: { value: opts.soft ? 64 : 48 },
      uFadeIn: { value: opts.fadeIn ?? [0, 0] },
      uFadeOut: { value: opts.fadeOut ?? [0, 0] },
      uKmPerPc: { value: KM_PER_PC },
      // Aggregate particles stand for many stars: keep faint ones, their sum is visible.
      uCull: { value: opts.soft ? 2e-5 : 2e-4 },
      uSoft: { value: opts.soft ? 1 : 0 },
      uSmoothingKm: { value: opts.smoothingPc ? opts.smoothingPc * KM_PER_PC : 0 },
    },
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}

/** Set a material's fade-in / fade-out radii (km); [0, 0] disables. */
export function setFades(m: ShaderMaterial, fadeIn: readonly [number, number] | null, fadeOut: readonly [number, number] | null): void {
  const fi = m.uniforms.uFadeIn!.value as number[];
  const fo = m.uniforms.uFadeOut!.value as number[];
  fi[0] = fadeIn?.[0] ?? 0;
  fi[1] = fadeIn?.[1] ?? 0;
  fo[0] = fadeOut?.[0] ?? 0;
  fo[1] = fadeOut?.[1] ?? 0;
}
