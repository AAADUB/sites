import { onTick } from '../core/clock';
import { buildCycle, type CycleKind, type CycleTable } from '../physics/cycle';
import type { CrankGeometry } from '../physics/kinematics';
import { typicalTiming, type ValveTiming } from '../physics/valves';

export type SpeedFactor = 1 | 0.25 | 0.05;

/**
 * Simulation state for one engine: a single crank angle θ advanced by the shared clock.
 * Everything visual (3D, readouts, P–V dot) reads θ from here.
 */
export class EngineSim {
  theta = 0;
  rpm: number;
  load: number;
  boost = 0;
  speed: number;
  playing = true;
  readonly kind: CycleKind;
  readonly geom: CrankGeometry;
  timing: ValveTiming = typicalTiming();
  table: CycleTable;
  readonly idle: number;
  readonly redline: number;
  private listeners = new Set<() => void>();
  private dirty = false;
  private unsub: () => void;
  /** visual cycle span: 720 for four-strokes, 360 for two-strokes */
  readonly span: number;

  constructor(kind: CycleKind, geom: CrankGeometry, opts: { rpm?: number; load?: number; speed?: number; idle?: number; redline?: number } = {}) {
    this.kind = kind;
    this.geom = geom;
    this.idle = opts.idle ?? (kind === 'diesel' ? 750 : kind === 'two-stroke' ? 1400 : 800);
    this.redline = opts.redline ?? (kind === 'diesel' ? 4500 : kind === 'two-stroke' ? 9000 : 7000);
    this.rpm = opts.rpm ?? this.idle;
    this.load = opts.load ?? 0.3;
    this.speed = opts.speed ?? 0.05;
    this.span = kind === 'two-stroke' ? 360 : 720;
    this.table = buildCycle({ kind, geom, rpm: this.rpm, load: this.load, timing: this.timing });
    this.unsub = onTick((dt) => this.tick(dt), -10);
  }

  private tick(dt: number) {
    if (this.dirty) {
      this.dirty = false;
      this.table = buildCycle({ kind: this.kind, geom: this.geom, rpm: this.rpm, load: this.load, boost: this.boost, timing: this.timing });
      this.emit();
    }
    if (!this.playing) return;
    // degrees per second = rpm × 6, scaled by the slow-motion factor
    this.theta += this.rpm * 6 * dt * this.speed;
    if (this.theta > 1e6) this.theta %= 720;
  }

  set(p: Partial<Pick<EngineSim, 'rpm' | 'load' | 'boost' | 'timing'>>) {
    Object.assign(this, p);
    this.dirty = true;
  }

  setTheta(theta: number) {
    this.theta = theta;
    this.emit();
  }

  on(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((f) => f());
  }

  /** crank angle inside the visible cycle */
  get cycleAngle() {
    return ((this.theta % this.span) + this.span) % this.span;
  }

  dispose() {
    this.unsub();
    this.listeners.clear();
  }
}

/** Shared, page-wide simulations (so the lab tools can sync with the 3D engine). */
const shared = new Map<string, EngineSim>();
export function sharedSim(id: string, make: () => EngineSim): EngineSim {
  let s = shared.get(id);
  if (!s) {
    s = make();
    shared.set(id, s);
  }
  return s;
}
