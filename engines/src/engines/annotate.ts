import * as THREE from 'three';
import { t } from '../ui/i18n';

export interface Annotatable<K extends string> {
  anchorOf(key: K, out?: THREE.Vector3): THREE.Vector3;
  pickables(): THREE.Mesh[];
  setHighlight(key: K | null, amount?: number): void;
}

interface Label {
  key: string;
  el: HTMLDivElement;
  line: SVGLineElement;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  on: boolean;
}

/**
 * Part labels with leader lines (projected each frame, hidden when occluded) and
 * hover / tap picking with a plain-language tooltip.
 */
export class Annotator<K extends string> {
  private stage: HTMLElement;
  private layer: HTMLDivElement;
  private svg: SVGSVGElement;
  private labels: Label[] = [];
  private tip: HTMLDivElement;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private v = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  labelsOn = false;
  pickingOn = true;
  hovered: K | null = null;
  selected: K | null = null;
  /** override highlight (e.g. systems section) */
  externalHighlight = false;
  onPick: ((key: K | null) => void) | null = null;
  private target: Annotatable<K>;
  private camera: THREE.Camera;
  private downAt: { x: number; y: number; t: number } | null = null;
  private moveQueued = false;
  private lastEvent: PointerEvent | null = null;
  private centre = new THREE.Vector3();

  constructor(stage: HTMLElement, camera: THREE.Camera, target: Annotatable<K>, keys: K[], centre = new THREE.Vector3(0, 1.5, 0)) {
    this.stage = stage;
    this.camera = camera;
    this.target = target;
    this.centre.copy(centre);
    this.layer = (stage.querySelector('.stage-label-layer') as HTMLDivElement) ?? this.makeLayer();
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'leaders');
    this.svg.setAttribute('aria-hidden', 'true');
    Object.assign(this.svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible' });
    this.layer.appendChild(this.svg);
    for (const key of keys) {
      const el = document.createElement('div');
      el.className = 'part-label';
      el.textContent = t(`parts.${key}.name`);
      this.layer.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', 'rgba(255,179,71,0.75)');
      line.setAttribute('stroke-width', '1');
      line.style.opacity = '0';
      this.svg.appendChild(line);
      this.labels.push({ key, el, line, x: 0, y: 0, w: 0, h: 0, ax: 0, ay: 0, on: false });
    }
    this.tip = document.createElement('div');
    this.tip.className = 'part-tip';
    this.tip.setAttribute('role', 'status');
    this.tip.setAttribute('aria-live', 'polite');
    stage.appendChild(this.tip);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerleave', this.onLeave);
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointerup', this.onUp);
  }

  private makeLayer() {
    const d = document.createElement('div');
    d.className = 'stage-label-layer';
    this.stage.appendChild(d);
    return d;
  }

  setKeys(keys: K[]) {
    for (const l of this.labels) {
      const show = keys.includes(l.key as K);
      l.el.style.display = show ? '' : 'none';
      l.line.style.display = show ? '' : 'none';
    }
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    this.lastEvent = e;
    if (!this.moveQueued) {
      this.moveQueued = true;
      requestAnimationFrame(() => {
        this.moveQueued = false;
        if (this.lastEvent) this.hoverAt(this.lastEvent);
      });
    }
  };

  private onLeave = () => {
    if (this.selected) return;
    this.setHover(null);
  };

