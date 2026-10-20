import { md, plain, esc, type MarkupCtx } from './markup';
import { icon } from './icons';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Dict = any;

export const SITE_URL = 'https://aaadub.github.io/sites/engines/';
export const REPO_URL = 'https://github.com/AAADUB/sites/tree/main/engines';
export const KIT_CSS = 'https://use.typekit.net/qvb0cxr.css';
/** Path prefix the site is served under (same in dev and production). */
export const B = '/sites/engines/';

export const SECTION_ORDER = [
  'big-idea',
  'anatomy',
  'four-stroke',
  'diesel',
  'two-stroke',
  'wankel',
  'layouts',
  'systems',
  'boost',
  'gearbox',
  'efficiency',
  'history',
  'future',
  'lab',
  'compare',
  'games',
  'glossary',
  'quiz',
] as const;

interface Ctx {
  d: Dict;
  m: (s: string) => string;
  lang: 'en' | 'ru';
  num: (id: string) => string;
}

const STROKE_ICON = { intake: 'intake', compression: 'compression', power: 'power', exhaust: 'exhaust' } as const;

function sectionHead(c: Ctx, id: string, s: Dict) {
  return `<header class="sec-head reveal">
      <p class="eyebrow"><span class="num">${c.num(id)}</span><span>${esc(s.title)}</span></p>
      <h2 class="takeaway" id="${id}-h"><span class="sr-only">${esc(s.title)}: </span>${c.m(s.takeaway)}</h2>
      ${s.lede ? `<p class="lede">${c.m(s.lede)}</p>` : ''}
    </header>`;
}

function card(kind: 'see' | 'try' | 'why' | 'safety', label: string, text: string, c: Ctx) {
  return `<div class="card ${kind} reveal"><p class="card-kicker">${icon(kind)}${esc(label)}</p><p>${c.m(text)}</p></div>`;
}

function deeper(c: Ctx, paras: string[]) {
  return `<details class="deeper reveal">
      <summary>${esc(c.d.labels.deeper)}<span class="chev">${icon('plus')}</span></summary>
      <div class="deeper-body">${paras.map((p) => `<p>${c.m(p)}</p>`).join('')}</div>
    </details>`;
}

function stage(id: string, label: string, opts: { poster?: string; extraClass?: string; ui?: string } = {}) {
  const poster = opts.poster ?? id;
  return `<div class="stage ${opts.extraClass ?? ''}" data-stage="${id}" role="img" aria-label="${esc(label)}" data-cursor="cross">
      <img class="stage-poster" src="${B}stills/${poster}.webp" srcset="${B}stills/${poster}-800.webp 800w, ${B}stills/${poster}.webp 1600w" sizes="(min-width: 960px) 60vw, 100vw" alt="" loading="lazy" decoding="async" width="1600" height="1100">
      <div class="stage-loading" aria-hidden="true"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1"/><path class="spin" d="M28 6a22 22 0 0 1 22 22" fill="none" stroke="#ff8a1f" stroke-width="1.5" stroke-linecap="round"/></svg></div>
      <div class="stage-label-layer" aria-hidden="true"></div>
      <div class="stage-ui tr"></div>
      ${opts.ui ?? ''}
    </div>`;
}

function seg(name: string, label: string, items: Array<[string, string]>, active: string, extra = '') {
  return `<div class="seg" role="group" aria-label="${esc(label)}" data-seg="${name}" ${extra}>${items
    .map(([v, t]) => `<button type="button" data-value="${v}" aria-pressed="${v === active}">${esc(t)}</button>`)
    .join('')}</div>`;
}

