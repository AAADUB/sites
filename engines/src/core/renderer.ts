import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { onTick } from './clock';
import { onTier, resetFps, sampleFps, tier, tierSpec } from './quality';
import { webglSupported } from './support';

/** A scene that can be shown on a stage. Built lazily, disposed when far away. */
export interface StageScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** advance the scene (called every frame while the stage is the active one) */
  update(dt: number, t: number): void;
  /** called after the renderer size changes */
  resize?(w: number, h: number): void;
  /** optional custom render (e.g. split view); return true when handled */
  render?(ctx: RenderCtx): boolean;
  /** tier change */
  onTier?(): void;
  /** stage became active / inactive */
  activate?(): void;
  deactivate?(): void;
  /** bloom strength multiplier for this scene */
  bloom?: number;
  dispose(): void;
}

export interface RenderCtx {
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
}

export type StageFactory = (stage: Stage) => Promise<StageScene>;

export class Stage {
  readonly el: HTMLElement;
  readonly id: string;
  readonly factory: StageFactory;
  view: StageScene | null = null;
  building: Promise<void> | null = null;
  ratio = 0;
  near = false;
  lastActive = 0;
  freeze: HTMLCanvasElement | null = null;
  ready = false;
  private readyCbs: Array<() => void> = [];

  constructor(el: HTMLElement, factory: StageFactory) {
    this.el = el;
    this.id = el.dataset.stage || 'stage';
    this.factory = factory;
  }

  onReady(fn: () => void) {
    if (this.ready) fn();
    else this.readyCbs.push(fn);
  }

  markReady() {
    this.ready = true;
    this.readyCbs.splice(0).forEach((f) => f());
  }
}

class Manager {
  renderer: THREE.WebGLRenderer | null = null;
  composer: EffectComposer | null = null;
  renderPass: RenderPass | null = null;
  effectPass: EffectPass | null = null;
  bloom: BloomEffect | null = null;
  stages: Stage[] = [];
  active: Stage | null = null;
  get supported() {
    return webglSupported();
  }
  lost = false;
  width = 1;
  height = 1;
  dpr = 1;
  private ro: ResizeObserver | null = null;
  private visIO: IntersectionObserver | null = null;
  private nearIO: IntersectionObserver | null = null;
  private dprMq: MediaQueryList | null = null;
  private pendingSwitch = false;
  private started = false;
  private switchHooks = new Set<(s: Stage | null) => void>();

  get canvas() {
    return this.renderer?.domElement ?? null;
  }

  onSwitch(fn: (s: Stage | null) => void) {
    this.switchHooks.add(fn);
    return () => this.switchHooks.delete(fn);
  }

  register(stage: Stage) {
    this.stages.push(stage);
    if (!this.supported) return;
    this.ensureObservers();
    this.visIO!.observe(stage.el);
    this.nearIO!.observe(stage.el);
  }

