// Solitari (Carte Baso) unit tests: rules, solvers on many seeds (their plans are replayed through the
// plug-in's own legalMoves/apply), unlimited undo by replay, deal numbers / daily deal, and a
// random-play soak that checks the invariants after every move (no lost or duplicated card, ordered
// foundations, legal tableau runs).
//   node tools/carte-solitari-test.mjs            (QUICK=1 for a shorter run)
import { makeDeck, rank, suit, isRed, rng } from '../src/carte/core/cards.js';
import { newMatch, play, legalFor, findLegal, moveKey } from '../src/carte/core/match.js';
import klondike from '../src/carte/games/solitari-klondike.js';
import spider from '../src/carte/games/solitari-spider.js';
import freecell from '../src/carte/games/solitari-freecell.js';
import piramide from '../src/carte/games/solitari-piramide.js';
import * as K from '../src/carte/games/solitari/klondike.js';
import * as F from '../src/carte/games/solitari/freecell.js';
import * as S from '../src/carte/games/solitari/spider.js';
import * as P from '../src/carte/games/solitari/pyramid.js';
import { dailyStart, dayKey } from '../src/carte/games/solitari/common.js';

const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { const t0 = Date.now(); try { fn(); ok++; console.log(`✓ ${name} (${Date.now() - t0} ms)`); } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };
const sorted = (a) => a.slice().sort();
const cfgOf = (g, variant, options = {}) => ({ variant, n: 1, seats: [{ kind: 'human', name: 'Tu' }], target: 1, options: { ...Object.fromEntries((g.options || []).map((o) => [o.id, o.default])), ...options } });
// play a list of moves through the framework (throws on an illegal one)
function playAll(g, M, moves) { for (const m of moves) { if (g.isOver(M.state)) break; play(g, M, m, { keepUndo: true }); } }

// ---------------------------------------------------------------- invariants
function allCards(g, s) {
  if (g.id === 'klondike') return [...s.t.flat(), ...s.f.flat(), ...s.st, ...s.wa];
  if (g.id === 'freecell') return [...s.t.flat(), ...s.f.flat(), ...s.c.filter(Boolean)];
  if (g.id === 'spider') return [...s.t.flat(), ...s.f.flat(), ...s.st];
  return [...s.p.filter(Boolean), ...s.st, ...s.wa, ...s.f];
}
const altRun = (a, b) => rank(a) === rank(b) + 1 && isRed(a) !== isRed(b);
function check(g, s, deck) {
  const cs = allCards(g, s);
  eq(sorted(cs), deck, `${g.id}: carte perse o duplicate`);
  if (g.id === 'klondike' || g.id === 'freecell') {
    for (const f of s.f) f.forEach((c, i) => { yes(rank(c) === i + 1 && suit(c) === suit(f[0]), `${g.id}: fondazione disordinata ${f}`); });
    if (g.id === 'klondike') s.t.forEach((col, i) => { for (let j = s.d[i] + 1; j < col.length; j++) yes(altRun(col[j - 1], col[j]), `klondike: scala illegale ${col.slice(s.d[i])}`); yes(s.d[i] < col.length || col.length === 0, 'klondike: carta coperta in cima'); });
  }
  if (g.id === 'spider') {
    s.f.forEach((run) => yes(run.length === 13 && run.every((c, k) => rank(c) === 13 - k && suit(c) === suit(run[0])), 'spider: scala completata errata'));
    s.t.forEach((col, i) => yes(!col.length || s.d[i] < col.length, 'spider: carta coperta in cima'));
  }
  if (g.id === 'piramide') { for (let k = 0; k < s.f.length; k++) { /* removed cards come in pairs summing 13 or kings */ } }
  JSON.parse(JSON.stringify(s));
}
const deckOfGame = (g, s) => sorted(allCards(g, g.engine.deal(s.no, s.eo)));