function slider(id: string, label: string, min: number, max: number, step: number, value: number, out = '') {
  return `<div class="field"><div class="field-top"><label for="${id}">${esc(label)}</label><output for="${id}" id="${id}-out">${out}</output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}

function engineControls(c: Ctx, id: string, o: { load?: 'load' | 'fuel'; scrub?: boolean; views?: boolean; steps?: boolean; maxRpm?: number; minRpm?: number }) {
  const u = c.d.ui;
  const maxRpm = o.maxRpm ?? 7000;
  const minRpm = o.minRpm ?? 800;
  return `<div class="engine-controls" data-controls="${id}">
    <div class="control-row">
      <button type="button" class="btn btn-sm" data-act="play" aria-pressed="true">${icon('pause')}<span class="btn-label">${esc(u.pause)}</span></button>
      ${seg('speed', u.speed, [['1', '1×'], ['0.25', '0.25×'], ['0.05', '0.05×']], '0.05')}
      ${o.views !== false ? seg('view', u.view, [['solid', u.vSolid], ['cutaway', u.vCutaway], ['xray', u.vXray], ['exploded', u.vExploded]], 'cutaway') : ''}
      <label class="switch"><input type="checkbox" data-act="labels"> ${esc(u.labels)}</label>
    </div>
    <p class="note speed-note" hidden>${esc(u.realSpeedNote)}</p>
    <div class="controls">
      ${slider(`${id}-rpm`, u.rpm, minRpm, maxRpm, 50, minRpm)}
      ${o.load ? slider(`${id}-load`, o.load === 'fuel' ? u.fuel : u.load, 0, 100, 1, 30) : ''}
      ${o.scrub !== false ? slider(`${id}-crank`, u.crankAngle, 0, 720, 1, 0) : ''}
    </div>
    ${
      o.steps !== false
        ? `<div class="steps" role="group" aria-label="${esc(u.stroke)}">${(['intake', 'compression', 'power', 'exhaust'] as const)
            .map(
              (k, i) =>
                `<button type="button" data-stroke="${k}" data-step="${i}" aria-pressed="false"><span class="snum">${icon(STROKE_ICON[k])} ${i + 1}</span><span class="sname">${esc(u.strokes[k])}</span></button>`,
            )
            .join('')}</div>`
        : ''
    }
    <p class="note kbd-note">${c.lang === 'ru' ? 'Клавиши: <kbd>Пробел</kbd> — пауза, <kbd>←</kbd> <kbd>→</kbd> — 1°, с <kbd>Shift</kbd> — 10°.' : 'Keys: <kbd>Space</kbd> play/pause, <kbd>←</kbd> <kbd>→</kbd> 1°, with <kbd>Shift</kbd> 10°.'}</p>
  </div>`;
}

function readouts(_c: Ctx, id: string, items: Array<[string, string]>) {
  return `<dl class="readouts" data-readouts="${id}" aria-live="off">${items
    .map(([k, label]) => `<div class="readout" data-r="${k}"><dt>${esc(label)}</dt><dd>–</dd></div>`)
    .join('')}</dl>`;
}

/* ------------------------------------------------------------------ sections */

function hero(c: Ctx) {
  const h = c.d.hero;
  return `<section id="top" class="hero" aria-labelledby="hero-title">
    <div class="stage hero-stage" data-stage="hero" role="img" aria-label="${esc(h.stageLabel)}">
      <img class="stage-poster hero-poster" src="${B}stills/hero.webp" srcset="${B}stills/hero-800.webp 800w, ${B}stills/hero.webp 1600w, ${B}stills/hero-2400.webp 2400w" sizes="100vw" alt="" fetchpriority="high" decoding="async" width="1600" height="1000">
      <div class="stage-label-layer" aria-hidden="true"></div>
    </div>
    <div class="hero-copy wrap">
      <p class="hero-kicker">${esc(h.kicker)}</p>
      <h1 class="hero-title" id="hero-title">${esc(h.title)}</h1>
      <p class="hero-sub">${esc(h.sub)}</p>
      <div class="hero-cta"><a class="btn btn-primary magnetic" href="#big-idea"><span class="btn-label">${esc(h.cta)}</span>${icon('arrowRight')}</a></div>
    </div>
    <a class="scroll-cue" href="#big-idea" aria-label="${esc(h.scroll)}"><span class="scroll-line" aria-hidden="true"></span><span class="scroll-text">${esc(h.scroll)}</span></a>
  </section>`;
}

function bigIdea(c: Ctx) {
  const s = c.d.sections['big-idea'];
  return `<section class="sec sec-story" id="big-idea" aria-labelledby="big-idea-h">
    <div class="wrap">
      ${sectionHead(c, 'big-idea', s)}
      <div class="sec-body">
        <div class="stage-col sticky story-stage">${stage('bigIdea', s.see)}</div>
        <div class="text-col">
          <ol class="beats">${s.beats
            .map(
              (b: Dict, i: number) =>
                `<li class="beat" data-beat="${i}"><span class="beat-num num">${b.k}</span><h3>${c.m(b.h)}</h3><p>${c.m(b.t)}</p></li>`,
            )
            .join('')}</ol>
          <div class="beat-steps" role="group" aria-label="${esc(c.d.ui.step)}">${s.beats
            .map((b: Dict, i: number) => `<button type="button" class="btn btn-sm" data-beat-btn="${i}" aria-pressed="${i === 0}">${b.k} ${esc(b.h)}</button>`)
            .join('')}</div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${card('safety', c.d.labels.safety, s.safety, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function anatomy(c: Ctx) {
  const s = c.d.sections.anatomy;
  const u = c.d.ui;
  return `<section class="sec" id="anatomy" aria-labelledby="anatomy-h">
    <div class="wrap">
      ${sectionHead(c, 'anatomy', s)}
      <div class="sec-body">
        <div class="stage-col sticky">${stage('anatomy', s.see, { ui: `<div class="stage-ui tl"><span class="chip find-chip" hidden></span></div>` })}</div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="anatomy-tools reveal">
            <div class="control-row">
              ${seg('amode', u.view, [['build', u.assemble], ['find', u.findPart]], 'build')}
            </div>
            <div class="build-panel">
              <div class="control-row">
                <button type="button" class="btn btn-sm" data-act="prev">${icon('arrowLeft')}<span class="btn-label">${esc(u.prev)}</span></button>
                <button type="button" class="btn btn-sm btn-build" data-act="build">${icon('build')}<span class="btn-label">${esc(u.assemble)}</span></button>
                <button type="button" class="btn btn-sm" data-act="next"><span class="btn-label">${esc(u.next)}</span>${icon('arrowRight')}</button>
                <span class="note step-count" aria-live="polite"></span>
              </div>
              <ol class="assembly">${s.steps
                .map((st: Dict, i: number) => `<li><button type="button" class="asm-step" data-step="${i}" data-key="${st.key}"><span class="num">${String(i + 1).padStart(2, '0')}</span><span>${c.m(st.t)}</span></button></li>`)
                .join('')}</ol>
            </div>
            <div class="find-panel" hidden>
              <p class="find-prompt" aria-live="polite"></p>
              <p class="find-feedback note" aria-live="polite"></p>
              <div class="control-row"><button type="button" class="btn btn-sm" data-act="find-start">${icon('target')}<span class="btn-label">${esc(u.start)}</span></button><span class="note find-score"></span></div>
            </div>
          </div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function fourStroke(c: Ctx) {
  const s = c.d.sections['four-stroke'];
  const u = c.d.ui;
  return `<section class="sec sec-fourstroke" id="four-stroke" aria-labelledby="four-stroke-h">
    <div class="wrap">
      ${sectionHead(c, 'four-stroke', s)}
      <div class="sec-body">
        <div class="stage-col sticky sticky-mobile">
          ${stage('fourStroke', s.see, { ui: `<div class="stage-ui tl"><span class="chip stroke-chip" aria-hidden="true"><span class="dot"></span><span class="stroke-name"></span></span></div>` })}
          ${readouts(c, 'fs', [
            ['angle', u.crankAngle],
            ['stroke', u.stroke],
            ['piston', u.piston],
            ['pressure', u.pressure],
            ['valves', u.valves],
            ['spark', u.spark],
          ])}
        </div>
        <div class="text-col">
          ${card('see', c.d.labels.see, s.see, c)}
          <ol class="stroke-cards">${s.strokes
            .map(
              (st: Dict) =>
                `<li class="stroke-card card" data-stroke-card="${st.key}"><p class="card-kicker c-${st.key}">${icon(STROKE_ICON[st.key as keyof typeof STROKE_ICON])}<span>${esc(u.strokeVerbs[st.key])}</span></p><h3>${esc(st.h)}</h3><p>${c.m(st.t)}</p></li>`,
            )
            .join('')}</ol>
          <div class="controls-panel reveal" id="four-stroke-controls">
            <h3 class="panel-title">${esc(s.controlsTitle)}</h3>
            ${card('try', c.d.labels.try, s.try, c)}
            ${engineControls(c, 'fs', { load: 'load' })}
          </div>
          <div class="pv-panel reveal">
            <h3 class="panel-title">${esc(s.pvTitle)}</h3>
            <div class="pv-mini" data-pv="fs" role="img" aria-label="${esc(plain(s.pvCaption))}"></div>
            <p class="note">${c.m(s.pvCaption)}</p>
          </div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function diesel(c: Ctx) {
  const s = c.d.sections.diesel;
  const u = c.d.ui;
  return `<section class="sec" id="diesel" aria-labelledby="diesel-h">
    <div class="wrap">
      ${sectionHead(c, 'diesel', s)}
      <div class="sec-body flip">
        <div class="stage-col sticky">
          ${stage('diesel', s.see, { ui: `<div class="stage-ui tl"><span class="chip stroke-chip" aria-hidden="true"><span class="dot"></span><span class="stroke-name"></span></span></div>` })}
          ${readouts(c, 'ds', [
            ['angle', u.crankAngle],
            ['stroke', u.stroke],
            ['pressure', u.pressure],
            ['temp', u.temperature],
            ['injection', u.injection],
          ])}
          ${engineControls(c, 'ds', { load: 'fuel', maxRpm: 4500, minRpm: 750, scrub: false, steps: false })}
        </div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="cards">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
          <div class="card reveal"><h3>${esc(s.dirtyTitle)}</h3><p>${c.m(s.dirty)}</p></div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function twoStroke(c: Ctx) {
  const s = c.d.sections['two-stroke'];
  const u = c.d.ui;
  return `<section class="sec" id="two-stroke" aria-labelledby="two-stroke-h">
    <div class="wrap">
      ${sectionHead(c, 'two-stroke', s)}
      <div class="sec-body">
        <div class="stage-col sticky">
          ${stage('twoStroke', s.see, { ui: `<div class="stage-ui tl"><span class="chip port-chip" aria-hidden="true"></span></div>` })}
          ${readouts(c, 'ts', [
            ['angle', u.crankAngle],
            ['phase', u.stroke],
            ['pressure', u.pressure],
            ['ports', u.valves],
          ])}
          ${engineControls(c, 'ts', { maxRpm: 9000, minRpm: 1400, steps: false, views: false, scrub: true })}
        </div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="cards">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
          ${card('why', c.d.labels.why, s.why, c)}
          <div class="card reveal"><h3>${esc(s.marineTitle)}</h3><p>${c.m(s.marine)}</p></div>
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function wankel(c: Ctx) {
  const s = c.d.sections.wankel;
  const u = c.d.ui;
  return `<section class="sec" id="wankel" aria-labelledby="wankel-h">
    <div class="wrap">
      ${sectionHead(c, 'wankel', s)}
      <div class="sec-body flip">
        <div class="stage-col sticky">
          ${stage('wankel', s.see)}
          ${readouts(c, 'wk', [
            ['rotor', u.rotorTurns],
            ['shaft', u.shaftTurns],
            ['ratio', '3 : 1'],
          ])}
          <div class="engine-controls" data-controls="wk">
            <div class="control-row">
              <button type="button" class="btn btn-sm" data-act="play" aria-pressed="true">${icon('pause')}<span class="btn-label">${esc(u.pause)}</span></button>
              ${seg('speed', u.speed, [['1', '1×'], ['0.25', '0.25×'], ['0.05', '0.05×']], '0.05')}
              <label class="switch"><input type="checkbox" data-act="labels"> ${esc(u.labels)}</label>
            </div>
            <div class="controls">${slider('wk-rpm', u.rpm, 1000, 9000, 50, 1000)}</div>
            <ul class="legend">${(['intake', 'compression', 'power', 'exhaust'] as const)
              .map((k) => `<li class="c-${k}">${icon(STROKE_ICON[k])}<span>${esc(u.strokes[k])}</span></li>`)
              .join('')}</ul>
          </div>
        </div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="cards">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function layouts(c: Ctx) {
  const s = c.d.sections.layouts;
  const u = c.d.ui;
  const ids = ['i4', 'i6', 'v8cross', 'v8flat', 'boxer4'];
  return `<section class="sec" id="layouts" aria-labelledby="layouts-h">
    <div class="wrap">
      ${sectionHead(c, 'layouts', s)}
      <div class="sec-body">
        <div class="stage-col sticky">
          ${stage('layouts', s.see)}
          <div class="layout-bar">
            ${seg('layout', u.view, ids.map((k) => [k, s.layouts[k].name] as [string, string]), 'i4')}
          </div>
        </div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="layout-info card reveal">
            <h3 class="layout-name">${esc(s.layouts.i4.name)}</h3>
            <p class="layout-text">${c.m(s.layouts.i4.t)}</p>
            <div class="layout-widgets">
              <figure class="firing-dial" data-firing-dial><figcaption class="note">${esc(u.firingOrder)}: <span class="fo num"></span> ${'<span class="tag-typical">' + esc(c.d.tags.example) + '</span>'}</figcaption></figure>
              <div class="vib-meter" data-vib><div class="vib-row"><span>${esc(u.primary)}</span><span class="vib-bar"><i data-vib-p></i></span><span class="vib-val note" data-vib-pv></span></div><div class="vib-row"><span>${esc(u.secondary)}</span><span class="vib-bar"><i data-vib-s></i></span><span class="vib-val note" data-vib-sv></span></div></div>
            </div>
            <p class="note">${c.m(s.orderNote)}</p>
          </div>
          <template id="layout-texts">${ids.map((k) => `<div data-k="${k}"><h3>${esc(s.layouts[k].name)}</h3><p>${c.m(s.layouts[k].t)}</p></div>`).join('')}</template>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function systems(c: Ctx) {
  const s = c.d.sections.systems;
  const ids = ['fuel', 'ignition', 'oil', 'cooling', 'exhaust'];
  return `<section class="sec" id="systems" aria-labelledby="systems-h">
    <div class="wrap">
      ${sectionHead(c, 'systems', s)}
      <div class="sec-body flip">
        <div class="stage-col sticky">${stage('systems', s.see)}</div>
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="sys-tabs reveal" role="tablist" aria-label="${esc(s.title)}">${ids
            .map((k, i) => `<button type="button" role="tab" id="sys-tab-${k}" aria-controls="sys-panel-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-sys="${k}">${esc(s.tabs[k].name)}</button>`)
            .join('')}</div>
          ${ids
            .map(
              (k, i) => `<div class="sys-panel card" role="tabpanel" id="sys-panel-${k}" aria-labelledby="sys-tab-${k}" ${i === 0 ? '' : 'hidden'} data-sys-panel="${k}">
            <div class="sys-diagram" data-sys-diagram="${k}"></div>
            <h3>${esc(s.tabs[k].h)}</h3><p>${c.m(s.tabs[k].t)}</p></div>`,
            )
            .join('')}
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function boost(c: Ctx) {
  const s = c.d.sections.boost;
  const u = c.d.ui;
  return `<section class="sec" id="boost" aria-labelledby="boost-h">
    <div class="wrap">
      ${sectionHead(c, 'boost', s)}
      <div class="boost-grid">
        <div class="card boost-diagram-card reveal">
          <div class="control-row">${seg('charger', u.mode, [['turbo', u.turboCh], ['super', u.superCh]], 'turbo')}</div>
          <div class="boost-diagram" data-boost-diagram role="img" aria-label="${esc(s.see)}"></div>
        </div>
        <div class="card reveal">
          ${slider('boost-bar', u.boost, 0, 1.5, 0.05, 0.8)}
          <div class="boost-chart" data-boost-chart role="img" aria-label="${esc(u.torque)}"></div>
        </div>
        <div class="card reveal">
          <h3>${esc(s.lagTitle)}</h3>
          <p>${c.m(s.lag)}</p>
          <div class="control-row"><button type="button" class="btn btn-sm" data-act="lag">${icon('gauge')}<span class="btn-label">${esc(u.accelerate)}</span></button></div>
          <div class="lag-chart" data-lag-chart role="img" aria-label="${esc(u.turboLag)}"></div>
        </div>
      </div>
      <div class="sec-body">
        <div class="text-col full-span">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="cards cards-4">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
      </div>
    </div>
  </section>`;
}

function gearbox(c: Ctx) {
  const s = c.d.sections.gearbox;
  const u = c.d.ui;
  return `<section class="sec" id="gearbox" aria-labelledby="gearbox-h">
    <div class="wrap">
      ${sectionHead(c, 'gearbox', s)}
      <div class="gear-grid">
        <div class="card gear-demo reveal" data-gear-demo>
          <div class="gear-gauges" role="img" aria-label="${esc(s.see)}"></div>
          <div class="control-row gear-buttons" role="group" aria-label="${esc(u.gear)}">${['N', '1', '2', '3', '4', '5', '6']
            .map((g) => `<button type="button" class="btn btn-sm gear-btn" data-gear="${g}" aria-pressed="${g === '1'}">${g}</button>`)
            .join('')}</div>
          <div class="control-row">
            <button type="button" class="btn btn-sm" data-act="accel" aria-pressed="false">${icon('gauge')}<span class="btn-label">${esc(u.accelerate)}</span></button>
            <button type="button" class="btn btn-sm" data-act="brake" aria-pressed="false"><span class="btn-label">${esc(u.brake)}</span></button>
          </div>
        </div>
        <div class="card reveal"><div class="gear-chart" data-gear-chart role="img" aria-label="${esc(u.roadSpeed)}"></div></div>
      </div>
      <div class="sec-body"><div class="text-col full-span">
        ${card('try', c.d.labels.try, s.try, c)}
        <div class="cards cards-3">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
        ${card('why', c.d.labels.why, s.why, c)}
        ${deeper(c, s.deeper)}
      </div></div>
    </div>
  </section>`;
}

function efficiency(c: Ctx) {
  const s = c.d.sections.efficiency;
  const u = c.d.ui;
  return `<section class="sec" id="efficiency" aria-labelledby="efficiency-h">
    <div class="wrap">
      ${sectionHead(c, 'efficiency', s)}
      <div class="card sankey-card reveal">
        <div class="control-row">${seg('sankey', u.type, [['petrol', u.petrol], ['diesel', u.dieselFuel]], 'petrol')}</div>
        <div class="sankey" data-sankey role="img" aria-label="${esc(s.see)}"></div>
        <p class="note">${c.m(s.sankey.note)}</p>
      </div>
      <div class="sec-body">
        <div class="text-col">
          ${card('try', c.d.labels.try, s.try, c)}
          <div class="cards">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
          ${card('why', c.d.labels.why, s.why, c)}
          ${deeper(c, s.deeper)}
        </div>
        <div class="stage-col">
          <div class="card hybrid-card reveal">
            <h3>${esc(s.hybrid.title)}</h3>
            <div class="control-row">${seg('hybrid', u.mode, [['stopped', u.stopped], ['accelerate', u.accelerate], ['cruise', u.cruise], ['brake', u.brake]], 'accelerate')}</div>
            <div class="hybrid-diagram" data-hybrid role="img"></div>
            <p class="hybrid-text" aria-live="polite">${esc(s.hybrid.modes.accelerate)}</p>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function history(c: Ctx) {
  const s = c.d.sections.history;
  return `<section class="sec sec-history" id="history" aria-labelledby="history-h">
    <div class="wrap">${sectionHead(c, 'history', s)}</div>
    <div class="timeline" data-timeline>
      <ol class="timeline-track" tabindex="0" aria-label="${esc(s.title)}">${s.items
        .map((it: Dict) => `<li class="tl-item"><span class="tl-year num">${esc(it.year)}</span><h3>${esc(it.h)}</h3><p>${c.m(it.t)}</p></li>`)
        .join('')}</ol>
    </div>
  </section>`;
}

function future(c: Ctx) {
  const s = c.d.sections.future;
  return `<section class="sec" id="future" aria-labelledby="future-h">
    <div class="wrap">
      ${sectionHead(c, 'future', s)}
      <div class="cards cards-4">${s.cards.map((k: Dict) => `<div class="card reveal"><h3>${c.m(k.h)}</h3><p>${c.m(k.t)}</p></div>`).join('')}</div>
    </div>
  </section>`;
}

function lab(c: Ctx) {
  const s = c.d.sections.lab;
  const u = c.d.ui;
  const T = s.tools;
  return `<section class="sec" id="lab" aria-labelledby="lab-h">
    <div class="wrap">
      ${sectionHead(c, 'lab', s)}
      <div class="lab-grid">
        <div class="card tool tool-pv reveal">
          <h3>${esc(T.pv.h)}</h3><p class="note">${c.m(T.pv.t)}</p>
          <div class="control-row">${seg('pvscale', u.view, [['lin', u.linear], ['log', u.logLog]], 'lin')}
            <label class="switch"><input type="checkbox" data-ov="otto" checked> ${esc(u.otto)}</label>
            <label class="switch"><input type="checkbox" data-ov="diesel"> ${esc(u.dieselCycle)}</label>
            <label class="switch"><input type="checkbox" data-ov="atkinson"> ${esc(u.atkinson)}</label>
          </div>
          <div class="pv-big" data-pv="lab" role="img" aria-label="${esc(plain(T.pv.t))}"></div>
        </div>
        <div class="card tool tool-valve reveal">
          <h3>${esc(T.valve.h)}</h3><p class="note">${c.m(T.valve.t)}</p>
          <div class="valve-wheel" data-valve-wheel role="group" aria-label="${esc(T.valve.h)}"></div>
          <div class="controls">
            ${slider('vw-in', u.intakeCam, -40, 40, 1, 0)}
            ${slider('vw-ex', u.exhaustCam, -40, 40, 1, 0)}
          </div>
        </div>
        <div class="card tool tool-disp reveal" data-disp>
          <h3>${esc(T.disp.h)}</h3><p class="note">${c.m(T.disp.t)}</p>
          <div class="control-row preset-row">${Object.entries(s.presets)
            .map(([k, v]) => `<button type="button" class="btn btn-sm" data-preset="${k}">${esc(v as string)}</button>`)
            .join('')}</div>
          <div class="controls">
            ${slider('dp-bore', u.bore, 40, 140, 1, 86)}
            ${slider('dp-stroke', u.strokeLen, 40, 160, 1, 86)}
            ${slider('dp-cyl', u.cylinders, 1, 12, 1, 4)}
          </div>
          <div class="formula disp-formula" aria-live="polite"></div>
          <div class="disp-viz" aria-hidden="true"></div>
        </div>
        <div class="card tool tool-cr reveal" data-cr>
          <h3>${esc(T.cr.h)}</h3><p class="note">${c.m(T.cr.t)}</p>
          ${slider('cr-r', u.compressionRatio, 6, 24, 0.5, 10.5)}
          <div class="cr-chart" role="img" aria-label="${esc(T.cr.h)}"></div>
          <p class="note">${c.m(s.crNote)}</p>
        </div>
        <div class="card tool tool-curve reveal" data-curve>
          <h3>${esc(T.curve.h)}</h3><p class="note">${c.m(T.curve.t)}</p>
          <div class="control-row">
            ${seg('ctype', u.type, [['petrol', u.petrol], ['diesel', u.dieselFuel]], 'petrol')}
            ${seg('casp', u.aspiration, [['na', u.na], ['turbo', u.turbo]], 'na')}
          </div>
          ${slider('cv-disp', u.displacement, 0.6, 6, 0.1, 2)}
          <div class="curve-chart" role="img" aria-label="${esc(T.curve.h)}"></div>
          <p class="note">${c.m(s.powerNote)}</p>
        </div>
      </div>
    </div>
  </section>`;
}

function compare(c: Ctx) {
  const s = c.d.sections.compare;
  const u = c.d.ui;
  const ids = ['petrol', 'diesel', 'two', 'wankel'];
  const opts = (sel: string) => ids.map((k) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(s.engines[k].name)}</option>`).join('');
  const rows = ['strokes', 'parts', 'eff', 'emissions', 'density', 'complexity', 'uses'];
  return `<section class="sec" id="compare" aria-labelledby="compare-h">
    <div class="wrap">
      ${sectionHead(c, 'compare', s)}
      <div class="compare-pickers control-row">
        <label class="select"><span>${esc(u.engineA)}</span><select data-cmp="a">${opts('petrol')}</select></label>
        <label class="select"><span>${esc(u.engineB)}</span><select data-cmp="b">${opts('wankel')}</select></label>
        <button type="button" class="btn btn-sm" data-act="play" aria-pressed="true">${icon('pause')}<span class="btn-label">${esc(u.pause)}</span></button>
      </div>
      ${stage('compare', s.see, { extraClass: 'stage-wide' })}
      <div class="table-wrap reveal"><table class="cmp-table">
        <thead><tr><th scope="col"><span class="sr-only">—</span></th><th scope="col" data-cmp-h="a"></th><th scope="col" data-cmp-h="b"></th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-row="${r}"><th scope="row">${esc(s.rows[r])}</th><td data-col="a"></td><td data-col="b"></td></tr>`).join('')}</tbody>
      </table></div>
      <template id="cmp-data">${esc(JSON.stringify(s.engines))}</template>
    </div>
  </section>`;
}

function games(c: Ctx) {
  const s = c.d.sections.games;
  const u = c.d.ui;
  return `<section class="sec" id="games" aria-labelledby="games-h">
    <div class="wrap">
      ${sectionHead(c, 'games', s)}
      <div class="games-grid">
        <div class="card game reveal" data-game="order">
          <h3>${esc(s.order.h)}</h3><p class="note">${c.m(s.order.t)}</p>
          <ol class="order-list" aria-live="polite"></ol>
          <div class="control-row"><button type="button" class="btn btn-sm" data-act="check">${icon('check')}<span class="btn-label">${esc(u.check)}</span></button><button type="button" class="btn btn-sm" data-act="shuffle">${icon('reset')}<span class="btn-label">${esc(u.shuffle)}</span></button></div>
          <p class="game-feedback" aria-live="polite"></p>
        </div>
        <div class="card game reveal" data-game="find">
          <h3>${esc(s.find.h)}</h3><p class="note">${c.m(s.find.t)}</p>
          <div class="control-row"><a class="btn btn-sm" href="#anatomy" data-act="find-go">${icon('target')}<span class="btn-label">${esc(s.find.go)}</span></a></div>
        </div>
        <div class="card game reveal" data-game="guess">
          <h3>${esc(s.guess.h)}</h3><p class="note">${c.m(s.guess.t)}</p>
          <div class="pulse-dial" aria-hidden="true"></div>
          <div class="control-row"><button type="button" class="btn btn-sm" data-act="listen">${icon('listen')}<span class="btn-label">${esc(u.start)}</span></button></div>
          <div class="guess-options control-row" role="group"></div>
          <p class="note guess-hint">${esc(s.guess.soundHint)}</p>
          <p class="game-feedback" aria-live="polite"></p>
        </div>
      </div>
    </div>
  </section>`;
}

function glossary(c: Ctx) {
  const s = c.d.sections.glossary;
  const items = [...c.d.glossary].sort((a: Dict, b: Dict) => a.term.localeCompare(b.term, c.lang));
  return `<section class="sec" id="glossary" aria-labelledby="glossary-h">
    <div class="wrap">
      ${sectionHead(c, 'glossary', s)}
      <div class="glossary-tools"><label class="search">${icon('search')}<span class="sr-only">${esc(c.d.ui.searchGlossary)}</span><input type="search" placeholder="${esc(c.d.ui.searchGlossary)}" data-glossary-search autocomplete="off" spellcheck="false"></label><span class="note glossary-count" aria-live="polite"></span></div>
      <dl class="glossary-list">${items
        .map((g: Dict) => `<div class="gl-item" id="g-${g.key}" data-term-key="${g.key}"><dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd></div>`)
        .join('')}</dl>
      <p class="note glossary-empty" hidden>${esc(c.d.ui.noResults)}</p>
    </div>
  </section>`;
}

function quiz(c: Ctx) {
  const s = c.d.sections.quiz;
  const u = c.d.ui;
  return `<section class="sec" id="quiz" aria-labelledby="quiz-h">
    <div class="wrap">
      ${sectionHead(c, 'quiz', s)}
      <div class="quiz card reveal" data-quiz>
        <div class="control-row quiz-top">${seg('qmode', u.mode, [['easy', u.easy], ['expert', u.expert]], 'easy')}<span class="note quiz-progress" aria-live="polite"></span></div>
        <div class="quiz-body" aria-live="polite"></div>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ page */

export function renderPage(d: Dict, lang: 'en' | 'ru'): { head: string; body: string } {
  const gmap: Record<string, { term: string }> = {};
  for (const g of d.glossary) gmap[g.key] = { term: g.term };
  const mctx: MarkupCtx = { glossary: gmap, tags: d.tags };
  const c: Ctx = {
    d,
    lang,
    m: (s: string) => md(s, mctx),
    num: (id: string) => String(SECTION_ORDER.indexOf(id as (typeof SECTION_ORDER)[number]) + 1).padStart(2, '0'),
  };
  const url = lang === 'en' ? SITE_URL : SITE_URL + 'ru/';
  const ogImg = `${SITE_URL}og-${lang}.png`;
  const head = `
    <title>${esc(d.meta.title)}</title>
    <meta name="description" content="${esc(d.meta.description)}">
    <link rel="canonical" href="${url}">
    <link rel="alternate" hreflang="en" href="${SITE_URL}">
    <link rel="alternate" hreflang="ru" href="${SITE_URL}ru/">
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(d.meta.siteName)}">
    <meta property="og:title" content="${esc(d.meta.title)}">
    <meta property="og:description" content="${esc(d.meta.description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:locale" content="${d.meta.locale}">
    <meta property="og:locale:alternate" content="${lang === 'en' ? 'ru_RU' : 'en_US'}">
    <meta property="og:image" content="${ogImg}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(d.meta.ogAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(d.meta.title)}">
    <meta name="twitter:description" content="${esc(d.meta.description)}">
    <meta name="twitter:image" content="${ogImg}">
    <meta name="theme-color" content="#08090b">
    <link rel="icon" href="${B}favicon.svg" type="image/svg+xml">
    <link rel="icon" href="${B}favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="${B}apple-touch-icon.png">
    <link rel="manifest" href="${B}${lang === 'ru' ? 'manifest-ru.webmanifest' : 'manifest.webmanifest'}">
    <link rel="preconnect" href="https://use.typekit.net" crossorigin>
    <link rel="preconnect" href="https://p.typekit.net" crossorigin>
    <link rel="stylesheet" href="${KIT_CSS}" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="${KIT_CSS}"></noscript>
    <link rel="preload" as="image" href="${B}stills/hero.webp" imagesrcset="${B}stills/hero-800.webp 800w, ${B}stills/hero.webp 1600w, ${B}stills/hero-2400.webp 2400w" imagesizes="100vw" fetchpriority="high">
    <style>html{background:#08090b;color:#e8eaed;color-scheme:dark}body{margin:0;background:#08090b}.preloader{position:fixed;inset:0;z-index:400;display:grid;place-items:center;background:#08090b;animation:pl-out .4s ease .8s forwards}.preloader svg{width:64px;height:64px}.preloader .needle{transform-origin:32px 32px;animation:pl-spin 1s cubic-bezier(.65,0,.35,1) infinite}@keyframes pl-spin{to{transform:rotate(360deg)}}@keyframes pl-out{to{opacity:0;visibility:hidden}}html.loaded .preloader{animation:pl-out .35s ease forwards}@media (prefers-reduced-motion:reduce){.preloader{display:none}}</style>
    <script>(function(){var d=document.documentElement;d.className=d.className.replace('no-js','js');try{var s=JSON.parse(localStorage.getItem('ic-settings-v1')||'{}');var r=s.motion==='reduced'||(s.motion!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches);d.setAttribute('data-motion',r?'reduced':'full');if(s.quality&&s.quality!=='auto')d.setAttribute('data-quality',s.quality)}catch(e){}})();</script>`;

  const navItems = ['top', ...SECTION_ORDER];
  const nav = (cls: string) =>
    `<ol class="${cls}">${navItems
      .map(
        (id) =>
          `<li><a href="#${id}" data-nav="${id}"><span class="tick" aria-hidden="true"></span><span class="num rail-num">${id === 'top' ? '00' : c.num(id)}</span><span class="rail-label">${esc(d.nav[id])}</span></a></li>`,
      )
      .join('')}</ol>`;

  const langSwitch = `<nav class="lang-switch" aria-label="${esc(d.header.lang)}"><a href="${B}" hreflang="en" lang="en" ${lang === 'en' ? 'aria-current="page"' : ''} data-lang-link>EN</a><a href="${B}ru/" hreflang="ru" lang="ru" ${lang === 'ru' ? 'aria-current="page"' : ''} data-lang-link>RU</a></nav>`;

  const header = `
  <a class="skip-link" href="#main">${esc(d.header.skip)}</a>
  <div class="preloader" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/><path d="M32 2v6M32 56v6M2 32h6M56 32h6" stroke="rgba(255,255,255,.3)" stroke-width="1"/><g class="needle"><path d="M32 32 32 9" stroke="#ff8a1f" stroke-width="2" stroke-linecap="round"/></g><circle cx="32" cy="32" r="3" fill="#ff8a1f"/></svg></div>
  <div class="backdrop" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>
  <header class="site-header is-top">
    <a class="brand" href="#top" aria-label="${esc(d.header.home)}">${icon('logo')}<span class="brand-name">${esc(d.meta.siteName)}</span></a>
    <div class="header-current"><button type="button" class="sections-btn" aria-haspopup="dialog" aria-controls="sheet" aria-expanded="false" data-act="sheet">${icon('menu')}<span class="num">00</span><span class="cur">${esc(d.nav.top)}</span></button></div>
    <div class="header-actions">
      ${langSwitch}
      <button type="button" class="btn btn-icon" data-act="sound" aria-pressed="false" aria-label="${esc(d.header.sound)}" title="${esc(d.header.sound)}">${icon('mute')}</button>
      <button type="button" class="btn btn-icon" data-act="settings" aria-expanded="false" aria-controls="settings" aria-label="${esc(d.header.settings)}" title="${esc(d.header.settings)}">${icon('settings')}</button>
    </div>
  </header>
  <div class="settings-panel" id="settings" role="dialog" aria-modal="false" aria-labelledby="settings-title" hidden>
    <h2 id="settings-title">${esc(d.settings.title)}</h2>
    <div class="settings-group"><span id="set-q">${esc(d.settings.quality)}</span>${seg('quality', d.settings.quality, [['auto', d.settings.qAuto], ['high', d.settings.qHigh], ['medium', d.settings.qMedium], ['low', d.settings.qLow]], 'auto')}</div>
    <div class="settings-group"><span>${esc(d.settings.motion)}</span>${seg('motion', d.settings.motion, [['system', d.settings.mSystem], ['reduced', d.settings.mReduced], ['full', d.settings.mFull]], 'system')}</div>
    <div class="settings-group"><span>${esc(d.settings.power)}</span>${seg('power', d.settings.power, [['kw', d.settings.kw], ['hp', d.settings.hp]], 'kw')}</div>
    <div class="settings-group"><label class="switch"><input type="checkbox" data-act="sound-toggle"> ${esc(d.settings.sound)}</label><span class="note">${esc(d.settings.soundNote)}</span></div>
  </div>
  <nav class="rail" aria-label="${esc(d.header.sectionsTitle)}"><span class="rail-progress" aria-hidden="true"><i></i></span>${nav('rail-list')}</nav>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.header.sectionsTitle)}" hidden>
    <div class="sheet-panel"><div class="sheet-grip" aria-hidden="true"></div>
      <div class="control-row sheet-head"><strong>${esc(d.header.sectionsTitle)}</strong><button type="button" class="btn btn-icon" data-act="sheet-close" aria-label="${esc(d.header.close)}">${icon('close')}</button></div>
      ${nav('sheet-list')}
    </div>
  </div>`;

  const sections = [hero(c), bigIdea(c), anatomy(c), fourStroke(c), diesel(c), twoStroke(c), wankel(c), layouts(c), systems(c), boost(c), gearbox(c), efficiency(c), history(c), future(c), lab(c), compare(c), games(c), glossary(c), quiz(c)].join('\n');

  const footer = `<footer class="site-footer">
    <div class="footer-grid">
      <div><p class="footer-name">${esc(d.meta.siteName)}</p><p>© <span class="num">${new Date().getFullYear()}</span></p></div>
      <p>${esc(d.footer.accuracy)}</p>
      <div class="footer-links"><p><span class="note">${esc(d.footer.language)}:</span> ${langSwitch}</p><p><a href="${REPO_URL}" rel="noopener">${icon('github')}<span>${esc(d.footer.source)}</span></a></p></div>
    </div>
  </footer>`;

  const runtime = {
    ui: d.ui,
    parts: d.parts,
    labels: d.labels,
    glossary: d.glossary,
    quiz: d.quiz,
    nav: d.nav,
    sections: {
      'big-idea': { beats: d.sections['big-idea'].beats.map((b: Dict) => ({ h: plain(b.h) })) },
      anatomy: { steps: d.sections.anatomy.steps.map((x: Dict) => ({ key: x.key })) },
      layouts: Object.fromEntries(Object.entries(d.sections.layouts.layouts).map(([k, v]) => [k, (v as Dict).name])),
      efficiency: { sankey: d.sections.efficiency.sankey, hybrid: d.sections.efficiency.hybrid.modes },
      games: d.sections.games,
      quiz: d.sections.quiz,
      compare: d.sections.compare.engines,
      lab: { presets: d.sections.lab.presets },
    },
    tags: d.tags,
  };

  const body = `${header}
  <main id="main">${sections}</main>
  ${footer}
  <div class="cursor" aria-hidden="true"></div><div class="cursor-hint" aria-hidden="true"></div>
  <script id="ic-data" type="application/json">${JSON.stringify(runtime).replace(/</g, '\\u003c')}</script>`;
  return { head, body };
}