  private ensureObservers() {
    if (this.visIO) return;
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    this.visIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = this.stages.find((x) => x.el === e.target);
          if (s) s.ratio = e.isIntersecting ? e.intersectionRatio * Math.min(1, e.intersectionRect.height / Math.max(1, innerHeight * 0.5)) : 0;
        }
        this.pendingSwitch = true;
      },
      { threshold: thresholds },
    );
    this.nearIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const s = this.stages.find((x) => x.el === e.target);
          if (!s) continue;
          s.near = e.isIntersecting;
          if (s.near) this.build(s);
        }
        this.collect();
      },
      { rootMargin: '150% 0px 150% 0px' },
    );
  }

  private initRenderer() {
    if (this.renderer) return;
    const r = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;
    r.setClearColor(0x000000, 0);
    r.domElement.setAttribute('aria-hidden', 'true');
    r.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    r.domElement.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.buildComposer();
      this.stages.forEach((s) => s.view?.onTier?.());
    });
    this.renderer = r;
    this.buildComposer();
    onTier(() => {
      this.buildComposer();
      this.applySize();
      this.stages.forEach((s) => s.view?.onTier?.());
    });
    this.ro = new ResizeObserver(() => this.applySize());
    this.watchDpr();
    if (!this.started) {
      this.started = true;
      onTick((dt, t) => this.frame(dt, t), 100);
    }
  }

  private watchDpr() {
    this.dprMq?.removeEventListener('change', this.onDpr);
    this.dprMq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprMq.addEventListener('change', this.onDpr);
  }

  private onDpr = () => {
    this.applySize();
    this.watchDpr();
  };

  buildComposer() {
    const r = this.renderer;
    if (!r) return;
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    const spec = tierSpec();
    r.shadowMap.enabled = spec.shadows;
    if (tier() === 'low') {
      r.toneMapping = THREE.AgXToneMapping;
      r.toneMappingExposure = 1.0;
      return;
    }
    r.toneMapping = THREE.NoToneMapping;
    const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    const cam = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(new THREE.Scene(), cam);
    composer.addPass(this.renderPass);
    const effects = [];
    if (spec.bloom) {
      this.bloom = new BloomEffect({
        // only true HDR light (flame, spark, glowing exhaust) should bloom, not bright metal
        intensity: 1.0,
        luminanceThreshold: 2.4,
        luminanceSmoothing: 0.4,
        mipmapBlur: true,
        radius: 0.62,
        levels: tier() === 'high' ? 7 : 5,
      });
      effects.push(this.bloom);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.42 }));
    if (spec.smaa) effects.push(new SMAAEffect({ preset: SMAAPreset.HIGH }));
    this.effectPass = new EffectPass(cam, ...effects);
    this.effectPass.dithering = true;
    composer.addPass(this.effectPass);
    this.composer = composer;
    if (this.active?.view) this.bindView(this.active.view);
  }

  private bindView(v: StageScene) {
    if (!this.renderPass || !this.effectPass) return;
    this.renderPass.mainScene = v.scene;
    this.renderPass.mainCamera = v.camera;
    this.effectPass.mainCamera = v.camera;
    if (this.bloom) this.bloom.intensity = 0.9 * (v.bloom ?? 1);
  }

  async build(s: Stage) {
    if (s.view || s.building) return s.building ?? undefined;
    this.initRenderer();
    s.building = (async () => {
      try {
        s.view = await s.factory(s);
        s.el.classList.add('is-built');
        s.markReady();
        this.pendingSwitch = true;
      } catch (err) {
        s.el.classList.add('is-error');
        // keep the poster image visible
        console.warn(err instanceof Error ? err.message : err);
      } finally {
        s.building = null;
      }
    })();
    return s.building;
  }

  /** Dispose scenes that are far away and have not been shown for a while. */
  private collect() {
    const now = performance.now();
    for (const s of this.stages) {
      if (s.view && !s.near && s !== this.active && now - s.lastActive > 15000) {
        s.view.dispose();
        s.view = null;
        s.ready = false;
        s.el.classList.remove('is-built', 'is-live');
      }
    }
  }

  private chooseActive(): Stage | null {
    let best: Stage | null = null;
    for (const s of this.stages) if (s.ratio > 0.04 && s.view && (!best || s.ratio > best.ratio)) best = s;
    return best;
  }

  private captureFreeze(s: Stage) {
    const c = this.canvas;
    if (!c || !s.view) return;
    if (!s.freeze) {
      s.freeze = document.createElement('canvas');
      s.freeze.className = 'stage-freeze';
      s.freeze.setAttribute('aria-hidden', 'true');
      s.el.prepend(s.freeze);
    }
    s.freeze.width = c.width;
    s.freeze.height = c.height;
    this.renderView(s.view, 0);
    s.freeze.getContext('2d')?.drawImage(c, 0, 0);
    s.freeze.hidden = false;
  }

  private switchTo(next: Stage | null) {
    const prev = this.active;
    if (prev === next) return;
    if (prev && prev.view && this.canvas?.parentElement === prev.el && !this.lost) this.captureFreeze(prev);
    if (prev) {
      prev.view?.deactivate?.();
      prev.el.classList.remove('is-live');
      if (this.ro) this.ro.unobserve(prev.el);
    }
    this.active = next;
    if (next && next.view && this.renderer) {
      const c = this.renderer.domElement;
      next.el.prepend(c);
      if (next.freeze) next.freeze.hidden = true;
      next.el.classList.add('is-live');
      this.ro?.observe(next.el);
      this.applySize();
      this.bindView(next.view);
      next.view.activate?.();
      resetFps();
    }
    this.switchHooks.forEach((f) => f(next));
  }

  applySize() {
    const s = this.active;
    const r = this.renderer;
    if (!s || !r) return;
    const rect = s.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, tierSpec().dprCap);
    if (w === this.width && h === this.height && dpr === this.dpr && r.getPixelRatio() === dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    r.setPixelRatio(dpr);
    r.setSize(w, h, false);
    this.composer?.setSize(w, h, false);
    if (s.view) {
      s.view.camera.aspect = w / h;
      s.view.camera.updateProjectionMatrix();
      s.view.resize?.(w, h);
    }
  }

  private renderView(v: StageScene, _dt: number) {
    const r = this.renderer!;
    if (v.render?.({ renderer: r, width: this.width, height: this.height })) return;
    if (this.composer) this.composer.render(_dt);
    else r.render(v.scene, v.camera);
  }

  private frame(dt: number, t: number) {
    if (this.pendingSwitch) {
      this.pendingSwitch = false;
      this.switchTo(this.chooseActive());
    }
    const s = this.active;
    if (!s || !s.view || !this.renderer || this.lost) return;
    s.lastActive = performance.now();
    s.view.update(dt, t);
    this.renderView(s.view, dt);
    sampleFps(dt);
  }
}

export const manager = new Manager();
