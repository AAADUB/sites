import { bindSeg } from '../ui/chrome';
import { t, tget } from '../ui/i18n';
import { icon } from '../content/icons';

interface Q {
  lvl: 'easy' | 'expert';
  sec: string;
  q: string;
  a: string[];
  c: number;
  why: string;
}

const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function init(section: HTMLElement) {
  const all = tget<Q[]>('quiz') ?? [];
  const texts = tget<{ resultLines: Record<string, string>; shareText: string }>('sections.quiz')!;
  const body = section.querySelector<HTMLElement>('.quiz-body')!;
  const progress = section.querySelector<HTMLElement>('.quiz-progress')!;
  let mode: 'easy' | 'expert' = 'easy';
  let qs: Array<Q & { order: number[] }> = [];
  let i = 0;
  let score = 0;

  const start = () => {
    qs = shuffle(all.filter((q) => q.lvl === mode))
      .slice(0, 12)
      .map((q) => ({ ...q, order: shuffle(q.a.map((_, k) => k)) }));
    i = 0;
    score = 0;
    render();
  };

  const render = () => {
    if (i >= qs.length) return renderResult();
    const q = qs[i];
    progress.textContent = `${t('ui.question')} ${i + 1} ${t('ui.of')} ${qs.length} · ${t('ui.score')}: ${score}`;
    body.innerHTML = `<p class="quiz-q" id="quiz-q">${esc(q.q)}</p>
      <ul class="quiz-answers" role="list" aria-labelledby="quiz-q">${q.order
        .map((k) => `<li><button type="button" data-k="${k}">${esc(q.a[k])}</button></li>`)
        .join('')}</ul>
      <div class="quiz-feedback" aria-live="polite"></div>`;
    const fb = body.querySelector<HTMLElement>('.quiz-feedback')!;
    const buttons = Array.from(body.querySelectorAll<HTMLButtonElement>('.quiz-answers button'));
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        const k = +b.dataset.k!;
        const right = k === q.c;
        if (right) score++;
        buttons.forEach((x) => {
          x.disabled = true;
          if (+x.dataset.k! === q.c) x.classList.add('is-right');
          else if (x === b) x.classList.add('is-wrong');
        });
        fb.innerHTML = `<div class="quiz-why"><strong>${right ? t('ui.correct') : t('ui.wrong')}.</strong> ${esc(q.why)} <a href="#${q.sec}">${t('ui.readMore')}</a></div>
          <div class="control-row quiz-nav"><span class="note">${t('ui.score')}: ${score} / ${i + 1}</span><button type="button" class="btn btn-sm" data-act="next">${t('ui.next')}${icon('arrowRight')}</button></div>`;
        const next = fb.querySelector<HTMLButtonElement>('[data-act="next"]')!;
        next.addEventListener('click', () => {
          i++;
          render();
          body.querySelector<HTMLElement>('.quiz-q')?.focus?.();
        });
        next.focus();
      }),
    );
  };

  const renderResult = () => {
    const total = qs.length;
    const line = score >= total * 0.85 ? texts.resultLines.top : score >= total * 0.5 ? texts.resultLines.mid : texts.resultLines.low;
    const modeName = mode === 'easy' ? t('ui.easy') : t('ui.expert');
    const share = texts.shareText.replace('{score}', String(score)).replace('{total}', String(total)).replace('{mode}', modeName);
    progress.textContent = t('ui.results');
    body.innerHTML = `<p class="note">${t('ui.results')}</p><p class="quiz-score num">${score} / ${total}</p><p>${esc(line)}</p>
      <div class="control-row quiz-nav"><button type="button" class="btn btn-sm" data-act="copy">${icon('copy')}<span class="btn-label">${t('ui.share')}</span></button><button type="button" class="btn btn-sm" data-act="again">${icon('reset')}<span class="btn-label">${t('ui.again')}</span></button></div>
      <p class="note copy-status" aria-live="polite"></p>`;
    body.querySelector('[data-act="again"]')!.addEventListener('click', start);
    body.querySelector('[data-act="copy"]')!.addEventListener('click', async () => {
      const status = body.querySelector<HTMLElement>('.copy-status')!;
      const text = `${share} ${location.origin}${location.pathname}#quiz`;
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = t('ui.copied');
      } catch {
        status.textContent = text;
      }
    });
  };

  bindSeg(section, 'qmode', (v) => {
    mode = v as 'easy' | 'expert';
    start();
  }, 'easy');
  start();
}
