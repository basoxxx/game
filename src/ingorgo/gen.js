// Ingorgo — seeded level generator. Pure logic (node tests import it).
// Pipeline per attempt (sub-seed): random parking layout for the world's mechanic → the solver maps
// the whole puzzle: for 'hero' worlds every state reachable from the layout and its distance to the
// exit (explore), then the start is the state whose minimal solution is closest to the target length
// (so the difficulty is exact, not guessed); for 'all' worlds (every car must leave) the layout itself
// is the start and the A* solver measures it. Unsolvable layouts never ship: every level carries its
// optimal move count `opt`, re-checked by the tests on 1000 seeds.
import { compile, initState, explore, solve, EXITED } from './core.js';

export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const GEN_VERSION = 1;

const SHORT = ['auto', 'auto', 'taxi', 'mini', 'sport', 'auto', 'mini', 'polizia'];
const LONG = ['furgone', 'bus', 'camion', 'furgone', 'gelati', 'camion'];

// The six mechanics (one per campaign world; the generated packs and the daily mix them)
//   d = difficulty 0..1 → board, traffic and target length
export const MECHS = {
  classico: (d) => ({ w: 6, h: 6, goal: 'hero', cars: [Math.round(lerp(6, 10, d)), Math.round(lerp(8, 13, d))], p3: 0.3, walls: d > 0.6 ? 1 : 0, target: [Math.round(lerp(4, 18, d)), Math.round(lerp(8, 34, d))] }),
  tutti: (d) => ({ w: 6, h: 6, goal: 'all', cars: [Math.round(lerp(5, 10, d)), Math.round(lerp(7, 14, d))], p3: 0.28, walls: 0, extra: [Math.round(lerp(0, 5, d)), Math.round(lerp(1, 10, d))] }),
  sensi: (d) => ({ w: 6, h: 6, goal: 'hero', cars: [Math.round(lerp(6, 9, d)), Math.round(lerp(8, 12, d))], p3: 0.3, arrows: d > 0.5 ? 2 : 1, target: [Math.round(lerp(5, 16, d)), Math.round(lerp(9, 30, d))] }),
  semafori: (d) => ({ w: 6, h: 6, goal: 'hero', cars: [Math.round(lerp(5, 8, d)), Math.round(lerp(7, 11, d))], p3: 0.3, lights: d > 0.5 ? 4 : 3, target: [Math.round(lerp(5, 15, d)), Math.round(lerp(9, 28, d))] }),
  porto: (d) => ({ w: 7, h: 6, goal: 'hero', cars: [Math.round(lerp(6, 9, d)), Math.round(lerp(8, 12, d))], p3: 0.25, ferry: true, target: [Math.round(lerp(5, 15, d)), Math.round(lerp(9, 28, d))] }),
  punta: (d) => ({ w: 7, h: 6, goal: 'hero', cars: [Math.round(lerp(7, 10, d)), Math.round(lerp(9, 13, d))], p3: 0.32, walls: 1, arrows: d > 0.4 ? 1 : 0, lights: d > 0.7 ? 2 : 0, timed: true, target: [Math.round(lerp(6, 16, d)), Math.round(lerp(10, 30, d))] }),
};
export const MECH_IDS = Object.keys(MECHS);

