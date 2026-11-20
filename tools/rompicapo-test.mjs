// Rompicapo unit tests (no browser): node tools/rompicapo-test.mjs
//  · Sudoku: 500 seeds over the 4 difficulties: unique solution (independent count), givens agree with
//    the solution, the grader's level matches the difficulty, determinism, hints walk to the solution
//  · Mahjong: 300 deals over every layout: the construction order replays as a legal game that clears
//    the table, classes pair up, the solver, solvable reshuffles mid-game, plan tracking
//  · Mattoncini: rotation states, SRS wall kicks, 7-bag, hold, hard drop, line clears and scoring,
//    a T-spin double, lock delay, sprint/ultra endings
//  · Unisci: slide/merge rules in all four directions, scoring, no-move detection, determinism
import * as SD from '../src/rompicapo/sudoku.js';
import * as MJ from '../src/rompicapo/mahjong.js';
import { Blocks, SHAPES, kicks, W, H, TYPES } from '../src/rompicapo/blocks.js';
import * as MG from '../src/rompicapo/merge.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL', msg); } };
const section = (s) => console.log(`\n== ${s}`);
const t0 = performance.now();

// ------------------------------------------------------------------ Sudoku
section('Sudoku · 500 semi');
const validFull = (g) => SD.UNITS.every((u) => new Set(u.map((i) => g[i])).size === 9 && u.every((i) => g[i] >= 1 && g[i] <= 9));
// independent brute-force counter (plain backtracking, no bitmasks) for a cross-check
function count2(grid) {
  const g = grid.slice(); let n = 0;
  const okAt = (i, d) => SD.PEERS[i].every((j) => g[j] !== d);
  const rec = () => { const i = g.indexOf(0); if (i < 0) { n++; return n >= 2; } for (let d = 1; d <= 9; d++) if (okAt(i, d)) { g[i] = d; if (rec()) return true; g[i] = 0; } return false; };
  rec(); return n;
}
const levels = {}; let gradeMiss = 0;
for (let s = 1; s <= 500; s++) {
  const diff = SD.DIFFS[s % 4].id, r = SD.generate(s * 7919, diff);
  ok(SD.countSolutions(r.puzzle, 2) === 1, `sudoku ${s} ${diff}: soluzione unica`);
  if (s % 25 === 0) ok(count2(r.puzzle) === 1, `sudoku ${s}: unicità confermata dal contatore indipendente`);
  ok(validFull(r.solution), `sudoku ${s}: soluzione valida`);
  ok(r.puzzle.every((v, i) => !v || v === r.solution[i]), `sudoku ${s}: dati coerenti`);
  ok(r.puzzle.filter(Boolean).length === r.givens && r.givens >= 17, `sudoku ${s}: numero di dati`);
  const want = SD.DIFF[diff].level; if (r.level !== want) gradeMiss++;
  (levels[diff] ||= {})[r.level] = (levels[diff][r.level] || 0) + 1;
  if (diff === 'facile') ok(r.givens >= 36, `sudoku ${s}: facile ha almeno 36 dati`);
}
ok(gradeMiss === 0, `difficoltà graduate per tecnica (${gradeMiss} fuori livello)`);
console.log('livelli per difficoltà:', JSON.stringify(levels));
{ const a = SD.generate(12345, 'difficile'), b = SD.generate(12345, 'difficile'); ok(a.puzzle.join('') === b.puzzle.join(''), 'sudoku deterministico'); }
// the hint system walks any puzzle to its solution
for (const s of [3, 8, 21, 40]) {
  const r = SD.generate(s, SD.DIFFS[s % 4].id), g = r.puzzle.slice(); let n = 0;
  while (g.includes(0) && n < 90) { const h = SD.hint(g, r.solution); if (!h || h.kind !== 'place') break; g[h.cell] = h.digit; n++; }
  ok(g.join('') === r.solution.join(''), `aiuti fino alla soluzione (seme ${s}, ${n} passi)`);
  const wrong = r.puzzle.slice(); const i = wrong.indexOf(0); wrong[i] = (r.solution[i] % 9) + 1;
  ok(SD.hint(wrong, r.solution).kind === 'wrong', 'l’aiuto segnala prima l’errore');
}

