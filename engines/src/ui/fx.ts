import gsap from 'gsap';
import { reducedMotion } from '../core/settings';
import { t, tget } from './i18n';

/* ---------------- reveals ---------------- */
export function initReveals() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal, .draw'));
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        // stagger siblings that enter together
        const idx = Array.from(el.parentElement?.children ?? []).indexOf(el);
        el.style.transitionDelay = reducedMotion() ? '0ms' : `${Math.min(idx, 4) * 70}ms`;
        el.classList.add('is-in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((e) => io.observe(e));
}

/* ---------------- glossary popovers ---------------- */
export function initGlossaryLinks() {
  const items = tget<Array<{ key: string; term: string; def: string }>>('glossary') ?? [];
  const byKey = new Map(items.map((g) => [g.key, g]));
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'tooltip');
  pop.id = 'term-pop';
  pop.hidden = true;
  document.body.appendChild(pop);
  let current: HTMLElement | null = null;
  let hideTimer = 0;

  const show = (a: HTMLElement) => {
    const g = byKey.get(a.dataset.term!);
    if (!g) return;
    clearTimeout(hideTimer);
    current = a;
    pop.innerHTML = `<span class="pop-title">${g.term}</span>${g.def}<br><a href="#g-${g.key}">${t('ui.openGlossary')}</a>`;
    pop.hidden = false;
    a.setAttribute('aria-describedby', 'term-pop');
    const r = a.getBoundingClientRect();
    const pw = Math.min(352, innerWidth - 32);
    pop.style.width = `${pw}px`;
    let x = r.left + r.width / 2 - pw / 2;
    x = Math.max(16, Math.min(innerWidth - pw - 16, x));
    const ph = pop.offsetHeight;
    let y = r.bottom + 10;
    if (y + ph > innerHeight - 12) y = r.top - ph - 10;
    pop.style.left = `${x}px`;
    pop.style.top = `${Math.max(12, y)}px`;
    requestAnimationFrame(() => pop.classList.add('show'));
  };
  const hide = (delay = 120) => {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      pop.classList.remove('show');
      current?.removeAttribute('aria-describedby');
      current = null;
      window.setTimeout(() => {
        if (!current) pop.hidden = true;
      }, 200);
    }, delay);
  };

  const hoverCapable = matchMedia('(hover: hover)').matches;
  document.addEventListener('pointerover', (e) => {
    if (!hoverCapable) return;
    const a = (e.target as HTMLElement).closest('.term') as HTMLElement | null;
    if (a) show(a);
  });
  document.addEventListener('pointerout', (e) => {
    if (!hoverCapable) return;
    const a = (e.target as HTMLElement).closest('.term');
    if (a && !pop.contains(e.relatedTarget as Node)) hide();
  });
  pop.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  pop.addEventListener('pointerleave', () => hide());
  document.addEventListener('focusin', (e) => {
    const a = (e.target as HTMLElement).closest?.('.term') as HTMLElement | null;
    if (a) show(a);
  });
  document.addEventListener('focusout', (e) => {
    if ((e.target as HTMLElement).closest?.('.term')) hide(200);
  });
  // tap: first tap shows the definition, second tap (or the link in the popover) follows it
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement).closest('.term') as HTMLElement | null;
      if (!a) {
        if (current && !pop.contains(e.target as Node)) hide(0);
        return;
      }
      if (current !== a || pop.hidden) {
        e.preventDefault();
        e.stopPropagation();
        show(a);
      }
    },
    true,
  );
  addEventListener('scroll', () => current && hide(0), { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) hide(0);
  });
}

/* ---------------- custom cursor + magnetic buttons ---------------- */
export function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const c = document.querySelector('.cursor') as HTMLElement;
  const hint = document.querySelector('.cursor-hint') as HTMLElement;
  if (!c || !hint) return;
  let x = -100;
  let y = -100;
  let cx = x;
  let cy = y;
  let mode = '';
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      c.classList.add('on');
      const el = e.target as HTMLElement;
      const stage = el.closest?.('[data-cursor="cross"]') as HTMLElement | null;
      const link = el.closest?.('a, button, input, select, summary, label, [role="tab"]');
      const m = stage && !el.closest('button, a, input') ? 'cross' : link ? 'link' : '';
      if (m !== mode) {
        mode = m;
        c.classList.toggle('is-cross', m === 'cross');
        c.classList.toggle('is-link', m === 'link');
        hint.classList.toggle('on', m === 'cross' && !stage?.classList.contains('no-rotate'));
        if (m === 'cross') hint.textContent = stage?.dataset.hint || t('ui.dragToRotate');
      }
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => c.classList.remove('on'));
  gsap.ticker.add(() => {
    cx += (x - cx) * 0.28;
    cy += (y - cy) * 0.28;
    c.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
    hint.style.transform = `translate3d(${(x + 22).toFixed(1)}px, ${(y + 18).toFixed(1)}px, 0)`;
  });
}

export function initMagnetic() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.magnetic'))) {
    const label = el.querySelector('.btn-label') as HTMLElement | null;
    el.addEventListener('pointermove', (e) => {
      if (reducedMotion()) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: dx * 0.22, y: dy * 0.3, duration: 0.5, ease: 'power3.out' });
      if (label) gsap.to(label, { x: dx * 0.08, y: dy * 0.1, duration: 0.5, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)' });
      if (label) gsap.to(label, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    });
  }
}

/* ---------------- fonts ---------------- */
/** Switch to the web fonts once they (including Cyrillic glyphs) are loaded. */
export function initFonts(onDone: () => void) {
  const root = document.documentElement;
  const finish = () => {
    root.classList.add('fonts-ready');
    onDone();
  };
  const link = document.querySelector<HTMLLinkElement>('link[href*="typekit"][rel="stylesheet"]');
  const sample = root.lang === 'ru' ? 'Двигатель Ёж 0123' : 'Engine 0123';
  const tryLoad = () => {
    if (!document.fonts) return finish();
    Promise.all([
      document.fonts.load(`500 1em stolzl`, sample),
      document.fonts.load(`400 1em aktiv-grotesk`, sample),
      document.fonts.load(`400 1em source-code-pro`, '0123'),
    ])
      .then((faces) => {
        if (faces.every((f) => f.length > 0)) finish();
        else onDone();
      })
      .catch(() => onDone());
  };
  if (!link) return onDone();
  const sheetLoaded = () => {
    try {
      return !!link.sheet && link.media === 'all';
    } catch {
      return false;
    }
  };
  if (sheetLoaded()) tryLoad();
  else {
    link.addEventListener('load', () => requestAnimationFrame(tryLoad), { once: true });
    link.addEventListener('error', () => onDone(), { once: true });
  }
  // never wait forever
  window.setTimeout(onDone, 2500);
}

/* ---------------- animated counters ---------------- */
export function initCounters() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  const ru = document.documentElement.lang === 'ru';
  const format = (n: number) => {
    const s = String(Math.round(n));
    return s.length > 3 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ru ? ' ' : ',') : s;
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        const target = +el.dataset.count!;
        if (reducedMotion()) continue;
        const o = { v: 0 };
        gsap.to(o, { v: target, duration: 1.6, ease: 'expo.out', onUpdate: () => (el.textContent = format(o.v)) });
      }
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => {
    if (!reducedMotion() && el.getBoundingClientRect().top > innerHeight) el.textContent = '0';
    io.observe(el);
  });
}
