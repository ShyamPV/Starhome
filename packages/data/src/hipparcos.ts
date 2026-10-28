/**
 * Loader for the compact Hipparcos binary produced by tools/build-hipparcos.mjs.
 *
 * Layout (little-endian):
 *   0  char[4]  magic "VLHP"
 *   4  u32      version (1)
 *   8  u32      count n
 *   12 u32      reserved
 *   16 f32[3n]  heliocentric Galactic x, y, z (pc)
 *      f32[n]   absolute V magnitude
 *      u32[n]   HIP number
 *      u8[4n]   linear RGB (0-255) + padding
 */

export interface CatalogStars {
  count: number;
  /** Positions are relative to the Sun, in the Galactic orientation, parsecs. */
  positions: Float32Array;
  absMag: Float32Array;
  hip: Uint32Array;
  /** 3 bytes per star (repacked from the file's 4-byte stride). */
  colors: Uint8Array;
}

export const HIPPARCOS_MAGIC = 'VLHP';
/** Hipparcos is complete to roughly V = 7.3; synthetic stars brighter than this are suppressed. */
export const HIPPARCOS_COMPLETE_TO_VMAG = 7.3;

export function decodeHipparcos(buf: ArrayBuffer): CatalogStars {
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== HIPPARCOS_MAGIC) throw new Error(`not a Hipparcos tile (magic ${magic})`);
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`unsupported Hipparcos tile version ${version}`);
  const n = view.getUint32(8, true);
  let off = 16;
  const positions = new Float32Array(buf, off, n * 3);
  off += n * 12;
  const absMag = new Float32Array(buf, off, n);
  off += n * 4;
  const hip = new Uint32Array(buf, off, n);
  off += n * 4;
  const rgba = new Uint8Array(buf, off, n * 4);
  const colors = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = rgba[i * 4]!;
    colors[i * 3 + 1] = rgba[i * 4 + 1]!;
    colors[i * 3 + 2] = rgba[i * 4 + 2]!;
  }
  return { count: n, positions, absMag, hip, colors };
}

/** Fetch and decode the catalogue; resolves to null if it has not been built. */
export async function loadHipparcos(url: string): Promise<CatalogStars | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return decodeHipparcos(await res.arrayBuffer());
  } catch {
    return null;
  }
}
