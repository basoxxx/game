// Rompicapo · Mahjong solitario — layered layouts, solvable deals (built by playing the layout
// backwards: every pair is placed on two tiles that are free at the same time, so the reverse order
// is a valid solution), free-tile rules, solver for hints, solvable shuffles. Pure (no DOM).
// Coordinates are in half-tile units: a tile at (x, y, z) covers x..x+2, y..y+2 on layer z.
import { mulberry32, shuffle } from './util.js';

// ------------------------------------------------------------------ tile set (original faces)
// 3 suits × 9 (Soli, Gocce, Foglie) · 4 Venti · 3 Gemme · 4 Fiori (any two match) · 4 Stagioni (any two match)
export const SUITS = [{ id: 'sole', name: 'Soli' }, { id: 'goccia', name: 'Gocce' }, { id: 'foglia', name: 'Foglie' }];
export const FACES = [];
for (let s = 0; s < 3; s++) for (let n = 1; n <= 9; n++) FACES.push({ kind: 'suit', suit: SUITS[s].id, n, k: s * 9 + n - 1, name: `${n} di ${SUITS[s].name}` });
['Nord', 'Est', 'Sud', 'Ovest'].forEach((w, i) => FACES.push({ kind: 'vento', n: i, k: 27 + i, name: `Vento ${w}` }));
['Rubino', 'Smeraldo', 'Zaffiro'].forEach((g, i) => FACES.push({ kind: 'gemma', n: i, k: 31 + i, name: g }));
['Rosa', 'Giglio', 'Girasole', 'Tulipano'].forEach((f, i) => FACES.push({ kind: 'fiore', n: i, k: 34, name: f }));
['Primavera', 'Estate', 'Autunno', 'Inverno'].forEach((f, i) => FACES.push({ kind: 'stagione', n: i, k: 35, name: f }));
export const NCLASS = 36;

