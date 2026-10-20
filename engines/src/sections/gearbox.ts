import { getLang, t } from '../ui/i18n';
import { s, svgRoot, pathD, scale, axes, setAttrs } from '../ui/svg';
import { torqueAt } from '../physics/torque';
import { fmt } from '../physics/units';
import { COLORS } from '../core/tokens';
import { onTick } from '../core/clock';
import { registerSound } from '../ui/sound';

/* typical ratios used in the demo */
const RATIOS = [3.6, 2.1, 1.4, 1.0, 0.8, 0.65];
const FINAL = 3.9;
const CIRC = 2.0; // wheel circumference, m
const IDLE = 800;
const RED = 6500;
const MAX_RPM = 7000;
const MASS = 1300; // kg
const R_WHEEL = CIRC / (2 * Math.PI);

/** engine rpm for a road speed (km/h) in a gear */
export const rpmFor = (kmh: number, gear: number) => (kmh / 3.6 / CIRC) * 60 * RATIOS[gear - 1] * FINAL;
export const speedFor = (rpm: number, gear: number) => (rpm / (RATIOS[gear - 1] * FINAL)) * CIRC * 3.6 / 60;

export function init(section: HTMLElement) {
  const lang = getLang();
  const demo = section.querySelector<HTMLElement>('[data-gear-demo]')!;
  let gear = 1; // 0 = neutral
  let v = 0; // km/h
  let rpm = IDLE;
  let accel = false;
  let brake = false;

  /* gauges */
  const gHost = demo.querySelector<HTMLElement>('.gear-gauges')!;
  const G = svgRoot(400, 200);
  G.setAttribute('aria-hidden', 'true');
  gHost.appendChild(G);
  const cx = 110;
  const cy = 120;
  const R = 86;
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  const angOf = (r: number) => a0 + (r / MAX_RPM) * (a1 - a0);
  const arc = (r0: number, r1: number, rad: number) => {
    const p0 = [cx + Math.cos(angOf(r0)) * rad, cy + Math.sin(angOf(r0)) * rad];
    const p1 = [cx + Math.cos(angOf(r1)) * rad, cy + Math.sin(angOf(r1)) * rad];
    const large = angOf(r1) - angOf(r0) > Math.PI ? 1 : 0;
    return `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${rad} ${rad} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  };
  G.append(s('path', { d: arc(0, MAX_RPM, R), fill: 'none', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 8 }));
  G.append(s('path', { d: arc(2000, 5000, R), fill: 'none', stroke: 'rgba(63,208,255,0.35)', 'stroke-width': 8 }));
  G.append(s('path', { d: arc(5600, RED, R), fill: 'none', stroke: 'rgba(255,138,31,0.5)', 'stroke-width': 8 }));
  G.append(s('path', { d: arc(RED, MAX_RPM, R), fill: 'none', stroke: 'rgba(255,80,40,0.8)', 'stroke-width': 8 }));
  for (let r = 0; r <= MAX_RPM; r += 1000) {
    const a = angOf(r);
    G.append(s('line', { x1: cx + Math.cos(a) * (R - 14), y1: cy + Math.sin(a) * (R - 14), x2: cx + Math.cos(a) * (R - 6), y2: cy + Math.sin(a) * (R - 6), stroke: 'rgba(255,255,255,0.5)' }));
    G.append(s('text', { x: cx + Math.cos(a) * (R - 26), y: cy + Math.sin(a) * (R - 26) + 3.5, 'text-anchor': 'middle', style: 'font-size:10px' }, String(r / 1000)));
  }
  const needle = s('line', { x1: cx, y1: cy, stroke: COLORS.amber, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  G.append(needle, s('circle', { cx, cy, r: 5, fill: COLORS.amber }));
  G.append(s('text', { x: cx, y: cy + 34, 'text-anchor': 'middle', style: 'font-size:9.5px' }, `× 1000 ${lang === 'ru' ? 'об/мин' : 'rpm'}`));
  const gearTxt = s('text', { x: 290, y: 92, 'text-anchor': 'middle', style: 'font-size:48px;fill:#e8eaed' });
  const gearLbl = s('text', { x: 290, y: 40, 'text-anchor': 'middle', style: 'font-size:10px' }, t('ui.gear'));
  const speedTxt = s('text', { x: 290, y: 150, 'text-anchor': 'middle', style: 'font-size:26px;fill:#e8eaed' });
  const speedLbl = s('text', { x: 290, y: 170, 'text-anchor': 'middle', style: 'font-size:10px' }, `${t('ui.roadSpeed')}, ${lang === 'ru' ? 'км/ч' : 'km/h'}`);
  const clutchTxt = s('text', { x: 290, y: 192, 'text-anchor': 'middle', style: `font-size:9.5px;fill:${COLORS.amberSoft}` });
  G.append(gearLbl, gearTxt, speedTxt, speedLbl, clutchTxt);

  /* chart: rpm vs speed for each gear */
  const cHost = section.querySelector<HTMLElement>('[data-gear-chart]')!;
  const C = svgRoot(380, 240);
  C.setAttribute('aria-hidden', 'true');
  cHost.appendChild(C);
  const x0 = 44;
  const x1 = 368;
  const y0 = 206;
  const y1 = 16;
  const X = scale(0, 240, x0, x1);
  const Y = scale(0, MAX_RPM, y0, y1);
  const cg = s('g');
  C.appendChild(cg);
  axes(cg, { x: X, y: Y, xTicks: [0, 40, 80, 120, 160, 200, 240], yTicks: [0, 2000, 4000, 6000], xFmt: (v2) => fmt(v2, lang), yFmt: (v2) => fmt(v2, lang), x0, x1, y0, y1, xLabel: `${t('ui.roadSpeed')}, ${lang === 'ru' ? 'км/ч' : 'km/h'}`, yLabel: lang === 'ru' ? 'об/мин' : 'rpm' });
  cg.appendChild(s('rect', { x: x0, y: Y(MAX_RPM), width: x1 - x0, height: Y(RED) - Y(MAX_RPM), fill: 'rgba(255,80,40,0.1)' }));
  cg.appendChild(s('rect', { x: x0, y: Y(5000), width: x1 - x0, height: Y(2000) - Y(5000), fill: 'rgba(63,208,255,0.05)' }));
  const lines: SVGPathElement[] = [];
  RATIOS.forEach((_, i) => {
    const vmax = speedFor(MAX_RPM, i + 1);
    const p = s('path', { d: pathD([[X(0), Y(0)], [X(Math.min(240, vmax)), Y(Math.min(MAX_RPM, rpmFor(Math.min(240, vmax), i + 1)))]]), stroke: 'rgba(232,234,237,0.35)', 'stroke-width': 1.5, fill: 'none' });
    lines.push(p);
    cg.appendChild(p);
    const lx = Math.min(240, vmax);
    cg.appendChild(s('text', { x: X(lx) + 3, y: Y(Math.min(MAX_RPM, rpmFor(lx, i + 1))) + 10, style: 'font-size:10px' }, String(i + 1)));
  });
  const dot = s('circle', { r: 5, fill: COLORS.amber });
  cg.appendChild(dot);

  const buttons = Array.from(demo.querySelectorAll<HTMLButtonElement>('[data-gear]'));
  const setGear = (g: number) => {
    gear = g;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gear === (g === 0 ? 'N' : String(g)))));
    lines.forEach((l, i) => l.setAttribute('stroke', i + 1 === g ? COLORS.amberSoft : 'rgba(232,234,237,0.35)'));
  };
  buttons.forEach((b) => b.addEventListener('click', () => setGear(b.dataset.gear === 'N' ? 0 : +b.dataset.gear!)));
  const accelBtn = demo.querySelector<HTMLButtonElement>('[data-act="accel"]')!;
  const brakeBtn = demo.querySelector<HTMLButtonElement>('[data-act="brake"]')!;
  const hold = (btn: HTMLButtonElement, set: (on: boolean) => void) => {
    // press and hold (pointer), or toggle with keyboard/click
    let pointer = false;
    btn.addEventListener('pointerdown', (e) => {
      pointer = true;
      btn.setPointerCapture(e.pointerId);
      set(true);
      btn.setAttribute('aria-pressed', 'true');
    });
    const up = () => {
      if (!pointer) return;
      set(false);
      btn.setAttribute('aria-pressed', 'false');
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('click', (e) => {
      if (pointer) {
        pointer = false;
        return;
      }
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      set(on);
      e.preventDefault();
    });
  };
  hold(accelBtn, (on) => (accel = on));
  hold(brakeBtn, (on) => (brake = on));
  setGear(1);

  let visible = false;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(section);
  registerSound(section, { rate: () => (visible ? (rpm / 60 / 2) * 4 : 0), timbre: { thump: 70, decay: 0.05 } });
  onTick((dt) => {
    if (!visible) return;
    // engine & car model
    let slipping = false;
    if (gear === 0) {
      const target = accel ? 4500 : IDLE;
      rpm += (target - rpm) * Math.min(1, dt * 3);
      v = Math.max(0, v - (0.6 + 0.0004 * v * v) * dt * 3.6 * (brake ? 8 : 1));
    } else {
      const locked = rpmFor(v, gear);
      let engineRpm = locked;
      if (locked < 1100) {
        // clutch slips to keep the engine running while pulling away
        slipping = true;
        engineRpm = accel ? 1700 : IDLE;
      }
      const T = accel ? torqueAt({ fuel: 'petrol', asp: 'na', litres: 2 }, Math.min(MAX_RPM, Math.max(1000, engineRpm))) : -20;
      const cutoff = engineRpm >= RED ? 0 : 1;
      const wheelForce = (T * RATIOS[gear - 1] * FINAL * 0.9 * (accel ? cutoff : 1)) / R_WHEEL;
      const drag = 0.4 * v * v / 12.96 + 150;
      const brakeF = brake ? 9000 : 0;
      const a = (wheelForce - drag - brakeF) / MASS; // m/s²
      v = Math.max(0, v + a * 3.6 * dt);
      const target = slipping ? engineRpm : Math.max(IDLE, rpmFor(v, gear));
      rpm += (target - rpm) * Math.min(1, dt * 8);
    }
    rpm = Math.min(MAX_RPM, rpm);
    const ang = angOf(rpm);
    setAttrs(needle, { x2: cx + Math.cos(ang) * (R - 18), y2: cy + Math.sin(ang) * (R - 18) });
    gearTxt.textContent = gear === 0 ? t('ui.neutral') : String(gear);
    speedTxt.textContent = fmt(v, lang);
    clutchTxt.textContent = slipping && accel ? t('ui.clutch') + ' …' : '';
    setAttrs(dot, { cx: X(Math.min(240, v)), cy: Y(rpm) });
    gHost.setAttribute('aria-label', `${t('ui.gear')} ${gear === 0 ? 'N' : gear}, ${fmt(rpm, lang)} ${lang === 'ru' ? 'об/мин' : 'rpm'}, ${fmt(v, lang)} ${lang === 'ru' ? 'км/ч' : 'km/h'}`);
  });
}
