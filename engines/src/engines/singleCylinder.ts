import * as THREE from 'three';
import gsap from 'gsap';
import { type CrankGeometry, clearanceHeight, DEG, pistonPinHeight, rodAngle, wrap720 } from '../physics/kinematics';
import { valveLift, typicalTiming, type ValveTiming, type ValveEvent } from '../physics/valves';
import { type CycleTable, pressureAt, burnedAt, temperatureAt } from '../physics/cycle';
import { makeMaterial, setXray, type PartMaterial } from './materials';
import {
  box,
  brush,
  bake,
  csg,
  cyl,
  cylZ,
  closedTube,
  extrude,
  hull,
  lathe,
  helix,
  sprocketShape,
  splitZ,
  type Brush,
} from './geo';
import { ChamberParticles, FlowParticles, SprayParticles } from './particles';
import { reducedMotion } from '../core/settings';

export type EngineKind = 'petrol' | 'diesel';
export type ViewMode = 'solid' | 'cutaway' | 'xray' | 'exploded';

export type PartKey =
  | 'block'
  | 'head'
  | 'crankcase'
  | 'oilpan'
  | 'camcover'
  | 'crankshaft'
  | 'rod'
  | 'piston'
  | 'intakeValve'
  | 'exhaustValve'
  | 'intakeCam'
  | 'exhaustCam'
  | 'sparkPlug'
  | 'coil'
  | 'injector'
  | 'glowPlug'
  | 'intake'
  | 'exhaust'
  | 'timingBelt'
  | 'throttle'
  | 'catalyst'
  | 'portInjector';

export interface Part {
  key: PartKey;
  obj: THREE.Object3D;
  mats: PartMaterial[];
  /** anchor in engine space for labels */
  anchor: THREE.Vector3;
  /** exploded-view offset */
  explode: THREE.Vector3;
  /** is a housing piece that can be cut away */
  housing?: boolean;
  /** solid meshes used for picking */
  pick: THREE.Mesh[];
}

const S = 0.01; // mm → scene units (1 unit = 100 mm)

export interface EngineState {
  theta: number;
  rpm: number;
  load: number;
  table: CycleTable;
  timing: ValveTiming;
}

interface Housing {
  key: PartKey;
  full: THREE.Mesh;
  back: THREE.Mesh | null;
  front: THREE.Mesh | null;
  pm: PartMaterial;
  pmFront: PartMaterial;
  build: () => Brush;
}

export class SingleCylinderEngine {
  readonly group = new THREE.Group();
  readonly kind: EngineKind;
  readonly g: CrankGeometry;
  parts = new Map<PartKey, Part>();
  view: ViewMode = 'solid';
  private housings: Housing[] = [];
  // dimensions (scene units)
  readonly r: number;
  readonly L: number;
  readonly R: number;
  readonly cH = 0.32;
  readonly hc: number;
  readonly yH: number;
  readonly camY: number;
  readonly rb = 0.12;
  readonly xI = -0.22;
  readonly xE = 0.24;
  readonly plugX = 0.02;
  // movers
  private crank = new THREE.Group();
  private rodG = new THREE.Group();
  private pistonG = new THREE.Group();
  private ivG = new THREE.Group();
  private evG = new THREE.Group();
  private icamG = new THREE.Group();
  private ecamG = new THREE.Group();
  private ivSpring!: THREE.Mesh;
  private evSpring!: THREE.Mesh;
  private beltTex: THREE.CanvasTexture | null = null;
  private beltLen = 1;
  // effects
  chamber!: ChamberParticles;
  intakeFlow!: FlowParticles;
  exhaustFlow!: FlowParticles;
  spray: SprayParticles | null = null;
  private sparkLight = new THREE.PointLight('#bfe4ff', 0, 1.2, 2);
  private fireLight = new THREE.PointLight('#ffb05a', 0, 3.2, 2);
  private sparkSprite!: THREE.Mesh;
  private glowPlugTip: THREE.Mesh | null = null;
  private exhaustHeat = 0;
  private exhaustMats: PartMaterial[] = [];
  private catMats: PartMaterial[] = [];
  private lastTheta = 0;
  private plugPos = new THREE.Vector3();
  private baseTiming: ValveTiming = typicalTiming();
  private explodeAmt = { v: 0 };
  private cutAmt = { v: 0 };
  private xrayAmt = { v: 0 };
  /** overall particle visibility (0 = hidden) */
  gasVisible = 1;
  /** multiplier for flame light (hero uses a gentler glow) */
  glow = 1;
  private viewTl: gsap.core.Timeline | null = null;
  readonly ready: Promise<void>;
  onViewChange: ((v: ViewMode) => void) | null = null;

  constructor(kind: EngineKind, g: CrankGeometry, particleCount: number) {
    this.kind = kind;
    this.g = g;
    this.r = (g.stroke / 2) * S;
    this.L = g.rod * S;
    this.R = (g.bore / 2) * S;
    this.hc = clearanceHeight(g) * S;
    this.yH = this.r + this.L + this.cH + this.hc;
    this.camY = this.yH + 0.99;
    this.ready = this.build(particleCount);
  }

  /* ---------------------------------------------------------------- build */

  private addPart(key: PartKey, obj: THREE.Object3D, mats: PartMaterial[], anchor: [number, number, number], explode: [number, number, number], housing = false) {
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
    obj.userData.part = key;
    this.parts.set(key, { key, obj, mats, anchor: new THREE.Vector3(...anchor), explode: new THREE.Vector3(...explode), housing, pick });
  }

