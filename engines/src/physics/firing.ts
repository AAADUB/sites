import { DEG, wrap720 } from './kinematics';

export type LayoutId = 'i4' | 'i6' | 'v8cross' | 'v8flat' | 'boxer4';

export interface Cylinder {
  /** maker-style cylinder number */
  num: number;
  /** bank axis angle from vertical, degrees (0 = upright, ±45 for 90° V, ±90 for boxer) */
  bank: number;
  /** position along the crankshaft, 0 = front */
  row: number;
  /** crank angle (0..720) at which this cylinder reaches firing TDC */
  fireAngle: number;
}

export interface Layout {
  id: LayoutId;
  firingOrder: number[];
  cylinders: Cylinder[];
  /** number of crank throws (rows) */
  rows: number;
}

function build(id: LayoutId, order: number[], place: (num: number) => { bank: number; row: number }, rows: number): Layout {
  const interval = 720 / order.length;
  const cylinders: Cylinder[] = order.map((num, i) => ({ num, ...place(num), fireAngle: i * interval }));
  cylinders.sort((a, b) => a.num - b.num);
  return { id, firingOrder: order, cylinders, rows };
}

/** Common example firing orders (numbering conventions differ between makers). */
export const LAYOUTS: Record<LayoutId, Layout> = {
  i4: build('i4', [1, 3, 4, 2], (n) => ({ bank: 0, row: n - 1 }), 4),
  i6: build('i6', [1, 5, 3, 6, 2, 4], (n) => ({ bank: 0, row: n - 1 }), 6),
  // GM-style numbering: left bank 1-3-5-7, right bank 2-4-6-8, pairs share a throw
  v8cross: build('v8cross', [1, 8, 4, 3, 6, 5, 7, 2], (n) => ({ bank: n % 2 === 1 ? -45 : 45, row: Math.floor((n - 1) / 2) }), 4),
  // left bank 1-4, right bank 5-8, pairs (1,5) (2,6) (3,7) (4,8) share a throw
  v8flat: build('v8flat', [1, 5, 3, 7, 4, 8, 2, 6], (n) => ({ bank: n <= 4 ? 45 : -45, row: (n - 1) % 4 }), 4),
  // right bank 1-3, left bank 2-4; 1 and 2 at the front
  boxer4: build('boxer4', [1, 3, 2, 4], (n) => ({ bank: n % 2 === 1 ? 90 : -90, row: n <= 2 ? 0 : 1 }), 2),
};

/**
 * Angle of the crankpin relative to this cylinder's axis (0 = TDC), degrees.
 * For a cylinder whose firing TDC is at fireAngle, the piston is at TDC whenever
 * θ − fireAngle is a multiple of 360.
 */
export function relativeCrank(c: Cylinder, theta: number): number {
  return theta - c.fireAngle;
}

/** Four-stroke phase of a cylinder, 0..720 with 0 = firing TDC (start of power). */
export function cylinderPhase(c: Cylinder, theta: number): number {
  return wrap720(theta - c.fireAngle);
}

/**
 * Absolute crankpin direction in the engine's front view (degrees from vertical,
 * crank turning so that pins sharing a throw always coincide).
 */
export function pinDirection(c: Cylinder, theta: number): number {
  return c.bank - (theta - c.fireAngle);
}

/**
 * Secondary (2nd-order) and primary reciprocating shaking forces, summed over cylinders,
 * in the engine front plane (x sideways, y vertical). Units are relative: each cylinder
 * contributes cos φ (primary) and λ·cos 2φ (secondary) along its axis. Rotating masses
 * are assumed balanced by counterweights.
 */
export function shakingForces(layout: Layout, theta: number, lambda = 0.29) {
  let px = 0, py = 0, sx = 0, sy = 0;
  for (const c of layout.cylinders) {
    const phi = relativeCrank(c, theta) * DEG;
    const ax = Math.sin(c.bank * DEG);
    const ay = Math.cos(c.bank * DEG);
    const prim = Math.cos(phi);
    const sec = lambda * Math.cos(2 * phi);
    px += prim * ax;
    py += prim * ay;
    sx += sec * ax;
    sy += sec * ay;
  }
  return { primary: Math.hypot(px, py), secondary: Math.hypot(sx, sy), px, py, sx, sy };
}

/** Peak shaking force magnitude over one revolution (sampled). */
export function peakShaking(layout: Layout) {
  let p = 0;
  let s = 0;
  for (let t = 0; t < 360; t += 2) {
    const f = shakingForces(layout, t);
    p = Math.max(p, f.primary);
    s = Math.max(s, f.secondary);
  }
  return { primary: p, secondary: s };
}
