// FreeCell: 8 columns all face up, 4 free cells, 4 foundations. Two deal numberings: our own (the
// solver vets every deal and skips the rare unsolvable one) and the classic one (the well-known
// Microsoft linear congruential deal, where 11982 & co. are the famous impossible deals).
// Pure rules + a best-first solver (hints, deal check) + layout.
import { makeDeck, shuffle, rank, suit, isRed, seedOf } from '../../core/cards.js';
import { pileAt, wrapNo } from './common.js';

const SUITS = ['H', 'D', 'C', 'S'];
const top = (a) => a[a.length - 1];
// the classic deals that cannot be won (in the first million)
export const IMPOSSIBLE = [11982, 146692, 186216, 455889, 495505, 512118, 517776, 781948];

export function classicDeck(no) { // Microsoft FreeCell deal #no -> 52 ids in dealing order
  let st = no >>> 0;
  const rnd = () => { st = (st * 214013 + 2531011) % 2147483648; return Math.floor(st / 65536); };
  const cards = Array.from({ length: 52 }, (_, i) => 51 - i);
  for (let i = 0; i < 52; i++) { const j = 51 - (rnd() % (52 - i)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards.map((c) => `${Math.floor(c / 4) + 1}${'CDHS'[c % 4]}`);
}
export function deal(no, eo) {
  const order = eo.classic ? classicDeck(no) : shuffle(makeDeck('fr52'), { rng: seedOf(`freecell|${no}`) });
  const t = Array.from({ length: 8 }, () => []);
  order.forEach((c, i) => t[i % 8].push(c));
  return { t, c: [null, null, null, null], f: [[], [], [], []], score: 0, classic: !!eo.classic };
}
const fitsF = (f, c) => { const x = top(f); return x ? suit(x) === suit(c) && rank(c) === rank(x) + 1 : rank(c) === 1; };
const onto = (x, c) => rank(x) === rank(c) + 1 && isRed(x) !== isRed(c);
// length of the movable run on top of a column
function runLen(col) { let k = col.length ? 1 : 0; while (k < col.length && onto(col[col.length - k - 1], col[col.length - k])) k++; return k; }
export const maxMove = (s, toEmpty) => { const free = s.c.filter((x) => !x).length, empty = s.t.filter((c) => !c.length).length - (toEmpty ? 1 : 0); return (free + 1) * 2 ** Math.max(0, empty); };
function fSlot(s, c) { const i = s.f.findIndex((f) => f.length && suit(f[0]) === suit(c)); if (i >= 0) return fitsF(s.f[i], c) ? i : -1; return rank(c) === 1 ? s.f.findIndex((f) => !f.length) : -1; }
export function moves(s) {
  const out = [];
  const freeCell = s.c.findIndex((x) => !x);
  s.t.forEach((col, i) => {
    if (!col.length) return;
    const c = top(col), fi = fSlot(s, c);
    if (fi >= 0) out.push({ card: c, to: `f${fi}` });
    s.c.forEach((x, k) => { if (!x) out.push({ card: c, to: `c${k}` }); });
    const run = runLen(col);
    for (let L = 1; L <= run; L++) {
      const b = col[col.length - L];
      s.t.forEach((dst, k) => {
        if (k === i) return;
        if (!dst.length) { if (L <= maxMove(s, true) && L < col.length) out.push({ card: b, to: `t${k}`, tail: true }); }
        else if (onto(top(dst), b) && L <= maxMove(s, false)) out.push({ card: b, to: `t${k}`, tail: true });
      });
    }
  });
  void freeCell;
  s.c.forEach((c) => {
    if (!c) return;
    const fi = fSlot(s, c); if (fi >= 0) out.push({ card: c, to: `f${fi}` });
    s.t.forEach((dst, k) => { if (!dst.length || onto(top(dst), c)) out.push({ card: c, to: `t${k}` }); });
  });
  return out;
}
function locate(s, c) {
  for (let i = 0; i < 8; i++) { const j = s.t[i].indexOf(c); if (j >= 0) return ['t', i, j]; }
  const k = s.c.indexOf(c); if (k >= 0) return ['c', k];
  return ['f'];
}
export function apply(s, m) {
  const L = locate(s, m.card); let cards;
  if (L[0] === 't') cards = s.t[L[1]].splice(L[2]); else if (L[0] === 'c') { cards = [s.c[L[1]]]; s.c[L[1]] = null; } else throw new Error('freecell: carta non giocabile');
  const k = m.to[0], i = +m.to.slice(1);
  if (k === 'f') { s.f[i].push(cards[0]); s.score += 10; } else if (k === 'c') s.c[i] = cards[0]; else s.t[i].push(...cards);
  return s;
}
export const won = (s) => s.f.every((f) => f.length === 13);
// a card can go home safely when no card of the opposite colour could still need it
function safeHome(s, c) {
  const r = rank(c); if (r <= 2) return true;
  const need = (sts) => sts.every((x) => { const f = s.f.find((p) => p.length && suit(p[0]) === x); return (f?.length || 0) >= r - 1; });
  return need(isRed(c) ? ['C', 'S'] : ['H', 'D']);
}
export function auto(s) {
  const cand = [...s.t.map(top), ...s.c].filter(Boolean);
  for (const c of cand) { const fi = fSlot(s, c); if (fi >= 0 && safeHome(s, c)) return { card: c, to: `f${fi}` }; }
  return null;
}
export const canFinish = (s) => !won(s) && s.t.every((col) => col.every((c, i) => !i || rank(col[i - 1]) >= rank(c)));
export function finish(s) {
  let best = null;
  for (const c of [...s.t.map(top), ...s.c]) { if (!c) continue; const fi = fSlot(s, c); if (fi >= 0 && (!best || rank(c) < rank(best.card))) best = { card: c, to: `f${fi}` }; }
  return best;
}
export const dead = (s) => !won(s) && moves(s).length === 0;

// ------------------------------------------------------------------ solver (best-first, ints)
const CI = (c) => SUITS.indexOf(suit(c)) * 13 + rank(c) - 1;
const R = (n) => n % 13, S = (n) => (n / 13) | 0, RED = (n) => n < 26;
const on = (a, b) => R(a) === R(b) + 1 && RED(a) !== RED(b);
function toS(s) { const f = [0, 0, 0, 0]; for (const p of s.f) if (p.length) f[SUITS.indexOf(suit(p[0]))] = p.length; return { t: s.t.map((c) => c.map(CI)), c: s.c.filter(Boolean).map(CI), f }; }
function hkey(x) {
  const cs = x.t.map((c) => { let h = 2166136261; for (const v of c) h = Math.imul(h ^ (v + 1), 16777619); return h >>> 0; }).sort((a, b) => a - b);
  let h = 2166136261, g = 7; const mix = (v) => { h = Math.imul(h ^ v, 16777619); g = (Math.imul(g, 31) + v) | 0; };
  for (const v of cs) mix(v); mix(77); for (const v of x.c.slice().sort((a, b) => a - b)) mix(v + 1); mix(78); for (const v of x.f) mix(v);
  return (h >>> 0) * 1048576 + ((g >>> 0) & 1048575);
}
function heur(x) {
  let h = (52 - x.f[0] - x.f[1] - x.f[2] - x.f[3]) * 1.6, empty = 0;
  for (const col of x.t) {
    if (!col.length) { empty++; continue; }
    let lo = 99;
    for (let i = 0; i < col.length; i++) {
      const c = col[i], r = R(c);
      if (r > lo) h += 1; // sits on a lower card: it will have to move
      if (i && !on(col[i - 1], c)) h += 0.6;
      if (x.f[S(c)] === r) h += (col.length - 1 - i) * 0.9; // buried next card for its foundation
      if (r < lo) lo = r;
    }
  }
  return h + x.c.length * 0.7 - empty * 0.8;
}
function cpx(x) { return { t: x.t.map((c) => c.slice()), c: x.c.slice(), f: x.f.slice() }; }
const okF = (x, c) => x.f[S(c)] === R(c);
function safeS(x, c) { const r = R(c); if (r <= 1) return true; const o = RED(c) ? [2, 3] : [0, 1]; return x.f[o[0]] >= r && x.f[o[1]] >= r; }
// solver move: { fr: 't'|'c', i, n (cards), to: 't'|'c'|'f', j }
function smoves(x) {
  const out = [], free = 4 - x.c.length, empties = x.t.filter((c) => !c.length).length;
  let firstEmpty = x.t.findIndex((c) => !c.length);
  x.t.forEach((col, i) => {
    if (!col.length) return;
    const c = col[col.length - 1];
    if (okF(x, c)) out.push({ fr: 't', i, n: 1, to: 'f' });
    let run = 1; while (run < col.length && on(col[col.length - run - 1], col[col.length - run])) run++;
    for (let n = 1; n <= run; n++) {
      const b = col[col.length - n];
      x.t.forEach((dst, j) => {
        if (j === i || !dst.length || !on(dst[dst.length - 1], b)) return;
        if (n <= (free + 1) * 2 ** empties) out.push({ fr: 't', i, n, to: 't', j });
      });
    }
    if (firstEmpty >= 0 && col.length > 1) { const cap = (free + 1) * 2 ** (empties - 1); const n = Math.min(run, cap, col.length - 1); out.push({ fr: 't', i, n, to: 't', j: firstEmpty }); if (n > 1) out.push({ fr: 't', i, n: 1, to: 't', j: firstEmpty }); }
    if (free) out.push({ fr: 't', i, n: 1, to: 'c' });
  });
  x.c.forEach((c, k) => {
    if (okF(x, c)) out.push({ fr: 'c', i: k, n: 1, to: 'f' });
    x.t.forEach((dst, j) => { if (dst.length && on(dst[dst.length - 1], c)) out.push({ fr: 'c', i: k, n: 1, to: 't', j }); });
    if (firstEmpty >= 0) out.push({ fr: 'c', i: k, n: 1, to: 't', j: firstEmpty });
  });
  return out;
}
function sdo(x, m) {
  const y = cpx(x); let cards;
  if (m.fr === 't') cards = y.t[m.i].splice(y.t[m.i].length - m.n); else cards = y.c.splice(m.i, 1);
  if (m.to === 'f') y.f[S(cards[0])]++; else if (m.to === 'c') y.c.push(cards[0]); else y.t[m.j].push(...cards);
  return y;
}
function sauto(x, path) {
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < 8; i++) { const col = x.t[i]; const c = col[col.length - 1]; if (col.length && okF(x, c) && safeS(x, c)) { const m = { fr: 't', i, n: 1, to: 'f', card: c, auto: 1 }; Object.assign(x, sdo(x, m)); path.push(m); again = true; } }
    for (let k = 0; k < x.c.length; k++) { const c = x.c[k]; if (okF(x, c) && safeS(x, c)) { const m = { fr: 'c', i: k, n: 1, to: 'f', card: c, auto: 1 }; Object.assign(x, sdo(x, m)); path.push(m); again = true; k--; } }
  }
}
class Heap { constructor() { this.a = []; } push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].p <= a[i].p) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { const L = 2 * i + 1, Rr = L + 1; let m = i; if (L < a.length && a[L].p < a[m].p) m = L; if (Rr < a.length && a[Rr].p < a[m].p) m = Rr; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; } get size() { return this.a.length; } }
// -> { ok, path: [solver moves incl. autos with .card], nodes }
export function solve(s, budget = 40000) {
  const x0 = toS(s), p0 = []; sauto(x0, p0);
  const seen = new Set([hkey(x0)]), heap = new Heap();
  const root = { x: x0, path: null, m: p0, g: 0 };
  heap.push({ p: heur(x0), n: root });
  let nodes = 0;
  while (heap.size && nodes < budget) {
    const { n } = heap.pop(); nodes++;
    const x = n.x;
    if (x.f[0] + x.f[1] + x.f[2] + x.f[3] === 52) {
      const segs = []; for (let q = n; q; q = q.path) segs.unshift(q.m);
      return { ok: true, path: segs.flat(), nodes };
    }
    for (const m of smoves(x)) {
      const card = m.fr === 't' ? x.t[m.i][x.t[m.i].length - m.n] : x.c[m.i];
      const y = sdo(x, m), seg = [{ ...m, card }]; sauto(y, seg);
      const k = hkey(y); if (seen.has(k)) continue; seen.add(k);
      heap.push({ p: heur(y) + (n.g + 1) * 0.05, n: { x: y, path: n, m: seg, g: n.g + 1 } });
    }
  }
  return { ok: false, nodes };
}
// solver path -> UI moves (the safe auto-moves are left to the game, which does the same)
export function planUI(s, path, autoOn = true) {
  const u = JSON.parse(JSON.stringify(s)), out = [];
  const runAuto = () => { for (let g = 0; g < 60; g++) { const a = auto(u); if (!a) break; apply(u, a); } };
  if (autoOn) runAuto();
  for (const m of path) {
    if (autoOn && m.auto) continue;
    const L = locate(u, IDOF(m.card));
    if (L[0] === 'f') continue; // already sent home by the game's auto-moves
    let to;
    if (m.to === 'f') to = `f${fSlot(u, IDOF(m.card))}`;
    else if (m.to === 'c') to = `c${u.c.findIndex((c) => !c)}`;
    else to = `t${m.j}`;
    const mv = { card: IDOF(m.card), to };
    out.push(mv); apply(u, mv); if (autoOn) runAuto();
  }
  return out;
}
const IDOF = (n) => `${(n % 13) + 1}${SUITS[(n / 13) | 0]}`;
export function pick(no, eo, budget = 40000) {
  if (eo.classic) { let n = no; while (IMPOSSIBLE.includes(n)) n = wrapNo(n + 1); return n; }
  for (let k = 0; k < 50; k++) { const n = wrapNo(no + k); if (solve(deal(n, eo), budget).ok) return n; }
  return no;
}
export function greedy(s, r = Math.random) {
  const ms = moves(s); if (!ms.length) return null;
  const val = (m) => { const L = locate(s, m.card); if (m.to[0] === 'f') return 10; if (m.to[0] === 't') { const d = s.t[+m.to.slice(1)]; if (!d.length) return L[0] === 'c' ? 2 : 0.5; return L[0] === 'c' ? 6 : 4; } return 1; };
  let best = null, bv = -1; for (const m of ms) { const v = val(m) + r() * 2; if (v > bv) { bv = v; best = m; } }
  return best;
}

