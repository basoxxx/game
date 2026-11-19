// Rompicapo · Unisci — merge-the-numbers sliding logic. Pure (no DOM), seeded, with tile ids so the
// view can animate slides and merges. Used by the game and tools/rompicapo-test.mjs.
//   const b = newBoard(4, seed); const r = move(b, 'left'); r.moved, r.gained, r.merges, r.spawn
import { mulberry32 } from './util.js';

export const VARIANTS = [
  { id: 4, name: '4×4', goal: 2048, desc: 'Il classico: arriva al 2048.' },
  { id: 5, name: '5×5', goal: 4096, desc: 'Più spazio, partite lunghe: punta al 4096.' },
  { id: 6, name: '6×6', goal: 8192, desc: 'Tavola enorme e rilassata: fino all’8192.' },
];
export const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

// board: { n, cells: Array(n*n) of null | { id, v }, score, moves, nextId, rng (state), over, won, max }
export function newBoard(n = 4, seed = 1) {
  const b = { n, cells: new Array(n * n).fill(null), score: 0, moves: 0, nextId: 1, rs: (seed >>> 0) || 1, over: false, won: false, max: 0 };
  spawn(b); spawn(b);
  return b;
}
export const clone = (b) => ({ ...b, cells: b.cells.map((c) => (c ? { ...c } : null)) });
function rand(b) { const r = mulberry32(b.rs); const v = r(); b.rs = r.state(); return v; }
export function spawn(b) {
  const empty = []; b.cells.forEach((c, i) => { if (!c) empty.push(i); });
  if (!empty.length) return null;
  const i = empty[Math.floor(rand(b) * empty.length)], v = rand(b) < 0.9 ? 2 : 4;
  b.cells[i] = { id: b.nextId++, v }; b.max = Math.max(b.max, v);
  return { i, id: b.cells[i].id, v };
}
// line of indices in travel order (first index = the wall the tiles slide towards)
function lines(n, dir) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const L = [];
    for (let s = 0; s < n; s++) {
      if (dir === 'left') L.push(k * n + s); else if (dir === 'right') L.push(k * n + (n - 1 - s));
      else if (dir === 'up') L.push(s * n + k); else L.push((n - 1 - s) * n + k);
    }
    out.push(L);
  }
  return out;
}
// Slides in place. Returns { moved, gained, slides: [{id, from, to}], merges: [{id, into, to, v}], spawn }
export function move(b, dir, { noSpawn = false } = {}) {
  if (b.over) return { moved: false, gained: 0, slides: [], merges: [], spawn: null };
  const n = b.n, slides = [], merges = []; let gained = 0, moved = false;
  for (const L of lines(n, dir)) {
    const tiles = L.map((i) => b.cells[i] && { ...b.cells[i], from: i }).filter(Boolean);
    const out = [];
    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k], nx = tiles[k + 1];
      if (nx && nx.v === t.v) { out.push({ keep: t, gone: nx, v: t.v * 2 }); k++; } else out.push({ keep: t, v: t.v });
    }
    for (const i of L) b.cells[i] = null;
    out.forEach((o, s) => {
      const to = L[s];
      b.cells[to] = { id: o.keep.id, v: o.v };
      if (o.keep.from !== to) moved = true;
      slides.push({ id: o.keep.id, from: o.keep.from, to });
      if (o.gone) { moved = true; merges.push({ id: o.gone.id, into: o.keep.id, from: o.gone.from, to, v: o.v }); gained += o.v; b.max = Math.max(b.max, o.v); }
    });
  }
  let sp = null;
  if (moved) { b.score += gained; b.moves++; if (!noSpawn) sp = spawn(b); b.over = !canMove(b); }
  return { moved, gained, slides, merges, spawn: sp };
}
export function canMove(b) {
  const n = b.n;
  for (let i = 0; i < n * n; i++) {
    const c = b.cells[i]; if (!c) return true;
    const r = (i / n) | 0, k = i % n;
    if (k + 1 < n && b.cells[i + 1]?.v === c.v) return true;
    if (r + 1 < n && b.cells[i + n]?.v === c.v) return true;
  }
  return false;
}
// grid of plain values (tests, saves)
export const values = (b) => b.cells.map((c) => (c ? c.v : 0));
export function fromValues(vals, seed = 1) {
  const n = Math.round(Math.sqrt(vals.length)), b = { n, cells: vals.map(() => null), score: 0, moves: 0, nextId: 1, rs: seed >>> 0 || 1, over: false, won: false, max: 0 };
  vals.forEach((v, i) => { if (v) { b.cells[i] = { id: b.nextId++, v }; b.max = Math.max(b.max, v); } });
  b.over = !canMove(b);
  return b;
}
// a cheap look-ahead used by the daily "suggerimento": the move that keeps the most empty cells and the max in a corner
export function suggest(b) {
  let best = null, bs = -Infinity;
  for (const d of Object.keys(DIRS)) {
    const c = clone(b); const r = move(c, d, { noSpawn: true }); if (!r.moved) continue;
    const v = values(c), n = b.n, empty = v.filter((x) => !x).length, mx = Math.max(...v);
    const corner = [0, n - 1, n * (n - 1), n * n - 1].some((i) => v[i] === mx) ? 1 : 0;
    let mono = 0; for (let i = 0; i < n * n; i++) { if (i % n < n - 1 && v[i] >= v[i + 1]) mono++; if (i + n < n * n && v[i] >= v[i + n]) mono++; }
    const s = empty * 10 + corner * 25 + mono + r.gained / 8;
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}
