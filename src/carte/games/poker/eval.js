// Texas Hold'em hand evaluator (Carte Baso). Pure, no DOM.
// Cards inside the evaluator are ints 0..51: (rank - 2) * 4 + suit, rank 2..14 (14 = Asso), suit 0..3.
// Card ids of the framework ('1S', '13H') convert with toInt(). A hand SCORE is one integer:
//   category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5     (bigger = better)
// category 0 Carta alta, 1 Coppia, 2 Doppia coppia, 3 Tris, 4 Scala, 5 Colore, 6 Full, 7 Poker, 8 Scala colore.
// evalInts() works on 5, 6 or 7 cards (best five) without enumerating combinations; evalSlow() is the
// obviously-correct reference (all C(n,5) five-card hands) used by the tests.
const SUIT_IX = { H: 0, D: 1, C: 2, S: 3 };
const SUIT_CH = ['H', 'D', 'C', 'S'];
export const toInt = (id) => { const r = parseInt(id, 10), s = id.replace(/~.*/, '').slice(-1); return ((r === 1 ? 14 : r) - 2) * 4 + SUIT_IX[s]; };
export const toId = (c) => { const r = (c >> 2) + 2; return `${r === 14 ? 1 : r}${SUIT_CH[c & 3]}`; };
export const CAT = ['Carta alta', 'Coppia', 'Doppia coppia', 'Tris', 'Scala', 'Colore', 'Full', 'Poker', 'Scala colore', 'Scala reale'];

const cnt = new Int8Array(15);
const smask = new Int32Array(4), scnt = new Int8Array(4);
function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 2;
  for (let h = 14; h >= 5; h--) if (((mask >> (h - 4)) & 31) === 31) return h;
  return 0;
}
const pack = (cat, k) => (cat << 20) | ((k[0] || 0) << 16) | ((k[1] || 0) << 12) | ((k[2] || 0) << 8) | ((k[3] || 0) << 4) | (k[4] || 0);
function topBits(mask, n) { const out = []; for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r); return out; }

export function evalInts(cs) {
  cnt.fill(0); smask.fill(0); scnt.fill(0);
  let all = 0;
  for (let i = 0; i < cs.length; i++) { const c = cs[i], r = (c >> 2) + 2, s = c & 3; cnt[r]++; smask[s] |= 1 << r; scnt[s]++; all |= 1 << r; }
  let fs = -1; for (let s = 0; s < 4; s++) if (scnt[s] >= 5) fs = s;
  if (fs >= 0) { const sf = straightHigh(smask[fs]); if (sf) return pack(8, [sf]); }
  let quad = 0; const trips = [], pairs = [];
  for (let r = 14; r >= 2; r--) { const k = cnt[r]; if (k === 4) quad = r; else if (k === 3) trips.push(r); else if (k === 2) pairs.push(r); }
  if (quad) { let k = 0; for (let r = 14; r >= 2; r--) if (r !== quad && cnt[r]) { k = r; break; } return pack(7, [quad, k]); }
  if (trips.length && (trips.length > 1 || pairs.length)) return pack(6, [trips[0], Math.max(trips[1] || 0, pairs[0] || 0)]);
  if (fs >= 0) return pack(5, topBits(smask[fs], 5));
  const st = straightHigh(all); if (st) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...topBits(all & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...topBits(all & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1)]);
  if (pairs.length) return pack(1, [pairs[0], ...topBits(all & ~(1 << pairs[0]), 3)]);
  return pack(0, topBits(all, 5));
}
export const evalIds = (ids) => evalInts(ids.map(toInt));