// ------------------------------------------------------------------ layout
export function view(s, D) {
  const { W, H } = D, pad = Math.max(12, Math.min(W, H) * 0.02), piles = [];
  const side = W / H > 1.9;
  let cw, ch, colX, tabY, cellP, fP;
  if (side) {
    cw = Math.min((W - pad * 2) / (11 * 1.1 + 1.6), ((H - pad * 2) / 2.2) * 0.7); ch = cw / 0.7;
    const g = cw * 1.1, span = 11 * g + cw * 1.6, left = (W - span) / 2 + cw / 2;
    const x0 = left + g * 2 + cw * 0.3;
    colX = (i) => x0 + g * i; tabY = pad + ch / 2;
    cellP = (i) => [left + (i % 2) * g, pad + ch / 2 + Math.floor(i / 2) * ch * 1.12];
    fP = (i) => [x0 + g * 7 + cw * 0.8 + (i % 2) * g, pad + ch / 2 + Math.floor(i / 2) * ch * 1.12];
  } else {
    cw = Math.min((W - pad * 2) / (7 * 1.1 + 1.25), H * 0.2 * 0.7); ch = cw / 0.7;
    const g = cw * 1.1, x0 = W / 2 - g * 3.5;
    colX = (i) => x0 + g * i;
    const ry = pad + ch / 2; tabY = ry + ch * 1.2;
    const gc = cw * 1.07, half = cw * 0.18;
    cellP = (i) => [W / 2 - half - gc * (3.5 - i) - cw * 0.0, ry];
    fP = (i) => [W / 2 + half + gc * (i + 0.5), ry];
  }
  s.c.forEach((c, i) => { const [x, y] = cellP(i); piles.push(pileAt(D, `c${i}`, c ? [c] : [], x, y, cw, { layout: 'stack', outline: true, cls: 'sol-cell' })); });
  s.f.forEach((f, i) => { const [x, y] = fP(i); piles.push(pileAt(D, `f${i}`, f, x, y, cw, { layout: 'stack', outline: true, cls: 'sol-found' })); });
  const maxH = (H - pad - ch / 2 - tabY) / H;
  s.t.forEach((col, i) => piles.push(pileAt(D, `t${i}`, col, colX(i), tabY, cw, { layout: 'cascade', outline: true, upGap: D.portrait ? 0.36 : 0.25, maxH })));
  // deal animation source: an invisible spot in the middle
  piles.push(pileAt(D, 'deck', [], W / 2, H / 2, cw, { layout: 'stack', source: true }));
  return { piles };
}
