// Tavolo Baso · Dama italiana — rules and AI, pure (no DOM).
// Board 8x8, index = y*8 + x, y = 0 is White's first row; the dark playing squares have (x + y) odd, so each
// player has a dark square in the right-hand corner. 1 = white man, 2 = white king, -1/-2 black. White starts.
// Italian rules: men move and capture forward only and can never capture a king; kings move one square in any
// diagonal direction (no flying); a man that reaches the last row is crowned and its move ends there.
// Capturing is mandatory and the priorities are, in order: the most pieces; with a king rather than a man;
// the most kings; the sequence that meets a king first. Then the player chooses freely.
export const WM = 1, WK = 2, BM = -1, BK = -2;
export const isDark = (x, y) => ((x + y) & 1) === 1;
export const sq = (x, y) => y * 8 + x;
export const sx = (s) => s & 7, sy = (s) => s >> 3;
export const sqName = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1);

export function initial() {
  const b = new Int8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (isDark(x, y)) { if (y < 3) b[sq(x, y)] = WM; else if (y > 4) b[sq(x, y)] = BM; }
  return { b, side: 1, quiet: 0, hist: [] };
}
export const clone = (st) => ({ b: st.b.slice(), side: st.side, quiet: st.quiet, hist: st.hist.slice() });
const DIRS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const own = (p, side) => p !== 0 && Math.sign(p) === side;

