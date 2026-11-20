// Piramide: 28 cards in a pyramid of 7 rows, the other 24 in the stock. Remove pairs of uncovered
// cards that add up to 13 (J = 11, Q = 12, K = 13 alone); the top of the waste pairs too. Clear the
// whole pyramid to win. Stock passes: 1, 2 or 3. Pure rules + a depth-first solver.
import { makeDeck, shuffle, rank, seedOf } from '../../core/cards.js';
import { pileAt, wrapNo } from './common.js';

const top = (a) => a[a.length - 1];
const idx = (r, k) => (r * (r + 1)) / 2 + k;
export const ROW = []; for (let r = 0; r < 7; r++) for (let k = 0; k <= r; k++) ROW.push([r, k]);
export function deal(no, eo) {
  const d = shuffle(makeDeck('fr52'), { rng: seedOf(`piramide|${no}`) });
  const p = []; for (let i = 0; i < 28; i++) p.push(d.pop());
  return { p, st: d, wa: [], f: [], pass: 1, passes: eo.passes, score: 0 };
}
export function free(s, i) {
  const [r, k] = ROW[i]; if (s.p[i] == null) return false; if (r === 6) return true;
  return s.p[idx(r + 1, k)] == null && s.p[idx(r + 1, k + 1)] == null;
}
export function moves(s) {
  const out = [], open = [];
  for (let i = 0; i < 28; i++) if (free(s, i)) open.push(i);
  const w = top(s.wa);
  for (const i of open) {
    const c = s.p[i];
    if (rank(c) === 13) { out.push({ card: c, to: 'found' }); continue; }
    for (const j of open) if (j !== i && rank(s.p[j]) + rank(c) === 13) out.push({ card: c, to: `p${j}` });
    if (w && rank(w) + rank(c) === 13) out.push({ card: c, to: 'waste' });
  }
  if (w) {
    if (rank(w) === 13) out.push({ card: w, to: 'found' });
    for (const i of open) if (rank(s.p[i]) + rank(w) === 13) out.push({ card: w, to: `p${i}` });
  }
  if (s.st.length) out.push({ card: top(s.st), act: 'draw' });
  else if (s.wa.length && s.pass < s.passes) out.push({ act: 'recycle', label: 'Rigira il mazzo' });
  return out;
}
function take(s, c) {
  const i = s.p.indexOf(c);
  if (i >= 0) { s.p[i] = null; return; }
  if (top(s.wa) === c) { s.wa.pop(); return; }
  throw new Error('piramide: carta non libera');
}
export function apply(s, m) {
  if (m.act === 'draw') { s.wa.push(s.st.pop()); return s; }
  if (m.act === 'recycle') { s.st = s.wa.reverse(); s.wa = []; s.pass++; return s; }
  const other = m.to === 'found' ? null : m.to === 'waste' ? top(s.wa) : s.p[+m.to.slice(1)];
  take(s, m.card); if (other) take(s, other);
  s.f.push(m.card); if (other) s.f.push(other);
  s.score += other ? 10 : 5;
  if (s.p.every((x) => x == null)) s.score += 100 + 10 * s.st.length;
  return s;
}
export const won = (s) => s.p.every((x) => x == null);
export const dead = (s) => !won(s) && moves(s).length === 0;
export const bonus = (s) => (s.passes - s.pass) * 25;

