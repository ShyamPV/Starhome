import {
  KM_PER_AU,
  KM_PER_PC,
  SUN_GALACTOCENTRIC_PC,
  equatorialToGalactic,
  raDecDistToGalactocentric,
  solveKepler,
  teffToLinearRgb,
  type Vec3,
} from '@starhome/astro';
import { NAMED_STARS, SIZE_CLASS_LABEL, planetFacts, type ExoHost, type Exoplanet, type ExoplanetCatalog } from '@starhome/data';
import { extinctionV, hash32, type DustMap } from '@starhome/galaxy';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GAL_PC_BASIS, galPcToWorldKm, galToRender } from './frames';
import { createPlanetMaterial } from './planetMaterial';
import { StarBatch } from './starLayers';
import type { Target } from './targets';

const J2000 = 2_451_545;
const R_EARTH_KM = 6371;
const R_SUN_KM = 695_700;
/** Systems open up (meshes, orbits, labels) inside this distance from the host, km. */
const SYSTEM_RANGE_KM = 0.05 * KM_PER_PC;
const EMPTY: ReadonlySet<string> = new Set();

export const CLASS_COLOR: Record<string, string> = {
  rocky: '#c9a27a',
  'super-earth': '#8fd18a',
  'neptune-like': '#7fb8ff',
  'gas-giant': '#f2c88b',
  'hot-jupiter': '#ff7a59',
};

/** Orbital frame of a system in the render frame: in-plane axes x, y and the normal. */
interface OrbitFrame {
  x: Vector3;
  y: Vector3;
  n: Vector3;
}

interface HostEntry {
  host: ExoHost;
  /** Target id used for the host (a named star's id when the host is one). */
  targetId: string;
  galPc: Vec3;
  worldKm: Vector3;
  frame: OrbitFrame;
  starColor: Vector3;
}

/**
 * The orbital plane: inclination i to the plane of the sky (90 deg = edge-on, as for
 * transiting planets). The orientation of the line of nodes is not measured for most
 * planets, so it is taken along celestial east-west.
 */
function orbitFrame(galPc: Vec3, incDeg: number): OrbitFrame {
  const s = SUN_GALACTOCENTRIC_PC;
  const los = new Vector3(...galToRender([galPc[0] - s[0], galPc[1] - s[1], galPc[2] - s[2]]).toArray()).normalize();
  const ncp = galToRender(equatorialToGalactic([0, 0, 1]));
  const north = ncp.clone().addScaledVector(los, -ncp.dot(los)).normalize();
  const east = new Vector3().crossVectors(north, los).normalize();
  const i = (incDeg * Math.PI) / 180;
  // Normal tilts from pointing at the Sun (face-on) toward sky-north (edge-on).
  const n = los.clone().negate().multiplyScalar(Math.cos(i)).addScaledVector(north, Math.sin(i)).normalize();
  const x = east;
  const y = new Vector3().crossVectors(n, x).normalize();
  return { x, y, n };
}

/** Phase at J2000 is not known for most planets: a stable per-planet value. */
function phase0(p: Exoplanet): number {
  return (hash32(...[...p.id].map((c) => c.charCodeAt(0))) / 4294967296) * 2 * Math.PI;
}

export function planetPeriodDays(p: Exoplanet, host: ExoHost): number | null {
  if (p.periodDays) return p.periodDays;
  if (p.aAu && host.massSun) return 365.25 * Math.sqrt(p.aAu ** 3 / host.massSun);
  return null;
}

/** Offset (km, render frame) of a planet from its star at Julian Date jd. */
function orbitOffset(p: Exoplanet, host: ExoHost, f: OrbitFrame, jd: number, out: Vector3): Vector3 {
  const P = planetPeriodDays(p, host);
  if (!p.aAu || !P) return out.set(0, 0, 0);
  const M = (2 * Math.PI * (jd - J2000)) / P + phase0(p);
  const E = solveKepler(M, p.ecc);
  const a = p.aAu * KM_PER_AU;
  const cx = a * (Math.cos(E) - p.ecc);
  const cy = a * Math.sqrt(1 - p.ecc * p.ecc) * Math.sin(E);
  const w = (p.omegaDeg * Math.PI) / 180;
  const u = cx * Math.cos(w) - cy * Math.sin(w);
  const v = cx * Math.sin(w) + cy * Math.cos(w);
  return out.copy(f.x).multiplyScalar(u).addScaledVector(f.y, v);
}

