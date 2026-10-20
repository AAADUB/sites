import { PVChart, niceTicks } from '../ui/pv';
import { petrolSim } from './fourStroke';
import { typicalTiming } from '../physics/valves';
import { wrap720, displacementCc } from '../physics/kinematics';
import { ottoEfficiency, dieselEfficiency } from '../physics/cycle';
import { torqueAt, RPM_RANGE, type FuelType, type Aspiration } from '../physics/torque';
import { powerKw, kwToHp, fmt, withUnit } from '../physics/units';
import { bindRange, bindSeg } from '../ui/chrome';
import { getLang, t } from '../ui/i18n';
import { onTick } from '../core/clock';
import { settings, onSettings } from '../core/settings';
import { s, svgRoot, pathD, scale, axes, setAttrs } from '../ui/svg';
import { STROKE_COLORS } from '../core/tokens';

export function init(section: HTMLElement) {
  const lang = getLang();
  const sim = petrolSim();

  /* ---------------- P–V ---------------- */
  const pvEl = section.querySelector<HTMLElement>('[data-pv="lab"]')!;
  const pv = new PVChart(pvEl, sim, { overlays: true });
  bindSeg(section.querySelector('.tool-pv')!, 'pvscale', (v) => (pv.log = v === 'log'), 'lin');
  section.querySelectorAll<HTMLInputElement>('[data-ov]').forEach((box) =>
    box.addEventListener('change', () => {
      pv.overlays[box.dataset.ov as 'otto' | 'diesel' | 'atkinson'] = box.checked;
    }),
  );

  /* ---------------- valve timing wheel ---------------- */
  initValveWheel(section, sim);

  /* ---------------- displacement ---------------- */
  {
    const root = section.querySelector<HTMLElement>('[data-disp]')!;
    const formula = root.querySelector<HTMLElement>('.disp-formula')!;
    const viz = root.querySelector<HTMLElement>('.disp-viz')!;
    let bore = 86;
    let stroke = 86;
    let cyl = 4;
    const svg = svgRoot(320, 120);
    viz.appendChild(svg);
    const update = () => {
      const cc = displacementCc(bore, stroke, cyl);
      const L = cc / 1000;
      formula.innerHTML = `V = π/4 × ${fmt(bore, lang)}² × ${fmt(stroke, lang)} × ${cyl} = <strong>${fmt(cc, lang)}&nbsp;${lang === 'ru' ? 'см³' : 'cm³'}</strong> (${fmt(L, lang, 2)}&nbsp;${lang === 'ru' ? 'л' : 'L'})`;
      svg.replaceChildren();
      // draw cylinders to scale (bore × stroke) side by side
      const k = 0.55;
      const w = bore * k;
      const h = stroke * k;
      const gap = 6;
      const total = cyl * w + (cyl - 1) * gap;
      const sc = Math.min(1, 300 / total, 100 / h);
      const x0 = (320 - total * sc) / 2;
      for (let i = 0; i < cyl; i++) {
        const x = x0 + i * (w + gap) * sc;
        svg.appendChild(s('rect', { x, y: 110 - h * sc, width: w * sc, height: h * sc, rx: 2, fill: 'rgba(63,208,255,0.18)', stroke: 'rgba(63,208,255,0.7)', 'stroke-width': 1 }));
      }
    };
    const fB = bindRange(root.querySelector('#dp-bore'), (v) => ((bore = v), update()), (v) => withUnit(v, 'mm', lang));
    const fS = bindRange(root.querySelector('#dp-stroke'), (v) => ((stroke = v), update()), (v) => withUnit(v, 'mm', lang));
    const fC = bindRange(root.querySelector('#dp-cyl'), (v) => ((cyl = v), update()), (v) => String(v));
    const presets: Record<string, [number, number, number]> = { scooter: [52.4, 57.8, 1], hatch: [72, 81.8, 3], sport: [89, 89.6, 6], truck: [130, 160, 6] };
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        [bore, stroke, cyl] = presets[b.dataset.preset!];
        fB.set(bore);
        fS.set(stroke);
        fC.set(cyl);
        update();
      }),
    );
    update();
  }

  /* ---------------- compression ratio explorer ---------------- */
  {
    const root = section.querySelector<HTMLElement>('[data-cr]')!;
    const chart = root.querySelector<HTMLElement>('.cr-chart')!;
    const W = 360;
    const H = 225;
    const svg = svgRoot(W, H);
    chart.appendChild(svg);
    const X = scale(6, 24, 44, W - 12);
    const Y = scale(0.3, 0.75, H - 34, 14);
    const g = s('g');
    svg.appendChild(g);
    axes(g, {
      x: X,
      y: Y,
      xTicks: [6, 10, 14, 18, 22],
      yTicks: [0.3, 0.4, 0.5, 0.6, 0.7],
      xFmt: (v) => `${v}:1`,
      yFmt: (v) => `${fmt(v * 100, lang)}%`,
      x0: 44,
      x1: W - 12,
      y0: H - 34,
      y1: 14,
      xLabel: t('ui.compressionRatio'),
    });
    // knock zone for petrol
    g.appendChild(s('rect', { x: X(14), y: 14, width: X(24) - X(14), height: H - 48, fill: 'rgba(255,138,31,0.08)' }));
    g.appendChild(s('text', { x: X(19), y: 28, 'text-anchor': 'middle', style: 'fill:#ffb347' }, t('ui.knockZone')));
    const otto: Array<[number, number]> = [];
    const dsl: Array<[number, number]> = [];
    for (let r = 6; r <= 24.01; r += 0.25) {
      otto.push([X(r), Y(ottoEfficiency(r))]);
      dsl.push([X(r), Y(dieselEfficiency(r, 2))]);
    }
    g.appendChild(s('path', { d: pathD(otto), fill: 'none', stroke: '#e8eaed', 'stroke-width': 1.8 }));
    g.appendChild(s('path', { d: pathD(dsl), fill: 'none', stroke: STROKE_COLORS.compression, 'stroke-width': 1.8, 'stroke-dasharray': '5 4' }));
    g.appendChild(s('text', { x: X(23.5), y: Y(ottoEfficiency(23.5)) - 8, 'text-anchor': 'end', style: 'fill:#e8eaed' }, t('ui.otto')));
    g.appendChild(s('text', { x: X(23.5), y: Y(dieselEfficiency(23.5, 2)) + 16, 'text-anchor': 'end', style: `fill:${STROKE_COLORS.compression}` }, `${t('ui.dieselCycle')} (ρ = 2)`));
    const line = s('line', { y1: 14, y2: H - 34, stroke: 'rgba(255,255,255,0.35)', 'stroke-dasharray': '3 3' });
    const dot1 = s('circle', { r: 4.5, fill: '#e8eaed' });
    const dot2 = s('circle', { r: 4.5, fill: STROKE_COLORS.compression });
    const label = s('text', { y: 24, 'text-anchor': 'start', style: 'fill:#e8eaed' });
    g.append(line, dot1, dot2, label);
    const out = root.querySelector('#cr-r-out');
    const upd = (r: number) => {
      const x = X(r);
      setAttrs(line, { x1: x, x2: x });
      setAttrs(dot1, { cx: x, cy: Y(ottoEfficiency(r)) });
      setAttrs(dot2, { cx: x, cy: Y(dieselEfficiency(r, 2)) });
      const left = x > W * 0.6;
      setAttrs(label, { x: left ? x - 6 : x + 6, 'text-anchor': left ? 'end' : 'start', y: Math.min(Y(ottoEfficiency(r)) - 10, H - 50) });
      label.textContent = `η ${fmt(ottoEfficiency(r) * 100, lang, 1)} %`;
      if (out) out.textContent = `${fmt(r, lang, 1)}:1`;
    };
    bindRange(root.querySelector('#cr-r'), upd);
    upd(10.5);
  }

  /* ---------------- torque & power curve builder ---------------- */
  {
    const root = section.querySelector<HTMLElement>('[data-curve]')!;
    const chart = root.querySelector<HTMLElement>('.curve-chart')!;
    const W = 380;
    const H = 240;
    let fuel: FuelType = 'petrol';
    let asp: Aspiration = 'na';
    let litres = 2;
    let hoverRpm: number | null = null;
    const svg = svgRoot(W, H);
    chart.appendChild(svg);
    const x0 = 46;
    const x1 = W - 46;
    const y0 = H - 34;
    const y1 = 18;
    const draw = () => {
      svg.replaceChildren();
      const [rMin, rMax] = RPM_RANGE[fuel];
      const spec = { fuel, asp, litres };
      const tor: number[] = [];
      const pow: number[] = [];
      const rpms: number[] = [];
      for (let r = rMin; r <= rMax + 1; r += 50) {
        rpms.push(r);
        tor.push(torqueAt(spec, r));
        const kw = powerKw(torqueAt(spec, r), r);
        pow.push(settings.power === 'hp' ? kwToHp(kw) : kw);
      }
      const tMax = Math.max(...tor) * 1.15;
      const pMax = Math.max(...pow) * 1.15;
      const X = scale(rMin, rMax, x0, x1);
      const YT = scale(0, tMax, y0, y1);
      const YP = scale(0, pMax, y0, y1);
      const g = s('g');
      svg.appendChild(g);
      axes(g, {
        x: X,
        y: YT,
        xTicks: niceTicks(rMin, rMax, 5),
        yTicks: niceTicks(0, tMax, 4),
        xFmt: (v) => fmt(v, lang),
        yFmt: (v) => fmt(v, lang),
        x0,
        x1,
        y0,
        y1,
        xLabel: lang === 'ru' ? 'об/мин' : 'rpm',
        yLabel: `${t('ui.torque')}, ${lang === 'ru' ? 'Н·м' : 'N·m'}`,
        yLabelRight: `${t('ui.power')}, ${settings.power === 'hp' ? (lang === 'ru' ? 'л. с.' : 'hp') : lang === 'ru' ? 'кВт' : 'kW'}`,
      });
      for (const v of niceTicks(0, pMax, 4)) g.appendChild(s('text', { x: x1 + 6, y: YP(v) + 3.5, 'text-anchor': 'start', style: `fill:${STROKE_COLORS.power}` }, fmt(v, lang)));
      g.appendChild(s('path', { d: pathD(rpms.map((r, i) => [X(r), YT(tor[i])])), fill: 'none', stroke: STROKE_COLORS.intake, 'stroke-width': 2 }));
      g.appendChild(s('path', { d: pathD(rpms.map((r, i) => [X(r), YP(pow[i])])), fill: 'none', stroke: STROKE_COLORS.power, 'stroke-width': 2 }));
      if (hoverRpm !== null) {
        const r = Math.min(rMax, Math.max(rMin, hoverRpm));
        const T = torqueAt(spec, r);
        const kw = powerKw(T, r);
        const P = settings.power === 'hp' ? kwToHp(kw) : kw;
        const x = X(r);
        g.appendChild(s('line', { x1: x, x2: x, y1, y2: y0, stroke: 'rgba(255,255,255,0.35)', 'stroke-dasharray': '3 3' }));
        g.appendChild(s('circle', { cx: x, cy: YT(T), r: 4, fill: STROKE_COLORS.intake }));
        g.appendChild(s('circle', { cx: x, cy: YP(P), r: 4, fill: STROKE_COLORS.power }));
        const txt = `${fmt(r, lang)} ${lang === 'ru' ? 'об/мин' : 'rpm'} · ${fmt(T, lang)} ${lang === 'ru' ? 'Н·м' : 'N·m'} · ${fmt(P, lang)} ${settings.power === 'hp' ? (lang === 'ru' ? 'л. с.' : 'hp') : lang === 'ru' ? 'кВт' : 'kW'}`;
        const left = x > (x0 + x1) / 2;
        g.appendChild(s('text', { x: left ? x - 6 : x + 6, y: y1 + 10, 'text-anchor': left ? 'end' : 'start', style: 'fill:#e8eaed' }, txt));
      }
      // a11y summary
      const peakT = Math.max(...tor);
      const peakP = Math.max(...pow);
      svg.setAttribute('aria-label', `${t('ui.torque')} ${fmt(peakT, lang)} ${lang === 'ru' ? 'Н·м' : 'N·m'}, ${t('ui.power')} ${fmt(peakP, lang)} ${settings.power === 'hp' ? 'hp' : 'kW'}`);
      svg.setAttribute('role', 'img');
    };
    const toRpm = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const vx = ((e.clientX - r.left) / r.width) * W;
      const [rMin, rMax] = RPM_RANGE[fuel];
      return rMin + ((vx - x0) / (x1 - x0)) * (rMax - rMin);
    };
    svg.addEventListener('pointermove', (e) => {
      hoverRpm = toRpm(e);
      draw();
    });
    svg.addEventListener('pointerdown', (e) => {
      hoverRpm = toRpm(e);
      draw();
    });
    svg.addEventListener('pointerleave', () => {
      hoverRpm = null;
      draw();
    });
    bindSeg(root, 'ctype', (v) => ((fuel = v as FuelType), draw()), 'petrol');
    bindSeg(root, 'casp', (v) => ((asp = v as Aspiration), draw()), 'na');
    bindRange(root.querySelector('#cv-disp'), (v) => ((litres = v), draw()), (v) => `${fmt(v, lang, 1)} ${lang === 'ru' ? 'л' : 'L'}`);
    onSettings((_s, k) => k === 'power' && draw());
    draw();
  }
}

