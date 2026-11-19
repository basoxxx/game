// Klondike ("Solitario", "Canasta" in some Italian homes): 7 columns, stock + waste, draw 1 or 3,
// unlimited passes, standard (non-Vegas) scoring. Pure rules + a depth-first solver used for the
// "solo partite vincibili" deals, the daily deal and the hints.
import { makeDeck, shuffle, rank, suit, isRed, seedOf } from '../../core/cards.js';
import { pileAt, wrapNo } from './common.js';

export const SUITS = ['H', 'D', 'C', 'S'];
const red = isRed;
// ------------------------------------------------------------------ rules (UI state, card ids)
export function deal(no, eo) {
  const deck = shuffle(makeDeck('fr52'), { rng: seedOf(`klondike|${no}`) });
  const t = Array.from({ length: 7 }, () => []);
  for (let r = 0; r < 7; r++) for (let c = r; c < 7; c++) t[c].push(deck.pop());
  return { t, d: [0, 1, 2, 3, 4, 5, 6], f: [[], [], [], []], st: deck, wa: [], draw: eo.draw, pass: 0, score: 0 };
}
const top = (a) => a[a.length - 1];
export function fitsF(f, c) { const x = top(f); return x ? suit(x) === suit(c) && rank(c) === rank(x) + 1 : rank(c) === 1; }
export function fitsT(col, c) { const x = top(col); return x ? rank(x) === rank(c) + 1 && red(x) !== red(c) : rank(c) === 13; }
function fMoves(s, c, out, extra = {}) {
  let emptyDone = false;
  s.f.forEach((f, i) => { if (!fitsF(f, c)) return; if (!f.length) { if (emptyDone) return; emptyDone = true; } out.push({ card: c, to: `f${i}`, ...extra }); });
}
export function moves(s) {
  const out = [];
  s.t.forEach((col, i) => {
    for (let j = s.d[i]; j < col.length; j++) {
      const c = col[j];
      if (j === col.length - 1) fMoves(s, c, out);
      s.t.forEach((dst, k) => { if (k !== i && fitsT(dst, c) && !(j === 0 && !dst.length)) out.push({ card: c, to: `t${k}`, tail: true }); });
    }
  });
  const w = top(s.wa);
  if (w) { fMoves(s, w, out); s.t.forEach((dst, k) => { if (fitsT(dst, w)) out.push({ card: w, to: `t${k}` }); }); }
  s.f.forEach((f) => { const c = top(f); if (c && rank(c) > 1) s.t.forEach((dst, k) => { if (fitsT(dst, c)) out.push({ card: c, to: `t${k}` }); }); });
  if (s.st.length) out.push({ card: top(s.st), act: 'draw' });
  else if (s.wa.length) out.push({ act: 'recycle', label: 'Rigira il mazzo' });
  return out;
}
// where a card is: ['t', i, j] | ['w'] | ['f', i] | ['s']
export function locate(s, c) {
  for (let i = 0; i < 7; i++) { const j = s.t[i].indexOf(c); if (j >= 0) return ['t', i, j]; }
  if (top(s.wa) === c) return ['w'];
  for (let i = 0; i < 4; i++) if (top(s.f[i]) === c) return ['f', i];
  return ['s'];
}
export function apply(s, m) {
  if (m.act === 'draw') { for (let i = 0; i < s.draw && s.st.length; i++) s.wa.push(s.st.pop()); return s; }
  if (m.act === 'recycle') { s.st = s.wa.reverse(); s.wa = []; s.pass++; s.score = Math.max(0, s.score - (s.draw === 1 ? 100 : 20)); return s; }
  const L = locate(s, m.card), dk = m.to[0], di = +m.to.slice(1);
  let cards;
  if (L[0] === 't') cards = s.t[L[1]].splice(L[2]);
  else if (L[0] === 'w') cards = [s.wa.pop()];
  else if (L[0] === 'f') cards = [s.f[L[1]].pop()];
  else throw new Error('klondike: carta non giocabile');
  (dk === 'f' ? s.f : s.t)[di].push(...cards);
  if (dk === 'f') s.score += 10; else if (L[0] === 'w') s.score += 5; else if (L[0] === 'f') s.score = Math.max(0, s.score - 15);
  if (L[0] === 't') { const i = L[1]; if (s.d[i] > 0 && s.d[i] >= s.t[i].length) { s.d[i] = s.t[i].length - 1; s.score += 5; } }
  return s;
}
export const won = (s) => s.f.every((f) => f.length === 13);
export const canFinish = (s) => !s.st.length && !s.wa.length && s.d.every((x) => x === 0) && !won(s);
export function finish(s) { // lowest card that can reach a foundation
  let best = null;
  s.t.forEach((col, i) => { const c = top(col); if (!c) return; const fi = s.f.findIndex((f) => fitsF(f, c)); if (fi >= 0 && (!best || rank(c) < rank(best.card))) best = { card: c, to: `f${fi}` }; });
  return best;
}
export const bonus = (s) => (s.el > 30000 ? Math.round(700000 / (s.el / 1000)) : 0);

