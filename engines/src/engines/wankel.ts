import * as THREE from 'three';
import { RX, housingPoint, rotorProfile, housingParam, polyArea, type WankelGeom } from '../physics/wankel';
import { makeMaterial, type PartMaterial, mulberry32 } from './materials';
import { extrude, cylZ, box, lathe, sprocketShape } from './geo';
import { STROKE_COLORS } from '../core/tokens';
import { manager } from '../core/renderer';

export type WKey = 'rotor' | 'housing' | 'eshaft' | 'sparkPlug' | 'inPort' | 'exPort';
export type Phase = 'intake' | 'compression' | 'power' | 'exhaust';

interface WPart {
  key: WKey;
  obj: THREE.Object3D;
  mats: PartMaterial[];
  anchor: THREE.Vector3;
  pick: THREE.Mesh[];
}

const SEG = 48; // samples along each chamber

/**
 * Wankel rotary: epitrochoid housing, rotor = inner envelope, eccentric shaft at 3:1,
 * three chambers drawn as live colour-coded volumes between rotor flank and housing.
 */
export class WankelEngine {
  readonly group = new THREE.Group();
  readonly inner = new THREE.Group(); // rotated so the major axis is vertical
  parts = new Map<WKey, WPart>();
  readonly g: WankelGeom = RX;
  readonly S = 0.012;
  private prof: Float64Array;
  private rotor = new THREE.Group();
  private shaft = new THREE.Group();
  private chambers: Array<{ mesh: THREE.Mesh; geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial; pts: THREE.Points; area: number; phase: Phase }> = [];
  private sparkLights: THREE.PointLight[] = [];
  private fireLight = new THREE.PointLight('#ffb05a', 0, 3, 2);
  private seeds: Float32Array[] = [];
  phases: Phase[] = ['intake', 'compression', 'power'];

  constructor(particles: number) {
    this.prof = rotorProfile(this.g, 720, 0.6);
    this.group.add(this.inner);
    this.inner.rotation.z = Math.PI / 2;
    this.build(particles);
  }

  private hp(alpha: number): [number, number] {
    const [x, y] = housingPoint(this.g, alpha);
    return [x * this.S, y * this.S];
  }

