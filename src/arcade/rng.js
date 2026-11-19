// Arcade Baso — small seeded helpers shared by the four simulations (no DOM, no three.js: node tests import them).
export function rng(seed = 1) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.range = (a, b) => a + r() * (b - a);
  r.chance = (p) => r() < p;
  return r;
}
export function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
// circle vs circle
export const hitCC = (ax, ay, ar, bx, by, br) => dist2(ax, ay, bx, by) < (ar + br) * (ar + br);
// circle vs axis-aligned box (centre cx,cy, half sizes hw,hh)
export function hitCB(x, y, r, cx, cy, hw, hh) {
  const dx = Math.max(Math.abs(x - cx) - hw, 0), dy = Math.max(Math.abs(y - cy) - hh, 0);
  return dx * dx + dy * dy < r * r;
}
export function todayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
