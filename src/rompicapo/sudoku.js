// Rompicapo · Sudoku — solver, unique-solution generator and a human-style grader.
// Pure module (no DOM): used by the game, the hint system and tools/rompicapo-test.mjs.
//   grid: Array(81) of 0..9 (0 = empty), row-major.
//   generate(seed, diff) -> { puzzle, solution, diff, level, givens, seed }
//   grade(puzzle)        -> { level 1..4, solved, steps }   1 singles · 2 locked/pairs · 3 triples/wings/fish · 4 beyond
import { mulberry32, shuffle } from './util.js';

export const DIFFS = [
  { id: 'facile', name: 'Facile', level: 1, givens: [36, 40], color: '#3fd18b', reward: 15 },
  { id: 'medio', name: 'Medio', level: 1, givens: [29, 33], color: '#3aa0ff', reward: 25 },
  { id: 'difficile', name: 'Difficile', level: 2, givens: [0, 30], color: '#ff9b3d', reward: 40 },
  { id: 'esperto', name: 'Esperto', level: 3, givens: [0, 28], color: '#ff4d6d', reward: 60 },
];
export const DIFF = Object.fromEntries(DIFFS.map((d) => [d.id, d]));
export const TECH = {
  nudo: 'Singolo nudo', nascosto: 'Singolo nascosto', puntamento: 'Candidati bloccati', coppia: 'Coppia nuda', coppiaN: 'Coppia nascosta',
  tripla: 'Tripla nuda', triplaN: 'Tripla nascosta', xwing: 'X-Wing', ywing: 'Y-Wing', swordfish: 'Swordfish',
};
const TLEVEL = { nudo: 1, nascosto: 1, puntamento: 2, coppia: 2, coppiaN: 2, tripla: 3, triplaN: 3, xwing: 3, ywing: 3, swordfish: 3 };

// ------------------------------------------------------------------ geometry
export const ROW = (i) => (i / 9) | 0, COL = (i) => i % 9, BOX = (i) => (((i / 27) | 0) * 3) + (((i % 9) / 3) | 0);
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) { const r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3; const u = []; for (let k = 0; k < 9; k++) u.push((r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)); UNITS.push(u); }
export const PEERS = Array.from({ length: 81 }, (_, i) => { const s = new Set(); for (const u of [UNITS[ROW(i)], UNITS[9 + COL(i)], UNITS[18 + BOX(i)]]) for (const j of u) if (j !== i) s.add(j); return [...s]; });
const POP = new Uint8Array(512); for (let m = 1; m < 512; m++) POP[m] = POP[m >> 1] + (m & 1);
const bit = (d) => 1 << (d - 1);
const digitsOf = (m) => { const out = []; for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d); return out; };
const lowDigit = (m) => 31 - Math.clz32(m & -m) + 1;
export const unitName = (u) => (u < 9 ? `riga ${u + 1}` : u < 18 ? `colonna ${u - 8}` : `riquadro ${u - 17}`);

// ------------------------------------------------------------------ brute-force counting (bitmasks + MRV)
export function countSolutions(grid, limit = 2, out = null) {
  const g = grid.slice(), rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
  for (let i = 0; i < 81; i++) { const v = g[i]; if (!v) continue; const b = bit(v), r = ROW(i), c = COL(i), x = BOX(i); if ((rows[r] | cols[c] | boxes[x]) & b) return 0; rows[r] |= b; cols[c] |= b; boxes[x] |= b; }
  let count = 0;
  const rec = () => {
    let best = -1, bestM = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = 511 & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]), n = POP[m];
      if (n === 0) return false;
      if (n < bestN) { bestN = n; best = i; bestM = m; if (n === 1) break; }
    }
    if (best < 0) { count++; if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i]; return count >= limit; }
    const r = ROW(best), c = COL(best), x = BOX(best);
    let m = bestM;
    while (m) {
      const b = m & -m; m ^= b;
      g[best] = lowDigit(b); rows[r] |= b; cols[c] |= b; boxes[x] |= b;
      if (rec()) return true;
      rows[r] ^= b; cols[c] ^= b; boxes[x] ^= b; g[best] = 0;
    }
    return false;
  };
  rec();
  return count;
}
export function solve(grid) { const out = new Array(81).fill(0); return countSolutions(grid, 1, out) ? out : null; }