// one random layout for a spec (no solvability guarantee yet)
export function layout(spec, r) {
  const { w, h } = spec, occ = new Uint8Array(w * h);
  const L = { w, h, goal: spec.goal, cars: [], walls: [], arrows: [], lights: [] };
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !occ[y * w + x];
  let rx = -1, fl = 0, fy = 0;
  if (spec.ferry) {
    rx = ri(r, 2, w - 3); fl = r() < 0.6 ? 2 : 3; fy = ri(r, 0, h - fl); L.ferry = { x: rx, y: fy, len: fl };
    for (let y = 0; y < h; y++) if (y < fy || y >= fy + fl) occ[y * w + rx] = 2; // water
  }
  // hero: horizontal, facing the gap on the right (sometimes on the left, or vertical facing up, later on)
  let hero = null;
  if (spec.goal === 'hero') {
    const vert = !spec.ferry && spec.vertHero;
    const hy = vert ? ri(r, 1, w - 2) : ri(r, 1, h - 3);
    hero = vert ? { x: hy, y: ri(r, 0, h - 2), len: 2, ax: 1, dir: -1, kind: 'eroe', hero: true } : { x: ri(r, 0, Math.max(0, (rx >= 0 ? rx : w) - 2)), y: spec.ferry ? clamp(hy, fy, fy + fl - 1) : hy, len: 2, ax: 0, dir: 1, kind: 'eroe', hero: true };
    if (hero.ax === 0 && rx >= 0 && hero.x + 1 >= rx) hero.x = Math.max(0, rx - 2);
    L.cars.push(hero);
    for (let k = 0; k < 2; k++) occ[hero.ax === 0 ? hero.y * w + hero.x + k : (hero.y + k) * w + hero.x] = 1;
  }
  for (let k = 0; k < (spec.walls || 0); k++) { const x = ri(r, 0, w - 1), y = ri(r, 0, h - 1); if (free(x, y) && x !== rx && !(hero && hero.ax === 0 && y === hero.y)) { occ[y * w + x] = 3; L.walls.push([x, y]); } }
  // 'all' puzzles: every lane has one driving direction (two cars nose to nose would never get out)
  // (cars before the lane's split point face the near edge, the others the far edge)
  const rowSplit = Array.from({ length: h }, () => ri(r, 0, w)), colSplit = Array.from({ length: w }, () => ri(r, 0, h));
  const want = ri(r, spec.cars[0], spec.cars[1]);
  for (let tries = 0; L.cars.length < want + (hero ? 1 : 0) && tries < 400; tries++) {
    const len = r() < spec.p3 ? 3 : 2, ax = r() < 0.5 ? 0 : 1;
    const x = ri(r, 0, ax === 0 ? w - len : w - 1), y = ri(r, 0, ax === 1 ? h - len : h - 1);
    if (hero && ax === hero.ax && (ax === 0 ? y === hero.y : x === hero.x)) continue; // a parallel car in the hero lane never leaves
    if (ax === 1 && x === rx) continue; // no vertical cars in the river
    let ok = true;
    for (let k = 0; k < len && ok; k++) ok = free(ax === 0 ? x + k : x, ax === 0 ? y : y + k);
    if (!ok) continue;
    const c = { x, y, len, ax, dir: ax === 0 ? (x * 2 + len < rowSplit[y] * 2 ? -1 : 1) : (y * 2 + len < colSplit[x] * 2 ? -1 : 1), kind: pick(r, len === 3 ? LONG : SHORT) };
    L.cars.push(c);
    for (let k = 0; k < len; k++) occ[ax === 0 ? y * w + x + k : (y + k) * w + x] = 1;
  }
  // one-way lanes: a whole row or column, not the hero's lane
  for (let k = 0; k < (spec.arrows || 0); k++) {
    const row = r() < 0.5;
    const lane = row ? ri(r, 0, h - 1) : ri(r, 0, w - 1);
    if (hero && (row ? hero.ax === 0 && lane === hero.y : hero.ax === 1 && lane === hero.x)) continue;
    if (!row && lane === rx) continue;
    if (L.arrows.some((a) => (row ? a[1] === lane && (a[2] & 1) === 0 : a[0] === lane && (a[2] & 1) === 1))) continue;
    const d = row ? (r() < 0.5 ? 0 : 2) : (r() < 0.5 ? 1 : 3);
    for (let i = 0; i < (row ? w : h); i++) { const x = row ? i : lane, y = row ? lane : i; if (x === rx || occ[y * w + x] === 3) continue; if (!L.arrows.some((a) => a[0] === x && a[1] === y)) L.arrows.push([x, y, d]); }
  }
  // traffic lights: one in front of the hero, the others at random crossings
  for (let k = 0; k < (spec.lights || 0); k++) {
    let x, y;
    if (k === 0 && hero && hero.ax === 0) { x = ri(r, hero.x + 2, w - 1); y = hero.y; } else { x = ri(r, 0, w - 1); y = ri(r, 0, h - 1); }
    if (x === rx || occ[y * w + x] === 3 || L.lights.some((l) => l[0] === x && l[1] === y)) continue;
    L.lights.push([x, y, k & 1]);
  }
  if (L.lights.length) L.phase = 0;
  return L;
}