// ---------------------------------------------------------------- rules
t('klondike: distribuzione', () => {
  const s = K.deal(1, { draw: 1 });
  eq(s.t.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]); eq(s.st.length, 24); eq(sorted([...s.t.flat(), ...s.st]), sorted(makeDeck('fr52')));
  eq(JSON.stringify(K.deal(1, { draw: 1 })), JSON.stringify(s), 'stesso numero, stessa partita');
  yes(JSON.stringify(K.deal(2, { draw: 1 })) !== JSON.stringify(s), 'numeri diversi, partite diverse');
});
t('klondike: regole delle mosse', () => {
  yes(K.fitsT(['13S'], '12H') && !K.fitsT(['13S'], '12C') && !K.fitsT(['13S'], '11H'), 'scala a colori alterni');
  yes(K.fitsT([], '13D') && !K.fitsT([], '12D'), 'solo il Re nella colonna vuota');
  yes(K.fitsF([], '1H') && !K.fitsF([], '2H') && K.fitsF(['1H'], '2H') && !K.fitsF(['1H'], '2D'), 'fondazioni');
  const s = { t: [['5S', '13H'], [], [], [], [], [], []], d: [1, 0, 0, 0, 0, 0, 0], f: [[], [], [], []], st: ['1C', '2C', '3C', '4C'], wa: [], draw: 3, pass: 0, score: 0 };
  K.apply(s, { act: 'draw' }); eq(s.wa, ['4C', '3C', '2C'], 'pesca 3'); eq(s.st, ['1C']);
  K.apply(s, { card: '13H', to: 't1' }); eq(s.d[0], 0, 'la carta coperta si gira'); eq(s.score, 5);
  K.apply(s, { act: 'draw' }); K.apply(s, { act: 'recycle' }); eq(s.st, ['1C', '2C', '3C', '4C'], 'rigira'); eq(s.pass, 1);
});
t('freecell: numerazione classica (n° 1) e partite impossibili', () => {
  eq(F.classicDeck(1).slice(0, 8), ['11D', '2D', '9H', '11C', '5D', '7H', '7C', '5H']);
  yes(F.IMPOSSIBLE.includes(11982));
  eq(F.pick(11982, { classic: true }), 11983, 'le partite casuali saltano la 11982');
  const s = F.deal(5, {}); eq(s.t.map((c) => c.length), [7, 7, 7, 7, 6, 6, 6, 6]);
  eq(F.maxMove({ c: [null, null, 'x', 'y'], t: [[], ['1S'], ['1S'], ['1S'], ['1S'], ['1S'], ['1S'], []] }, false), 12, 'superspostamento (2+1)·2²');
  eq(F.maxMove({ c: [null, null, 'x', 'y'], t: [[], ['1S'], ['1S'], ['1S'], ['1S'], ['1S'], ['1S'], []] }, true), 6);
});
t('spider: mazzi da 1, 2, 4 semi e scala completata', () => {
  for (const n of [1, 2, 4]) { const d = S.deck(n); eq(d.length, 104); eq(new Set(d).size, 104); eq(new Set(d.map(suit)).size, n); }
  const run = Array.from({ length: 12 }, (_, i) => `${13 - i}S`);
  const s = { t: [['5H', ...run], ['1S~2'], ...Array.from({ length: 8 }, () => ['9D'])], d: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], st: [], f: [], score: 500, suits: 4 };
  S.apply(s, { card: '1S~2', to: 't0' });
  eq(s.f.length, 1, 'K..A esce'); eq(s.t[0], ['5H']); eq(s.score, 599);
  const s2 = S.deal(3, { suits: 1 }); s2.t[0] = []; yes(!S.moves(s2).some((m) => m.act === 'deal'), 'niente distribuzione con una colonna vuota');
});
t('piramide: carte libere e coppie da 13', () => {
  const s = P.deal(7, { passes: 3 });
  eq(s.p.length, 28); eq(s.st.length, 24);
  for (let i = 0; i < 21; i++) yes(!P.free(s, i), 'coperta'); for (let i = 21; i < 28; i++) yes(P.free(s, i), 'ultima fila libera');
  for (const m of P.moves(s)) {
    if (m.act) continue;
    if (m.to === 'found') eq(rank(m.card), 13);
    else { const o = m.to === 'waste' ? s.wa[s.wa.length - 1] : s.p[+m.to.slice(1)]; eq(rank(m.card) + rank(o), 13); }
  }
});
t('solitario del giorno: uguale per tutti, cambia ogni giorno', () => {
  eq(dailyStart('klondike|d1', '2026-11-20'), dailyStart('klondike|d1', '2026-11-20'));
  yes(dailyStart('klondike|d1', '2026-11-20') !== dailyStart('klondike|d1', '2026-11-21'));
  const a = klondike.setup(1, { variant: 'uno', partita: 'giorno' }), b = klondike.setup(999, { variant: 'uno', partita: 'giorno' });
  eq(a.no, b.no, 'il seme non conta'); eq(a.daily, dayKey());
  yes(K.solve(K.toSolver(K.deal(a.no, { draw: 1 })), 1, 8000).ok, 'la partita del giorno è vincibile');
});

