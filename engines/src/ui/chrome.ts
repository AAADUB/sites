import { settings, setSetting, onSettings, applyMotionAttr, reducedMotion, type QualityPref, type MotionPref, type PowerUnit } from '../core/settings';
import { t } from './i18n';
import { scrollToTarget } from './scroll';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll(sel)) as T[];

/** Segmented controls: single-choice button groups. */
export function bindSeg(root: ParentNode, name: string, onChange: (v: string) => void, initial?: string) {
  const group = $(`[data-seg="${name}"]`, root);
  if (!group) return { set: (_v: string) => {} };
  const buttons = $$<HTMLButtonElement>('button', group);
  const set = (v: string, fire = false) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.value === v));
    if (fire) onChange(v);
  };
  for (const b of buttons) b.addEventListener('click', () => set(b.dataset.value!, true));
  if (initial) set(initial);
  return { set };
}

/** Range input fill + output text */
export function bindRange(input: HTMLInputElement | null, onInput: (v: number) => void, format?: (v: number) => string) {
  if (!input) return { set: (_v: number) => {} };
  const out = document.getElementById(`${input.id}-out`);
  const paint = () => {
    const min = +input.min;
    const max = +input.max;
    const v = +input.value;
    input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    if (out && format) out.textContent = format(v);
  };
  input.addEventListener('input', () => {
    paint();
    onInput(+input.value);
  });
  paint();
  return {
    set(v: number) {
      input.value = String(v);
      paint();
    },
  };
}

export function initChrome() {
  const header = $('.site-header')!;
  const sheet = $('#sheet')!;
  const sheetBtn = $<HTMLButtonElement>('[data-act="sheet"]')!;
  const panel = $('#settings')!;
  const settingsBtn = $<HTMLButtonElement>('[data-act="settings"]')!;

  // header style at the top of the page
  const onScroll = () => header.classList.toggle('is-top', scrollY < 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // keep language links pointing at the current section
  const langLinks = $$<HTMLAnchorElement>('[data-lang-link]');
  const baseHrefs = langLinks.map((a) => a.getAttribute('href')!);
  const updateLangHash = (id: string) => langLinks.forEach((a, i) => a.setAttribute('href', baseHrefs[i] + (id && id !== 'top' ? `#${id}` : '')));

  // section tracking for rail / sheet / current label
  const sections = $$<HTMLElement>('main > section[id]');
  const links = $$<HTMLAnchorElement>('[data-nav]');
  const cur = $('.sections-btn .cur')!;
  const curNum = $('.sections-btn .num')!;
  const progress = $<HTMLElement>('.rail-progress i');
  let current = '';
  const setCurrent = (id: string) => {
    if (id === current) return;
    current = id;
    for (const a of links) a.setAttribute('aria-current', String(a.dataset.nav === id));
    const a = links.find((l) => l.dataset.nav === id);
    cur.textContent = t(`nav.${id}`);
    curNum.textContent = a?.querySelector('.rail-num')?.textContent ?? '';
    updateLangHash(id);
  };
  const track = () => {
    const mid = innerHeight * 0.35;
    let best = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= mid) best = s;
    setCurrent(best.id);
    if (progress) {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.height = `${Math.min(100, (scrollY / Math.max(1, max)) * 100)}%`;
    }
  };
  addEventListener('scroll', () => requestAnimationFrame(track), { passive: true });
  track();

  // nav clicks → smooth scroll (respects reduced motion)
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    closeSheet();
    scrollToTarget(target);
    history.replaceState(null, '', `#${id}`);
    if (target.matches('section')) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });

  // mobile sheet
  const openSheet = () => {
    sheet.hidden = false;
    sheetBtn.setAttribute('aria-expanded', 'true');
    ($('[aria-current="true"]', sheet) as HTMLElement | null)?.focus() ?? $<HTMLElement>('a', sheet)?.focus();
  };
  const closeSheet = () => {
    if (sheet.hidden) return;
    sheet.hidden = true;
    sheetBtn.setAttribute('aria-expanded', 'false');
  };
  sheetBtn.addEventListener('click', () => (sheet.hidden !== false ? openSheet() : closeSheet()));
  $('[data-act="sheet-close"]', sheet)?.addEventListener('click', () => {
    closeSheet();
    sheetBtn.focus();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) closeSheet();
  });

  // settings panel
  const openPanel = (open: boolean) => {
    panel.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', String(open));
    if (open) $<HTMLElement>('button', panel)?.focus();
  };
  settingsBtn.addEventListener('click', () => openPanel(panel.hidden !== false));
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !settingsBtn.contains(e.target as Node)) openPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!panel.hidden) {
        openPanel(false);
        settingsBtn.focus();
      }
      if (!sheet.hidden) {
        closeSheet();
        sheetBtn.focus();
      }
    }
  });
  bindSeg(panel, 'quality', (v) => setSetting('quality', v as QualityPref), settings.quality);
  bindSeg(panel, 'motion', (v) => setSetting('motion', v as MotionPref), settings.motion);
  bindSeg(panel, 'power', (v) => setSetting('power', v as PowerUnit), settings.power);
  onSettings((_s, k) => {
    if (k === 'motion') applyMotionAttr();
  });
  applyMotionAttr();
  void reducedMotion;
}