// state → level JSON (exited cars dropped)
function levelFromState(L, B, s) {
  const out = { ...L, cars: [] };
  B.cars.forEach((c, i) => { if (s[i] === EXITED) return; const { i: _i, fix: _f, ...cc } = c; out.cars.push({ ...cc, x: c.ax === 0 ? s[i] : c.x, y: c.ax === 1 ? s[i] : c.y }); });
  if (L.ferry) out.ferry = { ...L.ferry, y: s[B.n] };
  if (B.hasLights) out.phase = s[B.n + 1]; else delete out.phase;
  for (const k of ['walls', 'arrows', 'lights']) if (!out[k]?.length) delete out[k];
  return out;
}

// measure a layout: for 'hero' puzzles the best start among every state it can reach (longest optimal
// solution not above the target's top end); for 'all' puzzles the layout itself. null = unsolvable.
export function evalLayout(spec, L, r) {
  const B = compile(L), s0 = initState(B, L);
  if (spec.goal === 'all') {
    const sol = solve(B, s0, 20000);
    return sol && sol.n > 0 ? { L: levelFromState(L, B, s0), opt: sol.n, v: sol.n - B.n } : null;
  }
  const ex = explore(B, s0, spec.cap || 20000);
  if (!ex) return null;
  let best = -1, cand = [];
  for (let i = 0; i < ex.n; i++) {
    const d = ex.dist[i];
    if (d < 2 || d > spec.target[1] || ex.states[i][B.hero] === EXITED) continue;
    if (d > best) { best = d; cand = [i]; } else if (d === best) cand.push(i);
  }
  if (best < 0) return null;
  const s = ex.states[cand[Math.floor(r() * cand.length)]];
  return { L: levelFromState(L, B, s), opt: best, v: best };
}

// a small random change to a layout (hill climbing): move, add or remove a car, or turn one around
export function mutate(spec, L0, r) {
  const L = { ...L0, cars: L0.cars.map((c) => ({ ...c })) };
  const { w, h } = L, rx = L.ferry ? L.ferry.x : -1;
  const hero = L.cars.find((c) => c.hero);
  const cells = (c) => Array.from({ length: c.len }, (_, k) => (c.ax === 0 ? [c.x + k, c.y] : [c.x, c.y + k]));
  const fits = (c, others) => {
    if (hero && c !== hero && c.ax === hero.ax && (c.ax === 0 ? c.y === hero.y : c.x === hero.x)) return false;
    if (c.ax === 1 && c.x === rx) return false;
    const occ = new Set();
    for (const o of others) for (const [x, y] of cells(o)) occ.add(y * w + x);
    for (const [x, y] of L0.walls || []) occ.add(y * w + x);
    for (const [x, y] of cells(c)) {
      if (x < 0 || y < 0 || x >= w || y >= h || occ.has(y * w + x)) return false;
      if (x === rx && (y < L.ferry.y || y >= L.ferry.y + L.ferry.len)) return false;
    }
    return true;
  };
  const randCar = () => { const len = r() < spec.p3 ? 3 : 2, ax = r() < 0.5 ? 0 : 1; return { x: ri(r, 0, ax === 0 ? w - len : w - 1), y: ri(r, 0, ax === 1 ? h - len : h - 1), len, ax, dir: r() < 0.5 ? 1 : -1, kind: pick(r, len === 3 ? LONG : SHORT) }; };
  const idx = L.cars.map((c, i) => i).filter((i) => !L.cars[i].hero);
  const op = r(), max = spec.cars[1] + 2;
  if (op < 0.22 && idx.length > spec.cars[0] - 1) { L.cars.splice(pick(r, idx), 1); return L; }
  if (op < 0.55 && idx.length < max) { for (let t = 0; t < 30; t++) { const c = randCar(); if (fits(c, L.cars)) { L.cars.push(c); return L; } } return L; }
  if (op < 0.7 && spec.goal === 'all' && idx.length) { const c = L.cars[pick(r, idx)]; c.dir = -c.dir; return L; }
  if (!idx.length) return L;
  const i = pick(r, idx), others = L.cars.filter((_, j) => j !== i);
  for (let t = 0; t < 30; t++) { const c = randCar(); if (fits(c, others)) { L.cars[i] = c; return L; } }
  return L;
}