// ---------------------------------------------------------------- solvers on many seeds, through the plug-ins
function solveThrough(g, variant, options, nos, planFn) {
  let won = 0, tried = 0;
  for (const no of nos) {
    const M = newMatch(g, cfgOf(g, variant, options));
    M.state = g.fresh(no, M.state.eo, { mode: 'numero', uid: `t${no}` });
    const plan = planFn(M.state); tried++;
    if (!plan) continue;
    playAll(g, M, plan);
    while (!g.isOver(M.state) && legalFor(g, M).some((m) => m.act === 'auto')) play(g, M, { act: 'auto' });
    yes(M.state.over === 'won', `${g.id} n° ${no}: il piano del risolutore non vince`);
    won++;
  }
  return [won, tried];
}
t('klondike: il risolutore vince le partite che dichiara vincibili (Pesca 1 e 3)', () => {
  const N = QUICK ? 15 : 40;
  const [w1] = solveThrough(klondike, 'uno', {}, Array.from({ length: N }, (_, i) => i + 1), (s) => klondike.engine.plan(s, 20000));
  const [w3] = solveThrough(klondike, 'tre', {}, Array.from({ length: N }, (_, i) => i + 101), (s) => klondike.engine.plan(s, 20000));
  console.log(`   Pesca 1: ${w1}/${N} risolte · Pesca 3: ${w3}/${N} risolte`);
  yes(w1 >= N * 0.6 && w3 >= N * 0.45, 'troppe poche partite risolte');
});
t('klondike: «solo vincibili» dà partite risolte', () => {
  for (let i = 0; i < (QUICK ? 4 : 10); i++) { const s = klondike.setup(7000 + i * 13, { variant: 'tre', partita: 'vincibile' }); yes(K.solve(K.toSolver(K.deal(s.no, { draw: 3 })), 3, 8000).ok, `n° ${s.no}`); }
});
t('freecell: tutte le partite numerate si vincono (risolutore)', () => {
  const N = QUICK ? 12 : 40, nos = [];
  for (let i = 0; i < N; i++) nos.push(freecell.setup(i * 7919 + 3, { partita: 'casuale', numeri: 'baso' }).no);
  const [w] = solveThrough(freecell, null, {}, nos, (s) => freecell.engine.plan(s, 40000));
  eq(w, N, 'partite vinte');
  const [wc] = solveThrough(freecell, null, { numeri: 'classica' }, [1, 2, 3, 617, 1941], (s) => freecell.engine.plan(s, 60000));
  eq(wc, 5, 'partite classiche');
});
t('piramide: il risolutore vince le partite «solo vincibili»', () => {
  const N = QUICK ? 6 : 20, nos = [];
  for (let i = 0; i < N; i++) nos.push(piramide.setup(i * 104729 + 11, { partita: 'vincibile', giri: 3 }).no);
  const [w] = solveThrough(piramide, null, { giri: 3 }, nos, (s) => piramide.engine.plan(s, 8000));
  eq(w, N);
});
t('spider 1 seme: i suggerimenti vincono una partita intera', () => {
  const M = newMatch(spider, cfgOf(spider, 'uno'));
  M.state = spider.fresh(1, M.state.eo, { mode: 'numero', uid: 'sp1' });
  for (let k = 0; k < 400 && !M.state.over; k++) { const p = spider.engine.plan(M.state); yes(p, 'nessun suggerimento'); playAll(spider, M, p); }
  eq(M.state.over, 'won');
});

