import { registerStage } from './shared';
import { captureFreeze } from './shared';
import { createEngineStage, type EngineView } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL } from '../physics/kinematics';
import { onTick } from '../core/clock';
import { reducedMotion, captureMode } from '../core/settings';
import { registerSound } from '../ui/sound';

interface Beat {
  from: number;
  to: number;
  preset: string;
  rate: number; // crank degrees per second
}

const BEATS: Beat[] = [
  { from: 0, to: 225, preset: 'chamber', rate: 55 }, // fuel + air
  { from: 180, to: 360, preset: 'piston', rate: 45 }, // squeeze
  { from: 330, to: 540, preset: 'spark', rate: 40 }, // spark and push
  { from: 0, to: 720, preset: 'crank', rate: 160 }, // spin
];

export async function init(section: HTMLElement) {
  const sim = sharedSim('bigIdea', () => new EngineSim('otto', PETROL, { rpm: 1200, load: 0.6, speed: 0.05 }));
  captureFreeze(sim, 30);
  sim.playing = false;
  let view: EngineView | null = null;
  let beat = 0;
  let local = 0;
  const stageEl = section.querySelector<HTMLElement>('[data-stage="bigIdea"]');

  registerStage(stageEl, async (st) => {
    view = await createEngineStage(st, { kind: 'petrol', sim, initial: BEATS[0].preset, view: 'cutaway', picking: true });
    view.base.goTo(BEATS[beat].preset, 0);
    return view;
  });

  const beats = Array.from(section.querySelectorAll<HTMLElement>('.beat'));
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-beat-btn]'));
  const setBeat = (i: number) => {
    if (i === beat && local !== 0) return;
    beat = i;
    local = 0;
    beats.forEach((b, k) => b.classList.toggle('is-current', k === i));
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    view?.base.goTo(BEATS[i].preset, 1.8);
    sim.setTheta(BEATS[i].from);
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => setBeat(i)));
  setBeat(0);

  // the beat whose text sits nearest the middle of the screen is the current one
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setBeat(beats.indexOf(e.target as HTMLElement));
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  beats.forEach((b) => io.observe(b));

  let visible = false;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(section);
  onTick((dt) => {
    if (!visible || captureMode()) return;
    const b = BEATS[beat];
    const rate = reducedMotion() ? 0 : b.rate;
    local = (local + rate * dt) % (b.to - b.from);
    if (rate > 0) sim.theta = b.from + local;
  });
  registerSound(section, { rate: () => (reducedMotion() ? 0 : BEATS[beat].rate / 720) });
}
