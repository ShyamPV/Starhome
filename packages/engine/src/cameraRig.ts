import { Matrix4, Quaternion, Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const MIN_DISTANCE_KM = 0.001;
const MAX_DISTANCE_KM = 5e19; // ~1.6 Mpc

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

interface Flight {
  fromTarget: Vector3;
  fromDistance: number;
  toDistance: number;
  toPitch: number | null;
  toYaw: number | null;
  /** Live destination (follows moving bodies during the flight). */
  getTarget: () => Vector3;
  elapsed: number;
  duration: number;
  /** Extra log-distance at mid-flight so long hops pull back to show context. */
  arc: number;
}

/** The observer's local horizontal frame in the render frame, set each frame in sky mode. */
export interface SkyFrame {
  position: Vector3;
  east: Vector3;
  north: Vector3;
  up: Vector3;
}

interface LookFlight {
  fromAz: number;
  fromAlt: number;
  toAz: number;
  toAlt: number;
  elapsed: number;
  duration: number;
}

const DEG = Math.PI / 180;

/**
 * Orbit / fly camera for a floating-origin world. All state is double precision km.
 * - Orbit: drag to rotate around the target, wheel for logarithmic zoom.
 * - Pan: right-drag or shift-drag.
 * - Fly: WASD (+R/F up/down), speed proportional to the zoom distance; Shift = x5.
 * - flyTo(): smooth log-space travel with a pull-back arc.
 *
 * Sky mode stands at an observer on the Earth: drag to look around (the sky moves with
 * the pointer), wheel to change the field of view, WASD to turn.
 */
export class CameraRig {
  readonly target = new Vector3();
  distance = 1e9;
  yaw = 0.6;
  pitch = 0.35;
  minDistance = MIN_DISTANCE_KM;
  /** Called every frame while following a body to get its current position. */
  follow: (() => Vector3) | null = null;

  readonly position = new Vector3();
  readonly quaternion = new Quaternion();
  /** Camera speed over the last frame, km/s (real time). */
  speedKmS = 0;

  private flight: Flight | null = null;
  mode: 'orbit' | 'sky' = 'orbit';
  /** Sky mode: view direction (degrees; azimuth east of north) and vertical field of view. */
  readonly sky = { az: 180, alt: 25, fov: 70 };
  skyFrame: SkyFrame | null = null;
  private lookFlight: LookFlight | null = null;
  private readonly keys = new Set<string>();
  private readonly lastPosition = new Vector3();
  private dragging: 'orbit' | 'pan' | null = null;
  private lastX = 0;
  private lastY = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private readonly basis = new Matrix4();
  reducedMotion = false;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  get flying(): boolean {
    return this.flight !== null || this.lookFlight !== null;
  }

  /** Sky mode: turn smoothly to look at an altitude/azimuth (degrees). */
  lookAt(alt: number, az: number, fov?: number): void {
    // Take the short way round in azimuth.
    const delta = ((az - this.sky.az + 540) % 360) - 180;
    this.lookFlight = {
      fromAz: this.sky.az,
      fromAlt: this.sky.alt,
      toAz: this.sky.az + delta,
      toAlt: Math.max(-89, Math.min(89, alt)),
      elapsed: 0,
      duration: this.reducedMotion ? 0.01 : 1.2,
    };
    if (fov !== undefined) this.sky.fov = fov;
  }

  /** Unit vector from target to camera. */
  private offsetDir(out: Vector3): Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw));
  }

  /** Yaw and pitch that put the camera in direction `dir` (render frame) from its target. */
  static anglesFor(dir: Vector3): { yaw: number; pitch: number } {
    const d = dir.clone().normalize();
    return { yaw: Math.atan2(d.x, d.z), pitch: Math.max(-1.5697, Math.min(1.5697, Math.asin(d.y))) };
  }

  flyTo(getTarget: () => Vector3, distance: number, opts: { duration?: number; pitch?: number; yaw?: number; follow?: boolean } = {}): void {
    const dest = getTarget();
    const sep = this.target.distanceTo(dest);
    const far = Math.max(this.distance, distance);
    const arc = sep > far ? Math.log(sep / far) * 0.85 : 0;
    const duration = this.reducedMotion ? 0.01 : (opts.duration ?? Math.min(6, 1.8 + 0.25 * Math.log10(1 + sep / Math.max(distance, 1))));
    this.flight = {
      fromTarget: this.target.clone(),
      fromDistance: this.distance,
      toDistance: Math.max(distance, this.minDistance),
      toPitch: opts.pitch ?? null,
      // Turn the short way round.
      toYaw: opts.yaw === undefined ? null : this.yaw + ((((opts.yaw - this.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI,
      getTarget,
      elapsed: 0,
      duration,
      arc,
    };
    this.follow = opts.follow === false ? null : getTarget;
  }

  cancelFlight(): void {
    this.flight = null;
  }

  update(dt: number): void {
    if (this.mode === 'sky' && this.skyFrame) {
      this.updateSky(dt);
      return;
    }
    if (this.flight) {
      const f = this.flight;
      f.elapsed += dt;
      const t = Math.min(1, f.elapsed / f.duration);
      const s = smootherstep(t);
      const dest = f.getTarget();
      this.target.lerpVectors(f.fromTarget, dest, s);
      const logD = Math.log(f.fromDistance) * (1 - s) + Math.log(f.toDistance) * s + f.arc * Math.sin(Math.PI * t);
      this.distance = Math.exp(logD);
      if (f.toPitch !== null) this.pitch += (f.toPitch - this.pitch) * Math.min(1, dt * 3);
      if (f.toYaw !== null) this.yaw += (f.toYaw - this.yaw) * Math.min(1, dt * 3);
      if (t >= 1) this.flight = null;
    } else if (this.follow) {
      this.target.copy(this.follow());
    }

    this.applyKeys(dt);

    this.distance = Math.min(MAX_DISTANCE_KM, Math.max(this.minDistance, this.distance));
    this.position.copy(this.target).addScaledVector(this.offsetDir(this.tmp), this.distance);

    // Look from position toward target with galactic north as up.
    const forward = this.tmp.copy(this.target).sub(this.position).normalize();
    const right = this.tmp2.crossVectors(forward, UP).normalize();
    const up = this.tmp3.crossVectors(right, forward);
    this.quaternion.setFromRotationMatrix(this.basis.makeBasis(right, up, forward.negate()));

    this.speedKmS = dt > 0 ? this.position.distanceTo(this.lastPosition) / dt : 0;
    this.lastPosition.copy(this.position);
  }

  private updateSky(dt: number): void {
    const f = this.lookFlight;
    if (f) {
      f.elapsed += dt;
      const t = Math.min(1, f.elapsed / f.duration);
      const s = smootherstep(t);
      this.sky.az = f.fromAz + (f.toAz - f.fromAz) * s;
      this.sky.alt = f.fromAlt + (f.toAlt - f.fromAlt) * s;
      if (t >= 1) this.lookFlight = null;
    }
    if (this.keys.size) {
      const rate = this.sky.fov * 0.9 * dt * (this.keys.has('shift') ? 3 : 1);
      if (this.keys.has('a')) this.sky.az -= rate;
      if (this.keys.has('d')) this.sky.az += rate;
      if (this.keys.has('w')) this.sky.alt += rate;
      if (this.keys.has('s')) this.sky.alt -= rate;
      this.lookFlight = null;
    }
    this.sky.az = ((this.sky.az % 360) + 360) % 360;
    this.sky.alt = Math.max(-89, Math.min(89, this.sky.alt));
    const { position, east, north, up } = this.skyFrame!;
    const ca = Math.cos(this.sky.alt * DEG);
    const forward = this.tmp
      .copy(east)
      .multiplyScalar(ca * Math.sin(this.sky.az * DEG))
      .addScaledVector(north, ca * Math.cos(this.sky.az * DEG))
      .addScaledVector(up, Math.sin(this.sky.alt * DEG))
      .normalize();
    const right = this.tmp2.crossVectors(forward, up).normalize();
    const camUp = this.tmp3.crossVectors(right, forward);
    this.quaternion.setFromRotationMatrix(this.basis.makeBasis(right, camUp, forward.negate()));
    this.position.copy(position);
    this.lastPosition.copy(position);
    // The observer rides the Earth; report the view's own motion as zero.
    this.speedKmS = 0;
  }

  private applyKeys(dt: number): void {
    if (this.keys.size === 0) return;
    const boost = this.keys.has('shift') ? 5 : 1;
    const step = this.distance * 0.9 * boost * dt;
    const forward = this.tmp.copy(this.offsetDir(this.tmp)).negate();
    const right = this.tmp2.crossVectors(forward, UP).normalize();
    let moved = false;
    const move = (v: Vector3, s: number) => {
      this.target.addScaledVector(v, s);
      moved = true;
    };
    if (this.keys.has('w')) move(forward, step);
    if (this.keys.has('s')) move(forward, -step);
    if (this.keys.has('d')) move(right, step);
    if (this.keys.has('a')) move(right, -step);
    if (this.keys.has('r')) move(UP, step);
    if (this.keys.has('f')) move(UP, -step);
    if (this.keys.has('q')) this.yaw += dt * 1.2;
    if (this.keys.has('e')) this.yaw -= dt * 1.2;
    if (moved) {
      this.follow = null;
      this.flight = null;
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-label]')) return;
    this.dragging = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.mode === 'sky') {
      // Grab the sky: it follows the pointer.
      const degPerPx = this.sky.fov / (this.element.clientHeight || 1);
      this.sky.az -= dx * degPerPx;
      this.sky.alt += dy * degPerPx;
      this.lookFlight = null;
    } else if (this.dragging === 'orbit') {
      this.yaw -= dx * 0.005;
      this.pitch = Math.max(-1.5697, Math.min(1.5697, this.pitch + dy * 0.005));
    } else {
      const h = this.element.clientHeight || 1;
      const scale = (2 * this.distance * Math.tan((30 * Math.PI) / 180)) / h;
      const forward = this.offsetDir(this.tmp).negate();
      const right = this.tmp2.crossVectors(forward, UP).normalize();
      const up = new Vector3().crossVectors(right, forward);
      this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      this.follow = null;
      this.flight = null;
    }
  };

  private onPointerUp = () => {
    this.dragging = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (this.mode === 'sky') {
      this.sky.fov = Math.max(1, Math.min(110, this.sky.fov * Math.exp(delta * 0.0012)));
      return;
    }
    this.distance *= Math.exp(delta * 0.0012);
    if (this.flight) this.flight.toDistance = this.distance;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'shift'].includes(k)) this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
}
