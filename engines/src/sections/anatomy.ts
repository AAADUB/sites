import gsap from 'gsap';
import { registerStage } from './shared';
import { createEngineStage, type EngineView } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL } from '../physics/kinematics';
import { bindSeg } from '../ui/chrome';
import { t, tget } from '../ui/i18n';
import { reducedMotion } from '../core/settings';
import type { PartKey } from '../engines/singleCylinder';

const GROUPS: PartKey[][] = [
  ['block', 'crankcase', 'oilpan'],
  ['crankshaft'],
  ['piston'],
  ['rod'],
  ['head'],
  ['intakeCam', 'exhaustCam', 'timingBelt'],
  ['intakeValve', 'exhaustValve'],
  ['sparkPlug', 'coil'],
  ['intake', 'exhaust', 'throttle', 'portInjector', 'catalyst'],
];

const FINDABLE: PartKey[] = ['block', 'head', 'crankshaft', 'rod', 'piston', 'intakeValve', 'exhaustValve', 'intakeCam', 'exhaustCam', 'sparkPlug', 'coil', 'intake', 'exhaust', 'timingBelt', 'catalyst', 'oilpan', 'throttle'];

/** Shared entry point for the "Find the part" game card in the games section. */
export let startFindGame: (() => void) | null = null;

export async function init(section: HTMLElement) {
  const sim = sharedSim('anatomy', () => new EngineSim('otto', PETROL, { rpm: 900, load: 0.3, speed: 0.04 }));
  let view: EngineView | null = null;
  let step = GROUPS.length - 1;
  let mode: 'build' | 'find' = 'build';
  const stageEl = section.querySelector<HTMLElement>('[data-stage="anatomy"]');
  const stepsEls = Array.from(section.querySelectorAll<HTMLButtonElement>('.asm-step'));
  const count = section.querySelector<HTMLElement>('.step-count');
  const drop = { v: 1 };
  let dropping: PartKey[] = [];

  const apply = () => {
    if (!view) return;
    const visible = new Set<PartKey>();
    for (let i = 0; i <= step; i++) GROUPS[i].forEach((k) => visible.add(k));
    const eng = view.engine;
    for (const p of eng.parts.values()) {
      const vis = p.key !== 'camcover' && visible.has(p.key);
      p.obj.visible = vis;
      p.obj.userData.assemblyOffset = dropping.includes(p.key) ? 1 - drop.v : 0;
    }
    eng.gasVisible = step >= 4 ? 1 : 0;
    view.annot.setKeys(Array.from(visible));
  };

  registerStage(stageEl, async (st) => {
    view = await createEngineStage(st, { kind: 'petrol', sim, initial: 'threeQuarter', view: 'xray', labels: true });
    view.engine.parts.get('camcover')!.obj.visible = false;
    const baseUpdate = view.update.bind(view);
    view.update = (dt, tt) => {
      apply();
      baseUpdate(dt, tt);
    };
    view.annot.onPick = (k) => onFindPick(k);
    apply();
    return view;
  });

  const setStep = (i: number, animate = true) => {
    const prev = step;
    step = Math.max(0, Math.min(GROUPS.length - 1, i));
    stepsEls.forEach((b, k) => {
      b.classList.toggle('is-done', k < step);
      b.setAttribute('aria-current', String(k === step));
    });
    if (count) count.textContent = `${t('ui.step')} ${step + 1} ${t('ui.of')} ${GROUPS.length}`;
    if (step > prev && animate && !reducedMotion()) {
      dropping = GROUPS[step];
      drop.v = 0;
      gsap.to(drop, { v: 1, duration: 1.1, ease: 'expo.out' });
    } else {
      dropping = [];
      drop.v = 1;
    }
    if (view) view.annot.labelsOn = true;
  };
  setStep(GROUPS.length - 1, false);
  stepsEls.forEach((b, i) => b.addEventListener('click', () => setStep(i)));
  section.querySelector('[data-act="prev"]')?.addEventListener('click', () => setStep(step - 1, false));
  section.querySelector('[data-act="next"]')?.addEventListener('click', () => setStep(step + 1));
  let building: number | null = null;
  section.querySelector('[data-act="build"]')?.addEventListener('click', () => {
    if (building) clearInterval(building);
    setStep(0, false);
    let i = 0;
    building = window.setInterval(() => {
      i++;
      if (i >= GROUPS.length) {
        clearInterval(building!);
        building = null;
        return;
      }
      setStep(i);
    }, reducedMotion() ? 600 : 1400);
  });

  /* ---------------- find the part ---------------- */
  const buildPanel = section.querySelector<HTMLElement>('.build-panel')!;
  const findPanel = section.querySelector<HTMLElement>('.find-panel')!;
  const prompt = section.querySelector<HTMLElement>('.find-prompt')!;
  const feedback = section.querySelector<HTMLElement>('.find-feedback')!;
  const scoreEl = section.querySelector<HTMLElement>('.find-score')!;
  const chip = section.querySelector<HTMLElement>('.find-chip')!;
  let target: PartKey | null = null;
  let score = 0;
  let rounds = 0;
  const nextTarget = () => {
    const pool = FINDABLE.filter((k) => k !== target);
    target = pool[Math.floor(Math.random() * pool.length)];
    const name = t(`parts.${target}.name`);
    prompt.textContent = t('ui.findPrompt', { part: name });
    chip.textContent = name;
    chip.hidden = false;
  };
  const onFindPick = (k: PartKey | null) => {
    if (mode !== 'find' || !target || !k) return;
    rounds++;
    if (k === target) {
      score++;
      feedback.textContent = t('ui.found');
      nextTarget();
    } else feedback.textContent = t('ui.tryAgain', { part: t(`parts.${k}.name`) });
    scoreEl.textContent = `${t('ui.score')}: ${score} / ${rounds}`;
  };
  const setMode = (m: string) => {
    mode = m as 'build' | 'find';
    buildPanel.hidden = mode !== 'build';
    findPanel.hidden = mode !== 'find';
    chip.hidden = mode !== 'find' || !target;
    if (view) {
      view.annot.labelsOn = mode === 'build';
      view.annot.clearSelection();
    }
    if (mode === 'find') setStep(GROUPS.length - 1, false);
  };
  const seg = bindSeg(section, 'amode', setMode, 'build');
  section.querySelector('[data-act="find-start"]')?.addEventListener('click', () => {
    score = 0;
    rounds = 0;
    scoreEl.textContent = '';
    feedback.textContent = '';
    nextTarget();
  });
  startFindGame = () => {
    seg.set('find');
    setMode('find');
    score = 0;
    rounds = 0;
    nextTarget();
  };
  void tget;
}