// ------------------------------------------------------------------ layouts
// Layer = { dx, dy (half units), rows of 'X'/'.' in whole tiles }. Extra tiles as [x, y, z] (half units).
const L = (dx, dy, rows) => ({ dx, dy, rows });
const DEF = [
  { id: 'quadrato', name: 'Quadrato', desc: 'Piccolo e veloce: perfetto per iniziare.', layers: [L(0, 0, ['XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX', 'XXXXXX']), L(2, 2, ['XXXX', 'XXXX', 'XXXX', 'XXXX']), L(4, 4, ['XX', 'XX'])] },
  { id: 'piramide', name: 'Piramide', desc: 'Quattro gradoni fino alla cima.', layers: [L(0, 0, Array(6).fill('XXXXXXXX')), L(2, 2, Array(4).fill('XXXXXX')), L(4, 4, ['XXXX', 'XXXX']), L(6, 5, ['XX'])] },
  { id: 'fortezza', name: 'Fortezza', desc: 'Mura, cortile e una torre al centro.', layers: [L(0, 0, Array(7).fill('XXXXXXXX')), L(2, 2, ['XXXXXX', 'X....X', 'X....X', 'X....X', 'XXXXXX']), L(4, 4, ['XXXX', 'XXXX', 'XXXX']), L(6, 6, ['XX'])] },
  { id: 'farfalla', name: 'Farfalla', desc: 'Due ali larghe e un corpo alto.', layers: [
    L(0, 0, ['XXX.....XXX', 'XXXX...XXXX', 'XXXXX.XXXXX', '.XXXXXXXXX.', '.XXXXXXXXX.', 'XXXXX.XXXXX', 'XXXX...XXXX', 'XXX.....XXX']),
    L(0, 2, ['.XX.....XX.', '.XXX...XXX.', '..XXXXXXX..', '..XXXXXXX..', '.XXX...XXX.', '.XX.....XX.']),
    L(8, 6, ['XXX', 'XXX']), L(10, 6, ['X', 'X'])] },
  { id: 'ponte', name: 'Ponte', desc: 'Due piloni e un ponte lungo da smontare.', layers: [
    L(0, 0, Array(6).fill('XXXXXXXXXX')), L(0, 0, ['XX......XX', 'XX......XX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XX......XX', 'XX......XX']),
    L(4, 4, ['XXXXXX', 'XXXXXX']), L(8, 4, ['XX', 'XX'])] },
  { id: 'tartaruga', name: 'Tartaruga', desc: 'La disposizione classica da 144 tessere. Meglio su schermi larghi.', big: true, layers: [
    L(2, 0, ['XXXXXXXXXXXX', '..XXXXXXXX..', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', '.XXXXXXXXXX.', '..XXXXXXXX..', 'XXXXXXXXXXXX']),
    L(8, 2, Array(6).fill('XXXXXX')), L(10, 4, Array(4).fill('XXXX')), L(12, 6, ['XX', 'XX'])],
    extra: [[0, 7, 0], [26, 7, 0], [28, 7, 0], [13, 7, 4]] },
];
function buildLayout(d) {
  const t = [];
  d.layers.forEach((ly, z) => ly.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') t.push([ly.dx + c * 2, ly.dy + r * 2, z]); })));
  for (const e of d.extra || []) t.push(e);
  t.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const w = Math.max(...t.map((p) => p[0])) + 2, h = Math.max(...t.map((p) => p[1])) + 2, depth = Math.max(...t.map((p) => p[2])) + 1;
  return { ...d, tiles: t, n: t.length, w, h, depth };
}
export const LAYOUTS = DEF.map(buildLayout);
export const LAYOUT = Object.fromEntries(LAYOUTS.map((l) => [l.id, l]));

// neighbour tables for a list of positions
export function topology(pos) {
  const n = pos.length, above = [], left = [], right = [];
  for (let i = 0; i < n; i++) { above.push([]); left.push([]); right.push([]); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const [xi, yi, zi] = pos[i], [xj, yj, zj] = pos[j];
    if (Math.abs(yi - yj) >= 2) continue;
    if (zj === zi + 1 && Math.abs(xi - xj) < 2) above[i].push(j);
    if (zj === zi && xj === xi - 2) left[i].push(j);
    if (zj === zi && xj === xi + 2) right[i].push(j);
  }
  return { above, left, right };
}
export function isFree(topo, present, i) {
  if (!present[i]) return false;
  for (const j of topo.above[i]) if (present[j]) return false;
  let l = true, r = true;
  for (const j of topo.left[i]) if (present[j]) { l = false; break; }
  if (l) return true;
  for (const j of topo.right[i]) if (present[j]) { r = false; break; }
  return r;
}
export const freeList = (topo, present) => { const out = []; for (let i = 0; i < present.length; i++) if (isFree(topo, present, i)) out.push(i); return out; };

// Plays the (sub)layout backwards: returns the pair order or null. Prefers high, blocking tiles so
// it rarely paints itself into a corner; retried with fresh random choices when it does.
function construct(topo, present0, rnd) {
  const present = present0.slice(), pairs = [];
  let left = present.filter(Boolean).length;
  const weight = (i) => 1 + (topo.left[i].length + topo.right[i].length) * 0.3;
  while (left > 0) {
    const F = freeList(topo, present);
    if (F.length < 2) return null;
    // weighted pick of the first, then any other free tile
    const zmax = Math.max(...F.map((i) => topo.z[i]));
    const pickFrom = (arr) => { let s = 0; const ws = arr.map((i) => { const w = weight(i) * (topo.z[i] === zmax ? 3 : 1); s += w; return w; }); let r = rnd() * s; for (let k = 0; k < arr.length; k++) { r -= ws[k]; if (r <= 0) return arr[k]; } return arr[arr.length - 1]; };
    const a = pickFrom(F), rest = F.filter((i) => i !== a), b = pickFrom(rest);
    present[a] = false; present[b] = false; left -= 2; pairs.push([a, b]);
  }
  return pairs;
}
function classPairs(nPairs, rnd) {
  const out = [], cls = shuffle(Array.from({ length: NCLASS }, (_, i) => i), rnd);
  while (out.length < nPairs) for (const c of cls) { out.push(c, c); if (out.length >= nPairs) break; }
  return shuffle(out.slice(0, nPairs), rnd);
}
const faceOf = (k, used) => { if (k < 34) return k; const base = k === 34 ? 34 : 38; const u = used[k] = (used[k] || 0); used[k] = u + 1; return base + (u % 4); };

// deal(layoutId, seed) -> { layout, pos, topo, faces: Array(n), order: [[a, b], ...] (a valid solution) }
export function deal(layoutId, seed) {
  const Ly = LAYOUT[layoutId] || LAYOUTS[0], pos = Ly.tiles.map((p) => p.slice()), topo = topology(pos);
  topo.z = pos.map((p) => p[2]);
  const rnd = mulberry32(seed ^ 0x9a17);
  let order = null;
  for (let a = 0; a < 400 && !order; a++) order = construct(topo, pos.map(() => true), rnd);
  if (!order) throw new Error('layout senza soluzione');
  const ks = classPairs(order.length, rnd), used = {}, faces = new Array(pos.length).fill(-1);
  order.forEach(([a, b], k) => { faces[a] = faceOf(ks[k], used); faces[b] = faceOf(ks[k], used); });
  return { layout: Ly.id, pos, topo, faces, order, seed };
}
export const classOf = (f) => FACES[f].k;
export const matches = (fa, fb) => fa >= 0 && fb >= 0 && classOf(fa) === classOf(fb);

// all free matching pairs
export function moves(topo, present, faces) {
  const F = freeList(topo, present), out = [];
  for (let x = 0; x < F.length; x++) for (let y = x + 1; y < F.length; y++) if (matches(faces[F[x]], faces[F[y]])) out.push([F[x], F[y]]);
  return out;
}
// DFS with dead-state memo. Returns the list of pairs that clears the board, or null (also when the budget runs out: .exhausted)
export function solve(topo, present0, faces, budget = 200000, tries = 16) {
  for (let t = 0; t < tries; t++) {
    const r = solveOnce(topo, present0, faces, Math.ceil(budget / tries), t);
    if (Array.isArray(r) || !r?.exhausted) return r;
  }
  return { exhausted: true };
}
function solveOnce(topo, present0, faces, budget, salt) {
  const jr = mulberry32(salt * 7919 + 1), jitter = present0.map(() => (salt ? jr() * 2.5 : 0));
  const present = present0.slice(), dead = new Set(), path = [];
  let nodes = 0, exhausted = false;
  const key = () => { let s = ''; for (let i = 0; i < present.length; i += 30) { let v = 0; for (let j = i; j < Math.min(i + 30, present.length); j++) v = v * 2 + (present[j] ? 1 : 0); s += v.toString(36) + ','; } return s; };
  let left = present.filter(Boolean).length;
  const rec = () => {
    if (left === 0) return true;
    if (++nodes > budget) { exhausted = true; return false; }
    const k = key(); if (dead.has(k)) return false;
    let ms = moves(topo, present, faces);
    if (!ms.length) { dead.add(k); return false; }
    // a class whose four tiles are all free: taking them is always safe
    const byC = {}; for (const m of ms) (byC[classOf(faces[m[0]])] ||= []).push(m);
    const safe = Object.values(byC).find((l) => l.length >= 6 || (l.length === 1 && tilesLeftOfClass(classOf(faces[l[0][0]])) === 2));
    if (safe) ms = [safe[0]];
    else ms.sort((a, b) => score(b) - score(a));
    for (const [a, b] of ms) {
      present[a] = present[b] = false; left -= 2; path.push([a, b]);
      if (rec()) return true;
      present[a] = present[b] = true; left += 2; path.pop();
      if (exhausted) return false;
    }
    dead.add(k); return false;
  };
  const tilesLeftOfClass = (c) => { let n = 0; for (let i = 0; i < present.length; i++) if (present[i] && classOf(faces[i]) === c) n++; return n; };
  const below = topo.below || (topo.below = topo.above.map(() => []));
  if (!topo.belowDone) { topo.above.forEach((l, i) => l.forEach((j) => below[j].push(i))); topo.belowDone = true; }
  const blocks = (i) => { let n = 0; for (const j of topo.left[i]) if (present[j]) n++; for (const j of topo.right[i]) if (present[j]) n++; return n * 2 + below[i].length * 3 + topo.z[i] * 2 + jitter[i]; };
  const score = ([a, b]) => blocks(a) + blocks(b);
  const ok = rec();
  const res = ok ? path : null;
  if (!ok && exhausted) return { exhausted: true };
  return res;
}
// A hint that keeps the game solvable when the solver can tell within budget
export function hintMove(topo, present, faces, plan = null, budget = 30000) {
  const ms = moves(topo, present, faces); if (!ms.length) return null;
  if (plan && plan.length) return { pair: plan[0], safe: true, plan };
  const sol = solve(topo, present, faces, budget, 6);
  if (Array.isArray(sol) && sol.length) return { pair: sol[0], safe: true, plan: sol };
  return { pair: ms[0], safe: !(sol && sol.exhausted) ? false : null, plan: null };
}
// Re-deals the remaining faces on the remaining tiles so the position is solvable again.
export function reshuffle(topo, present, faces, seed) {
  const rnd = mulberry32(seed ^ 0x51f7);
  let order = null;
  for (let a = 0; a < 400 && !order; a++) order = construct(topo, present, rnd);
  if (!order) return null;
  const byClass = {}; for (let i = 0; i < present.length; i++) if (present[i]) (byClass[classOf(faces[i])] ||= []).push(faces[i]);
  const pairs = []; for (const list of Object.values(byClass)) { shuffle(list, rnd); for (let k = 0; k + 1 < list.length; k += 2) pairs.push([list[k], list[k + 1]]); }
  shuffle(pairs, rnd);
  const out = faces.slice();
  order.forEach(([a, b], k) => { out[a] = pairs[k][0]; out[b] = pairs[k][1]; });
  return { faces: out, plan: order };
}
// Keeps a known solution in step with the player's move (a, b): drop the pair if it is in the plan,
// otherwise re-pair the two orphaned partners at the later step. Returns the new plan if it still
// replays from the new position, else null.
export function validPlan(topo, present0, faces, plan) {
  const p = present0.slice();
  for (const [a, b] of plan) { if (!isFree(topo, p, a) || !isFree(topo, p, b) || !matches(faces[a], faces[b])) return false; p[a] = p[b] = false; }
  return p.every((v) => !v);
}
export function updatePlan(topo, presentAfter, faces, plan, a, b) {
  if (!plan) return null;
  let next;
  const ia = plan.findIndex((q) => q.includes(a)), ib = plan.findIndex((q) => q.includes(b));
  if (ia < 0 || ib < 0) return null;
  if (ia === ib) next = plan.filter((_, k) => k !== ia);
  else {
    const pa = plan[ia].find((x) => x !== a), pb = plan[ib].find((x) => x !== b), at = Math.max(ia, ib);
    next = plan.map((q, k) => (k === at ? [pa, pb] : q)).filter((_, k) => k !== Math.min(ia, ib));
  }
  return validPlan(topo, presentAfter, faces, next) ? next : null;
}
