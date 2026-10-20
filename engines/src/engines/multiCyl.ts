import * as THREE from 'three';
import gsap from 'gsap';
import { LAYOUTS, cylinderPhase, type LayoutId, type Layout } from '../physics/firing';
import { DEG } from '../physics/kinematics';
import { makeMaterial, type PartMaterial } from './materials';
import { cyl, cylZ, lathe, box } from './geo';
import { reducedMotion } from '../core/settings';

const R_CRANK = 0.3;
const ROD = 1.0;
const SPACING = 0.82;
const MAX = 8;

interface Unit {
  g: THREE.Group; // rotated by bank around the crank axis
  piston: THREE.Group;
  rod: THREE.Mesh;
  throwG: THREE.Group;
  glowMat: THREE.MeshBasicMaterial;
  tube: PartMaterial;
  label: THREE.Sprite;
  // animated params
  bank: number;
  z: number;
  scale: number;
  fire: number;
  num: number;
  active: boolean;
}

function numberSprite(n: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,9,11,0.75)';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,179,71,0.8)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#e8eaed';
  g.font = '600 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.setScalar(0.26);
  s.renderOrder = 10;
  return s;
}

/** A morphing multi-cylinder rig: inline-4, inline-6, cross-/flat-plane V8, boxer-4. */
export class MultiCylinderRig {
  readonly group = new THREE.Group();
  private units: Unit[] = [];
  private shaft: THREE.Mesh;
  layout: Layout = LAYOUTS.i4;
  private tl: gsap.core.Timeline | null = null;
  private numbers: THREE.Sprite[] = [];