function fmt(v: number | null, digits: number, unit: string): string | null {
  return v === null ? null : `${Number(v.toFixed(digits)).toLocaleString('en-US')} ${unit}`;
}

const markerVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 markerColor;
uniform float uPixelRatio;
uniform float uKmPerPc;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dPc = length(mv.xyz) / uKmPerPc;
  // Visible from tens of parsecs to a few kiloparsecs; hidden very close (the system takes over).
  vAlpha = smoothstep(0.02, 0.2, dPc) * (1.0 - smoothstep(1500.0, 6000.0, dPc));
  vColor = markerColor;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
  gl_PointSize = 7.0 * uPixelRatio;
}
`;

const markerFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float ring = smoothstep(0.62, 0.75, r) * (1.0 - smoothstep(0.85, 1.0, r));
  if (ring * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor * ring * vAlpha * 0.9, 1.0);
}
`;

/**
 * Exoplanet systems: host stars as real points of light, ring markers (toggleable),
 * searchable host and planet targets, and a 3D system (star, planets on Keplerian orbits,
 * habitable zone) when the camera comes close.
 */
export class ExoplanetLayer {
  readonly group = new Group();
  readonly markers: Points;
  private readonly markerMaterial: ShaderMaterial;
  private hostBatch: StarBatch | null = null;
  private hosts: HostEntry[] = [];
  private readonly byHostId = new Map<string, HostEntry>();
  private readonly planetById = new Map<string, { p: Exoplanet; h: HostEntry }>();
  private system: SystemView | null = null;
  private hzVisible = true;
  jd = J2000;
  catalog: ExoplanetCatalog | null = null;

