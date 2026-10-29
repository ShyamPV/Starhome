import {
  KM_PER_AU,
  PLANET_IDS,
  SUN_GALACTOCENTRIC_PC,
  bodyOrientationJ2000,
  earthOrientationJ2000,
  galileanMoonsJ2000Km,
  heliocentricEquatorialKm,
  moonGeocentricEquatorialKm,
  sampleOrbit,
  satelliteOffsetJ2000,
  satelliteOrbitNormalJ2000,
  sphericalToCartesian,
  type PlanetId,
  type Vec3,
} from '@starhome/astro';
import { MOON, MOONS, PLANETS, SUN, type BodyInfo, type SatelliteInfo } from '@starhome/data';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { eclipticToRender, equatorialToRender, galPcToWorldKm } from './frames';
import { SurfaceModel } from './moonSurface';

export interface Body {
  info: BodyInfo;
  /** Double-precision world position, km. */
  world: Vector3;
  mesh: Mesh;
}

export interface Satellite {
  info: SatelliteInfo;
  world: Vector3;
  mesh: Mesh;
}

const sphere = new SphereGeometry(1, 64, 32);
const smallSphere = new SphereGeometry(1, 32, 16);
/** Fetch a body's surface map once the camera is within this many radii (it is then a few pixels across). */
const TEXTURE_RANGE_RADII = 4000;
/** Moon orbit lines show within this multiple of the outermost drawn moon's orbit. */
const MOON_ORBIT_RANGE = 60;

/**
 * Sun, planets (VSOP87), the Moon (lunar theory), 20 major moons and orbit lines. All
 * positions are recomputed from the simulation Julian Date every frame; objects are
 * rebased by the floating origin. Bodies turn with their IAU rotation models, so the
 * surface map shows the face really turned toward the Sun; the Earth follows sidereal
 * time exactly. Surface maps load only when the camera comes close.
 */
export class SolarSystem {
  readonly group = new Group();
  readonly sunWorld = galPcToWorldKm(SUN_GALACTOCENTRIC_PC);
  readonly bodies = new Map<string, Body>();
  readonly satellites = new Map<string, Satellite>();
  private readonly light = new PointLight(0xffffff, 3, 0, 0);
  private readonly orbits = new Group();
  private orbitsJd = Number.NaN;
  /** Per-planet moon orbit lines, positioned on their planet. */
  private readonly moonOrbits = new Map<PlanetId, { group: Group; reachKm: number }>();
  private moonOrbitsJd = Number.NaN;
  private orbitsOn = true;
  private readonly anchored: { obj: Object3D; world: Vector3 }[] = [];
  private readonly scratch = new Vector3();
  private readonly basis = new Matrix4();
  private textureBase: string | null = null;
  private readonly textureJobs = new Map<string, () => void>();
  /** Generated surfaces, run one per tick so a moon system does not stall a frame. */
  private readonly generateQueue: (() => void)[] = [];
  private generating = false;
  private readonly loader = new TextureLoader();

  constructor() {
    this.group.add(new AmbientLight(0xffffff, 0.04));
    this.group.add(this.light);
    this.group.add(this.orbits);

    const sunMaterial = new MeshBasicMaterial({ color: new Color(SUN.color).multiplyScalar(6) });
    this.addBody(SUN, new Mesh(sphere, sunMaterial), this.sunWorld.clone());
    this.onTexture(SUN.id, SUN.texture, (map) => {
      sunMaterial.map = map;
      sunMaterial.color.setScalar(4);
      sunMaterial.needsUpdate = true;
    });

    for (const info of [...PLANETS, MOON]) {
      const material = new MeshStandardMaterial({ color: info.color, roughness: 0.92, metalness: 0 });
      const body = this.addBody(info, new Mesh(sphere, material), new Vector3());
      this.onTexture(info.id, info.texture, (map) => {
        material.map = map;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      });
      if (info.surface) this.onGenerated(info.id, new SurfaceModel(info.id, info.surface, info.color, seedOf(info.id)), body.mesh, material);
      if (info.id === 'earth') this.addEarthDetail(body, material);
      if (info.ring) this.addRing(body, info.ring);
    }

    for (const info of MOONS) {
      const material = new MeshStandardMaterial({ color: info.color, roughness: 0.95, metalness: 0 });
      const mesh = new Mesh(smallSphere, material);
      this.onGenerated(info.id, new SurfaceModel(info.id, info.surface, info.color, seedOf(info.id)), mesh, material, info.shapeKm, info.radiusKm);
      mesh.scale.setScalar(info.radiusKm);
      mesh.name = info.id;
      const world = new Vector3();
      this.satellites.set(info.id, { info, world, mesh });
      this.group.add(mesh);
      this.anchored.push({ obj: mesh, world });
    }
    for (const id of new Set(MOONS.map((m) => m.parent))) {
      const group = new Group();
      this.group.add(group);
      this.moonOrbits.set(id, { group, reachKm: 0 });
    }
  }

  /** Surface maps are served from here (e.g. "/textures/"); without it bodies keep their display colours. */
  setTextureBase(url: string): void {
    this.textureBase = url;
  }

