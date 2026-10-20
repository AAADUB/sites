import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

/* ---------------- CSG helpers ---------------- */

let evaluator: Evaluator | null = null;
function ev() {
  if (!evaluator) {
    evaluator = new Evaluator();
    evaluator.attributes = ['position', 'uv', 'normal'];
    evaluator.useGroups = false;
  }
  return evaluator;
}

export function brush(g: THREE.BufferGeometry, pos?: [number, number, number], rot?: [number, number, number]): Brush {
  const geo = g.index ? g : g;
  const b = new Brush(geo);
  if (pos) b.position.set(...pos);
  if (rot) b.rotation.set(...rot);
  b.updateMatrixWorld(true);
  return b;
}

export const csg = {
  sub(a: Brush, ...bs: Brush[]): Brush {
    let r = a;
    for (const b of bs) r = ev().evaluate(r, b, SUBTRACTION);
    return r;
  },
  add(a: Brush, ...bs: Brush[]): Brush {
    let r = a;
    for (const b of bs) r = ev().evaluate(r, b, ADDITION);
    return r;
  },
  and(a: Brush, b: Brush): Brush {
    return ev().evaluate(a, b, INTERSECTION);
  },
};

/** Return a geometry in world space from a brush (bakes the transform). */
export function bake(b: Brush): THREE.BufferGeometry {
  b.updateMatrixWorld(true);
  const g = b.geometry.clone();
  g.applyMatrix4(b.matrixWorld);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Split a solid at the plane z = 0: back (z ≤ 0) and front (z ≥ 0) halves with closed cut faces. */
export function splitZ(b: Brush, size = 10): { back: THREE.BufferGeometry; front: THREE.BufferGeometry } {
  const backBox = brush(new THREE.BoxGeometry(size, size, size), [0, 0, -size / 2]);
  const frontBox = brush(new THREE.BoxGeometry(size, size, size), [0, 0, size / 2]);
  backBox.position.y = b.position.y;
  frontBox.position.y = b.position.y;
  backBox.updateMatrixWorld(true);
  frontBox.updateMatrixWorld(true);
  return { back: bake(csg.and(b, backBox)), front: bake(csg.and(b, frontBox)) };
}

/* ---------------- primitives ---------------- */

export const box = (w: number, h: number, d: number, r = 0, seg = 3) =>
  r > 0 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d);

/** Cylinder along Y */
export const cyl = (r: number, h: number, seg = 48, rTop?: number) => new THREE.CylinderGeometry(rTop ?? r, r, h, seg, 1, false);

/** Cylinder along Z */
export function cylZ(r: number, len: number, seg = 48): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Cylinder along X */
export function cylX(r: number, len: number, seg = 48): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateZ(Math.PI / 2);
  return g;
}

/**
 * Watertight tube with end caps along a curve (for CSG subtraction of ports).
 * radius(t) gives the radius along the curve.
 */
export function closedTube(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, tubular = 40, radial = 24): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radius(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * N.x + Math.sin(a) * B.x;
      const ny = Math.cos(a) * N.y + Math.sin(a) * B.y;
      const nz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      pos.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
      nor.push(nx, ny, nz);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  // caps (fan around a centre vertex)
  const addCap = (ring: number, t: number, flip: boolean) => {
    curve.getPointAt(t, p);
    const tan = curve.getTangentAt(t).multiplyScalar(flip ? 1 : -1);
    const centre = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    nor.push(tan.x, tan.y, tan.z);
    uv.push(t, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j;
      const b = ring * radial + ((j + 1) % radial);
      if (flip) idx.push(centre, a, b);
      else idx.push(centre, b, a);
    }
  };
  addCap(0, 0, false);
  addCap(tubular, 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Lathe from a list of [radius, y] points (closed profile goes around the axis). */
export function lathe(points: Array<[number, number]>, seg = 64): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    seg,
  );
  g.computeVertexNormals();
  return g;
}

/** Rounded corner helper for profile polylines: inserts arc samples at each corner. */
export function roundPoly(pts: Array<[number, number]>, radius: number, steps = 4): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    if (i === 0 || i === n - 1) {
      out.push(p1);
      continue;
    }
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const a: [number, number] = [p1[0] + (v1[0] / l1) * r, p1[1] + (v1[1] / l1) * r];
    const b: [number, number] = [p1[0] + (v2[0] / l2) * r, p1[1] + (v2[1] / l2) * r];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // quadratic Bezier through the corner
      const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0];
      const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1];
      out.push([x, y]);
    }
  }
  return out;
}

/** Convex hull (Andrew's monotone chain) */
export function hull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Toothed sprocket outline (in XY) for extrusion. */
export function sprocketShape(radius: number, teeth: number, toothDepth: number, bore = 0): THREE.Shape {
  const s = new THREE.Shape();
  const steps = teeth * 8;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = (i % 8) / 8;
    // trapezoid tooth: up for half of the pitch
    const prof = phase < 0.15 ? phase / 0.15 : phase < 0.5 ? 1 : phase < 0.65 ? 1 - (phase - 0.5) / 0.15 : 0;
    const r = radius - toothDepth + toothDepth * prof;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  if (bore > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, bore, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel = 0, curveSegments = 24): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 3 : 0,
    curveSegments,
  });
  // centre along z
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Helix wire (valve spring) along +Y from 0 to height. */
export function helix(radius: number, wire: number, height: number, turns: number): THREE.BufferGeometry {
  class H extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * turns * Math.PI * 2;
      return target.set(Math.cos(a) * radius, t * height, Math.sin(a) * radius);
    }
  }
  return new THREE.TubeGeometry(new H(), Math.round(turns * 24), wire, 8, false);
}

export { Brush };
