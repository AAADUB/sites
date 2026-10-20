import * as THREE from 'three';
import { registerStage, whileVisible, captureFreeze } from './shared';
import { createBase } from '../engines/common';
import { TwoStrokeEngine, PORTS, type TwoKey } from '../engines/twoStroke';
import { Annotator } from '../engines/annotate';
import { EngineSim, sharedSim } from '../engines/sim';
import { TWO_STROKE, wrap360 } from '../physics/kinematics';
import { pressureAt } from '../physics/cycle';
import { bindEngineControls, bindEngineKeys, setReadout } from '../ui/engineControls';
import { withUnit } from '../physics/units';
import { getLang, t } from '../ui/i18n';
import { tierSpec } from '../core/quality';
import { registerSound } from '../ui/sound';
import { STROKE_COLORS } from '../core/tokens';
import type { StageScene } from '../core/renderer';

export function twoSim() {
  return sharedSim('two', () => new EngineSim('two-stroke', TWO_STROKE, { rpm: 2500, load: 0.6, speed: 0.05 }));
}

export async function init(section: HTMLElement) {
  const lang = getLang();
  const sim = twoSim();
  captureFreeze(sim, 140);
  const stageEl = section.querySelector<HTMLElement>('[data-stage="twoStroke"]');
  let annot: Annotator<TwoKey> | null = null;
  let labels = false;

  registerStage(stageEl, async (stage) => {
    const base = createBase(stage, {
      presets: {
        cut: { pos: [1.4, 1.9, 8.6], target: [0.35, 1.0, 0], fov: 30 },
        port: { pos: [1.6, 1.9, 4.6], target: [0.3, 1.55, 0], fov: 28 },
      },
      initial: 'cut',
      groundY: -0.92,
      shadowExtent: 3,
      contactScale: 3.4,
    });
    const eng = new TwoStrokeEngine(TWO_STROKE, tierSpec().particles);
    await eng.ready;
    base.root.add(eng.group);
    for (const m of eng.pickables()) if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
    annot = new Annotator<TwoKey>(stage.el, base.camera, eng, ['block', 'head', 'crankcase', 'crankshaft', 'rod', 'piston', 'sparkPlug', 'exPort', 'transfer', 'inPort', 'exhaust'], new THREE.Vector3(0.3, 1.1, 0));
    annot.labelsOn = labels;
    let frame = 0;
    const view: StageScene = {
      scene: base.scene,
      camera: base.camera,
      update(dt) {
        const st = eng.update(sim.theta, sim.rpm, sim.load, sim.table, dt);
        last = st;
        base.updateControls(dt);
        if (annot!.labelsOn ? ++frame % 2 === 0 : ++frame % 30 === 0) annot!.update();
      },
      resize(w, h) {
        base.camera.zoom = Math.min(1, Math.pow(w / h / 1.3, 0.85));
        base.camera.updateProjectionMatrix();
      },
      onTier: () => base.applyShadowQuality(),
      deactivate: () => annot?.clearSelection(),
      dispose() {
        annot?.dispose();
        eng.dispose();
        base.dispose();
      },
    };
    return view;
  });
  stageEl?.setAttribute('tabindex', '0');

  let last = { exOpen: 0, trOpen: 0, rising: false };
  const root = section.querySelector<HTMLElement>('[data-controls="ts"]')!;
  const controls = bindEngineControls(root, 'ts', sim, {
    setLabels: (on) => {
      labels = on;
      if (annot) annot.labelsOn = on;
    },
  });
  if (stageEl) bindEngineKeys(stageEl, sim, () => controls.syncPlay());
  registerSound(section, { rate: () => (sim.playing ? (sim.rpm / 60) * sim.speed : 0), timbre: { thump: 95, noise: 0.85, bright: 2600, decay: 0.06 } });

  const ro = section.querySelector<HTMLElement>('[data-readouts="ts"]')!;
  const chip = section.querySelector<HTMLElement>('.port-chip');
  whileVisible(section, () => {
    const th = wrap360(sim.theta);
    setReadout(ro, 'angle', withUnit(Math.round(th), 'deg', lang));
    // above the piston: compression on the way up, power on the way down; ports open around BDC
    let phase: 'compression' | 'power' | 'exhaust' | 'intake';
    if (th < PORTS.exhaustOpen) phase = 'power';
    else if (th < PORTS.transferOpen) phase = 'exhaust';
    else if (th < 360 - PORTS.transferOpen) phase = 'intake';
    else if (th < 360 - PORTS.exhaustOpen) phase = 'exhaust';
    else phase = 'compression';
    const label = phase === 'intake' ? (lang === 'ru' ? 'Продувка' : 'Scavenging') : t(`ui.strokes.${phase}`);
    setReadout(ro, 'phase', `<span class="c-${phase}">${label}</span>`);
    setReadout(ro, 'pressure', withUnit(pressureAt(sim.table, th), 'bar', lang, 1));
    const ex = last.exOpen > 0.01;
    const tr = last.trOpen > 0.01;
    const exL = lang === 'ru' ? 'вып' : 'ex';
    const trL = lang === 'ru' ? 'прод' : 'tr';
    setReadout(ro, 'ports', `<span class="${ex ? 'state-on' : ''}">${exL}\u2009${ex ? '●' : '○'}</span> <span class="${tr ? 'state-on' : ''}">${trL}\u2009${tr ? '●' : '○'}</span>`);
    if (chip && chip.dataset.s !== phase) {
      chip.dataset.s = phase;
      const name = chip.querySelector('.stroke-name');
      if (name) name.textContent = label;
      chip.style.color = STROKE_COLORS[phase];
    }
  });
}