  private onTexture(id: string, file: string | undefined, apply: (t: Texture) => void, key = id): void {
    if (!file) return;
    this.textureJobs.set(key, () =>
      this.loader.load(`${this.textureBase}${file}`, (t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        apply(t);
      }),
    );
  }

  /** A generated surface (and, for irregular moons, shape), built when the camera comes close. */
  private onGenerated(key: string, model: SurfaceModel, mesh: Mesh, material: MeshStandardMaterial, shapeKm?: [number, number, number], meanKm?: number): void {
    this.textureJobs.set(key, () =>
      this.enqueue(() => {
        const { map, bump } = model.textures(shapeKm ? 512 : 768);
        material.map = map;
        material.bumpMap = bump;
        material.bumpScale = 2;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        if (shapeKm && meanKm) mesh.geometry = model.geometry(shapeKm, meanKm);
      }),
    );
  }

  private enqueue(job: () => void): void {
    this.generateQueue.push(job);
    if (this.generating) return;
    this.generating = true;
    const pump = () => {
      const next = this.generateQueue.shift();
      if (!next) {
        this.generating = false;
        return;
      }
      next();
      setTimeout(pump, 0);
    };
    setTimeout(pump, 0);
  }

  /** Night lights on the dark side and a cloud layer. */
  private addEarthDetail(earth: Body, material: MeshStandardMaterial): void {
    this.onTexture(
      'earth',
      'earth-night.jpg',
      (map) => {
        material.emissiveMap = map;
        material.emissive.set(0xffd9a0);
        material.emissiveIntensity = 1.4;
        material.needsUpdate = true;
      },
      'earth-night',
    );
    // City lights only where the Sun is down (the point light is the Sun).
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          #if NUM_POINT_LIGHTS > 0
            float sunUp = dot( normal, normalize( pointLights[ 0 ].position + vViewPosition ) );
            totalEmissiveRadiance *= emissiveColor.rgb * ( 1.0 - smoothstep( -0.12, 0.08, sunUp ) );
          #else
            totalEmissiveRadiance *= emissiveColor.rgb;
          #endif
        #endif`,
      );
    };
    const clouds = new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, roughness: 1 });
    const cloudMesh = new Mesh(sphere, clouds);
    cloudMesh.scale.setScalar(1.006);
    cloudMesh.visible = false;
    earth.mesh.add(cloudMesh);
    this.onTexture(
      'earth',
      'earth-clouds.jpg',
      (map) => {
        clouds.alphaMap = map;
        clouds.needsUpdate = true;
        cloudMesh.visible = true;
      },
      'earth-clouds',
    );
  }

  private addRing(body: Body, ring: NonNullable<BodyInfo['ring']>): void {
    const inner = ring.innerKm / body.info.radiusKm;
    const outer = ring.outerKm / body.info.radiusKm;
    const geo = new RingGeometry(inner, outer, 160, 1);
    // Radial texture coordinates: u runs from the inner to the outer edge.
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
    const material = new MeshStandardMaterial({ color: ring.color, side: DoubleSide, transparent: true, opacity: 0.75, roughness: 1, depthWrite: false });
    const mesh = new Mesh(geo, material);
    // RingGeometry lies in the XY plane; the planet's local +Y is its pole, so lay it flat.
    mesh.rotation.x = -Math.PI / 2;
    body.mesh.add(mesh);
    this.onTexture(
      body.info.id,
      ring.texture,
      (map) => {
        material.map = map;
        material.color.set(0xffffff);
        material.opacity = 1;
        material.needsUpdate = true;
      },
      `${body.info.id}-ring`,
    );
  }

  private addBody(info: BodyInfo, mesh: Mesh, world: Vector3): Body {
    mesh.scale.setScalar(info.radiusKm);
    mesh.name = info.id;
    const body: Body = { info, world, mesh };
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

  /** One orbit of each moon, sampled from its own model (relative to the planet). */
  private rebuildMoonOrbits(jd: number): void {
    this.moonOrbitsJd = jd;
    for (const { group } of this.moonOrbits.values()) {
      for (const o of group.children) (o as Line).geometry.dispose();
      group.clear();
    }
    const reach = new Map<PlanetId, number>();
    for (const m of MOONS) {
      const n = 160;
      const period = typeof m.orbit === 'string' ? GALILEAN_PERIOD[m.orbit] : 360 / m.orbit.meanMotion;
      const arr = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        const v = this.moonOffset(m, jd + (period * k) / n);
        arr.set([v.x, v.y, v.z], k * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(arr, 3));
      const line = new LineLoop(geo, new LineBasicMaterial({ color: new Color(m.color).multiplyScalar(0.6), transparent: true, opacity: 0.4, depthWrite: false }));
      line.frustumCulled = false;
      this.moonOrbits.get(m.parent)!.group.add(line);
      reach.set(m.parent, Math.max(reach.get(m.parent) ?? 0, Math.hypot(arr[0]!, arr[1]!, arr[2]!)));
    }
    for (const [id, r] of reach) this.moonOrbits.get(id)!.reachKm = r;
  }

  private galilean: { jd: number; pos: Record<string, Vec3> } | null = null;

  /** A moon's offset from its planet (render frame, km). */
  private moonOffset(m: SatelliteInfo, jd: number): Vector3 {
    let p: Vec3;
    if (typeof m.orbit === 'string') {
      if (this.galilean?.jd !== jd) this.galilean = { jd, pos: galileanMoonsJ2000Km(jd) };
      p = this.galilean.pos[m.orbit]!;
    } else p = satelliteOffsetJ2000(m.orbit, jd);
    return equatorialToRender(p, new Vector3());
  }

  setOrbitsVisible(v: boolean): void {
    this.orbitsOn = v;
    this.orbits.visible = v;
  }

  /** Recompute body positions and orientations for a Julian Date. */
  update(jd: number): void {
    if (!(Math.abs(jd - this.orbitsJd) < 3650)) this.rebuildOrbits(jd);
    // Moon orbits precess (Phobos' node turns in ~2 years): refresh monthly.
    if (!(Math.abs(jd - this.moonOrbitsJd) < 30)) this.rebuildMoonOrbits(jd);

    for (const id of PLANET_IDS) this.placePlanet(id, jd);

    const earth = this.bodies.get('earth')!;
    const moon = this.bodies.get('moon')!;
    moon.world.copy(earth.world).add(equatorialToRender(moonGeocentricEquatorialKm(jd), this.scratch));

    for (const b of this.bodies.values()) {
      if (b.info.id === 'earth') continue;
      const o = bodyOrientationJ2000(b.info, jd);
      this.orient(b.mesh, o.pole, o.primeMeridian);
    }
    // Earth: local +Y to the true pole, +X to the prime meridian (longitude 90 E is -Z).
    const eo = earthOrientationJ2000(jd);
    this.orient(earth.mesh, eo.pole, eo.primeMeridian);

    // Major moons, turned so their prime meridian faces the planet (synchronous rotation).
    for (const s of this.satellites.values()) {
      const planet = this.bodies.get(s.info.parent)!;
      const off = this.moonOffset(s.info, jd);
      s.world.copy(planet.world).add(off);
      const normal = typeof s.info.orbit === 'string' ? equatorialToRender(sphericalToCartesian(planet.info.poleRa, planet.info.poleDec), this.scratch) : equatorialToRender(satelliteOrbitNormalJ2000(s.info.orbit, jd), this.scratch);
      const toPlanet = off.negate().normalize();
      const x = toPlanet.sub(normal.clone().multiplyScalar(toPlanet.dot(normal))).normalize();
      const z = new Vector3().crossVectors(x, normal);
      s.mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(x, normal, z));
    }
  }

  /** Local +Y along the pole, +X to the prime meridian (texture longitude 0), 90 E at -Z. */
  private orient(mesh: Mesh, poleJ2000: Vec3, pmJ2000: Vec3): void {
    const y = equatorialToRender(poleJ2000, new Vector3()).normalize();
    const x = equatorialToRender(pmJ2000, new Vector3()).normalize();
    const z = new Vector3().crossVectors(x, y);
    mesh.quaternion.setFromRotationMatrix(this.basis.makeBasis(x, y, z));
  }

  private placePlanet(id: PlanetId, jd: number): void {
    const body = this.bodies.get(id)!;
    body.world.copy(this.sunWorld).add(equatorialToRender(heliocentricEquatorialKm(id, jd), this.scratch));
  }

  /** Floating origin: place everything relative to the camera, and fetch maps for nearby bodies. */
  rebase(cameraKm: Vector3): void {
    for (const a of this.anchored) a.obj.position.subVectors(a.world, cameraKm);
    this.light.position.subVectors(this.sunWorld, cameraKm);
    this.orbits.position.subVectors(this.sunWorld, cameraKm);
    for (const [id, m] of this.moonOrbits) {
      const planet = this.bodies.get(id)!;
      m.group.position.subVectors(planet.world, cameraKm);
      m.group.visible = this.orbitsOn && planet.world.distanceTo(cameraKm) < m.reachKm * MOON_ORBIT_RANGE;
    }
    if (this.textureBase && this.textureJobs.size) {
      for (const b of [...this.bodies.values(), ...this.satellites.values()]) {
        if (b.world.distanceTo(cameraKm) > b.info.radiusKm * TEXTURE_RANGE_RADII) continue;
        for (const [key, job] of this.textureJobs) {
          if (key !== b.info.id && !key.startsWith(`${b.info.id}-`)) continue;
          this.textureJobs.delete(key);
          job();
        }
      }
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined;
      if (m && 'map' in m) (m as MeshStandardMaterial).map?.dispose();
    });
  }
}

function seedOf(id: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16_777_619);
  return h >>> 0;
}

/** Sidereal periods of the Galilean moons, days (for drawing their orbits). */
const GALILEAN_PERIOD: Record<string, number> = { io: 1.769138, europa: 3.551181, ganymede: 7.154553, callisto: 16.689018 };
