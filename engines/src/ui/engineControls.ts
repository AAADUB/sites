import type { EngineSim } from '../engines/sim';
import { bindRange, bindSeg } from './chrome';
import { fmt, withUnit } from '../physics/units';
import { getLang, t } from './i18n';
import { icon } from '../content/icons';
import { reducedMotion } from '../core/settings';

export interface ControlHooks {
  setView?: (v: string) => void;
  setLabels?: (on: boolean) => void;
  /** called when the user takes manual control (e.g. disables scroll-scrub) */
  onManual?: () => void;
}

export interface BoundControls {
  syncPlay(): void;
  setRpmSlider(v: number): void;
  setView(v: string): void;
  setStep(i: number | null): void;
  root: HTMLElement;
}

/** Bind a standard engine control strip (see content/render.ts engineControls()). */
export function bindEngineControls(root: HTMLElement, id: string, sim: EngineSim, hooks: ControlHooks = {}): BoundControls {
  const lang = getLang();
  const playBtn = root.querySelector<HTMLButtonElement>('[data-act="play"]');
  const speedNote = root.querySelector<HTMLElement>('.speed-note');
  const syncPlay = () => {
    if (!playBtn) return;
    playBtn.setAttribute('aria-pressed', String(sim.playing));
    playBtn.innerHTML = `${icon(sim.playing ? 'pause' : 'play')}<span class="btn-label">${t(sim.playing ? 'ui.pause' : 'ui.play')}</span>`;
  };
  playBtn?.addEventListener('click', () => {
    sim.playing = !sim.playing;
    syncPlay();
    hooks.onManual?.();
  });
  if (reducedMotion()) sim.playing = false;
  syncPlay();

  const updateNote = () => {
    if (speedNote) speedNote.hidden = !(sim.speed === 1 && sim.rpm / 60 > 5);
  };
  bindSeg(root, 'speed', (v) => {
    sim.speed = +v;
    updateNote();
  }, String(sim.speed));
  const view = bindSeg(root, 'view', (v) => hooks.setView?.(v));
  root.querySelector<HTMLInputElement>('[data-act="labels"]')?.addEventListener('change', (e) => hooks.setLabels?.((e.target as HTMLInputElement).checked));

  const rpm = bindRange(
    root.querySelector<HTMLInputElement>(`#${id}-rpm`),
    (v) => {
      sim.set({ rpm: v });
      updateNote();
    },
    (v) => withUnit(v, 'rpm', lang),
  );
  rpm.set(sim.rpm);
  bindRange(root.querySelector<HTMLInputElement>(`#${id}-load`), (v) => sim.set({ load: v / 100 }), (v) => `${fmt(v, lang)} %`).set(Math.round(sim.load * 100));
  const crank = bindRange(
    root.querySelector<HTMLInputElement>(`#${id}-crank`),
    (v) => {
      sim.playing = false;
      syncPlay();
      sim.setTheta(v);
      hooks.onManual?.();
    },
    (v) => withUnit(v, 'deg', lang),
  );
  const crankInput = root.querySelector<HTMLInputElement>(`#${id}-crank`);
  if (crankInput) crankInput.max = String(sim.span);
  // keep the scrubber following the engine
  const follow = () => {
    if (crankInput && document.activeElement !== crankInput) crank.set(Math.round(sim.cycleAngle));
    requestAnimationFrame(follow);
  };
  if (crankInput) requestAnimationFrame(follow);

  const stepButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.steps button'));
  const setStep = (i: number | null) => stepButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  for (const b of stepButtons) {
    b.addEventListener('click', () => {
      const i = +b.dataset.step!;
      sim.playing = false;
      syncPlay();
      // middle of the stroke
      sim.setTheta(i * 180 + 90);
      setStep(i);
      hooks.onManual?.();
    });
  }
  return {
    syncPlay,
    setRpmSlider: (v) => rpm.set(v),
    setView: (v) => view.set(v),
    setStep,
    root,
  };
}

/** Keyboard: Space play/pause, ←/→ 1°, Shift+←/→ 10° (when focus is inside `scope`). */
export function bindEngineKeys(scope: HTMLElement, sim: EngineSim, onChange?: () => void) {
  scope.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'range') return;
    if (e.key === ' ' && tag !== 'BUTTON') {
      e.preventDefault();
      sim.playing = !sim.playing;
      onChange?.();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (tag === 'BUTTON' && (e.target as HTMLElement).closest('.seg, [role="tablist"]')) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      sim.playing = false;
      sim.setTheta(sim.theta + (e.key === 'ArrowRight' ? step : -step));
      onChange?.();
    }
  });
}

/** Write a readout value */
export function setReadout(root: ParentNode, key: string, html: string) {
  const dd = root.querySelector(`[data-r="${key}"] dd`);
  if (dd && dd.innerHTML !== html) dd.innerHTML = html;
}