// ------------------------------------------------------------------ Mahjong
section('Mahjong · 300 smazzate');
let solved = 0, exhausted = 0;
for (let k = 0; k < 300; k++) {
  const L = MJ.LAYOUTS[k % MJ.LAYOUTS.length], d = MJ.deal(L.id, 1000 + k);
  ok(d.faces.every((f) => f >= 0) && d.faces.length === L.n, `mahjong ${k}: tutte le tessere hanno una faccia`);
  const per = {}; d.faces.forEach((f) => { const c = MJ.classOf(f); per[c] = (per[c] || 0) + 1; });
  ok(Object.values(per).every((n) => n % 2 === 0), `mahjong ${k}: ogni classe in coppie`);
  ok(MJ.validPlan(d.topo, d.pos.map(() => true), d.faces, d.order), `mahjong ${k} (${L.id}): la soluzione di costruzione è una partita valida`);
  ok(MJ.moves(d.topo, d.pos.map(() => true), d.faces).length > 0, `mahjong ${k}: c’è una prima mossa`);
  if (L.n <= 112) {
    const sol = MJ.solve(d.topo, d.pos.map(() => true), d.faces, 60000, 8);
    if (Array.isArray(sol)) { solved++; ok(MJ.validPlan(d.topo, d.pos.map(() => true), d.faces, sol), `mahjong ${k}: soluzione del risolutore valida`); } else exhausted++;
  }
}
console.log(`risolutore indipendente: ${solved} risolte, ${exhausted} oltre il budget (la soluzione di costruzione le dimostra comunque risolvibili)`);
ok(solved >= 0.85 * (solved + exhausted), 'il risolutore trova la soluzione nella grande maggioranza dei casi');
// play a few greedy moves, reshuffle and check a solution exists again; plan tracking follows the player
for (let k = 0; k < 30; k++) {
  const L = MJ.LAYOUTS[k % MJ.LAYOUTS.length], d = MJ.deal(L.id, 50 + k), pr = d.pos.map(() => true);
  let faces = d.faces.slice(), plan = d.order.slice();
  for (let m = 0; m < 6; m++) {
    const ms = MJ.moves(d.topo, pr, faces); if (!ms.length) break;
    const [a, b] = ms[ms.length - 1]; pr[a] = pr[b] = false; plan = MJ.updatePlan(d.topo, pr, faces, plan, a, b) || null;
    if (plan) ok(MJ.validPlan(d.topo, pr, faces, plan), `mahjong piano ${k}: valido dopo la mossa`);
  }
  const r = MJ.reshuffle(d.topo, pr, faces, 77 + k);
  ok(r && MJ.validPlan(d.topo, pr, r.faces, r.plan), `mahjong ${k}: rimescolata risolvibile`);
  const before = {}, after = {}; for (let i = 0; i < pr.length; i++) if (pr[i]) { before[faces[i]] = (before[faces[i]] || 0) + 1; after[r.faces[i]] = (after[r.faces[i]] || 0) + 1; }
  ok(JSON.stringify(Object.entries(before).sort()) === JSON.stringify(Object.entries(after).sort()), `mahjong ${k}: la rimescolata conserva le tessere`);
}
{ const L = MJ.LAYOUT.tartaruga; ok(L.n === 144, 'tartaruga: 144 tessere'); }
for (const L of MJ.LAYOUTS) ok(L.n % 2 === 0, `${L.id}: numero pari di tessere (${L.n})`);
// free-tile rule
{
  const pos = [[0, 0, 0], [2, 0, 0], [4, 0, 0], [2, 0, 1]], topo = MJ.topology(pos), pr = [true, true, true, true];
  ok(MJ.isFree(topo, pr, 0) && MJ.isFree(topo, pr, 2), 'tessere ai lati libere');
  ok(!MJ.isFree(topo, pr, 1), 'tessera in mezzo e coperta bloccata');
  ok(MJ.isFree(topo, pr, 3), 'tessera in cima libera');
  pr[3] = false; ok(!MJ.isFree(topo, pr, 1), 'scoperta ma con due vicini: bloccata');
  pr[0] = false; ok(MJ.isFree(topo, pr, 1), 'scoperta e un lato libero: libera');
}