// ------------------------------------------------------------------ solver (ints: suit*13 + rank-1)
const CI = (c) => SUITS.indexOf(suit(c)) * 13 + rank(c) - 1;

const R = (n) => n % 13, S = (n) => (n / 13) | 0, RED = (n) => n < 26;
export function toSolver(s) {
  const f = [0, 0, 0, 0];
  for (const p of s.f) if (p.length) f[SUITS.indexOf(suit(p[0]))] = p.length;
  return { t: s.t.map((c) => c.map(CI)), d: s.d.slice(), f, st: s.st.map(CI), wa: s.wa.map(CI) };
}
const cp = (x) => ({ t: x.t.map((c) => c.slice()), d: x.d.slice(), f: x.f.slice(), st: x.st.slice(), wa: x.wa.slice() });
const okF = (x, c) => x.f[S(c)] === R(c);
const okT = (col, c) => { if (!col.length) return R(c) === 12; const y = col[col.length - 1]; return R(y) === R(c) + 1 && RED(y) !== RED(c); };
// a card is safe to send home when the opposite colour cannot need it any more
const safe = (x, c) => { const r = R(c); if (r <= 1) return true; const o = RED(c) ? [2, 3] : [0, 1]; return x.f[o[0]] >= r && x.f[o[1]] >= r; };
// waste tops reachable by drawing / recycling. The talon is one invariant sequence
// seq = waste (bottom..top) + stock (top..bottom); a position p = waste length. Draws move p forward
// by `draw`, a recycle resets it to 0. -> [{ k: actions, c: card on top, p }]
const seqOf = (x) => x.wa.concat(x.st.slice().reverse());
function talon(x, draw) {
  const seq = seqOf(x), N = seq.length, out = [], seen = new Set();
  const add = (p, k) => { if (p <= 0) return; const c = seq[p - 1]; if (seen.has(c)) return; seen.add(c); out.push({ k, c, p }); };
  let p = x.wa.length, k = 0; add(p, 0);
  while (p < N) { p = Math.min(N, p + draw); k++; add(p, k); }
  if (N) { k++; p = 0; while (p < N) { p = Math.min(N, p + draw); k++; add(p, k); } }
  return out;
}
// 52-bit state hash (two FNV-1a lanes); columns are hashed separately and sorted (their order does not matter)
function hcol(c, d) { let h = 2166136261 ^ d, g = 5381 + d; for (let i = 0; i < c.length; i++) { h = Math.imul(h ^ c[i], 16777619); g = (Math.imul(g, 33) + c[i] + 1) | 0; } return [h >>> 0, g >>> 0]; }
function key(x) {
  const cs = x.t.map((c, i) => hcol(c, x.d[i])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let h = 2166136261, g = 7;
  const mix = (v) => { h = Math.imul(h ^ v, 16777619); g = (Math.imul(g, 31) + v) | 0; };
  for (const [a, b] of cs) { mix(a); mix(b); }
  for (const v of x.f) mix(v); mix(99); for (const v of x.st) mix(v); mix(98); for (const v of x.wa) mix(v);
  return (h >>> 0) * 1048576 + ((g >>> 0) & 1048575);
}
// moves: { k: 'tf'|'tt'|'wf'|'wt', i (col), j (index), to (col), tk (talon actions), st, wa }
function gen(x, draw) {
  const A = [], B = [], C = [], D = [], E = [];
  let emptyCol = -1; x.t.forEach((c, i) => { if (!c.length && emptyCol < 0) emptyCol = i; });
  for (let i = 0; i < 7; i++) {
    const col = x.t[i]; if (!col.length) continue;
    const c = col[col.length - 1];
    if (okF(x, c)) (x.d[i] === col.length - 1 && x.d[i] > 0 ? A : B).push({ k: 'tf', i, j: col.length - 1 });
    for (let j = x.d[i]; j < col.length; j++) {
      const b = col[j];
      for (let t = 0; t < 7; t++) {
        if (t === i) continue; const dst = x.t[t];
        if (!dst.length && t !== emptyCol) continue;
        if (!okT(dst, b)) continue;
        if (j === x.d[i]) {
          if (j === 0 && !dst.length) continue; // king already at the bottom
          if (j > 0) A.push({ k: 'tt', i, j, to: t, w: x.d[i] }); // reveals a card
          else C.push({ k: 'tt', i, j, to: t }); // empties a column
        } else if (okF(x, col[j - 1])) D.push({ k: 'tt', i, j, to: t }); // frees a card for its foundation
      }
    }
  }
  A.sort((a, b) => (b.w || 0) - (a.w || 0));
  for (const T of talon(x, draw)) {
    if (okF(x, T.c)) B.push({ k: 'wf', tk: T.k, p: T.p });
    for (let t = 0; t < 7; t++) {
      const dst = x.t[t]; if (!dst.length && t !== emptyCol) continue;
      if (okT(dst, T.c)) (T.k === 0 ? C : E).push({ k: 'wt', tk: T.k, p: T.p, to: t });
    }
  }
  return A.concat(B, C, E, D);
}
function doMove(x, m) {
  const y = cp(x);
  if (m.k === 'tf' || m.k === 'tt') {
    const cards = y.t[m.i].splice(m.j);
    if (m.k === 'tf') y.f[S(cards[0])]++; else y.t[m.to].push(...cards);
    if (y.d[m.i] > 0 && y.d[m.i] >= y.t[m.i].length) y.d[m.i] = y.t[m.i].length - 1;
  } else {
    const seq = seqOf(x); y.wa = seq.slice(0, m.p); y.st = seq.slice(m.p).reverse();
    const c = y.wa.pop();
    if (m.k === 'wf') y.f[S(c)]++; else y.t[m.to].push(c);
  }
  return y;
}
function autoSafe(x, path) {
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < 7; i++) {
      const col = x.t[i]; if (!col.length) continue; const c = col[col.length - 1];
      if (okF(x, c) && safe(x, c)) { const m = { k: 'tf', i, j: col.length - 1 }; Object.assign(x, doMove(x, m)); path.push(m); again = true; }
    }
    if (x.wa.length) { const c = x.wa[x.wa.length - 1]; if (okF(x, c) && safe(x, c)) { const m = { k: 'wf', tk: 0, p: x.wa.length }; Object.assign(x, doMove(x, m)); path.push(m); again = true; } }
  }
}
// returns { ok: true, path } | { ok: false, exhausted: bool } ; budget = max states visited
export function solve(x0, draw, budget = 60000) {
  const seen = new Set(), path = []; let nodes = 0, abort = false;
  const x = cp(x0); autoSafe(x, path);
  function dfs(y, depth) {
    if (y.f[0] + y.f[1] + y.f[2] + y.f[3] === 52) return true;
    // all cards face up and talon empty: trivially won
    if (!y.st.length && !y.wa.length && y.d.every((v) => v === 0)) return true;
    if (++nodes > budget) { abort = true; return false; }
    const k = key(y); if (seen.has(k)) return false; seen.add(k);
    if (depth > 400) return false;
    for (const m of gen(y, draw)) {
      const mark = path.length;
      const z = doMove(y, m); path.push(m); autoSafe(z, path);
      if (dfs(z, depth + 1)) return true;
      if (abort) return false;
      path.length = mark;
    }
    return false;
  }
  const ok = dfs(x, 0);
  return ok ? { ok: true, path, nodes } : { ok: false, exhausted: !abort, nodes };
}
// translate solver moves into UI moves, simulating the UI state (draws/recycles expanded)
export function planUI(s, path) {
  const u = JSON.parse(JSON.stringify(s)), out = [];
  const push = (m) => { out.push(m); apply(u, m); };
  for (const m of path) {
    if (m.k === 'wf' || m.k === 'wt') {
      for (let g = 0; g < 300 && u.wa.length !== m.p; g++) push(u.st.length ? { card: top(u.st), act: 'draw' } : { act: 'recycle' });
      const c = top(u.wa);
      if (m.k === 'wf') push({ card: c, to: `f${fSlot(u, c)}` }); else push({ card: c, to: `t${m.to}` });
    } else {
      const c = u.t[m.i][m.j];
      if (m.k === 'tf') push({ card: c, to: `f${fSlot(u, c)}` }); else push({ card: c, to: `t${m.to}` });
    }
  }
  // the solver stops when everything is face up: finish on foundations
  for (let g = 0; g < 200 && !won(u); g++) {
    if (u.st.length || u.wa.length) { const w = top(u.wa); if (w && fSlot(u, w) >= 0) { push({ card: w, to: `f${fSlot(u, w)}` }); continue; } if (u.st.length) { push({ card: top(u.st), act: 'draw' }); continue; } push({ act: 'recycle' }); continue; }
    const f = finish(u); if (!f) break; push(f);
  }
  return out;
}
const fSlot = (u, c) => { const i = u.f.findIndex((f) => f.length && suit(f[0]) === suit(c)); return i >= 0 ? (fitsF(u.f[i], c) ? i : -1) : rank(c) === 1 ? u.f.findIndex((f) => !f.length) : -1; };
export function pick(no, eo, budget = 30000) {
  for (let k = 0; k < 400; k++) {
    const n = wrapNo(no + k), s = deal(n, eo);
    if (solve(toSolver(s), eo.draw, budget).ok) return n;
  }
  return no;
}
// a quick greedy move (headless CPU only)
export function greedy(s) {
  const ms = moves(s);
  const score = (m) => {
    if (m.act === 'draw') return 1; if (m.act === 'recycle') return s.pass > 3 ? -9 : 0.5;
    const L = locate(s, m.card);
    if (m.to[0] === 'f') return L[0] === 'f' ? -9 : 10;
    if (L[0] === 'f') return -9;
    if (L[0] === 't') { if (L[2] === s.d[L[1]] && L[2] > 0) return 8; if (L[2] === 0) return rank(m.card) === 13 ? -9 : 3; return -9; }
    return 5;
  };
  let best = null, bv = -1;
  for (const m of ms) { const v = score(m); if (v > bv) { bv = v; best = m; } }
  return bv > 0 ? best : null;
}