// ------------------------------------------------------------------ solver (DFS with memo)
const keyOf = (s) => `${s.p.map((c) => (c ? 1 : 0)).join('')}|${s.st.length}|${s.wa.join(',')}|${s.pass}`;
const cpP = (s) => ({ p: s.p.slice(), st: s.st.slice(), wa: s.wa.slice(), f: s.f.slice(), pass: s.pass, passes: s.passes, score: s.score });
export function solve(s0, budget = 40000) {
  const seen = new Set(), path = []; let nodes = 0, abort = false;
  const order = (s) => {
    const ms = moves(s);
    // removals first (kings, pairs that uncover the most), drawing last
    const v = (m) => { if (m.act === 'draw') return 1; if (m.act === 'recycle') return 0; const i = s.p.indexOf(m.card); const j = m.to[0] === 'p' ? +m.to.slice(1) : -1; return 10 + (i >= 0 ? 6 - ROW[i][0] : 0) + (j >= 0 ? 6 - ROW[j][0] : 0) + (m.to === 'found' ? 3 : 0); };
    // drop symmetric duplicates (a->b and b->a)
    const seenPair = new Set();
    return ms.filter((m) => { if (m.act) return true; const o = m.to === 'found' ? '' : m.to === 'waste' ? top(s.wa) : s.p[+m.to.slice(1)]; const k = [m.card, o].sort().join('+'); if (seenPair.has(k)) return false; seenPair.add(k); return true; }).sort((a, b) => v(b) - v(a));
  };
  function dfs(s) {
    if (won(s)) return true;
    if (++nodes > budget) { abort = true; return false; }
    const k = keyOf(s); if (seen.has(k)) return false; seen.add(k);
    const ms = order(s);
    // removing a king never hurts: no branching
    const king = ms.find((m) => m.to === 'found');
    for (const m of king ? [king] : ms) {
      path.push(m);
      if (dfs(apply(cpP(s), m))) return true;
      path.pop(); if (abort) return false;
    }
    return false;
  }
  const ok = dfs(cpP(s0));
  return ok ? { ok, path: path.slice(), nodes } : { ok, exhausted: !abort, nodes };
}
export function pick(no, eo, budget = 20000) {
  for (let k = 0; k < 300; k++) { const n = wrapNo(no + k); if (solve(deal(n, eo), budget).ok) return n; }
  return no;
}
export function greedy(s) {
  const ms = moves(s); if (!ms.length) return null;
  const pair = ms.find((m) => !m.act);
  return pair || ms[0];
}

// ------------------------------------------------------------------ layout
export function view(s, D) {
  const { W, H } = D, pad = Math.max(12, Math.min(W, H) * 0.02), piles = [];
  const side = W / H > 1.25;
  // the pyramid: 7 cards wide, rows overlap by half a card
  let cw;
  if (side) cw = Math.min((W - pad * 2) / (7 * 1.08 + 2.6), (H - pad * 2) / (6 * 0.52 + 1) * 0.7);
  else cw = Math.min((W - pad * 2) / (7 * 1.08), (H - pad * 2) / (6 * 0.52 + 1 + 1.4) * 0.7);
  const ch = cw / 0.7, g = cw * 1.08, rowH = ch * 0.52;
  const px = side ? W / 2 - cw * 0.9 : W / 2, py = side ? (H - (6 * rowH + ch)) / 2 + ch / 2 : pad + ch / 2;
  const pc = s.p.map((c, i) => (c ? { c, i } : null));
  pc.forEach((x, i) => {
    const [r, k] = ROW[i];
    piles.push(pileAt(D, `p${i}`, x ? [x.c] : [], px + (k - r / 2) * g, py + r * rowH, cw, { layout: 'stack', z: r * 2 }));
  });
  let stP, waP, fP;
  if (side) { const x = px + 3 * g + cw * 1.4; stP = [x, py]; waP = [x, py + ch * 1.15]; fP = [x + g * 0, py + ch * 2.3]; }
  else { const y = py + 6 * rowH + ch * 1.25; stP = [W / 2 - g * 1.6, y]; waP = [W / 2, y]; fP = [W / 2 + g * 1.6, y]; }
  if (side && fP[1] + ch / 2 > H - pad) fP = [stP[0] - g * 0 - g * 7.5, py];
  piles.push(pileAt(D, 'stock', s.st.map((c) => ({ id: c, up: false })), stP[0], stP[1], cw, { layout: 'stack', outline: true, source: true, label: s.st.length ? `${s.st.length} · giro ${s.pass}/${s.passes}` : s.wa.length && s.pass < s.passes ? '↻' : '' }));
  piles.push(pileAt(D, 'waste', s.wa.slice(-12), waP[0], waP[1], cw, { layout: 'stack', outline: true, z: 60 }));
  piles.push(pileAt(D, 'found', s.f.slice(-12), fP[0], fP[1], cw, { layout: 'stack', outline: true, cls: 'sol-out', z: 60, label: s.f.length ? String(s.f.length) : '' }));
  // cards of the waste that are not drawn (more than 12 back) still exist: keep them, under the top ones
  const hiddenWa = s.wa.slice(0, -12), hiddenF = s.f.slice(0, -12);
  if (hiddenWa.length) piles.push(pileAt(D, 'waste0', hiddenWa, waP[0], waP[1], cw, { layout: 'stack', z: -1 }));
  if (hiddenF.length) piles.push(pileAt(D, 'found0', hiddenF, fP[0], fP[1], cw, { layout: 'stack', z: -1 }));
  return { piles };
}
