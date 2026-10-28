import type { SizeClass } from '@starhome/data';
import { ShaderMaterial, Vector3 } from 'three';

/**
 * Procedural exoplanet surfaces ("artist's impression"): the look follows the planet's
 * size class and equilibrium temperature: lava worlds, temperate oceans, ice, deserts,
 * banded gas giants, glowing hot Jupiters. Lit by its star from the star's direction.
 */
const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;
void main() {
  vLocal = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uStarPos;
uniform vec3 uStarColor;
uniform int uKind;
uniform float uTeq;
uniform float uSeed;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vLocal;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 p = vLocal * 2.5 + uSeed;
  float lat = vLocal.y;
  vec3 albedo;
  vec3 emit = vec3(0.0);
  if (uKind <= 1) {
    // Rocky and super-Earth.
    float h = fbm(p);
    if (uTeq > 900.0) {
      albedo = mix(vec3(0.08, 0.06, 0.05), vec3(0.16, 0.12, 0.1), h);
      float crack = pow(1.0 - abs(2.0 * fbm(p * 2.0 + 3.1) - 1.0), 8.0);
      emit = vec3(1.0, 0.35, 0.08) * crack * clamp((uTeq - 900.0) / 900.0, 0.2, 1.5);
    } else if (uTeq > 180.0 && uTeq < 330.0) {
      float sea = smoothstep(0.5, 0.53, h);
      vec3 land = mix(vec3(0.25, 0.32, 0.15), vec3(0.45, 0.38, 0.25), fbm(p * 3.0));
      albedo = mix(vec3(0.04, 0.12, 0.32), land, sea);
      albedo = mix(albedo, vec3(0.92), smoothstep(0.78, 0.86, abs(lat) + 0.08 * h));
      albedo = mix(albedo, vec3(1.0), smoothstep(0.62, 0.78, fbm(p * 1.7 + 9.0)) * 0.7);
    } else if (uTeq <= 180.0) {
      albedo = mix(vec3(0.75, 0.82, 0.9), vec3(0.95), h);
      albedo *= 1.0 - 0.3 * pow(1.0 - abs(2.0 * fbm(p * 3.0) - 1.0), 10.0);
    } else {
      albedo = mix(vec3(0.42, 0.33, 0.24), vec3(0.62, 0.5, 0.36), h);
      albedo *= 0.8 + 0.4 * fbm(p * 6.0);
    }
  } else if (uKind == 2) {
    // Neptune-like: hazy, faint bands.
    float b = sin(lat * 14.0 + fbm(p) * 2.0);
    albedo = uTeq < 400.0 ? mix(vec3(0.25, 0.45, 0.8), vec3(0.45, 0.7, 0.9), 0.5 + 0.2 * b) : mix(vec3(0.5, 0.65, 0.65), vec3(0.75, 0.8, 0.75), 0.5 + 0.2 * b);
  } else {
    // Gas giants: zonal bands, colour by temperature; hot Jupiters glow on the night side.
    float b = sin(lat * 18.0 + fbm(p * vec3(1.0, 4.0, 1.0)) * 3.0);
    if (uTeq < 250.0) albedo = mix(vec3(0.62, 0.5, 0.36), vec3(0.92, 0.86, 0.74), 0.5 + 0.5 * b);
    else if (uTeq < 900.0) albedo = mix(vec3(0.35, 0.28, 0.25), vec3(0.75, 0.68, 0.62), 0.5 + 0.5 * b);
    else {
      albedo = mix(vec3(0.08, 0.06, 0.07), vec3(0.22, 0.14, 0.12), 0.5 + 0.5 * b);
      emit = vec3(1.0, 0.25, 0.08) * clamp((uTeq - 900.0) / 1500.0, 0.1, 1.0) * (0.6 + 0.4 * b);
    }
  }
  vec3 L = normalize(uStarPos - vPosW);
  float ndl = max(dot(normalize(vNormalW), L), 0.0);
  vec3 col = albedo * uStarColor * (0.015 + ndl) + emit * (1.0 - 0.7 * ndl);
  gl_FragColor = vec4(col, 1.0);
}
`;

const KIND: Record<SizeClass, number> = { rocky: 0, 'super-earth': 1, 'neptune-like': 2, 'gas-giant': 3, 'hot-jupiter': 4 };

export function createPlanetMaterial(sizeClass: SizeClass, teqK: number, seed: number, starColor: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uStarPos: { value: new Vector3() },
      uStarColor: { value: starColor.clone() },
      uKind: { value: KIND[sizeClass] },
      uTeq: { value: teqK },
      uSeed: { value: seed },
    },
  });
}