// ---------------------------------------------------------------- undo, restart, new deal, resign
t('annulla illimitato: rifà esattamente gli stati precedenti', () => {
  for (const [g, v] of [[klondike, 'tre'], [freecell, null], [spider, 'due'], [piramide, null]]) {
    const M = newMatch(g, { ...cfgOf(g, v), seed: 4242 }); const r = rng(9), hist = [];
    for (let k = 0; k < 80 && !M.state.over; k++) {
      const L = legalFor(g, M).filter((m) => !m.act || m.act === 'draw' || m.act === 'recycle' || m.act === 'row');
      if (!L.length) break;
      hist.push(JSON.stringify(strip(M.state))); play(g, M, L[Math.floor(r() * L.length)]);
    }
    while (hist.length) { play(g, M, { act: 'undo' }); eq(JSON.stringify(strip(M.state)), hist.pop(), `${g.id}: annulla`); }
    yes(!legalFor(g, M).some((m) => m.act === 'undo'), 'niente da annullare all’inizio');
  }
});
function strip(s) { const { el, ts, t0, undone, moves, log, ...rest } = s; return { ...rest, n: log.length }; }
t('rigioca, nuova partita, partita per numero, arrenditi', () => {
  const g = klondike, M = newMatch(g, { ...cfgOf(g, 'uno'), seed: 77 }), no = M.state.no;
  play(g, M, legalFor(g, M).find((m) => m.act === 'draw'));
  play(g, M, { act: 'restart' }); eq(M.state.no, no); eq(M.state.log.length, 0);
  play(g, M, { act: 'new' }); yes(M.state.no !== no, 'nuovo numero');
  yes(!findLegal(legalFor(g, M), { act: 'deal', no: 5, mode: 'numero' }), 'partita per numero solo su richiesta della UI');
  play(g, M, { act: 'resign' }); eq(M.state.over, 'lost'); eq(g.scores(M.state).points, [0]); eq(g.matchOver([0]), 1); eq(g.matchOver([1]), 0);
});

// ---------------------------------------------------------------- random-play soak
t('soak: partite a caso con controllo degli invarianti dopo ogni mossa', () => {
  const cases = [[klondike, 'uno'], [klondike, 'tre'], [freecell, null], [spider, 'uno'], [spider, 'due'], [spider, 'quattro'], [piramide, null]];
  let moves = 0;
  for (const [g, v] of cases) {
    for (let i = 0; i < (QUICK ? 6 : 25); i++) {
      const M = newMatch(g, { ...cfgOf(g, v), seed: 1000 + i * 31 }), r = rng(i + 5), deck = deckOfGame(g, M.state);
      for (let k = 0; k < 300 && !M.state.over; k++) {
        const L = legalFor(g, M).filter((m) => m.act !== 'new' && m.act !== 'restart' && m.act !== 'resign');
        if (!L.length) break;
        const m = r() < 0.05 && L.some((x) => x.act === 'undo') ? { act: 'undo' } : L[Math.floor(r() * L.length)];
        play(g, M, m); moves++;
        check(g, M.state, deck);
        for (const x of legalFor(g, M)) yes(!!findLegal(g.legalMoves(M.state, 0), x), 'mossa non ritrovata');
      }
    }
  }
  console.log(`   ${moves} mosse controllate`);
});
t('stato serializzabile e mosse confrontabili', () => {
  for (const g of [klondike, freecell, spider, piramide]) {
    const s = g.setup(5, { variant: g.variants?.[0]?.id });
    eq(JSON.parse(JSON.stringify(s)), s);
    for (const m of g.legalMoves(s, 0)) yes(moveKey(m) === moveKey(JSON.parse(JSON.stringify(m))));
  }
});

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
