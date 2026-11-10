// Lazy front door to the 3D garage stage (garage3d.js + three.js live in their own chunk).
// Shell screens use this instead of importing garage3d directly, so the first paint needs no 3D code.
//  - mountStage() returns a handle at once; the scene attaches when the chunk has arrived
//  - carImg()/helmet3D() fall back to the SVG art until the chunk is loaded or on quality "Bassa"
import { getSettings } from '../engine/state.js';
import { helmetSVG } from './art.js';
import { gfxTier } from './quality.js';

let mod = null, pending = null;
export function loadStage() {
  return (pending ||= import('./garage3d.js').then((m) => (mod = m)).catch((e) => { pending = null; throw e; }));
}
export const stageLoaded = () => !!mod;

let _gl = null;
// WebGL availability, checked once on a throw-away context that is released immediately
export function webglOK() {
  if (_gl == null) {
    try {
      const c = document.createElement('canvas');
      const g = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'));
      _gl = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { _gl = false; }
  }
  return _gl;
}
export function stageEnabled() { return webglOK() && getSettings().view3d !== false; }
// animated 3D backdrops behind menus: not on quality "Bassa"
export function liveBackdrop() { return stageEnabled() && gfxTier() !== 'low'; }
const stills = () => !!mod && webglOK() && gfxTier() !== 'low';

export function helmet3D(h, size = 40) { return stills() ? mod.helmet3D(h, size) : helmetSVG(h, size); }
export function carImg(category, livery, opts = {}, w = 640, h = 300, fallback = '') { return stills() ? mod.carImg(category, livery, opts, w, h, fallback) : fallback; }

export function mountStage(host, opts = {}) {
  if (!host || !stageEnabled()) return null;
  let h = null, dead = false;
  const attach = (m) => { if (dead || !host.isConnected) return; h = m.mountStage(host, opts); };
  // already loaded: attach synchronously so re-renders keep the camera where it was
  if (mod) attach(mod);
  else loadStage().then((m) => requestAnimationFrame(() => attach(m))).catch((e) => console.warn('stage chunk', e));
  return {
    focus: (id) => h?.focus(id),
    setHotspots: (list) => h?.setHotspots(list),
    destroy() { dead = true; h?.destroy(); h = null; },
  };
}
export function disposeStage() { mod?.disposeStage(); }
// pause the stage render loop (window in background, heavy overlay on top...)
export function freezeStage(v) { try { window.__stage?.freeze(v); } catch {} }
