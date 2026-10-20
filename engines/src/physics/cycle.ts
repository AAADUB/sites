import {
  type CrankGeometry,
  cylinderVolumeCc,
  wrap360,
  wrap720,
} from './kinematics';
import { sparkAdvance, typicalTiming, type ValveTiming } from './valves';

/** Wiebe burned mass fraction: x_b(θ) = 1 − exp(−a·((θ − θ0)/Δθ)^(m+1)) */
export function wiebe(theta: number, theta0: number, duration: number, a = 5, m = 2): number {
  if (theta <= theta0) return 0;
  const u = (theta - theta0) / duration;
  return 1 - Math.exp(-a * Math.pow(u, m + 1));
}

export type CycleKind = 'otto' | 'diesel' | 'two-stroke';

export interface CycleParams {
  kind: CycleKind;
  geom: CrankGeometry;
  rpm: number;
  /** 0..1 (throttle for petrol, fuel quantity for diesel) */
  load: number;
  /** extra intake pressure from forced induction, bar */
  boost?: number;
  timing?: ValveTiming;
}

export interface CycleTable {
  params: CycleParams;
  /** samples per degree */
  res: number;
  /** cycle length in degrees (720 or 360) */
  span: number;
  p: Float32Array; // bar (absolute)
  v: Float32Array; // cm³
  t: Float32Array; // gas temperature, K (approximate)
  xb: Float32Array; // burned fraction of the current charge 0..1
  /** angle at which ignition happens (spark or start of injection) */
  ignition: number;
  /** angle where heat release starts */
  burnStart: number;
  burnDuration: number;
  peakPressure: number;
  peakAngle: number;
  /** indicated work per cycle, J */
  work: number;
}

const GAMMA = 1.35; // ratio of specific heats for hot charge (heat-release term)
const N_POLY = 1.3; // polytropic exponent for compression / expansion
const T_INTAKE = 320; // K

/**
 * Build a pressure/volume table for one full cycle with first-law integration:
 * dp = (γ−1)/V · dQ − n·p/V · dV, heat release from a Wiebe function.
 * Gas exchange is modelled with simple relaxations toward manifold pressure.
 */
