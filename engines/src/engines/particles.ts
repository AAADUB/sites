import * as THREE from 'three';
import { wrap720 } from '../physics/kinematics';
import { mulberry32 } from './materials';
import { manager } from '../core/renderer';

const spriteFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a, a * vAlpha);
}`;

/* ------------------------------------------------------------------ chamber gas (GPU) */

export interface ChamberInput {
  theta: number;
  crownY: number;
  headY: number;
  temp: number;
  burned: number;
  burnStart: number;
  ignition: number;
  pressure: number;
  plug: THREE.Vector3;
  intakeLift: number;
  exhaustLift: number;
  dt: number;
  visible: number;
  kind: 'petrol' | 'diesel' | 'two-stroke';
  bowl?: boolean;
}

/**
 * Gas inside the combustion chamber. Every particle lives in normalised cylinder
 * coordinates (radius², angle, height) which the vertex shader maps into the current
 * gas volume between piston crown and head — so particles can never leave it.
 * Colour comes from the simulated state: fresh charge (cyan) warms toward amber as it is
 * compressed, the flame front (distance from the spark or the spray tips) turns it
 * white-hot, and it cools to grey exhaust.
 */
export class ChamberParticles {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private time = 0;

  constructor(count: number, radius: number, kind: 'petrol' | 'diesel' | 'two-stroke') {
    const rnd = mulberry32(42);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 3);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCrown: { value: 2 },
        uHead: { value: 2.3 },
        uR: { value: radius },
        uClipZ: { value: 10 },
        uTime: { value: 0 },
        uSwirl: { value: 1 },
        uPlug: { value: new THREE.Vector3() },
        uFlameR: { value: 0 },
        uFresh: { value: 1 },
        uTempN: { value: 0 },
        uHot: { value: 0 },
        uVis: { value: 1 },
        uSize: { value: 26 },
        uPx: { value: 1 },
        uDiesel: { value: kind === 'diesel' ? 1 : 0 },
        uCyan: { value: new THREE.Color('#3fd0ff') },
        uAmber: { value: new THREE.Color('#ff8a1f') },
        uWhite: { value: new THREE.Color('#fff3d6') },
        uGrey: { value: new THREE.Color('#8f8781') },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uCrown, uHead, uR, uClipZ, uTime, uSwirl, uFlameR, uFresh, uTempN, uHot, uVis, uSize, uPx, uDiesel;
        uniform vec3 uPlug, uCyan, uAmber, uWhite, uGrey;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float rho = uR * sqrt(aSeed.x) * (0.96 + 0.04 * sin(uTime * 2.3 + aSeed.w * 40.0));
          float ang = aSeed.y * 6.2831853 + uTime * (0.35 + aSeed.z * 0.6) * uSwirl;
          float h = fract(aSeed.w + 0.035 * sin(uTime * 1.3 + aSeed.x * 31.0));
          float gap = max(0.0, uHead - uCrown);
          float y = uCrown + 0.006 + h * max(0.0, gap - 0.012);
          vec3 p = vec3(rho * cos(ang), y, rho * sin(ang));
          bool fresh = aSeed.z < uFresh;
          float inFlame;
          if (uDiesel > 0.5) {
            // diesel: combustion starts around the spray tips (ring at ~0.6 R) and spreads
            float ring = abs(rho / uR - 0.62);
            inFlame = step(ring, uFlameR / uR);
          } else {
            inFlame = step(distance(p, uPlug), uFlameR);
          }
          vec3 freshCol = mix(uCyan, mix(uCyan, uAmber, 0.85), smoothstep(0.0, 1.0, uTempN));
          vec3 hotCol = mix(uGrey, mix(uAmber, uWhite, smoothstep(0.55, 1.0, uHot)), smoothstep(0.08, 0.5, uHot));
          float burnedP = fresh ? inFlame : 1.0;
          vec3 col = mix(freshCol, hotCol, burnedP);
          float glow = burnedP * (0.6 + 2.6 * uHot);
          vColor = col * (0.75 + glow);
          vAlpha = uVis * mix(0.55 + 0.25 * uTempN, 0.75, burnedP);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPx * (0.6 + 0.8 * aSeed.z) / max(0.1, -mv.z) * (1.0 + 0.35 * burnedP * uHot);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          if (p.z > uClipZ || uVis < 0.01 || gap < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          if (wp.y > 1e6) vAlpha = 0.0;
        }`,
      fragmentShader: spriteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setClip(z: number) {
    this.mat.uniforms.uClipZ.value = z;
  }

  setSize(px: number) {
    this.mat.uniforms.uSize.value = px;
  }

  update(s: ChamberInput) {
    const u = this.mat.uniforms;
    this.time += s.dt;
    u.uTime.value = this.time;
    u.uCrown.value = s.crownY;
    u.uHead.value = s.headY;
    u.uPlug.value.copy(s.plug);
    u.uVis.value = s.visible;
    u.uPx.value = manager.dpr;
    const th = wrap720(s.theta);
    const isTwo = s.kind === 'two-stroke';
    // fresh-charge fraction
    let fresh: number;
    if (isTwo) {
      // 0..360: transfer ports bring fresh charge from ~120° to ~240°
      const t = th % 360;
      if (t < 118) fresh = 1;
      else if (t < 245) fresh = Math.min(1, Math.max(0, (t - 118) / 110));
      else fresh = 1;
    } else {
      if (th < 8) fresh = 0;
      else if (th < 200) fresh = Math.min(1, (th - 8) / 160);
      else if (th < 360 + 180) fresh = 1;
      else fresh = 0;
    }
    // during power/exhaust after combustion everything is burned
    const burnedAll = s.burned > 0.985;
    u.uFresh.value = burnedAll && !(isTwo ? (th % 360) > 118 && (th % 360) < 300 : th < 200) ? 0 : fresh;
    // flame radius grows with burned fraction
    const maxR = 0.9;
    u.uFlameR.value = s.burned > 0.001 ? maxR * Math.cbrt(s.burned) : 0;
    u.uTempN.value = Math.min(1, Math.max(0, (s.temp - 320) / 600)) * (s.burned < 0.02 ? 1 : 0.3);
    u.uHot.value = Math.min(1, Math.max(0, (s.temp - 650) / 1900));
    // swirl/tumble faster during intake
    u.uSwirl.value = isTwo ? 1.2 : th < 225 ? 1.6 : 0.8;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ port flow (CPU) */

interface FlowFrame {
  p: THREE.Vector3;
  n: THREE.Vector3;
  b: THREE.Vector3;
}

/** Gas moving through an intake or exhaust port/manifold, always inside the tube. */
export class FlowParticles {
  points: THREE.Points;
  private t: Float32Array;
  private ox: Float32Array;
  private oy: Float32Array;
  private sp: Float32Array;
  private frames: FlowFrame[] = [];
  private radius: (t: number) => number;
  private mat: THREE.ShaderMaterial;
  private kind: 'intake' | 'exhaust';
  private heat = 0;

  constructor(count: number, curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, kind: 'intake' | 'exhaust') {
    this.kind = kind;
    this.radius = radius;
    const rnd = mulberry32(kind === 'intake' ? 11 : 23);
    this.t = new Float32Array(count);
    this.ox = new Float32Array(count);
    this.oy = new Float32Array(count);
    this.sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.t[i] = rnd();
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * 0.82;
      this.ox[i] = Math.cos(a) * rr;
      this.oy[i] = Math.sin(a) * rr;
      this.sp[i] = 0.7 + rnd() * 0.6;
    }
    const segs = 96;
    const fr = curve.computeFrenetFrames(segs, false);
    for (let i = 0; i <= segs; i++) {
      this.frames.push({ p: curve.getPointAt(i / segs), n: fr.normals[i].clone(), b: fr.binormals[i].clone() });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(this.t, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(kind === 'intake' ? '#3fd0ff' : '#8f8781') },
        uHot: { value: new THREE.Color('#ff8a1f') },
        uHeat: { value: 0 },
        uAlpha: { value: 0.6 },
        uSize: { value: 22 },
        uPx: { value: 1 },
        uClipZ: { value: 10 },
      },
      vertexShader: /* glsl */ `
        attribute float aT;
        uniform vec3 uColor, uHot;
        uniform float uHeat, uAlpha, uSize, uPx, uClipZ;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPx / max(0.1, -mv.z);
          float heatHere = uHeat * (1.0 - aT);
          vColor = mix(uColor, uHot, heatHere) * (0.8 + 1.6 * heatHere);
          vAlpha = uAlpha * smoothstep(0.0, 0.08, aT) * smoothstep(1.0, 0.9, aT);
          if (position.z > uClipZ) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: spriteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setClip(z: number) {
    this.mat.uniforms.uClipZ.value = z;
  }

  /**
   * flow: 0..1 (valve opening), speedScale: crank revolutions per second (visual),
   * temp: in-cylinder temperature (exhaust heat), visible: 0..1
   */
  update(dt: number, flow: number, speedScale: number, temp: number, visible: number, _theta: number) {
    const n = this.t.length;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const segs = this.frames.length - 1;
    const v = Math.max(0, flow) * (0.25 + 0.75 * Math.min(1, speedScale)) * 0.9;
    if (this.kind === 'exhaust') {
      const target = flow > 0.05 ? Math.min(1, Math.max(0, (temp - 500) / 1300)) : 0;
      this.heat += (target - this.heat) * Math.min(1, dt * 6);
    }
    for (let i = 0; i < n; i++) {
      let t = this.t[i] + v * this.sp[i] * dt;
      if (t >= 1) t -= 1;
      this.t[i] = t;
      const f = t * segs;
      const i0 = Math.min(segs - 1, Math.floor(f));
      const w = f - i0;
      const A = this.frames[i0];
      const B = this.frames[i0 + 1];
      const r = this.radius(t);
      const px = A.p.x + (B.p.x - A.p.x) * w;
      const py = A.p.y + (B.p.y - A.p.y) * w;
      const pz = A.p.z + (B.p.z - A.p.z) * w;
      const nx = A.n.x + (B.n.x - A.n.x) * w;
      const ny = A.n.y + (B.n.y - A.n.y) * w;
      const nz = A.n.z + (B.n.z - A.n.z) * w;
      const bx = A.b.x + (B.b.x - A.b.x) * w;
      const by = A.b.y + (B.b.y - A.b.y) * w;
      const bz = A.b.z + (B.b.z - A.b.z) * w;
      arr[i * 3] = px + (nx * this.ox[i] + bx * this.oy[i]) * r;
      arr[i * 3 + 1] = py + (ny * this.ox[i] + by * this.oy[i]) * r;
      arr[i * 3 + 2] = pz + (nz * this.ox[i] + bz * this.oy[i]) * r;
    }
    pos.needsUpdate = true;
    (this.points.geometry.getAttribute('aT') as THREE.BufferAttribute).needsUpdate = true;
    const u = this.mat.uniforms;
    u.uHeat.value = this.heat;
    u.uPx.value = manager.dpr;
    u.uAlpha.value = visible * (0.22 + 0.5 * Math.min(1, flow * 1.4));
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ diesel spray (CPU) */

export class SprayParticles {
  points: THREE.Points;
  private dirs: THREE.Vector3[] = [];
  private seed: Float32Array;
  private nozzle: THREE.Vector3;
  private reach: number;
  private mat: THREE.ShaderMaterial;

  constructor(count: number, nozzle: THREE.Vector3, plumes: number, reach: number) {
    this.nozzle = nozzle.clone();
    this.reach = reach;
    for (let k = 0; k < plumes; k++) {
      const a = (k / plumes) * Math.PI * 2 + 0.3;
      const e = 0.32; // plume angle below horizontal
      this.dirs.push(new THREE.Vector3(Math.cos(a) * Math.cos(e), -Math.sin(e), Math.sin(a) * Math.cos(e)));
    }
    const rnd = mulberry32(5);
    this.seed = new Float32Array(count * 3);
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = rnd();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(count), 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uVis: { value: 0 }, uPx: { value: 1 }, uClipZ: { value: 10 } },
      vertexShader: /* glsl */ `
        attribute float aHeat;
        uniform float uVis, uPx, uClipZ;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 18.0 * uPx / max(0.1, -mv.z);
          vColor = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.55, 0.15) * 2.6, aHeat);
          vAlpha = uVis * 0.8;
          if (position.z > uClipZ || uVis < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: spriteFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setClip(z: number) {
    this.mat.uniforms.uClipZ.value = z;
  }

  /** Injection lasts ~26° from start of injection; ignition ~5° later at the plume tips. */
  update(theta: number, soi: number, crownY: number, visible: number) {
    const since = wrap720(theta - soi);
    const dur = 26;
    const active = since < dur + 6;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const heat = this.points.geometry.getAttribute('aHeat') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const harr = heat.array as Float32Array;
    const n = arr.length / 3;
    const plumes = this.dirs.length;
    const fade = since > dur ? 1 - (since - dur) / 6 : 1;
    for (let i = 0; i < n; i++) {
      const k = i % plumes;
      const d = this.dirs[k];
      const s0 = this.seed[i * 3];
      const s1 = this.seed[i * 3 + 1];
      const s2 = this.seed[i * 3 + 2];
      // penetration grows with time since start of injection
      const pen = Math.min(1, since / 10) * this.reach;
      let dist = s0 * pen;
      const spread = 0.12 * (dist / this.reach);
      let x = this.nozzle.x + d.x * dist + (s1 - 0.5) * spread;
      let y = this.nozzle.y + d.y * dist + (s2 - 0.5) * spread * 0.6;
      let z = this.nozzle.z + d.z * dist + (s2 - 0.5) * spread;
      // stay inside the chamber: above the crown, inside the bore
      const minY = crownY + 0.008;
      if (y < minY) y = minY;
      const rr = Math.hypot(x, z);
      if (rr > this.reach) {
        x *= this.reach / rr;
        z *= this.reach / rr;
        dist = this.reach;
      }
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
      harr[i] = since > 5 ? Math.min(1, Math.max(0, (s0 - 0.55) * 3 + (since - 5) / 12)) : 0;
    }
    pos.needsUpdate = true;
    heat.needsUpdate = true;
    this.mat.uniforms.uVis.value = active ? visible * Math.max(0, fade) : 0;
    this.mat.uniforms.uPx.value = manager.dpr;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
