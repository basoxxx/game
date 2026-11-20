// Texas Hold'em (Carte Baso) unit tests: hand evaluator (known hands, all 2.598.960 five-card hands by
// category, random 5/6/7-card hands against a slow reference), side pots, betting-round state machine
// (blinds, order, min-raise, incomplete all-ins, uncalled bets), a soak of thousands of hands with random
// legal actions and chip conservation, AI sanity and full plug-in matches through the framework.
//   node tools/carte-poker-test.mjs        (QUICK=1 for a shorter run)
import { makeDeck, rng } from '../src/carte/core/cards.js';
import { simulate, newMatch, play, legalFor, endRound, nextRound, aiMove } from '../src/carte/core/match.js';
import { toInt, toId, evalInts, evalIds, evalSlow, eval5Slow, handName, catName, category, bestFive, holeClass } from '../src/carte/games/poker/eval.js';
import * as E from '../src/carte/games/poker/engine.js';
import { equity, preflopEquity, decide } from '../src/carte/games/poker/ai.js';
import poker, { carryOf, blindsFor } from '../src/carte/games/poker.js';

const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { const t0 = Date.now(); try { fn(); ok++; console.log(`✓ ${name} (${Date.now() - t0} ms)`); } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };
const throws = (fn, msg) => { let th = false; try { fn(); } catch { th = true; } if (!th) throw new Error(msg || 'doveva lanciare'); };
// '10h' style helpers: 'As Kd Th 2c' -> framework ids
const ID = (s) => s.split(/\s+/).filter(Boolean).map((x) => { const r = x.slice(0, -1).toUpperCase(), su = x.slice(-1).toUpperCase(); return `${({ A: 1, K: 13, Q: 12, J: 11, T: 10 })[r] ?? +r}${su}`; });
const ev = (s) => evalIds(ID(s));