// random complete grid
export function fullGrid(rnd) {
  const g = new Array(81).fill(0), rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
  const rec = (i) => {
    if (i === 81) return true;
    const r = ROW(i), c = COL(i), x = BOX(i), m = 511 & ~(rows[r] | cols[c] | boxes[x]);
    const ds = shuffle(digitsOf(m), rnd);
    for (const d of ds) { const b = bit(d); g[i] = d; rows[r] |= b; cols[c] |= b; boxes[x] |= b; if (rec(i + 1)) return true; rows[r] ^= b; cols[c] ^= b; boxes[x] ^= b; }
    g[i] = 0; return false;
  };
  rec(0);
  return g;
}

// ------------------------------------------------------------------ human-style logic
export function candidates(grid) {
  const cand = new Int32Array(81);
  for (let i = 0; i < 81; i++) { if (grid[i]) continue; let m = 511; for (const j of PEERS[i]) if (grid[j]) m &= ~bit(grid[j]); cand[i] = m; }
  return cand;
}
// One logical step on (grid, cand): returns { tech, place?: [i, d], elim?: [[i, mask]], unit?, cells? } or null.
export function findStep(grid, cand, maxLevel = 3) {
  // naked single
  for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 1) return { tech: 'nudo', place: [i, lowDigit(cand[i])], cells: [i] };
  // hidden single (boxes first: the way people scan)
  for (const u of [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d); let where = -1, n = 0;
      for (const i of UNITS[u]) { if (grid[i] === d) { n = 9; break; } if (!grid[i] && (cand[i] & b)) { where = i; n++; } }
      if (n === 1) return { tech: 'nascosto', place: [where, d], unit: u, cells: [where] };
    }
  }
  if (maxLevel < 2) return null;
  const elimStep = (tech, list, cells, unit) => { const e = list.filter(([i, m]) => cand[i] & m); return e.length ? { tech, elim: e, cells, unit } : null; };
  // locked candidates: pointing (box -> line) and claiming (line -> box)
  for (let bx = 18; bx < 27; bx++) for (let d = 1; d <= 9; d++) {
    const b = bit(d), cs = UNITS[bx].filter((i) => !grid[i] && (cand[i] & b)); if (cs.length < 2) continue;
    for (const [fn, off] of [[ROW, 0], [COL, 9]]) {
      if (cs.every((i) => fn(i) === fn(cs[0]))) { const s = elimStep('puntamento', UNITS[off + fn(cs[0])].filter((i) => !cs.includes(i) && BOX(i) !== bx - 18).map((i) => [i, b]), cs, bx); if (s) return s; }
    }
  }
  for (let ln = 0; ln < 18; ln++) for (let d = 1; d <= 9; d++) {
    const b = bit(d), cs = UNITS[ln].filter((i) => !grid[i] && (cand[i] & b)); if (cs.length < 2) continue;
    if (cs.every((i) => BOX(i) === BOX(cs[0]))) { const s = elimStep('puntamento', UNITS[18 + BOX(cs[0])].filter((i) => !cs.includes(i)).map((i) => [i, b]), cs, ln); if (s) return s; }
  }
  // naked / hidden subsets
  const subsets = (size, nakedTech, hiddenTech) => {
    for (let u = 0; u < 27; u++) {
      const empty = UNITS[u].filter((i) => !grid[i]); if (empty.length <= size) continue;
      // naked
      const pool = empty.filter((i) => POP[cand[i]] >= 2 && POP[cand[i]] <= size);
      const combo = (arr, k, start, acc, fn) => { if (acc.length === k) return fn(acc); for (let x = start; x < arr.length; x++) { acc.push(arr[x]); const r = combo(arr, k, x + 1, acc, fn); acc.pop(); if (r) return r; } return null; };
      let s = combo(pool, size, 0, [], (cs) => { let m = 0; for (const i of cs) m |= cand[i]; if (POP[m] !== size) return null; return elimStep(nakedTech, empty.filter((i) => !cs.includes(i)).map((i) => [i, m]), cs.slice(), u); });
      if (s) return s;
      // hidden
      const placed = UNITS[u].reduce((m, i) => (grid[i] ? m | bit(grid[i]) : m), 0);
      const ds = []; for (let d = 1; d <= 9; d++) if (!(placed & bit(d))) { const n = empty.filter((i) => cand[i] & bit(d)).length; if (n >= 2 && n <= size) ds.push(d); }
      s = combo(ds, size, 0, [], (dd) => { const dm = dd.reduce((m, d) => m | bit(d), 0); const cs = empty.filter((i) => cand[i] & dm); if (cs.length !== size) return null; return elimStep(hiddenTech, cs.map((i) => [i, ~dm & 511]), cs, u); });
      if (s) return s;
    }
    return null;
  };
  let s = subsets(2, 'coppia', 'coppiaN'); if (s) return s;
  if (maxLevel < 3) return null;
  s = subsets(3, 'tripla', 'triplaN'); if (s) return s;
  // fish: X-Wing (2) and Swordfish (3), rows -> cols and cols -> rows
  for (const size of [2, 3]) for (const base of [0, 9]) for (let d = 1; d <= 9; d++) {
    const b = bit(d), lines = [];
    for (let l = 0; l < 9; l++) { const cs = UNITS[base + l].filter((i) => !grid[i] && (cand[i] & b)); if (cs.length >= 2 && cs.length <= size) lines.push(cs); }
    if (lines.length < size) continue;
    const cross = base === 0 ? COL : ROW, coff = base === 0 ? 9 : 0;
    const pick = (start, acc) => {
      if (acc.length === size) {
        const cx = new Set(acc.flat().map(cross)); if (cx.size !== size) return null;
        const inSet = new Set(acc.flat()), el = [];
        for (const c of cx) for (const i of UNITS[coff + c]) if (!inSet.has(i) && !grid[i] && (cand[i] & b)) el.push([i, b]);
        return el.length ? { tech: size === 2 ? 'xwing' : 'swordfish', elim: el, cells: [...inSet] } : null;
      }
      for (let x = start; x < lines.length; x++) { acc.push(lines[x]); const r = pick(x + 1, acc); acc.pop(); if (r) return r; }
      return null;
    };
    s = pick(0, []); if (s) return s;
  }
  // XY-Wing
  const bi = []; for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 2) bi.push(i);
  const sees = (a, b) => ROW(a) === ROW(b) || COL(a) === COL(b) || BOX(a) === BOX(b);
  for (const p of bi) {
    const [x, y] = digitsOf(cand[p]);
    for (const a of bi) { if (a === p || !sees(p, a)) continue; const ma = cand[a]; if (!(ma & bit(x)) || (ma & bit(y))) continue; const z = digitsOf(ma & ~bit(x))[0];
      for (const c of bi) { if (c === p || c === a || !sees(p, c)) continue; if (cand[c] !== (bit(y) | bit(z))) continue;
        const el = []; for (let i = 0; i < 81; i++) if (!grid[i] && i !== a && i !== c && i !== p && sees(i, a) && sees(i, c) && (cand[i] & bit(z))) el.push([i, bit(z)]);
        if (el.length) return { tech: 'ywing', elim: el, cells: [p, a, c] };
      }
    }
  }
  return null;
}
export function applyStep(grid, cand, st) {
  if (st.place) { const [i, d] = st.place; grid[i] = d; cand[i] = 0; for (const j of PEERS[i]) cand[j] &= ~bit(d); }
  if (st.elim) for (const [i, m] of st.elim) cand[i] &= ~m;
}
export function grade(puzzle, maxLevel = 3) {
  const g = puzzle.slice(), cand = candidates(g);
  let level = 1, steps = 0; const used = {};
  for (let guard = 0; guard < 2000; guard++) {
    if (g.every((v) => v)) return { level, solved: true, steps, used };
    const st = findStep(g, cand, maxLevel);
    if (!st) return { level: 4, solved: false, steps, used };
    level = Math.max(level, TLEVEL[st.tech]); used[st.tech] = (used[st.tech] || 0) + 1; steps++;
    applyStep(g, cand, st);
  }
  return { level: 4, solved: false, steps, used };
}

