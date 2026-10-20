/**
 * Slider-crank kinematics. All lengths in millimetres, angles in degrees unless noted.
 * Crank angle θ = 0 means the crankpin points straight at the cylinder (top dead centre).
 */
export interface CrankGeometry {
  /** Cylinder bore, mm */
  bore: number;
  /** Piston stroke, mm (crank throw r = stroke / 2) */
  stroke: number;
  /** Connecting-rod centre-to-centre length, mm */
  rod: number;
  /** Geometric compression ratio */
  compressionRatio: number;
}

export const DEG = Math.PI / 180;

export const wrap360 = (a: number): number => ((a % 360) + 360) % 360;
export const wrap720 = (a: number): number => ((a % 720) + 720) % 720;

/** Distance from crank axis to piston pin: x(θ) = r·cos θ + sqrt(l² − r²·sin² θ) */
export function pistonPinHeight(g: CrankGeometry, thetaDeg: number): number {
  const r = g.stroke / 2;
  const l = g.rod;
  const t = thetaDeg * DEG;
  const s = Math.sin(t);
  return r * Math.cos(t) + Math.sqrt(l * l - r * r * s * s);
}

/** Piston travel below top dead centre, mm (0 at TDC, stroke at BDC). */
export function pistonDrop(g: CrankGeometry, thetaDeg: number): number {
  return g.stroke / 2 + g.rod - pistonPinHeight(g, thetaDeg);
}

/** Connecting-rod angle from the cylinder axis, radians. */
export function rodAngle(g: CrankGeometry, thetaDeg: number): number {
  const r = g.stroke / 2;
  return Math.asin((r * Math.sin(thetaDeg * DEG)) / g.rod);
}

/** Crankpin centre relative to crank axis (x sideways, y along cylinder), mm. */
export function crankpin(g: CrankGeometry, thetaDeg: number): { x: number; y: number } {
  const r = g.stroke / 2;
  const t = thetaDeg * DEG;
  return { x: r * Math.sin(t), y: r * Math.cos(t) };
}

/** Swept volume of one cylinder, cm³ */
export function sweptVolumeCc(g: CrankGeometry): number {
  return (Math.PI / 4) * g.bore * g.bore * g.stroke / 1000;
}

/** Clearance (combustion chamber) volume, cm³ */
export function clearanceVolumeCc(g: CrankGeometry): number {
  return sweptVolumeCc(g) / (g.compressionRatio - 1);
}

/** Instantaneous gas volume above the piston, cm³ */
export function cylinderVolumeCc(g: CrankGeometry, thetaDeg: number): number {
  const area = (Math.PI / 4) * g.bore * g.bore; // mm²
  return clearanceVolumeCc(g) + (area * pistonDrop(g, thetaDeg)) / 1000;
}

/** Height of the clearance volume if modelled as a flat disc, mm */
export function clearanceHeight(g: CrankGeometry): number {
  const area = (Math.PI / 4) * g.bore * g.bore;
  return (clearanceVolumeCc(g) * 1000) / area;
}

/** Mean piston speed, m/s */
export function meanPistonSpeed(g: CrankGeometry, rpm: number): number {
  return (2 * g.stroke * rpm) / 60 / 1000;
}

/** Displacement V = π/4·bore²·stroke·cylinders, returned in cm³ */
export function displacementCc(boreMm: number, strokeMm: number, cylinders: number): number {
  return (Math.PI / 4) * boreMm * boreMm * strokeMm * cylinders / 1000;
}

/** Reference single-cylinder geometries used by the 3D models. */
export const PETROL: CrankGeometry = { bore: 86, stroke: 86, rod: 145, compressionRatio: 10.5 };
export const DIESEL: CrankGeometry = { bore: 84, stroke: 90, rod: 150, compressionRatio: 17 };
export const TWO_STROKE: CrankGeometry = { bore: 54, stroke: 54.5, rod: 97, compressionRatio: 9 };
