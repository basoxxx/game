// Spider: two decks (104 cards) in 10 columns, 1, 2 or 4 suits. Build down regardless of suit, move
// only same-suit runs, a complete K..A run of one suit leaves the table. Deal 10 more cards (one per
// column) from the stock when no column is empty. Pure rules + a best-first planner for the hints.
import { makeDeck, shuffle, rank, suit, seedOf } from '../../core/cards.js';
import { pileAt } from './common.js';

const RK = new Map(), SU = new Map(); // the planner calls these millions of times
const rk = (c) => { let v = RK.get(c); if (v === undefined) { v = rank(c); RK.set(c, v); } return v; };
const su = (c) => { let v = SU.get(c); if (v === undefined) { v = suit(c); SU.set(c, v); } return v; };

const top = (a) => a[a.length - 1];
const SUITSETS = { 1: ['S'], 2: ['S', 'H'], 4: ['S', 'H', 'D', 'C'] };
export function deck(suits) {
  const ss = SUITSETS[suits], copies = 8 / ss.length;
  return makeDeck('fr52', { copies }).filter((c) => ss.includes(su(c)));
}
export function deal(no, eo) {
  const d = shuffle(deck(eo.suits), { rng: seedOf(`spider|${eo.suits}|${no}`) });
  const t = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < 54; i++) t[i % 10].push(d.pop());
  return { t, d: t.map((c) => c.length - 1), st: d, f: [], score: 500, suits: eo.suits };
}
// same-suit descending run on top of column i: returns its start index
export function runStart(s, i) {
  const col = s.t[i]; if (!col.length) return 0;
  let j = col.length - 1;
  while (j > s.d[i] && su(col[j - 1]) === su(col[j]) && rk(col[j - 1]) === rk(col[j]) + 1) j--;
  return j;
}
export function moves(s) {
  const out = [];
  s.t.forEach((col, i) => {
    if (!col.length) return;
    for (let j = runStart(s, i); j < col.length; j++) {
      const c = col[j];
      s.t.forEach((dst, k) => {
        if (k === i) return;
        if (!dst.length) { if (j > 0) out.push({ card: c, to: `t${k}`, tail: true }); }
        else if (rk(top(dst)) === rk(c) + 1) out.push({ card: c, to: `t${k}`, tail: true });
      });
    }
  });
  if (s.st.length && s.t.every((c) => c.length)) out.push({ card: top(s.st), act: 'row' });
  return out;
}
function settle(s, i) {
  const col = s.t[i];
  if (col.length >= 13) {
    const run = col.slice(-13);
    if (rk(run[0]) === 13 && run.every((c, k) => su(c) === su(run[0]) && rk(c) === 13 - k) && col.length - 13 >= s.d[i]) {
      col.splice(-13); s.f.push(run); s.score += 100;
    }
  }
  if (s.d[i] > 0 && s.d[i] >= col.length) s.d[i] = col.length - 1;
  if (!col.length) s.d[i] = 0;
}
export function apply(s, m) {
  if (m.act === 'row') {
    for (let i = 0; i < 10 && s.st.length; i++) s.t[i].push(s.st.pop());
    s.score -= 1;
    for (let i = 0; i < 10; i++) settle(s, i);
    return s;
  }
  let fi = -1, fj = -1;
  for (let i = 0; i < 10 && fi < 0; i++) { const j = s.t[i].indexOf(m.card); if (j >= 0) { fi = i; fj = j; } }
  if (fi < 0) throw new Error('spider: carta non trovata');
  const cards = s.t[fi].splice(fj), k = +m.to.slice(1);
  s.t[k].push(...cards); s.score -= 1;
  settle(s, fi); settle(s, k);
  return s;
}
export const won = (s) => s.f.length === 8;
export const dead = (s) => !won(s) && moves(s).length === 0;

