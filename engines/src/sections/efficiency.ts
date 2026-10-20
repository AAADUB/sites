import { bindSeg } from '../ui/chrome';
import { getLang, t, tget } from '../ui/i18n';
import { s, svgRoot } from '../ui/svg';
import { fmt } from '../physics/units';
import { COLORS, STROKE_COLORS } from '../core/tokens';
import { reducedMotion } from '../core/settings';

/** Typical shares at a good operating point (percent). */
const SHARES = {
  petrol: { work: 32, cooling: 27, exhaust: 33, friction: 8 },
  diesel: { work: 41, cooling: 24, exhaust: 27, friction: 8 },
};

export function init(section: HTMLElement) {
  const lang = getLang();
  const labels = tget<Record<string, string>>('sections.efficiency.sankey') ?? {};
  const host = section.querySelector<HTMLElement>('[data-sankey]')!;
  const W = 640;
  const H = 300;
  const svg = svgRoot(W, H);
  host.appendChild(svg);
  const draw = (kind: 'petrol' | 'diesel') => {
    svg.replaceChildren();
    const sh = SHARES[kind];
    const total = 100;
    const scaleH = 200 / total;
    const xL = 20;
    const xSplit = 230;
    const xR = 470;
    const top = 50;
    const order: Array<[keyof typeof sh, string]> = [
      ['work', STROKE_COLORS.power],
      ['exhaust', COLORS.exhaust],
      ['cooling', COLORS.cyan],
      ['friction', COLORS.violet],
    ];
    // source bar
    svg.appendChild(s('rect', { x: xL, y: top, width: 14, height: total * scaleH, fill: '#ffb347' }));
    svg.appendChild(s('text', { x: xL, y: top - 12, style: 'font-size:13px;fill:#e8eaed' }, `${labels.fuel ?? 'Fuel'} · 100 %`));
    let ySrc = top;
    let yDst = 22;
    const gap = 18;
    for (const [k, col] of order) {
      const h = sh[k] * scaleH;
      const y0a = ySrc;
      const y0b = ySrc + h;
      const y1a = yDst;
      const y1b = yDst + h;
      const d = `M${xL + 14} ${y0a} H ${xSplit} C ${xSplit + 120} ${y0a} ${xR - 120} ${y1a} ${xR} ${y1a} V ${y1b} C ${xR - 120} ${y1b} ${xSplit + 120} ${y0b} ${xSplit} ${y0b} H ${xL + 14} Z`;
      const band = s('path', { d, fill: col, 'fill-opacity': k === 'work' ? 0.55 : 0.28, stroke: col, 'stroke-opacity': 0.7, 'stroke-width': 0.8 });
      if (!reducedMotion()) {
        band.style.transformOrigin = `${xL}px 0px`;
        band.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1200, easing: 'cubic-bezier(0.16,1,0.3,1)', delay: 80 * order.findIndex((o) => o[0] === k) });
      }
      svg.appendChild(band);
      svg.appendChild(s('rect', { x: xR, y: y1a, width: 10, height: h, fill: col }));
      svg.appendChild(s('text', { x: xR + 18, y: y1a + h / 2 - 2, style: `font-size:13px;fill:${k === 'work' ? '#fff3d6' : '#e8eaed'}` }, `${labels[k] ?? k}`));
      svg.appendChild(s('text', { x: xR + 18, y: y1a + h / 2 + 14, style: `font-size:12px;fill:${col}` }, `≈ ${fmt(sh[k], lang)} %`));
      ySrc += h;
      yDst += h + gap;
    }
    host.setAttribute('aria-label', `${labels.fuel ?? 'Fuel'} 100 %: ${order.map(([k]) => `${labels[k]} ${sh[k]} %`).join(', ')}`);
  };
  bindSeg(section, 'sankey', (v) => draw(v as 'petrol' | 'diesel'), 'petrol');
  draw('petrol');

  /* hybrid power flow */
  const hHost = section.querySelector<HTMLElement>('[data-hybrid]')!;
  const text = section.querySelector<HTMLElement>('.hybrid-text')!;
  const modes = tget<Record<string, string>>('sections.efficiency.hybrid') ?? {};
  const HW = 400;
  const HH = 250;
  const hs = svgRoot(HW, HH);
  hHost.appendChild(hs);
  const nodes = {
    engine: { x: 70, y: 70, label: t('ui.hybridEngine'), col: STROKE_COLORS.power },
    motor: { x: 70, y: 180, label: t('ui.hybridMotor'), col: COLORS.cyan },
    battery: { x: 330, y: 180, label: t('ui.hybridBattery'), col: COLORS.violet },
    wheels: { x: 330, y: 70, label: t('ui.hybridWheels'), col: '#e8eaed' },
  };
  const box = (n: { x: number; y: number; label: string; col: string }) => {
    const g = s('g');
    g.appendChild(s('rect', { x: n.x - 58, y: n.y - 26, width: 116, height: 52, rx: 10, fill: 'rgba(255,255,255,0.03)', stroke: n.col, 'stroke-opacity': 0.7 }));
    g.appendChild(s('text', { x: n.x, y: n.y + 4, 'text-anchor': 'middle', style: 'font-size:12px;fill:#e8eaed' }, n.label));
    return g;
  };
  const arrowsG = s('g');
  hs.append(arrowsG, box(nodes.engine), box(nodes.motor), box(nodes.battery), box(nodes.wheels));
  const arrow = (from: keyof typeof nodes, to: keyof typeof nodes, col: string) => {
    const a = nodes[from];
    const b = nodes[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * 66;
    const sy = a.y + uy * 34;
    const ex = b.x - ux * 66;
    const ey = b.y - uy * 34;
    arrowsG.appendChild(s('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: col, 'stroke-width': 3, 'stroke-dasharray': '6 6', class: 'flow' }));
    const ah = 8;
    arrowsG.appendChild(s('path', { d: `M${ex} ${ey} L ${ex - ux * ah - uy * ah * 0.6} ${ey - uy * ah + ux * ah * 0.6} L ${ex - ux * ah + uy * ah * 0.6} ${ey - uy * ah - ux * ah * 0.6} Z`, fill: col }));
  };
  const setMode = (m: string) => {
    arrowsG.replaceChildren();
    if (m === 'accelerate') {
      arrow('engine', 'wheels', STROKE_COLORS.power);
      arrow('battery', 'motor', COLORS.violet);
      arrow('motor', 'wheels', COLORS.cyan);
    } else if (m === 'cruise') {
      arrow('engine', 'wheels', STROKE_COLORS.power);
      arrow('engine', 'motor', STROKE_COLORS.power);
      arrow('motor', 'battery', COLORS.cyan);
    } else if (m === 'brake') {
      arrow('wheels', 'motor', '#e8eaed');
      arrow('motor', 'battery', COLORS.cyan);
    }
    text.textContent = modes[m] ?? '';
    hHost.setAttribute('aria-label', modes[m] ?? '');
  };
  bindSeg(section, 'hybrid', setMode, 'accelerate');
  setMode('accelerate');
}
