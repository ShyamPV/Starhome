import {
  KM_PER_AU,
  PLANET_IDS,
  SUN_GALACTOCENTRIC_PC,
  J2000,
  moonGeocentricEclipticVec,
  planetHeliocentricEcliptic,
  sampleOrbit,
  sphericalToCartesian,
  type PlanetId,
} from '@vialactea/astro';
import { MOON, PLANETS, SUN, type BodyInfo } from '@vialactea/data';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { eclipticToRender, equatorialToRender, galPcToWorldKm } from './frames';

export interface Body {
  info: BodyInfo;
  /** Double-precision world position, km. */
  world: Vector3;
  mesh: Mesh;
  /** Unit north-pole vector in the render frame. */
  pole: Vector3;
}

const sphere = new SphereGeometry(1, 64, 32);
const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);

/**
 * Sun, planets (Standish elements), Moon and orbit lines. All positions are recomputed
 * from the simulation Julian Date every frame; objects are rebased by the floating origin.
 */
export class SolarSystem {
  readonly group = new Group();
  readonly sunWorld = galPcToWorldKm(SUN_GALACTOCENTRIC_PC);
  readonly bodies = new Map<string, Body>();
  private readonly light = new PointLight(0xffffff, 3, 0, 0);
  private readonly orbits = new Group();
  private orbitsJd = Number.NaN;
  private readonly anchored: { obj: Object3D; world: Vector3 }[] = [];
  private readonly scratch = new Vector3();

  constructor() {
    this.group.add(new AmbientLight(0xffffff, 0.04));
    this.group.add(this.light);
    this.group.add(this.orbits);

    const sunMesh = new Mesh(sphere, new MeshBasicMaterial({ color: new Color(SUN.color).multiplyScalar(6) }));
    this.addBody(SUN, sunMesh, this.sunWorld.clone());

    for (const info of [...PLANETS, MOON]) {
      const mesh = new Mesh(sphere, new MeshStandardMaterial({ color: info.color, roughness: 0.92, metalness: 0 }));
      const body = this.addBody(info, mesh, new Vector3());
      if (info.ring) {
        const ring = new Mesh(
          new RingGeometry(info.ring.innerKm / info.radiusKm, info.ring.outerKm / info.radiusKm, 128, 1),
          new MeshStandardMaterial({ color: info.ring.color, side: DoubleSide, transparent: true, opacity: 0.75, roughness: 1 }),
        );
        // RingGeometry lies in the XY plane; the planet's local +Y is its pole, so lay it flat.
        ring.quaternion.setFromUnitVectors(Z, Y);
        body.mesh.add(ring);
      }
    }
  }

  private addBody(info: BodyInfo, mesh: Mesh, world: Vector3): Body {
    mesh.scale.setScalar(info.radiusKm);
    mesh.name = info.id;
    const pole = equatorialToRender(sphericalToCartesian(info.poleRa, info.poleDec));
    const body: Body = { info, world, mesh, pole };
    this.bodies.set(info.id, body);
    this.group.add(mesh);
    this.anchored.push({ obj: mesh, world });
    return body;
  }

  private rebuildOrbits(jd: number): void {
    this.orbitsJd = jd;
    for (const o of this.orbits.children) (o as Line).geometry.dispose();
    this.orbits.clear();
    for (const id of PLANET_IDS) {
      const pts = sampleOrbit(id, jd, 512);
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => {
        const v = eclipticToRender([p[0] * KM_PER_AU, p[1] * KM_PER_AU, p[2] * KM_PER_AU], this.scratch);
        arr.set([v.x, v.y, v.z], i * 3);
      });
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(arr, 3));
      const color = new Color(PLANETS.find((p) => p.id === id)!.color).multiplyScalar(0.55);
      const line = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
      line.frustumCulled = false;
      this.orbits.add(line);
    }
  }

  setOrbitsVisible(v: boolean): void {
    this.orbits.visible = v;
  }

  /** Recompute body positions and orientations for a Julian Date. */
  update(jd: number): void {
    if (!(Math.abs(jd - this.orbitsJd) < 3650)) this.rebuildOrbits(jd);

    for (const id of PLANET_IDS) this.placePlanet(id, jd);

    const earth = this.bodies.get('earth')!;
    const moon = this.bodies.get('moon')!;
    moon.world.copy(earth.world).add(eclipticToRender(moonGeocentricEclipticVec(jd), this.scratch));

    const hours = (jd - J2000) * 24;
    for (const b of this.bodies.values()) {
      // Orient local +Y to the pole, then spin about it.
      const spin = ((hours / b.info.rotationHours) % 1) * Math.PI * 2;
      b.mesh.quaternion.setFromUnitVectors(Y, b.pole).multiply(new Quaternion().setFromAxisAngle(Y, spin));
    }
  }

  private placePlanet(id: PlanetId, jd: number): void {
    const p = planetHeliocentricEcliptic(id, jd);
    const body = this.bodies.get(id)!;
    body.world.copy(this.sunWorld).add(eclipticToRender([p[0] * KM_PER_AU, p[1] * KM_PER_AU, p[2] * KM_PER_AU], this.scratch));
  }

  /** Floating origin: place everything relative to the camera. */
  rebase(cameraKm: Vector3): void {
    for (const a of this.anchored) a.obj.position.subVectors(a.world, cameraKm);
    this.light.position.subVectors(this.sunWorld, cameraKm);
    this.orbits.position.subVectors(this.sunWorld, cameraKm);
  }
}
