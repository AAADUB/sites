import * as THREE from 'three';
import { registerStage, whileVisible, captureFreeze } from './shared';
import { createBase } from '../engines/common';
import { WankelEngine, type WKey } from '../engines/wankel';
import { Annotator } from '../engines/annotate';
import { EngineSim, sharedSim } from '../engines/sim';
import { TWO_STROKE } from '../physics/kinematics';
import { bindEngineControls, setReadout } from '../ui/engineControls';
import { fmt } from '../physics/units';
import { getLang } from '../ui/i18n';
import { tierSpec } from '../core/quality';
import { registerSound } from '../ui/sound';
import type { StageScene } from '../core/renderer';

export function wankelSim() {
  // the simulation is only used as a clock here: θ = eccentric-shaft angle
  return sharedSim('wankel', () => new EngineSim('two-stroke', TWO_STROKE, { rpm: 1000, load: 0.5, speed: 0.05 }));
}

export async function init(section: HTMLElement) {
  const lang = getLang();
  const sim = wankelSim();
  captureFreeze(sim, 200);
  const stageEl = section.querySelector<HTMLElement>('[data-stage="wankel"]');
  let annot: Annotator<WKey> | null = null;
  let labels = false;
  registerStage(stageEl, async (stage) => {
    const base = createBase(stage, {
      presets: { face: { pos: [0.9, 1.0, 7.6], target: [0, 0.05, 0], fov: 30 } },
      initial: 'face',
      groundY: -1.75,
      shadowExtent: 3,
      contactScale: 4,
      minDistance: 4,
      maxDistance: 12,
    });
    // let the camera orbit around the face but not behind it
    base.controls.minAzimuthAngle = -1.0;
    base.controls.maxAzimuthAngle = 1.0;
    base.controls.minPolarAngle = 0.6;
    base.controls.maxPolarAngle = 2.0;
    base.ground.visible = false;
    base.contact.visible = false;
    const eng = new WankelEngine(tierSpec().particles);
    base.root.add(eng.group);
    for (const m of eng.pickables()) if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
    annot = new Annotator<WKey>(stage.el, base.camera, eng, ['rotor', 'housing', 'eshaft', 'sparkPlug', 'inPort', 'exPort'], new THREE.Vector3(0, 0, 0));
    annot.labelsOn = labels;
    let frame = 0;
    const view: StageScene = {
      scene: base.scene,
      camera: base.camera,
      update(dt) {
        eng.update(sim.theta, dt);
        base.updateControls(dt);
        if (annot!.labelsOn ? ++frame % 2 === 0 : ++frame % 30 === 0) annot!.update();
      },
      resize(w, h) {
        base.camera.zoom = Math.min(1, Math.pow(w / h / 1.2, 0.9));
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
  const root = section.querySelector<HTMLElement>('[data-controls="wk"]')!;
  bindEngineControls(root, 'wk', sim, {
    setLabels: (on) => {
      labels = on;
      if (annot) annot.labelsOn = on;
    },
  });
  registerSound(section, { rate: () => (sim.playing ? (sim.rpm / 60) * sim.speed : 0), timbre: { thump: 80, noise: 0.6, bright: 1800, decay: 0.07 } });
  const ro = section.querySelector<HTMLElement>('[data-readouts="wk"]')!;
  whileVisible(section, () => {
    const shaft = sim.theta / 360;
    setReadout(ro, 'shaft', fmt(Math.max(0, shaft), lang, 2));
    setReadout(ro, 'rotor', fmt(Math.max(0, shaft / 3), lang, 2));
    setReadout(ro, 'ratio', '3 : 1');
  });
}
