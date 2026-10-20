import { ScrollTrigger, gsap } from '../ui/scroll';
import { reducedMotion } from '../core/settings';

/**
 * Horizontal timeline. On wide screens with a fine pointer the section pins and the
 * track moves sideways as you scroll; elsewhere it is a native swipe/scroll strip.
 */
export function init(section: HTMLElement) {
  const wrap = section.querySelector<HTMLElement>('[data-timeline]')!;
  const track = section.querySelector<HTMLElement>('.timeline-track')!;
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px) and (pointer: fine) and (min-height: 560px)', () => {
    if (reducedMotion()) return;
    wrap.style.overflowX = 'hidden';
    const dist = () => Math.max(0, track.scrollWidth - wrap.clientWidth + 48);
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top+=80',
        end: () => `+=${dist()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(track, { x: 0 });
      wrap.style.overflowX = '';
    };
  });
  // drag to scroll with a mouse when the strip is natively scrollable
  let down = false;
  let sx = 0;
  let sl = 0;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || wrap.style.overflowX === 'hidden') return;
    down = true;
    sx = e.clientX;
    sl = wrap.scrollLeft;
  });
  addEventListener('pointerup', () => (down = false));
  wrap.addEventListener('pointermove', (e) => {
    if (down) wrap.scrollLeft = sl - (e.clientX - sx);
  });
  ScrollTrigger.refresh();
}