  private add(key: WKey, obj: THREE.Object3D, mats: PartMaterial[], anchor: [number, number, number]) {
    const pick: THREE.Mesh[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.userData.part = key;
        m.castShadow = true;
        m.receiveShadow = true;
        pick.push(m);
      }
    });
    this.parts.set(key, { key, obj, mats, anchor: new THREE.Vector3(...anchor), pick });
  }

  private build(particles: number) {
    const S = this.S;
    const N = 360;
    // housing ring: outer offset curve minus the epitrochoid bore
    const outer = new THREE.Shape();
    const innerPath = new THREE.Path();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, y] = this.hp(a);
      // outward normal via finite difference
      const [x2, y2] = this.hp(a + 1e-3);
      const tx = x2 - x;
      const ty = y2 - y;
      const tl = Math.hypot(tx, ty);
      const nx = ty / tl;
      const ny = -tx / tl;
      const off = 0.22;
      if (i === 0) outer.moveTo(x + nx * off, y + ny * off);
      else outer.lineTo(x + nx * off, y + ny * off);
      if (i === 0) innerPath.moveTo(x, y);
      else innerPath.lineTo(x, y);
    }
    outer.holes.push(innerPath);
    const hm = makeMaterial('aluminium', { color: '#8c939c' });
    const housing = new THREE.Group();
    const ring = new THREE.Mesh(extrude(outer, 0.5, 0.02, 2), hm.mat);
    housing.add(ring);
    // back side plate
    const plateShape = new THREE.Shape();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, y] = this.hp(a);
      const r = Math.hypot(x, y) + 0.22;
      const ang = Math.atan2(y, x);
      if (i === 0) plateShape.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else plateShape.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    const pm = makeMaterial('iron', { color: '#2d3136' });
    const plate = new THREE.Mesh(extrude(plateShape, 0.08, 0.01, 2), pm.mat);
    plate.position.z = -0.29;
    housing.add(plate);
    // stationary gear on the side plate
    const gearM = makeMaterial('darksteel');
    const fixedGear = new THREE.Mesh(extrude(sprocketShape(0.48, 24, 0.035, 0.2), 0.08, 0.004, 2), gearM.mat);
    fixedGear.position.z = -0.21;
    housing.add(fixedGear);
    this.inner.add(housing);
    this.add('housing', housing, [hm, pm, gearM], [1.6, 0.3, 0.3]);

    // rotor (inner envelope) with internal gear and apex seals
    const rs = new THREE.Shape();
    const P = this.prof;
    for (let b = 0; b <= P.length; b++) {
      const k = b % P.length;
      const psi = (k / P.length) * Math.PI * 2;
      const x = Math.cos(psi) * P[k] * S;
      const y = Math.sin(psi) * P[k] * S;
      if (b === 0) rs.moveTo(x, y);
      else rs.lineTo(x, y);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.72, 0, Math.PI * 2, true);
    rs.holes.push(hole);
    const rm = makeMaterial('steel', { color: '#aeb3ba' });
    const rotorMesh = new THREE.Mesh(extrude(rs, 0.42, 0.012, 2), rm.mat);
    this.rotor.add(rotorMesh);
    const ringGear = new THREE.Mesh(extrude(sprocketShape(0.74, 36, 0.035, 0.6), 0.1, 0.004, 2), gearM.mat);
    ringGear.position.z = -0.15;
    this.rotor.add(ringGear);
    const sealM = makeMaterial('darksteel', { color: '#3a3d42' });
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3;
      const seal = new THREE.Mesh(box(0.05, 0.03, 0.44), sealM.mat);
      seal.position.set(Math.cos(a) * (this.g.R * S - 0.02), Math.sin(a) * (this.g.R * S - 0.02), 0);
      seal.rotation.z = a;
      this.rotor.add(seal);
    }
    this.inner.add(this.rotor);
    this.add('rotor', this.rotor, [rm, sealM], [0.2, 1.0, 0.4]);

    // eccentric shaft
    const sm = makeMaterial('polished');
    const shaft = new THREE.Mesh(cylZ(0.18, 1.6, 48), sm.mat);
    const lobe = new THREE.Mesh(cylZ(0.62, 0.36, 64), sm.mat);
    lobe.position.x = this.g.e * S;
    this.shaft.add(shaft, lobe);
    const pulley = new THREE.Mesh(lathe([[0, -0.06], [0.34, -0.06], [0.34, 0.06], [0, 0.06]], 64), makeMaterial('darksteel').mat);
    pulley.rotation.x = Math.PI / 2;
    pulley.position.z = 0.75;
    this.shaft.add(pulley);
    this.inner.add(this.shaft);
    this.add('eshaft', this.shaft, [sm], [0.3, -0.4, 0.8]);

    // two spark plugs on the right waist (local −y), ports on the left waist (local +y)
    const cer = makeMaterial('ceramic');
    const met = makeMaterial('steel', { color: '#b8b2a6' });
    const plugs = new THREE.Group();
    const waist = (this.g.R - this.g.e) * S;
    for (const dx of [-0.32, 0.18]) {
      const p = new THREE.Group();
      p.add(new THREE.Mesh(lathe([[0, 0], [0.05, 0], [0.05, 0.22], [0.07, 0.23], [0.07, 0.3], [0, 0.3]], 24), met.mat));
      p.add(new THREE.Mesh(lathe([[0, 0.28], [0.045, 0.3], [0.045, 0.52], [0, 0.55]], 24), cer.mat));
      p.position.set(dx, -waist - 0.02, 0);
      p.rotation.z = Math.PI;
      plugs.add(p);
      const L = new THREE.PointLight('#bfe4ff', 0, 1.2, 2);
      L.position.set(dx, -waist + 0.05, 0.1);
      this.inner.add(L);
      this.sparkLights.push(L);
    }
    this.inner.add(plugs);
    this.add('sparkPlug', plugs, [cer, met], [1.0, -0.2, 0.2]);
    const portM = makeMaterial('aluminium', { color: '#7d848d' });
    const mkPort = (dx: number, key: WKey, anchor: [number, number, number]) => {
      const gport = new THREE.Group();
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(dx, waist + 0.1, 0), new THREE.Vector3(dx * 1.3, waist + 0.5, 0), new THREE.Vector3(dx * 2.2, waist + 0.85, 0)]), 32, 0.12, 20, false),
        portM.mat,
      );
      gport.add(tube);
      this.inner.add(gport);
      this.add(key, gport, [portM], anchor);
    };
    mkPort(0.28, 'inPort', [-1.9, -0.75, 0.2]);
    mkPort(-0.28, 'exPort', [-1.9, 0.75, 0.2]);

    // chambers
    const rnd = mulberry32(17);
    const per = Math.max(60, Math.round(particles / 6));
    for (let k = 0; k < 3; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < SEG; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: '#3fd0ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = 0.215;
      mesh.renderOrder = 3;
      this.inner.add(mesh);
      const seeds = new Float32Array(per * 2);
      for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
      this.seeds.push(seeds);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(per * 3), 3));
      const pmat = new THREE.PointsMaterial({ color: '#3fd0ff', size: 0.045, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const pts = new THREE.Points(pg, pmat);
      pts.position.z = 0.226;
      pts.frustumCulled = false;
      pts.renderOrder = 4;
      this.inner.add(pts);
      this.chambers.push({ mesh, geo, mat, pts, area: 0, phase: 'intake' });
    }
    this.fireLight.position.set(0, 0, 0.6);
    this.group.add(this.fireLight);
  }

  /** Rotor flank radius (scene units) for rotor-frame angle psi. */
  private flank(psi: number) {
    const P = this.prof;
    let a = psi % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    const f = (a / (Math.PI * 2)) * P.length;
    const i0 = Math.floor(f) % P.length;
    const i1 = (i0 + 1) % P.length;
    const w = f - Math.floor(f);
    return (P[i0] * (1 - w) + P[i1] * w) * this.S;
  }

  /** shaftDeg: eccentric shaft angle in degrees; rotor turns at one third of it. */
  update(shaftDeg: number, dt: number, visibleGas = 1) {
    const beta = (shaftDeg * Math.PI) / 180;
    const phi = beta / 3;
    const S = this.S;
    const cx = this.g.e * S * Math.cos(beta);
    const cy = this.g.e * S * Math.sin(beta);
    this.rotor.position.set(cx, cy, 0);
    this.rotor.rotation.z = phi;
    this.shaft.rotation.z = beta;
    const third = (2 * Math.PI) / 3;
    let fire = 0;
    const rot = this.inner.rotation.z;
    for (let k = 0; k < 3; k++) {
      const ch = this.chambers[k];
      const a0 = phi + k * third; // apex k (rotor frame angle + rotation)
      const a1 = a0 + third;
      // apex positions in housing frame
      const p0x = cx + this.g.R * S * Math.cos(a0);
      const p0y = cy + this.g.R * S * Math.sin(a0);
      const p1x = cx + this.g.R * S * Math.cos(a1);
      const p1y = cy + this.g.R * S * Math.sin(a1);
      let h0 = housingParam(this.g, p0x / S, p0y / S);
      let h1 = housingParam(this.g, p1x / S, p1y / S);
      if (h1 < h0) h1 += Math.PI * 2;
      if (h1 - h0 > Math.PI * 1.5) h0 += Math.PI * 2;
      const pos = ch.geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const poly: Array<[number, number]> = [];
      const flankPts: Array<[number, number]> = [];
      const housePts: Array<[number, number]> = [];
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const [hx, hy] = this.hp(h0 + (h1 - h0) * u);
        const psi = k * third + third * u; // rotor-frame angle along this flank
        const fr = this.flank(psi) + 0.004;
        const fx = cx + fr * Math.cos(psi + phi);
        const fy = cy + fr * Math.sin(psi + phi);
        arr.set([hx, hy, 0, fx, fy, 0], i * 6);
        housePts.push([hx, hy]);
        flankPts.push([fx, fy]);
      }
      pos.needsUpdate = true;
      ch.geo.computeBoundingSphere();
      for (const p of housePts) poly.push(p);
      for (let i = flankPts.length - 1; i >= 0; i--) poly.push(flankPts[i]);
      const area = polyArea(poly);
      const dA = area - ch.area;
      ch.area = area;
      // centroid → world vertical position (inner group is rotated 90°)
      let mx = 0;
      let my = 0;
      for (const [x, y] of housePts) {
        mx += x;
        my += y;
      }
      mx /= housePts.length;
      my /= housePts.length;
      const wy = mx * Math.sin(rot) + my * Math.cos(rot);
      const wx = mx * Math.cos(rot) - my * Math.sin(rot);
      const top = wy > 0;
      let phase: Phase;
      if (Math.abs(dA) < 1e-7) phase = ch.phase;
      else if (!top) phase = dA > 0 ? 'intake' : 'compression';
      else phase = dA > 0 ? 'power' : 'exhaust';
      // near the right waist the compressed charge is lit
      if (phase === 'compression' && wx > 0.25 && Math.abs(wy) < 0.4) phase = 'compression';
      ch.phase = phase;
      this.phases[k] = phase;
      const col = new THREE.Color(STROKE_COLORS[phase]);
      const hot = phase === 'power' ? Math.max(0, 1 - Math.atan2(wy, wx) / (Math.PI / 2)) : 0;
      if (phase === 'power') {
        col.lerp(new THREE.Color('#fff3d6'), hot * 0.8);
        fire = Math.max(fire, hot);
      }
      ch.mat.color.copy(col).multiplyScalar(phase === 'power' ? 1 + hot * 2 : 1);
      ch.mat.opacity = visibleGas * (phase === 'power' ? 0.45 : 0.28);
      const pm = ch.pts.material as THREE.PointsMaterial;
      pm.color.copy(col).multiplyScalar(phase === 'power' ? 1.2 + hot * 2 : 1);
      pm.opacity = visibleGas * 0.9;
      pm.size = 0.045 * Math.max(0.8, Math.min(1.6, manager.dpr));
      // particles inside the crescent: lerp between housing and flank
      const seeds = this.seeds[k];
      const pp = ch.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const parr = pp.array as Float32Array;
      const n = parr.length / 3;
      for (let i = 0; i < n; i++) {
        const u = Math.min(SEG - 1e-3, seeds[i * 2] * SEG);
        const v = 0.12 + seeds[i * 2 + 1] * 0.76;
        const i0 = Math.floor(u);
        const w = u - i0;
        const hx = housePts[i0][0] * (1 - w) + housePts[i0 + 1][0] * w;
        const hy = housePts[i0][1] * (1 - w) + housePts[i0 + 1][1] * w;
        const fx = flankPts[i0][0] * (1 - w) + flankPts[i0 + 1][0] * w;
        const fy = flankPts[i0][1] * (1 - w) + flankPts[i0 + 1][1] * w;
        parr[i * 3] = hx + (fx - hx) * v;
        parr[i * 3 + 1] = hy + (fy - hy) * v;
        parr[i * 3 + 2] = 0;
      }
      pp.needsUpdate = true;
    }
    // sparks fire when a chamber passes the plugs at minimum volume
    const sparkOn = fire > 0.85 ? (fire - 0.85) / 0.15 : 0;
    for (const L of this.sparkLights) L.intensity = sparkOn * 5;
    this.fireLight.intensity = fire * 2.4 * visibleGas;
    void dt;
  }

  setHighlight(key: WKey | null, amount = 1) {
    for (const p of this.parts.values()) for (const m of p.mats) m.u.uHighlight.value = p.key === key ? amount : 0;
  }

  pickables() {
    const out: THREE.Mesh[] = [];
    for (const p of this.parts.values()) for (const m of p.pick) out.push(m);
    return out;
  }

  anchorOf(key: WKey, out = new THREE.Vector3()) {
    const p = this.parts.get(key);
    out.copy(p ? p.anchor : new THREE.Vector3());
    return this.group.localToWorld(out);
  }

  dispose() {
    for (const c of this.chambers) {
      c.geo.dispose();
      c.mat.dispose();
      c.pts.geometry.dispose();
      (c.pts.material as THREE.Material).dispose();
    }
  }
}