// ---- slow reference: classify one 5-card hand by sorting, take the best of all combinations
export function eval5Slow(cs) {
  const rs = cs.map((c) => (c >> 2) + 2), ss = cs.map((c) => c & 3);
  const flush = ss.every((s) => s === ss[0]);
  const groups = {}; for (const r of rs) groups[r] = (groups[r] || 0) + 1;
  const g = Object.entries(groups).map(([r, k]) => [+r, k]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...new Set(rs)].sort((a, b) => b - a);
  let straight = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straight = uniq[0];
    else if (uniq.join() === '14,5,4,3,2') straight = 5;
  }
  if (straight && flush) return pack(8, [straight]);
  if (g[0][1] === 4) return pack(7, [g[0][0], g[1][0]]);
  if (g[0][1] === 3 && g[1][1] === 2) return pack(6, [g[0][0], g[1][0]]);
  if (flush) return pack(5, uniq);
  if (straight) return pack(4, [straight]);
  if (g[0][1] === 3) return pack(3, [g[0][0], g[1][0], g[2][0]]);
  if (g[0][1] === 2 && g[1][1] === 2) return pack(2, [g[0][0], g[1][0], g[2][0]]);
  if (g[0][1] === 2) return pack(1, g.map((x) => x[0]));
  return pack(0, uniq);
}
export function combos(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  return out;
}
export function evalSlow(cs) { let best = -1; for (const c of combos(cs, 5)) best = Math.max(best, eval5Slow(c)); return best; }
// the five cards that make the best hand (for highlighting at showdown)
export function bestFive(ids) {
  const ints = ids.map(toInt); let best = -1, pick = null;
  for (const c of combos(ints.map((_, i) => i), 5)) { const v = eval5Slow(c.map((i) => ints[i])); if (v > best) { best = v; pick = c; } }
  return pick ? pick.map((i) => ids[i]) : ids.slice();
}

// ---- Italian names
const R1 = { 14: 'Asso', 13: 'Re', 12: 'Donna', 11: 'Jack', 10: 'Dieci', 9: 'Nove', 8: 'Otto', 7: 'Sette', 6: 'Sei', 5: 'Cinque', 4: 'Quattro', 3: 'Tre', 2: 'Due' };
const RP = { 14: 'Assi', 13: 'Re', 12: 'Donne', 11: 'Jack', 10: 'Dieci', 9: 'Nove', 8: 'Otto', 7: 'Sette', 6: 'Sei', 5: 'Cinque', 4: 'Quattro', 3: 'Tre', 2: 'Due' };
const al = (r) => (r === 14 ? 'all’Asso' : r === 8 ? 'all’Otto' : `al ${R1[r]}`);
export const category = (score) => (score >> 20);
export const kick = (score, i) => (score >> (16 - 4 * i)) & 15;
export function catName(score) { const c = category(score); return c === 8 && kick(score, 0) === 14 ? CAT[9] : CAT[c]; }
export function handName(score) {
  const c = category(score), k = (i) => kick(score, i);
  switch (c) {
    case 8: return k(0) === 14 ? 'Scala reale' : `Scala colore ${al(k(0))}`;
    case 7: return `Poker di ${RP[k(0)]}`;
    case 6: return `Full di ${RP[k(0)]} e ${RP[k(1)]}`;
    case 5: return `Colore ${al(k(0))}`;
    case 4: return k(0) === 5 ? 'Scala minima (dall’Asso al Cinque)' : `Scala ${al(k(0))}`;
    case 3: return `Tris di ${RP[k(0)]}`;
    case 2: return `Doppia coppia, ${RP[k(0)]} e ${RP[k(1)]}`;
    case 1: return `Coppia di ${RP[k(0)]}`;
    default: return `Carta alta: ${R1[k(0)]}`;
  }
}
// preflop class of two hole cards: 'AKs', 'QJo', '77'
const RC = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
export function holeClass(a, b) {
  let ra = (a >> 2) + 2, rb = (b >> 2) + 2; if (rb > ra) [ra, rb] = [rb, ra];
  const n = (r) => RC[r] || String(r);
  if (ra === rb) return n(ra) + n(rb);
  return n(ra) + n(rb) + ((a & 3) === (b & 3) ? 's' : 'o');
}
