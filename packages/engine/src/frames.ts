/**
 * World frame used by the renderer.
 *
 * World positions are double-precision kilometres (three.js Vector3 stores JS numbers,
 * i.e. float64) in the Galactocentric frame with axes remapped to three.js's y-up
 * convention: render (x, y, z) = Galactocentric (X, Z, -Y). The North Galactic Pole is
 * "up". Nothing absolute is ever uploaded to the GPU: every frame each object is placed
 * at (world - camera) and the camera sits at the origin (floating origin).
 */
import { KM_PER_PC, eclipticToEquatorial, equatorialToGalactic, type Vec3 } from '@starhome/astro';
import { Matrix4, Vector3 } from 'three';

/** Galactocentric (or heliocentric Galactic) vector -> render-frame vector, same units. */
export function galToRender(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(v[0], v[2], -v[1]);
}

export function renderToGal(v: Vector3): Vec3 {
  return [v.x, -v.z, v.y];
}

/** Galactocentric parsecs -> render-frame kilometres. */
export function galPcToWorldKm(v: Vec3, out = new Vector3()): Vector3 {
  return galToRender(v, out).multiplyScalar(KM_PER_PC);
}

export function worldKmToGalPc(v: Vector3): Vec3 {
  const g = renderToGal(v);
  return [g[0] / KM_PER_PC, g[1] / KM_PER_PC, g[2] / KM_PER_PC];
}

/** J2000 ecliptic vector -> render-frame vector (orientation only; same units). */
export function eclipticToRender(v: Vec3, out = new Vector3()): Vector3 {
  return galToRender(equatorialToGalactic(eclipticToEquatorial(v)), out);
}

/** ICRS equatorial vector -> render-frame vector. */
export function equatorialToRender(v: Vec3, out = new Vector3()): Vector3 {
  return galToRender(equatorialToGalactic(v), out);
}

/**
 * Object matrix for a star batch whose float32 positions are Galactocentric parsecs:
 * axis remap plus parsec -> km scale. Translation is set per frame by the floating origin.
 */
export const GAL_PC_BASIS = new Matrix4().set(
  KM_PER_PC, 0, 0, 0,
  0, 0, KM_PER_PC, 0,
  0, -KM_PER_PC, 0, 0,
  0, 0, 0, 1,
);