export function buildCycle(params: CycleParams): CycleTable {
  const res = 2;
  const isTwo = params.kind === 'two-stroke';
  const span = isTwo ? 360 : 720;
  const n = span * res;
  const p = new Float32Array(n);
  const v = new Float32Array(n);
  const t = new Float32Array(n);
  const xb = new Float32Array(n);
  const g = params.geom;
  const load = Math.min(1, Math.max(0, params.load));
  const boost = params.boost ?? 0;
  const timing = params.timing ?? typicalTiming();
  const rpmN = Math.min(1, Math.max(0, (params.rpm - 800) / 6200));

  // Manifold conditions
  let pInt: number;
  if (params.kind === 'otto') pInt = 0.32 + 0.68 * load + boost;
  else pInt = 1.0 + boost; // diesel and two-stroke run unthrottled here (two-stroke uses crankcase)
  if (params.kind === 'two-stroke') pInt = 0.55 + 0.6 * load;
  const pExh = 1.03 + 0.12 * load + 0.4 * boost;

  // Volume table (two-stroke uses 0..360 with TDC at 0; four-stroke 0..720)
  for (let i = 0; i < n; i++) v[i] = cylinderVolumeCc(g, i / res);

  // Trapped charge & fuel energy
  const ivcAngle = isTwo ? 255 : timing.intake.close; // exhaust port closes at 255° on the two-stroke
  const vTrap = cylinderVolumeCc(g, ivcAngle) / 1e6; // m³
  const rho = (pInt * 1e5) / (287 * T_INTAKE);
  const ve = isTwo ? 0.6 : 0.88 - 0.1 * Math.abs(rpmN - 0.55);
  const mAir = rho * vTrap * ve; // kg
  let fuel: number;
  if (params.kind === 'otto') fuel = mAir / 14.7;
  else if (params.kind === 'diesel') fuel = (mAir / 14.5 / 1.45) * (0.12 + 0.88 * load);
  else fuel = (mAir / 13.5) * 0.75; // short-circuit losses in crankcase scavenging
  const lhv = params.kind === 'diesel' ? 42.8e6 : 44e6;
  const qTotal = fuel * lhv * 0.8; // J, wall-heat loss lumped in
  const mGas = mAir + fuel;

  // Ignition and combustion timing
  let ignition: number;
  let burnStart: number;
  let burnDuration: number;
  const tdcFire = isTwo ? 360 : 360;
  if (params.kind === 'otto') {
    ignition = tdcFire - sparkAdvance(params.rpm, load);
    burnStart = ignition + 2;
    burnDuration = 42 + 14 * rpmN;
  } else if (params.kind === 'diesel') {
    ignition = tdcFire - 14; // start of injection
    burnStart = ignition + 5; // ignition delay
    burnDuration = 40 + 10 * rpmN;
  } else {
    ignition = tdcFire - 22;
    burnStart = ignition + 4;
    burnDuration = 48;
  }

  const heatFraction = (theta: number): number => {
    if (params.kind === 'diesel') {
      // short premixed spike followed by mixing-controlled burn
      const pre = 0.3 * wiebe(theta, burnStart, 6, 5, 2);
      const diff = 0.7 * wiebe(theta, burnStart + 2, burnDuration, 5, 1.2);
      return pre + diff;
    }
    return wiebe(theta, burnStart, burnDuration, 5, 2);
  };

  // Integrate: start at intake BDC-ish with manifold pressure, run two cycles to settle.
  const evo = isTwo ? 105 : timing.exhaust.open;
  const evc = isTwo ? 255 : timing.exhaust.close; // wraps past 720
  const ivo = isTwo ? 120 : timing.intake.open + 720;
  const ivc = ivcAngle;

  // closed-cycle integration from IVC to EVO, in an "unwrapped" angle frame
  // two-stroke: compression from port closing (255°) through TDC (360°) to exhaust port opening (465°)
  const startA = ivc;
  const endA = isTwo ? 360 + evo : evo;
  const steps = Math.round((endA - startA) * res);
  const pc = new Float32Array(steps + 1);
  const xc = new Float32Array(steps + 1);
  const vOf = (a: number) => cylinderVolumeCc(g, wrap360(a)) / 1e6; // m³ (same for 360-periodic geometry)
  let pp = (isTwo ? pInt * 1.05 : pInt * 1.02) * 1e5; // Pa
  let prevX = 0;
  for (let k = 0; k <= steps; k++) {
    const a = startA + k / res;
    const x = heatFraction(a);
    const vol = vOf(a);
    if (k > 0) {
      const vPrev = vOf(a - 1 / res);
      const dV = vol - vPrev;
      const dQ = qTotal * (x - prevX);
      const vm = 0.5 * (vol + vPrev);
      pp += ((GAMMA - 1) / vm) * dQ - (N_POLY * pp * dV) / vm;
    }
    prevX = x;
    pc[k] = pp / 1e5;
    xc[k] = x;
  }
  const pEvo = pc[steps];

  let peakPressure = 0;
  let peakAngle = 0;
  const rGas = 287;
  for (let i = 0; i < n; i++) {
    const a = i / res;
    let pressure: number;
    let burned = 0;
    // closed portion?
    let ka: number;
    if (isTwo) ka = a >= ivc ? a - startA : a + 360 - startA;
    else ka = a >= ivc && a <= evo ? a - startA : -1;
    if (ka >= 0 && ka <= steps / res + 1e-6) {
      const k = Math.min(steps, Math.round(ka * res));
      pressure = pc[k];
      burned = xc[k];
    } else {
      // gas exchange
      if (!isTwo) {
        if (a > evo) {
          // blowdown + exhaust stroke
          const d = a - evo;
          const vol = v[i];
          const vEvo = cylinderVolumeCc(g, evo);
          const expansion = Math.pow(vEvo / vol, N_POLY);
          const relax = Math.exp(-d / 22);
          pressure = pExh + (pEvo * Math.min(1, expansion) - pExh) * relax;
          burned = 1;
        } else {
          // intake stroke (0..IVC): from exhaust back-pressure toward manifold pressure
          const evcW = evc - 720;
          const blend = Math.min(1, Math.max(0, (a - 0) / Math.max(1, evcW + 25)));
          const dip = -0.05 * Math.sin((Math.min(a, 180) / 180) * Math.PI) * (0.3 + rpmN);
          pressure = pExh * (1 - blend) + (pInt + dip) * blend;
          burned = Math.max(0, 1 - a / 30) * 0.1;
        }
      } else {
        // two-stroke: ports open from 105 to 255
        const d = a - evo;
        const vEvo = cylinderVolumeCc(g, evo);
        const expansion = Math.pow(vEvo / v[i], N_POLY);
        const relax = Math.exp(-Math.max(0, d) / 12);
        const scav = pInt * 1.05;
        pressure = scav + (pEvo * Math.min(1, expansion) - scav) * relax;
        burned = a < ivo ? 1 : Math.max(0, 1 - (a - ivo) / 60);
      }
    }
    p[i] = pressure;
    xb[i] = burned;
    // ideal-gas temperature from p·V while the charge is trapped
    t[i] = (pressure * 1e5 * (v[i] / 1e6)) / (mGas * rGas);
    if (pressure > peakPressure) {
      peakPressure = pressure;
      peakAngle = a;
    }
  }

  // gas-exchange temperatures: isentropic blowdown after exhaust opening, then fresh-charge mixing
  {
    const iEvo = Math.round((isTwo ? evo : evo) * res) % n;
    const tEvo = t[iEvo];
    const pE = p[iEvo];
    const iIvc = Math.round(ivc * res) % n;
    for (let i = 0; i < n; i++) {
      const a = i / res;
      const inExhaust = isTwo ? a > evo && a < ivc : a > evo;
      const inIntake = isTwo ? false : a < ivc;
      if (inExhaust) t[i] = tEvo * Math.pow(Math.max(0.05, p[i] / pE), (N_POLY - 1) / N_POLY);
      if (inIntake) {
        const tExEnd = tEvo * Math.pow(Math.max(0.05, p[n - 1] / pE), (N_POLY - 1) / N_POLY);
        const k = Math.min(1, a / 120);
        t[i] = tExEnd * (1 - k) + T_INTAKE * k;
      }
      if (isTwo && a >= ivo && a < ivc) {
        const k = Math.min(1, (a - ivo) / 80);
        t[i] = t[i] * (1 - k) + T_INTAKE * 1.1 * k;
      }
    }
    void iIvc;
  }

  // indicated work = ∮ p dV
  let work = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    work += 0.5 * (p[i] + p[j]) * 1e5 * ((v[j] - v[i]) / 1e6);
  }

  return {
    params,
    res,
    span,
    p,
    v,
    t,
    xb,
    ignition: isTwo ? wrap360(ignition) : ignition,
    burnStart: isTwo ? wrap360(burnStart) : burnStart,
    burnDuration,
    peakPressure,
    peakAngle,
    work,
  };
}

