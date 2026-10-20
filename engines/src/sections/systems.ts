import { registerStage, captureFreeze } from './shared';
import { createEngineStage, type EngineView } from '../engines/engineStage';
import { EngineSim, sharedSim } from '../engines/sim';
import { PETROL } from '../physics/kinematics';
import { t } from '../ui/i18n';
import { s, svgRoot } from '../ui/svg';
import type { PartKey } from '../engines/singleCylinder';
import { COLORS } from '../core/tokens';

const SETS: Record<string, { keys: PartKey[]; preset: string }> = {
  fuel: { keys: ['portInjector', 'intake', 'throttle'], preset: 'threeQuarter' },
  ignition: { keys: ['coil', 'sparkPlug'], preset: 'top' },
  oil: { keys: ['oilpan', 'crankshaft', 'crankcase'], preset: 'crank' },
  cooling: { keys: ['block', 'head'], preset: 'threeQuarter' },
  exhaust: { keys: ['exhaust', 'catalyst'], preset: 'threeQuarter' },
};

const L = (k: string) => t(`ui.diag.${k}`);
const label = (x: number, y: number, text: string, anchor = 'middle', color?: string) =>
  s('text', { x, y, 'text-anchor': anchor, style: `font-size:9.5px;${color ? `fill:${color}` : ''}` }, text);
const flow = (d: string, color: string, width = 2, dash = '4 6') =>
  s('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-dasharray': dash, class: 'flow', 'stroke-linecap': 'round' });
const line = (d: string, color = 'rgba(255,255,255,0.35)', width = 1.2) => s('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round' });

