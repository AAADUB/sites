import { registerStage, whileVisible, strokeChip } from './shared';
import { captureFreeze } from './shared';
import { createEngineStage, type EngineView } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { DIESEL, wrap720 } from '../physics/kinematics';
import { strokeAt } from '../physics/valves';
import { pressureAt, temperatureAt } from '../physics/cycle';
import { bindEngineControls, bindEngineKeys, setReadout } from '../ui/engineControls';
import { withUnit } from '../physics/units';
import { getLang, t } from '../ui/i18n';
import { registerSound } from '../ui/sound';
import type { ViewMode } from '../engines/singleCylinder';

export function dieselSim() {
  return sharedSim('diesel', () => new EngineSim('diesel', DIESEL, { rpm: 900, load: 0.6, speed: 0.05 }));
}

export async function init(section: HTMLElement) {
  const lang = getLang();
  const sim = dieselSim();
  captureFreeze(sim, 374);
  const stageEl = section.querySelector<HTMLElement>('[data-stage="diesel"]');
  let view: EngineView | null = null;
  let pendingView: ViewMode = 'cutaway';
  let pendingLabels = false;
  registerStage(stageEl, async (st) => {
    view = await createEngineStage(st, { kind: 'diesel', sim, initial: 'cut', view: pendingView, labels: pendingLabels });
    return view;
  });
  stageEl?.setAttribute('tabindex', '0');
  const root = section.querySelector<HTMLElement>('[data-controls="ds"]')!;
  const controls = bindEngineControls(root, 'ds', sim, {
    setView: (v) => {
      pendingView = v as ViewMode;
      view?.setView(v as ViewMode);
    },
    setLabels: (on) => {
      pendingLabels = on;
      view?.setLabels(on);
    },
  });
  controls.setView('cutaway');
  if (stageEl) bindEngineKeys(stageEl, sim, () => controls.syncPlay());
  registerSound(section, { rate: () => (sim.playing ? (sim.rpm / 60 / 2) * sim.speed : 0), timbre: { thump: 52, noise: 0.75, bright: 1400, decay: 0.12 } });

  const ro = section.querySelector<HTMLElement>('[data-readouts="ds"]')!;
  const chip = section.querySelector<HTMLElement>('.stroke-chip');
  whileVisible(section, () => {
    const th = wrap720(sim.theta);
    const tb = sim.table;
    const s = strokeAt(th);
    setReadout(ro, 'angle', withUnit(Math.round(th), 'deg', lang));
    setReadout(ro, 'stroke', `<span class="c-${s}">${t(`ui.strokes.${s}`)}</span>`);
    setReadout(ro, 'pressure', withUnit(pressureAt(tb, th), 'bar', lang, 1));
    setReadout(ro, 'temp', withUnit(Math.max(20, temperatureAt(tb, th) - 273), 'C', lang));
    const since = wrap720(th - tb.ignition);
    setReadout(ro, 'injection', since < 26 ? `<span class="state-on">${t('ui.yes')}</span>` : `${withUnit(Math.round(360 - tb.ignition), 'deg', lang)} <small>${lang === 'ru' ? 'до ВМТ' : 'BTDC'}</small>`);
    strokeChip(chip, th);
  });
}
