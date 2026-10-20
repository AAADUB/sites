import { t } from '../ui/i18n';

/** Instant filter for the glossary (matches term and definition, accent-insensitive). */
export function init(section: HTMLElement) {
  const input = section.querySelector<HTMLInputElement>('[data-glossary-search]')!;
  const items = Array.from(section.querySelectorAll<HTMLElement>('.gl-item'));
  const empty = section.querySelector<HTMLElement>('.glossary-empty')!;
  const count = section.querySelector<HTMLElement>('.glossary-count')!;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ё/g, 'е');
  const index = items.map((el) => ({ el, text: norm(el.textContent || '') }));
  const run = () => {
    const q = norm(input.value.trim());
    let n = 0;
    for (const it of index) {
      const show = !q || it.text.includes(q);
      it.el.hidden = !show;
      if (show) n++;
    }
    empty.hidden = n > 0;
    count.textContent = q ? `${n} / ${items.length}` : `${items.length}`;
  };
  input.addEventListener('input', run);
  run();
  // flash the entry when arriving from a term link
  const flash = () => {
    const id = location.hash.slice(1);
    if (!id.startsWith('g-')) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.hidden) {
      input.value = '';
      run();
    }
    el.classList.add('flash');
    window.setTimeout(() => el.classList.remove('flash'), 1600);
  };
  addEventListener('hashchange', flash);
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#g-"]');
    if (a) window.setTimeout(flash, 50);
  });
  void t;
}
