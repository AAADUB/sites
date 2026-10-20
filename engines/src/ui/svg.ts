const NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | undefined>;

/** Create an SVG element with attributes and children. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<SVGElement | string | null | undefined>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}

export function svgRoot(w: number, h: number, label?: string) {
  const root = s('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart-svg', preserveAspectRatio: 'xMidYMid meet', role: label ? 'img' : undefined, 'aria-label': label });
  return root;
}

export function setAttrs(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
}

/** Path data from points */
export function pathD(pts: Array<[number, number]>, close = false) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + (close ? ' Z' : '');
}

/** Linear scale helper */
export function scale(d0: number, d1: number, r0: number, r1: number) {
  const f = (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.invert = (p: number) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  return f as ((v: number) => number) & { invert: (p: number) => number };
}

/** Draw x/y axes with ticks into a group */
export function axes(
  g: SVGGElement,
  o: {
    x: (v: number) => number;
    y: (v: number) => number;
    xTicks: number[];
    yTicks: number[];
    xFmt: (v: number) => string;
    yFmt: (v: number) => string;
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    xLabel?: string;
    yLabel?: string;
    yLabelRight?: string;
  },
) {
  for (const v of o.yTicks) {
    const y = o.y(v);
    g.appendChild(s('line', { x1: o.x0, x2: o.x1, y1: y, y2: y, class: 'grid' }));
    g.appendChild(s('text', { x: o.x0 - 6, y: y + 3.5, 'text-anchor': 'end' }, o.yFmt(v)));
  }
  for (const v of o.xTicks) {
    const x = o.x(v);
    g.appendChild(s('line', { x1: x, x2: x, y1: o.y0, y2: o.y1, class: 'grid' }));
    g.appendChild(s('text', { x, y: o.y0 + 14, 'text-anchor': 'middle' }, o.xFmt(v)));
  }
  g.appendChild(s('line', { x1: o.x0, x2: o.x1, y1: o.y0, y2: o.y0, class: 'axis' }));
  if (o.xLabel) g.appendChild(s('text', { x: (o.x0 + o.x1) / 2, y: o.y0 + 28, 'text-anchor': 'middle' }, o.xLabel));
  if (o.yLabel) g.appendChild(s('text', { x: o.x0, y: o.y1 - 8, 'text-anchor': 'start' }, o.yLabel));
  if (o.yLabelRight) g.appendChild(s('text', { x: o.x1, y: o.y1 - 8, 'text-anchor': 'end' }, o.yLabelRight));
}
