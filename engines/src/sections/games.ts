import { t, tget } from '../ui/i18n';
import { icon } from '../content/icons';
import { s, svgRoot, setAttrs } from '../ui/svg';
import { onTick } from '../core/clock';
import { setOverride, soundOn } from '../ui/sound';
import { settings, setSetting, reducedMotion } from '../core/settings';
import { STROKE_COLORS, COLORS } from '../core/tokens';
import { scrollToTarget } from '../ui/scroll';

const STROKES = ['intake', 'compression', 'power', 'exhaust'] as const;

const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function init(section: HTMLElement) {
  orderGame(section.querySelector('[data-game="order"]')!);
  findGame(section.querySelector('[data-game="find"]')!);
  guessGame(section.querySelector('[data-game="guess"]')!);
}

/* ---------------- put the strokes in order ---------------- */
function orderGame(root: HTMLElement) {
  const list = root.querySelector<HTMLOListElement>('.order-list')!;
  const fb = root.querySelector<HTMLElement>('.game-feedback')!;
  const texts = tget<{ done: string; notYet: string }>('sections.games.order')!;
  let order: string[] = [];
  const render = () => {
    list.replaceChildren();
    order.forEach((k, i) => {
      const li = document.createElement('li');
      li.className = 'order-item';
      li.dataset.k = k;
      li.style.color = STROKE_COLORS[k as keyof typeof STROKE_COLORS];
      li.innerHTML = `<span class="grow">${icon(k as 'intake')}<span style="color:var(--text)">${t(`ui.strokes.${k}`)}</span></span>
        <button type="button" class="btn btn-icon" data-move="-1" aria-label="${t('ui.moveUp')}: ${t(`ui.strokes.${k}`)}" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button type="button" class="btn btn-icon" data-move="1" aria-label="${t('ui.moveDown')}: ${t(`ui.strokes.${k}`)}" ${i === order.length - 1 ? 'disabled' : ''}>${icon('down')}</button>`;
      list.appendChild(li);
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    render();
    fb.textContent = '';
  };
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-move]');
    if (!b) return;
    const li = b.closest<HTMLElement>('.order-item')!;
    const i = order.indexOf(li.dataset.k!);
    const to = i + +b.dataset.move!;
    move(i, to);
    list.querySelectorAll<HTMLElement>('.order-item')[to]?.querySelector<HTMLButtonElement>(`[data-move="${b.dataset.move}"]`)?.focus();
  });
  // pointer drag
  let drag: { el: HTMLElement; startY: number; idx: number; h: number } | null = null;
  list.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.order-item');
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    drag = { el, startY: e.clientY, idx: order.indexOf(el.dataset.k!), h: el.offsetHeight + 6 };
    el.classList.add('dragging');
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    drag.el.style.transform = `translateY(${dy}px)`;
  });
  const end = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const shift = Math.round(dy / drag.h);
    drag.el.style.transform = '';
    drag.el.classList.remove('dragging');
    const from = drag.idx;
    drag = null;
    if (shift) move(from, Math.max(0, Math.min(order.length - 1, from + shift)));
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  const shuffleAll = () => {
    do order = shuffle([...STROKES]);
    while (order.join() === STROKES.join());
    render();
    fb.textContent = '';
  };
  root.querySelector('[data-act="shuffle"]')!.addEventListener('click', shuffleAll);
  root.querySelector('[data-act="check"]')!.addEventListener('click', () => {
    fb.textContent = order.join() === STROKES.join() ? texts.done : texts.notYet;
  });
  shuffleAll();
}

/* ---------------- find the part (plays on the anatomy model) ---------------- */
function findGame(root: HTMLElement) {
  root.querySelector('[data-act="find-go"]')!.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const anatomy = document.getElementById('anatomy')!;
    scrollToTarget(anatomy);
    const mod = await import('./anatomy');
    // the anatomy section initialises lazily; wait until its game hook exists
    const tryStart = (n = 0) => {
      if (mod.startFindGame) mod.startFindGame();
      else if (n < 40) window.setTimeout(() => tryStart(n + 1), 150);
    };
    tryStart();
  });
}

/* ---------------- guess the engine by its rhythm ---------------- */
interface Candidate {
  id: string;
  name: string;
  rate: number; // firing pulses per second at the demo speed
  pattern: number[];
  timbre: { thump: number; noise: number; bright: number; decay: number };
  /** firing events over one 720° turn of the motion dial (positions in turns) */
  events: number[];
}