// all capture sequences of one piece (raw, before the priority filter)
function captures(b, from, out) {
  const p = b[from], side = Math.sign(p), king = Math.abs(p) === 2;
  b[from] = 0;
  const dfs = (s, path, caps, kinds) => {
    let more = false;
    const x = s & 7, y = s >> 3;
    for (const [dx, dy] of DIRS) {
      if (!king && dy !== side) continue;
      const mx = x + dx, my = y + dy, lx = x + 2 * dx, ly = y + 2 * dy;
      if (lx < 0 || lx > 7 || ly < 0 || ly > 7) continue;
      const m = my * 8 + mx, l = ly * 8 + lx, q = b[m];
      if (!q || Math.sign(q) === side || caps.includes(m) || b[l] !== 0) continue;
      if (!king && Math.abs(q) === 2) continue; // a man never captures a king
      more = true;
      const crown = !king && ly === (side > 0 ? 7 : 0);
      if (crown) out.push({ from, to: l, path: [...path, l], caps: [...caps, m], kinds: [...kinds, Math.abs(q)], king, crown: true });
      else dfs(l, [...path, l], [...caps, m], [...kinds, Math.abs(q)]);
    }
    if (!more && caps.length) out.push({ from, to: s, path, caps, kinds, king, crown: false });
  };
  dfs(from, [from], [], []);
  b[from] = p;
}
// Italian capture priority
function bestCaptures(list) {
  if (!list.length) return list;
  const maxN = Math.max(...list.map((m) => m.caps.length));
  list = list.filter((m) => m.caps.length === maxN);
  if (list.some((m) => m.king)) list = list.filter((m) => m.king);
  const kc = (m) => m.kinds.filter((k) => k === 2).length;
  const maxK = Math.max(...list.map(kc)); list = list.filter((m) => kc(m) === maxK);
  if (maxK > 0) {
    const first = (m) => m.kinds.indexOf(2);
    const mf = Math.min(...list.map(first)); list = list.filter((m) => first(m) === mf);
  }
  return list;
}
export function legalMoves(st) {
  const b = st.b, side = st.side, caps = [];
  for (let s = 0; s < 64; s++) if (own(b[s], side)) captures(b, s, caps);
  if (caps.length) {
    const best = bestCaptures(caps);
    // the same landing path through different captured pieces is the same move only if caps match; keep unique
    const seen = new Set();
    return best.filter((m) => { const k = m.path.join('-') + ':' + m.caps.join('.'); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  const out = [];
  for (let s = 0; s < 64; s++) {
    const p = b[s]; if (!own(p, side)) continue;
    const king = Math.abs(p) === 2, x = s & 7, y = s >> 3;
    for (const [dx, dy] of DIRS) {
      if (!king && dy !== side) continue;
      const tx = x + dx, ty = y + dy; if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
      const t = ty * 8 + tx; if (b[t]) continue;
      out.push({ from: s, to: t, path: [s, t], caps: [], kinds: [], king, crown: !king && ty === (side > 0 ? 7 : 0) });
    }
  }
  return out;
}
export const keyOf = (st) => st.side + ':' + Array.prototype.join.call(st.b, '');
export function play(st, m) {
  const b = st.b, p = b[m.from];
  st.hist.push(keyOf(st));
  b[m.from] = 0; for (const c of m.caps) b[c] = 0;
  b[m.to] = m.crown ? 2 * Math.sign(p) : p;
  st.quiet = m.caps.length || Math.abs(p) === 1 ? 0 : st.quiet + 1;
  st.side = -st.side;
  return st;
}
export function status(st) {
  const ms = legalMoves(st);
  if (!ms.length) return { over: true, winner: -st.side, why: st.b.some((p) => own(p, st.side)) ? 'bloccato' : 'pezzi' };
  if (st.quiet >= 80) return { over: true, winner: 0, why: 'mosse' };
  const k = keyOf(st); let n = 0; for (const h of st.hist) if (h === k) n++;
  if (n >= 2) return { over: true, winner: 0, why: 'ripetizione' };
  return { over: false, moves: ms };
}
export function moveName(m) { return m.path.map(sqName).join(m.caps.length ? '×' : '-'); }
export function count(st) { let w = 0, bk = 0, wk = 0, kb = 0; for (const p of st.b) { if (p === 1) w++; else if (p === 2) wk++; else if (p === -1) bk++; else if (p === -2) kb++; } return { wm: w, wk, bm: bk, bk: kb }; }

// ───────── AI
export const DAMA_LEVELS = [
  { id: 0, name: 'Facile', depth: 2, noise: 60 },
  { id: 1, name: 'Medio', depth: 4, noise: 15 },
  { id: 2, name: 'Difficile', depth: 7, noise: 0, ms: 700 },
  { id: 3, name: 'Esperto', depth: 30, noise: 0, ms: 1800 },
];
const CENTER = new Int8Array(64);
for (let s = 0; s < 64; s++) { const x = s & 7, y = s >> 3; CENTER[s] = (x >= 2 && x <= 5 ? 3 : 0) + (y >= 2 && y <= 5 ? 3 : 0); }
export function evalDama(b, side) {
  let s = 0, wm = 0, bm = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p) continue;
    const y = i >> 3;
    if (p === 1) { wm++; s += 100 + y * 5 + CENTER[i] + (y === 0 ? 6 : 0); }
    else if (p === -1) { bm++; s -= 100 + (7 - y) * 5 + CENTER[i] + (y === 7 ? 6 : 0); }
    else if (p === 2) s += 165 + CENTER[i] * 2;
    else s -= 165 + CENTER[i] * 2;
  }
  // trading down helps the side ahead
  const tot = wm + bm;
  if (tot < 16) s = s * (1 + (16 - tot) * 0.02);
  return side * s;
}
const undo = (b, m, p, capVals) => { b[m.to] = 0; b[m.from] = p; m.caps.forEach((c, i) => { b[c] = capVals[i]; }); };
const doMove = (b, m) => { const p = b[m.from], cv = m.caps.map((c) => b[c]); b[m.from] = 0; for (const c of m.caps) b[c] = 0; b[m.to] = m.crown ? 2 * Math.sign(p) : p; return [p, cv]; };
export function searchDama(st, { depth = 4, ms = 1e9, rnd = Math.random, noise = 0 } = {}) {
  const b = st.b.slice(), deadline = Date.now() + ms;
  let nodes = 0, stop = false;
  const neg = (side, d, a, be, ply) => {
    if ((++nodes & 511) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    const ms_ = legalMoves({ b, side });
    if (!ms_.length) return -10000 + ply;
    // keep going while captures are forced (quiescence)
    if (d <= 0 && !ms_[0].caps.length) return evalDama(b, side);
    if (d <= -8) return evalDama(b, side);
    ms_.sort((x, y) => y.caps.length - x.caps.length || (y.crown ? 1 : 0) - (x.crown ? 1 : 0));
    let best = -1e9;
    for (const m of ms_) {
      const [p, cv] = doMove(b, m);
      const v = -neg(-side, d - 1, -be, -a, ply + 1);
      undo(b, m, p, cv);
      if (stop) return 0;
      if (v > best) best = v;
      if (v > a) a = v;
      if (a >= be) break;
    }
    return best;
  };
  const root = legalMoves({ b, side: st.side });
  if (root.length <= 1) return root[0] || null;
  let bestM = root[0], scores = null;
  for (let d = 1; d <= depth; d++) {
    const sc = []; let ra = -1e9;
    for (const m of root) {
      const [p, cv] = doMove(b, m);
      const v = -neg(-st.side, d - 1, -1e9, noise ? 1e9 : -ra, 1);
      if (v > ra) ra = v;
      undo(b, m, p, cv);
      if (stop) break;
      sc.push({ m, v });
    }
    if (stop) break;
    scores = sc;
    sc.sort((x, y) => y.v - x.v);
    root.sort((x, y) => sc.findIndex((s) => s.m === x) - sc.findIndex((s) => s.m === y));
    bestM = sc[0].m;
    if (Math.abs(sc[0].v) > 9000) break;
  }
  if (noise && scores) { let bv = -1e9; for (const { m, v } of scores) { const z = v + (rnd() * 2 - 1) * noise; if (z > bv) { bv = z; bestM = m; } } }
  return bestM;
}
export function chooseDama(st, level = 1, rnd = Math.random) {
  const L = DAMA_LEVELS[Math.max(0, Math.min(3, level))];
  return searchDama(st, { depth: L.depth, ms: L.ms || 1e9, noise: L.noise, rnd });
}
