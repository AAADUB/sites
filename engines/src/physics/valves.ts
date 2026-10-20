import { wrap720 } from './kinematics';

/**
 * Four-stroke valve events in crank degrees over a 720° cycle.
 * Convention: 0° = TDC at the start of the intake stroke (gas-exchange TDC),
 * 360° = TDC at the end of compression (firing TDC).
 */
export interface ValveEvent {
  /** crank angle where the valve starts to open */
  open: number;
  /** crank angle where the valve is fully seated again (may exceed 720 → wraps) */
  close: number;
  /** peak lift, mm */
  maxLift: number;
}

export interface ValveTiming {
  intake: ValveEvent;
  exhaust: ValveEvent;
}

/** Typical timing: IVO 10° BTDC, IVC 45° ABDC, EVO 45° BBDC, EVC 10° ATDC. */
export function typicalTiming(intakeShift = 0, exhaustShift = 0): ValveTiming {
  return {
    intake: { open: -10 + intakeShift, close: 180 + 45 + intakeShift, maxLift: 9 },
    exhaust: { open: 540 - 45 + exhaustShift, close: 720 + 10 + exhaustShift, maxLift: 8.5 },
  };
}

/** Normalised position inside the event window, or -1 when the valve is shut. */
export function eventPhase(ev: ValveEvent, theta: number): number {
  const duration = ev.close - ev.open;
  const d = wrap720(theta - ev.open);
  if (d >= duration) return -1;
  return d / duration;
}

/**
 * Cam-derived lift law. The cam lobe is derived from this same function
 * (radius = base circle + lift), so lobe shape and valve motion always agree.
 * A blend of sin² and a sextic polynomial gives zero velocity and acceleration
 * at the seat (gentle ramps) and a broad nose.
 */
export function liftShape(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  const s = Math.sin(Math.PI * u);
  const poly = 64 * u * u * u * (1 - u) * (1 - u) * (1 - u);
  return 0.55 * s * s + 0.45 * poly;
}

export function valveLift(ev: ValveEvent, theta: number): number {
  const u = eventPhase(ev, theta);
  return u < 0 ? 0 : ev.maxLift * liftShape(u);
}

export type StrokeName = 'intake' | 'compression' | 'power' | 'exhaust';

export function strokeAt(theta: number): StrokeName {
  const t = wrap720(theta);
  if (t < 180) return 'intake';
  if (t < 360) return 'compression';
  if (t < 540) return 'power';
  return 'exhaust';
}

/** Fraction through the current stroke, 0..1 */
export function strokeProgress(theta: number): number {
  return (wrap720(theta) % 180) / 180;
}

/** Spark advance in degrees BTDC from a simple speed/load map (typically 10–30°). */
export function sparkAdvance(rpm: number, load: number): number {
  const speedTerm = 10 + 18 * Math.min(1, Math.max(0, (rpm - 800) / 4200));
  const loadTerm = -5 * Math.max(0, load - 0.4);
  return Math.min(30, Math.max(10, speedTerm + loadTerm + 2));
}
