import * as THREE from 'three';
import { registerStage, captureFreeze } from './shared';
import { createEngineStage } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL } from '../physics/kinematics';
import { reducedMotion } from '../core/settings';
import { registerSound } from '../ui/sound';

export async function init(section: HTMLElement) {
  const el = section.querySelector<HTMLElement>('[data-stage="hero"]');
  const sim = sharedSim('hero', () => new EngineSim('otto', PETROL, { rpm: 850, load: 0.2, speed: 0.07 }));
  sim.theta = 300;
  if (reducedMotion()) {
    sim.playing = false;
    sim.theta = 372; // a frame just after ignition, so the glow is visible
  }
  captureFreeze(sim, 374);
  registerSound(section, { rate: () => (sim.playing ? (sim.rpm / 60 / 2) * sim.speed : 0), timbre: { thump: 62, decay: 0.16 } });

  const heroDist = 12.2;
  const captureFreezeActive = new URLSearchParams(location.search).has('capture');
  registerStage(el, async (stage) => {
    let t = 0;
    const view = await createEngineStage(stage, {
      kind: 'petrol',
      sim,
      initial: 'hero',
      autoRotate: false,
      rotate: false,
      picking: false,
      view: 'cutaway',
      glow: 1.2,
      bloom: 1.1,
      onFrame: (dt) => {
        if (!reducedMotion() && !captureFreezeActive) t += dt;
        // slow, calm sway around a three-quarter view (always showing the cut face)
        const az = 0.42 + 0.32 * Math.sin(t * 0.11);
        const r = heroDist;
        const cam = view.base.camera;
        const target = view.base.controls.target;
        cam.position.set(target.x + Math.sin(az) * r, target.y + 1.5 + 0.3 * Math.sin(t * 0.07), target.z + Math.cos(az) * r);
        cam.lookAt(target);
      },
    });
    const place = () => {
      const r = stage.el.getBoundingClientRect();
      const aspect = r.width / Math.max(1, r.height);
      const target = view.base.controls.target;
      const halfH = Math.tan((view.base.camera.fov * Math.PI) / 360) * heroDist;
      if (aspect > 1.15) {
        // engine sits in the right part of the frame, copy on the left
        target.set(-0.34 * halfH * Math.min(aspect, 2.4), 1.45, 0);
      } else {
        // portrait: engine in the upper part, copy over the lower part
        target.set(0, 1.45 - halfH * 0.38, 0);
      }
      view.base.camera.lookAt(target);
    };
    place();
    const baseResize = view.resize;
    view.resize = (w, h) => {
      baseResize?.(w, h);
      place();
      view.base.camera.zoom = w / h < 1 ? Math.max(0.55, (w / h) * 0.9) : 1;
      view.base.camera.updateProjectionMatrix();
    };
    view.base.camera.position.set(4.8, 2.9, 7.2);
    view.base.camera.lookAt(view.base.controls.target);
    void THREE;
    return view;
  });
}