function fuelDiagram() {
  const g = svgRoot(320, 180);
  g.append(
    s('rect', { x: 14, y: 104, width: 78, height: 56, rx: 8, fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.35)' }),
    s('rect', { x: 15, y: 130, width: 76, height: 29, rx: 6, fill: 'rgba(255,179,71,0.22)' }),
    s('circle', { cx: 40, cy: 140, r: 8, fill: '#15181d', stroke: COLORS.amberSoft }),
    line('M40 132 V 70 H 230 V 82', 'rgba(255,179,71,0.5)', 2.4),
    flow('M40 132 V 70 H 230 V 82', COLORS.amberSoft),
    // intake runner with air
    s('rect', { x: 150, y: 100, width: 160, height: 36, rx: 6, fill: 'rgba(63,208,255,0.05)', stroke: 'rgba(255,255,255,0.35)' }),
    flow('M155 118 H 305', COLORS.cyan, 2, '6 8'),
    s('rect', { x: 222, y: 80, width: 16, height: 24, rx: 3, fill: '#2a2d33', stroke: 'rgba(255,255,255,0.5)' }),
    s('path', { d: 'M230 104 L 214 132 L 246 132 Z', fill: 'rgba(255,179,71,0.25)', class: 'pulse' }),
    label(53, 98, L('tank')),
    label(58, 154, L('pump'), 'start'),
    label(135, 64, L('rail')),
    label(262, 92, L('injector'), 'start'),
    label(170, 150, L('intakeAir'), 'start', COLORS.cyan),
    label(230, 150, L('spray'), 'middle', COLORS.amberSoft),
  );
  return g;
}

function ignitionDiagram() {
  const g = svgRoot(320, 180);
  const coil = s('g');
  for (let i = 0; i < 9; i++) coil.appendChild(s('ellipse', { cx: 130 + i * 7, cy: 90, rx: 3, ry: 22, fill: 'none', stroke: 'rgba(255,255,255,0.45)' }));
  for (let i = 0; i < 18; i++) coil.appendChild(s('ellipse', { cx: 128 + i * 3.6, cy: 90, rx: 1.6, ry: 14, fill: 'none', stroke: COLORS.cyan, 'stroke-opacity': 0.6 }));
  g.append(
    s('rect', { x: 18, y: 72, width: 60, height: 40, rx: 5, fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.4)' }),
    s('rect', { x: 30, y: 66, width: 10, height: 6, fill: 'rgba(255,255,255,0.4)' }),
    s('rect', { x: 56, y: 66, width: 10, height: 6, fill: 'rgba(255,255,255,0.4)' }),
    line('M78 82 H 124'),
    line('M78 102 H 124'),
    coil,
    line('M196 90 H 240 V 60 H 268', COLORS.cyan, 1.6),
    flow('M196 90 H 240 V 60 H 268', COLORS.cyan, 1.6),
    s('rect', { x: 262, y: 44, width: 16, height: 40, rx: 3, fill: '#eeece6' }),
    s('rect', { x: 260, y: 84, width: 20, height: 30, rx: 2, fill: '#8f8a80' }),
    s('path', { d: 'M266 114 V 128 M274 114 V 122 H 268', stroke: '#c77d4f', 'stroke-width': 2, fill: 'none' }),
    s('circle', { cx: 268, cy: 125, r: 5, fill: '#bfe4ff', class: 'spark-blink' }),
    label(48, 126, L('battery')),
    label(48, 95, L('lowV'), 'middle', COLORS.text),
    label(160, 128, L('coil')),
    label(218, 52, L('highV'), 'middle', COLORS.cyan),
    label(292, 70, L('plug'), 'start'),
    label(282, 140, L('spark'), 'start', '#bfe4ff'),
  );
  return g;
}

function oilDiagram() {
  const g = svgRoot(320, 180);
  g.append(
    s('path', { d: 'M20 120 H 300 L 290 165 H 30 Z', fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.35)' }),
    s('path', { d: 'M25 140 H 295 L 290 165 H 30 Z', fill: 'rgba(199,125,79,0.35)' }),
    s('circle', { cx: 70, cy: 128, r: 12, fill: '#15181d', stroke: COLORS.amberSoft }),
    s('rect', { x: 110, y: 48, width: 24, height: 40, rx: 6, fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.45)' }),
    line('M70 116 V 68 H 110', 'rgba(255,179,71,0.5)', 2.2),
    flow('M70 116 V 68 H 110', COLORS.amberSoft),
    line('M134 68 H 290', 'rgba(255,179,71,0.5)', 2.2),
    flow('M134 68 H 290', COLORS.amberSoft),
  );
  for (const x of [175, 225, 275]) {
    g.append(
      line(`M${x} 68 V 84`, 'rgba(255,179,71,0.5)', 2),
      s('circle', { cx: x, cy: 96, r: 12, fill: 'rgba(255,179,71,0.12)', stroke: COLORS.amberSoft }),
      s('circle', { cx: x, cy: 96, r: 8.5, fill: '#a4a9b0' }),
      flow(`M${x} 108 V 138`, 'rgba(199,125,79,0.9)', 1.5, '2 6'),
    );
  }
  g.append(label(70, 156, L('oilPump')), label(122, 40, L('filter')), label(225, 54, L('bearings')), label(270, 132, L('oilPan'), 'end'), label(195, 122, L('oilFilm'), 'start', COLORS.amberSoft));
  return g;
}

function coolingDiagram() {
  const g = svgRoot(320, 180);
  const rad = s('g');
  for (let x = 228; x <= 292; x += 6) rad.appendChild(s('line', { x1: x, x2: x, y1: 40, y2: 140, stroke: 'rgba(255,255,255,0.22)' }));
  g.append(
    s('rect', { x: 24, y: 40, width: 110, height: 100, rx: 8, fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.4)' }),
    s('circle', { cx: 79, cy: 90, r: 24, fill: '#15181d', stroke: 'rgba(255,255,255,0.4)' }),
    s('circle', { cx: 79, cy: 90, r: 34, fill: 'none', stroke: COLORS.cyan, 'stroke-opacity': 0.6, 'stroke-width': 6 }),
    s('rect', { x: 220, y: 36, width: 80, height: 108, rx: 6, fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.4)' }),
    rad,
    line('M134 56 H 220', COLORS.amber, 3),
    flow('M134 56 H 220', COLORS.amberSoft, 2),
    line('M220 126 H 134', COLORS.cyan, 3),
    flow('M220 126 H 134', '#bdefff', 2),
    s('circle', { cx: 176, cy: 56, r: 7, fill: '#15181d', stroke: COLORS.amberSoft }),
    s('circle', { cx: 176, cy: 126, r: 9, fill: '#15181d', stroke: COLORS.cyan }),
    s('circle', { cx: 310, cy: 90, r: 4, fill: 'none', stroke: 'rgba(255,255,255,0.35)' }),
    label(79, 32, L('jacket')),
    label(176, 44, L('thermostat')),
    label(176, 152, L('waterPump')),
    label(260, 158, L('radiator')),
    label(150, 72, L('hot'), 'start', COLORS.amberSoft),
    label(200, 118, L('cool'), 'end', COLORS.cyan),
  );
  return g;
}

function exhaustDiagram() {
  const g = svgRoot(320, 180);
  const comb = s('g');
  for (let x = 128; x <= 186; x += 6) comb.appendChild(s('line', { x1: x, x2: x, y1: 74, y2: 106, stroke: 'rgba(255,255,255,0.2)' }));
  g.append(
    s('path', { d: 'M14 60 H 40 V 120 H 14', fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.4)' }),
    line('M40 90 H 120', 'rgba(255,255,255,0.4)', 14),
    s('rect', { x: 120, y: 68, width: 72, height: 44, rx: 10, fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.45)' }),
    comb,
    line('M192 90 H 220', 'rgba(255,255,255,0.4)', 14),
    s('ellipse', { cx: 255, cy: 90, rx: 36, ry: 22, fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.45)' }),
    line('M291 90 H 314', 'rgba(255,255,255,0.4)', 10),
    flow('M44 90 H 120', COLORS.amber, 2.4),
    flow('M192 90 H 306', '#d8d2cc', 2.4),
    label(78, 74, L('dirtyGas'), 'middle', COLORS.amberSoft),
    label(156, 128, L('catalyst')),
    label(252, 124, L('muffler')),
    label(250, 60, L('cleanGas'), 'middle', '#d8d2cc'),
    label(28, 52, L('manifold')),
  );
  return g;
}

const DIAGRAMS: Record<string, () => SVGSVGElement> = { fuel: fuelDiagram, ignition: ignitionDiagram, oil: oilDiagram, cooling: coolingDiagram, exhaust: exhaustDiagram };

export async function init(section: HTMLElement) {
  const sim = sharedSim('systems', () => new EngineSim('otto', PETROL, { rpm: 1800, load: 0.6, speed: 0.06 }));
  captureFreeze(sim, 380);
  let view: EngineView | null = null;
  let current = 'fuel';
  const stageEl = section.querySelector<HTMLElement>('[data-stage="systems"]');
  registerStage(stageEl, async (st) => {
    view = await createEngineStage(st, { kind: 'petrol', sim, initial: SETS[current].preset });
    view.annot.externalHighlight = true;
    view.engine.setHighlights(SETS[current].keys);
    view.engine.parts.get('camcover')!.obj.visible = true;
    return view;
  });

  for (const [k, fn] of Object.entries(DIAGRAMS)) {
    const host = section.querySelector<HTMLElement>(`[data-sys-diagram="${k}"]`);
    if (host) {
      const svg = fn();
      svg.setAttribute('aria-hidden', 'true');
      host.appendChild(svg);
    }
  }

  const tabs = Array.from(section.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const select = (k: string, focus = false) => {
    current = k;
    tabs.forEach((b) => {
      const on = b.dataset.sys === k;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    section.querySelectorAll<HTMLElement>('[data-sys-panel]').forEach((p) => (p.hidden = p.dataset.sysPanel !== k));
    if (view) {
      view.engine.setHighlights(SETS[k].keys);
      view.base.goTo(SETS[k].preset, 1.6);
    }
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(b.dataset.sys!));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        select(n.dataset.sys!, true);
      }
    });
  });
}
