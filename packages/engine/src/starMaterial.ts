import { KM_PER_PC } from '@vialactea/astro';
import { AdditiveBlending, ShaderMaterial } from 'three';

/**
 * Point-sprite star shader. Each vertex is a star (or an aggregate of stars) with an
 * absolute V magnitude; apparent brightness is computed per frame from the true
 * distance to the camera, so the same buffers work from 1 AU to 100 kpc away.
 *
 * Faint stars are drawn at a minimum sprite size with reduced intensity; bright stars
 * grow (and eventually bloom) instead of saturating.
 */
export interface StarMaterialOptions {
  /** Fade in with distance from the camera between these radii (km); for aggregate glow particles. */
  fadeIn?: [number, number];
  /** Fade out with distance from the camera between these radii (km); for streamed cells. */
  fadeOut?: [number, number];
  /** Aggregate particles use a softer, wider profile. */
  soft?: boolean;
  /** Physical smoothing radius for aggregate particles, pc. */
  smoothingPc?: number;
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 starColor;
attribute float absMag;

uniform float uExposure;
uniform float uMinSize;
uniform float uMaxSize;
uniform float uPixelRatio;
uniform vec2 uFadeIn;
uniform vec2 uFadeOut;
uniform float uKmPerPc;
// Aggregate particles: physical smoothing radius (km) and pixels per radian, so nearby
// particles spread into faint haze instead of reading as individual bright stars.
uniform float uSmoothingKm;
uniform float uPixelsPerRadian;

varying vec3 vColor;
varying float vIntensity;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dKm = length(mv.xyz);
  float dPc = max(dKm / uKmPerPc, 1e-12);
  float appMag = absMag + 5.0 * (log2(dPc) * 0.30103) - 5.0;
  // 10^(-0.4 m) = 2^(-1.328771 m)
  float flux = uExposure * exp2(-1.328771 * appMag);
  if (uFadeIn.y > 0.0) flux *= smoothstep(uFadeIn.x, uFadeIn.y, dKm);
  if (uFadeOut.y > 0.0) flux *= 1.0 - smoothstep(uFadeOut.x, uFadeOut.y, dKm);

  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>

  if (flux < 2e-4) {
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
  vColor = starColor;
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

export function createStarMaterial(opts: StarMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uExposure: { value: 8 },
      uMinSize: { value: 2.2 },
      uMaxSize: { value: 48 },
      uPixelRatio: { value: 1 },
      uFadeIn: { value: opts.fadeIn ?? [0, 0] },
      uFadeOut: { value: opts.fadeOut ?? [0, 0] },
      uKmPerPc: { value: KM_PER_PC },
      uSoft: { value: opts.soft ? 1 : 0 },
      uSmoothingKm: { value: opts.smoothingPc ? opts.smoothingPc * KM_PER_PC : 0 },
      uPixelsPerRadian: { value: 700 },
    },
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
}