  private onDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    if (!this.downAt || !this.pickingOn) return;
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    const quick = performance.now() - this.downAt.t < 450;
    this.downAt = null;
    if (moved > 6 || !quick) return;
    const key = this.pick(e);
    this.selected = key;
    this.setHover(key, e);
    this.onPick?.(key);
  };

  /** Raycast at a client position; returns part key */
  pick(e: { clientX: number; clientY: number }): K | null {
    const rect = this.stage.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.target.pickables(), false);
    for (const h of hits) {
      const k = h.object.userData.part as K | undefined;
      if (k && h.object.visible) return k;
    }
    return null;
  }

  private hoverAt(e: PointerEvent) {
    if (!this.pickingOn || this.selected) return;
    const key = this.pick(e);
    this.setHover(key, e);
  }

  setHover(key: K | null, e?: { clientX: number; clientY: number }) {
    this.hovered = key;
    if (!this.externalHighlight) this.target.setHighlight(key, 1);
    if (!key) {
      this.tip.classList.remove('show');
      this.stage.style.cursor = '';
      return;
    }
    this.stage.style.cursor = 'pointer';
    this.tip.innerHTML = `<strong>${t(`parts.${key}.name`)}</strong>${t(`parts.${key}.role`)}`;
    const rect = this.stage.getBoundingClientRect();
    let x = 16;
    let y = 16;
    if (e) {
      x = e.clientX - rect.left + 18;
      y = e.clientY - rect.top + 18;
    }
    this.tip.classList.add('show');
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    x = Math.min(x, rect.width - tw - 12);
    y = Math.min(y, rect.height - th - 12);
    if (x < 12) x = 12;
    if (y < 12) y = 12;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.tip.style.left = '0';
    this.tip.style.top = '0';
  }

  clearSelection() {
    this.selected = null;
    this.setHover(null);
  }

  /** Project labels; call every frame after the camera moved. */
  update() {
    const rect = this.stage.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (!this.labelsOn) {
      for (const l of this.labels) {
        if (l.on) {
          l.on = false;
          l.el.classList.remove('on');
          l.line.style.opacity = '0';
        }
      }
      return;
    }
    this.camera.getWorldPosition(this.camPos);
    const pick = this.target.pickables();
    const c = this.centre.clone().project(this.camera);
    const cx = (c.x * 0.5 + 0.5) * W;
    const cy = (-c.y * 0.5 + 0.5) * H;
    const visible: Label[] = [];
    for (const l of this.labels) {
      if (l.el.style.display === 'none') continue;
      const world = this.target.anchorOf(l.key as K, this.v);
      const dist = world.distanceTo(this.camPos);
      const p = world.clone().project(this.camera);
      let ok = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      if (ok) {
        // occlusion: is something else in front of the anchor?
        this.ray.set(this.camPos, world.clone().sub(this.camPos).normalize());
        const hits = this.ray.intersectObjects(pick, false);
        for (const h of hits) {
          if (h.distance > dist - 0.06) break;
          if (h.object.userData.part !== l.key) {
            ok = false;
            break;
          }
        }
      }
      l.ax = (p.x * 0.5 + 0.5) * W;
      l.ay = (-p.y * 0.5 + 0.5) * H;
      if (!ok) {
        if (l.on) {
          l.on = false;
          l.el.classList.remove('on');
          l.line.style.opacity = '0';
        }
        continue;
      }
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      // push the label outward from the model centre
      let dx = l.ax - cx;
      let dy = l.ay - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const off = Math.min(90, Math.max(40, W * 0.06));
      l.x = l.ax + dx * off + (dx > 0 ? l.w / 2 : -l.w / 2);
      l.y = l.ay + dy * off * 0.6;
      visible.push(l);
    }
    // relax overlaps (vertical separation within the same side)
    visible.sort((a, b) => a.y - b.y);
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 1; i < visible.length; i++) {
        const a = visible[i - 1];
        const b = visible[i];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6 && b.y - a.y < (a.h + b.h) / 2 + 4) {
          const push = ((a.h + b.h) / 2 + 4 - (b.y - a.y)) / 2;
          a.y -= push;
          b.y += push;
        }
      }
    }
    for (const l of visible) {
      l.x = Math.min(W - l.w / 2 - 8, Math.max(l.w / 2 + 8, l.x));
      l.y = Math.min(H - l.h / 2 - 8, Math.max(l.h / 2 + 8, l.y));
      l.el.style.transform = `translate(${Math.round(l.x - l.w / 2)}px, ${Math.round(l.y - l.h / 2)}px)`;
      if (!l.on) {
        l.on = true;
        l.el.classList.add('on');
        l.line.style.opacity = '1';
      }
      const ex = l.x + (l.ax < l.x ? -l.w / 2 : l.w / 2);
      l.line.setAttribute('x1', l.ax.toFixed(1));
      l.line.setAttribute('y1', l.ay.toFixed(1));
      l.line.setAttribute('x2', ex.toFixed(1));
      l.line.setAttribute('y2', l.y.toFixed(1));
    }
  }

  dispose() {
    this.stage.removeEventListener('pointermove', this.onMove);
    this.stage.removeEventListener('pointerleave', this.onLeave);
    this.stage.removeEventListener('pointerdown', this.onDown);
    this.stage.removeEventListener('pointerup', this.onUp);
    for (const l of this.labels) {
      l.el.remove();
      l.line.remove();
    }
    this.svg.remove();
    this.tip.remove();
  }
}
