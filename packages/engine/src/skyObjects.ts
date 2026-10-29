import {
  KM_PER_PC,
  bodySky,
  satelliteFromTle,
  satelliteState,
  type GeoLocation,
  type PlanetId,
  type Satellite,
  type SatelliteElements,
  type Vec3,
} from '@starhome/astro';
import { PLANETS } from '@starhome/data';
import { Color, Group, Vector3, type ShaderMaterial } from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { equatorialToRender, renderToGal } from './frames';
import type { SolarSystem } from './solarSystem';
import { StarBatch } from './starLayers';

/** Satellites worth a name on the sky, by NORAD catalogue number. */
const NAMED_SATELLITES: Record<number, string> = { 25544: 'ISS', 48274: 'Tiangong' };
const SKY_PLANETS: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
/** Planet magnitudes change slowly; recompute them at most this often (simulated days). */
const MAG_REFRESH_DAYS = 0.02;

function linearRgb255(hex: string): [number, number, number] {
  const c = new Color(hex);
  const m = Math.max(c.r, c.g, c.b) || 1;
  return [Math.round((c.r / m) * 255), Math.round((c.g / m) * 255), Math.round((c.b / m) * 255)];
}

/** absMag that makes the star shader's distance law give apparent magnitude `mag` at `dPc`. */
function absMagFor(mag: number, dPc: number): number {
  return mag - 5 * Math.log10(dPc) + 5;
}

/**
 * Objects seen from the Earth's surface that the galaxy view doesn't draw as points:
 * the planets (sub-pixel discs from here, so drawn as points with their real apparent
 * magnitudes) and Earth satellites (SGP4, bright only while sunlit).
 */
export class SkyObjects {
  readonly group = new Group();
  private readonly planets: StarBatch;
  private readonly planetMags = new Map<PlanetId, number>();
  private magsJd = Number.NaN;
  private satellites: Satellite[] = [];
  private satBatch: StarBatch | null = null;
  private readonly satLabels = new Map<number, CSS2DObject>();
  private readonly scratch = new Vector3();

  constructor(
    private readonly material: ShaderMaterial,
    private readonly solar: SolarSystem,
  ) {
    const n = SKY_PLANETS.length;
    const colors = new Uint8Array(n * 3);
    SKY_PLANETS.forEach((id, i) => colors.set(linearRgb255(PLANETS.find((p) => p.id === id)!.color), i * 3));
    this.planets = new StarBatch({ count: n, positions: new Float32Array(n * 3), colors, absMag: new Float32Array(n).fill(99) }, [0, 0, 0], material, false);
    this.group.add(this.planets.points);
    this.group.visible = false;
  }

  get satelliteCount(): number {
    return this.satellites.length;
  }

  setSatellites(elements: SatelliteElements[]): void {
    this.satellites = elements.map(satelliteFromTle).filter((s): s is Satellite => s !== null);
    if (this.satBatch) {
      this.group.remove(this.satBatch.points);
      this.satBatch.dispose();
    }
    for (const l of this.satLabels.values()) {
      this.group.remove(l);
      l.element.remove();
    }
    this.satLabels.clear();
    const n = this.satellites.length;
    const colors = new Uint8Array(n * 3).fill(235);
    this.satBatch = new StarBatch({ count: n, positions: new Float32Array(n * 3), colors, absMag: new Float32Array(n).fill(99) }, [0, 0, 0], this.material, false);
    this.group.add(this.satBatch.points);
    for (const s of this.satellites) {
      const name = NAMED_SATELLITES[s.noradId];
      if (!name) continue;
      const el = document.createElement('div');
      el.className = 'vl-sat-label';
      el.textContent = name;
      const obj = new CSS2DObject(el);
      obj.center.set(-0.15, 0.5);
      obj.visible = false;
      this.satLabels.set(s.noradId, obj);
      this.group.add(obj);
    }
  }

  set visible(v: boolean) {
    this.group.visible = v;
    if (!v) for (const l of this.satLabels.values()) l.visible = false;
  }

  /**
   * @param observerWorld observer position, render-frame km (double precision)
   * @param observerGeo observer relative to the Earth's centre, J2000 km
   * @param up the observer's zenith, render frame
   */
  update(jd: number, loc: GeoLocation, observerWorld: Vector3, observerGeo: Vec3, cameraKm: Vector3, up: Vector3, showSatellites: boolean): void {
    if (!this.group.visible) return;
    if (!(Math.abs(jd - this.magsJd) < MAG_REFRESH_DAYS)) {
      this.magsJd = jd;
      for (const id of SKY_PLANETS) this.planetMags.set(id, bodySky(id as Exclude<PlanetId, 'earth'>, jd, loc).mag ?? 99);
    }

    // Planets: positions relative to the observer, Galactic-oriented parsecs.
    const pos = this.planets.points.geometry.getAttribute('position');
    const mag = this.planets.points.geometry.getAttribute('absMag');
    SKY_PLANETS.forEach((id, i) => {
      const rel = this.scratch.subVectors(this.solar.bodies.get(id)!.world, observerWorld);
      const g = renderToGal(rel);
      pos.setXYZ(i, g[0] / KM_PER_PC, g[1] / KM_PER_PC, g[2] / KM_PER_PC);
      mag.setX(i, absMagFor(this.planetMags.get(id) ?? 99, rel.length() / KM_PER_PC));
    });
    pos.needsUpdate = true;
    mag.needsUpdate = true;
    this.planets.originKm.copy(observerWorld);
    this.planets.rebase(cameraKm);

    const sats = this.satBatch;
    if (!sats) return;
    sats.points.visible = showSatellites;
    const sp = sats.points.geometry.getAttribute('position');
    const sm = sats.points.geometry.getAttribute('absMag');
    this.satellites.forEach((s, i) => {
      const st = showSatellites ? satelliteState(s, jd) : null;
      const label = this.satLabels.get(s.noradId);
      if (!st) {
        sm.setX(i, 99);
        if (label) label.visible = false;
        return;
      }
      const rel = equatorialToRender([st.j2000[0] - observerGeo[0], st.j2000[1] - observerGeo[1], st.j2000[2] - observerGeo[2]], this.scratch);
      const g = renderToGal(rel);
      sp.setXYZ(i, g[0] / KM_PER_PC, g[1] / KM_PER_PC, g[2] / KM_PER_PC);
      // Standard magnitude is defined at 1000 km; phase is ignored.
      sm.setX(i, st.sunlit ? absMagFor(s.stdMag, 1000 / KM_PER_PC) : 99);
      if (label) {
        label.position.copy(rel).add(observerWorld).sub(cameraKm);
        label.visible = st.sunlit && rel.dot(up) > 0;
      }
    });
    sp.needsUpdate = true;
    sm.needsUpdate = true;
    sats.originKm.copy(observerWorld);
    sats.rebase(cameraKm);
  }

  dispose(): void {
    this.planets.dispose();
    this.satBatch?.dispose();
    for (const l of this.satLabels.values()) l.element.remove();
  }
}
