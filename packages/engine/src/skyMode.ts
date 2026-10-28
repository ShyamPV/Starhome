import {
  DEG,
  bodySky,
  cartesianToSpherical,
  constellationAt,
  galactocentricToHeliocentric,
  galacticToEquatorial,
  localFrameJ2000,
  moonPhase,
  observerGeocentricEquatorialKm,
  type GeoLocation,
  type RiseSetTarget,
  type RiseSetTimes,
  type SatellitePass,
  type SkyBodyId,
  type Vec3,
} from '@starhome/astro';
import { loadTles, type Tle } from '@starhome/data';
import { Group, Vector3, type ShaderMaterial } from 'three';
import type { SkyFrame } from './cameraRig';
import { equatorialToRender, renderToGal } from './frames';
import { SkyWorkerClient } from './skyClient';
import { SkyObjects } from './skyObjects';
import { DEFAULT_SKY_LAYERS, SkyView, type SkyLayers } from './skyView';
import type { SolarSystem } from './solarSystem';

export const DEFAULT_LOCATION: GeoLocation = { latDeg: 51.4769, lonDeg: -0.0005, heightM: 46 };

/** Height of the eye above the ground, km (keeps the camera clear of the terrain). */
const EYE_KM = 0.002;

export interface SkyHud {
  location: GeoLocation;
  /** Centre of the view. */
  viewAlt: number;
  viewAz: number;
  viewRa: number;
  viewDec: number;
  constellation: string;
  fovDeg: number;
  sunAlt: number;
  satellites: number;
}

export type Visibility = 'naked eye' | 'binoculars' | 'telescope' | 'hidden by dust';

export interface WhereToFind {
  alt: number;
  az: number;
  /** J2000 RA/Dec, degrees. */
  ra: number;
  dec: number;
  constellation: string;
  mag: number | null;
  visibility: Visibility | null;
  times: RiseSetTimes;
}

export interface TonightRow {
  id: string;
  name: string;
  alt: number;
  az: number;
  mag: number | null;
  times: RiseSetTimes;
  note?: string;
}

function raDecOf(v: Vec3): { ra: number; dec: number } {
  const s = cartesianToSpherical(v);
  return { ra: s.lon, dec: s.lat };
}

/** J2000 RA/Dec of a Galactocentric position (pc) as seen from the Sun. */
export function raDecOfGalactocentric(galPc: Vec3): { ra: number; dec: number } {
  return raDecOf(galacticToEquatorial(galactocentricToHeliocentric(galPc)));
}

export function visibilityOf(mag: number | null): Visibility | null {
  if (mag === null) return null;
  return mag < 6 ? 'naked eye' : mag < 9.5 ? 'binoculars' : 'telescope';
}

/**
 * Looking up from the Earth: the observer's location and horizon frame, the sky view's
 * layers, planets and satellites as points, and the slower searches (rise/set, passes)
 * in a worker.
 */
export class SkyMode {
  readonly group = new Group();
  readonly view = new SkyView();
  readonly objects: SkyObjects;
  private readonly worker = new SkyWorkerClient();
  location: GeoLocation = { ...DEFAULT_LOCATION };
  active = false;
  private tles: Tle[] = [];
  private tlesRequested = false;
  tleFetchedAt: number | null = null;
  /** Observer position (render-frame km), horizon frame, and geocentric J2000 offset. */
  readonly frame: SkyFrame = { position: new Vector3(), east: new Vector3(), north: new Vector3(), up: new Vector3() };
  private observerGeo: Vec3 = [0, 0, 0];
  private sunAlt = -90;

  constructor(
    pointMaterial: ShaderMaterial,
    private readonly solar: SolarSystem,
  ) {
    this.objects = new SkyObjects(pointMaterial, solar);
    this.group.add(this.view.group, this.objects.group);
  }

  get layers(): SkyLayers {
    return this.view.currentLayers;
  }

  setLayers(layers: Partial<SkyLayers>): void {
    this.view.setLayers({ ...DEFAULT_SKY_LAYERS, ...this.view.currentLayers, ...layers });
  }

  setActive(on: boolean): void {
    this.active = on;
    this.view.visible = on;
    this.objects.visible = on;
    if (on && !this.tlesRequested) {
      this.tlesRequested = true;
      void loadTles().then(({ tles, fetchedAt }) => {
        this.tles = tles;
        this.tleFetchedAt = fetchedAt;
        this.objects.setSatellites(tles);
      });
    }
  }

  /** Observer position and horizon frame for this instant (call before the camera rig updates). */
  updateFrame(jd: number): SkyFrame {
    const earth = this.solar.bodies.get('earth')!;
    this.observerGeo = observerGeocentricEquatorialKm(jd, this.location);
    const lf = localFrameJ2000(jd, this.location);
    equatorialToRender(lf.east, this.frame.east).normalize();
    equatorialToRender(lf.north, this.frame.north).normalize();
    equatorialToRender(lf.up, this.frame.up).normalize();
    this.frame.position
      .copy(earth.world)
      .add(equatorialToRender(this.observerGeo, new Vector3()))
      .addScaledVector(this.frame.up, EYE_KM);
    return this.frame;
  }

