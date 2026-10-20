import type { EngineSim } from '../engines/sim';
import { onTick } from '../core/clock';
import { idealOttoLoop, idealDieselLoop, idealAtkinsonLoop, pressureAt, volumeAt } from '../physics/cycle';
import { clearanceVolumeCc, sweptVolumeCc } from '../physics/kinematics';
import { strokeAt } from '../physics/valves';
import { STROKE_COLORS, COLORS } from '../core/tokens';
import { fmt } from '../physics/units';
import { getLang, t } from './i18n';

export interface PVOptions {
  overlays?: boolean;
  compact?: boolean;
}

/** Live pressure–volume diagram drawn on a canvas, synced to an engine simulation. */
export class PVChart {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private w = 300;
  private h = 200;
  private dpr = 1;
  private visible = false;
  log = false;
  overlays = { otto: true, diesel: false, atkinson: false };
  private unsub: () => void;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private trail: Array<[number, number, number]> = [];
  private lastTheta = NaN;

  constructor(private el: HTMLElement, private sim: EngineSim, private o: PVOptions = {}) {
    this.canvas.setAttribute('aria-hidden', 'true');
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.io = new IntersectionObserver((e) => (this.visible = e[0].isIntersecting));
    this.io.observe(el);
    this.resize();
    this.unsub = onTick(() => this.visible && this.draw(), 50);
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.w = Math.max(200, r.width);
    this.h = Math.max(150, r.height || this.w * 0.62);
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.draw();
  }

  private draw() {
    const { ctx, w, h, sim } = this;
    const tb = sim.table;
    const g = sim.geom;
    const lang = getLang();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const padL = 46;
    const padB = 30;
    const padT = 14;
    const padR = 12;
    const vc = clearanceVolumeCc(g);
    const vmax = vc + sweptVolumeCc(g);
    const pMax = Math.max(10, tb.peakPressure * 1.12);
    const pMinLog = 0.2;
    const X = (v: number) => {
      if (this.log) return padL + ((Math.log(v) - Math.log(vc * 0.95)) / (Math.log(vmax * 1.03) - Math.log(vc * 0.95))) * (w - padL - padR);
      return padL + ((v - vc * 0.9) / (vmax * 1.03 - vc * 0.9)) * (w - padL - padR);
    };
    const Y = (p: number) => {
      if (this.log) return h - padB - ((Math.log(Math.max(pMinLog, p)) - Math.log(pMinLog)) / (Math.log(pMax) - Math.log(pMinLog))) * (h - padB - padT);
      return h - padB - (p / pMax) * (h - padB - padT);
    };
    // grid
    ctx.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--f-mono') || 'monospace'}`;
    ctx.fillStyle = COLORS.text2;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    const pTicks = this.log ? [0.5, 1, 2, 5, 10, 20, 50, 100].filter((p) => p < pMax) : niceTicks(0, pMax, 5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const p of pTicks) {
      const y = Math.round(Y(p)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(fmt(p, lang, p < 1 ? 1 : 0), padL - 6, y);
    }
    ctx.save();
    ctx.translate(12, (h - padB + padT) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`${t('ui.pressure')}, ${t('ui.bar')}`, 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const vTicks = niceTicks(0, vmax, 4).filter((v) => v >= vc * 0.9);
    for (const v of vTicks) {
      const x = Math.round(X(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
      ctx.fillText(fmt(v, lang), x, h - padB + 6);
    }
    ctx.fillText(lang === 'ru' ? 'объём, см³' : 'volume, cm³', (padL + w - padR) / 2, h - 13);
    ctx.fillStyle = COLORS.text2;
    ctx.fillText(lang === 'ru' ? 'ВМТ' : 'TDC', X(vc), padT - 2 > 0 ? padT - 2 : 0);
    ctx.fillText(lang === 'ru' ? 'НМТ' : 'BDC', X(vmax), padT - 2 > 0 ? padT - 2 : 0);

    // ideal overlays (normalised to clearance volume, scaled to match intake pressure and peak)
    if (this.o.overlays) {
      const r = g.compressionRatio;
      const p1 = Math.max(0.3, pressureAt(tb, tb.span === 720 ? 200 : 250));
      const draw = (pts: Array<[number, number]>, color: string) => {
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        pts.forEach(([vn, p], i) => {
          const x = X(vn * vc);
          const y = Y(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const peakRatio = Math.max(1.2, tb.peakPressure / (p1 * Math.pow(r, 1.4)));
      if (this.overlays.otto) draw(idealOttoLoop(r, p1, peakRatio), 'rgba(232,234,237,0.55)');
      if (this.overlays.diesel) draw(idealDieselLoop(r, 2, p1), 'rgba(157,140,255,0.8)');
      if (this.overlays.atkinson) draw(idealAtkinsonLoop(r * 0.78, r, p1, peakRatio), 'rgba(63,208,255,0.8)');
    }

    // real loop
    const n = tb.p.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const x = X(tb.v[k]);
      const y = Y(tb.p[k]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fillStyle = 'rgba(255,138,31,0.10)';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(232,234,237,0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // trail and moving dot
    const th = sim.cycleAngle;
    if (th !== this.lastTheta) {
      this.trail.push([volumeAt(tb, th), pressureAt(tb, th), th]);
      if (this.trail.length > 40) this.trail.shift();
      this.lastTheta = th;
    }
    for (let i = 1; i < this.trail.length; i++) {
      const [v0, p0] = this.trail[i - 1];
      const [v1, p1, a] = this.trail[i];
      if (Math.abs(a - this.trail[i - 1][2]) > 60) continue;
      ctx.strokeStyle = hexA(strokeColor(a, tb.span), (i / this.trail.length) * 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(X(v0), Y(p0));
      ctx.lineTo(X(v1), Y(p1));
      ctx.stroke();
    }
    const vNow = volumeAt(tb, th);
    const pNow = pressureAt(tb, th);
    const col = strokeColor(th, tb.span);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(X(vNow), Y(pNow), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  dispose() {
    this.unsub();
    this.ro.disconnect();
    this.io.disconnect();
    this.canvas.remove();
  }
}

function strokeColor(theta: number, span: number) {
  if (span === 360) {
    const a = theta % 360;
    if (a < 105) return STROKE_COLORS.power;
    if (a < 255) return STROKE_COLORS.exhaust;
    return STROKE_COLORS.compression;
  }
  return STROKE_COLORS[strokeAt(theta)];
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a.toFixed(3)})`;
}

export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
