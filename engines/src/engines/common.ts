import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import { manager, type Stage } from '../core/renderer';
import { tierSpec } from '../core/quality';
import { reducedMotion } from '../core/settings';
import { t } from '../ui/i18n';

let envTex: THREE.Texture | null = null;
let envUsers = 0;

/** Shared image-based lighting from RoomEnvironment (no HDRI download). */
export function getEnvironment(): THREE.Texture {
  if (envTex) {
    envUsers++;
    return envTex;
  }
  const r = manager.renderer!;
  const pmrem = new THREE.PMREMGenerator(r);
  const room = new RoomEnvironment();
  envTex = pmrem.fromScene(room, 0.035).texture;
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
  pmrem.dispose();
  envUsers = 1;
  return envTex;
}

export function releaseEnvironment() {
  envUsers--;
  if (envUsers <= 0 && envTex) {
    envTex.dispose();
    envTex = null;
    envUsers = 0;
  }
}

/** Soft radial contact shadow texture */
let contactTex: THREE.CanvasTexture | null = null;
function contactTexture() {
  if (contactTex) return contactTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  contactTex = new THREE.CanvasTexture(c);
  contactTex.colorSpace = THREE.SRGBColorSpace;
  return contactTex;
}

export interface CameraPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface BaseScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  ground: THREE.Mesh;
  contact: THREE.Mesh;
  root: THREE.Group;
  presets: Record<string, CameraPreset>;
  goTo(name: string, duration?: number): void;
  reset(): void;
  setAutoRotate(on: boolean): void;
  updateControls(dt: number): void;
  applyShadowQuality(): void;
  dispose(): void;
  /** whether the user is currently interacting */
  interacting: boolean;
}

export interface BaseOptions {
  presets: Record<string, CameraPreset>;
  initial: string;
  groundY?: number;
  shadowExtent?: number;
  minDistance?: number;
  maxDistance?: number;
  rotate?: boolean;
  autoRotateSpeed?: number;
  contactScale?: number;
}

/**
 * Studio scene: IBL + key light with soft shadows + rim light + contact shadow,
 * orbit controls with damping and limits, cinematic camera presets, touch "Explore" mode.
 */
export function createBase(stage: Stage, o: BaseOptions): BaseScene {
  const scene = new THREE.Scene();
  scene.environment = getEnvironment();
  scene.environmentIntensity = 0.85;

  const first = o.presets[o.initial];
  const camera = new THREE.PerspectiveCamera(first.fov ?? 32, 1, 0.05, 100);
  camera.position.set(...first.pos);

  const key = new THREE.DirectionalLight('#fff4e6', 2.6);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  const ext = o.shadowExtent ?? 3;
  Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 20 });
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.DirectionalLight('#9fd8ff', 1.6);
  rim.position.set(-5, 3, -6);
  scene.add(rim);

  const fill = new THREE.HemisphereLight('#c8d4e6', '#0b0c0e', 0.35);
  scene.add(fill);

  const gy = o.groundY ?? 0;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = gy;
  ground.receiveShadow = true;
  scene.add(ground);

  const cs = o.contactScale ?? 3.2;
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(cs, cs * 0.8),
    new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = gy + 0.002;
  contact.renderOrder = -1;
  scene.add(contact);

  const root = new THREE.Group();
  scene.add(root);

  const controls = new OrbitControls(camera, stage.el);
  controls.target.set(...first.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.7;
  controls.minDistance = o.minDistance ?? 2.5;
  controls.maxDistance = o.maxDistance ?? 14;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI / 2 - 0.04; // never below the floor
  controls.autoRotateSpeed = o.autoRotateSpeed ?? 0.45;
  controls.update();

  const coarse = matchMedia('(pointer: coarse)').matches;
  let exploring = false;
  const setExplore = (on: boolean) => {
    exploring = on;
    controls.enabled = !coarse || on;
    controls.enableZoom = coarse && on;
    stage.el.classList.toggle('is-exploring', on);
    exploreBtn?.setAttribute('aria-pressed', String(on));
    if (exploreBtn) exploreBtn.querySelector('.btn-label')!.textContent = on ? t('ui.done') : t('ui.explore');
  };
  // On touch devices rotation needs an explicit Explore mode so page scrolling is never hijacked.
  let exploreBtn: HTMLButtonElement | null = null;
  if (coarse && o.rotate !== false) {
    exploreBtn = document.createElement('button');
    exploreBtn.type = 'button';
    exploreBtn.className = 'btn btn-sm stage-explore';
    exploreBtn.setAttribute('aria-pressed', 'false');
    exploreBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/></svg><span class="btn-label">${t('ui.explore')}</span>`;
    exploreBtn.addEventListener('click', () => setExplore(!exploring));
    const holder = stage.el.querySelector('.stage-ui.tr') ?? stage.el;
    holder.appendChild(exploreBtn);
  }
  if (o.rotate === false) controls.enabled = false;
  else setExplore(false);

  let interacting = false;
  controls.addEventListener('start', () => {
    interacting = true;
    base.interacting = true;
    tween?.kill();
  });
  controls.addEventListener('end', () => {
    interacting = false;
    base.interacting = false;
  });

  let tween: gsap.core.Timeline | null = null;
  const goTo = (name: string, duration = 1.6) => {
    const p = o.presets[name];
    if (!p) return;
    tween?.kill();
    if (reducedMotion() || duration === 0) {
      camera.position.set(...p.pos);
      controls.target.set(...p.target);
      if (p.fov) {
        camera.fov = p.fov;
        camera.updateProjectionMatrix();
      }
      controls.update();
      return;
    }
    tween = gsap.timeline();
    tween.to(camera.position, { x: p.pos[0], y: p.pos[1], z: p.pos[2], duration, ease: 'expo.inOut' }, 0);
    tween.to(controls.target, { x: p.target[0], y: p.target[1], z: p.target[2], duration, ease: 'expo.inOut' }, 0);
    if (p.fov) tween.to(camera, { fov: p.fov, duration, ease: 'expo.inOut', onUpdate: () => camera.updateProjectionMatrix() }, 0);
  };
  let current = o.initial;
  const reset = () => goTo(current, 1.1);
  const onDbl = () => reset();
  stage.el.addEventListener('dblclick', onDbl);

  const applyShadowQuality = () => {
    const spec = tierSpec();
    key.castShadow = spec.shadows;
    if (key.shadow.mapSize.x !== spec.shadowSize) {
      key.shadow.mapSize.set(spec.shadowSize, spec.shadowSize);
      key.shadow.map?.dispose();
      key.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  };
  applyShadowQuality();

  const base: BaseScene = {
    scene,
    camera,
    controls,
    key,
    rim,
    fill,
    ground,
    contact,
    root,
    presets: o.presets,
    goTo(name, d) {
      current = name;
      goTo(name, d);
    },
    reset,
    interacting,
    setAutoRotate(on) {
      controls.autoRotate = on && !reducedMotion();
    },
    updateControls() {
      if (controls.enabled || controls.autoRotate) controls.update();
    },
    applyShadowQuality,
    dispose() {
      tween?.kill();
      controls.dispose();
      stage.el.removeEventListener('dblclick', onDbl);
      exploreBtn?.remove();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      key.shadow.map?.dispose();
      releaseEnvironment();
    },
  };
  return base;
}

/** Utility: dispose everything under an object */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((obj) => {
    const m = obj as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
