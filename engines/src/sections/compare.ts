import * as THREE from 'three';
import { registerStage, captureFreeze } from './shared';
import { createBase, type BaseScene } from '../engines/common';
import { SingleCylinderEngine } from '../engines/singleCylinder';
import { TwoStrokeEngine } from '../engines/twoStroke';
import { WankelEngine } from '../engines/wankel';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL, DIESEL, TWO_STROKE } from '../physics/kinematics';
import { tget, t } from '../ui/i18n';
import { tierSpec } from '../core/quality';
import { icon } from '../content/icons';
import { registerSound } from '../ui/sound';
import { reducedMotion } from '../core/settings';
import type { StageScene } from '../core/renderer';

type Kind = 'petrol' | 'diesel' | 'two' | 'wankel';

interface Side {
  kind: Kind;
  base: BaseScene;
  update: (theta: number, dt: number) => void;
  dispose: () => void;
}

async function buildSide(stage: Parameters<Parameters<typeof registerStage>[1]>[0], kind: Kind, rpm: () => number): Promise<Side> {
  const n = Math.round(tierSpec().particles * 0.6);
  if (kind === 'wankel') {
    const base = createBase(stage, { presets: { p: { pos: [0.6, 0.6, 8.2], target: [0, 0, 0], fov: 30 } }, initial: 'p', rotate: false, groundY: -1.8 });
    base.ground.visible = false;
    base.contact.visible = false;
    const eng = new WankelEngine(n);
    base.root.add(eng.group);
    return { kind, base, update: (th, dt) => eng.update(th, dt), dispose: () => (eng.dispose(), base.dispose()) };
  }
  if (kind === 'two') {
    const base = createBase(stage, { presets: { p: { pos: [1.4, 1.9, 9.4], target: [0.35, 0.95, 0], fov: 30 } }, initial: 'p', rotate: false, groundY: -0.92 });
    const eng = new TwoStrokeEngine(TWO_STROKE, n);
    await eng.ready;
    base.root.add(eng.group);
    const sim = new EngineSim('two-stroke', TWO_STROKE, { rpm: rpm() });
    sim.playing = false;
    return {
      kind,
      base,
      update: (th, dt) => {
        if (sim.rpm !== rpm()) sim.set({ rpm: rpm() });
        eng.update(th, sim.rpm, sim.load, sim.table, dt);
      },
      dispose: () => (sim.dispose(), eng.dispose(), base.dispose()),
    };
  }
  const geom = kind === 'petrol' ? PETROL : DIESEL;
  const base = createBase(stage, { presets: { p: { pos: [1.6, 2.1, 10.4], target: [0, 1.35, 0], fov: 30 } }, initial: 'p', rotate: false, groundY: -1.07 });
  const eng = new SingleCylinderEngine(kind, geom, n);
  await eng.ready;
  await eng.setView('cutaway', false);
  base.root.add(eng.group);
  const sim = new EngineSim(kind === 'petrol' ? 'otto' : 'diesel', geom, { rpm: rpm(), load: 0.6 });
  sim.playing = false;
  return {
    kind,
    base,
    update: (th, dt) => {
      if (sim.rpm !== rpm()) sim.set({ rpm: rpm() });
      eng.update({ theta: th, rpm: sim.rpm, load: sim.load, table: sim.table, timing: sim.timing }, dt);
    },
    dispose: () => (sim.dispose(), eng.dispose(), base.dispose()),
  };
}

export async function init(section: HTMLElement) {
  const data = tget<Record<Kind, Record<string, string>>>('sections.compare')!;
  const clock = sharedSim('compare', () => new EngineSim('otto', PETROL, { rpm: 1200, speed: 0.05 }));
  captureFreeze(clock, 380);
  if (reducedMotion()) clock.playing = false;
  const selA = section.querySelector<HTMLSelectElement>('[data-cmp="a"]')!;
  const selB = section.querySelector<HTMLSelectElement>('[data-cmp="b"]')!;
  let a: Kind = selA.value as Kind;
  let b: Kind = selB.value as Kind;
  let rebuild: (() => void) | null = null;

  const fillTable = () => {
    section.querySelector('[data-cmp-h="a"]')!.textContent = data[a].name;
    section.querySelector('[data-cmp-h="b"]')!.textContent = data[b].name;
    section.querySelectorAll<HTMLTableRowElement>('tr[data-row]').forEach((tr) => {
      const r = tr.dataset.row!;
      tr.querySelector('[data-col="a"]')!.textContent = data[a][r];
      tr.querySelector('[data-col="b"]')!.textContent = data[b][r];
    });
  };
  fillTable();

  const stageEl = section.querySelector<HTMLElement>('[data-stage="compare"]');
  stageEl?.classList.add('no-rotate');
  registerStage(stageEl, async (stage) => {
    let left = await buildSide(stage, a, () => clock.rpm);
    let right = await buildSide(stage, b, () => clock.rpm);
    let w = 1;
    let h = 1;
    const dummy = new THREE.PerspectiveCamera();
    const sceneDummy = new THREE.Scene();
    let busy = false;
    rebuild = async () => {
      if (busy) return;
      busy = true;
      if (left.kind !== a) {
        left.dispose();
        left = await buildSide(stage, a, () => clock.rpm);
      }
      if (right.kind !== b) {
        right.dispose();
        right = await buildSide(stage, b, () => clock.rpm);
      }
      busy = false;
      view.resize?.(w, h);
    };
    const view: StageScene = {
      scene: sceneDummy,
      camera: dummy,
      update(dt) {
        left.update(clock.theta, dt);
        right.update(clock.theta, dt);
      },
      resize(W, H) {
        w = W;
        h = H;
        const vertical = W / H < 1;
        for (const s of [left, right]) {
          s.base.camera.aspect = vertical ? W / (H / 2) : W / 2 / H;
          s.base.camera.zoom = vertical ? 0.95 : Math.min(1, (W / 2 / H) * 1.25);
          s.base.camera.updateProjectionMatrix();
        }
      },
      render({ renderer, width, height }) {
        const prev = renderer.toneMapping;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.setScissorTest(true);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        const vertical = width / height < 1;
        const halves = vertical
          ? [
              [0, height / 2, width, height / 2],
              [0, 0, width, height / 2],
            ]
          : [
              [0, 0, width / 2, height],
              [width / 2, 0, width / 2, height],
            ];
        [left, right].forEach((sd, i) => {
          const [x, y, ww, hh] = halves[i];
          renderer.setViewport(x, y, ww, hh);
          renderer.setScissor(x, y, ww, hh);
          renderer.render(sd.base.scene, sd.base.camera);
        });
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
        renderer.toneMapping = prev;
        return true;
      },
      dispose() {
        left.dispose();
        right.dispose();
      },
    };
    return view;
  });

  const onChange = () => {
    a = selA.value as Kind;
    b = selB.value as Kind;
    fillTable();
    rebuild?.();
  };
  selA.addEventListener('change', onChange);
  selB.addEventListener('change', onChange);
  const play = section.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const sync = () => {
    play.setAttribute('aria-pressed', String(clock.playing));
    play.innerHTML = `${icon(clock.playing ? 'pause' : 'play')}<span class="btn-label">${t(clock.playing ? 'ui.pause' : 'ui.play')}</span>`;
  };
  play.addEventListener('click', () => {
    clock.playing = !clock.playing;
    sync();
  });
  sync();
  const perRev = (k: Kind) => (k === 'petrol' || k === 'diesel' ? 0.5 : 1);
  registerSound(section, { rate: () => (clock.playing ? (clock.rpm / 60) * (perRev(a) + perRev(b)) * clock.speed : 0) });
}
