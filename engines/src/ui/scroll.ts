import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion, onSettings } from '../core/settings';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

function headerOffset() {
  const h = document.querySelector('.site-header') as HTMLElement | null;
  return (h?.offsetHeight ?? 60) + 12;
}

/** Smooth scroll (desktop pointer only; touch keeps native scrolling) — off in reduced motion. */
export function initScroll() {
  const apply = () => {
    const want = !reducedMotion();
    if (want && !lenis) {
      lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
      lenis.on('scroll', ScrollTrigger.update);
      document.documentElement.classList.add('lenis');
    } else if (!want && lenis) {
      lenis.destroy();
      lenis = null;
      document.documentElement.classList.remove('lenis', 'lenis-smooth');
    }
  };
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  apply();
  onSettings((_s, k) => {
    if (k === 'motion') {
      apply();
      ScrollTrigger.refresh();
    }
  });
  // refresh triggers once fonts and images settle
  addEventListener('load', () => ScrollTrigger.refresh());
}

export function scrollToTarget(el: HTMLElement) {
  const off = -headerOffset();
  if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else {
    const y = el.getBoundingClientRect().top + scrollY + off;
    scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

export function stopScroll(on: boolean) {
  if (!lenis) return;
  if (on) lenis.stop();
  else lenis.start();
}

export { ScrollTrigger, gsap };
