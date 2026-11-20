// Texas Hold'em CPU players (Carte Baso). Hand strength is a Monte Carlo EQUITY against the opponents
// still in the hand (random hands, slightly stronger when they have been raising); the decision weighs
// it against the pot odds, the position, the stack depth and the seat's personality:
//   Roccia (tight-passive), Squalo (tight-aggressive), Maniaco (loose-aggressive), Pescatore (loose-passive).
// Levels: Facile = few samples, big noise, calls too much, never bluffs well; Normale = decent samples,
// pot odds; Difficile = many samples, position, range discount vs raises, bet sizing, selected bluffs.
import { toInt, evalInts, holeClass } from './eval.js';
import { menu, potTotal, live, canAct, canRaise, toCall, maxTo } from './engine.js';

export const STYLES = {
  roccia: { id: 'roccia', name: 'Roccia', desc: 'stretto e passivo', tight: 0.08, aggr: 0.22, bluff: 0.02 },
  squalo: { id: 'squalo', name: 'Squalo', desc: 'stretto e aggressivo', tight: 0.04, aggr: 0.62, bluff: 0.08 },
  maniaco: { id: 'maniaco', name: 'Maniaco', desc: 'largo e aggressivo', tight: -0.06, aggr: 0.8, bluff: 0.18 },
  pesce: { id: 'pesce', name: 'Pescatore', desc: 'largo e passivo', tight: -0.09, aggr: 0.14, bluff: 0.03 },
};
export const STYLE_ORDER = ['squalo', 'pesce', 'maniaco', 'roccia', 'squalo', 'maniaco'];
const ITERS = { facile: 50, normale: 160, difficile: 420 };

