import * as THREE from 'three';
import gsap from 'gsap';
import { type CrankGeometry, DEG, pistonPinHeight, pistonDrop, rodAngle, wrap360 } from '../physics/kinematics';
import { type CycleTable, pressureAt, burnedAt, temperatureAt } from '../physics/cycle';
import { makeMaterial, setXray, type PartMaterial } from './materials';
import { box, brush, bake, csg, cyl, cylZ, cylX, closedTube, extrude, hull, lathe, splitZ, type Brush } from './geo';
import { ChamberParticles, FlowParticles } from './particles';
import { reducedMotion } from '../core/settings';
import { mulberry32 } from './materials';
import { manager } from '../core/renderer';

export type TwoKey = 'block' | 'head' | 'crankcase' | 'crankshaft' | 'rod' | 'piston' | 'sparkPlug' | 'exPort' | 'transfer' | 'inPort' | 'exhaust';
type View = 'solid' | 'cutaway' | 'xray';

interface TPart {
  key: TwoKey;
  obj: THREE.Object3D;
  mats: PartMaterial[];
  anchor: THREE.Vector3;
  pick: THREE.Mesh[];
}

/** Port timing used by the model (degrees after TDC). */
export const PORTS = { exhaustOpen: 105, transferOpen: 120 };

/**
 * Small piston-ported, crankcase-scavenged two-stroke with an air-cooled finned barrel,
 * a transfer channel on the left, exhaust port and expansion chamber on the right and a
 * reed-valve intake into the crankcase.
 */
export class TwoStrokeEngine {
  readonly group = new THREE.Group();
  parts = new Map<TwoKey, TPart>();
  view: View = 'cutaway';
  readonly S: number;
  readonly r: number;
  readonly L: number;
  readonly R: number;
  readonly cH = 0.3;
  readonly hc: number;
  readonly yH: number;
  readonly yEx: number; // top edge of exhaust port
  readonly yTr: number; // top edge of transfer port
  readonly yBot: number; // port bottoms
  private crank = new THREE.Group();
  private rodG = new THREE.Group();
  private pistonG = new THREE.Group();
  private housings: Array<{ key: TwoKey; full: THREE.Mesh; back: THREE.Mesh | null; front: THREE.Mesh | null; pm: PartMaterial; pmF: PartMaterial; build: () => Brush }> = [];
  chamber!: ChamberParticles;
  transferFlow!: FlowParticles;
  exhaustFlow!: FlowParticles;
  intakeFlow!: FlowParticles;
  private crankcaseCloud!: THREE.Points;
  private ccMat!: THREE.ShaderMaterial;
  private sparkSprite!: THREE.Mesh;
  private sparkLight = new THREE.PointLight('#bfe4ff', 0, 1.2, 2);
  private fireLight = new THREE.PointLight('#ffb05a', 0, 3, 2);
  private exMats: PartMaterial[] = [];
  private heat = 0;
  private cut = { v: 1 };
  private xray = { v: 0 };
  private tl: gsap.core.Timeline | null = null;
  readonly ready: Promise<void>;

  constructor(readonly g: CrankGeometry, particles: number) {
    // display scale: a 54 mm bore is drawn at 1.6× so it matches the other models on screen
    this.S = 0.016;
    this.r = (g.stroke / 2) * this.S;
    this.L = g.rod * this.S;
    this.R = (g.bore / 2) * this.S;
    const vd = (Math.PI / 4) * g.bore * g.bore * g.stroke;
    const hcMm = vd / (g.compressionRatio - 1) / ((Math.PI / 4) * g.bore * g.bore);
    this.hc = hcMm * this.S;
    this.yH = this.r + this.L + this.cH + this.hc;
    const crownAt = (th: number) => pistonPinHeight(g, th) * this.S + this.cH;
    this.yEx = crownAt(PORTS.exhaustOpen);
    this.yTr = crownAt(PORTS.transferOpen);
    this.yBot = crownAt(180) - 0.03;
    this.ready = this.build(particles);
  }

