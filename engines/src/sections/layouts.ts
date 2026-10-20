import * as THREE from 'three';
import { registerStage, whileVisible, captureFreeze } from './shared';
import { createBase } from '../engines/common';
import { MultiCylinderRig } from '../engines/multiCyl';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL } from '../physics/kinematics';
import { LAYOUTS, shakingForces, peakShaking, type LayoutId } from '../physics/firing';
import { bindSeg } from '../ui/chrome';
import { t } from '../ui/i18n';
import { registerSound } from '../ui/sound';
import { reducedMotion } from '../core/settings';
import type { StageScene } from '../core/renderer';

const NS = 'http://www.w3.org/2000/svg';

export async function init(section: HTMLElement) {
  const sim = sharedSim('layouts', () => new EngineSim('otto', PETROL, { rpm: 900, load: 0.3, speed: 0.06 }));
  captureFreeze(sim, 40);
  if (reducedMotion()) sim.playing = false;
  let layout: LayoutId = 'i4';
  let rig: MultiCylinderRig | null = null;
  const stageEl = section.querySelector<HTMLElement>('[data-stage="layouts"]');
  registerStage(stageEl, async (stage) => {
    const base = createBase(stage, {
      presets: { q: { pos: [5.6, 4.2, 6.6], target: [0, 0.9, 0], fov: 30 } },
      initial: 'q',
      groundY: -0.6,
      shadowExtent: 3.5,
      contactScale: 5,
    });
    rig = new MultiCylinderRig();
    rig.apply(LAYOUTS[layout], false);
    base.root.add(rig.group);
    base.setAutoRotate(false);
    const view: StageScene = {
      scene: base.scene,
      camera: base.camera,
      update(dt) {
        rig!.update(sim.theta);
        base.updateControls(dt);
      },
      resize(w, h) {
        base.camera.zoom = Math.min(1, Math.pow(w / h / 1.3, 0.85));
        base.camera.updateProjectionMatrix();
      },
      onTier: () => base.applyShadowQuality(),
      dispose() {
        rig?.dispose();
        base.dispose();
      },
    };
    void THREE;
    return view;
  });

  /* firing-order dial */
  const fig = section.querySelector<HTMLElement>('[data-firing-dial]')!;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-60 -60 120 120');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('role', 'img');
  fig.prepend(svg);
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('r', '44');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'rgba(255,255,255,0.14)');
  svg.appendChild(ring);
  const nodes = document.createElementNS(NS, 'g');
  svg.appendChild(nodes);
  const pointer = document.createElementNS(NS, 'line');
  pointer.setAttribute('x1', '0');
  pointer.setAttribute('y1', '0');
  pointer.setAttribute('x2', '0');
  pointer.setAttribute('y2', '-38');
  pointer.setAttribute('stroke', '#ff8a1f');
  pointer.setAttribute('stroke-width', '2');
  pointer.setAttribute('stroke-linecap', 'round');
  svg.appendChild(pointer);
  const hub = document.createElementNS(NS, 'circle');
  hub.setAttribute('r', '3.5');
  hub.setAttribute('fill', '#ff8a1f');
  svg.appendChild(hub);
  const fo = section.querySelector<HTMLElement>('.fo')!;
  let circles: SVGCircleElement[] = [];
  const buildDial = () => {
    const l = LAYOUTS[layout];
    nodes.replaceChildren();
    circles = [];
    l.firingOrder.forEach((num, i) => {
      const a = (i / l.firingOrder.length) * Math.PI * 2;
      const x = Math.sin(a) * 44;
      const y = -Math.cos(a) * 44;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x.toFixed(2));
      c.setAttribute('cy', y.toFixed(2));
      c.setAttribute('r', '9');
      c.setAttribute('fill', '#15181d');
      c.setAttribute('stroke', 'rgba(255,255,255,0.3)');
      nodes.appendChild(c);
      circles.push(c);
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', x.toFixed(2));
      tx.setAttribute('y', (y + 0.5).toFixed(2));
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('dominant-baseline', 'middle');
      tx.setAttribute('style', 'font-size:10px;fill:#e8eaed');
      tx.textContent = String(num);
      nodes.appendChild(tx);
    });
    fo.textContent = l.firingOrder.join('-');
    svg.setAttribute('aria-label', `${t('ui.firingOrder')}: ${l.firingOrder.join('-')}`);
  };
  buildDial();

  /* text + vibration meter */
  const tpl = section.querySelector<HTMLTemplateElement>('#layout-texts')!;
  const nameEl = section.querySelector<HTMLElement>('.layout-name')!;
  const textEl = section.querySelector<HTMLElement>('.layout-text')!;
  const barP = section.querySelector<HTMLElement>('[data-vib-p]')!;
  const barS = section.querySelector<HTMLElement>('[data-vib-s]')!;
  const valP = section.querySelector<HTMLElement>('[data-vib-pv]')!;
  const valS = section.querySelector<HTMLElement>('[data-vib-sv]')!;
  const qual = (v: number) => (v < 0.02 ? t('ui.balanced') : v < 0.6 ? t('ui.small') : t('ui.large'));
  const setLayout = (id: string) => {
    layout = id as LayoutId;
    rig?.setLayout(layout);
    const src = tpl.content.querySelector(`[data-k="${id}"]`);
    if (src) {
      nameEl.innerHTML = src.querySelector('h3')!.innerHTML;
      textEl.innerHTML = src.querySelector('p')!.innerHTML;
    }
    buildDial();
    const pk = peakShaking(LAYOUTS[layout]);
    valP.textContent = qual(pk.primary);
    valS.textContent = qual(pk.secondary);
  };
  bindSeg(section, 'layout', setLayout, 'i4');
  setLayout('i4');

  const fireRate = () => (sim.rpm / 60 / 2) * LAYOUTS[layout].cylinders.length * sim.speed;
  // cross-plane V8: uneven pulses per bank give the classic burble
  const src = { rate: () => (sim.playing ? fireRate() : 0), get pattern() { return layout === 'v8cross' ? [1, 0.55, 0.9, 0.6, 1, 0.5, 0.85, 0.65] : [1]; }, timbre: { thump: 64 } };
  registerSound(section, src);

  whileVisible(section, () => {
    const th = sim.theta;
    const l = LAYOUTS[layout];
    pointer.setAttribute('transform', `rotate(${((((th % 720) + 720) % 720) / 2).toFixed(2)})`);
    const n = l.firingOrder.length;
    const step = 720 / n;
    const cur = Math.floor(((((th % 720) + 720) % 720) + 1e-6) / step) % n;
    circles.forEach((c, i) => {
      const on = i === cur;
      c.setAttribute('fill', on ? 'rgba(255,138,31,0.85)' : '#15181d');
      c.setAttribute('stroke', on ? '#ffb347' : 'rgba(255,255,255,0.3)');
    });
    const f = shakingForces(l, th);
    const norm = 2.2;
    barP.style.width = `${Math.min(100, (f.primary / norm) * 100)}%`;
    barS.style.width = `${Math.min(100, (f.secondary / (norm * 0.29)) * 100 * 0.5)}%`;
  });
}
