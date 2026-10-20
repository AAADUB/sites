/**
 * Wankel geometry. Housing is an epitrochoid:
 *   x = e·cos 3α + R·cos α,  y = e·sin 3α + R·sin α
 * The rotor centre orbits the shaft at eccentricity e; the eccentric shaft
 * turns 3 times for each rotor revolution. Apex k sits at
 *   c(β) + R·(cos(φ + 2πk/3), sin(φ + 2πk/3)),  with β = 3φ.
 */
export interface WankelGeom {
  /** generating radius (centre to apex), mm */
  R: number;
  /** eccentricity, mm */
  e: number;
}

export const RX: WankelGeom = { R: 105, e: 15 };

export function housingPoint(g: WankelGeom, alpha: number): [number, number] {
  return [g.e * Math.cos(3 * alpha) + g.R * Math.cos(alpha), g.e * Math.sin(3 * alpha) + g.R * Math.sin(alpha)];
}

export function housingCurve(g: WankelGeom, samples = 720): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) pts.push(housingPoint(g, (i / samples) * Math.PI * 2));
  return pts;
}

/** Rotor angle φ (rad) → rotor centre */
export function rotorCentre(g: WankelGeom, phi: number): [number, number] {
  const beta = 3 * phi;
  return [g.e * Math.cos(beta), g.e * Math.sin(beta)];
}

export function apex(g: WankelGeom, phi: number, k: number): [number, number] {
  const [cx, cy] = rotorCentre(g, phi);
  const a = phi + (2 * Math.PI * k) / 3;
  return [cx + g.R * Math.cos(a), cy + g.R * Math.sin(a)];
}

/** Implicit distance of a point from the housing curve (numeric, coarse+refine). */
export function distanceToHousing(g: WankelGeom, x: number, y: number): number {
  let best = Infinity;
  let bestA = 0;
  const N = 720;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const [hx, hy] = housingPoint(g, a);
    const d = Math.hypot(hx - x, hy - y);
    if (d < best) {
      best = d;
      bestA = a;
    }
  }
  // golden refine
  let lo = bestA - (2 * Math.PI) / N;
  let hi = bestA + (2 * Math.PI) / N;
  for (let it = 0; it < 40; it++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const [ax, ay] = housingPoint(g, m1);
    const [bx, by] = housingPoint(g, m2);
    if (Math.hypot(ax - x, ay - y) < Math.hypot(bx - x, by - y)) hi = m2;
    else lo = m1;
  }
  const [fx, fy] = housingPoint(g, (lo + hi) / 2);
  return Math.hypot(fx - x, fy - y);
}

/**
 * Rotor flank profile (inner envelope) in the rotor's own frame, computed numerically:
 * for each polar direction ψ, the largest radius that never leaves the housing for any
 * rotor angle. Returned as polar radii r(ψ) on `bins` directions. A small running
 * clearance is subtracted except right at the apexes.
 */
export function rotorProfile(g: WankelGeom, bins = 360, clearance = 0.6): Float64Array {
  const r = new Float64Array(bins).fill(Infinity);
  const housing = housingCurve(g, 1440);
  const steps = 720; // rotor angles over one third-turn suffice by symmetry, use full for safety
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * ((2 * Math.PI) / 3);
    const [cx, cy] = rotorCentre(g, phi);
    const cos = Math.cos(-phi);
    const sin = Math.sin(-phi);
    for (const [hx, hy] of housing) {
      const dx = hx - cx;
      const dy = hy - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      let psi = Math.atan2(ry, rx);
      if (psi < 0) psi += Math.PI * 2;
      const b = Math.floor((psi / (Math.PI * 2)) * bins) % bins;
      const rad = Math.hypot(rx, ry);
      if (rad < r[b]) r[b] = rad;
    }
  }
  // enforce 3-fold symmetry (min over equivalent bins) and apply clearance away from apexes
  const third = bins / 3;
  const out = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    const m = Math.min(r[b], r[(b + third) % bins], r[(b + 2 * third) % bins]);
    const psi = (b / bins) * Math.PI * 2;
    const toApex = Math.min(...[0, 1, 2, 3].map((k) => Math.abs(psi - (k * 2 * Math.PI) / 3)));
    const fade = Math.min(1, toApex / 0.12);
    out[b] = Math.min(m, g.R) - clearance * fade;
  }
  return out;
}

/** Area of a polygon (shoelace), absolute. */
export function polyArea(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Polar angle helper in [0, 2π) */
export function polarAngle(x: number, y: number): number {
  const a = Math.atan2(y, x);
  return a < 0 ? a + Math.PI * 2 : a;
}

/** Find the housing parameter α whose point is nearest (x, y). */
export function housingParam(g: WankelGeom, x: number, y: number): number {
  let best = Infinity;
  let bestA = 0;
  const N = 1440;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const [hx, hy] = housingPoint(g, a);
    const d = (hx - x) ** 2 + (hy - y) ** 2;
    if (d < best) {
      best = d;
      bestA = a;
    }
  }
  return bestA;
}