// ------------------------------------------------------------------ Mattoncini
section('Mattoncini');
const key = (cells) => cells.map(([x, y]) => `${x},${y}`).sort().join(' ');
ok(key(SHAPES.T[1]) === key([[1, 0], [1, 1], [2, 1], [1, 2]]), 'T: stato R');
ok(key(SHAPES.T[2]) === key([[0, 1], [1, 1], [2, 1], [1, 2]]), 'T: stato 2');
ok(key(SHAPES.T[3]) === key([[1, 0], [0, 1], [1, 1], [1, 2]]), 'T: stato L');
ok(key(SHAPES.I[1]) === key([[2, 0], [2, 1], [2, 2], [2, 3]]), 'I: stato R');
ok(key(SHAPES.I[2]) === key([[0, 2], [1, 2], [2, 2], [3, 2]]), 'I: stato 2');
ok(key(SHAPES.S[1]) === key([[1, 0], [1, 1], [2, 1], [2, 2]]), 'S: stato R');
ok(key(SHAPES.Z[1]) === key([[2, 0], [1, 1], [2, 1], [1, 2]]), 'Z: stato R');
ok(key(SHAPES.J[1]) === key([[1, 0], [2, 0], [1, 1], [1, 2]]), 'J: stato R');
ok(key(SHAPES.L[1]) === key([[1, 0], [1, 1], [1, 2], [2, 2]]), 'L: stato R');
ok(SHAPES.O.every((r) => key(r) === key(SHAPES.O[0])), 'O non cambia ruotando');
ok(JSON.stringify(kicks('T', 0, 1)) === JSON.stringify([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]), 'tabella SRS JLSTZ 0→R (y verso il basso)');
ok(JSON.stringify(kicks('I', 0, 1)) === JSON.stringify([[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]]), 'tabella SRS I 0→R');
const blank = (o = {}) => { const b = new Blocks({ seed: 7, ...o }); b.board = Array.from({ length: H }, () => new Array(W).fill(0)); return b; };
// four full rotations bring a piece back where it started (free space)
for (const t of TYPES) { const b = blank(); b.cur = { t, r: 0, x: 3, y: 8 }; const s0 = key(b.cells()); for (let k = 0; k < 4; k++) b.rotate(1); ok(key(b.cells()) === s0 && b.cur.r === 0, `${t}: 4 rotazioni tornano all’inizio`); for (let k = 0; k < 4; k++) b.rotate(-1); ok(key(b.cells()) === s0, `${t}: anche all’indietro`); }
// wall kick: vertical I against the left wall rotating to flat needs the +1 kick
{ const b = blank(); b.cur = { t: 'I', r: 3, x: -1, y: 5 }; ok(b.fits(b.cur), 'I verticale contro il muro'); ok(b.rotate(1) && b.cur.r === 0 && b.cur.x === 0 && b.lastKick === 1, `kick dal muro sinistro (x=${b.cur.x}, kick ${b.lastKick})`); }
{ const b = blank(); b.cur = { t: 'I', r: 1, x: 7, y: 5 }; ok(b.fits(b.cur), 'I verticale contro il muro destro'); ok(b.rotate(-1) && b.cur.r === 0 && b.cells().every(([x]) => x >= 0 && x < W), 'kick dal muro destro'); }
{ const b = blank(); b.cur = { t: 'T', r: 0, x: 3, y: 20 }; ok(b.fits(b.cur), 'T sul fondo'); ok(b.rotate(1) && b.cells().every(([, y]) => y < H), 'kick verso l’alto sul fondo'); }
{ const b = blank(); for (let x = 0; x < W; x++) if (x !== 4 && x !== 5) { b.board[10][x] = 1; b.board[8][x] = 1; } b.cur = { t: 'O', r: 0, x: 3, y: 9 }; ok(!b.rotate(1) || b.cur.x === 3, 'O non scalcia'); }
// a blocked rotation fails and leaves the piece alone
{ const b = blank(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.board[y][x] = 1; for (const [x, y] of [[3, 10], [4, 10], [5, 10], [4, 9]]) b.board[y][x] = 0; b.cur = { t: 'T', r: 0, x: 3, y: 9 }; ok(b.fits(b.cur), 'T incastrata'); const s = JSON.stringify(b.cur); ok(!b.rotate(1) && JSON.stringify(b.cur) === s, 'rotazione impossibile rifiutata'); }
// 7-bag
{ const b = new Blocks({ seed: 99 }); const seq = [b.cur.t, ...b.queue]; for (let i = 0; i < 30; i++) { b.queue.shift(); b.fill(); seq.push(b.queue[b.queue.length - 1]); } for (let k = 0; k + 7 <= 28; k += 7) ok(new Set(seq.slice(k, k + 7)).size === 7, `sacchetto ${k / 7 + 1}: sette pezzi diversi`); }
{ const a = new Blocks({ seed: 5 }), b = new Blocks({ seed: 5 }); ok(a.cur.t + a.queue.join('') === b.cur.t + b.queue.join(''), 'sequenza deterministica per seme'); }
// line clears and scoring
{
  const b = blank(); for (const y of [18, 19, 20, 21]) for (let x = 0; x < W; x++) if (x !== 9) b.board[y][x] = 2;
  b.cur = { t: 'I', r: 1, x: 7, y: 2 }; const d = b.hardDrop();
  ok(b.lines === 4, `quadrupla: 4 linee (${b.lines})`); ok(b.score === 800 + 2000 + 2 * d, `quadrupla: 800 punti + tavola pulita 2000 + caduta (${b.score})`);
  ok(b.board.every((row) => row.every((c) => !c)) && b.stats.perfect === 1, 'tavola pulita riconosciuta');
}
{
  const b = blank(); for (let x = 0; x < W; x++) if (x < 3 || x > 6) b.board[21][x] = 3;
  b.cur = { t: 'I', r: 0, x: 3, y: 5 }; b.hardDrop(); ok(b.lines === 1 && b.board[21].every((c) => !c) === true, 'singola: la riga scende');
  ok(b.combo === 0, 'combo parte da 0');
}
// T-spin double
{
  const b = blank(); for (let x = 0; x < W; x++) { if (x !== 4) b.board[21][x] = 1; if (x < 3 || x > 5) b.board[20][x] = 1; } b.board[19][5] = 1;
  b.cur = { t: 'T', r: 1, x: 3, y: 19 }; ok(b.fits(b.cur), 'T pronta per lo spin');
  ok(b.rotate(1) && b.cur.r === 2, 'T ruota nella fessura'); b.drain(); b.hardDrop();
  const ev = b.drain().find((e) => e.e === 'lock');
  ok(ev && ev.ts === 2 && ev.n === 2 && ev.pts === 1200, `T-spin doppia: ${JSON.stringify(ev && { ts: ev.ts, n: ev.n, pts: ev.pts })}`);
}
// hold: once per piece, swaps back
{ const b = new Blocks({ seed: 3 }); const t1 = b.cur.t; ok(b.doHold() && b.hold === t1, 'tieni il pezzo'); ok(!b.doHold(), 'una volta sola per pezzo'); b.hardDrop(); const t2 = b.cur.t; ok(b.doHold() && b.cur.t === t1 && b.hold === t2, 'scambio col pezzo tenuto'); }
// gravity + lock delay
{ const b = blank(); b.cur = { t: 'O', r: 0, x: 3, y: 18 }; b.lowest = 18; b.tick(1100); ok(b.cur.y === 19 || b.cur.y === 20, 'la gravità fa scendere'); b.tick(2000); ok(b.pieces === 0 || b.board[21].some(Boolean), 'arriva sul fondo'); b.tick(600); ok(b.pieces === 1, 'si blocca dopo il ritardo'); }
// das
{ const b = blank(); b.cur = { t: 'T', r: 0, x: 3, y: 5 }; b.press('left'); ok(b.cur.x === 2, 'un passo subito'); b.tick(400); ok(b.cur.x === 0, 'auto-ripetizione fino al muro'); b.release('left'); }
// sprint and ultra end
{ const b = new Blocks({ seed: 1, mode: 'sprint' }); b.lines = 39; b.board = Array.from({ length: H }, () => new Array(W).fill(0)); for (let x = 0; x < W; x++) if (x < 3 || x > 6) b.board[21][x] = 1; b.cur = { t: 'I', r: 0, x: 3, y: 4 }; b.hardDrop(); ok(b.over && b.won && b.lines === 40, 'sprint finisce a 40 linee'); }
{ const b = new Blocks({ seed: 1, mode: 'ultra' }); for (let i = 0; i < 130; i++) { b.tick(1000); if (b.over) break; if (b.cur && b.pieces % 2 === 0) b.hardDrop(); } ok(b.over && b.time === 120000 || (b.over && !b.won), `ultra finisce a 2 minuti (${b.time})`); }
// level up every 10 lines in marathon
{ const b = new Blocks({ seed: 1 }); b.lines = 9; b.board = Array.from({ length: H }, () => new Array(W).fill(0)); for (let x = 0; x < W; x++) if (x < 3 || x > 6) b.board[21][x] = 1; b.cur = { t: 'I', r: 0, x: 3, y: 4 }; b.hardDrop(); ok(b.level === 2, 'livello 2 dopo 10 linee'); }
// top out
{ const b = new Blocks({ seed: 1 }); for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) if (x !== y % W) b.board[y][x] = 1; b.hardDrop(); ok(b.over && !b.won, 'pila fino in cima: fine partita'); }

