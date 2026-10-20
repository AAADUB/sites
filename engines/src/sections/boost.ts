import { bindRange, bindSeg } from '../ui/chrome';
import { getLang, t } from '../ui/i18n';
import { s, svgRoot, pathD, scale, axes, setAttrs } from '../ui/svg';
import { boostedTorque, torqueAt } from '../physics/torque';
import { fmt, withUnit } from '../physics/units';
import { COLORS } from '../core/tokens';
import { niceTicks } from '../ui/pv';
import { onTick } from '../core/clock';
import { reducedMotion } from '../core/settings';

const L = (k: string) => t(`ui.diag.${k}`);

function wheel(cx: number, cy: number, r: number, color: string, blades = 9) {
  const g = s('g', { class: 'spin-slow' });
  g.appendChild(s('circle', { cx, cy, r, fill: 'rgba(255,255,255,0.03)', stroke: color }));
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const a2 = a + 0.5;
    g.appendChild(s('path', { d: `M${cx} ${cy} Q ${cx + Math.cos(a) * r * 0.7} ${cy + Math.sin(a) * r * 0.7} ${cx + Math.cos(a2) * r * 0.95} ${cy + Math.sin(a2) * r * 0.95}`, fill: 'none', stroke: color, 'stroke-width': 1.2 }));
  }
  g.appendChild(s('circle', { cx, cy, r: 3, fill: color }));
  return g;
}