function guessGame(root: HTMLElement) {
  const cmp = tget<Record<string, { name: string }>>('sections.compare') ?? {};
  const lay = tget<Record<string, string>>('sections.layouts') ?? {};
  const texts = tget<{ right: string; wrongAns: string }>('sections.games.guess')!;
  const C: Candidate[] = [
    { id: 'single', name: cmp.petrol?.name ?? 'Single', rate: (1200 / 60) / 2, pattern: [1], timbre: { thump: 58, noise: 0.45, bright: 800, decay: 0.12 }, events: [0] },
    { id: 'i4', name: lay.i4 ?? 'Inline-4', rate: (900 / 60) * 2, pattern: [1], timbre: { thump: 66, noise: 0.5, bright: 900, decay: 0.05 }, events: [0, 0.25, 0.5, 0.75] },
    { id: 'v8', name: lay.v8cross ?? 'V8', rate: (700 / 60) * 4, pattern: [1, 0.55, 0.9, 0.6, 1, 0.5, 0.85, 0.65], timbre: { thump: 56, noise: 0.55, bright: 700, decay: 0.045 }, events: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] },
    { id: 'two', name: cmp.two?.name ?? 'Two-stroke', rate: 3000 / 60, pattern: [1], timbre: { thump: 110, noise: 0.9, bright: 3200, decay: 0.03 }, events: [0, 0.5] },
    { id: 'wankel', name: cmp.wankel?.name ?? 'Wankel', rate: (1800 / 60) * 2, pattern: [1], timbre: { thump: 90, noise: 0.35, bright: 1500, decay: 0.04 }, events: [0, 0.25, 0.5, 0.75] },
  ];
  const opts = root.querySelector<HTMLElement>('.guess-options')!;
  const fb = root.querySelector<HTMLElement>('.game-feedback')!;
  const hint = root.querySelector<HTMLElement>('.guess-hint')!;
  const dialHost = root.querySelector<HTMLElement>('.pulse-dial')!;
  const svg = svgRoot(120, 120);
  dialHost.appendChild(svg);
  svg.append(s('circle', { cx: 60, cy: 60, r: 46, fill: 'none', stroke: 'rgba(255,255,255,0.15)' }));
  const dots = s('g');
  const hand = s('line', { x1: 60, y1: 60, x2: 60, y2: 18, stroke: COLORS.text, 'stroke-width': 1.5 });
  svg.append(dots, hand, s('circle', { cx: 60, cy: 60, r: 3, fill: COLORS.text }));
  let current: Candidate | null = null;
  let turn = 0;
  let answered = false;
  const flashes: SVGCircleElement[] = [];
  const setupDial = (c: Candidate) => {
    dots.replaceChildren();
    flashes.length = 0;
    for (const e of c.events) {
      const a = e * Math.PI * 2 - Math.PI / 2;
      const d = s('circle', { cx: 60 + Math.cos(a) * 46, cy: 60 + Math.sin(a) * 46, r: 6, fill: COLORS.amber, opacity: 0.15 });
      dots.appendChild(d);
      flashes.push(d);
    }
  };
  const ask = () => {
    current = C[Math.floor(Math.random() * C.length)];
    answered = false;
    fb.textContent = '';
    setupDial(current);
    hint.hidden = soundOn();
    setOverride({ rate: () => (current && !answered ? current.rate : 0), pattern: current.pattern, timbre: current.timbre });
    opts.replaceChildren();
    for (const c of shuffle(C)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm';
      b.textContent = c.name;
      b.addEventListener('click', () => {
        if (answered || !current) return;
        answered = true;
        setOverride(null);
        fb.textContent = (c.id === current.id ? texts.right : texts.wrongAns).replace('{name}', current.name);
        opts.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true));
      });
      opts.appendChild(b);
    }
  };
  root.querySelector('[data-act="listen"]')!.addEventListener('click', () => {
    if (!settings.sound) setSetting('sound', true);
    ask();
  });
  // stop the forced sound when the game scrolls out of view
  new IntersectionObserver((e) => {
    if (!e[0].isIntersecting) setOverride(null);
    else if (current && !answered) setOverride({ rate: () => current!.rate, pattern: current.pattern, timbre: current.timbre });
  }).observe(root);
  onTick((dt) => {
    if (!current) return;
    // one turn of the dial = two crank revolutions (720°), shown slowly; it flashes at each firing
    turn = (turn + dt * (reducedMotion() ? 0 : 0.5)) % 1;
    const a = turn * 360;
    setAttrs(hand, { transform: `rotate(${a.toFixed(1)} 60 60)` });
    current.events.forEach((e, i) => {
      const d = ((turn - e + 1) % 1) * 360;
      const f = d < 50 ? 1 - d / 50 : 0;
      setAttrs(flashes[i], { opacity: (0.15 + 0.85 * f).toFixed(2), r: (6 + 3 * f).toFixed(1) });
    });
  });
}