// ---------------------------------------------------------------- evaluator
t('valutatore: categorie su mani note', () => {
  eq(catName(ev('As Ks Qs Js Ts 2d 3c')), 'Scala reale');
  eq(catName(ev('9h 8h 7h 6h 5h Ad Ac')), 'Scala colore');
  eq(handName(ev('5d 4d 3d 2d Ad Kc Qh')), 'Scala colore al Cinque');
  eq(catName(ev('7c 7d 7h 7s Kd 2c 3c')), 'Poker');
  eq(catName(ev('Kc Kd Kh 9s 9d 2c 3c')), 'Full');
  eq(handName(ev('Kc Kd Kh 9s 9d 9c 3c')), 'Full di Re e Nove', 'due tris: full con il tris più alto');
  eq(catName(ev('Ah 9h 7h 4h 2h Kd Kc')), 'Colore');
  eq(catName(ev('Ts 9d 8c 7h 6s 2d 2c')), 'Scala');
  eq(handName(ev('As 2d 3c 4h 5s Kd Kc')), 'Scala minima (dall’Asso al Cinque)');
  eq(catName(ev('Qs Qd Qc 7h 5s 2d 3c')), 'Tris');
  eq(catName(ev('Js Jd 4c 4h 9s 2d 3c')), 'Doppia coppia');
  eq(catName(ev('Js Jd 9c 7h 5s 2d 3c')), 'Coppia');
  eq(catName(ev('Ks Jd 9c 7h 5s 3d 2c')), 'Carta alta');
  eq(handName(ev('Ks Kd 9c 7h 5s 3d 2c')), 'Coppia di Re');
  eq(handName(ev('As Ad 8c 8h 5s 3d 2c')), 'Doppia coppia, Assi e Otto');
});
t('valutatore: confronti e kicker', () => {
  yes(ev('As Ad 2c 3h 7s 9d Jc') > ev('Ks Kd Ac Qh 7s 9d Jc'), 'AA > KK');
  yes(ev('As Kd 9c 9h 5s 3d 2c') > ev('As Qd 9c 9h 5s 3d 2c'), 'kicker K > Q');
  eq(ev('As Kd Qc Jh 9s 3d 2c'), ev('As Kd Qc Jh 9s 4d 2c'), 'la sesta carta non conta');
  yes(ev('2s 3d 4c 5h 6s Kd Kc') > ev('As 2d 3c 4h 5s Kd Kc'), '6-alta batte la scala minima');
  yes(ev('Js Jd 4c 4h 2s 2d Ac') > ev('Js Jd 4c 4h 2s 2d Kc'), 'tre coppie: il kicker conta anche la terza coppia');
  eq(ev('Js Jd 4c 4h 2s 2d 3c') >> 0, evalSlow(ID('Js Jd 4c 4h 2s 2d 3c').map(toInt)));
  yes(ev('Ah 2h 3h 4h 5h 6d 7d') < ev('2h 3h 4h 5h 6h Ad Ac'), 'scala colore al 6 > al 5');
  yes(ev('Ah Kh Qh Jh 9h 8d 7d') > ev('Kd Qd Jd Td 8d 2c 3c'), 'colore all’asso > colore al re');
  yes(ev('7c 7d 7h 7s 2d 2c 3c') < ev('7c 7d 7h 7s Ad 2c 3c'), 'poker: kicker');
  eq(toId(toInt('1S')), '1S'); eq(toId(toInt('10H')), '10H'); eq(holeClass(toInt('1S'), toInt('13S')), 'AKs'); eq(holeClass(toInt('7D'), toInt('7C')), '77');
  const b5 = bestFive(ID('As Ks Qs Js Ts 2d 3c')); eq(b5.slice().sort(), ID('As Ks Qs Js Ts').sort());
});
t('valutatore: tutte le 2.598.960 mani da 5 carte per categoria', () => {
  const counts = Array(9).fill(0); const c = [0, 0, 0, 0, 0];
  for (c[0] = 0; c[0] < 48; c[0]++) for (c[1] = c[0] + 1; c[1] < 49; c[1]++) for (c[2] = c[1] + 1; c[2] < 50; c[2]++) for (c[3] = c[2] + 1; c[3] < 51; c[3]++) for (c[4] = c[3] + 1; c[4] < 52; c[4]++) counts[category(evalInts(c))]++;
  eq(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});
t('valutatore: mani casuali da 5, 6 e 7 carte uguali al riferimento lento', () => {
  const r = rng(77); const N = QUICK ? 30000 : 150000;
  for (let i = 0; i < N; i++) {
    const k = i % 10 === 0 ? 5 : i % 10 === 1 ? 6 : 7;
    const d = Array.from({ length: 52 }, (_, j) => j);
    for (let j = 0; j < k; j++) { const x = j + Math.floor(r() * (52 - j)); [d[j], d[x]] = [d[x], d[j]]; }
    const cs = d.slice(0, k);
    const a = evalInts(cs), b = k === 5 ? eval5Slow(cs) : evalSlow(cs);
    if (a !== b) throw new Error(`${cs.map(toId)}: veloce ${a} lento ${b}`);
  }
  // hands built to stress the tricky spots: flushes with straights, double trips, three pairs, wheels
  const tricky = ['As 2s 3s 4s 5d 6d 9s', 'Ah Kh Qh Jh Td 9h 2h', '9c 9d 9h 5s 5d 5c Ac', '2c 2d 3h 3s 4d 4c 5h', 'Ac 2d 3h 4s 5d 6c 7h', 'Kh Qh Jh Th 9d 8h 2h', 'Ad Ac As Ah Kd Kc Ks'];
  for (const h of tricky) eq(ev(h), evalSlow(ID(h).map(toInt)), h);
});

// ---------------------------------------------------------------- pots
t('piatti laterali: tre all-in di misure diverse', () => {
  // A 100, B 300, C 500 (all-in), D 500 folded? -> D contributes 500 but folded
  const pots = E.buildPots([100, 300, 500, 500], [false, false, false, true]);
  eq(pots, [{ amount: 400, eligible: [0, 1, 2] }, { amount: 600, eligible: [1, 2] }, { amount: 400, eligible: [2] }]);
  eq(pots.reduce((a, p) => a + p.amount, 0), 1400, 'conservazione');
  const p2 = E.buildPots([50, 200, 200], [true, false, false]);
  eq(p2, [{ amount: 450, eligible: [1, 2] }]);
  const p3 = E.buildPots([20, 20, 20, 20], [false, true, false, false]);
  eq(p3, [{ amount: 80, eligible: [0, 2, 3] }]);
});
t('piatto diviso: fiche dispari a sinistra del bottone', () => {
  const m = E.splitPot(101, [0, 2], 1, 4); eq(m.get(2), 51); eq(m.get(0), 50);
  const m2 = E.splitPot(100, [3, 1, 2], 0, 4); eq([m2.get(1), m2.get(2), m2.get(3)], [34, 33, 33]);
});

// ---------------------------------------------------------------- betting state machine
// a stacked deck: holes[p] for every dealt-in player, then the board (with burn cards)
function stack(n, btn, holes, board, out = []) {
  const alive = (p) => !out.includes(p);
  const order = []; let p = btn;
  const players = Array.from({ length: n }, (_, i) => i).filter(alive).length;
  for (let i = 0; i < players; i++) { do p = (p + 1) % n; while (!alive(p)); order.push(p); }
  const seq = [];
  for (let k = 0; k < 2; k++) for (const q of order) seq.push(holes[q][k]);
  const b = board; seq.push('2C', b[0], b[1], b[2], '3C', b[3], '4C', b[4]);
  const used = new Set(seq);
  const rest = makeDeck('fr52').filter((c) => !used.has(c));
  if (used.size !== seq.length) throw new Error('mazzo truccato con doppioni');
  return [...rest, ...seq.reverse()];
}
const H = (cfg) => E.newHand({ seed: 1, sb: 10, bb: 20, btn: 0, ...cfg });
const A = (s, m) => E.act(s, m);
const sumChips = (s) => s.stacks.reduce((a, b) => a + b, 0) + (s.over ? 0 : E.potTotal(s));
t('giro: bui e ordine in due (il bottone mette il piccolo buio e parla per primo)', () => {
  const s = H({ n: 2, stacks: [1000, 1000], btn: 0 });
  eq([s.sbSeat, s.bbSeat, s.turn], [0, 1, 0]); eq(s.bets, [10, 20]);
  A(s, { a: 'call' }); eq(s.turn, 1, 'opzione del grande buio');
  yes(E.menu(s, 1).some((m) => m.a === 'check') && E.menu(s, 1).some((m) => m.a === 'raise'), 'il BB può passare o rilanciare');
  A(s, { a: 'check' }); eq(s.street, 1); eq(s.board.length, 3); eq(s.turn, 1, 'dopo il flop parla per primo il grande buio');
});
t('giro: in tre parla prima il bottone, poi piccolo e grande buio', () => {
  const s = H({ n: 3, stacks: [1000, 1000, 1000], btn: 2 });
  eq([s.sbSeat, s.bbSeat, s.turn], [0, 1, 2]);
  A(s, { a: 'call' }); A(s, { a: 'call' }); eq(s.turn, 1); A(s, { a: 'check' });
  eq(s.street, 1); eq(s.turn, 0, 'postflop: il primo a sinistra del bottone');
  A(s, { a: 'check' }); A(s, { a: 'check' }); A(s, { a: 'check' }); eq(s.street, 2);
});
t('giro: rilancio minimo', () => {
  const s = H({ n: 3, stacks: [1000, 1000, 1000], btn: 2 });
  eq(E.minRaiseTo(s), 40);
  yes(!E.validRaise(s, 2, 39), '39 non basta'); yes(E.validRaise(s, 2, 40));
  A(s, { a: 'raise', to: 60 }); eq(s.lastRaise, 40); eq(E.minRaiseTo(s), 100);
  throws(() => A(s, { a: 'raise', to: 90 }), 'rilancio sotto il minimo');
  A(s, { a: 'raise', to: 100 }); eq(E.minRaiseTo(s), 140);
  throws(() => A(s, { a: 'check' }), 'non si passa davanti a una puntata');
});
t('giro: un all-in corto non riapre il giro a chi ha già parlato', () => {
  // seat 0 btn: stacks; seat 2 (UTG = btn in 3-handed) raises to 100, seat 0 (SB) all-in 150 total, seat 1 (BB) folds
  const s = H({ n: 3, stacks: [150, 1000, 1000], btn: 2 });
  A(s, { a: 'raise', to: 100 }); // seat 2
  eq(s.turn, 0); A(s, { a: 'raise', to: 150 }); // short all-in: +50 < 80
  eq(s.lastRaise, 80, 'l’ultimo rilancio completo resta 80'); eq(s.cur, 150);
  eq(s.turn, 1); yes(E.canRaise(s, 1), 'il BB non aveva ancora parlato: può rilanciare');
  A(s, { a: 'fold' });
  eq(s.turn, 2); yes(!E.canRaise(s, 2), 'chi ha rilanciato a 100 può solo vedere o lasciare');
  yes(!E.menu(s, 2).some((m) => m.a === 'raise'));
  A(s, { a: 'call' }); eq(s.street >= 1, true);
});
t('giro: più all-in corti che sommati fanno un rilancio completo lo riaprono', () => {
  const s = H({ n: 4, stacks: [1000, 1000, 150, 220], btn: 0 }); // sb 1, bb 2, utg 3
  // preflop: 3 (utg) calls 20, 0 raises to 100, 1 calls, 2 all-in 150 (short), 3 all-in 220
  A(s, { a: 'call' }); A(s, { a: 'raise', to: 100 }); A(s, { a: 'call' }); A(s, { a: 'raise', to: 150 });
  yes(E.canRaise(s, 3), 'il primo che aveva solo visto può rilanciare');
  A(s, { a: 'raise', to: 220 });
  eq(s.turn, 0); yes(E.canRaise(s, 0), '220 - 100 = 120 ≥ 80: il giro si riapre');
  A(s, { a: 'call' }); eq(s.turn, 1); yes(E.canRaise(s, 1));
});
t('giro: puntata non vista restituita e mano vinta senza showdown', () => {
  const s = H({ n: 3, stacks: [1000, 1000, 1000], btn: 2 });
  const before = sumChips(s);
  A(s, { a: 'raise', to: 300 }); A(s, { a: 'fold' }); A(s, { a: 'fold' });
  yes(s.over && s.result.uncontested); eq(s.stacks, [990, 980, 1030]); eq(sumChips(s), before);
});
t('giro: all-in, tavolo completato fino al river e piatti laterali', () => {
  const holes = { 0: ID('As Ad'), 1: ID('Ks Kd'), 2: ID('Qs Qd') };
  const deck = stack(3, 2, holes, ID('2h 7c 9d Jh 3s'));
  const s = H({ n: 3, stacks: [100, 300, 500], btn: 2, deck });
  A(s, { a: 'raise', to: 500 }); A(s, { a: 'call' }); A(s, { a: 'call' });
  yes(s.over, 'showdown automatico'); eq(s.board.length, 5); eq(s.street, 4);
  eq(s.result.pots.map((p) => [p.amount, p.winners]), [[300, [0]], [400, [1]]]);
  eq(s.stacks, [300, 400, 200], 'AA vince il principale, KK il laterale, QQ riprende i 200 non visti');
  eq(s.result.names[0], 'Coppia di Assi');
});
t('giro: piatto diviso quando il tavolo gioca', () => {
  const holes = { 0: ID('2s 3d'), 1: ID('2d 3s') };
  const s = H({ n: 2, stacks: [1000, 1000], btn: 0, deck: stack(2, 0, holes, ID('As Ks Qd Jc Th')) });
  A(s, { a: 'call' }); A(s, { a: 'check' });
  for (let i = 0; i < 6; i++) A(s, { a: 'check' });
  yes(s.over); eq(s.result.pots[0].winners.sort(), [0, 1]); eq(s.stacks, [1000, 1000]);
});
t('giro: buio grande corto (all-in in apertura)', () => {
  const s = H({ n: 2, stacks: [1000, 5], btn: 0 });
  eq(s.bets, [10, 5]); eq(s.cur, 20);
  yes(!E.canRaise(s, 0), 'non si rilancia contro chi è già all-in');
  A(s, { a: 'call' });
  yes(s.over, 'tutto il tavolo esce da solo'); eq(sumChips(s), 1005);
});
t('giro: giocatori eliminati saltano mano e bui', () => {
  const s = H({ n: 4, stacks: [1000, 0, 1000, 1000], btn: 0 });
  eq([s.sbSeat, s.bbSeat], [2, 3]); eq(s.hole[1].length, 0); eq(s.turn, 0);
});

// ---------------------------------------------------------------- soak with random legal actions
t(`maratona: ${QUICK ? 3000 : 12000} mani con azioni casuali, fiches conservate`, () => {
  const r = rng(2024);
  const N = QUICK ? 3000 : 12000;
  let showdowns = 0, sidepots = 0, allinRuns = 0;
  for (let h = 0; h < N; h++) {
    const n = 2 + (h % 5);
    const stacks = Array.from({ length: n }, () => (r() < 0.12 ? 0 : r() < 0.3 ? 5 + Math.floor(r() * 60) : 100 + Math.floor(r() * 2000)));
    if (stacks.filter((x) => x > 0).length < 2) { stacks[0] = 500; stacks[1] = 300; }
    const s = E.newHand({ n, seed: h * 31 + 7, stacks, btn: h % n, sb: 10, bb: 20 });
    const total = stacks.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (!s.over) {
      if (++guard > 400) throw new Error('mano infinita');
      const p = s.turn, ms = E.menu(s, p);
      yes(ms.length, 'nessuna mossa');
      let m = ms[Math.floor(r() * ms.length)];
      // sometimes an arbitrary legal raise size, not from the menu
      if (m.a === 'raise' && r() < 0.4) { const lo = Math.min(E.minRaiseTo(s), E.maxTo(s, p)), hi = E.maxTo(s, p); const to = lo + Math.floor(r() * (hi - lo + 1)); if (E.validRaise(s, p, to)) m = { a: 'raise', to }; }
      if (r() < 0.02) throws(() => E.act(s, { a: 'raise', to: s.cur }), 'rilancio nullo accettato');
      E.act(s, m);
      yes(s.stacks.every((x) => x >= 0), 'fiches negative');
      if (sumChips(s) !== total) throw new Error(`fiches non conservate: ${sumChips(s)} invece di ${total}`);
    }
    if (!s.result.uncontested) { showdowns++; eq(s.board.length, 5, 'showdown con 5 carte'); }
    if (s.result.pots.length > 1) sidepots++;
    if (s.allinRun) allinRuns++;
    eq(s.result.won.reduce((a, b) => a + b, 0), s.contrib.reduce((a, b) => a + b, 0), 'tutto il piatto è pagato');
  }
  console.log(`   ${showdowns} showdown, ${sidepots} con piatti laterali, ${allinRuns} all-in a tavolo aperto`);
  yes(sidepots > 50 && showdowns > 200);
});

// ---------------------------------------------------------------- AI
t('IA: equity sensata', () => {
  const aa = preflopEquity(ID('As Ad'), 1), k72 = preflopEquity(ID('7s 2d'), 1), aa5 = preflopEquity(ID('As Ad'), 5);
  yes(aa > 0.82 && aa < 0.88, `AA contro uno: ${aa}`); yes(k72 > 0.28 && k72 < 0.4, `72o: ${k72}`); yes(aa5 > 0.45 && aa5 < 0.56, `AA contro cinque: ${aa5}`);
  const nuts = equity(ID('As Ks'), ID('Qs Js Ts 2d 3c'), 2, 300, rng(1)); eq(nuts, 1, 'scala reale servita');
  const draw = equity(ID('As 5s'), ID('Ks 9s 2d'), 1, 3000, rng(2)); yes(draw > 0.55 && draw < 0.74, `progetto di colore all’asso: ${draw}`);
});
t('IA: sceglie sempre mosse del menu, tutti gli stili e livelli', () => {
  const r = rng(9);
  for (let h = 0; h < (QUICK ? 150 : 500); h++) {
    const n = 2 + (h % 5);
    const s = E.newHand({ n, seed: h, stacks: Array.from({ length: n }, () => 200 + Math.floor(r() * 3000)), btn: h % n, sb: 25, bb: 50 });
    while (!s.over) {
      const p = s.turn, lv = ['facile', 'normale', 'difficile'][(h + p) % 3], st = ['roccia', 'squalo', 'maniaco', 'pesce'][(h + p) % 4];
      const m = decide(s, p, lv, r, st);
      yes(E.isLegal(s, p, m), `mossa IA illegale ${JSON.stringify(m)}`);
      E.act(s, m);
    }
  }
});
const duel = (a, b, N) => {
  let wa = 0, wb = 0;
  for (let i = 0; i < N; i++) {
    const sw = i % 2, lv = sw ? [b, a] : [a, b];
    const { M } = simulate(poker, { variant: 'torneo', n: 2, seed: 700 + i, target: 0, options: { velocita: 'turbo' }, seats: lv.map((l) => ({ kind: 'cpu', level: l })) }, lv);
    if (M.winner === 'draw') continue;
    if ((M.winner === 0) !== !!sw) wa++; else wb++;
  }
  return [wa, wb];
};
t('IA: Normale batte Facile in testa a testa', () => { const [a, b] = duel('normale', 'facile', QUICK ? 30 : 80); console.log(`   normale-facile ${a}-${b}`); yes(a > b, 'normale non migliore'); });
t('IA: Difficile non perde contro Normale', () => { const [a, b] = duel('difficile', 'normale', QUICK ? 16 : 40); console.log(`   difficile-normale ${a}-${b}`); yes(a >= b * 0.8, 'difficile troppo debole'); });

// ---------------------------------------------------------------- plug-in through the framework
t('plug-in: Sit & Go e cash fino alla fine, fiches conservate tra le mani', () => {
  for (const variant of ['torneo', 'cash']) for (const n of [2, 3, 4, 6]) for (let i = 0; i < (QUICK ? 2 : 5); i++) {
    const lv = Array.from({ length: n }, (_, p) => ['facile', 'normale'][(p + i) % 2]);
    const { M } = simulate(poker, { variant, n, seed: 100 * n + i, target: variant === 'cash' ? 25 : 0, options: { velocita: 'turbo' }, seats: lv.map((l) => ({ kind: 'cpu', level: l })) }, lv);
    yes(M.over, `${variant} ${n}: partita non finita`);
    const rb = M.rounds.reduce((a, r) => a + (r.records._rb || []).reduce((x, y) => x + y, 0), 0);
    eq(M.totals.reduce((a, b) => a + b, 0), rb, `${variant} ${n}: somma dei bilanci = ricariche`);
    if (variant === 'torneo') { eq(M.totals.filter((x) => x > -E.START.torneo).length, 1, 'un solo sopravvissuto'); yes(M.winner === M.totals.findIndex((x) => x > -E.START.torneo)); }
    eq(JSON.parse(JSON.stringify(M)), M, 'stato salvabile');
  }
});
t('plug-in: bui che salgono, bottone che gira, ricarica cash', () => {
  eq(blindsFor('torneo', 0, 'turbo'), { level: 0, sb: 10, bb: 20, next: 5, per: 5 });
  eq(blindsFor('torneo', 5, 'turbo').bb, 30); eq(blindsFor('torneo', 16, 'normale').bb, 50); eq(blindsFor('cash', 99).bb, 20);
  const M = newMatch(poker, { variant: 'cash', n: 3, seed: 5, target: 10, seats: [{ kind: 'human' }, { kind: 'cpu' }, { kind: 'cpu' }], options: {} });
  const btn0 = M.state.btn;
  while (!poker.isOver(M.state)) play(poker, M, aiMove(poker, M, 'normale'));
  endRound(poker, M); nextRound(poker, M);
  eq(M.state.btn, (btn0 + 1) % 3, 'il bottone gira'); eq(M.dealer.hist.length, 1, 'storia della mano');
  // a busted cash player is reloaded with fake chips
  const s = poker.setup(1, { n: 2, variant: 'cash', round: 3, totals: [-2000, 2000], dealer: carryOf(0, 2) });
  eq(s.start, [2000, 4000]); eq(s.rebuy, [2000, 0]);
  const sc = poker.scores({ ...s, stacks: s.start.slice(), over: true, result: { won: [0, 0], shown: [], names: {}, pots: [] } });
  eq(sc.points, [2000, 0], 'il bilancio conta le fiches ricaricate');
  // match end rules
  eq(poker.matchOver([1500, -1500], { variant: 'torneo', seats: [{ kind: 'human' }, { kind: 'cpu' }] }, []), 0);
  eq(poker.matchOver([-1500, 700, 800], { variant: 'torneo', seats: [{ kind: 'human' }, { kind: 'cpu' }, { kind: 'cpu' }] }, []), 2, 'umano eliminato: vince il capolista');
  eq(poker.matchOver([-200, 100, 100], { variant: 'torneo', seats: [{ kind: 'human' }, { kind: 'cpu' }, { kind: 'cpu' }] }, []), -1);
  eq(poker.matchOver([2000, 0], { variant: 'cash', target: 2 }, [{ records: { _rb: [2000, 0] } }, { records: { _rb: [0, 0] } }]), 'draw', 'cash: ricariche escluse');
});
t('plug-in: vista e mosse (carte coperte agli altri, niente id doppi)', () => {
  const M = newMatch(poker, { variant: 'torneo', n: 6, seed: 3, target: 0, seats: [{ kind: 'human' }, { kind: 'human' }, ...Array(4).fill({ kind: 'cpu' })], options: {} });
  let guard = 0;
  while (!poker.isOver(M.state) && guard++ < 200) {
    const s = M.state, v = poker.view(s, 0, { seats: M.cfg.seats, n: 6, portrait: guard % 2 === 0 });
    const ids = v.piles.flatMap((p) => p.cards.map((c) => (typeof c === 'string' ? c : c.id)));
    eq(new Set(ids).size, ids.length, 'id di carta doppi');
    for (const p of v.piles) if (/^h[1-5]$/.test(p.id)) yes(p.cards.every((c) => c.up === false), 'carte avversarie scoperte prima dello showdown');
    yes(legalFor(poker, M).every((m) => typeof m.label === 'string'));
    yes(typeof poker.status(s, 0) === 'string');
    play(poker, M, aiMove(poker, M, 'normale'));
    for (const f of poker.steps(s, legalFor(poker, { ...M, state: s })[0] || { a: 'check' }) || []) poker.view(f, 0, { seats: M.cfg.seats, n: 6 });
  }
  const sc = poker.scores(M.state);
  yes(sc.rows.length >= 4 && /Fiches finte/.test(sc.note));
});

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
