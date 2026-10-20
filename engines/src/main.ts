import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/sections.css';
import { initI18n } from './ui/i18n';
import { initChrome } from './ui/chrome';
import { initScroll } from './ui/scroll';
import { initReveals, initGlossaryLinks, initCursor, initMagnetic, initFonts } from './ui/fx';
import { probeWebGL } from './core/support';
import { applyMotionAttr, reducedMotion, captureMode } from './core/settings';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);
import { initSound } from './ui/sound';

initI18n();
applyMotionAttr();
const capture = captureMode();
if (capture) {
  document.documentElement.classList.add('capture', capture === 'og' ? 'capture-og' : 'capture-stage');
  document.querySelector(`[data-stage="${capture === 'og' ? 'hero' : capture}"]`)?.classList.add('capture-target');
}

const root = document.documentElement;
let loadedOnce = false;
const markLoaded = () => {
  if (loadedOnce) return;
  loadedOnce = true;
  root.classList.add('loaded');
  heroIntro();
};

/** Headline reveal as the preloader lifts (SplitText, expo-out stagger). */
function heroIntro() {
  const hero = document.getElementById('top');
  const title = hero?.querySelector<HTMLElement>('.hero-title');
  if (!hero || !title || reducedMotion() || capture) return;
  const split = new SplitText(title, { type: 'chars,words', charsClass: 'hc', wordsClass: 'hw' });
  gsap.from(split.chars, { yPercent: 105, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.03 });
  gsap.from(hero.querySelectorAll('.hero-kicker, .hero-sub, .hero-cta, .scroll-cue'), { y: 16, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, delay: 0.25 });
}
initFonts(markLoaded);
window.setTimeout(markLoaded, 800);

initChrome();
initScroll();
initReveals();
initGlossaryLinks();
initCursor();
initMagnetic();
initSound();

/* ---------------- WebGL support ---------------- */
const webgl = probeWebGL();
if (!webgl) root.classList.add('no-webgl');

/* ---------------- lazy section modules ---------------- */
type Loader = () => Promise<{ init: (el: HTMLElement) => void | Promise<void> }>;
const modules: Record<string, Loader> = {
  top: () => import('./sections/hero'),
  'big-idea': () => import('./sections/bigIdea'),
  anatomy: () => import('./sections/anatomy'),
  'four-stroke': () => import('./sections/fourStroke'),
  diesel: () => import('./sections/diesel'),
  'two-stroke': () => import('./sections/twoStroke'),
  wankel: () => import('./sections/wankel'),
  layouts: () => import('./sections/layouts'),
  systems: () => import('./sections/systems'),
  boost: () => import('./sections/boost'),
  gearbox: () => import('./sections/gearbox'),
  efficiency: () => import('./sections/efficiency'),
  history: () => import('./sections/history'),
  lab: () => import('./sections/lab'),
  compare: () => import('./sections/compare'),
  games: () => import('./sections/games'),
  glossary: () => import('./sections/glossary'),
  quiz: () => import('./sections/quiz'),
};

const started = new Set<string>();
function start(id: string) {
  if (started.has(id)) return;
  started.add(id);
  const el = document.getElementById(id);
  const load = modules[id];
  if (!el || !load) return;
  load()
    .then((m) => m.init(el))
    .catch((err) => console.warn(`section ${id}:`, err instanceof Error ? err.message : err));
}

// hero first, after first paint and idle time
const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => number }).requestIdleCallback;
const idle = (fn: () => void) => (ric ? ric(fn, { timeout: 1200 }) : window.setTimeout(fn, 200));

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) start((e.target as HTMLElement).id);
  },
  { rootMargin: '120% 0px 120% 0px' },
);
const boot = () => {
  if (capture) {
    const target = document.querySelector('.capture-target')?.closest('section');
    if (target) start(target.id);
    return;
  }
  for (const id of Object.keys(modules)) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
};
if (document.readyState === 'complete') idle(boot);
else addEventListener('load', () => idle(boot), { once: true });

// deep link: make sure the target section initialises immediately
if (location.hash) {
  const id = location.hash.slice(1);
  if (modules[id]) start(id);
}
