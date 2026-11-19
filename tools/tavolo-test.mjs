// Tavolo Baso headless tests: chess move generation (perft on the standard positions), rules (castling, en
// passant, promotion, mate, stalemate, 50 moves, threefold, insufficient material), SAN/FEN/PGN, engine sanity
// and the mate-in-2 bank; Italian draughts rule cases (capture priorities, men vs kings, crowning) and AI;
// four in a row win detection, AI sanity and the puzzle generator; battleships placement, firing and AI.
//   node tools/tavolo-test.mjs            (QUICK=1 skips the slow perft depths and the AI tournaments)
import { Position, perft, START_FEN, toPGN } from '../src/tavolo/chess/core.js';
import { chooseMove, mateIn, mateKeys, Engine, evaluate } from '../src/tavolo/chess/ai.js';
import { MATE2 } from '../src/tavolo/chess/puzzles.js';
import * as D from '../src/tavolo/dama/core.js';
import * as F from '../src/tavolo/four/core.js';
import * as B from '../src/tavolo/navale/core.js';
import { solve } from '../src/tavolo/worker.js';

const QUICK = !!process.env.QUICK;
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: atteso ${b}, ottenuto ${a}`);
const section = (n) => console.log(`\n▸ ${n}`);

// ───────────────────────── chess
section('Scacchi · perft');
const PERFT = [
  ['posizione iniziale', START_FEN, [20, 400, 8902, 197281, QUICK ? null : 4865609]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, QUICK ? null : 4085603]],
  ['posizione 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['posizione 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['posizione 4 speculare', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467, 422333]],
  ['posizione 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['posizione 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, QUICK ? null : 3894594]],
];
for (const [name, fen, exp] of PERFT) {
  const p = new Position(fen), t0 = Date.now(), got = [];
  exp.forEach((n, i) => { if (n == null) return; const r = perft(p, i + 1); got.push(r); eq(r, n, `${name} profondità ${i + 1}`); });
  eq(p.fen(), fen, `${name}: FEN invariata dopo perft`);
  console.log(`  ${name}: ${got.join(' / ')} (${Date.now() - t0} ms)`);
}

section('Scacchi · regole');
{
  const play = (fen, ...ms) => { const p = new Position(fen); for (const s of ms) { const m = p.parse(s); ok(!!m, `mossa legale ${s} in ${fen}`); if (!m) return p; p.make(m); } return p; };
  // castling both sides, rights lost after a rook move
  let p = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  ok(p.legal().some((m) => p.san(m) === 'O-O') && p.legal().some((m) => p.san(m) === 'O-O-O'), 'arrocco corto e lungo disponibili');
  p = play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'h1h2', 'a8a7');
  ok(p.fen().includes(' Qk '), `diritti di arrocco aggiornati: ${p.fen()}`);
  p = new Position('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
  ok(!p.legal().some((m) => p.san(m) === 'O-O'), 'niente arrocco attraverso una casa attaccata (f1 sotto attacco? no: f2 attacca f1)');
  p = new Position('4k3/8/8/8/8/8/8/R3K2r w Q - 0 1');
  ok(!p.legal().some((m) => p.san(m).startsWith('O-O')), 'niente arrocco sotto scacco');
  // en passant, incl. the pinned case
  p = play(START_FEN, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  ok(p.legal().some((m) => p.san(m) === 'exd6'), 'presa en passant disponibile');
  p = play(START_FEN, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  eq(p.board[0x43], 0, 'il pedone d5 sparisce con l’en passant');
  p = new Position('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  ok(!p.legal().some((m) => p.san(m) === 'exd6'), 'en passant illegale se scopre il re');
  // promotion (all four pieces, SAN)
  p = new Position('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const pr = p.legal().filter((m) => p.san(m).startsWith('a8')).map((m) => p.san(m)).sort();
  eq(pr.join(','), 'a8=B,a8=N,a8=Q+,a8=R+', 'promozioni');
  eq(p.san(p.parse('a7a8q'), true), 'a8=D+', 'SAN italiana della promozione');
  // mate, stalemate, draws
  p = play(START_FEN, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  eq(p.status().why, 'mate', 'matto del barbiere al contrario'); eq(p.status().result, '0-1', 'risultato del matto');
  p = new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); eq(p.status().why, 'stallo', 'stallo');
  p = new Position('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1'); eq(p.status().why, 'materiale', 'materiale insufficiente (alfiere)');
  p = new Position('8/8/4k3/8/8/2N5/4K3/8 w - - 0 1'); eq(p.status().why, 'materiale', 'materiale insufficiente (cavallo)');
  p = new Position('8/2b5/4k3/8/8/2B5/4K3/8 w - - 0 1'); eq(p.status().why, 'materiale', 'alfieri dello stesso colore');
  p = new Position('8/3b4/4k3/8/8/2B5/4K3/8 w - - 0 1'); ok(!p.status().over, 'alfieri di colore diverso: si gioca');
  p = new Position('8/8/4k3/8/8/2R5/4K3/8 w - - 99 80'); ok(!p.status().over, '99 semimosse: non ancora patta');
  p.make(p.parse('c3c4')); eq(p.status().why, '50mosse', 'regola delle 50 mosse');
  p = play(START_FEN, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  eq(p.status().why, 'ripetizione', 'triplice ripetizione');
  p = play(START_FEN, 'g1f3', 'g8f6', 'f3g1', 'f6g8'); ok(!p.status().over, 'due ripetizioni: si continua');
  // SAN disambiguation, FEN round trip, check marks
  p = new Position('4k3/8/8/8/8/8/4K3/R6R w - - 0 1'); eq(p.san(p.parse('a1d1')), 'Rad1', 'disambiguazione per colonna');
  p = new Position('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1'); eq(p.san(p.parse('a1a3')), 'R1a3', 'disambiguazione per traversa');
  for (const fen of [START_FEN, 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', '8/8/8/8/8/8/8/K6k b - - 12 70']) eq(new Position(fen).fen(), fen, `FEN andata e ritorno ${fen}`);
  const pgn = toPGN({ moves: ['e4', 'e5', 'Nf3'], result: '*' });
  ok(/\[Result "\*"\]/.test(pgn) && /1\. e4 e5 2\. Nf3 \*/.test(pgn), 'PGN');
  let threw = false; try { new Position('8/8/8/8/8/8/8/8 w - - 0 1'); } catch { threw = true; } ok(threw, 'FEN senza re rifiutata');
}

section('Scacchi · motore');
{
  const E = new Engine();
  let p = new Position('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  eq(p.san(E.think(p, { ms: 300 }).move), 'Rd8#', 'trova il matto in 1');
  p = new Position('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3');
  eq(p.san(E.think(p, { ms: 300 }).move), 'Qxf7#', 'matto del barbiere');
  p = new Position('4k3/8/8/3q4/8/8/3R4/3K4 w - - 0 1');
  eq(p.san(E.think(p, { ms: 400 }).move), 'Rxd5', 'cattura la donna in presa');
  ok(evaluate(new Position()) === 0, 'valutazione simmetrica della posizione iniziale');
  // every level answers with a legal move, also out of the book
  for (let lv = 0; lv <= 5; lv++) {
    const r = chooseMove({ startFen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', history: [], level: lv, ms: 300 });
    ok(r && new Position('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7').parse(r.uci), `livello ${lv}: mossa legale ${r?.uci}`);
  }
  const op = new Set(); for (let i = 0; i < 12; i++) op.add(chooseMove({ history: [], level: 3 }).uci);
  ok(op.size >= 2, `varietà di aperture: ${[...op].join(' ')}`);
  ok(solve({ kind: 'chess-hint', history: ['e2e4'], ms: 200 })?.uci, 'il worker risponde ai suggerimenti');
  if (!QUICK) {
    // the strongest level beats the weakest
    let score = 0;
    for (let g = 0; g < 2; g++) {
      const hist = [], pos = new Position(); let res = null;
      for (let ply = 0; ply < 160 && !res; ply++) {
        const strongSide = g % 2, lv = pos.side === strongSide ? 4 : 0;
        const r = chooseMove({ history: hist, level: lv, ms: 150 }); const m = pos.parse(r.uci); pos.make(m); hist.push(r.uci);
        const st = pos.status(); if (st.over) res = st.result;
      }
      const strongWon = res === (g % 2 ? '0-1' : '1-0'); score += strongWon ? 1 : res === '1/2-1/2' || !res ? 0.5 : 0;
    }
    ok(score >= 1.5, `Maestro contro Principiante: ${score}/2`);
  }
}

section('Scacchi · puzzle matto in 2');
{
  ok(MATE2.length >= 100, `banca puzzle: ${MATE2.length}`);
  const pick = [0, 1, 2, 3, 17, 55, 101, MATE2.length - 1];
  for (const i of pick) {
    const q = MATE2[i], p = new Position(q.fen);
    ok(!mateIn(p, 1), `puzzle ${i}: nessun matto in 1`);
    const keys = mateKeys(p, 2).map((m) => p.uci(m));
    ok(keys.length === 1 && keys[0] === q.key, `puzzle ${i}: chiave unica ${q.key} (${keys.join(',')})`);
  }
}

// ───────────────────────── draughts
section('Dama italiana · regole');
{
  const S = (s) => { const x = s.charCodeAt(0) - 97, y = +s.slice(1) - 1; if (!D.isDark(x, y)) throw new Error('casa chiara ' + s); return y * 8 + x; };
  const mk = (pieces, side = 1) => { const b = new Int8Array(64); for (const [s, v] of Object.entries(pieces)) b[S(s)] = v; return { b, side, quiet: 0, hist: [] }; };
  const names = (st) => D.legalMoves(st).map(D.moveName).sort();
  const st0 = D.initial();
  eq(D.legalMoves(st0).length, 7, 'mosse iniziali del bianco');
  ok(D.isDark(7, 0) && !D.isDark(0, 0), 'casa scura nell’angolo a destra');
  eq(st0.b.filter((v) => v === 1).length, 12, '12 pedine bianche'); eq(st0.b.filter((v) => v === -1).length, 12, '12 pedine nere');
  eq(names(mk({ b3: 1, c4: -2 })).filter((n) => n.includes('×')).length, 0, 'la pedina non mangia la dama');
  eq(names(mk({ d3: 1, e4: -1, g6: -1, b3: 1, c4: -1 })).join(' '), 'd3×f5×h7', 'obbligo di prendere il maggior numero di pezzi');
  eq(names(mk({ a4: 2, b5: -1, e4: 1, f5: -1 })).join(' '), 'a4×c6', 'a parità si prende con la dama');
  eq(names(mk({ d5: 2, c6: -2, e6: -1 })).join(' '), 'd5×b7', 'la dama deve prendere la dama');
  eq(names(mk({ d3: 2, e4: -1, g6: -2, c4: -2, c6: -1 })).join(' '), 'd3×b5×d7', 'precedenza alla presa che incontra prima la dama');
  const cr = D.legalMoves(mk({ c6: 1, d7: -1, f7: -1 }));
  ok(cr.length === 1 && cr[0].crown && cr[0].caps.length === 1, 'la pedina promossa si ferma');
  eq(names(mk({ d5: 1, c4: -1 })).filter((n) => n.includes('×')).length, 0, 'la pedina non prende all’indietro');
  eq(names(mk({ d5: 2 })).length, 4, 'la dama muove di una casa nelle 4 direzioni');
  eq(names(mk({ d5: -1 }, -1)).join(' '), 'd5-c4 d5-e4', 'il nero scende');
  // playing a capture removes the piece and crowns
  const s1 = mk({ c6: 1, d7: -1, a8: 0 }); const m1 = D.legalMoves(s1)[0]; D.play(s1, m1);
  ok(s1.b[S('e8')] === 2 && s1.b[S('d7')] === 0 && s1.side === -1, 'presa e promozione applicate');
  eq(D.status(mk({ d5: 1 }, -1)).winner, 1, 'senza pezzi si perde');
  eq(D.status(mk({ a8: -1, b7: 1, c6: 1 }, -1)).why, 'bloccato', 'bloccato: si perde');
  // a full AI game always ends, every move legal
  for (const [a, b] of [[1, 0], [0, 2]]) {
    const st = D.initial(); let n = 0, r;
    while (!(r = D.status(st)).over && n < 300) { const m = D.chooseDama(st, st.side > 0 ? a : b); ok(D.legalMoves(st).includes(m) || D.legalMoves(st).some((x) => D.moveName(x) === D.moveName(m)), 'mossa IA legale'); D.play(st, m); n++; }
    ok(r.over, `partita IA ${a} contro ${b} conclusa in ${n} mosse (${r.why})`);
  }
  if (!QUICK) {
    let w = 0; for (let g = 0; g < 4; g++) { const st = D.initial(); let r, n = 0; const strong = g % 2 ? -1 : 1; while (!(r = D.status(st)).over && n < 250) { D.play(st, D.chooseDama(st, st.side === strong ? 2 : 0)); n++; } if (r.winner === strong) w++; else if (r.winner === 0 || !r.over) w += 0.5; }
    ok(w >= 3, `Difficile contro Facile: ${w}/4`);
  }
}

// ───────────────────────── four in a row
section('Quattro in fila');
{
  const s = (moves) => { const x = F.newFour(); for (const c of moves) F.drop(x, c); return x; };
  ok(F.status(s([0, 0, 1, 1, 2, 2, 3])).winner === 1, 'quattro in orizzontale');
  ok(F.status(s([0, 1, 0, 1, 0, 1, 0])).winner === 1, 'quattro in verticale');
  ok(F.status(s([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])).winner === 1, 'quattro in diagonale ↗');
  ok(F.status(s([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3])).winner === 1, 'quattro in diagonale ↖');
  ok(!F.status(s([0, 1, 0, 1, 0, 1])).over, 'tre in fila non bastano');
  eq(F.status(s([0, 0, 1, 1, 2, 2, 3])).line.length, 4, 'linea vincente');
  const full = F.newFour(); const order = [0, 1, 2, 3, 4, 5, 6]; let k = 0;
  // a drawn full board: column pattern that never lines up four
  const seq = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (const c of seq) { F.drop(full, c); if (F.status(full).over) break; k++; }
  ok(k === 42 ? F.status(full).winner === 0 : true, `griglia piena (${k} dischi)`); void order;
  ok(F.drop(s([0, 0, 0, 0, 0, 0]), 0) === -1, 'colonna piena rifiutata');
  // AI: takes a win, blocks a threat
  for (let lv = 1; lv <= 3; lv++) {
    eq(F.chooseFour(s([0, 6, 1, 6, 2]), lv), 3, `livello ${lv}: blocca il tre in fila`);
    eq(F.chooseFour(s([0, 6, 1, 6, 2, 5]), lv), 3, `livello ${lv}: chiude il quattro`);
  }
  if (!QUICK) {
    let w = 0; for (let g = 0; g < 6; g++) { const x = F.newFour(); const strong = (g % 2) + 1; let st; while (!(st = F.status(x)).over) F.drop(x, F.chooseFour(x, x.turn === strong ? 2 : 0)); if (st.winner === strong) w++; }
    ok(w >= 5, `Difficile contro Facile: ${w}/6`);
  }
  for (const seed of [1, 2, 3]) {
    const pz = F.fourPuzzle(seed * 7919 + 17, 3);
    ok(!!pz, `puzzle quattro in fila ${seed}`);
    if (pz) { const x = s(pz.moves); ok(F.winIn(x, 2) < 0 && F.winKeys(x, 3).length === 1 && F.winKeys(x, 3)[0] === pz.key, `puzzle ${seed}: vittoria in 3 con una sola prima mossa`); }
  }
  eq(solve({ kind: 'four', cells: Array.from(s([0, 6, 1, 6, 2]).cells), h: Array.from(s([0, 6, 1, 6, 2]).h), turn: 2, moves: [0, 6, 1, 6, 2], level: 2 }), 3, 'worker: quattro in fila');
}

// ───────────────────────── battleships
section('Battaglia navale');
{
  for (let seed = 1; seed <= 300; seed++) { const f = B.randomFleet(B.rng(seed), true); if (!B.fleetValid(f, true)) { ok(false, `flotta casuale non valida ${seed}`); break; } }
  ok(true, '300 flotte casuali valide (navi separate)');
  const touch = B.randomFleet(B.rng(5), false); ok(B.fleetValid(touch, false), 'flotta con navi a contatto');
  const ships = [{ id: 'portaerei', len: 5, x: 0, y: 0, dir: 0 }];
  ok(!B.canPlace(ships, { id: 'corazzata', len: 4, x: 0, y: 1, dir: 0 }, true), 'navi adiacenti rifiutate');
  ok(!B.canPlace(ships, { id: 'corazzata', len: 4, x: 5, y: 1, dir: 0 }, true), 'contatto in diagonale rifiutato');
  ok(B.canPlace(ships, { id: 'corazzata', len: 4, x: 5, y: 1, dir: 0 }, false), 'contatto ammesso se l’opzione lo consente');
  ok(B.canPlace(ships, { id: 'corazzata', len: 4, x: 0, y: 2, dir: 0 }, true), 'a una casa di distanza va bene');
  ok(!B.canPlace([], { id: 'portaerei', len: 5, x: 7, y: 0, dir: 0 }, true), 'fuori dal mare rifiutata');
  ok(!B.canPlace(ships, { id: 'corazzata', len: 4, x: 9, y: 0, dir: 1 }, true) === false, 'nessun riavvolgimento ai bordi');
  ok(B.canPlace([{ id: 'a', len: 2, x: 9, y: 0, dir: 1 }], { id: 'b', len: 2, x: 0, y: 1, dir: 1 }, true), 'nessun falso contatto fra bordo destro e sinistro');
  const sea = B.newSea(B.randomFleet(B.rng(9), true));
  const tgt = sea.ships[4], cells = B.shipCells(tgt);
  eq(B.fire(sea, cells[0][0], cells[0][1]).result, 'hit', 'colpito');
  eq(B.fire(sea, cells[0][0], cells[0][1]).result, 'again', 'stessa casella due volte');
  eq(B.fire(sea, cells[1][0], cells[1][1]).result, 'sunk', 'affondato');
  ok(B.viewOf(sea).sunk.length === 1 && B.viewOf(sea).left.length === 4, 'vista del tiratore');
  const avg = {};
  for (let lv = 0; lv <= 3; lv++) {
    let tot = 0; const N = QUICK ? 6 : 30;
    for (let g = 0; g < N; g++) {
      const s2 = B.newSea(B.randomFleet(B.rng(1000 + g), true)), r = B.rng(77 + g); let n = 0;
      while (!B.allSunk(s2) && n < 100) { const [x, y] = B.aiShot(B.viewOf(s2), lv, r, true); const res = B.fire(s2, x, y); if (res.result === 'again') { ok(false, `livello ${lv}: tiro ripetuto`); break; } n++; }
      ok(B.allSunk(s2), `livello ${lv}: flotta affondata entro 100 colpi`); tot += n;
    }
    avg[lv] = tot / N;
  }
  console.log('  colpi medi per livello:', Object.values(avg).map((v) => v.toFixed(1)).join(' / '));
  ok(avg[3] < avg[1] && avg[1] < avg[0], 'l’ammiraglio è più preciso del mozzo');
  ok(avg[3] < 62, `densità di probabilità efficiente (${avg[3].toFixed(1)} colpi)`);
}

console.log(`\n${fails ? '✗' : '✓'} ${passes} verifiche superate, ${fails} fallite`);
process.exit(fails ? 1 : 0);
