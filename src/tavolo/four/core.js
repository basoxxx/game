// Tavolo Baso · Quattro in fila — 7 columns x 6 rows, discs fall to the lowest free cell; four in a row
// (across, up or diagonal) wins. Pure rules, negamax alpha-beta AI with a transposition table and the
// "puzzle del giorno" generator (win in N moves). Cell index = col*6 + row, row 0 at the bottom.
export const COLS = 7, ROWS = 6;
export const idx = (c, r) => c * ROWS + r;
export function newFour() { return { cells: new Int8Array(COLS * ROWS), h: new Int8Array(COLS), turn: 1, moves: [] }; }
export const cloneFour = (s) => ({ cells: s.cells.slice(), h: s.h.slice(), turn: s.turn, moves: s.moves.slice() });
export const canPlay = (s, c) => c >= 0 && c < COLS && s.h[c] < ROWS;
export function drop(s, c) {
  if (!canPlay(s, c)) return -1;
  const r = s.h[c]++; s.cells[idx(c, r)] = s.turn; s.moves.push(c); s.turn = 3 - s.turn; return r;
}
export function undoDrop(s) { const c = s.moves.pop(); if (c == null) return; const r = --s.h[c]; s.cells[idx(c, r)] = 0; s.turn = 3 - s.turn; }
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
// winning line through (c, r) or null
export function lineAt(s, c, r) {
  const p = s.cells[idx(c, r)]; if (!p) return null;
  for (const [dc, dr] of DIRS) {
    const line = [[c, r]];
    for (const k of [1, -1]) {
      let cc = c + dc * k, rr = r + dr * k;
      while (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && s.cells[idx(cc, rr)] === p) { line.push([cc, rr]); cc += dc * k; rr += dr * k; }
    }
    if (line.length >= 4) return line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return null;
}
export function status(s) {
  const c = s.moves[s.moves.length - 1];
  if (c != null) { const line = lineAt(s, c, s.h[c] - 1); if (line) return { over: true, winner: s.cells[idx(c, s.h[c] - 1)], line }; }
  if (s.moves.length >= COLS * ROWS) return { over: true, winner: 0 };
  return { over: false };
}
const wins = (s, c) => { if (!canPlay(s, c)) return false; const r = s.h[c]; s.cells[idx(c, r)] = s.turn; const w = !!lineAt(s, c, r); s.cells[idx(c, r)] = 0; return w; };

// every window of four cells, for the evaluation
const WINDOWS = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) for (const [dc, dr] of DIRS) {
  const ec = c + dc * 3, er = r + dr * 3;
  if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
  WINDOWS.push([0, 1, 2, 3].map((k) => idx(c + dc * k, r + dr * k)));
}
function evalFour(s, me) {
  const op = 3 - me, cl = s.cells; let sc = 0;
  for (let r = 0; r < ROWS; r++) { const v = cl[idx(3, r)]; if (v === me) sc += 4; else if (v === op) sc -= 4; }
  for (const w of WINDOWS) {
    let a = 0, b = 0; for (const i of w) { const v = cl[i]; if (v === me) a++; else if (v === op) b++; }
    if (a && b) continue;
    if (a === 3) sc += 40; else if (a === 2) sc += 6;
    if (b === 3) sc -= 44; else if (b === 2) sc -= 6;
  }
  return sc;
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];
export const FOUR_LEVELS = [
  { id: 0, name: 'Facile', depth: 2, noise: 50, careless: 0.3 },
  { id: 1, name: 'Medio', depth: 4, noise: 12 },
  { id: 2, name: 'Difficile', depth: 8, noise: 0 },
  { id: 3, name: 'Esperto', depth: 42, noise: 0, ms: 1500 },
];
const WIN = 100000;
export function searchFour(s0, { depth = 6, ms = 1e9, noise = 0, rnd = Math.random } = {}) {
  const s = cloneFour(s0), me = s.turn, deadline = Date.now() + ms, tt = new Map();
  let nodes = 0, stop = false;
  const key = () => s.moves.length + ':' + s.h.join('') + ':' + Array.prototype.join.call(s.cells, '');
  const neg = (d, a, b) => {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    const left = COLS * ROWS - s.moves.length;
    if (!left) return 0;
    for (const c of ORDER) if (wins(s, c)) return WIN - s.moves.length;
    if (d <= 0) return evalFour(s, s.turn);
    const k = d >= 3 ? key() : null;
    if (k) { const e = tt.get(k); if (e && e.d >= d) { if (e.f === 0) return e.v; if (e.f === 1 && e.v >= b) return e.v; if (e.f === 2 && e.v <= a) return e.v; } }
    const a0 = a; let best = -Infinity;
    // forced block: if the opponent threatens a win in a column, only that column matters
    s.turn = 3 - s.turn; const threats = ORDER.filter((c) => wins(s, c)); s.turn = 3 - s.turn;
    const list = threats.length ? threats : ORDER;
    for (const c of list) {
      if (!canPlay(s, c)) continue;
      // never play under an opponent's winning cell
      drop(s, c);
      const v = -neg(d - 1, -b, -a);
      undoDrop(s);
      if (stop) return 0;
      if (v > best) best = v;
      if (v > a) a = v;
      if (a >= b) break;
    }
    if (k) tt.set(k, { d, v: best, f: best <= a0 ? 2 : best >= b ? 1 : 0 });
    return best;
  };
  const roots = ORDER.filter((c) => canPlay(s, c));
  if (!roots.length) return { col: -1, score: 0 };
  for (const c of roots) if (wins(s, c)) return { col: c, score: WIN };
  let best = { col: roots[0], score: -Infinity }, scored = null;
  for (let d = 1; d <= depth; d++) {
    const sc = [];
    for (const c of roots) { drop(s, c); const v = -neg(d - 1, -Infinity, Infinity); undoDrop(s); if (stop) break; sc.push({ col: c, score: v }); }
    if (stop) break;
    scored = sc;
    const top = sc.reduce((x, y) => (y.score > x.score ? y : x));
    best = top;
    if (Math.abs(top.score) > WIN - 100) break;
    if (d >= s.moves.length + 42) break;
  }
  if (noise && scored) {
    let bv = -Infinity;
    for (const x of scored) { const v = x.score + (Math.abs(x.score) > WIN - 100 ? 0 : (rnd() * 2 - 1) * noise); if (v > bv) { bv = v; best = x; } }
  }
  void me;
  return best;
}
export function chooseFour(s, level = 1, rnd = Math.random) {
  const L = FOUR_LEVELS[Math.max(0, Math.min(3, level))];
  const free = ORDER.filter((c) => canPlay(s, c));
  if (L.careless && rnd() < L.careless) {
    // a careless move, but still takes an immediate win
    const w = free.find((c) => wins(s, c)); if (w != null) return w;
    return free[Math.floor(rnd() * free.length)];
  }
  return searchFour(s, { depth: L.depth, ms: L.ms || 1e9, noise: L.noise, rnd }).col;
}
// can the side to move force a win within n of its own moves? returns the winning column or -1
export function winIn(s, n) {
  if (n <= 0) return -1;
  for (const c of ORDER) if (wins(s, c)) return c;
  if (n === 1) return -1;
  for (const c of ORDER) {
    if (!canPlay(s, c)) continue;
    drop(s, c);
    let all = true, any = false;
    for (const d of ORDER) {
      if (!canPlay(s, d)) continue; any = true;
      if (wins(s, d)) { all = false; break; }
      drop(s, d); const ok = winIn(s, n - 1) >= 0; undoDrop(s);
      if (!ok) { all = false; break; }
    }
    undoDrop(s);
    if (all && any) return c;
  }
  return -1;
}
export function winKeys(s, n) {
  const out = [];
  for (const c of ORDER) {
    if (!canPlay(s, c)) continue;
    if (wins(s, c)) { out.push(c); continue; }
    if (n === 1) continue;
    drop(s, c);
    let all = true, any = false;
    for (const d of ORDER) { if (!canPlay(s, d)) continue; any = true; if (wins(s, d)) { all = false; break; } drop(s, d); const ok = winIn(s, n - 1) >= 0; undoDrop(s); if (!ok) { all = false; break; } }
    undoDrop(s);
    if (all && any) out.push(c);
  }
  return out;
}
// deterministic puzzle: a position from seeded play where the side to move wins in exactly n moves
export function fourPuzzle(seed, n = 3) {
  let x = (seed >>> 0) || 1; const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  for (let tries = 0; tries < 400; tries++) {
    const s = newFour(); const plies = 8 + Math.floor(rnd() * 14);
    let ok = true;
    for (let i = 0; i < plies; i++) {
      const free = ORDER.filter((c) => canPlay(s, c));
      // semi-sensible play: avoid handing over immediate wins
      const safe = free.filter((c) => { if (wins(s, c)) return false; drop(s, c); const bad = ORDER.some((d) => wins(s, d)); undoDrop(s); return !bad; });
      const pool = safe.length ? safe : free;
      drop(s, pool[Math.floor(rnd() * pool.length)]);
      if (status(s).over) { ok = false; break; }
    }
    if (!ok) continue;
    if (winIn(s, n - 1) >= 0) continue;
    const keys = winKeys(s, n);
    if (keys.length === 1) return { moves: s.moves.slice(), turn: s.turn, n, key: keys[0] };
  }
  return null;
}
