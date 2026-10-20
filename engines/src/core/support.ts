import { initQuality } from './quality';

let supported: boolean | null = null;

/** Probe WebGL once (without loading three.js) and initialise the quality tier from the GPU name. */
export function probeWebGL(): boolean {
  if (supported !== null) return supported;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      supported = false;
      initQuality('');
      return false;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    initQuality(name);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    supported = true;
  } catch {
    supported = false;
    initQuality('');
  }
  return supported;
}

export const webglSupported = () => supported ?? probeWebGL();