// generate(seed, mech, d): always returns a solvable level. Random layouts are measured first; the
// closest one to the target is then improved by hill climbing (small changes, kept when not worse).
// The target is the optimal move count, or for 'all' puzzles the extra moves beyond one per car.
export function generate(seed, mech = 'classico', d = 0.5, extra = {}) {
  const r = rng(seed);
  const spec = { ...MECHS[mech](clamp(d, 0, 1)), ...extra };
  if (mech === 'tutti') spec.walls = d > 0.4 ? 1 + Math.floor(r() * 2) : 0;
  if (mech === 'sensi' || mech === 'punta') spec.vertHero = r() < 0.25;
  const [lo, hi] = spec.goal === 'all' ? spec.extra : spec.target;
  const isAll = spec.goal === 'all';
  const tries = spec.tries || (isAll ? 40 : 10), climb = spec.climb ?? (isAll ? 1500 : 30);
  const gapOf = (x) => (x.v < lo ? lo - x.v : x.v > hi ? x.v - hi : 0);
  let got = null, gap = Infinity;
  for (let a = 0; (a < tries || (!got && a < tries * 6)) && gap > 0; a++) {
    // nothing solvable yet after the planned tries: lighter traffic
    const sp = a < tries ? spec : { ...spec, cars: [Math.max(3, spec.cars[0] - 1 - ((a / tries) | 0)), Math.max(4, spec.cars[1] - 1 - ((a / tries) | 0))] };
    const x = evalLayout(spec, layout(sp, r), r); if (!x) continue;
    const g = gapOf(x); if (g < gap) { gap = g; got = x; }
  }
  for (let a = 0; a < climb && got && gap > 0; a++) {
    const x = evalLayout(spec, mutate(spec, got.L, r), r); if (!x) continue;
    const g = gapOf(x); if (g <= gap) { gap = g; got = x; }
  }
  if (!got) got = { L: { w: 6, h: 6, goal: 'hero', cars: [{ x: 0, y: 2, len: 2, ax: 0, dir: 1, kind: 'eroe', hero: true }, { x: 3, y: 1, len: 3, ax: 1, dir: 1, kind: 'camion' }] }, opt: 2 };
  const L = got.L;
  L.opt = got.opt; L.seed = seed; L.mech = mech;
  if (spec.timed) L.time = Math.round(clamp(20 + got.opt * 4.5, 30, 240) / 5) * 5;
  return L;
}

// ---------------------------------------------------------------- daily puzzle (same for everybody)
export const EPOCH = new Date(2026, 10, 1);
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayNumber = (d = new Date()) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000) + 1;
const WEEK = [['punta', 0.75], ['classico', 0.45], ['tutti', 0.5], ['sensi', 0.55], ['semafori', 0.6], ['porto', 0.65], ['classico', 0.85]]; // Sun … Sat
export function dailyInfo(d = new Date()) {
  const key = dayKey(d), [mech, diff] = WEEK[d.getDay()];
  return { key, num: dayNumber(d), seed: hashStr(`ingorgo-daily:${key}:v${GEN_VERSION}`), mech, diff, reward: 40 + Math.round(diff * 40) };
}
export function dailyLevel(d = new Date()) {
  const info = dailyInfo(d);
  const L = generate(info.seed, info.mech, info.diff);
  delete L.time; // the daily is about moves, not speed
  L.id = `daily-${info.key}`;
  return { info, L };
}

// ---------------------------------------------------------------- generated packs (hundreds of levels)
export const PACKS = [
  { id: 'facile', name: 'Facile', d: [0.05, 0.35], n: 100, color: '#3ecf6e' },
  { id: 'medio', name: 'Medio', d: [0.3, 0.6], n: 100, color: '#ffb020' },
  { id: 'difficile', name: 'Difficile', d: [0.55, 0.85], n: 100, color: '#ff6a3d' },
  { id: 'esperto', name: 'Esperto', d: [0.8, 1], n: 100, color: '#c54bff' },
];
export function packLevel(packId, n) {
  const P = PACKS.find((p) => p.id === packId) || PACKS[0];
  const mech = MECH_IDS[(n - 1) % MECH_IDS.length];
  const d = lerp(P.d[0], P.d[1], (n - 1) / Math.max(1, P.n - 1));
  const L = generate(hashStr(`ingorgo-pack:${P.id}:${n}`), mech, d);
  L.id = `${P.id}-${n}`;
  return L;
}