  private add(key: TwoKey, obj: THREE.Object3D, mats: PartMaterial[], anchor: [number, number, number]) {
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

  private async frame() {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  private async build(count: number) {
    const { R, yH, yEx, yTr, yBot } = this;
    const yB0 = 0.62;
    const barrelH = yH - yB0;
    const xT = -(R + 0.13); // transfer channel centre x
    const exhaustCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(R - 0.05, (yEx + yBot) / 2, 0),
      new THREE.Vector3(R + 0.35, (yEx + yBot) / 2 - 0.02, 0),
      new THREE.Vector3(R + 0.6, (yEx + yBot) / 2 - 0.25, 0),
    ]);
    const transferCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.42, 0),
      new THREE.Vector3(xT, 0.6, 0),
      new THREE.Vector3(xT, (yTr + yBot) / 2 - 0.05, 0),
      new THREE.Vector3(-R + 0.02, (yTr + yBot) / 2 + 0.02, 0),
    ]);

    const barrelBuild = () => {
      let b = brush(cyl(R + 0.1, barrelH, 64), [0, yB0 + barrelH / 2, 0]);
      const fins: Brush[] = [];
      for (let y = yB0 + 0.12; y < yH - 0.04; y += 0.085) fins.push(brush(cyl(R + 0.3, 0.03, 64), [0, y, 0]));
      b = csg.add(b, ...fins);
      // transfer channel housing (left)
      b = csg.add(b, brush(box(0.2, barrelH * 0.85, 0.5, 0.03), [xT, yB0 + barrelH * 0.42, 0]));
      // exhaust stub (right)
      b = csg.add(b, brush(box(0.34, yEx - yBot + 0.16, 0.34, 0.03), [R + 0.2, (yEx + yBot) / 2, 0]));
      const cuts: Brush[] = [brush(cyl(R, barrelH + 0.4, 64), [0, yB0 + barrelH / 2, 0])];
      // exhaust port window and duct
      cuts.push(brush(box(0.5, yEx - yBot, 0.26), [R + 0.05, (yEx + yBot) / 2, 0]));
      cuts.push(brush(closedTube(exhaustCurve, () => 0.11, 32, 24)));
      // transfer window and channel
      cuts.push(brush(box(0.2, yTr - yBot, 0.3), [-R - 0.02, (yTr + yBot) / 2, 0]));
      cuts.push(brush(closedTube(transferCurve, () => 0.07, 40, 20)));
      return csg.sub(b, ...cuts);
    };
    const headBuild = () => {
      const h = 0.34;
      let b = brush(cyl(R + 0.14, h, 64), [0, yH + h / 2, 0]);
      const fins: Brush[] = [];
      for (let x = -0.4; x <= 0.4; x += 0.1) fins.push(brush(box(0.025, 0.2, 1.0), [x, yH + h + 0.08, 0]));
      b = csg.add(b, ...fins);
      b = csg.sub(b, brush(cyl(0.05, 0.8, 24), [0, yH + 0.3, 0]));
      return b;
    };
    const ccBuild = () => {
      let b = brush(box(1.3, 1.2, 0.78, 0.12), [0, 0.02, 0]);
      b = csg.sub(b, brush(box(1.1, 1.0, 0.56, 0.08), [0, 0.0, 0]));
      b = csg.sub(b, brush(cyl(R, 0.4, 48), [0, yB0 - 0.05, 0]));
      b = csg.sub(b, brush(cylZ(0.08, 1.2, 32), [0, 0, 0]));
      // reed-valve intake opening (lower right, facing +x)
      b = csg.sub(b, brush(cylX(0.11, 0.5, 32), [0.6, -0.15, 0]));
      // transfer channel continues into the crankcase
      b = csg.sub(b, brush(closedTube(transferCurve, () => 0.07, 40, 20)));
      return b;
    };
    const defs: Array<{ key: TwoKey; kind: 'aluminium' | 'iron'; build: () => Brush; anchor: [number, number, number] }> = [
      { key: 'crankcase', kind: 'aluminium', build: ccBuild, anchor: [0.7, -0.35, 0.3] },
      { key: 'block', kind: 'aluminium', build: barrelBuild, anchor: [-0.75, yH - 0.2, 0.2] },
      { key: 'head', kind: 'aluminium', build: headBuild, anchor: [0.4, yH + 0.42, 0.2] },
    ];
    for (const d of defs) {
      const pm = makeMaterial(d.kind, { hatch: true, color: d.key === 'block' ? '#9aa0a8' : undefined });
      const pmF = makeMaterial(d.kind, { hatch: true });
      const full = new THREE.Mesh(bake(d.build()), pm.mat);
      const holder = new THREE.Group();
      holder.add(full);
      this.group.add(holder);
      this.housings.push({ key: d.key, full, back: null, front: null, pm, pmF, build: d.build });
      this.add(d.key, holder, [pm, pmF], d.anchor);
      await this.frame();
    }

    // crank: full-circle flywheels
    const steel = makeMaterial('steel');
    const pol = makeMaterial('polished');
    for (const z of [-0.12, 0.12]) {
      const disc = new THREE.Mesh(cylZ(0.42, 0.06, 64), steel.mat);
      disc.position.z = z;
      this.crank.add(disc);
    }
    const pin = new THREE.Mesh(cylZ(0.065, 0.2, 32), pol.mat);
    pin.position.y = this.r;
    this.crank.add(pin);
    const shaft = new THREE.Mesh(cylZ(0.07, 1.25, 32), pol.mat);
    this.crank.add(shaft);
    this.group.add(this.crank);
    this.add('crankshaft', this.crank, [steel, pol], [0.38, -0.35, 0.3]);

    // rod
    const rodM = makeMaterial('steel');
    const L = this.L;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push([Math.cos(a) * 0.12, Math.sin(a) * 0.12]);
      pts.push([Math.cos(a) * 0.07, L + Math.sin(a) * 0.07]);
    }
    const shape = new THREE.Shape(hull(pts).map(([x, y]) => new THREE.Vector2(x, y)));
    const h1 = new THREE.Path();
    h1.absarc(0, 0, 0.07, 0, Math.PI * 2, true);
    const h2 = new THREE.Path();
    h2.absarc(0, L, 0.04, 0, Math.PI * 2, true);
    shape.holes.push(h1, h2);
    this.rodG.add(new THREE.Mesh(extrude(shape, 0.06, 0.008, 32), rodM.mat));
    this.group.add(this.rodG);
    this.add('rod', this.rodG, [rodM], [0.12, this.r + L * 0.5, 0.1]);

    // piston
    const Rp = R - 0.004;
    const pm = makeMaterial('aluminium', { color: '#c9ccd0' });
    const prof: Array<[number, number]> = [
      [0, 0.32], [Rp * 0.6, 0.315], [Rp - 0.02, 0.3], [Rp, 0.285], [Rp, 0.26], [Rp - 0.014, 0.26], [Rp - 0.014, 0.245], [Rp, 0.245],
      [Rp, 0.22], [Rp - 0.014, 0.22], [Rp - 0.014, 0.205], [Rp, 0.205], [Rp - 0.003, -0.62], [Rp - 0.035, -0.62], [Rp - 0.035, 0.22], [0, 0.24],
    ];
    this.pistonG.add(new THREE.Mesh(lathe(prof, 64), pm.mat));
    this.pistonG.add(new THREE.Mesh(cylZ(0.04, Rp * 1.7, 24), pol.mat));
    this.group.add(this.pistonG);
    this.add('piston', this.pistonG, [pm], [0.2, 0.3, 0.3]);

    // spark plug
    const plug = new THREE.Group();
    const cer = makeMaterial('ceramic');
    const met = makeMaterial('steel', { color: '#b8b2a6' });
    plug.add(new THREE.Mesh(lathe([[0, -0.01], [0.02, -0.01], [0.042, 0], [0.042, 0.2], [0.065, 0.21], [0.065, 0.27], [0, 0.27]], 32), met.mat));
    const ins = new THREE.Mesh(lathe([[0, 0.25], [0.04, 0.27], [0.04, 0.45], [0.025, 0.5], [0, 0.5]], 32), cer.mat);
    plug.add(ins);
    plug.position.set(0, yH - 0.005, 0);
    this.group.add(plug);
    this.add('sparkPlug', plug, [cer, met], [0.15, yH + 0.55, 0.1]);
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 6, 9), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.sparkSprite = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), sm);
    this.sparkSprite.position.set(0, yH - 0.03, 0);
    this.group.add(this.sparkSprite);

    // expansion-chamber exhaust (right) — tuned pipe shape
    const exM = makeMaterial('darksteel', { color: '#6b6560' });
    exM.mat.emissive = new THREE.Color('#ff3d0a');
    exM.mat.emissiveIntensity = 0;
    this.exMats.push(exM);
    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(R + 0.55, (yEx + yBot) / 2 - 0.2, 0),
      new THREE.Vector3(R + 0.85, (yEx + yBot) / 2 - 0.6, 0),
      new THREE.Vector3(R + 0.95, 0.2, 0),
      new THREE.Vector3(R + 0.95, -0.7, 0),
    ]);
    const pipe = new THREE.Mesh(
      closedTube(pipeCurve, (t) => 0.1 + 0.16 * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (t < 0.85 ? 1 : 0.6), 64, 28),
      exM.mat,
    );
    const ex = new THREE.Group();
    ex.add(pipe);
    this.group.add(ex);
    this.add('exhaust', ex, [exM], [R + 1.2, 0.1, 0.1]);

    // reed-valve intake with carburettor stub
    const intake = new THREE.Group();
    const inM = makeMaterial('polymer', { color: '#2a2d33' });
    const reed = new THREE.Mesh(box(0.14, 0.3, 0.3, 0.02), inM.mat);
    reed.position.set(0.72, -0.15, 0);
    const carb = new THREE.Mesh(cylX(0.1, 0.32, 32), makeMaterial('aluminium').mat);
    carb.position.set(0.95, -0.15, 0);
    intake.add(reed, carb);
    this.group.add(intake);
    this.add('inPort', intake, [inM], [1.05, -0.4, 0.2]);

    // invisible pick volumes for ports so they can be labelled
    const ghost = new THREE.MeshBasicMaterial({ visible: false });
    const exPortG = new THREE.Mesh(box(0.3, yEx - yBot, 0.26), ghost);
    exPortG.position.set(R + 0.1, (yEx + yBot) / 2, 0);
    const trG = new THREE.Mesh(box(0.2, yTr - yBot, 0.3), ghost);
    trG.position.set(xT, (yTr + yBot) / 2, 0);
    this.group.add(exPortG, trG);
    this.parts.set('exPort', { key: 'exPort', obj: exPortG, mats: [], anchor: new THREE.Vector3(R + 0.2, yEx + 0.05, 0.1), pick: [] });
    this.parts.set('transfer', { key: 'transfer', obj: trG, mats: [], anchor: new THREE.Vector3(xT - 0.05, 0.75, 0.1), pick: [] });

    /* gas */
    this.chamber = new ChamberParticles(count, R - 0.01, 'two-stroke');
    this.group.add(this.chamber.points);
    this.transferFlow = new FlowParticles(Math.round(count * 0.18), transferCurve, () => 0.055, 'intake');
    const exhaustPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(R - 0.05, (yEx + yBot) / 2, 0),
      new THREE.Vector3(R + 0.35, (yEx + yBot) / 2 - 0.02, 0),
      new THREE.Vector3(R + 0.62, (yEx + yBot) / 2 - 0.26, 0),
      new THREE.Vector3(R + 0.85, (yEx + yBot) / 2 - 0.6, 0),
      new THREE.Vector3(R + 0.95, 0.2, 0),
      new THREE.Vector3(R + 0.95, -0.65, 0),
    ]);
    this.exhaustFlow = new FlowParticles(Math.round(count * 0.25), exhaustPath, (t) => (t < 0.3 ? 0.08 : 0.08 + 0.12 * Math.sin(Math.min(1, (t - 0.3) * 1.6) * Math.PI)), 'exhaust');
    const intakePath = new THREE.CatmullRomCurve3([new THREE.Vector3(1.12, -0.15, 0), new THREE.Vector3(0.75, -0.15, 0), new THREE.Vector3(0.45, -0.18, 0)]);
    this.intakeFlow = new FlowParticles(Math.round(count * 0.1), intakePath, () => 0.07, 'intake');
    this.group.add(this.transferFlow.points, this.exhaustFlow.points, this.intakeFlow.points);
    // crankcase charge cloud
    const n = Math.round(count * 0.25);
    const rnd = mulberry32(3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // inside the crankcase cavity but outside the flywheels' disc region
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 20; k++) {
        x = (rnd() - 0.5) * 1.0;
        y = (rnd() - 0.5) * 0.9;
        z = (rnd() - 0.5) * 0.46;
        if (Math.hypot(x, y) > 0.47 || Math.abs(z) < 0.07) break;
      }
      pos.set([x, y, z], i * 3);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ccMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0.3 }, uPx: { value: 1 }, uClipZ: { value: 0 } },
      vertexShader: `uniform float uPx, uClipZ; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = 20.0*uPx/max(0.1,-mv.z); if (position.z > uClipZ) gl_Position = vec4(2.0,2.0,2.0,1.0); }`,
      fragmentShader: `uniform float uA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); if (d>0.5) discard; float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(0.25,0.82,1.0)*a, a*uA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.crankcaseCloud = new THREE.Points(cg, this.ccMat);
    this.crankcaseCloud.frustumCulled = false;
    this.group.add(this.crankcaseCloud);
    this.sparkLight.position.set(0, yH - 0.04, 0);
    this.group.add(this.sparkLight, this.fireLight);
    await this.ensureHalves();
    this.applyView();
  }

  private async ensureHalves() {
    for (const h of this.housings) {
      if (h.back) continue;
      const { back, front } = splitZ(h.build());
      h.back = new THREE.Mesh(back, h.pm.mat);
      h.front = new THREE.Mesh(front, h.pmF.mat);
      for (const m of [h.back, h.front]) {
        m.castShadow = m.receiveShadow = true;
        m.userData.part = h.key;
      }
      const holder = this.parts.get(h.key)!.obj;
      holder.add(h.back, h.front);
      this.parts.get(h.key)!.pick.push(h.back);
      await this.frame();
    }
  }

  setView(v: View) {
    this.view = v;
    this.tl?.kill();
    const d = reducedMotion() ? 0 : 1;
    this.tl = gsap.timeline({ onUpdate: () => this.applyView(), onComplete: () => this.applyView() });
    this.tl.to(this.cut, { v: v === 'cutaway' ? 1 : 0, duration: d, ease: 'expo.inOut' }, 0);
    this.tl.to(this.xray, { v: v === 'xray' ? 1 : 0, duration: d * 0.8, ease: 'expo.inOut' }, 0);
    if (d === 0) this.tl.progress(1);
  }

  private applyView() {
    const c = this.cut.v;
    for (const h of this.housings) {
      const halves = c > 0.001;
      h.full.visible = !halves;
      if (h.back) h.back.visible = halves;
      if (h.front) {
        h.front.visible = halves && c < 0.999;
        h.front.position.z = c * 1.6;
      }
      setXray(h.pm, this.xray.v);
      setXray(h.pmF, Math.max(this.xray.v, c));
    }
    const clip = c > 0.5 ? 0 : 10;
    this.chamber.setClip(clip);
    this.transferFlow.setClip(clip);
    this.exhaustFlow.setClip(clip);
    this.intakeFlow.setClip(clip);
    this.ccMat.uniforms.uClipZ.value = clip;
  }

  update(theta: number, rpm: number, load: number, tb: CycleTable, dt: number) {
    const th = wrap360(theta);
    const g = this.g;
    const S = this.S;
    this.crank.rotation.z = -th * DEG;
    const pinY = pistonPinHeight(g, th) * S;
    this.rodG.position.set(this.r * Math.sin(th * DEG), this.r * Math.cos(th * DEG), 0);
    this.rodG.rotation.z = rodAngle(g, th);
    this.pistonG.position.y = pinY;
    const crown = pinY + this.cH;
    // port openings follow the piston crown (fraction of each window uncovered)
    const exOpen = Math.max(0, Math.min(1, (this.yEx - crown) / (this.yEx - this.yBot)));
    const trOpen = Math.max(0, Math.min(1, (this.yTr - crown) / (this.yTr - this.yBot)));
    const T = temperatureAt(tb, th);
    const xb = burnedAt(tb, th);
    this.chamber.update({
      theta: th,
      crownY: crown,
      headY: this.yH,
      temp: T,
      burned: xb,
      burnStart: tb.burnStart,
      ignition: tb.ignition,
      pressure: pressureAt(tb, th),
      plug: new THREE.Vector3(0, this.yH - 0.03, 0),
      intakeLift: trOpen,
      exhaustLift: exOpen,
      dt,
      visible: 1,
      kind: 'two-stroke',
    });
    const speed = Math.min(3, (rpm / 60) * 0.2);
    this.transferFlow.update(dt, trOpen, speed, 320, 1, th);
    this.exhaustFlow.update(dt, exOpen, speed, T, 1, th);
    // reed valve opens while the rising piston lowers crankcase pressure (~ 250°–80°)
    const rising = th > 200 || th < 40;
    this.intakeFlow.update(dt, rising ? 0.8 : 0, speed, 320, 1, th);
    // crankcase charge: denser when compressed by the descending piston
    const drop = pistonDrop(g, th) / g.stroke;
    this.ccMat.uniforms.uA.value = 0.12 + 0.35 * drop * (trOpen > 0 ? 0.6 : 1);
    this.ccMat.uniforms.uPx.value = manager.dpr;
    // spark at ~22° BTDC
    const since = wrap360(th - tb.ignition);
    const spark = since < 6 ? 1 - since / 6 : 0;
    (this.sparkSprite.material as THREE.MeshBasicMaterial).opacity = spark;
    this.sparkLight.intensity = spark * 6;
    const hot = Math.max(0, Math.min(1, (T - 900) / 1800));
    this.fireLight.intensity = hot * 2.5;
    this.fireLight.position.y = (crown + this.yH) / 2;
    const target = Math.min(1, (rpm / 9000) * (0.4 + 0.6 * load));
    this.heat += (target - this.heat) * Math.min(1, dt * 0.6);
    for (const m of this.exMats) m.mat.emissiveIntensity = Math.pow(this.heat, 1.6) * 1.3;
    return { exOpen, trOpen, rising };
  }

  setHighlight(key: TwoKey | null, amount = 1) {
    for (const p of this.parts.values()) for (const m of p.mats) m.u.uHighlight.value = p.key === key ? amount : 0;
  }

  pickables() {
    const out: THREE.Mesh[] = [];
    for (const p of this.parts.values()) for (const m of p.pick) if (m.visible) out.push(m);
    return out;
  }

  anchorOf(key: TwoKey, out = new THREE.Vector3()) {
    const p = this.parts.get(key);
    out.copy(p ? p.anchor : new THREE.Vector3());
    return this.group.localToWorld(out);
  }

  dispose() {
    this.tl?.kill();
    this.chamber.dispose();
    this.transferFlow.dispose();
    this.exhaustFlow.dispose();
    this.intakeFlow.dispose();
    this.crankcaseCloud.geometry.dispose();
    this.ccMat.dispose();
  }
}