/* ------------------------------------------------------------------ valve timing wheel */
function initValveWheel(section: HTMLElement, sim: ReturnType<typeof petrolSim>) {
  const lang = getLang();
  const el = section.querySelector<HTMLElement>('[data-valve-wheel]')!;
  const W = 300;
  const C = W / 2;
  const svg = svgRoot(W, W);
  svg.setAttribute('aria-hidden', 'true');
  el.appendChild(svg);
  let shiftI = 0;
  let shiftE = 0;
  // 720° of crank = one full turn of the wheel; 0° (gas-exchange TDC) at the top, clockwise
  const ang = (crank: number) => ((crank / 720) * 360 - 90) * (Math.PI / 180);
  const pt = (crank: number, r: number): [number, number] => [C + Math.cos(ang(crank)) * r, C + Math.sin(ang(crank)) * r];
  const arc = (a0: number, a1: number, r: number) => {
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    const large = (a1 - a0) / 2 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  // stroke sectors
  const sectors: Array<[number, number, keyof typeof STROKE_COLORS]> = [
    [0, 180, 'intake'],
    [180, 360, 'compression'],
    [360, 540, 'power'],
    [540, 720, 'exhaust'],
  ];
  for (const [a0, a1, k] of sectors) {
    svg.appendChild(s('path', { d: arc(a0 + 1, a1 - 1, 74), fill: 'none', stroke: STROKE_COLORS[k], 'stroke-opacity': 0.35, 'stroke-width': 10 }));
    const [lx, ly] = pt((a0 + a1) / 2, 50);
    svg.appendChild(s('text', { x: lx, y: ly + 3.5, 'text-anchor': 'middle', style: `fill:${STROKE_COLORS[k]};font-size:10px` }, t(`ui.strokes.${k}`)));
  }
  for (const [deg, lbl] of [[0, lang === 'ru' ? 'ВМТ' : 'TDC'], [180, lang === 'ru' ? 'НМТ' : 'BDC'], [360, lang === 'ru' ? 'ВМТ' : 'TDC'], [540, lang === 'ru' ? 'НМТ' : 'BDC']] as const) {
    const [x0, y0] = pt(deg, 82);
    const [x1, y1] = pt(deg, 140);
    svg.appendChild(s('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'rgba(255,255,255,0.18)' }));
    const [tx, ty] = pt(deg, 146);
    svg.appendChild(s('text', { x: tx, y: ty + 3.5, 'text-anchor': 'middle', style: 'font-size:9px' }, `${lbl} ${deg}°`));
  }
  const intakeArc = s('path', { fill: 'none', stroke: STROKE_COLORS.intake, 'stroke-width': 12, 'stroke-linecap': 'round', style: 'cursor:grab' });
  const exhaustArc = s('path', { fill: 'none', stroke: STROKE_COLORS.exhaust, 'stroke-width': 12, 'stroke-linecap': 'round', style: 'cursor:grab' });
  const overlapArc = s('path', { fill: 'none', stroke: '#fff3d6', 'stroke-width': 3 });
  const spark = s('circle', { r: 5, fill: STROKE_COLORS.power });
  const pointer = s('line', { x1: C, y1: C, stroke: '#e8eaed', 'stroke-width': 1.5 });
  const hub = s('circle', { cx: C, cy: C, r: 4, fill: '#e8eaed' });
  const info = s('text', { x: C, y: C + 24, 'text-anchor': 'middle', style: 'font-size:10px' });
  svg.append(intakeArc, exhaustArc, overlapArc, spark, pointer, hub, info);
  // larger invisible hit areas for touch
  const hitI = s('path', { fill: 'none', stroke: 'transparent', 'stroke-width': 30, style: 'cursor:grab;touch-action:none' });
  const hitE = s('path', { fill: 'none', stroke: 'transparent', 'stroke-width': 30, style: 'cursor:grab;touch-action:none' });
  svg.append(hitI, hitE);
  const rI = 112;
  const rE = 96;
  const inSlider = bindRange(section.querySelector('#vw-in'), (v) => ((shiftI = v), apply()), (v) => withUnit(v, 'deg', lang));
  const exSlider = bindRange(section.querySelector('#vw-ex'), (v) => ((shiftE = v), apply()), (v) => withUnit(v, 'deg', lang));
  const apply = () => {
    sim.set({ timing: typicalTiming(shiftI, shiftE) });
    draw();
  };
  const draw = () => {
    const tm = typicalTiming(shiftI, shiftE);
    const io = tm.intake.open;
    const ic = tm.intake.close;
    const eo = tm.exhaust.open;
    const ec = tm.exhaust.close;
    intakeArc.setAttribute('d', arc(io, ic, rI));
    hitI.setAttribute('d', arc(io, ic, rI));
    exhaustArc.setAttribute('d', arc(eo, ec, rE));
    hitE.setAttribute('d', arc(eo, ec, rE));
    // overlap: exhaust closes after intake opens (around 720 / 0)
    const ovStart = io + 720;
    const ovEnd = ec;
    overlapArc.setAttribute('d', ovEnd > ovStart ? arc(ovStart, ovEnd, 104) : '');
    const ov = Math.max(0, ovEnd - ovStart);
    info.textContent = `${t('ui.overlap')}: ${fmt(ov, lang)}°`;
  };
  draw();
  // dragging arcs
  const drag = (path: SVGPathElement, which: 'i' | 'e') => {
    let startAng = 0;
    let startShift = 0;
    const angleOf = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W - C;
      const y = ((e.clientY - r.top) / r.height) * W - C;
      return ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360; // dial degrees
    };
    path.addEventListener('pointerdown', (e) => {
      path.setPointerCapture(e.pointerId);
      startAng = angleOf(e);
      startShift = which === 'i' ? shiftI : shiftE;
      path.style.cursor = 'grabbing';
    });
    path.addEventListener('pointermove', (e) => {
      if (!path.hasPointerCapture(e.pointerId)) return;
      let d = angleOf(e) - startAng;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      const v = Math.max(-40, Math.min(40, Math.round(startShift + d * 2)));
      if (which === 'i') {
        shiftI = v;
        inSlider.set(v);
      } else {
        shiftE = v;
        exSlider.set(v);
      }
      apply();
    });
    path.addEventListener('pointerup', () => (path.style.cursor = 'grab'));
  };
  drag(hitI, 'i');
  drag(hitE, 'e');
  // live pointer + spark marker
  let vis = false;
  new IntersectionObserver((e) => (vis = e[0].isIntersecting)).observe(el);
  onTick(() => {
    if (!vis) return;
    const th = wrap720(sim.theta);
    const [x, y] = pt(th, 128);
    setAttrs(pointer, { x2: x, y2: y });
    const [sx, sy] = pt(sim.table.ignition, rE - 16);
    setAttrs(spark, { cx: sx, cy: sy });
  }, 55);
}