  private async yieldFrame() {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  private async build(particleCount: number) {
    const { r, R, yH, camY, rb, xI, xE } = this;
    const petrol = this.kind === 'petrol';

    /* ---- housings (CSG) ---- */
    const yB0 = 0.95;
    const blockH = yH - yB0;
    const blockBuild = () => {
      let b = brush(box(1.24, blockH, 1.04, 0.05), [0, yB0 + blockH / 2, 0]);
      const bore = brush(cyl(R, blockH + 0.4, 64), [0, yB0 + blockH / 2, 0]);
      const jacketOuter = brush(cyl(R + 0.105, blockH - 0.28, 64), [0, yB0 + blockH / 2 + 0.06, 0]);
      const jacketInner = brush(cyl(R + 0.06, blockH, 64), [0, yB0 + blockH / 2, 0]);
      const jacket = csg.sub(jacketOuter, jacketInner);
      b = csg.sub(b, bore, jacket);
      return b;
    };
    const ccTop = yB0;
    const ccBot = -0.78;
    const ccH = ccTop - ccBot;
    const crankcaseBuild = () => {
      let b = brush(box(1.72, ccH, 0.92, 0.06), [0, ccBot + ccH / 2, 0]);
      const inner = brush(box(1.56, ccH + 0.3, 0.76, 0.04), [0, ccBot + ccH / 2 + 0.12, 0]);
      b = csg.sub(b, inner);
      // main bearing bosses front & back with shaft holes
      const bossF = brush(cylZ(0.2, 0.12, 48), [0, 0, 0.46]);
      const bossB = brush(cylZ(0.2, 0.12, 48), [0, 0, -0.46]);
      b = csg.add(b, bossF, bossB);
      b = csg.sub(b, brush(cylZ(0.115, 1.4, 48), [0, 0, 0]));
      return b;
    };
    const panBuild = () => {
      const top = ccBot;
      let b = brush(box(1.64, 0.3, 0.88, 0.06), [0, top - 0.13, 0]);
      b = csg.sub(b, brush(box(1.52, 0.3, 0.76, 0.03), [0, top - 0.06, 0]));
      return b;
    };
    const headTop = yH + 0.83;
    const headBuild = () => {
      const h = headTop - yH;
      let b = brush(box(1.24, h, 1.04, 0.05), [0, yH + h / 2, 0]);
      const cuts: Brush[] = [];
      // valve throats & seat recesses
      cuts.push(brush(cyl(0.145, 0.14, 48), [xI, yH + 0.06, 0]));
      cuts.push(brush(cyl(0.165, 0.04, 48), [xI, yH + 0.01, 0]));
      cuts.push(brush(cyl(0.125, 0.14, 48), [xE, yH + 0.06, 0]));
      cuts.push(brush(cyl(0.145, 0.04, 48), [xE, yH + 0.01, 0]));
      // ports
      const ip = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xI, yH + 0.06, 0),
        new THREE.Vector3(xI - 0.03, yH + 0.22, 0),
        new THREE.Vector3(xI - 0.22, yH + 0.33, 0),
        new THREE.Vector3(-0.8, yH + 0.34, 0),
      ]);
      cuts.push(brush(closedTube(ip, (t) => 0.135 - 0.025 * t, 48, 28)));
      const ep = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xE, yH + 0.06, 0),
        new THREE.Vector3(xE + 0.03, yH + 0.2, 0),
        new THREE.Vector3(xE + 0.2, yH + 0.3, 0),
        new THREE.Vector3(0.8, yH + 0.32, 0),
      ]);
      cuts.push(brush(closedTube(ep, (t) => 0.12 - 0.02 * t, 48, 28)));
      // valve guides, spring/tappet bores
      cuts.push(brush(cyl(0.036, 0.8, 24), [xI, yH + 0.4, 0]));
      cuts.push(brush(cyl(0.036, 0.8, 24), [xE, yH + 0.4, 0]));
      cuts.push(brush(cyl(0.118, 0.6, 48), [xI, yH + 0.43 + 0.3, 0]));
      cuts.push(brush(cyl(0.118, 0.6, 48), [xE, yH + 0.43 + 0.3, 0]));
      // spark plug / injector well
      cuts.push(brush(cyl(0.062, h + 0.4, 32), [this.plugX, yH + h / 2 + 0.1, 0]));
      // cam troughs
      cuts.push(brush(cylZ(0.2, 1.3, 48), [xI, camY, 0]));
      cuts.push(brush(cylZ(0.2, 1.3, 48), [xE, camY, 0]));
      if (!petrol) cuts.push(brush(cyl(0.03, 0.8, 16), [this.plugX - 0.02, yH + 0.24, -0.31], [-0.5, 0, 0]));
      b = csg.sub(b, ...cuts);
      return b;
    };
    const coverBuild = () => {
      const y0 = headTop;
      const h = 0.42;
      let b = brush(box(1.2, h, 1.0, 0.12), [0, y0 + h / 2, 0]);
      b = csg.sub(b, brush(box(1.12, h, 0.92, 0.08), [0, y0 + h / 2 - 0.04, 0]));
      b = csg.sub(b, brush(cyl(0.09, 1, 32), [this.plugX, y0 + 0.4, 0]));
      return b;
    };

    const housingDefs: Array<{ key: PartKey; kind: 'iron' | 'aluminium' | 'polymer' | 'darksteel'; build: () => Brush; anchor: [number, number, number]; explode: [number, number, number] }> = [
      { key: 'crankcase', kind: 'aluminium', build: crankcaseBuild, anchor: [0.86, 0.3, 0.3], explode: [0, -0.9, 0] },
      { key: 'oilpan', kind: 'darksteel', build: panBuild, anchor: [0.8, -0.9, 0.3], explode: [0, -1.7, 0] },
      { key: 'block', kind: 'iron', build: blockBuild, anchor: [0.62, 1.7, 0.4], explode: [0, 0, 0] },
      { key: 'head', kind: 'aluminium', build: headBuild, anchor: [0.62, yH + 0.6, 0.4], explode: [0, 1.1, 0] },
      { key: 'camcover', kind: 'polymer', build: coverBuild, anchor: [0.5, headTop + 0.35, 0.4], explode: [0, 2.4, 0] },
    ];

    for (const d of housingDefs) {
      const pm = makeMaterial(d.kind, { hatch: true, color: d.key === 'camcover' ? '#24272c' : undefined });
      const pmFront = makeMaterial(d.kind, { hatch: true, color: d.key === 'camcover' ? '#24272c' : undefined });
      const solid = d.build();
      const full = new THREE.Mesh(bake(solid), pm.mat);
      const holder = new THREE.Group();
      holder.add(full);
      const hs: Housing = { key: d.key, full, back: null, front: null, pm, pmFront, build: d.build };
      this.housings.push(hs);
      this.addPart(d.key, holder, [pm, pmFront], d.anchor, d.explode, true);
      this.group.add(holder);
      await this.yieldFrame();
    }

    /* ---- crankshaft ---- */
    const crankMat = makeMaterial('polished');
    const webMat = makeMaterial('steel');
    const webShapePts: Array<[number, number]> = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      webShapePts.push([Math.cos(a) * 0.19, Math.sin(a) * 0.19]);
      webShapePts.push([Math.cos(a) * 0.17, r + Math.sin(a) * 0.17]);
    }
    for (let i = 0; i <= 24; i++) {
      const a = (-90 - 55 + (110 * i) / 24) * DEG;
      webShapePts.push([Math.cos(a) * 0.52, Math.sin(a) * 0.52]);
    }
    const hp = hull(webShapePts);
    const webShape = new THREE.Shape(hp.map(([x, y]) => new THREE.Vector2(x, y)));
    const webGeo = extrude(webShape, 0.075, 0.012, 32);
    const crank = this.crank;
    for (const z of [-0.16, 0.16]) {
      const w = new THREE.Mesh(webGeo, webMat.mat);
      w.position.z = z;
      crank.add(w);
    }
    const pin = new THREE.Mesh(cylZ(0.13, 0.26, 48), crankMat.mat);
    pin.position.y = r;
    crank.add(pin);
    const mainF = new THREE.Mesh(cylZ(0.11, 0.5, 48), crankMat.mat);
    mainF.position.z = 0.45;
    const mainB = new THREE.Mesh(cylZ(0.11, 0.5, 48), crankMat.mat);
    mainB.position.z = -0.45;
    crank.add(mainF, mainB);
    // crank sprocket (rear) and accessory pulley (front)
    const sprMat = makeMaterial('darksteel');
    const crankSpr = new THREE.Mesh(extrude(sprocketShape(0.1, 18, 0.018), 0.07, 0.004, 4), sprMat.mat);
    crankSpr.position.z = -0.62;
    crank.add(crankSpr);
    const pulleyMat = makeMaterial('darksteel');
    const pulley = new THREE.Mesh(
      lathe([[0, -0.05], [0.2, -0.05], [0.2, -0.035], [0.18, -0.02], [0.2, -0.005], [0.18, 0.01], [0.2, 0.025], [0.2, 0.05], [0, 0.05]], 64),
      pulleyMat.mat,
    );
    pulley.rotation.x = Math.PI / 2;
    pulley.position.z = 0.7;
    crank.add(pulley);
    this.group.add(crank);
    this.addPart('crankshaft', crank, [crankMat, webMat, sprMat, pulleyMat], [0.45, -0.25, 0.35], [0, -0.55, 1.1]);
    await this.yieldFrame();

    /* ---- connecting rod ---- */
    const rodMat = makeMaterial('steel');
    const L = this.L;
    const rodPts: Array<[number, number]> = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      rodPts.push([Math.cos(a) * 0.22, Math.sin(a) * 0.22]);
      rodPts.push([Math.cos(a) * 0.095, L + Math.sin(a) * 0.095]);
    }
    const rodShape = new THREE.Shape(hull(rodPts).map(([x, y]) => new THREE.Vector2(x, y)));
    const bigHole = new THREE.Path();
    bigHole.absarc(0, 0, 0.135, 0, Math.PI * 2, true);
    const smallHole = new THREE.Path();
    smallHole.absarc(0, L, 0.054, 0, Math.PI * 2, true);
    rodShape.holes.push(bigHole, smallHole);
    const rodMesh = new THREE.Mesh(extrude(rodShape, 0.075, 0.01, 48), rodMat.mat);
    this.rodG.add(rodMesh);
    // big-end cap bolts
    const boltMat = makeMaterial('darksteel');
    for (const x of [-0.17, 0.17]) {
      const bolt = new THREE.Mesh(cyl(0.024, 0.12, 6), boltMat.mat);
      bolt.position.set(x, -0.12, 0);
      this.rodG.add(bolt);
    }
    this.group.add(this.rodG);
    this.addPart('rod', this.rodG, [rodMat, boltMat], [0.15, r + L * 0.45, 0.1], [0, 0.35, 0.9]);

    /* ---- piston ---- */
    const Rp = R - 0.004;
    const pistonMat = makeMaterial('aluminium', { color: '#c9ccd0' });
    const prof: Array<[number, number]> = petrol
      ? [
          [0, 0.32], [Rp - 0.02, 0.32], [Rp, 0.3], [Rp, 0.285], [Rp - 0.014, 0.285], [Rp - 0.014, 0.27], [Rp, 0.27],
          [Rp, 0.245], [Rp - 0.014, 0.245], [Rp - 0.014, 0.232], [Rp, 0.232], [Rp, 0.205], [Rp - 0.016, 0.205],
          [Rp - 0.016, 0.185], [Rp, 0.185], [Rp - 0.003, -0.25], [Rp - 0.05, -0.25], [Rp - 0.05, 0.2], [0, 0.22],
        ]
      : [
          [0, 0.22], [0.1, 0.215], [0.17, 0.24], [0.2, 0.285], [0.185, 0.32], [Rp - 0.02, 0.32], [Rp, 0.3], [Rp, 0.285],
          [Rp - 0.014, 0.285], [Rp - 0.014, 0.27], [Rp, 0.27], [Rp, 0.245], [Rp - 0.014, 0.245], [Rp - 0.014, 0.232],
          [Rp, 0.232], [Rp, 0.205], [Rp - 0.016, 0.205], [Rp - 0.016, 0.185], [Rp, 0.185], [Rp - 0.003, -0.25],
          [Rp - 0.05, -0.25], [Rp - 0.05, 0.16], [0, 0.17],
        ];
    const pistonMesh = new THREE.Mesh(lathe(prof, 72), pistonMat.mat);
    this.pistonG.add(pistonMesh);
    const ringMat = makeMaterial('darksteel');
    for (const [y0, y1] of [[0.27, 0.285], [0.232, 0.245], [0.185, 0.205]] as const) {
      const ring = new THREE.Mesh(
        lathe([[Rp - 0.012, y0 + 0.001], [Rp - 0.0015, y0 + 0.001], [Rp - 0.0015, y1 - 0.001], [Rp - 0.012, y1 - 0.001], [Rp - 0.012, y0 + 0.001]], 72),
        ringMat.mat,
      );
      this.pistonG.add(ring);
    }
    const wristMat = makeMaterial('polished');
    const wrist = new THREE.Mesh(cylZ(0.05, Rp * 1.7, 32), wristMat.mat);
    this.pistonG.add(wrist);
    // pin bosses inside the skirt
    for (const z of [-0.2, 0.2]) {
      const bossM = new THREE.Mesh(cylZ(0.085, 0.1, 32), pistonMat.mat);
      bossM.position.z = z;
      this.pistonG.add(bossM);
    }
    this.group.add(this.pistonG);
    this.addPart('piston', this.pistonG, [pistonMat, ringMat, wristMat], [0.2, 0.3, 0.3], [0, 0.85, 0.7]);
    await this.yieldFrame();

    /* ---- valves, springs, tappets, cams ---- */
    const mkValve = (x: number, headR: number, kind: 'chrome' | 'steel', g: THREE.Group) => {
      const stemTop = 3.06 - yH; // relative to head face
      const vm = makeMaterial(kind);
      const valve = new THREE.Mesh(
        lathe([[0, 0], [headR - 0.012, 0], [headR, 0.008], [headR - 0.022, 0.03], [0.07, 0.045], [0.036, 0.09], [0.032, 0.13], [0.032, stemTop - 0.02], [0.026, stemTop - 0.012], [0.032, stemTop], [0, stemTop]], 48),
        vm.mat,
      );
      g.add(valve);
      const tappetMat = makeMaterial('polished');
      const tappet = new THREE.Mesh(cyl(0.11, 0.1, 48), tappetMat.mat);
      tappet.position.y = stemTop + 0.05;
      g.add(tappet);
      const springMat = makeMaterial('darksteel', { color: '#4a5a6c' });
      const spring = new THREE.Mesh(helix(0.082, 0.013, 1, 6.5), springMat.mat);
      g.position.set(x, yH, 0);
      this.group.add(g);
      // spring stays seated on the head: added to the engine group, scaled each frame
      spring.position.set(x, 2.72, 0);
      this.group.add(spring);
      return { valve, vm, tappetMat, springMat, spring };
    };
    const iv = mkValve(xI, 0.16, 'chrome', this.ivG);
    const ev = mkValve(xE, 0.14, 'steel', this.evG);
    this.ivSpring = iv.spring;
    this.evSpring = ev.spring;
    this.addPart('intakeValve', this.ivG, [iv.vm, iv.tappetMat], [xI - 0.15, yH + 0.45, 0.1], [-0.45, 1.6, 0.6]);
    this.parts.get('intakeValve')!.pick.push(iv.spring);
    iv.spring.userData.part = 'intakeValve';
    this.addPart('exhaustValve', this.evG, [ev.vm, ev.tappetMat], [xE + 0.15, yH + 0.45, 0.1], [0.45, 1.6, 0.6]);
    this.parts.get('exhaustValve')!.pick.push(ev.spring);
    ev.spring.userData.part = 'exhaustValve';
    for (const s of [iv.spring, ev.spring]) {
      s.castShadow = true;
      s.receiveShadow = true;
    }

    const lobeGeo = (evn: ValveEvent) => {
      const N = 256;
      const d = -Math.PI / 2;
      const h = (a: number) => rb + valveLift(evn, 2 * (a - d) / DEG) * S;
      const pts: THREE.Vector2[] = [];
      const da = 1e-3;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const hv = h(a);
        const hd = (h(a + da) - h(a - da)) / (2 * da);
        pts.push(new THREE.Vector2(hv * Math.cos(a) - hd * Math.sin(a), hv * Math.sin(a) + hd * Math.cos(a)));
      }
      const shape = new THREE.Shape(pts);
      return extrude(shape, 0.12, 0.008, 4);
    };
    const mkCam = (x: number, evn: ValveEvent, g: THREE.Group) => {
      const cm = makeMaterial('polished');
      const lobe = new THREE.Mesh(lobeGeo(evn), cm.mat);
      g.add(lobe);
      const shaft = new THREE.Mesh(cylZ(0.07, 1.16, 32), cm.mat);
      shaft.position.z = -0.08;
      g.add(shaft);
      for (const z of [-0.3, 0.3]) {
        const j = new THREE.Mesh(cylZ(0.095, 0.08, 32), cm.mat);
        j.position.z = z;
        g.add(j);
      }
      const sm = makeMaterial('darksteel');
      const spr = new THREE.Mesh(extrude(sprocketShape(0.2, 36, 0.018), 0.07, 0.004, 4), sm.mat);
      spr.position.z = -0.62;
      g.add(spr);
      g.position.set(x, camY, 0);
      this.group.add(g);
      return [cm, sm];
    };
    const timing = this.baseTiming;
    this.addPart('intakeCam', this.icamG, mkCam(xI, timing.intake, this.icamG), [xI - 0.25, camY + 0.12, 0.3], [-0.3, 2.9, 0]);
    this.addPart('exhaustCam', this.ecamG, mkCam(xE, timing.exhaust, this.ecamG), [xE + 0.25, camY + 0.12, 0.3], [0.3, 2.9, 0]);
    await this.yieldFrame();

    /* ---- timing belt (rear) ---- */
    {
      const circles: Array<[number, number, number]> = [
        [0, 0, 0.1],
        [xI, camY, 0.2],
        [xE, camY, 0.2],
      ];
      const pts: Array<[number, number]> = [];
      for (const [cx, cy, cr] of circles)
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * Math.PI * 2;
          pts.push([cx + Math.cos(a) * (cr + 0.004), cy + Math.sin(a) * (cr + 0.004)]);
        }
      const path = hull(pts);
      path.push(path[0]);
      let total = 0;
      const cum = [0];
      for (let i = 1; i < path.length; i++) {
        total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        cum.push(total);
      }
      this.beltLen = total;
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      const th = 0.022;
      const w = 0.08;
      // centroid for outward direction
      const cx0 = path.reduce((s, p) => s + p[0], 0) / path.length;
      const cy0 = path.reduce((s, p) => s + p[1], 0) / path.length;
      for (let i = 0; i < path.length; i++) {
        const [x, y] = path[i];
        const [nx0, ny0] = [x - cx0, y - cy0];
        const prev = path[(i - 1 + path.length) % path.length];
        const next = path[(i + 1) % path.length];
        let tx = next[0] - prev[0];
        let ty = next[1] - prev[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        let nx = ty;
        let ny = -tx;
        if (nx * nx0 + ny * ny0 < 0) {
          nx = -nx;
          ny = -ny;
        }
        const u = cum[i] / total;
        for (const [o, zz] of [[0, -w / 2], [0, w / 2], [th, w / 2], [th, -w / 2]] as const) {
          pos.push(x + nx * o, y + ny * o, -0.62 + zz);
          uv.push(u, o > 0 ? 1 : 0);
        }
      }
      const n = path.length;
      for (let i = 0; i < n - 1; i++) {
        const a = i * 4;
        const b = (i + 1) * 4;
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4;
          idx.push(a + k, b + k, a + k2, a + k2, b + k, b + k2);
        }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      bg.setIndex(idx);
      bg.computeVertexNormals();
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 8;
      const gx = c.getContext('2d')!;
      gx.fillStyle = '#16181b';
      gx.fillRect(0, 0, 512, 8);
      gx.fillStyle = '#26292e';
      for (let i = 0; i < 64; i++) gx.fillRect(i * 8, 0, 4, 8);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(Math.round(total / 0.03) / 64, 1);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.beltTex = tex;
      const beltMat = makeMaterial('rubber');
      beltMat.mat.map = tex;
      beltMat.mat.side = THREE.DoubleSide;
      const belt = new THREE.Mesh(bg, beltMat.mat);
      this.group.add(belt);
      this.addPart('timingBelt', belt, [beltMat], [0.35, 1.6, -0.62], [0, 0, -1.2]);
    }

    /* ---- ignition / injection ---- */
    if (petrol) {
      const plug = new THREE.Group();
      const ceramic = makeMaterial('ceramic');
      const metal = makeMaterial('steel', { color: '#b8b2a6' });
      const copper = makeMaterial('copper');
      const body = new THREE.Mesh(
        lathe([[0, -0.012], [0.012, -0.012], [0.02, 0.0], [0.052, 0.0], [0.052, 0.17], [0.072, 0.18], [0.072, 0.26], [0.06, 0.27], [0, 0.27]], 32),
        metal.mat,
      );
      const hex = new THREE.Mesh(cyl(0.085, 0.07, 6), metal.mat);
      hex.position.y = 0.22;
      const ins = new THREE.Mesh(
        lathe([[0, 0.25], [0.048, 0.27], [0.048, 0.47], [0.04, 0.5], [0.045, 0.52], [0.04, 0.55], [0.045, 0.57], [0.03, 0.62], [0, 0.62]], 32),
        ceramic.mat,
      );
      const tipIns = new THREE.Mesh(lathe([[0, -0.005], [0.016, -0.005], [0.022, 0.02], [0, 0.02]], 24), ceramic.mat);
      const electrode = new THREE.Mesh(cyl(0.006, 0.03, 12), copper.mat);
      electrode.position.y = -0.016;
      const ground = new THREE.Mesh(box(0.012, 0.03, 0.016), metal.mat);
      ground.position.set(0.016, -0.02, 0);
      const ground2 = new THREE.Mesh(box(0.024, 0.008, 0.016), metal.mat);
      ground2.position.set(0.006, -0.034, 0);
      plug.add(body, hex, ins, tipIns, electrode, ground, ground2);
      plug.position.set(this.plugX, yH - 0.005, 0);
      this.group.add(plug);
      this.addPart('sparkPlug', plug, [ceramic, metal, copper], [this.plugX + 0.1, yH + 0.45, 0.1], [0.05, 2.0, 0.9]);
      // coil-on-plug
      const coilMat = makeMaterial('polymer', { color: '#2a2d33' });
      const coil = new THREE.Group();
      const boot = new THREE.Mesh(cyl(0.045, 0.5, 24), coilMat.mat);
      boot.position.y = 0.25;
      const head = new THREE.Mesh(box(0.22, 0.12, 0.16, 0.02), coilMat.mat);
      head.position.y = 0.55;
      const conn = new THREE.Mesh(box(0.08, 0.05, 0.08, 0.01), makeMaterial('polymer', { color: '#3a3f47' }).mat);
      conn.position.set(0.1, 0.57, 0);
      coil.add(boot, head, conn);
      coil.position.set(this.plugX, yH + 0.6, 0);
      this.group.add(coil);
      this.addPart('coil', coil, [coilMat], [this.plugX + 0.2, yH + 1.2, 0], [0.05, 3.3, 0.3]);
      // spark sprite
      const sprMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 6, 9), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      this.sparkSprite = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), sprMat);
      this.sparkSprite.position.set(this.plugX + 0.004, yH - 0.03, 0);
      this.group.add(this.sparkSprite);
    } else {
      const inj = new THREE.Group();
      const steel = makeMaterial('steel');
      const black = makeMaterial('polymer', { color: '#25282d' });
      const body = new THREE.Mesh(lathe([[0, -0.03], [0.012, -0.03], [0.02, -0.01], [0.04, 0.0], [0.04, 0.4], [0.06, 0.42], [0.06, 0.62], [0, 0.62]], 32), steel.mat);
      const top = new THREE.Mesh(box(0.14, 0.1, 0.12, 0.02), black.mat);
      top.position.y = 0.66;
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.06, 0.66, 0), new THREE.Vector3(0.3, 0.75, 0), new THREE.Vector3(0.6, 0.62, 0.1), new THREE.Vector3(0.85, 0.2, 0.15)]), 32, 0.016, 10),
        steel.mat,
      );
      inj.add(body, top, line);
      inj.position.set(this.plugX, yH - 0.01, 0);
      this.group.add(inj);
      this.addPart('injector', inj, [steel, black], [this.plugX + 0.12, yH + 0.5, 0.1], [0.05, 2.2, 0.8]);
      // glow plug: enters from the back, tilted
      const gp = new THREE.Group();
      const gpm = makeMaterial('steel', { color: '#b0a68f' });
      const pencil = new THREE.Mesh(cyl(0.022, 0.62, 16), gpm.mat);
      pencil.position.y = 0.31;
      const tipMat = makeMaterial('darksteel');
      const tip = new THREE.Mesh(cyl(0.016, 0.06, 16, 0.012), tipMat.mat);
      tip.position.y = 0.0;
      gp.add(pencil, tip);
      gp.position.set(this.plugX - 0.02, yH - 0.03, -0.16);
      gp.rotation.x = -0.5;
      this.group.add(gp);
      this.glowPlugTip = tip;
      this.addPart('glowPlug', gp, [gpm, tipMat], [this.plugX - 0.25, yH + 0.25, -0.35], [-0.3, 1.8, -0.7]);
    }

    /* ---- intake & exhaust manifolds ---- */
    const runnerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, yH + 0.34, 0),
      new THREE.Vector3(-0.95, yH + 0.4, 0),
      new THREE.Vector3(-1.2, yH + 0.75, 0),
      new THREE.Vector3(-1.25, yH + 1.15, 0),
    ]);
    const intakeMat = makeMaterial('aluminium', { color: '#8e959e' });
    const intake = new THREE.Group();
    const runner = new THREE.Mesh(new THREE.TubeGeometry(runnerCurve, 48, 0.125, 28, false), intakeMat.mat);
    const runnerInner = new THREE.Mesh(new THREE.TubeGeometry(runnerCurve, 48, 0.112, 28, false), makeMaterial('polymer', { color: '#111316', side: THREE.BackSide }).mat);
    const flange = new THREE.Mesh(box(0.06, 0.36, 0.36, 0.015), intakeMat.mat);
    flange.position.set(-0.635, yH + 0.34, 0);
    const plenum = new THREE.Mesh(box(0.42, 0.24, 0.62, 0.08), intakeMat.mat);
    plenum.position.set(-1.25, yH + 1.27, 0);
    intake.add(runner, runnerInner, flange, plenum);
    // throttle body (petrol) / plain inlet (diesel) pointing forward
    const tbMat = makeMaterial('aluminium', { color: '#a7adb5' });
    const throttle = new THREE.Group();
    const tbody = new THREE.Mesh(cylZ(0.11, 0.18, 40), tbMat.mat);
    const tbore = new THREE.Mesh(cylZ(0.09, 0.19, 40), makeMaterial('polymer', { color: '#0d0e10', side: THREE.BackSide }).mat);
    throttle.add(tbody, tbore);
    if (petrol) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.006, 40), makeMaterial('brass').mat);
      plate.rotation.x = Math.PI / 2;
      plate.name = 'throttlePlate';
      throttle.add(plate);
    }
    throttle.position.set(-1.25, yH + 1.27, 0.4);
    this.group.add(intake, throttle);
    this.addPart('intake', intake, [intakeMat], [-1.25, yH + 1.45, 0.2], [-1.0, 0.6, 0]);
    this.addPart('throttle', throttle, [tbMat], [-1.25, yH + 1.27, 0.55], [-1.0, 0.6, 0.6]);
    if (petrol) {
      // port fuel injector on the runner
      const pim = makeMaterial('polymer', { color: '#2f343b' });
      const pinj = new THREE.Group();
      const pb = new THREE.Mesh(cyl(0.035, 0.22, 16), pim.mat);
      pb.position.y = 0.11;
      const pnoz = new THREE.Mesh(cyl(0.015, 0.06, 12), makeMaterial('steel').mat);
      pnoz.position.y = -0.02;
      pinj.add(pb, pnoz);
      pinj.position.set(-0.9, yH + 0.53, 0.0);
      pinj.rotation.z = -0.6;
      this.group.add(pinj);
      this.addPart('portInjector', pinj, [pim], [-0.95, yH + 0.75, 0.15], [-0.9, 1.0, 0.4]);
    }

    const exCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.6, yH + 0.32, 0),
      new THREE.Vector3(0.95, yH + 0.3, 0),
      new THREE.Vector3(1.18, yH - 0.1, 0),
      new THREE.Vector3(1.22, 1.0, 0),
      new THREE.Vector3(1.22, 0.2, 0),
    ]);
    const exMat = makeMaterial('darksteel', { color: '#6b6560' });
    exMat.mat.emissive = new THREE.Color('#ff3d0a');
    exMat.mat.emissiveIntensity = 0;
    this.exhaustMats.push(exMat);
    const exhaust = new THREE.Group();
    const exPipe = new THREE.Mesh(new THREE.TubeGeometry(exCurve, 64, 0.11, 28, false), exMat.mat);
    const exInner = new THREE.Mesh(new THREE.TubeGeometry(exCurve, 64, 0.098, 28, false), makeMaterial('polymer', { color: '#0e0d0c', side: THREE.BackSide }).mat);
    const exFlange = new THREE.Mesh(box(0.06, 0.34, 0.34, 0.015), exMat.mat);
    exFlange.position.set(0.635, yH + 0.32, 0);
    exhaust.add(exPipe, exInner, exFlange);
    this.group.add(exhaust);
    this.addPart('exhaust', exhaust, [exMat], [1.3, yH - 0.1, 0.1], [1.0, 0.3, 0]);
    // catalytic converter can
    const catMat = makeMaterial('steel', { color: '#9b958d' });
    catMat.mat.emissive = new THREE.Color('#ff3d0a');
    catMat.mat.emissiveIntensity = 0;
    this.catMats.push(catMat);
    const cat = new THREE.Mesh(lathe([[0, -0.32], [0.08, -0.32], [0.17, -0.22], [0.17, 0.22], [0.08, 0.32], [0, 0.32]], 48), catMat.mat);
    cat.position.set(1.22, -0.1, 0);
    this.group.add(cat);
    this.addPart('catalyst', cat, [catMat], [1.45, -0.1, 0.1], [1.2, -0.3, 0]);

    /* ---- gas effects ---- */
    const crownTDC = this.r + this.L + this.cH;
    this.chamber = new ChamberParticles(particleCount, R - 0.012, this.kind);
    this.group.add(this.chamber.points);
    const intakePath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.25, yH + 1.2, 0.3),
      new THREE.Vector3(-1.25, yH + 1.15, 0),
      new THREE.Vector3(-1.2, yH + 0.75, 0),
      new THREE.Vector3(-0.95, yH + 0.4, 0),
      new THREE.Vector3(-0.6, yH + 0.34, 0),
      new THREE.Vector3(xI - 0.22, yH + 0.33, 0),
      new THREE.Vector3(xI - 0.03, yH + 0.22, 0),
      new THREE.Vector3(xI, yH + 0.04, 0),
    ]);
    this.intakeFlow = new FlowParticles(Math.round(particleCount * 0.22), intakePath, (t) => (t < 0.62 ? 0.09 : 0.1 - 0.03 * (t - 0.62)), 'intake');
    const exhaustPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xE, yH + 0.04, 0),
      new THREE.Vector3(xE + 0.03, yH + 0.2, 0),
      new THREE.Vector3(xE + 0.2, yH + 0.3, 0),
      new THREE.Vector3(0.6, yH + 0.32, 0),
      new THREE.Vector3(0.95, yH + 0.3, 0),
      new THREE.Vector3(1.18, yH - 0.1, 0),
      new THREE.Vector3(1.22, 1.0, 0),
      new THREE.Vector3(1.22, 0.25, 0),
    ]);
    this.exhaustFlow = new FlowParticles(Math.round(particleCount * 0.22), exhaustPath, () => 0.075, 'exhaust');
    this.group.add(this.intakeFlow.points, this.exhaustFlow.points);
    if (!petrol) {
      this.spray = new SprayParticles(Math.round(particleCount * 0.25), new THREE.Vector3(this.plugX, yH - 0.04, 0), 5, R - 0.03);
      this.group.add(this.spray.points);
    }
    this.sparkLight.position.set(this.plugX, yH - 0.04, 0);
    this.fireLight.position.set(0, (crownTDC + yH) / 2, 0);
    this.group.add(this.sparkLight, this.fireLight);
  }

  /* ---------------------------------------------------------------- housing halves */

  private halvesReady = false;
  async ensureHalves() {
    if (this.halvesReady) return;
    for (const h of this.housings) {
      const { back, front } = splitZ(h.build());
      h.back = new THREE.Mesh(back, h.pm.mat);
      h.front = new THREE.Mesh(front, h.pmFront.mat);
      for (const m of [h.back, h.front]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.part = h.key;
        m.visible = false;
      }
      const holder = this.parts.get(h.key)!.obj;
      holder.add(h.back, h.front);
      this.parts.get(h.key)!.pick.push(h.back);
      await this.yieldFrame();
    }
    this.halvesReady = true;
  }

  /* ---------------------------------------------------------------- views */

  async setView(mode: ViewMode, animate = true) {
    if (mode === this.view) return;
    if (mode === 'cutaway') await this.ensureHalves();
    const prev = this.view;
    this.view = mode;
    this.viewTl?.kill();
    const d = animate && !reducedMotion() ? 1 : 0;
    const tl = gsap.timeline();
    this.viewTl = tl;
    const to = (o: { v: number }, v: number, dur = d, delay = 0) => tl.to(o, { v, duration: dur, ease: 'expo.inOut' }, delay);
    to(this.explodeAmt, mode === 'exploded' ? 1 : 0, d * 1.3);
    to(this.xrayAmt, mode === 'xray' ? 1 : 0, d * 0.8);
    if (mode === 'cutaway' || prev === 'cutaway') {
      // swap full → halves before the transition starts
      if (mode === 'cutaway') this.setHalves(true);
      to(this.cutAmt, mode === 'cutaway' ? 1 : 0, d * 1.1);
      tl.eventCallback('onComplete', () => {
        if (mode !== 'cutaway') this.setHalves(false);
        this.applyView();
      });
    }
    tl.eventCallback('onUpdate', () => this.applyView());
    if (d === 0) {
      tl.progress(1);
      if (mode !== 'cutaway') this.setHalves(false);
      this.applyView();
    }
    this.onViewChange?.(mode);
  }

  private setHalves(on: boolean) {
    for (const h of this.housings) {
      h.full.visible = !on;
      if (h.back) h.back.visible = on;
      if (h.front) h.front.visible = on;
    }
  }

  private applyView() {
    const e = this.explodeAmt.v;
    const x = this.xrayAmt.v;
    const c = this.cutAmt.v;
    // exploded offsets with stagger by order of insertion
    let i = 0;
    const n = this.parts.size;
    for (const p of this.parts.values()) {
      const k = Math.min(1, Math.max(0, e * 1.35 - (i / n) * 0.35));
      const s = k * k * (3 - 2 * k);
      p.obj.userData.explode = p.explode.clone().multiplyScalar(s);
      i++;
    }
    // x-ray: housings translucent
    for (const h of this.housings) {
      setXray(h.pm, x);
      setXray(h.pmFront, Math.max(x, c));
      h.pmFront.mat.opacity = 1;
      if (h.front) {
        h.front.position.z = c * 1.8;
        h.front.visible = c > 0.001 && c < 0.999;
        h.pmFront.u.uXray.value = Math.max(x, c * 0.9);
      }
    }
    this.chamber.setClip(c > 0.5 ? 0.0 : 10);
    this.intakeFlow.setClip(c > 0.5 ? 0.0 : 10);
    this.exhaustFlow.setClip(c > 0.5 ? 0.0 : 10);
    this.spray?.setClip(c > 0.5 ? 0.0 : 10);
  }

  /* ---------------------------------------------------------------- frame update */

  update(st: EngineState, dt: number) {
    const th = st.theta;
    const thc = wrap720(th);
    const { r, yH, camY } = this;
    const g = this.g;
    // crank
    this.crank.rotation.z = -thc * DEG;
    // rod & piston
    const pinY = pistonPinHeight(g, thc) * S;
    const beta = rodAngle(g, thc);
    this.rodG.position.set(r * Math.sin(thc * DEG), r * Math.cos(thc * DEG), 0);
    this.rodG.rotation.z = beta;
    this.pistonG.position.set(0, pinY, 0);
    // valves (cam-derived)
    const ivLift = valveLift(st.timing.intake, thc) * S;
    const evLift = valveLift(st.timing.exhaust, thc) * S;
    this.ivG.position.y = yH - ivLift;
    this.evG.position.y = yH - evLift;
    const springTop = 3.06 - 0.001;
    const sI = springTop - ivLift - 2.72;
    const sE = springTop - evLift - 2.72;
    this.ivSpring.scale.y = sI;
    this.evSpring.scale.y = sE;
    // cams rotate at exactly half crank speed; phase shift from VVT
    const shiftI = st.timing.intake.open - this.baseTiming.intake.open;
    const shiftE = st.timing.exhaust.open - this.baseTiming.exhaust.open;
    this.icamG.rotation.z = (-(thc - shiftI) / 2) * DEG;
    this.ecamG.rotation.z = (-(thc - shiftE) / 2) * DEG;
    // belt travel = crank sprocket circumference × revolutions
    if (this.beltTex) this.beltTex.offset.x = -((thc / 360) * 2 * Math.PI * 0.1) / this.beltLen * this.beltTex.repeat.x;

    this.crank.position.set(0, 0, 0);
    this.icamG.position.set(this.xI, camY, 0);
    this.ecamG.position.set(this.xE, camY, 0);
    this.applyOffsets();

    // gas state
    const tb = st.table;
    const p = pressureAt(tb, thc);
    const T = temperatureAt(tb, thc);
    const xb = burnedAt(tb, thc);
    const crownY = pinY + this.cH;
    const burnStart = tb.burnStart;
    const dth = Math.max(0.0001, Math.abs(th - this.lastTheta));
    this.lastTheta = th;
    const visible = this.explodeAmt.v < 0.05 ? this.gasVisible : 0;
    this.chamber.update({
      theta: thc,
      crownY,
      headY: yH,
      temp: T,
      burned: xb,
      burnStart,
      ignition: tb.ignition,
      pressure: p,
      plug: this.plugPos.set(this.plugX, yH - 0.03, 0),
      intakeLift: ivLift,
      exhaustLift: evLift,
      dt,
      visible,
      kind: this.kind,
      bowl: this.kind === 'diesel',
    });
    const speedScale = Math.min(3, dth / Math.max(dt, 1e-4) / 360);
    this.intakeFlow.update(dt, ivLift / 0.09, speedScale, T, visible, thc);
    this.exhaustFlow.update(dt, evLift / 0.085, speedScale, T, visible, thc);
    this.spray?.update(thc, tb.ignition, crownY, visible);

    // spark & flame light
    const sparkWindow = this.kind === 'petrol' ? wrap720(thc - tb.ignition) : 999;
    const sparkOn = sparkWindow < 6 ? 1 - sparkWindow / 6 : 0;
    if (this.sparkSprite) {
      (this.sparkSprite.material as THREE.MeshBasicMaterial).opacity = sparkOn * visible;
      this.sparkSprite.scale.setScalar(0.6 + sparkOn * 0.8);
    }
    this.sparkLight.intensity = sparkOn * 6 * visible;
    // heat release rate → flame light
    const after = wrap720(thc - burnStart);
    const burning = after < tb.burnDuration * 1.5 ? 1 : 0;
    const hrr = burning * Math.max(0, burnedAt(tb, thc + 2) - xb) * 25;
    const hot = Math.max(0, Math.min(1, (T - 900) / 1800));
    this.fireLight.intensity = (hrr * 12 + hot * 2.2) * visible * this.glow;
    this.fireLight.position.y = (crownY + yH) / 2;
    if (this.glowPlugTip) {
      const m = this.glowPlugTip.material as THREE.MeshPhysicalMaterial;
      m.emissive.set('#ff5a14');
      m.emissiveIntensity = st.rpm < 1000 ? 1.4 : 0.2;
    }
    // exhaust manifold heat glow scales with rpm × load (smoothed)
    const targetHeat = Math.min(1, (st.rpm / 6500) * (0.35 + 0.65 * st.load));
    this.exhaustHeat += (targetHeat - this.exhaustHeat) * Math.min(1, dt * 0.6);
    for (const m of this.exhaustMats) m.mat.emissiveIntensity = Math.pow(this.exhaustHeat, 1.6) * 1.4;
    for (const m of this.catMats) m.mat.emissiveIntensity = Math.pow(this.exhaustHeat, 2) * 0.6;
    // throttle plate angle
    const plate = this.parts.get('throttle')?.obj.getObjectByName('throttlePlate');
    if (plate) plate.rotation.y = (1 - st.load) * 1.2;
  }

  private static readonly DYNAMIC = new Set<PartKey>(['crankshaft', 'rod', 'piston', 'intakeValve', 'exhaustValve', 'intakeCam', 'exhaustCam']);
  private tmp = new THREE.Vector3();

  /** Apply exploded-view and assembly offsets on top of animated positions. */
  private applyOffsets() {
    for (const p of this.parts.values()) {
      const off = (p.obj.userData.explode as THREE.Vector3 | undefined) ?? this.tmp.set(0, 0, 0);
      const drop = (p.obj.userData.assemblyOffset as number | undefined) ?? 0;
      if (!p.obj.userData.basePos) p.obj.userData.basePos = p.obj.position.clone();
      if (!SingleCylinderEngine.DYNAMIC.has(p.key)) p.obj.position.copy(p.obj.userData.basePos as THREE.Vector3);
      p.obj.position.add(off);
      p.obj.position.y += drop * 2.2;
    }
    // springs follow their valves
    const iv = this.parts.get('intakeValve')!;
    const ev = this.parts.get('exhaustValve')!;
    const ivOff = (iv.obj.userData.explode as THREE.Vector3 | undefined) ?? this.tmp.set(0, 0, 0);
    this.ivSpring.position.set(this.xI, 2.72, 0).add(ivOff);
    this.ivSpring.position.y += ((iv.obj.userData.assemblyOffset as number) ?? 0) * 2.2;
    this.ivSpring.visible = iv.obj.visible;
    const evOff = (ev.obj.userData.explode as THREE.Vector3 | undefined) ?? this.tmp.set(0, 0, 0);
    this.evSpring.position.set(this.xE, 2.72, 0).add(evOff);
    this.evSpring.position.y += ((ev.obj.userData.assemblyOffset as number) ?? 0) * 2.2;
    this.evSpring.visible = ev.obj.visible;
  }

  /** Highlight helpers */
  setHighlight(key: PartKey | null, amount = 1) {
    for (const p of this.parts.values()) for (const m of p.mats) m.u.uHighlight.value = p.key === key ? amount : 0;
  }

  setHighlights(keys: PartKey[]) {
    for (const p of this.parts.values()) for (const m of p.mats) m.u.uHighlight.value = keys.includes(p.key) ? 0.9 : 0;
  }

  /** Assembly sequence: show parts up to step k with a drop-in offset t (0..1). */
  setAssembly(visibleKeys: Set<PartKey>, dropping: PartKey | null, t: number) {
    for (const p of this.parts.values()) {
      const vis = visibleKeys.has(p.key);
      p.obj.visible = vis;
      if (!p.obj.userData.assemblyOffset) p.obj.userData.assemblyOffset = 0;
      p.obj.userData.assemblyOffset = p.key === dropping ? (1 - t) : 0;
    }
    this.chamber.points.visible = visibleKeys.has('head');
    this.intakeFlow.points.visible = visibleKeys.has('intake');
    this.exhaustFlow.points.visible = visibleKeys.has('exhaust');
  }

  get explodeAmount() {
    return this.explodeAmt.v;
  }

  /** world-space anchor for labels */
  anchorOf(key: PartKey, out = new THREE.Vector3()) {
    const p = this.parts.get(key);
    if (!p) return out.set(0, 0, 0);
    out.copy(p.anchor);
    const off = p.obj.userData.explode as THREE.Vector3 | undefined;
    if (off) out.add(off);
    return this.group.localToWorld(out);
  }

  pickables(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const p of this.parts.values()) if (p.obj.visible) for (const m of p.pick) if (m.visible) out.push(m);
    return out;
  }

  dispose() {
    this.viewTl?.kill();
    this.chamber?.dispose();
    this.intakeFlow?.dispose();
    this.exhaustFlow?.dispose();
    this.spray?.dispose();
    this.beltTex?.dispose();
  }
}
