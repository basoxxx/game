// Festa Baso — tiny pure helpers shared by the minigame sims, the board and the tournament (no DOM, no three.js).
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// placements from scores (higher is better unless low=true), ties share the place: [10, 4, 10] -> [1, 3, 1];
// `tb` (optional, higher is better) breaks equal scores: [10, 4, 10] with tb [1, 0, 2] -> [2, 3, 1]
export function placesOf(scores, low = false, tb = null) {
  const better = (o, s, j, i) => (low ? o < s - 1e-9 : o > s + 1e-9) || (tb && Math.abs(o - s) <= 1e-9 && tb[j] > tb[i] + 1e-9);
  return scores.map((s, i) => 1 + scores.filter((o, j) => j !== i && better(o, s, j, i)).length);
}
// steer an AI input towards a point: fills inp.x / inp.y with a unit vector, returns the distance
export function aimAt(inp, fx, fy, tx, ty, dead = 0.15) {
  const dx = tx - fx, dy = ty - fy, d = Math.sqrt(dx * dx + dy * dy);
  if (d < dead) { inp.x = 0; inp.y = 0; return d; }
  inp.x = dx / d; inp.y = dy / d; return d;
}
export const blankInput = () => ({ x: 0, y: 0, a: false, ap: false });
export const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