// ------------------------------------------------------------------ generator
// Carves a random full grid (symmetric pairs, random order) keeping one solution; then grades it and
// keeps the first puzzle whose hardest technique matches the difficulty. Deterministic per seed.
export function generate(seed, diffId = 'medio') {
  const D = DIFF[diffId] || DIFF.medio, rnd = mulberry32(seed ^ 0x5eed);
  let best = null;
  for (let attempt = 0; attempt < 240; attempt++) {
    const sol = fullGrid(rnd), p = sol.slice();
    const minG = D.givens[1] > 34 || D.id === 'medio' ? D.givens[0] + Math.floor(rnd() * (D.givens[1] - D.givens[0] + 1)) : 17;
    let givens = 81;
    const order = shuffle(Array.from({ length: 41 }, (_, i) => i), rnd);
    for (const i of order) {
      const j = 80 - i, n = i === j ? 1 : 2;
      if (givens - n < minG) continue;
      const a = p[i], b = p[j]; p[i] = 0; p[j] = 0;
      if (countSolutions(p, 2) !== 1) { p[i] = a; p[j] = b; } else givens -= n;
    }
    if (givens > D.givens[1] && D.level > 1) continue;
    const gr = grade(p);
    const lvlOk = D.level === 1 ? gr.level === 1 : gr.level === D.level;
    const out = { puzzle: p, solution: sol, diff: D.id, level: gr.level, givens, seed, attempt };
    if (lvlOk) return out;
    // keep the closest one, in case nothing matched (very unlikely)
    if (!best || Math.abs(gr.level - D.level) < Math.abs(best.level - D.level)) best = out;
  }
  return best;
}
// Next hint for a player grid: wrong cells first, then the next logical placement.
export function hint(grid, solution) {
  const wrong = []; for (let i = 0; i < 81; i++) if (grid[i] && grid[i] !== solution[i]) wrong.push(i);
  if (wrong.length) return { kind: 'wrong', cells: wrong, text: wrong.length > 1 ? `Ci sono ${wrong.length} numeri sbagliati: li ho segnati.` : 'Questo numero è sbagliato.' };
  const g = grid.slice(), cand = candidates(g);
  let first = null;
  for (let guard = 0; guard < 400; guard++) {
    const st = findStep(g, cand, 3);
    if (!st) break;
    first = first || st;
    if (st.place) {
      const [i, d] = st.place;
      const how = st.tech === 'nudo' ? `${TECH.nudo}: in questa cella può andare solo il ${d}.` : st.tech === 'nascosto' ? `${TECH.nascosto}: nella ${unitName(st.unit)} il ${d} può andare solo qui.` : '';
      const pre = first !== st ? `Prima serve un passaggio avanzato (${TECH[first.tech]}), poi ` : '';
      return { kind: 'place', cell: i, digit: d, tech: st.tech, first: first.tech, text: pre ? `${pre}il ${d} va qui.` : how };
    }
    applyStep(g, cand, st);
  }
  // beyond the techniques: reveal the most constrained cell from the solution
  let best = -1, bn = 10; for (let i = 0; i < 81; i++) if (!grid[i] && cand[i] && POP[cand[i]] < bn) { bn = POP[cand[i]]; best = i; }
  if (best < 0) best = grid.findIndex((v) => !v);
  return best < 0 ? null : { kind: 'place', cell: best, digit: solution[best], tech: 'rivela', text: `Passaggio molto difficile: ti rivelo il ${solution[best]}.` };
}
export const encode = (g) => g.join('');
export const decode = (s) => s.split('').map(Number);