  /** Update the sky's appearance after the camera moved; returns the daylight dimming of starlight. */
  update(jd: number, cameraKm: Vector3, fovDeg: number): number {
    const sunDir = new Vector3().subVectors(this.solar.sunWorld, this.frame.position).normalize();
    this.sunAlt = Math.asin(Math.max(-1, Math.min(1, sunDir.dot(this.frame.up)))) / DEG;
    const dim = this.view.update(this.frame, sunDir, fovDeg);
    this.objects.update(jd, this.location, this.frame.position, this.observerGeo, cameraKm, this.frame.up, this.layers.satellites);
    return dim;
  }

  /** Altitude and azimuth (degrees) of a world position (render-frame km) for the observer. */
  altAzOf(worldKm: Vector3): { alt: number; az: number } {
    const d = new Vector3().subVectors(worldKm, this.frame.position).normalize();
    const alt = Math.asin(Math.max(-1, Math.min(1, d.dot(this.frame.up)))) / DEG;
    const az = ((Math.atan2(d.dot(this.frame.east), d.dot(this.frame.north)) / DEG) % 360 + 360) % 360;
    return { alt, az };
  }

  hud(viewAlt: number, viewAz: number, fovDeg: number): SkyHud {
    const ca = Math.cos(viewAlt * DEG);
    const dir = new Vector3()
      .addScaledVector(this.frame.east, ca * Math.sin(viewAz * DEG))
      .addScaledVector(this.frame.north, ca * Math.cos(viewAz * DEG))
      .addScaledVector(this.frame.up, Math.sin(viewAlt * DEG));
    const { ra, dec } = raDecOf(galacticToEquatorial(renderToGal(dir)));
    return {
      location: this.location,
      viewAlt,
      viewAz,
      viewRa: ra,
      viewDec: dec,
      constellation: constellationAt(ra, dec).name,
      fovDeg,
      sunAlt: this.sunAlt,
      satellites: this.objects.satelliteCount,
    };
  }

  /** Where to find an object tonight: position now and the next rise, transit and set. */
  async whereToFind(target: { body?: Exclude<SkyBodyId, 'earth'>; worldKm: Vector3; mag?: number | null; obscured?: boolean }, jd: number): Promise<WhereToFind> {
    let ra: number;
    let dec: number;
    let mag = target.mag ?? null;
    let riseTarget: RiseSetTarget;
    if (target.body) {
      const s = bodySky(target.body, jd, this.location);
      ({ ra, dec } = s);
      mag = s.mag;
      riseTarget = target.body;
    } else {
      // From the observer's position (fine for anything beyond the Solar System).
      const d = new Vector3().subVectors(target.worldKm, this.frame.position);
      ({ ra, dec } = raDecOf(galacticToEquatorial(renderToGal(d))));
      riseTarget = { raDeg: ra, decDeg: dec };
    }
    const { alt, az } = this.altAzOf(target.worldKm);
    const times = await this.worker.riseSet(riseTarget, this.location, jd);
    return {
      alt,
      az,
      ra,
      dec,
      constellation: constellationAt(ra, dec).name,
      mag,
      visibility: target.obscured ? 'hidden by dust' : visibilityOf(mag),
      times,
    };
  }

  /** The Sun, Moon, planets and the Galactic centre for the "tonight" list. */
  async tonight(jd: number, galacticCentrePc: Vec3): Promise<TonightRow[]> {
    const bodies: { id: Exclude<SkyBodyId, 'earth'>; name: string }[] = [
      { id: 'sun', name: 'Sun' },
      { id: 'moon', name: 'Moon' },
      { id: 'mercury', name: 'Mercury' },
      { id: 'venus', name: 'Venus' },
      { id: 'mars', name: 'Mars' },
      { id: 'jupiter', name: 'Jupiter' },
      { id: 'saturn', name: 'Saturn' },
      { id: 'uranus', name: 'Uranus' },
      { id: 'neptune', name: 'Neptune' },
    ];
    const rows = bodies.map(async (b): Promise<TonightRow> => {
      const s = bodySky(b.id, jd, this.location);
      const times = await this.worker.riseSet(b.id, this.location, jd);
      const note = b.id === 'moon' ? `${Math.round(moonPhase(jd).illuminated * 100)}% lit` : undefined;
      return { id: b.id, name: b.name, alt: s.alt, az: s.az, mag: s.mag, times, note };
    });
    const gc = raDecOfGalactocentric(galacticCentrePc);
    const gcRow = (async (): Promise<TonightRow> => {
      const h = this.altAzOf(new Vector3()); // Sgr A* sits at the world origin.
      const times = await this.worker.riseSet({ raDeg: gc.ra, decDeg: gc.dec }, this.location, jd);
      return { id: 'sgr-a-star', name: 'Galactic centre', alt: h.alt, az: h.az, mag: null, times, note: 'Milky Way core, in Sagittarius' };
    })();
    return Promise.all([...rows, gcRow]);
  }

  /** Next pass of a satellite by NORAD number (null if none within a day or no data). */
  async nextPass(noradId: number, jd: number): Promise<{ name: string; pass: SatellitePass | null } | null> {
    const tle = this.tles.find((t) => Number(t.line1.slice(2, 7)) === noradId);
    if (!tle) return null;
    return { name: tle.name, pass: await this.worker.nextPass(tle, this.location, jd, 24) };
  }

  dispose(): void {
    this.worker.dispose();
    this.view.dispose();
    this.objects.dispose();
  }
}