  constructor() {
    const glass = () => {
      const m = makeMaterial('glass');
      m.mat.color.set('#9fb6c8');
      m.mat.opacity = 0.16;
      m.mat.roughness = 0.08;
      m.mat.metalness = 0;
      m.mat.depthWrite = false;
      m.mat.side = THREE.DoubleSide;
      return m;
    };
    const pistonMat = makeMaterial('aluminium', { color: '#c9ccd0' });
    const rodMat = makeMaterial('steel');
    const crankMat = makeMaterial('polished');
    const headMat = makeMaterial('aluminium', { color: '#7d848d' });
    const pistonGeo = lathe([[0, 0.16], [0.24, 0.16], [0.25, 0.14], [0.25, -0.12], [0.22, -0.12], [0.22, 0.12], [0, 0.13]], 40);
    const tubeGeo = new THREE.CylinderGeometry(0.27, 0.27, 1.3, 40, 1, true);
    const capGeo = cyl(0.32, 0.12, 40);
    const rodGeo = box(0.08, ROD, 0.06, 0.02);
    rodGeo.translate(0, ROD / 2, 0);
    const pinGeo = cylZ(0.07, 0.16, 24);
    const webGeo = box(0.42, 0.62, 0.05, 0.03);
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.Group();
      const tube = glass();
      const tubeMesh = new THREE.Mesh(tubeGeo, tube.mat);
      tubeMesh.position.y = R_CRANK + ROD + 0.25;
      tubeMesh.renderOrder = 5;
      const cap = new THREE.Mesh(capGeo, headMat.mat);
      cap.position.y = R_CRANK + ROD + 0.95;
      cap.castShadow = true;
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a1f'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 32), glowMat);
      glow.position.y = R_CRANK + ROD + 0.78;
      glow.renderOrder = 6;
      const piston = new THREE.Group();
      const pm = new THREE.Mesh(pistonGeo, pistonMat.mat);
      pm.castShadow = true;
      piston.add(pm);
      const rod = new THREE.Mesh(rodGeo, rodMat.mat);
      rod.castShadow = true;
      const throwG = new THREE.Group();
      const pin = new THREE.Mesh(pinGeo, crankMat.mat);
      pin.position.y = R_CRANK;
      const w1 = new THREE.Mesh(webGeo, crankMat.mat);
      w1.position.set(0, R_CRANK * 0.45, 0.1);
      const w2 = w1.clone();
      w2.position.z = -0.1;
      throwG.add(pin, w1, w2);
      throwG.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      const label = numberSprite(i + 1);
      label.position.y = R_CRANK + ROD + 1.22;
      g.add(tubeMesh, cap, glow, piston, rod, throwG, label);
      this.group.add(g);
      this.numbers.push(label);
      this.units.push({ g, piston, rod, throwG, glowMat, tube, label, bank: 0, z: 0, scale: 0, fire: 0, num: i + 1, active: false });
    }
    this.shaft = new THREE.Mesh(cylZ(0.09, 1, 24), crankMat.mat);
    this.shaft.castShadow = true;
    this.group.add(this.shaft);
    this.apply(LAYOUTS.i4, false);
  }

  private targets(l: Layout) {
    const cyls = [...l.cylinders].sort((a, b) => a.num - b.num);
    const out = cyls.map((c) => {
      let z: number;
      if (l.id === 'boxer4') z = (c.row * 2 + (c.bank < 0 ? 1 : 0)) * SPACING * 0.5;
      else if (l.id.startsWith('v8')) z = c.row * SPACING + (c.bank < 0 ? 0.17 : 0);
      else z = c.row * SPACING;
      return { num: c.num, bank: c.bank, z, fire: c.fireAngle };
    });
    const zs = out.map((o) => o.z);
    const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
    out.forEach((o) => (o.z -= mid));
    return out;
  }

  apply(l: Layout, animate = true) {
    this.layout = l;
    const tg = this.targets(l);
    this.tl?.kill();
    const d = animate && !reducedMotion() ? 1.2 : 0;
    const tl = gsap.timeline();
    this.tl = tl;
    this.units.forEach((u, i) => {
      const t = tg[i];
      if (t) {
        u.active = true;
        u.num = t.num;
        u.fire = t.fire;
        tl.to(u, { bank: t.bank, z: t.z, scale: 1, duration: d, ease: 'expo.inOut' }, i * 0.03 * (d ? 1 : 0));
        const mat = u.label.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.map = numberSprite(t.num).material.map;
        mat.needsUpdate = true;
      } else {
        u.active = false;
        tl.to(u, { scale: 0, duration: d * 0.6, ease: 'expo.in' }, 0);
      }
    });
    if (d === 0) tl.progress(1);
    const zs = tg.map((t) => t.z);
    const len = Math.max(...zs) - Math.min(...zs) + 0.8;
    this.shaft.scale.z = len;
  }

  setLayout(id: LayoutId) {
    this.apply(LAYOUTS[id]);
  }

  showNumbers(on: boolean) {
    this.numbers.forEach((n) => (n.visible = on));
  }

  update(theta: number) {
    for (const u of this.units) {
      u.g.visible = u.scale > 0.01;
      if (!u.g.visible) continue;
      u.g.scale.setScalar(u.scale);
      u.g.position.z = u.z;
      u.g.rotation.z = -u.bank * DEG;
      // relative crank angle φ = θ − fire (TDC when φ ≡ 0)
      const phi = (theta - u.fire) * DEG;
      const sx = R_CRANK * Math.sin(-phi);
      const sy = R_CRANK * Math.cos(phi);
      const py = sy + Math.sqrt(ROD * ROD - sx * sx);
      u.piston.position.y = py;
      u.rod.position.set(sx, sy, 0);
      u.rod.rotation.z = Math.asin(-sx / ROD) * -1;
      u.throwG.rotation.z = phi;
      // firing flash: bright right after firing TDC, fading over the power stroke
      const ph = cylinderPhase({ num: u.num, bank: u.bank, row: 0, fireAngle: u.fire }, theta);
      const flash = ph < 140 ? Math.exp(-ph / 35) : 0;
      u.glowMat.opacity = flash * 0.9;
      u.glowMat.color.setRGB(1, 0.55 + 0.4 * flash, 0.2 + 0.6 * flash).multiplyScalar(1 + 2.5 * flash);
      u.tube.mat.emissive.set('#ff8a1f');
      u.tube.mat.emissiveIntensity = flash * 0.6;
      u.glowMat.visible = u.active;
    }
  }

  dispose() {
    this.tl?.kill();
  }
}
