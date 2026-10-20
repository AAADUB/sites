import { settings, setSetting, onSettings } from '../core/settings';
import { icon } from '../content/icons';
import { t } from './i18n';

/**
 * Procedural engine sound (WebAudio, no audio files). Each firing is a short pulse:
 * a low "thump" plus filtered noise. The pulse rate follows the visible engine:
 * pulses per second = rpm / 60 × firings per revolution × slow-motion factor.
 */
export interface Timbre {
  thump: number; // Hz of the low body
  noise: number; // 0..1 amount of noise
  bright: number; // lowpass cutoff Hz
  decay: number; // seconds
  gain: number;
}

export interface SoundSource {
  /** firing pulses per second */
  rate(): number;
  /** relative amplitudes, cycled (uneven firing / burble) */
  pattern?: number[];
  timbre?: Partial<Timbre>;
}

const DEFAULT: Timbre = { thump: 70, noise: 0.5, bright: 900, decay: 0.09, gain: 0.5 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let timer = 0;
let nextTime = 0;
let pulseIdx = 0;
const sources = new Map<HTMLElement, SoundSource>();
let override: SoundSource | null = null;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function activeSource(): SoundSource | null {
  if (override) return override;
  let best: SoundSource | null = null;
  let bestD = Infinity;
  const mid = innerHeight / 2;
  for (const [el, src] of sources) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d < bestD) {
      bestD = d;
      best = src;
    }
  }
  return best;
}

function pulse(at: number, amp: number, tb: Timbre) {
  if (!ctx || !master || !noiseBuf) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(amp * tb.gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, at + tb.decay);
  g.connect(master);
  // body
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(tb.thump * 1.8, at);
  o.frequency.exponentialRampToValueAtTime(tb.thump, at + tb.decay * 0.6);
  o.connect(g);
  o.start(at);
  o.stop(at + tb.decay + 0.02);
  // noise
  if (tb.noise > 0) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tb.bright;
    const ng = ctx.createGain();
    ng.gain.value = tb.noise;
    n.connect(f).connect(ng).connect(g);
    n.start(at, Math.random() * 0.1);
    n.stop(at + tb.decay + 0.02);
  }
}

function schedule() {
  if (!ctx) return;
  const src = activeSource();
  const now = ctx.currentTime;
  const target = src ? 0.9 : 0;
  master!.gain.setTargetAtTime(target, now, 0.15);
  if (!src) {
    nextTime = now + 0.05;
    return;
  }
  const rate = Math.min(180, Math.max(0, src.rate()));
  if (rate < 0.05) {
    nextTime = now + 0.05;
    return;
  }
  const tb = { ...DEFAULT, ...src.timbre };
  if (nextTime < now) nextTime = now + 0.01;
  const horizon = now + 0.12;
  const pat = src.pattern ?? [1];
  let guard = 0;
  while (nextTime < horizon && guard++ < 64) {
    const amp = pat[pulseIdx % pat.length];
    pulseIdx++;
    pulse(nextTime, amp * (rate > 60 ? 0.6 : 1), { ...tb, decay: Math.min(tb.decay, 1.6 / rate) });
    nextTime += 1 / rate;
  }
}

function setEnabled(on: boolean) {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="sound"]');
  const box = document.querySelector<HTMLInputElement>('[data-act="sound-toggle"]');
  if (btn) {
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = icon(on ? 'sound' : 'mute');
    btn.title = on ? t('ui.soundOn') : t('ui.soundOff');
  }
  if (box) box.checked = on;
  if (on) {
    ensureCtx();
    void ctx!.resume();
    if (!timer) timer = window.setInterval(schedule, 30);
  } else {
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
    if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
}

export function initSound() {
  document.querySelector('[data-act="sound"]')?.addEventListener('click', () => setSetting('sound', !settings.sound));
  document.querySelector('[data-act="sound-toggle"]')?.addEventListener('change', (e) => setSetting('sound', (e.target as HTMLInputElement).checked));
  onSettings((s, k) => {
    if (k === 'sound') setEnabled(s.sound);
  });
}

/** Attach a sound source to a section element (the one closest to the screen centre plays). */
export function registerSound(el: HTMLElement, src: SoundSource) {
  sources.set(el, src);
  return () => sources.delete(el);
}

/** Temporarily force a source (used by the guessing game). */
export function setOverride(src: SoundSource | null) {
  override = src;
  pulseIdx = 0;
}

export const soundOn = () => settings.sound;