export function init(section: HTMLElement) {
  const lang = getLang();
  let kind: 'turbo' | 'super' = 'turbo';
  let boost = 0.8;

  /* ---------------- flow diagram ---------------- */
  const host = section.querySelector<HTMLElement>('[data-boost-diagram]')!;
  const drawDiagram = () => {
    host.replaceChildren();
    const g = svgRoot(400, 225);
    g.setAttribute('aria-hidden', 'true');
    const flowLine = (d: string, color: string, w = 2.2) =>
      [s('path', { d, fill: 'none', stroke: color, 'stroke-opacity': 0.35, 'stroke-width': 10, 'stroke-linejoin': 'round' }), s('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-dasharray': '5 7', class: 'flow' })];
    // engine block
    g.append(s('rect', { x: 150, y: 120, width: 100, height: 80, rx: 10, fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.45)' }), s('text', { x: 200, y: 165, 'text-anchor': 'middle', style: 'font-size:11px;fill:#e8eaed' }, L('engine')));
    const speed = `${Math.max(0.35, 2.4 - boost * 1.2)}s`;
    if (kind === 'turbo') {
      // exhaust out → turbine → wastegate; compressor → intercooler → intake
      g.append(...flowLine('M250 175 H 300 V 75 H 312', COLORS.exhaust));
      const turb = wheel(330, 75, 20, COLORS.amberSoft);
      turb.style.setProperty('--spin', speed);
      g.append(turb, ...flowLine('M350 75 H 390', COLORS.exhaust));
      g.append(s('line', { x1: 230, x2: 312, y1: 75, y2: 75, stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 3 }));
      const comp = wheel(210, 75, 20, COLORS.cyan);
      comp.style.setProperty('--spin', speed);
      g.append(...flowLine('M100 75 H 188', COLORS.cyan), comp);
      g.append(...flowLine('M210 55 V 24 H 40 V 160 H 150', COLORS.cyan));
      g.append(s('rect', { x: 22, y: 96, width: 36, height: 50, rx: 4, fill: 'rgba(63,208,255,0.08)', stroke: 'rgba(63,208,255,0.6)' }));
      // wastegate bypass
      g.append(s('path', { d: 'M300 110 C 340 110 360 100 372 92', fill: 'none', stroke: COLORS.exhaust, 'stroke-dasharray': '2 4', 'stroke-opacity': boost > 1.0 ? 0.9 : 0.3 }));
      g.append(
        s('text', { x: 330, y: 112, 'text-anchor': 'middle', style: 'font-size:10px' }, L('turbine')),
        s('text', { x: 210, y: 112, 'text-anchor': 'middle', style: 'font-size:10px' }, L('compressor')),
        s('text', { x: 270, y: 68, 'text-anchor': 'middle', style: 'font-size:9px' }, L('shaft')),
        s('text', { x: 40, y: 182, 'text-anchor': 'middle', style: 'font-size:10px' }, L('intercooler')),
        s('text', { x: 372, y: 125, 'text-anchor': 'middle', style: 'font-size:9px' }, L('wastegate')),
        s('text', { x: 100, y: 66, 'text-anchor': 'start', style: `font-size:10px;fill:${COLORS.cyan}` }, L('air')),
        s('text', { x: 300, y: 200, 'text-anchor': 'middle', style: `font-size:10px;fill:${COLORS.exhaust}` }, L('exhaustGas')),
      );
    } else {
      // belt from crank pulley drives the compressor directly
      g.append(s('circle', { cx: 200, cy: 210, r: 10, fill: 'none', stroke: 'rgba(255,255,255,0.6)' }));
      g.append(s('path', { d: 'M190 210 L 190 75 M210 210 L 230 80', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 2, 'stroke-dasharray': '4 3', class: 'flow' }));
      const comp = wheel(210, 75, 20, COLORS.cyan);
      comp.style.setProperty('--spin', speed);
      g.append(...flowLine('M100 75 H 188', COLORS.cyan), comp);
      g.append(...flowLine('M210 55 V 24 H 40 V 160 H 150', COLORS.cyan));
      g.append(s('rect', { x: 22, y: 96, width: 36, height: 50, rx: 4, fill: 'rgba(63,208,255,0.08)', stroke: 'rgba(63,208,255,0.6)' }));
      g.append(...flowLine('M250 175 H 390', COLORS.exhaust));
      g.append(
        s('text', { x: 210, y: 112, 'text-anchor': 'middle', style: 'font-size:10px' }, L('compressor')),
        s('text', { x: 232, y: 150, 'text-anchor': 'start', style: 'font-size:10px' }, L('belt')),
        s('text', { x: 40, y: 182, 'text-anchor': 'middle', style: 'font-size:10px' }, L('intercooler')),
        s('text', { x: 100, y: 66, 'text-anchor': 'start', style: `font-size:10px;fill:${COLORS.cyan}` }, L('air')),
        s('text', { x: 330, y: 168, 'text-anchor': 'middle', style: `font-size:10px;fill:${COLORS.exhaust}` }, L('exhaustGas')),
      );
    }
    host.appendChild(g);
  };

  /* ---------------- torque curve vs boost ---------------- */
  const chartHost = section.querySelector<HTMLElement>('[data-boost-chart]')!;
  const W = 380;
  const H = 240;
  const chart = svgRoot(W, H);
  chart.setAttribute('aria-hidden', 'true');
  chartHost.appendChild(chart);
  const drawChart = () => {
    chart.replaceChildren();
    const x0 = 46;
    const x1 = W - 12;
    const y0 = H - 34;
    const y1 = 16;
    const X = scale(1000, 7000, x0, x1);
    const Y = scale(0, 520, y0, y1);
    const g = s('g');
    chart.appendChild(g);
    axes(g, { x: X, y: Y, xTicks: niceTicks(1000, 7000, 6), yTicks: [0, 100, 200, 300, 400, 500], xFmt: (v) => fmt(v, lang), yFmt: (v) => fmt(v, lang), x0, x1, y0, y1, xLabel: lang === 'ru' ? 'об/мин' : 'rpm', yLabel: `${t('ui.torque')}, ${lang === 'ru' ? 'Н·м' : 'N·m'}` });
    const na: Array<[number, number]> = [];
    const bo: Array<[number, number]> = [];
    for (let r = 1000; r <= 7000; r += 50) {
      na.push([X(r), Y(torqueAt({ fuel: 'petrol', asp: 'na', litres: 2 }, r))]);
      bo.push([X(r), Y(boostedTorque(r, boost, kind))]);
    }
    g.appendChild(s('path', { d: pathD(na), fill: 'none', stroke: 'rgba(232,234,237,0.6)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    g.appendChild(s('path', { d: pathD([...bo, [X(7000), Y(0)], [X(1000), Y(0)]], true), fill: 'rgba(255,138,31,0.08)' }));
    g.appendChild(s('path', { d: pathD(bo), fill: 'none', stroke: COLORS.amber, 'stroke-width': 2.2 }));
    g.appendChild(s('text', { x: X(6800), y: na[na.length - 1][1] - 6, 'text-anchor': 'end', style: 'fill:#e8eaed' }, t('ui.naEngine')));
    g.appendChild(s('text', { x: X(4000), y: Math.min(...bo.map((p) => p[1])) - 8, 'text-anchor': 'middle', style: `fill:${COLORS.amberSoft}` }, `${kind === 'turbo' ? t('ui.turboCh') : t('ui.superCh')} · ${withUnit(boost, 'bar', lang, 2)}`));
    chartHost.setAttribute('aria-label', `${t('ui.torque')}: ${fmt(Math.max(...[...Array(61)].map((_, i) => boostedTorque(1000 + i * 100, boost, kind))), lang)} ${lang === 'ru' ? 'Н·м' : 'N·m'}`);
  };

  /* ---------------- turbo lag timeline ---------------- */
  const lagHost = section.querySelector<HTMLElement>('[data-lag-chart]')!;
  const lag = svgRoot(380, 200);
  lag.setAttribute('aria-hidden', 'true');
  lagHost.appendChild(lag);
  const lx0 = 40;
  const lx1 = 368;
  const ly0 = 168;
  const ly1 = 16;
  const LX = scale(0, 3, lx0, lx1);
  const LY = scale(0, 1.1, ly0, ly1);
  const lg = s('g');
  lag.appendChild(lg);
  axes(lg, { x: LX, y: LY, xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yTicks: [0, 0.5, 1], xFmt: (v) => fmt(v, lang, 1), yFmt: (v) => `${fmt(v * 100, lang)}%`, x0: lx0, x1: lx1, y0: ly0, y1: ly1, xLabel: `${t('ui.time')}, ${lang === 'ru' ? 'с' : 's'}` });
  const resp = (tt: number, k: string) => {
    const t0 = 0.2;
    if (tt < t0) return 0.32;
    const d = tt - t0;
    if (k === 'na') return 0.32 + 0.33 * (1 - Math.exp(-d / 0.08));
    if (k === 'super') return 0.32 + 0.68 * (1 - Math.exp(-d / 0.12));
    // turbo: quick NA part, then boost builds as the turbo spools
    return 0.32 + 0.33 * (1 - Math.exp(-d / 0.08)) + 0.35 * Math.max(0, 1 - Math.exp(-Math.max(0, d - 0.35) / 0.55));
  };
  const curves: Record<string, SVGPathElement> = {};
  for (const [k, col, dash] of [['na', 'rgba(232,234,237,0.6)', '5 4'], ['super', COLORS.cyan, ''], ['turbo', COLORS.amber, '']] as const) {
    curves[k] = s('path', { fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-dasharray': dash || undefined });
    lg.appendChild(curves[k]);
  }
  lg.appendChild(s('line', { x1: LX(0.2), x2: LX(0.2), y1: ly1, y2: ly0, stroke: 'rgba(255,255,255,0.3)', 'stroke-dasharray': '2 3' }));
  lg.appendChild(s('text', { x: LX(0.2) + 4, y: ly1 + 10, style: 'font-size:9.5px' }, t('ui.throttleOpen')));
  const legend = [
    ['na', t('ui.naEngine'), 'rgba(232,234,237,0.8)'],
    ['super', t('ui.superCh'), COLORS.cyan],
    ['turbo', t('ui.turboCh'), COLORS.amber],
  ];
  legend.forEach(([, txt, col], i) => lg.appendChild(s('text', { x: lx1, y: ly0 - 50 + i * 13, 'text-anchor': 'end', style: `font-size:9.5px;fill:${col}` }, txt)));
  const lagLabel = s('text', { x: LX(0.7), y: LY(0.72), style: `font-size:9.5px;fill:${COLORS.amberSoft}` }, t('ui.turboLag'));
  lg.appendChild(lagLabel);
  let tNow = 3;
  const drawLag = () => {
    for (const k of ['na', 'super', 'turbo']) {
      const pts: Array<[number, number]> = [];
      for (let tt = 0; tt <= tNow + 1e-6; tt += 0.02) pts.push([LX(tt), LY(resp(tt, k))]);
      curves[k].setAttribute('d', pathD(pts));
    }
    setAttrs(lagLabel, { opacity: tNow > 0.6 ? 1 : 0 });
  };
  drawLag();
  let playing = false;
  onTick((dt) => {
    if (!playing) return;
    tNow = Math.min(3, tNow + dt * 0.9);
    drawLag();
    if (tNow >= 3) playing = false;
  });
  section.querySelector('[data-act="lag"]')?.addEventListener('click', () => {
    tNow = reducedMotion() ? 3 : 0;
    playing = !reducedMotion();
    drawLag();
  });

  bindSeg(section, 'charger', (v) => {
    kind = v as 'turbo' | 'super';
    drawDiagram();
    drawChart();
  }, 'turbo');
  bindRange(section.querySelector('#boost-bar'), (v) => {
    boost = v;
    drawChart();
    drawDiagram();
  }, (v) => withUnit(v, 'bar', lang, 2));
  drawDiagram();
  drawChart();
}