  constructor(
    private readonly starMaterial: ShaderMaterial,
    private readonly onSelect: (id: string) => void,
  ) {
    this.markerMaterial = new ShaderMaterial({
      vertexShader: markerVertex,
      fragmentShader: markerFragment,
      uniforms: { uPixelRatio: { value: 1 }, uKmPerPc: { value: KM_PER_PC } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.markers = new Points(new BufferGeometry(), this.markerMaterial);
    this.markers.matrixAutoUpdate = false;
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  setPixelRatio(pr: number): void {
    this.markerMaterial.uniforms.uPixelRatio!.value = pr;
  }

  setMarkersVisible(on: boolean): void {
    this.markers.visible = on;
  }

  setHabitableZoneVisible(on: boolean): void {
    this.hzVisible = on;
    this.system?.setHzVisible(on);
  }

  /** The system the camera is in, if any. */
  get activeSystem(): ExoHost | null {
    return this.system?.entry.host ?? null;
  }

  /** Build hosts, markers and targets from the catalogue. Returns the new targets. */
  setCatalog(catalog: ExoplanetCatalog, existing: Map<string, Target>): Target[] {
    this.catalog = catalog;
    const targets: Target[] = [];
    const named = NAMED_STARS.map((s) => ({ s, p: raDecDistToGalactocentric(s.ra, s.dec, s.distPc) }));
    const withDist = catalog.hosts.filter((h) => h.distPc !== null);
    const n = withDist.length;
    const positions = new Float32Array(n * 3);
    const colors = new Uint8Array(n * 3);
    const absMag = new Float32Array(n);
    const mPos = new Float32Array(n * 3);
    const mCol = new Float32Array(n * 3);
    const sun = SUN_GALACTOCENTRIC_PC;

    withDist.forEach((h, i) => {
      const archivePc = raDecDistToGalactocentric(h.ra, h.dec, h.distPc!);
      // Is this host one of our named stars? (Same direction and distance within 10%.)
      const alias = named.find(({ s, p }) => Math.hypot(p[0] - archivePc[0], p[1] - archivePc[1], p[2] - archivePc[2]) < 0.1 * s.distPc + 0.05);
      // One star, one position: small catalogue differences are hundreds of AU at these distances.
      const galPc = alias ? alias.p : archivePc;
      const inc = h.planets.find((p) => p.incDeg !== null)?.incDeg ?? 60;
      const teff = h.teffK ?? 5000;
      const rgb = teffToLinearRgb(teff);
      const entry: HostEntry = {
        host: h,
        targetId: alias?.s.id ?? h.id,
        galPc,
        worldKm: galPcToWorldKm(galPc),
        frame: orbitFrame(galPc, inc),
        starColor: new Vector3(...rgb),
      };
      this.hosts.push(entry);
      this.byHostId.set(h.id, entry);
      positions.set([galPc[0] - sun[0], galPc[1] - sun[1], galPc[2] - sun[2]], i * 3);
      mPos.set([galPc[0] - sun[0], galPc[1] - sun[1], galPc[2] - sun[2]], i * 3);
      colors.set(rgb.map((c) => Math.round(c * 255)), i * 3);
      // Named stars are drawn by the catalogue layer already.
      absMag[i] = alias || h.vmag === null ? 99 : h.vmag - 5 * Math.log10(h.distPc! / 10);
      const hz = h.planets.some((p) => p.inHabitableZone);
      const c = new Color(hz ? '#5be3a0' : h.planets.length > 1 ? '#b9a8ff' : '#8b7cff');
      mCol.set([c.r, c.g, c.b], i * 3);
      this.markerBase.push([c.r, c.g, c.b]);

      const approach = entry.frame.n.clone().multiplyScalar(0.75).addScaledVector(galPcToWorldKm(sun).sub(entry.worldKm).normalize(), 0.45).normalize();
      const outer = Math.max(...h.planets.map((p) => p.aAu ?? 0), 0.02);
      if (alias) {
        // Add the planets to the named star's own panel.
        const t = existing.get(alias.s.id);
        if (t) {
          t.details['Known planets'] = String(h.planets.length);
          t.approachFrom = approach;
          t.viewDistanceKm = outer * 3 * KM_PER_AU;
          t.facts = [...t.facts, ...h.planets.slice(0, 1).flatMap(() => [`Hosts ${h.planets.length} known planet${h.planets.length > 1 ? 's' : ''}: ${h.planets.map((p) => p.name).join(', ')}.`])];
        }
      } else {
        targets.push(this.hostTarget(entry, approach, outer));
      }
      for (const p of h.planets) {
        const t = this.planetTarget(p, entry, approach);
        targets.push(t);
        this.planetById.set(p.id, { p, h: entry });
      }
    });

    this.hostBatch = new StarBatch({ count: n, positions, colors, absMag }, sun, this.starMaterial, false);
    this.group.add(this.hostBatch.points);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(mPos, 3));
    geo.setAttribute('markerColor', new BufferAttribute(mCol, 3));
    this.markers.geometry.dispose();
    this.markers.geometry = geo;
    this.markers.matrix.copy(GAL_PC_BASIS);
    this.sunKm = galPcToWorldKm(sun);
    return targets;
  }

  private sunKm = new Vector3();

  /** Real magnitudes include the dust in front: correct them once the dust model is ready. */
  setDust(map: DustMap): void {
    if (!this.hostBatch) return;
    const s = SUN_GALACTOCENTRIC_PC;
    const sun: Vec3 = [s[0] / 1000, s[1] / 1000, s[2] / 1000];
    const attr = this.hostBatch.points.geometry.getAttribute('absMag');
    let i = 0;
    for (const e of this.hosts) {
      const m = attr.getX(i);
      if (m < 90) attr.setX(i, m - extinctionV(map, sun, [e.galPc[0] / 1000, e.galPc[1] / 1000, e.galPc[2] / 1000], 12));
      i++;
    }
    attr.needsUpdate = true;
  }

  private hostTarget(e: HostEntry, approach: Vector3, outerAu: number): Target {
    const h = e.host;
    const details: Record<string, string> = {};
    const put = (k: string, v: string | null) => {
      if (v !== null) details[k] = v;
    };
    put('Spectral type', h.spectralType);
    put('Distance', h.distPc !== null ? `${h.distPc.toFixed(h.distPc < 100 ? 2 : 0)} pc (${Math.round(h.distPc * 3.26156).toLocaleString('en-US')} ly)` : null);
    put('Apparent mag (V)', h.vmag !== null ? h.vmag.toFixed(2) : null);
    put('Temperature', fmt(h.teffK, 0, 'K'));
    put('Radius', fmt(h.radiusSun, 3, 'R☉'));
    put('Mass', fmt(h.massSun, 3, 'M☉'));
    put('Luminosity', h.lumSun !== null ? `${Number(h.lumSun.toPrecision(3))} L☉` : null);
    put('Age', fmt(h.ageGyr, 1, 'Gyr'));
    details['Known planets'] = String(h.planets.length);
    put('Habitable zone', h.hz ? `${h.hz[0].toPrecision(3)}–${h.hz[1].toPrecision(3)} AU (conservative)` : null);
    details['RA / Dec'] = `${h.ra.toFixed(4)}°, ${h.dec.toFixed(4)}°`;
    const famous = h.planets.length >= 5 || (h.distPc ?? 99) < 15;
    return {
      id: e.targetId,
      name: h.name,
      kind: 'star',
      subtitle: `Exoplanet host · ${h.planets.length} planet${h.planets.length > 1 ? 's' : ''}`,
      position: () => e.worldKm,
      radiusKm: (h.radiusSun ?? 1) * R_SUN_KM,
      viewDistanceKm: outerAu * 3 * KM_PER_AU,
      provenance: 'catalog',
      source: this.source(),
      facts: [`Its planets: ${h.planets.map((p) => p.name).join(', ')}.`],
      details,
      labelRange: (famous ? 40 : 0) * KM_PER_PC,
      galPc: e.galPc,
      apparentMag: h.vmag ?? undefined,
      approachFrom: approach,
    };
  }

  private planetTarget(p: Exoplanet, e: HostEntry, approach: Vector3): Target {
    const pos = new Vector3();
    const details: Record<string, string> = {};
    const put = (k: string, v: string | null) => {
      if (v !== null) details[k] = v;
    };
    put('Host star', e.host.name);
    details.Type = SIZE_CLASS_LABEL[p.sizeClass];
    put('Radius', p.radiusEarth !== null ? `${p.radiusEarth.toPrecision(3)} R⊕` : null);
    put('Mass', p.massEarth !== null ? `${Number(p.massEarth.toPrecision(3)).toLocaleString('en-US')} M⊕` : null);
    put('Orbital period', fmt(p.periodDays, p.periodDays !== null && p.periodDays < 10 ? 3 : 1, 'days'));
    put('Semi-major axis', fmt(p.aAu, 4, 'AU'));
    details.Eccentricity = p.ecc.toFixed(3);
    put('Equilibrium temp.', fmt(p.teqK, 0, 'K'));
    put('Stellar flux', p.insolation !== null ? `${Number(p.insolation.toPrecision(3))} × Earth` : null);
    details['Habitable zone'] = p.inHabitableZone ? 'Yes (conservative)' : p.inOptimisticHz ? 'Optimistic zone only' : 'No';
    put('Earth Similarity (est.)', p.esi !== null ? p.esi.toFixed(2) : null);
    put('Discovered', p.year !== null ? `${p.year} · ${p.method}` : p.method);
    put('Facility', p.facility);
    put('Distance', e.host.distPc !== null ? `${e.host.distPc.toFixed(e.host.distPc < 100 ? 2 : 0)} pc` : null);
    const radiusKm = (p.radiusEarth ?? 1) * R_EARTH_KM;
    return {
      id: p.id,
      name: p.name,
      kind: 'exoplanet',
      subtitle: `${SIZE_CLASS_LABEL[p.sizeClass]} · ${e.host.name}`,
      position: () => pos.copy(e.worldKm).add(orbitOffset(p, e.host, e.frame, this.jd, this.scratch)),
      radiusKm,
      // Close enough that the planet fills a good part of the view, its star beyond.
      viewDistanceKm: radiusKm * 7,
      provenance: 'catalog',
      source: `${this.source()} Surface: artist’s impression.`,
      facts: [
        ...planetFacts(p, e.host),
        'Surface shown is an artist’s impression from its size and temperature; orbital phase and orientation on the sky are not measured and are assumed.',
      ],
      details,
      labelRange: 0,
      galPc: e.galPc,
      approachFrom: approach,
    };
  }

  private readonly scratch = new Vector3();

  private source(): string {
    return `NASA Exoplanet Archive, Planetary Systems Composite Parameters (retrieved ${this.catalog?.retrieved ?? 'unknown'}).`;
  }

  /** Show markers only for hosts that pass a filter (null shows all); e.g. the discovery-year timeline. */
  setHostFilter(keep: ((h: ExoHost) => boolean) | null): void {
    const attr = this.markers.geometry.getAttribute('markerColor');
    if (!attr) return;
    this.hosts.forEach((e, i) => {
      const show = !keep || keep(e.host);
      const c = this.markerBase[i]!;
      attr.setXYZ(i, show ? c[0] : 0, show ? c[1] : 0, show ? c[2] : 0);
    });
    attr.needsUpdate = true;
  }

  private markerBase: [number, number, number][] = [];

  /** Target id of a host (a named star's id when the host is one). */
  targetIdOf(hostId: string): string {
    return this.byHostId.get(hostId)?.targetId ?? hostId;
  }

  planet(id: string): { p: Exoplanet; host: ExoHost } | null {
    const r = this.planetById.get(id);
    return r ? { p: r.p, host: r.h.host } : null;
  }

  private readonly lastScan = new Vector3(Infinity, 0, 0);

  /** Ids of the planets of the system the camera is in (the only ones worth testing for "nearest"). */
  get activePlanetIds(): ReadonlySet<string> {
    return this.system?.planetIds ?? EMPTY;
  }

  update(cameraKm: Vector3, selectedId: string | null): void {
    this.hostBatch?.rebase(cameraKm);
    const m = this.markers.matrix.elements;
    m[12] = this.sunKm.x - cameraKm.x;
    m[13] = this.sunKm.y - cameraKm.y;
    m[14] = this.sunKm.z - cameraKm.z;
    this.markers.matrixWorldNeedsUpdate = true;

    // Open the nearest system within range (rescanning the hosts only after the camera has moved).
    let best: HostEntry | null = this.system?.entry ?? null;
    if (this.lastScan.distanceTo(cameraKm) > SYSTEM_RANGE_KM * 0.05 || (best && best.worldKm.distanceTo(cameraKm) > SYSTEM_RANGE_KM)) {
      this.lastScan.copy(cameraKm);
      best = null;
      let bestD = SYSTEM_RANGE_KM;
      for (const e of this.hosts) {
        const d = e.worldKm.distanceTo(cameraKm);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    if (this.system && this.system.entry !== best) {
      this.group.remove(this.system.group);
      this.system.dispose();
      this.system = null;
    }
    if (best && !this.system) {
      this.system = new SystemView(best, this.onSelect);
      this.system.setHzVisible(this.hzVisible);
      this.group.add(this.system.group);
    }
    this.system?.update(this.jd, cameraKm, selectedId);
  }

  dispose(): void {
    this.hostBatch?.dispose();
    this.markers.geometry.dispose();
    this.system?.dispose();
  }
}

/** A planetary system up close: star, planets, orbits and habitable zone, around one host. */
class SystemView {
  readonly group = new Group();
  get planetIds(): ReadonlySet<string> {
    return new Set(this.planets.map((x) => x.p.id));
  }
  private readonly planets: { p: Exoplanet; mesh: Mesh; label: CSS2DObject; material: ShaderMaterial }[] = [];
  private hz: Group | null = null;
  private hzFill: Mesh | null = null;
  private readonly dots: Points;
  private readonly offset = new Vector3();

  constructor(
    readonly entry: HostEntry,
    onSelect: (id: string) => void,
  ) {
    const h = entry.host;
    const f = entry.frame;
    const star = new Mesh(
      new SphereGeometry((h.radiusSun ?? 1) * R_SUN_KM, 48, 24),
      new MeshBasicMaterial({ color: new Color(...entry.starColor.toArray()).multiplyScalar(6) }),
    );
    this.group.add(star);

    // Habitable zone: a very faint band in the orbital plane, outlined at its edges.
    if (h.hz) {
      const hz = new Group();
      hz.matrixAutoUpdate = false;
      hz.matrix.makeBasis(f.x, f.y, f.n);
      this.hzFill = new Mesh(new RingGeometry(h.hz[0] * KM_PER_AU, h.hz[1] * KM_PER_AU, 128, 1), new MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.035, side: DoubleSide, depthWrite: false }));
      hz.add(this.hzFill);
      for (const r of h.hz) {
        const pts: number[] = [];
        for (let k = 0; k < 256; k++) pts.push(Math.cos((k / 256) * 2 * Math.PI) * r * KM_PER_AU, Math.sin((k / 256) * 2 * Math.PI) * r * KM_PER_AU, 0);
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
        const edge = new LineLoop(g, new LineBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.35, depthWrite: false }));
        edge.frustumCulled = false;
        hz.add(edge);
      }
      this.group.add(hz);
      this.hz = hz;
    }

    const dotPos = new Float32Array(h.planets.length * 3);
    const dotCol = new Float32Array(h.planets.length * 3);
    h.planets.forEach((p, i) => {
      const color = new Color(CLASS_COLOR[p.sizeClass]);
      dotCol.set([color.r, color.g, color.b], i * 3);
      // Orbit line.
      const P = planetPeriodDays(p, h);
      if (p.aAu && P) {
        const pts: number[] = [];
        for (let k = 0; k < 256; k++) {
          const E = (k / 256) * 2 * Math.PI;
          const a = p.aAu * KM_PER_AU;
          const cx = a * (Math.cos(E) - p.ecc);
          const cy = a * Math.sqrt(1 - p.ecc * p.ecc) * Math.sin(E);
          const w = (p.omegaDeg * Math.PI) / 180;
          const u = cx * Math.cos(w) - cy * Math.sin(w);
          const v = cx * Math.sin(w) + cy * Math.cos(w);
          const q = f.x.clone().multiplyScalar(u).addScaledVector(f.y, v);
          pts.push(q.x, q.y, q.z);
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
        const line = new LineLoop(geo, new LineBasicMaterial({ color: color.clone().multiplyScalar(0.7), transparent: true, opacity: 0.55, depthWrite: false }));
        line.frustumCulled = false;
        this.group.add(line);
      }
      const material = createPlanetMaterial(p.sizeClass, p.teqK ?? 300, (i + 1) * 7.31, entry.starColor);
      const mesh = new Mesh(new SphereGeometry((p.radiusEarth ?? 1) * R_EARTH_KM, 64, 32), material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const el = document.createElement('button');
      el.className = 'vl-label vl-label--exoplanet';
      el.dataset.label = p.id;
      el.textContent = p.name.startsWith(h.name) ? p.name.slice(h.name.length).trim() || p.name : p.name;
      el.title = p.name;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelect(p.id);
      });
      const label = new CSS2DObject(el);
      label.center.set(-0.15, 0.5);
      this.group.add(label);
      this.planets.push({ p, mesh, label, material });
    });
    const dg = new BufferGeometry();
    dg.setAttribute('position', new BufferAttribute(dotPos, 3));
    dg.setAttribute('color', new BufferAttribute(dotCol, 3));
    // Planets are far smaller than their orbits: a dot keeps each one visible at system scale.
    this.dots = new Points(dg, dotsMaterial());
    this.dots.frustumCulled = false;
    this.group.add(this.dots);
  }

  setHzVisible(on: boolean): void {
    if (this.hz) this.hz.visible = on;
  }

  update(jd: number, cameraKm: Vector3, selectedId: string | null): void {
    const e = this.entry;
    this.group.position.subVectors(e.worldKm, cameraKm);
    const dots = this.dots.geometry.getAttribute('position');
    const starRel = new Vector3().subVectors(e.worldKm, cameraKm);
    // Inside the band the fill would tint the whole view: fade it out up close.
    if (this.hzFill && e.host.hz) {
      const t = Math.min(1, Math.max(0, (starRel.length() / (e.host.hz[1] * KM_PER_AU) - 1) / 2));
      (this.hzFill.material as MeshBasicMaterial).opacity = 0.035 * t;
    }
    this.planets.forEach(({ p, mesh, label, material }, i) => {
      orbitOffset(p, e.host, e.frame, jd, this.offset);
      mesh.position.copy(this.offset);
      label.position.copy(this.offset);
      dots.setXYZ(i, this.offset.x, this.offset.y, this.offset.z);
      material.uniforms.uStarPos!.value.copy(starRel);
      label.element.classList.toggle('is-selected', p.id === selectedId);
    });
    dots.needsUpdate = true;
  }

  dispose(): void {
    for (const { label, material, mesh } of this.planets) {
      label.element.remove();
      material.dispose();
      mesh.geometry.dispose();
    }
    this.group.traverse((o) => {
      if ((o as Mesh).geometry) (o as Mesh).geometry.dispose();
    });
  }
}

function dotsMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
        gl_PointSize = 5.0;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      void main() {
        #include <logdepthbuf_fragment>
        if (length(gl_PointCoord * 2.0 - 1.0) > 1.0) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }`,
    depthWrite: false,
    transparent: true,
  });
}