function sampleArr(arr: Float32Array, table: CycleTable, theta: number): number {
  const a = table.span === 720 ? wrap720(theta) : wrap360(theta);
  const f = a * table.res;
  const i0 = Math.floor(f) % arr.length;
  const i1 = (i0 + 1) % arr.length;
  const w = f - Math.floor(f);
  return arr[i0] * (1 - w) + arr[i1] * w;
}

export const pressureAt = (tb: CycleTable, theta: number) => sampleArr(tb.p, tb, theta);
export const volumeAt = (tb: CycleTable, theta: number) => sampleArr(tb.v, tb, theta);
export const temperatureAt = (tb: CycleTable, theta: number) => sampleArr(tb.t, tb, theta);
export const burnedAt = (tb: CycleTable, theta: number) => sampleArr(tb.xb, tb, theta);

/** Indicated mean effective pressure, bar */
export function imep(tb: CycleTable): number {
  const vd = (tb.params.geom.bore ** 2 * Math.PI) / 4 * tb.params.geom.stroke / 1e9; // m³
  return tb.work / vd / 1e5;
}

/* ---------- Ideal air-standard efficiencies ---------- */

/** Otto: η = 1 − 1/r^(γ−1) */
export function ottoEfficiency(r: number, gamma = 1.4): number {
  return 1 - 1 / Math.pow(r, gamma - 1);
}

