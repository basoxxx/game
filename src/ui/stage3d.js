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
// still renders: SVG until the chunk is here (asked for on first use), and always on "Bassa"
const stills = () => { if (!webglOK() || gfxTier() === 'low') return false; if (!mod) loadStage().catch(() => {}); return !!mod; };

export function helmet3D(h, size = 40) { return stills() ? mod.helmet3D(h, size) : helmetSVG(h, size); }
export function carImg(category, livery, opts = {}, w = 640, h = 300, fallback = '') { return stills() ? mod.carImg(category, livery, opts, w, h, fallback) : fallback; }

export function mountStage(host, opts = {}) {
  if (!host || !stageEnabled()) return null;
  let h = null, dead = false, spots = null, foc;
  // hotspots / focus asked for before the chunk arrived are applied once the scene attaches
  const attach = (m) => { if (dead || !host.isConnected) return; h = m.mountStage(host, opts); if (spots) h?.setHotspots(spots); if (foc !== undefined) h?.focus(foc); };
  // already loaded: attach synchronously so re-renders keep the camera where it was
  if (mod) attach(mod);
  else loadStage().then((m) => requestAnimationFrame(() => attach(m))).catch((e) => console.warn('stage chunk', e));
  return {
    focus: (id) => { foc = id; return h?.focus(id); },
    setHotspots: (list) => { spots = list; return h?.setHotspots(list); },
    destroy() { dead = true; h?.destroy(); h = null; },
  };
}
// where the R&D areas live on each car (x forward, y up, z right): the Centro Tecnico hotspots
const PART_POS = {
  formula: { aero: [2.5, 0.28, 0.5], engine: [-1.15, 0.72, 0.2], chassis: [0.55, 0.62, 0.3], tyre: [1.8, 0.36, 0.86], reliability: [-2.05, 0.42, 0.25] },
  endurance: { aero: [-2.3, 1.0, 0.5], engine: [-1.3, 0.72, 0.3], efficiency: [0.2, 0.5, 0.95], tyre: [1.55, 0.36, 0.95], reliability: [-0.2, 0.95, 0.2] },
  rally: { engine: [1.45, 0.86, 0.3], suspension: [1.3, 0.42, 0.88], chassis: [0, 1.25, 0.3], gearbox: [-0.2, 0.3, 0.9], reliability: [-1.75, 0.8, 0.4] },
};
export function partPositions(category) { return PART_POS[category === 'junior' ? 'formula' : category] || PART_POS.formula; }
export function disposeStage() { mod?.disposeStage(); }
// pause the stage render loop (window in background, heavy overlay on top...)
export function freezeStage(v) { try { window.__stage?.freeze(v); } catch {} }
