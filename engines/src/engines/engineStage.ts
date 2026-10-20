import * as THREE from 'three';
import './bvh';
import type { Stage, StageScene } from '../core/renderer';
import { tierSpec } from '../core/quality';
import { createBase, type BaseScene, type CameraPreset } from './common';
import { SingleCylinderEngine, type EngineKind, type PartKey, type ViewMode } from './singleCylinder';
import { Annotator } from './annotate';
import { EngineSim } from './sim';
import { reducedMotion, onSettings } from '../core/settings';



export const ENGINE_PRESETS: Record<string, CameraPreset> = {
  hero: { pos: [5.0, 2.9, 7.4], target: [0.15, 1.3, 0], fov: 30 },
  threeQuarter: { pos: [5.4, 3.7, 7.9], target: [0, 1.35, 0], fov: 30 },
  front: { pos: [0.4, 1.9, 10.2], target: [0, 1.35, 0], fov: 30 },
  cut: { pos: [1.6, 2.1, 8.6], target: [0, 1.35, 0], fov: 30 },
  chamber: { pos: [1.2, 2.75, 4.2], target: [0, 2.25, 0], fov: 28 },
  spark: { pos: [0.9, 2.6, 3.0], target: [0.02, 2.25, 0], fov: 26 },
  piston: { pos: [1.6, 2.2, 4.8], target: [0, 1.8, 0], fov: 28 },
  crank: { pos: [2.4, 0.9, 4.6], target: [0, 0.25, 0], fov: 28 },
  top: { pos: [0.8, 5.6, 5.4], target: [0, 2.7, 0], fov: 28 },
  back: { pos: [-4.8, 2.6, -6.8], target: [0, 1.35, 0], fov: 30 },
  wide: { pos: [6.6, 4.6, 10.4], target: [0, 1.3, 0], fov: 30 },
};

export interface EngineStageOptions {
  kind: EngineKind;
  sim: EngineSim;
  initial: string;
  autoRotate?: boolean;
  labels?: boolean;
  picking?: boolean;
  view?: ViewMode;
  /** keys shown as labels */
  labelKeys?: PartKey[];
  glow?: number;
  bloom?: number;
  rotate?: boolean;
  /** extra per-frame hook */
  onFrame?: (dt: number) => void;
}

export interface EngineView extends StageScene {
  engine: SingleCylinderEngine;
  base: BaseScene;
  annot: Annotator<PartKey>;
  sim: EngineSim;
  setView(v: ViewMode): Promise<void>;
  setLabels(on: boolean): void;
  freezeTheta: number | null;
}

const ALL_LABELS: PartKey[] = [
  'block', 'head', 'crankcase', 'oilpan', 'camcover', 'crankshaft', 'rod', 'piston', 'intakeValve', 'exhaustValve',
  'intakeCam', 'exhaustCam', 'sparkPlug', 'coil', 'injector', 'glowPlug', 'intake', 'exhaust', 'timingBelt', 'throttle',
  'catalyst', 'portInjector',
];

export async function createEngineStage(stage: Stage, o: EngineStageOptions): Promise<EngineView> {
  const base = createBase(stage, {
    presets: ENGINE_PRESETS,
    initial: o.initial,
    groundY: -1.07,
    shadowExtent: 3.2,
    minDistance: 3,
    maxDistance: 16,
    rotate: o.rotate,
    contactScale: 3.6,
  });
  const engine = new SingleCylinderEngine(o.kind, o.sim.geom, tierSpec().particles);
  await engine.ready;
  engine.glow = o.glow ?? 1;
  base.root.add(engine.group);
  // BVH for fast picking/occlusion
  for (const m of engine.pickables()) if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();

  const keys = (o.labelKeys ?? ALL_LABELS).filter((k) => engine.parts.has(k));
  const annot = new Annotator<PartKey>(stage.el, base.camera, engine, keys, new THREE.Vector3(0, 1.4, 0));
  annot.pickingOn = o.picking !== false;
  annot.labelsOn = !!o.labels;

  if (o.view && o.view !== 'solid') await engine.setView(o.view, false);
  base.setAutoRotate(!!o.autoRotate);
  const unsubSettings = onSettings((_s, k) => {
    if (k === 'motion') base.setAutoRotate(!!o.autoRotate && !reducedMotion());
  });

  let frame = 0;
  const view: EngineView = {
    scene: base.scene,
    camera: base.camera,
    engine,
    base,
    annot,
    sim: o.sim,
    bloom: o.bloom,
    freezeTheta: null,
    async setView(v) {
      await engine.setView(v);
      if (v === 'exploded') annot.labelsOn = true;
    },
    setLabels(on) {
      annot.labelsOn = on;
    },
    update(dt) {
      const sim = o.sim;
      const theta = view.freezeTheta ?? sim.theta;
      engine.update({ theta, rpm: sim.rpm, load: sim.load, table: sim.table, timing: sim.timing }, dt);
      base.updateControls(dt);
      o.onFrame?.(dt);
      frame++;
      if (annot.labelsOn ? frame % 2 === 0 : frame % 30 === 0) annot.update();
    },
    resize(w, h) {
      const aspect = w / h;
      base.camera.zoom = Math.min(1, Math.pow(aspect / 1.3, 0.85));
      base.camera.updateProjectionMatrix();
      engine.chamber.setSize(26 * Math.max(0.8, Math.min(1.6, h / 700)));
    },
    onTier() {
      base.applyShadowQuality();
    },
    activate() {
      annot.update();
    },
    deactivate() {
      annot.clearSelection();
    },
    dispose() {
      unsubSettings();
      annot.dispose();
      engine.dispose();
      for (const m of engine.pickables()) m.geometry.disposeBoundsTree?.();
      base.dispose();
    },
  };
  return view;
}
