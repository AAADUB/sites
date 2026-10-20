/**
 * Generic full-load torque curves (illustrative, typical shapes — not a specific engine).
 * Torque scales with displacement; power is always derived from torque: P = T·rpm/9549.
 */
export type FuelType = 'petrol' | 'diesel';
export type Aspiration = 'na' | 'turbo';

export interface CurveSpec {
  fuel: FuelType;
  asp: Aspiration;
  litres: number;
}

export const RPM_RANGE: Record<FuelType, [number, number]> = { petrol: [1000, 7000], diesel: [1000, 4500] };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Specific torque, N·m per litre {typical}: NA petrol ~100, turbo petrol ~170, NA diesel ~95, turbo diesel ~190 */
const SPECIFIC: Record<string, number> = { 'petrol-na': 100, 'petrol-turbo': 170, 'diesel-na': 95, 'diesel-turbo': 190 };

export function torqueAt(c: CurveSpec, rpm: number): number {
  const peak = SPECIFIC[`${c.fuel}-${c.asp}`] * c.litres;
  let shape: number;
  if (c.fuel === 'petrol' && c.asp === 'na') {
    // broad hump peaking around 4,500 rpm, falling toward redline
    const x = (rpm - 4500) / 3200;
    shape = 1 - 0.55 * x * x;
    shape *= 0.62 + 0.38 * smoothstep(800, 2600, rpm);
  } else if (c.fuel === 'petrol') {
    // turbo: builds up to a plateau from ~1,800 to ~4,800 rpm, then tapers
    shape = 0.55 + 0.45 * smoothstep(1000, 1900, rpm);
    shape *= 1 - 0.38 * smoothstep(4800, 7000, rpm);
  } else if (c.asp === 'na') {
    const x = (rpm - 2400) / 2400;
    shape = 1 - 0.4 * x * x;
  } else {
    shape = 0.5 + 0.5 * smoothstep(1000, 1600, rpm);
    shape *= 1 - 0.32 * smoothstep(2900, 4500, rpm);
  }
  return Math.max(0, peak * shape);
}

/**
 * Torque with a given boost (bar above atmosphere) on a 2.0 L petrol base engine, for the boost section.
 * Torque follows the trapped air mass: density ratio after intercooling ≈ (1 + boost)·(T_amb/T_charge).
 */
export function boostedTorque(rpm: number, boost: number, kind: 'turbo' | 'super', litres = 2): number {
  const base = torqueAt({ fuel: 'petrol', asp: 'na', litres }, rpm);
  let b: number;
  if (kind === 'turbo') b = boost * smoothstep(1300, 3000, rpm); // turbine needs exhaust flow first
  else b = boost * (0.55 + 0.45 * smoothstep(800, 5000, rpm)); // belt-driven: boost rises with engine speed
  const pr = 1 + b;
  const chargeTemp = 1 + 0.08 * b; // intercooled charge is a little warmer than ambient
  const knockLimit = 1 - 0.06 * b; // later spark to avoid knock
  return base * (pr / chargeTemp) * knockLimit;
}