// ------------------------------------------------------------------ layout
export function view(s, D) {
  const { W, H } = D, pad = Math.max(12, Math.min(W, H) * 0.02);
  const side = W / H > 1.9;
  const piles = [];
  let cw, ch, colX, rowY, tabY, stock, waste, fpos;
  if (side) {
    // stock + waste on the left, 7 columns, foundations 2 x 2 on the right
    cw = Math.min((W - pad * 2) / 11.45, ((H - pad * 2) / 2.2) * 0.7); ch = cw / 0.7;
    const g = cw * 1.1, span = cw + 9.5 * g, left = (W - span) / 2 + cw / 2;
    const x0 = left + g * 1.25;
    colX = (i) => x0 + g * i; tabY = pad + ch / 2;
    stock = [left, pad + ch / 2]; waste = [left, pad + ch * 1.7];
    fpos = (i) => [x0 + g * 7.25 + (i % 2) * g, pad + ch / 2 + Math.floor(i / 2) * ch * 1.12];
  } else {
    cw = Math.min((W - pad * 2) / (6 * 1.12 + 1), H * 0.2 * 0.7); ch = cw / 0.7;
    const g = cw * 1.12, x0 = W / 2 - g * 3;
    colX = (i) => x0 + g * i; rowY = pad + ch / 2; tabY = rowY + ch * 1.18;
    stock = [colX(0), rowY]; waste = [colX(1), rowY];
    fpos = (i) => [colX(3 + i), rowY];
  }
  void rowY;
  piles.push(pileAt(D, 'stock', s.st.map((c) => ({ id: c, up: false })), stock[0], stock[1], cw, { layout: 'stack', outline: true, source: true, label: s.st.length ? String(s.st.length) : s.wa.length ? '↻' : '' }));
  const vis = s.draw === 3 ? Math.min(3, s.wa.length) : Math.min(1, s.wa.length);
  const below = s.wa.slice(0, s.wa.length - vis), shown = s.wa.slice(s.wa.length - vis);
  piles.push(pileAt(D, 'wastebelow', below, waste[0], waste[1], cw, { layout: 'stack' }));
  const gap = 0.3;
  if (side) piles.push(pileAt(D, 'waste', shown, waste[0], waste[1], cw, { layout: 'cascade', upGap: 0.17 }));
  else piles.push(pileAt(D, 'waste', shown, waste[0] + ((shown.length - 1) / 2) * cw * gap, waste[1], cw, { layout: 'row', gap }));
  s.f.forEach((f, i) => { const [x, y] = fpos(i); piles.push(pileAt(D, `f${i}`, f, x, y, cw, { layout: 'stack', outline: true, cls: 'sol-found' })); });
  const maxH = (H - pad - ch / 2 - tabY) / H;
  s.t.forEach((col, i) => {
    piles.push(pileAt(D, `t${i}`, col.map((c, j) => (j < s.d[i] ? { id: c, up: false } : c)), colX(i), tabY, cw, { layout: 'cascade', outline: true, upGap: 0.27, downGap: 0.11, maxH }));
  });
  return { piles };
}
