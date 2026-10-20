import { ScrollTrigger } from '../ui/scroll';
import { registerStage, whileVisible, strokeChip } from './shared';
import { captureFreeze } from './shared';
import { createEngineStage, type EngineView } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL, pistonDrop, wrap720 } from '../physics/kinematics';
import { valveLift, strokeAt } from '../physics/valves';
import { pressureAt } from '../physics/cycle';
import { bindEngineControls, bindEngineKeys, setReadout } from '../ui/engineControls';
import { PVChart } from '../ui/pv';
import { fmt, withUnit } from '../physics/units';
import { getLang, t } from '../ui/i18n';
import { reducedMotion } from '../core/settings';
import { registerSound } from '../ui/sound';
import type { ViewMode } from '../engines/singleCylinder';

export function petrolSim() {
  return sharedSim('petrol', () => new EngineSim('otto', PETROL, { rpm: 1500, load: 0.5, speed: 0.05 }));
}

export async function init(section: HTMLElement) {
  const lang = getLang();
  const sim = petrolSim();
  captureFreeze(sim, 372);
  const stageEl = section.querySelector<HTMLElement>('[data-stage="fourStroke"]');
  let view: EngineView | null = null;
  let pendingView: ViewMode = 'cutaway';
  let pendingLabels = false;

  const stage = registerStage(stageEl, async (st) => {
    const v = await createEngineStage(st, { kind: 'petrol', sim, initial: 'cut', view: pendingView, labels: pendingLabels });
    view = v;
    return v;
  });
  void stage;
  stageEl?.setAttribute('tabindex', '0');

  const controlsRoot = section.querySelector<HTMLElement>('[data-controls="fs"]')!;
  let manual = false;
  const controls = bindEngineControls(controlsRoot, 'fs', sim, {
    setView: (v) => {
      pendingView = v as ViewMode;
      view?.setView(v as ViewMode);
      if (v === 'exploded') {
        const box = controlsRoot.querySelector<HTMLInputElement>('[data-act="labels"]');
        if (box) box.checked = true;
      }
    },
    setLabels: (on) => {
      pendingLabels = on;
      view?.setLabels(on);
    },
    onManual: () => (manual = true),
  });
  controls.setView('cutaway');
  if (stageEl) bindEngineKeys(stageEl, sim, () => controls.syncPlay());
  bindEngineKeys(controlsRoot, sim, () => controls.syncPlay());

  // P–V mini chart
  const pvEl = section.querySelector<HTMLElement>('[data-pv="fs"]');
  if (pvEl) new PVChart(pvEl, sim, { overlays: false, compact: true });

  registerSound(section, { rate: () => (sim.playing ? (sim.rpm / 60 / 2) * sim.speed : 0), timbre: { thump: 68 } });

  // readouts
  const ro = section.querySelector<HTMLElement>('[data-readouts="fs"]')!;
  const chip = section.querySelector<HTMLElement>('.stroke-chip');
  const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-stroke-card]'));
  whileVisible(section, () => {
    const th = wrap720(sim.theta);
    const tb = sim.table;
    const s = strokeAt(th);
    setReadout(ro, 'angle', withUnit(Math.round(th), 'deg', lang));
    setReadout(ro, 'stroke', `<span class="c-${s}">${t(`ui.strokes.${s}`)}</span>`);
    setReadout(ro, 'piston', `${fmt(pistonDrop(sim.geom, th), lang, 1)} <small>${lang === 'ru' ? 'мм' : 'mm'}</small>`);
    setReadout(ro, 'pressure', withUnit(pressureAt(tb, th), 'bar', lang, 1));
    const iv = valveLift(sim.timing.intake, th) > 0.05;
    const ev = valveLift(sim.timing.exhaust, th) > 0.05;
    setReadout(
      ro,
      'valves',
      `<span class="${iv ? 'state-on' : ''}">${lang === 'ru' ? 'вп' : 'in'} ${iv ? '●' : '○'}</span> <span class="${ev ? 'state-on' : ''}">${lang === 'ru' ? 'вып' : 'ex'} ${ev ? '●' : '○'}</span>`,
    );
    const since = wrap720(th - tb.ignition);
    setReadout(ro, 'spark', since < 8 ? `<span class="state-on">${t('ui.yes')}</span>` : `${withUnit(Math.round(360 - tb.ignition), 'deg', lang)} <small>${lang === 'ru' ? 'до ВМТ' : 'BTDC'}</small>`);
    strokeChip(chip, th);
    const idx = ['intake', 'compression', 'power', 'exhaust'].indexOf(s);
    cards.forEach((c, i) => c.classList.toggle('is-current', i === idx));
    controls.setStep(sim.playing ? null : idx);
  });

  // scroll-scrubbed walkthrough through the four stroke cards
  const list = section.querySelector<HTMLElement>('.stroke-cards');
  if (list && !reducedMotion()) {
    let wasPlaying = sim.playing;
    ScrollTrigger.create({
      trigger: list,
      start: 'top 65%',
      end: 'bottom 45%',
      onEnter: () => {
        if (manual) return;
        wasPlaying = sim.playing;
        sim.playing = false;
        controls.syncPlay();
      },
      onEnterBack: () => {
        if (manual) return;
        wasPlaying = sim.playing;
        sim.playing = false;
        controls.syncPlay();
      },
      onLeave: () => {
        if (manual) return;
        sim.playing = wasPlaying || true;
        controls.syncPlay();
      },
      onLeaveBack: () => {
        if (manual) return;
        sim.playing = true;
        controls.syncPlay();
      },
      onUpdate: (self) => {
        if (manual || reducedMotion()) return;
        sim.setTheta(self.progress * 719.9);
      },
    });
    // once the reader has left the section, the scroll walkthrough takes over again next time
    ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      onLeave: () => (manual = false),
      onLeaveBack: () => (manual = false),
    });
  }
}
