import * as THREE from 'three';

/** Procedural micro-variation texture (value noise), shared by all metal materials. */
let noiseTex: THREE.DataTexture | null = null;
export function microNoise(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // layered value noise with a fine brushed component
  const rnd = mulberry32(7);
  const grid = (n: number) => {
    const g = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return { n, g };
  };
  const layers = [grid(8), grid(32), grid(96)];
  const sample = (L: { n: number; g: Float32Array }, u: number, v: number) => {
    const x = u * L.n;
    const y = v * L.n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const idx = (a: number, b: number) => (b % L.n) * (L.n + 1) + (a % L.n);
    const a = L.g[idx(x0, y0)];
    const b = L.g[idx(x0 + 1, y0)];
    const c = L.g[idx(x0, y0 + 1)];
    const d = L.g[idx(x0 + 1, y0 + 1)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = 0.5 * sample(layers[0], u, v) + 0.3 * sample(layers[1], u, v) + 0.2 * sample(layers[2], u, v);
      const brushed = 0.5 + 0.5 * Math.sin(v * 900 + n * 6);
      const val = Math.round(255 * (0.78 * n + 0.22 * brushed));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  noiseTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HighlightUniforms {
  uHighlight: { value: number };
  uXray: { value: number };
  uCutHatch: { value: number };
  uHatchColor: { value: THREE.Color };
}

/**
 * Patch a physical material with:
 *  - an amber fresnel rim used for hover/selection highlight (uHighlight)
 *  - an X-ray mode: fresnel-weighted translucency (uXray)
 *  - technical-drawing hatching on faces whose object-space normal points along +Z (cut faces)
 */
export function patchMaterial(m: THREE.MeshPhysicalMaterial, opts: { hatch?: boolean } = {}): HighlightUniforms {
  const u: HighlightUniforms = {
    uHighlight: { value: 0 },
    uXray: { value: 0 },
    uCutHatch: { value: opts.hatch ? 1 : 0 },
    uHatchColor: { value: new THREE.Color('#ffb347') },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjNormal;\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjNormal = normal;\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uHighlight;
uniform float uXray;
uniform float uCutHatch;
uniform vec3 uHatchColor;
varying vec3 vObjNormal;
varying vec3 vObjPos;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
{
  vec3 V = normalize(vViewPosition);
  float fres = pow(1.0 - abs(dot(normalize(vNormal), V)), 2.2);
  gl_FragColor.rgb += vec3(1.0, 0.56, 0.16) * fres * uHighlight * 1.4 + vec3(1.0, 0.56, 0.16) * 0.08 * uHighlight;
  if (uCutHatch > 0.5 && vObjNormal.z > 0.92) {
    float h = fract((vObjPos.x + vObjPos.y) * 26.0);
    float aa = fwidth((vObjPos.x + vObjPos.y) * 26.0) * 1.2;
    float line = smoothstep(0.0, aa, h) * (1.0 - smoothstep(0.1, 0.1 + aa, h));
    vec3 base = vec3(0.075, 0.08, 0.09);
    gl_FragColor.rgb = mix(base, uHatchColor * 0.32, line * 0.85);
  }
  if (uXray > 0.001) {
    float edge = clamp(0.06 + fres * 1.6, 0.0, 1.0);
    vec3 xc = mix(vec3(0.25, 0.75, 1.0) * 0.25, vec3(0.55, 0.85, 1.0), fres);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, xc, uXray);
    gl_FragColor.a = mix(gl_FragColor.a, edge * 0.9, uXray);
  }
}`,
      );
  };
  m.customProgramCacheKey = () => 'ic-patched-' + (opts.hatch ? 'h' : 'n');
  return u;
}

export type MatKind =
  | 'iron'
  | 'aluminium'
  | 'steel'
  | 'polished'
  | 'chrome'
  | 'ceramic'
  | 'copper'
  | 'polymer'
  | 'rubber'
  | 'brass'
  | 'darksteel'
  | 'glass';

const presets: Record<MatKind, THREE.MeshPhysicalMaterialParameters> = {
  iron: { color: '#3b3f45', metalness: 0.55, roughness: 0.72 },
  aluminium: { color: '#b9bec5', metalness: 1, roughness: 0.38 },
  steel: { color: '#a4a9b0', metalness: 1, roughness: 0.3 },
  polished: { color: '#d5d8dd', metalness: 1, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.08 },
  chrome: { color: '#e9ecf0', metalness: 1, roughness: 0.08 },
  ceramic: { color: '#eeece6', metalness: 0, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.2 },
  copper: { color: '#c77d4f', metalness: 1, roughness: 0.32 },
  polymer: { color: '#1b1d21', metalness: 0, roughness: 0.62 },
  rubber: { color: '#111214', metalness: 0, roughness: 0.85 },
  brass: { color: '#c8a85a', metalness: 1, roughness: 0.3 },
  darksteel: { color: '#5a5f66', metalness: 1, roughness: 0.42 },
  glass: { color: '#9fb6c8', metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.25 },
};

export interface PartMaterial {
  mat: THREE.MeshPhysicalMaterial;
  u: HighlightUniforms;
}

/** Create a fresh (per-part) material so parts can be highlighted individually. */
export function makeMaterial(kind: MatKind, opts: { hatch?: boolean; color?: string; side?: THREE.Side; repeat?: number } = {}): PartMaterial {
  const p = { ...presets[kind] };
  if (opts.color) p.color = opts.color;
  const mat = new THREE.MeshPhysicalMaterial(p);
  if (kind !== 'glass' && kind !== 'ceramic' && kind !== 'polymer' && kind !== 'rubber') {
    const tex = microNoise();
    mat.roughnessMap = tex;
    mat.bumpMap = tex;
    mat.bumpScale = kind === 'iron' ? 0.9 : 0.25;
  }
  if (opts.side !== undefined) mat.side = opts.side;
  mat.envMapIntensity = kind === 'iron' ? 0.7 : 1.0;
  const u = patchMaterial(mat, { hatch: opts.hatch });
  return { mat, u };
}

/** Make a mesh's material translucent for the X-ray view (0..1). */
export function setXray(pm: PartMaterial, amount: number) {
  pm.u.uXray.value = amount;
  const on = amount > 0.001;
  if (pm.mat.transparent !== on) {
    pm.mat.transparent = on;
    pm.mat.depthWrite = !on;
    pm.mat.needsUpdate = true;
  }
}
