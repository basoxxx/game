// Blackjack (Carte Baso) unit tests: hand values, payouts (3:2, insurance 2:1, surrender, push),
// double, split (resplit, split aces one card, 21 after split is not blackjack), dealer S17/H17 and the
// peek, basic strategy table, Hi-Lo count, shoe and cut card, a soak of thousands of hands with random
// legal moves checked against an independent payout calculation, basic strategy house edge and full
// sessions through the framework.        node tools/carte-blackjack-test.mjs   (QUICK=1 shorter)
import { makeDeck, rng } from '../src/carte/core/cards.js';
import { simulate, newMatch, play, endRound, nextRound, aiMove } from '../src/carte/core/match.js';
import * as B from '../src/carte/games/blackjack/engine.js';
import { handValue, isBlackjack, basic, tableCode, hiLo, runningCount, cardValue } from '../src/carte/games/blackjack/strategy.js';
import bj from '../src/carte/games/blackjack.js';

const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { const t0 = Date.now(); try { fn(); ok++; console.log(`✓ ${name} (${Date.now() - t0} ms)`); } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B2 = JSON.stringify(b); if (A !== B2) throw new Error(`${msg} atteso ${B2}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };
const throws = (fn, msg) => { let th = false; try { fn(); } catch { th = true; } if (!th) throw new Error(msg || 'doveva lanciare'); };
// 'A K 5 T' -> card ids with distinct copies (suits cycle so ids stay unique)
let uid = 0;
const C = (s) => s.split(/\s+/).filter(Boolean).map((x) => { const r = ({ A: 1, K: 13, Q: 12, J: 11, T: 10 })[x] ?? +x; uid++; return `${r}${'HDCS'[uid % 4]}~${2 + Math.floor(uid / 4) % 5}`; });
// a stacked shoe: burn card, then player, dealer up, player, dealer hole, then the draws
function round({ p, d, draws = '', bank = 1000, bet = 100, rules = {} }) {
  const P = C(p), D = C(d), X = C(draws);
  const fixed = [C('2')[0], P[0], D[0], P[1], D[1], ...X, ...C('5 5 5 5 5 5 5 5')];
  const s = B.newRound({ seed: 1, base: 1, bank, fixed, rules: { h17: false, surrender: true, ...rules } });
  s.bet = bet; B.act(s, { a: 'deal' });
  return s;
}
const net = (s) => s.bank - s.bank0;
const A = (s, a, extra = {}) => B.act(s, { a, ...extra });

t('valori: morbide e dure', () => {
  eq(handValue(C('A 6')), { total: 17, soft: true }); eq(handValue(C('A 6 K')), { total: 17, soft: false });
  eq(handValue(C('A A 9')), { total: 21, soft: true }); eq(handValue(C('K Q 5')), { total: 25, soft: false });
  yes(isBlackjack(C('A K'))); yes(!isBlackjack(C('A 5 5'))); eq(cardValue('12H~3'), 10); eq(cardValue('1S'), 11);
});
t('pagamenti: blackjack 3:2, vittoria 1:1, pari, sconfitta', () => {
  eq(net(round({ p: 'A K', d: '9 7' })), 150, 'blackjack 3:2'); yes(round({ p: 'A K', d: '9 7' }).over, 'chiusa subito');
  let s = round({ p: 'T 9', d: '9 7', draws: '6' }); A(s, 'stand'); eq(handValue(s.dealer).total, 22); eq(net(s), 100, 'il banco sballa');
  s = round({ p: 'T 8', d: 'T 8' }); A(s, 'stand'); eq(net(s), 0, 'pari');
  s = round({ p: 'T 7', d: 'T 8' }); A(s, 'stand'); eq(net(s), -100);
  s = round({ p: 'T 6', d: 'T 7', draws: 'K' }); A(s, 'hit'); yes(s.over); eq(s.hands[0].res, 'bust'); eq(net(s), -100);
  eq(s.dealer.length, 2, 'con tutte le mani sballate il banco non pesca');
});
t('banco: sbircia con Asso o 10, blackjack contro blackjack', () => {
  let s = round({ p: 'T 9', d: 'K A' }); yes(s.over, 'il banco ha blackjack: mano finita'); eq(net(s), -100);
  s = round({ p: 'A Q', d: 'K A' }); eq(net(s), 0, 'blackjack contro blackjack: pari');
  s = round({ p: 'T 9', d: 'A K' }); eq(s.phase, 'ins'); A(s, 'ins', { yes: true }); yes(s.over); eq(net(s), 0, 'assicurazione 2:1 copre la puntata');
  s = round({ p: 'T 9', d: 'A 7' }); A(s, 'ins', { yes: true }); eq(s.phase, 'play'); A(s, 'stand'); eq(net(s), 100 - 50, 'vinta, assicurazione persa');
  s = round({ p: 'A K', d: 'A 7' }); A(s, 'ins', { yes: true }); eq(net(s), 100, 'pari soldi: +1 volta la puntata');
  s = round({ p: 'T 9', d: 'A 7' }); A(s, 'ins', { yes: false }); A(s, 'stand'); eq(net(s), 100);
});
t('raddoppio: una carta sola, puntata doppia', () => {
  let s = round({ p: '6 5', d: 'T 7', draws: 'T' }); A(s, 'double'); yes(s.over); eq(s.hands[0].cards.length, 3); eq(net(s), 200);
  s = round({ p: '6 5', d: 'T 7', draws: '2' }); A(s, 'double'); eq(net(s), -200);
  s = round({ p: '6 5', d: 'T 7', bank: 150 }); yes(!B.moves(s).some((m) => m.a === 'double'), 'senza fiches non si raddoppia');
  s = round({ p: '6 5', d: 'T 7', draws: '2' }); A(s, 'hit'); yes(!B.moves(s).some((m) => m.a === 'double'), 'solo sulle prime due carte');
});
t('divisione: due mani, ridivisione fino a quattro, raddoppio dopo divisione', () => {
  let s = round({ p: '8 8', d: 'T 7', draws: '3 T' }); A(s, 'split');
  eq(s.hands.length, 2); eq(s.hands.map((h) => h.cards.length), [2, 2]); eq(s.bank, 800);
  A(s, 'stand'); A(s, 'stand'); yes(s.over); eq(s.hands.map((h) => h.res), ['lose', 'win']); eq(net(s), 0);
  s = round({ p: '8 8', d: 'T 7', draws: '8 8 8 3 3 3 3' });
  A(s, 'split'); A(s, 'split'); A(s, 'split'); eq(s.hands.length, 4); yes(!B.moves(s).some((m) => m.a === 'split'), 'massimo quattro mani');
  s = round({ p: '5 5', d: '6 T', draws: '6 6 T T' }); A(s, 'split'); yes(B.moves(s).some((m) => m.a === 'double'), 'raddoppio dopo divisione');
  A(s, 'double'); eq(s.hands[0].bet, 200);
});
t('divisione degli assi: una carta ciascuno, 21 non è blackjack', () => {
  const s = round({ p: 'A A', d: '9 8', draws: 'K 5' }); A(s, 'split');
  yes(s.over, 'gli assi divisi ricevono una carta e stanno'); eq(s.hands.map((h) => handValue(h.cards).total), [21, 16]);
  eq(s.hands[0].res, 'win', '21 dopo divisione paga 1:1'); eq(s.hands[0].pay, 200); eq(net(s), 0);
  const s2 = round({ p: 'A A', d: '9 8', draws: 'A 5', bank: 1000 }); A(s2, 'split'); yes(s2.over, 'niente ridivisione degli assi');
});
t('resa: metà puntata, non dopo una divisione né dopo carta', () => {
  let s = round({ p: 'T 6', d: 'T 7' }); A(s, 'surrender'); eq(net(s), -50); eq(s.hands[0].res, 'sur');
  s = round({ p: 'T 6', d: 'T 7', rules: { surrender: false } }); yes(!B.moves(s).some((m) => m.a === 'surrender'));
  s = round({ p: '8 8', d: 'T 7', draws: '3 2' }); A(s, 'split'); yes(!B.moves(s).some((m) => m.a === 'surrender'));
  s = round({ p: 'T 2', d: 'T 7', draws: '2' }); A(s, 'hit'); yes(!B.moves(s).some((m) => m.a === 'surrender'));
});
t('banco S17 e H17 sul 17 soft', () => {
  let s = round({ p: 'T 8', d: 'A 6', draws: '4' }); A(s, 'ins', { yes: false }); A(s, 'stand'); eq(handValue(s.dealer).total, 17, 'S17: sta'); eq(net(s), 100);
  s = round({ p: 'T 8', d: 'A 6', draws: '4', rules: { h17: true } }); A(s, 'ins', { yes: false }); A(s, 'stand'); eq(handValue(s.dealer).total, 21, 'H17: chiede'); eq(net(s), -100);
  s = round({ p: 'T 8', d: 'T 6', draws: 'A' }); A(s, 'stand'); eq(handValue(s.dealer).total, 17); eq(s.dealer.length, 3, 'il 17 duro sta sempre');
});
t('mosse illegali rifiutate', () => {
  const s = round({ p: 'T 6', d: 'T 7' });
  throws(() => A(s, 'split')); throws(() => A(s, 'deal')); throws(() => A(s, 'chip', { v: 10 }));
  const b = B.newRound({ seed: 1, base: 9, bank: 1000 }); throws(() => A(b, 'deal'), 'puntata zero'); A(b, 'chip', { v: 500 }); A(b, 'chip', { v: 500 }); throws(() => A(b, 'chip', { v: 10 }), 'oltre il massimo');
});
t('strategia base: caselle note (S17 e H17)', () => {
  const T = (p, d, rules = {}, allowed) => basic(C(p), C(d)[0], { surrender: true, ...rules }, allowed || { double: true, split: true, surrender: true });
  eq(T('T 6', '7'), 'H'); eq(T('T 6', '6'), 'S'); eq(T('T 6', 'T'), 'R'); eq(T('T 6', 'T', {}, { double: true, split: true, surrender: false }), 'H');
  eq(T('T 2', '2'), 'H'); eq(T('T 2', '4'), 'S'); eq(T('6 5', 'A'), 'H'); eq(T('6 5', 'A', { h17: true }), 'D'); eq(T('6 4', 'T'), 'H'); eq(T('5 4', '3'), 'D'); eq(T('5 4', '2'), 'H');
  eq(T('A 7', '2'), 'S'); eq(T('A 7', '2', { h17: true }), 'D'); eq(T('A 7', '9'), 'H'); eq(T('A 7', '5'), 'D'); eq(T('A 7', '5', {}, { double: false, split: false, surrender: false }), 'S');
  eq(T('A 8', '6', { h17: true }), 'D'); eq(T('A 8', '6'), 'S'); eq(T('A 2', '5'), 'D'); eq(T('A 2', '4'), 'H'); eq(T('A 6', '3'), 'D');
  eq(T('A A', 'A'), 'P'); eq(T('8 8', 'A'), 'P'); eq(T('T T', '6'), 'S'); eq(T('9 9', '7'), 'S'); eq(T('9 9', '8'), 'P'); eq(T('5 5', '9'), 'D'); eq(T('4 4', '5'), 'P'); eq(T('4 4', '5', { das: false }), 'H');
  eq(T('2 2', '2', { das: false }), 'H'); eq(T('2 2', '2'), 'P'); eq(T('7 7', '8'), 'H'); eq(T('6 6', '2'), 'P');
  eq(T('T 7', 'A', { h17: true }), 'R'); eq(T('T 7', 'A', { h17: true }, { double: false, split: false, surrender: false }), 'S'); eq(T('T 5', 'A', { h17: true }), 'R'); eq(T('T 5', 'A'), 'H');
  eq(T('A A', '6', {}, { double: true, split: false, surrender: false }), 'H', 'assi non divisibili: 12 soft si chiede carta');
  eq(T('5 4 3', '4'), 'S', '12 contro 4 con tre carte'); eq(T('A 2 4', '5', {}, { double: false, split: false, surrender: false }), 'H');
  eq(tableCode(C('8 8'), C('T')[0]), 'P');
});
t('conteggio Hi-Lo: il sabot somma a zero, carta coperta esclusa', () => {
  eq(runningCount(makeDeck('fr52', { copies: 6 })), 0); eq([hiLo(C('2')[0]), hiLo(C('7')[0]), hiLo(C('K')[0]), hiLo(C('A')[0])], [1, 0, -1, -1]);
  const s = round({ p: '2 3', d: '5 K' }); eq(B.seenCount(s), 3 - 0, '2, 3, 5 visti (+3); il Re coperto non conta e la bruciata nemmeno');
  A(s, 'stand'); eq(B.seenCount(s), runningCount([...s.hands[0].cards, ...s.dealer]), 'scoperto il Re e le carte del banco');
});
t('sabot: 312 carte uniche, carta di taglio, rimescolata tra le mani', () => {
  const { cards, cut } = B.makeShoe(42, 0);
  eq(cards.length, 312); eq(new Set(cards).size, 312); yes(cut >= 312 - 52 - 38 && cut <= 312 - 60, `taglio a ${cut}`);
  yes(JSON.stringify(B.makeShoe(42, 1).cards) !== JSON.stringify(cards), 'il sabot successivo è diverso');
  // through the plug-in: cards never repeat inside one shoe, the shoe changes after the cut card
  const M = newMatch(bj, { n: 1, seed: 77, target: 0, seats: [{ kind: 'cpu', level: 'normale' }], options: { conta: 'quiz' } });
  const seen = new Set(); let shoe = M.state.shoeNo, changes = 0, quizzes = 0;
  for (let h = 0; h < 120; h++) {
    if (M.state.shoeNo !== shoe) { shoe = M.state.shoeNo; seen.clear(); changes++; eq(M.state.pos, 1, 'nuovo sabot dalla seconda carta (una bruciata)'); }
    if (M.state.quiz) { quizzes++; eq(M.state.quiz.answer, B.seenCount(M.state), 'la risposta del quiz è il conteggio'); yes(M.state.quiz.options.includes(M.state.quiz.answer)); }
    while (!bj.isOver(M.state)) play(bj, M, aiMove(bj, M, 'normale'));
    for (const c of [...M.state.dealer, ...M.state.hands.flatMap((x) => x.cards)]) { yes(!seen.has(c), `carta ripetuta ${c}`); seen.add(c); }
    endRound(bj, M); if (M.over) break; nextRound(bj, M);
  }
  yes(changes >= 1, 'il sabot è stato cambiato'); yes(quizzes > 50);
});
// independent payout of a finished hand
function expectedNet(s) {
  const d = handValue(s.dealer).total, dbj = isBlackjack(s.dealer);
  let n = 0;
  for (const h of s.hands) {
    const v = handValue(h.cards).total, pbj = !h.split && isBlackjack(h.cards);
    if (h.res === 'sur') n -= h.bet / 2;
    else if (v > 21) n -= h.bet;
    else if (pbj && !dbj) n += h.bet * 1.5;
    else if (dbj) n -= pbj ? 0 : h.bet;
    else if (d > 21 || v > d) n += h.bet;
    else if (v < d) n -= h.bet;
  }
  if (s.ins) n += dbj ? s.ins * 2 : -s.ins;
  return n;
}
t(`maratona: ${QUICK ? 5000 : 30000} mani con mosse casuali, pagamenti verificati`, () => {
  const r = rng(5); const N = QUICK ? 5000 : 30000; let splits = 0, doubles = 0, ins = 0, bjs = 0;
  let pos = 0, shoeNo = 0;
  for (let i = 0; i < N; i++) {
    const s = B.newRound({ seed: i, base: 99, bank: 50 + Math.floor(r() * 3000), shoeNo, pos, rules: { h17: i % 2 === 1, surrender: i % 3 > 0 } });
    while (s.bet < 10 || r() < 0.5) { const ch = B.moves(s).filter((m) => m.a === 'chip'); if (!ch.length) break; A(s, 'chip', { v: ch[Math.floor(r() * ch.length)].v }); }
    A(s, 'deal');
    let g = 0;
    while (!s.over) {
      if (++g > 60) throw new Error('mano infinita');
      const ms = B.moves(s).filter((m) => m.a !== 'hint');
      const m = ms[Math.floor(r() * ms.length)];
      B.act(s, m);
      yes(s.bank >= 0, 'banco negativo');
    }
    eq(net(s), expectedNet(s), `mano ${i}`);
    splits += s.hands.length > 1; doubles += s.hands.some((h) => h.doubled); ins += !!s.ins; bjs += s.hands.some((h) => h.res === 'bj');
    ({ pos, shoeNo } = s);
  }
  console.log(`   ${splits} divisioni, ${doubles} raddoppi, ${ins} assicurazioni, ${bjs} blackjack`);
  yes(splits > 50 && doubles > 200 && bjs > 100);
});
t('strategia base: vantaggio del banco realistico', () => {
  let tot = 0, hands = 0, pos = 0, shoeNo = 0; const N = QUICK ? 40000 : 200000;
  for (let i = 0; i < N; i++) {
    const s = B.newRound({ seed: i, base: 1234, bank: 10000, shoeNo, pos, rules: { h17: false, surrender: true } });
    A(s, 'chip', { v: 100 }); A(s, 'deal');
    if (s.phase === 'ins') A(s, 'ins', { yes: false });
    while (!s.over) { const c = B.advice(s); A(s, { H: 'hit', S: 'stand', D: 'double', P: 'split', R: 'surrender' }[c]); }
    tot += net(s); hands++; ({ pos, shoeNo } = s);
  }
  const edge = tot / hands / 100;
  console.log(`   rendimento per mano: ${(edge * 100).toFixed(2)}% della puntata`);
  yes(edge > -0.025 && edge < 0.015, `vantaggio fuori scala: ${edge}`);
});
t('plug-in: sessioni complete, salvabili, statistiche e fine sessione', () => {
  for (let i = 0; i < (QUICK ? 20 : 80); i++) {
    const { M } = simulate(bj, { n: 1, seed: i, target: [20, 50, 0][i % 3], options: { banco: i % 2 ? 'h17' : 's17', resa: true, conta: ['off', 'mostra', 'quiz'][i % 3] }, seats: [{ kind: 'cpu', level: 'normale' }] }, ['normale']);
    yes(M.over); eq(JSON.parse(JSON.stringify(M)), M);
    if (i % 3 !== 2) eq(M.rounds.length, [20, 50][i % 3]); else yes(B.START_BANK + M.totals[0] < B.MIN_BET || M.rounds.length >= 1000);
    const st = M.dealer.st; eq(st.hands >= M.rounds.length - 1, true);
    const v = bj.view(M.state, 0, { portrait: i % 2 === 0 }); const ids = v.piles.flatMap((p) => p.cards.map((c) => (typeof c === 'string' ? c : c.id)));
    eq(new Set(ids).size, ids.length);
  }
  eq(bj.matchOver([5], { target: 2 }, [{}, {}]), 0); eq(bj.matchOver([-995], { target: 0 }, [{}]), 1); eq(bj.matchOver([0], { target: 1 }, [{}]), 'draw'); eq(bj.matchOver([10], { target: 5 }, [{}]), -1);
  const s = bj.setup(3, { n: 1, round: 0, totals: [0], dealer: 0, conta: 'mostra' });
  yes(bj.legalMoves(s, 0).some((m) => m.a === 'chip' && /chp-face/.test(m.label)), 'fiches come pulsanti');
  yes(/Fiches finte/.test(bj.rules));
});

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