// ------------------------------------------------------------------ Unisci
section('Unisci');
const line = (vals, dir) => { const b = MG.fromValues(vals); const r = MG.move(b, dir, { noSpawn: true }); return { v: MG.values(b), r, b }; };
{ const { v, r } = line([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left'); ok(v.slice(0, 4).join() === '4,4,0,0' && r.gained === 8, '2 2 2 2 → 4 4'); }
{ const { v } = line([2, 2, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left'); ok(v.slice(0, 4).join() === '4,8,0,0', '2 2 4 4 → 4 8'); }
{ const { v } = line([4, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left'); ok(v.slice(0, 4).join() === '8,0,0,0', '4 . . 4 → 8'); }
{ const { v } = line([2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left'); ok(v.slice(0, 4).join() === '4,2,0,0', '2 2 2 → 4 2 (una sola unione per tessera)'); }
{ const { v } = line([2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'right'); ok(v.slice(0, 4).join() === '0,0,2,4', '2 2 2 → destra: 2 4'); }
{ const { v } = line([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0], 'up'); ok([v[0], v[4], v[8], v[12]].join() === '4,8,0,0', 'colonna verso l’alto'); }
{ const { v } = line([2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0], 'down'); ok([v[0], v[4], v[8], v[12]].join() === '0,0,4,4', 'colonna verso il basso'); }
{ const { r } = line([2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'left'); ok(!r.moved, 'nessuno spostamento: mossa nulla'); }
{ const b = MG.fromValues([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]); ok(!MG.canMove(b) && b.over, 'tavola piena senza unioni: fine'); }
{ const b = MG.fromValues([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 4]); ok(MG.canMove(b), 'una coppia vicina: si continua'); }
{ const b = MG.newBoard(4, 42); ok(MG.values(b).filter(Boolean).length === 2, 'si parte con due tessere'); const r = MG.move(b, 'left'); if (r.moved) ok(r.spawn && MG.values(b).filter(Boolean).length >= 2, 'dopo una mossa ne nasce una'); }
{ const a = MG.newBoard(5, 9), b = MG.newBoard(5, 9); for (const d of ['left', 'up', 'right', 'down', 'left', 'down']) { MG.move(a, d); MG.move(b, d); } ok(MG.values(a).join() === MG.values(b).join(), 'nascite deterministiche per seme'); }
{ let maxv = 0; for (let s = 1; s <= 20; s++) { const b = MG.newBoard(4, s); let n = 0; while (!b.over && n++ < 3000) { const d = MG.suggest(b) || 'left'; MG.move(b, d); } maxv = Math.max(maxv, b.max); ok(b.over || n >= 3000, `partita automatica ${s} termina`); ok(MG.values(b).reduce((a, v) => a + v, 0) > 0, 'tessere sommate'); } ok(maxv >= 512, `il suggeritore arriva almeno al 512 (${maxv})`); }

console.log(`\n${checks - fails}/${checks} controlli ok · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
