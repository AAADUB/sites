import { onSettings, settings } from './settings';

export type Tier = 'high' | 'medium' | 'low';

export interface TierSpec {
  dprCap: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  smaa: boolean;
  particles: number;
  segments: number; // geometric detail multiplier for lathe/extrude
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dprCap: 2, shadows: true, shadowSize: 2048, bloom: true, smaa: true, particles: 1800, segments: 1 },
  medium: { dprCap: 1.5, shadows: true, shadowSize: 1024, bloom: true, smaa: true, particles: 1000, segments: 0.75 },
  low: { dprCap: 1, shadows: false, shadowSize: 512, bloom: false, smaa: false, particles: 450, segments: 0.5 },
};

let gpuName = '';

export function setGpuName(name: string) {
  gpuName = name.toLowerCase();
}

/** Device heuristics for the initial automatic tier. */
export function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 8;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 500;
  const weakGpu = /(swiftshader|llvmpipe|software|mali-[gt]?[0-7]\d|adreno \(tm\) [1-5]\d\d|powervr|intel\(r\) hd graphics [2-5]\d\d)/.test(gpuName);
  if (weakGpu || mem <= 2 || cores <= 2) return 'low';
  if (coarse || small || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

type Listener = (t: Tier) => void;
const listeners = new Set<Listener>();
let autoTier: Tier = 'high';
let current: Tier = 'high';

export function initQuality(gpu: string) {
  setGpuName(gpu);
  autoTier = detectTier();
  current = settings.quality === 'auto' ? autoTier : settings.quality;
  document.documentElement.dataset.quality = current;
  onSettings((s, k) => {
    if (k !== 'quality') return;
    setTier(s.quality === 'auto' ? autoTier : s.quality);
  });
}

export const tier = () => current;
export const tierSpec = () => TIERS[current];

function setTier(t: Tier) {
  if (t === current) return;
  current = t;
  document.documentElement.dataset.quality = t;
  listeners.forEach((l) => l(t));
}

export function onTier(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---- live FPS monitor: downgrade if < 50 fps for 3 s, upgrade cautiously ---- */
let acc = 0;
let frames = 0;
let lowFor = 0;
let highFor = 0;
let ceiling: Tier = 'high';
const order: Tier[] = ['low', 'medium', 'high'];

/** Call once per rendered frame with the frame delta (s). Only active in auto mode. */
export function sampleFps(dt: number) {
  if (settings.quality !== 'auto') return;
  acc += dt;
  frames++;
  if (acc < 0.5) return;
  const fps = frames / acc;
  const window = acc;
  acc = 0;
  frames = 0;
  if (fps < 50) {
    lowFor += window;
    highFor = 0;
  } else {
    lowFor = 0;
    if (fps > 58) highFor += window;
  }
  const idx = order.indexOf(current);
  if (lowFor >= 3 && idx > 0) {
    lowFor = 0;
    ceiling = order[idx - 1];
    autoTier = ceiling;
    setTier(ceiling);
  } else if (highFor >= 25 && idx < order.indexOf(detectTier()) && idx < 2) {
    // cautious upgrade: only back toward the device's initial tier, after a long stable period
    highFor = 0;
    autoTier = order[idx + 1];
    setTier(autoTier);
  }
}

/** Forget accumulated samples (e.g. after a scene switch, when frames are naturally slower). */
export function resetFps() {
  acc = 0;
  frames = 0;
  lowFor = 0;
  highFor = 0;
}