// Monte Carlo equity of `hole` (ids) on `board` (ids) against `opp` random hands; dead cards excluded
const FULL = Array.from({ length: 52 }, (_, i) => i);
export function equity(hole, board, opp, iters, r = Math.random, dead = []) {
  const h = hole.map(toInt), b = board.map(toInt), used = new Set([...h, ...b, ...dead.map(toInt)]);
  const deck = FULL.filter((c) => !used.has(c));
  const needB = 5 - b.length, need = needB + opp * 2;
  const mine = new Array(7), other = new Array(7);
  let win = 0;
  for (let it = 0; it < iters; it++) {
    // partial Fisher-Yates: the first `need` cards of the deck become the sample
    for (let i = 0; i < need; i++) { const j = i + Math.floor(r() * (deck.length - i)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    let k = 0;
    for (let i = 0; i < b.length; i++) { mine[i] = b[i]; other[i] = b[i]; }
    for (let i = 0; i < needB; i++) { mine[b.length + i] = deck[k]; other[b.length + i] = deck[k]; k++; }
    mine[5] = h[0]; mine[6] = h[1];
    const my = evalInts(mine);
    let best = 0, ties = 0;
    for (let o = 0; o < opp; o++) {
      other[5] = deck[k++]; other[6] = deck[k++];
      const v = evalInts(other);
      if (v > best) { best = v; ties = 0; }
      if (v === best) ties++;
    }
    if (my > best) win += 1; else if (my === best) win += 1 / (ties + 1);
  }
  return win / iters;
}
// preflop equities are cached per hand class and number of opponents (they never change)
const PRE = new Map();
let preSeed = 12345;
const preRng = () => { preSeed = (preSeed + 0x6D2B79F5) >>> 0; let t = preSeed; t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function preflopEquity(hole, opp) {
  const key = `${holeClass(toInt(hole[0]), toInt(hole[1]))}|${opp}`;
  let v = PRE.get(key);
  if (v == null) { v = equity(hole, [], opp, 700, preRng); PRE.set(key, v); }
  return v;
}

// who acts after p on this street (position: last to act is best)
function inPosition(s, p) {
  // p is "in position" when no live opponent acts after p postflop: p is the closest live seat to the button going backwards
  let q = s.btn;
  for (let k = 0; k < s.n; k++) { if (live(s, q) && canAct(s, q)) return q === p; q = (q - 1 + s.n) % s.n; }
  return false;
}
const pick = (moves, to) => { const rs = moves.filter((m) => m.a === 'raise'); if (!rs.length) return null; return rs.reduce((a, b) => (Math.abs(b.to - to) < Math.abs(a.to - to) ? b : a)); };

export function decide(s, p, level = 'normale', r = Math.random, styleId = 'squalo') {
  const moves = menu(s, p);
  if (moves.length <= 1) return moves[0];
  const st = STYLES[styleId] || STYLES.squalo;
  const opp = s.out.reduce((a, o, q) => a + (q !== p && live(s, q) ? 1 : 0), 0);
  const it = ITERS[level] || ITERS.normale;
  let eq = s.board.length ? equity(s.hole[p], s.board, opp, it, r) : preflopEquity(s.hole[p], opp);
  const tc = toCall(s, p), pot = potTotal(s), stack = s.stacks[p], bb = s.bb;
  const odds = tc > 0 ? tc / (pot + tc) : 0;
  const fair = 1 / (opp + 1);
  // the others' ranges get stronger when they bet and raise
  if (level !== 'facile' && s.raises > 0) eq *= 1 - Math.min(0.3, (level === 'difficile' ? 0.07 : 0.05) * s.raises * (s.street === 0 ? 0.7 : 1));
  if (level === 'facile') eq = Math.max(0, Math.min(1, eq + (r() - 0.5) * 0.26));
  const pos = level !== 'facile' && inPosition(s, p);
  const rel = eq / fair; // 1 = an average hand at this table
  const check = moves.find((m) => m.a === 'check'), call = moves.find((m) => m.a === 'call'), fold = moves.find((m) => m.a === 'fold');
  const allin = moves.filter((m) => m.a === 'raise').pop();
  const raiseOk = canRaise(s, p);
  const aggr = st.aggr * (level === 'facile' ? 0.6 : 1);
  const bluff = st.bluff * (level === 'facile' ? 0.3 : level === 'difficile' ? 1.2 : 1) * (pos ? 1.6 : 0.7) * (opp === 1 ? 1.5 : opp === 2 ? 0.8 : 0.35);
  const sized = (frac) => pick(moves, s.cur + (pot + tc) * frac);
  // short stack (tournament): push or fold
  const bbs = (stack + s.bets[p]) / bb;
  if (bbs <= 10 && s.street === 0 && level !== 'facile') {
    const pushEq = fair * (1.12 + st.tight * -1.5) + (tc > bb * 2 ? 0.05 : 0);
    if (eq >= pushEq && allin) return allin;
    return check || fold || call;
  }
  const margin = st.tight + (level === 'difficile' ? 0.01 : level === 'normale' ? 0.02 : -0.04);
  if (tc === 0) {
    const valueAt = 1.38 - aggr * 0.32 - (pos ? 0.06 : 0);
    if (raiseOk && rel > valueAt && r() < 0.45 + aggr * 0.55) {
      const big = rel > 1.9 || eq > 0.8;
      return (level === 'difficile' ? sized(big ? 0.75 : 0.5) : sized(big ? 1 : 0.5)) || check;
    }
    if (raiseOk && r() < bluff * (s.street === 0 ? 0.5 : 1)) return sized(0.5) || check;
    return check;
  }
  // facing a bet
  const raiseAt = 1.75 - aggr * 0.35 - (pos ? 0.05 : 0);
  if (raiseOk && rel > raiseAt && r() < 0.35 + aggr * 0.6) {
    const m = rel > 2.3 || eq > 0.85 ? sized(1) : sized(0.6);
    if (m) return m;
  }
  const potCommitted = tc >= stack * 0.9;
  const need = odds + margin + (potCommitted && level === 'difficile' ? 0.03 : 0);
  if (eq >= need) return call;
  if (raiseOk && level !== 'facile' && r() < bluff * 0.35 && s.street < 3 && tc <= pot * 0.5) return sized(0.75) || call;
  if (level === 'facile' && r() < 0.22 && tc <= bb * 4) return call; // Facile calls too much
  if (st.id === 'pesce' && eq >= odds * 0.7 && tc <= pot * 0.4 && r() < 0.5) return call;
  return fold || check || call;
}
export { maxTo };