// ------------------------------------------------------------------ planner (best-first)
function keyOf(s) {
  const cs = s.t.map((c, i) => { let h = 2166136261 ^ s.d[i]; for (const x of c) for (let k = 0; k < x.length; k++) h = Math.imul(h ^ x.charCodeAt(k), 16777619); return h >>> 0; }).sort((a, b) => a - b);
  let h = 2166136261, g = 7; for (const v of cs) { h = Math.imul(h ^ v, 16777619); g = (Math.imul(g, 31) + v) | 0; }
  return (h >>> 0) * 1048576 + ((g + s.st.length) & 1048575);
}
// lower is better
export function evalS(s) {
  let h = (8 - s.f.length) * 60 + s.st.length * 0.8, empty = 0;
  s.t.forEach((col, i) => {
    if (!col.length) { empty++; return; }
    h += s.d[i] * 6;
    for (let j = Math.max(1, s.d[i] + 1); j < col.length; j++) {
      const a = col[j - 1], b = col[j];
      if (rk(a) !== rk(b) + 1) h += 4; else if (su(a) !== su(b)) h += 1.5;
    }
  });
  return h - empty * 5;
}
const cpS = (s) => ({ t: s.t.map((c) => c.slice()), d: s.d.slice(), st: s.st.slice(), f: s.f.map((x) => x), score: s.score, suits: s.suits });
// sensible moves only: whole same-suit runs, or part of a run onto the same suit; no pointless shuffles
function pmoves(s) {
  const ms = moves(s), out = [];
  for (const m of ms) {
    if (m.act) { out.push(m); continue; }
    let i = 0, j = -1; for (; i < 10; i++) { j = s.t[i].indexOf(m.card); if (j >= 0) break; }
    const dst = s.t[+m.to.slice(1)], below = j > 0 ? s.t[i][j - 1] : null;
    const start = runStart(s, i);
    const onSame = dst.length && su(top(dst)) === su(m.card);
    const belowFits = below && j > s.d[i] && rk(below) === rk(m.card) + 1;
    if (!dst.length) { if (j === start && j > 0) out.push(m); continue; }
    if (j === start) { if (!belowFits || (onSame && su(below) !== su(m.card))) out.push(m); continue; }
    if (onSame) out.push(m);
  }
  return out;
}
class Heap { constructor() { this.a = []; } push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < a.length && a[L].f < a[m].f) m = L; if (R < a.length && a[R].f < a[m].f) m = R; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; } get size() { return this.a.length; } }
// -> { path: UI moves towards the best state found (a whole solution when it finds one), won }
export function plan(s0, budget = 5000) {
  const s = cpS(s0), seen = new Set([keyOf(s)]), heap = new Heap();
  const root = { s, m: null, p: null, h: evalS(s), g: 0 };
  heap.push({ f: root.h, n: root });
  let best = root, n = 0;
  while (heap.size && n++ < budget) {
    const cur = heap.pop().n;
    if (won(cur.s)) { best = cur; break; }
    for (const m of pmoves(cur.s)) {
      const y = apply(cpS(cur.s), m), k = keyOf(y);
      if (seen.has(k)) continue; seen.add(k);
      const node = { s: y, m, p: cur, h: evalS(y) + (m.act ? 3 : 0), g: cur.g + 1 };
      heap.push({ f: node.h + node.g * 0.3, n: node });
      if (node.h < best.h - 0.5 || won(y)) best = node;
    }
  }
  if (best === root) { // no progress in sight: deal, or fill an empty column so that dealing becomes legal
    const all = moves(s0), d = all.find((m) => m.act === 'row');
    if (d) return { path: [d], won: false };
    if (s0.st.length && s0.t.some((c) => !c.length)) {
      let bm = null, bv = Infinity;
      for (const m of all) { if (s0.t[+m.to.slice(1)].length) continue; const v = evalS(apply(cpS(s0), m)); if (v < bv) { bv = v; bm = m; } }
      if (bm) return { path: [bm], won: false };
    }
    return { path: [], won: false };
  }
  const path = []; for (let q = best; q && q.m; q = q.p) path.unshift(q.m);
  return { path, won: won(best.s) };
}
export function greedy(s) {
  const ms = pmoves(s); if (!ms.length) return null;
  let best = null, bv = Infinity;
  for (const m of ms) { const v = evalS(apply(cpS(s), m)) + (m.act ? 6 : 0); if (v < bv) { bv = v; best = m; } }
  return best;
}

// ------------------------------------------------------------------ layout
export function view(s, D) {
  const { W, H } = D, pad = Math.max(10, Math.min(W, H) * 0.018), piles = [];
  const side = W / H > 1.9;
  let cw, ch, colX, tabY, stockP, foundP;
  if (side) {
    cw = Math.min((W - pad * 2) / (11 * 1.08 + 0.5), ((H - pad * 2) / 2.3) * 0.7); ch = cw / 0.7;
    const g = cw * 1.08, x0 = (W - (10 * g + cw * 1.3)) / 2 + cw / 2;
    colX = (i) => x0 + g * i; tabY = pad + ch / 2;
    stockP = [x0 + g * 9 + cw * 1.3, H - pad - ch / 2]; foundP = [x0 + g * 9 + cw * 1.3, pad + ch / 2];
  } else {
    cw = Math.min((W - pad * 2) / (9 * 1.08 + 1), H * 0.17 * 0.7); ch = cw / 0.7;
    const g = cw * 1.08, x0 = W / 2 - g * 4.5;
    colX = (i) => x0 + g * i;
    const ry = pad + ch / 2; tabY = ry + ch * 1.15;
    stockP = [colX(9) - (Math.ceil(s.st.length / 10) - 1) * cw * 0.12, ry]; foundP = [colX(0), ry];
  }
  // stock: one packet per remaining deal
  piles.push(pileAt(D, 'stock', s.st.map((c) => ({ id: c, up: false })), stockP[0], stockP[1], cw, { layout: 'stack', outline: true, source: true, label: s.st.length ? `${s.st.length / 10} ×10` : '' }));
  // completed suits: a fanned row of kings
  const fc = s.f.flat();
  piles.push(pileAt(D, 'found', fc, foundP[0] + (side ? 0 : Math.max(0, s.f.length - 1) * cw * 0.12), foundP[1], cw, { layout: 'stack', outline: true, cls: 'sol-found', label: `${s.f.length}/8` }));
  const maxH = (H - pad - ch / 2 - tabY) / H;
  s.t.forEach((col, i) => piles.push(pileAt(D, `t${i}`, col.map((c, j) => (j < s.d[i] ? { id: c, up: false } : c)), colX(i), tabY, cw, { layout: 'cascade', outline: true, upGap: D.portrait ? 0.34 : 0.26, downGap: 0.09, maxH })));
  return { piles };
}