/** Diesel: η = 1 − (1/r^(γ−1))·[(ρ^γ − 1)/(γ(ρ − 1))] */
export function dieselEfficiency(r: number, cutoff: number, gamma = 1.4): number {
  if (Math.abs(cutoff - 1) < 1e-9) return ottoEfficiency(r, gamma);
  return 1 - (1 / Math.pow(r, gamma - 1)) * ((Math.pow(cutoff, gamma) - 1) / (gamma * (cutoff - 1)));
}

/**
 * Ideal Atkinson cycle (compression ratio rc, expansion ratio re > rc), heat added at constant volume.
 * Computed numerically from state points.
 */
export function atkinsonEfficiency(rc: number, re: number, heatPerMass = 1800e3, gamma = 1.4): number {
  const cv = 718;
  const T1 = 300;
  // state 1 at V1 = re (normalised Vc = 1), but compression starts at Vc·rc after expansion stroke
  const T2 = T1 * Math.pow(rc, gamma - 1);
  const T3 = T2 + heatPerMass / cv;
  const T4 = T3 * Math.pow(1 / re, gamma - 1);
  // heat rejection: constant volume 4→4' then constant pressure to state 1
  const p1 = 1;
  const p3 = (T3 / T2) * p1 * Math.pow(rc, gamma);
  const p4 = p3 * Math.pow(1 / re, gamma);
  const T4p = T4 * (p1 / p4); // constant-volume cooling to p1
  const cp = cv * gamma;
  const qOut = cv * (T4 - T4p) + cp * (T4p - T1);
  const qIn = heatPerMass;
  return 1 - qOut / qIn;
}

/** Ideal cycle outlines in (V, p) for the P–V overlays. Volumes normalised to swept volume units. */
export function idealOttoLoop(r: number, p1 = 1, pressureRatio = 3.2, gamma = 1.4, steps = 48) {
  const pts: Array<[number, number]> = [];
  const v1 = r;
  const v2 = 1;
  for (let i = 0; i <= steps; i++) {
    const vv = v1 + (v2 - v1) * (i / steps);
    pts.push([vv, p1 * Math.pow(v1 / vv, gamma)]);
  }
  const p2 = p1 * Math.pow(r, gamma);
  const p3 = p2 * pressureRatio;
  for (let i = 0; i <= steps; i++) {
    const vv = v2 + (v1 - v2) * (i / steps);
    pts.push([vv, p3 * Math.pow(v2 / vv, gamma)]);
  }
  pts.push([v1, p1]);
  return pts;
}

export function idealDieselLoop(r: number, cutoff = 2, p1 = 1, gamma = 1.4, steps = 48) {
  const pts: Array<[number, number]> = [];
  const v1 = r;
  const v2 = 1;
  for (let i = 0; i <= steps; i++) {
    const vv = v1 + (v2 - v1) * (i / steps);
    pts.push([vv, p1 * Math.pow(v1 / vv, gamma)]);
  }
  const p2 = p1 * Math.pow(r, gamma);
  const v3 = cutoff;
  pts.push([v3, p2]);
  for (let i = 0; i <= steps; i++) {
    const vv = v3 + (v1 - v3) * (i / steps);
    pts.push([vv, p2 * Math.pow(v3 / vv, gamma)]);
  }
  pts.push([v1, p1]);
  return pts;
}

export function idealAtkinsonLoop(rc: number, re: number, p1 = 1, pressureRatio = 3.2, gamma = 1.4, steps = 48) {
  const pts: Array<[number, number]> = [];
  const v2 = 1;
  const vStart = rc;
  const vEnd = re;
  // constant-pressure line from re back to rc at p1 (late intake valve closing pushes charge back)
  pts.push([vEnd, p1]);
  for (let i = 0; i <= steps; i++) {
    const vv = vStart + (v2 - vStart) * (i / steps);
    pts.push([vv, p1 * Math.pow(vStart / vv, gamma)]);
  }
  const p2 = p1 * Math.pow(rc, gamma);
  const p3 = p2 * pressureRatio;
  for (let i = 0; i <= steps; i++) {
    const vv = v2 + (vEnd - v2) * (i / steps);
    pts.push([vv, p3 * Math.pow(v2 / vv, gamma)]);
  }
  pts.push([vEnd, p1]);
  return pts;
}
