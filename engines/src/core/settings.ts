/** Small reactive settings store, persisted in localStorage when available. */
export type QualityPref = 'auto' | 'high' | 'medium' | 'low';
export type MotionPref = 'system' | 'reduced' | 'full';
export type PowerUnit = 'kw' | 'hp';

export interface Settings {
  quality: QualityPref;
  motion: MotionPref;
  power: PowerUnit;
  sound: boolean;
}

const KEY = 'ic-settings-v1';
const defaults: Settings = { quality: 'auto', motion: 'system', power: 'kw', sound: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // sound always starts off on a new visit
    return { ...defaults, ...parsed, sound: false };
  } catch {
    return { ...defaults };
  }
}

const state: Settings = load();
type Listener = (s: Settings, changed: keyof Settings) => void;
const listeners = new Set<Listener>();

export const settings: Readonly<Settings> = state;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  if (state[key] === value) return;
  state[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify({ quality: state.quality, motion: state.motion, power: state.power }));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l(state, key));
}

export function onSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function reducedMotion(): boolean {
  if (state.motion === 'reduced') return true;
  if (state.motion === 'full') return false;
  return !!mq?.matches;
}

mq?.addEventListener?.('change', () => listeners.forEach((l) => l(state, 'motion')));

export function applyMotionAttr() {
  document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
}

/** Build-time capture mode (posters / OG images): ?capture=<stage id | og> */
const captureParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('capture') : null;
export const captureMode = (): string | null => captureParam;
