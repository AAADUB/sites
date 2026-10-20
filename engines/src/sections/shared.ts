import { manager, Stage, type StageFactory } from '../core/renderer';
import { webglSupported } from '../core/support';
import { onTick } from '../core/clock';
import { t } from '../ui/i18n';
import { STROKE_COLORS } from '../core/tokens';
import { strokeAt, type StrokeName } from '../physics/valves';

/** Register a 3D stage (or show the fallback still when WebGL is unavailable). */
export function registerStage(el: HTMLElement | null, factory: StageFactory): Stage | null {
  if (!el) return null;
  if (!webglSupported()) {
    if (!el.querySelector('.stage-fallback-note')) {
      const note = document.createElement('p');
      note.className = 'stage-fallback-note';
      note.textContent = t('ui.webglOff');
      el.appendChild(note);
    }
    el.classList.add('no-rotate');
    return null;
  }
  const stage = new Stage(el, factory);
  manager.register(stage);
  if (!matchMedia('(pointer: fine)').matches) el.dataset.hint = t('ui.tapToExplore');
  return stage;
}

/** Run fn every frame while el is near the viewport. */
export function whileVisible(el: Element, fn: (dt: number) => void, margin = '20%') {
  let vis = false;
  const io = new IntersectionObserver((e) => (vis = e[0].isIntersecting), { rootMargin: margin });
  io.observe(el);
  const un = onTick((dt) => vis && fn(dt), 60);
  return () => {
    io.disconnect();
    un();
  };
}

export function strokeChip(chip: HTMLElement | null, theta: number) {
  if (!chip) return;
  const s: StrokeName = strokeAt(theta);
  const name = chip.querySelector('.stroke-name');
  if (chip.dataset.s !== s) {
    chip.dataset.s = s;
    chip.style.color = STROKE_COLORS[s];
    if (name) name.textContent = t(`ui.strokes.${s}`);
  }
}

import { captureMode } from '../core/settings';
import type { EngineSim } from '../engines/sim';

/** In capture mode, hold the engine at a representative crank angle. */
export function captureFreeze(sim: EngineSim, theta: number) {
  if (!captureMode()) return false;
  sim.playing = false;
  sim.setTheta(theta);
  return true;
}
