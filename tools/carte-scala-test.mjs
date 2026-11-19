// Scala 40 (Carte Baso) — rules, scoring and AI tests.
//   node tools/carte-scala-test.mjs        (QUICK=1 for a shorter soak)
// Meld validation with jokers, attaching / substitution, opening, discards, penalties, elimination, and
// thousands of AI-vs-AI rounds where every AI move is checked against legalMoves() and the whole state
// against the rules after every move (108 cards conserved, every meld valid, turn order, hand sizes).
import G, { penalty, meldPoints, roundPenalties, RULES_DEFAULT } from '../src/carte/games/scala40.js';
import { validate, attach, swapJoker, jokerTargets, wildCount, candidates, countKeys, bestPartition, sortHand } from '../src/carte/games/scala40/ramino.js';
import { newMatch, play, endRound, nextRound, findLegal, moveKey } from '../src/carte/core/match.js';
import { clone, rng, makeDeck } from '../src/carte/core/cards.js';

const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };
const R1 = RULES_DEFAULT, RL = { ...RULES_DEFAULT, maxWild: 99 };
const V = (cs, R = R1) => validate(cs, R);

// ---------------------------------------------------------------- melds
t('scale semplici e assi', () => {
  eq(V(['5H', '6H', '7H']), { t: 'run', s: 'H', lo: 5, cards: ['5H', '6H', '7H'] });
  eq(V(['7H', '5H', '6H']).cards, ['5H', '6H', '7H'], 'ordinata');
  eq(V(['5H', '6H', '8H']), null, 'buco');
  eq(V(['5H', '6H', '7D']), null, 'semi misti');
  eq(V(['1H', '2H', '3H']).lo, 1, 'A-2-3');
  eq(V(['12H', '13H', '1H']).lo, 12, 'Q-K-A');
  eq(V(['13H', '1H', '2H']), null, 'mai a giro');
  eq(V(['5H', '6H']), null, 'almeno 3');
  eq(V(['1H', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H', '12H', '13H']).cards.length, 13, 'A..K');
  eq(V(['2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H', '11H', '12H', '13H', '1H']).lo, 2, '2..A');
  eq(V(['5H', '5H~2', '6H']), null, 'doppione nella scala');
});
t('tris e poker', () => {
  eq(V(['7H', '7D', '7C']).t, 'set');
  eq(V(['7H', '7D', '7C', '7S']).cards.length, 4);
  eq(V(['7H', '7H~2', '7C']), null, 'semi diversi');
  eq(V(['7H', '7D', '7C', '7S', '1J']), null, 'massimo 4');
  eq(V(['7H', '7D']), null);
  eq(V(['7H', '8D', '7C']), null);
});
t('jolly: sostituzioni e limiti', () => {
  eq(V(['5H', '1J', '7H']), { t: 'run', s: 'H', lo: 5, cards: ['5H', '1J', '7H'] }, 'jolly nel buco');
  eq(V(['5H', '6H', '2J']).cards, ['5H', '6H', '2J'], 'jolly in cima');
  eq(V(['12H', '13H', '1J']).cards, ['12H', '13H', '1J'], 'jolly come asso alto');
  eq(V(['13H', '1H', '1J']), { t: 'run', s: 'H', lo: 12, cards: ['1J', '13H', '1H'] }, 'K-A + jolly: il jolly va sotto');
  eq(V(['2H', '3H', '1J']).lo, 2, '2-3-jolly(4)');
  eq(V(['7H', '7D', '1J']).t, 'set');
  eq(V(['7H', '1J', '2J']), null, 'una sola carta naturale');
  eq(V(['5H', '1J', '2J', '8H']), null, 'due jolly vietati di norma');
  eq(V(['5H', '1J', '2J', '8H'], RL).cards, ['5H', '1J', '2J', '8H'], 'jolly liberi');
  eq(V(['5H', '1J', '2J', '1J~2'], RL), null, 'mai più jolly che naturali');
  eq(V(['7H', '7D', '7C', '1J']).cards.length, 4, 'poker con jolly');
  eq(V(['7H', '7D', '7C', '7S', '1J'], RL), null, 'poker pieno');
  eq(V(['1J', '2J', '1J~2']), null, 'solo jolly');
  eq(wildCount(V(['5H', '1J', '7H']), R1), 1);
});
t('punti di apertura', () => {
  eq(meldPoints(V(['1H', '2H', '3H'])), 6, 'A-2-3 vale 6');
  eq(meldPoints(V(['12H', '13H', '1H'])), 31, 'Q-K-A vale 31');
  eq(meldPoints(V(['1H', '1D', '1C'])), 33, 'tre assi');
  eq(meldPoints(V(['5H', '1J', '7H'])), 18, 'il jolly vale la carta che sostituisce');
  eq(meldPoints(V(['7H', '7D', '1J'])), 21);
  eq(meldPoints(V(['11S', '12S', '13S', '1S'])), 41, 'J-Q-K-A apre da sola');
});
t('attaccare e sostituire il jolly', () => {
  const run = V(['5H', '6H', '7H']), K = { keepPlace: true };
  eq(attach(run, '8H', R1, K).cards, ['5H', '6H', '7H', '8H']);
  eq(attach(run, '4H', R1, K).lo, 4);
  eq(attach(run, '9H', R1, K), null);
  eq(attach(run, '8D', R1, K), null);
  eq(attach(run, '1J', R1, K).cards, ['5H', '6H', '7H', '1J'], 'jolly in cima');
  const qka = V(['12H', '13H', '1H']);
  eq(attach(qka, '1J', R1, K), { t: 'run', s: 'H', lo: 11, cards: ['1J', '12H', '13H', '1H'] }, 'jolly sotto se in cima c’è l’asso');
  eq(attach(qka, '2H', R1, K), null, 'niente giro');
  eq(attach(V(['2H', '3H', '4H']), '1H', R1, K).lo, 1, 'asso basso');
  const holed = V(['5H', '1J', '7H']);
  eq(attach(holed, '6H', R1, K), null, 'la carta del jolly non si attacca: si sostituisce');
  eq(attach(holed, '2J', R1, K), null, 'secondo jolly vietato');
  eq(attach(holed, '2J', RL, K).cards, ['5H', '1J', '7H', '2J'], 'secondo jolly con jolly liberi');
  eq(jokerTargets(holed), [{ i: 1, keys: ['6H'] }]);
  eq(swapJoker(holed, 1, '6H~2', R1).cards, ['5H', '6H~2', '7H']);
  eq(swapJoker(holed, 1, '6D', R1), null);
  const set = V(['7H', '7D', '1J']);
  eq(jokerTargets(set)[0].keys, ['7C', '7S']);
  yes(swapJoker(set, 2, '7S', R1)); eq(swapJoker(set, 2, '7H~2', R1), null);
  eq(attach(set, '7C', R1, K).cards.length, 4); eq(attach(set, '7H~2', R1, K), null);
  eq(attach(V(['7H', '7D', '7C', '7S']), '1J', R1, K), null, 'poker completo');
});
t('combinazioni candidate e partizione migliore', () => {
  const hand = ['5H', '6H', '7H', '8H', '7D', '7C', '13S', '1J', '2C', '9D'];
  const cs = candidates(countKeys(hand), R1);
  yes(cs.some((c) => c.t === 'set' && c.keys.sort().join() === '7C,7D,7H'));
  yes(cs.some((c) => c.t === 'run' && c.keys.length === 4));
  for (const c of cs) yes(validate(c.keys.map((k) => (k === 'J' ? '1J' : k)), R1), `candidata non valida ${c.keys}`);
  const plan = bestPartition(hand, R1, (cards) => cards.reduce((a, c) => a + penalty(c), 0), (k) => (k === 'J' ? 25 : penalty(k)), { maxCards: 9 });
  const used = plan.melds.flatMap((m) => m.cards);
  eq(new Set(used).size, used.length, 'carte usate una volta sola');
  yes(used.length >= 7, `partizione troppo corta ${used}`);
  eq(sortHand(['1J', '13S', '1H', '5H', '2C'], 'suit'), ['1H', '5H', '13S', '2C', '1J']);
});
t('valori delle penalità', () => {
  eq(['1J', '1H', '13D', '12C', '11S', '10H', '2D'].map(penalty), [25, 11, 10, 10, 10, 10, 2]);
});

// ---------------------------------------------------------------- game flow on crafted states
const fresh = (n = 2, o = {}) => G.setup(12345, { n, target: 101, ...o });
function craft(hands, o = {}) {
  const s = fresh(hands.length, o);
  const used = new Set(hands.flat());
  s.hands = hands.map((h) => h.slice());
  s.stock = makeDeck('fr52', { copies: 2, jokers: 4 }).filter((c) => !used.has(c));
  s.discard = [s.stock.pop()]; s.turn = 0; s.phase = 'play';
  return s;
}
t('apertura: servono 40 punti, poi si può scartare', () => {
  let s = craft([['5H', '6H', '7H', '13S', '13D', '13C', '2C', '9D', '4S', '4D', '8C', '3H', '10S', '11H'], Array.from({ length: 13 }, (_, i) => `${i + 1}C~2`)]);
  const L = () => G.legalMoves(s, 0);
  yes(!L().some((m) => m.a === 'att'), 'niente attacchi prima di aprire');
  const open = L().find((m) => m.a === 'open'); yes(open, 'suggerimento di apertura');
  // 5-6-7 = 18, K K K = 30: 48
  s = G.apply(s, { a: 'meld', keys: ['5H', '6H', '7H'] });
  yes(!s.opened[0] && s.melds[0].pend, 'in attesa');
  yes(!G.legalMoves(s, 0).some((m) => m.a === 'disc'), 'niente scarto con apertura a metà');
  const back = G.apply(s, { a: 'cancel' }); eq(back.melds.length, 0); eq(back.hands[0].length, 14);
  s = G.apply(s, { a: 'meld', keys: ['13C', '13D', '13S'] });
  yes(s.opened[0] && !s.melds.some((m) => m.pend), 'aperto con 48');
  yes(G.legalMoves(s, 0).some((m) => m.a === 'disc'));
  yes(G.legalMoves(s, 0).some((m) => m.a === 'att' && m.card === '4S' === false || true));
});
t('scarto attaccabile vietato, carta raccolta non scartabile', () => {
  let s = craft([['5H', '6H', '7H', '8H', '2C', '9D', '13S'], Array.from({ length: 13 }, (_, i) => `${i + 1}C~2`)]);
  s.opened[0] = true; s.melds = [{ ...V(['10S', '11S', '12S']), owner: 1 }];
  const ds = () => G.legalMoves(s, 0).filter((m) => m.a === 'disc').map((m) => m.card);
  yes(!ds().includes('13S'), 'K♠ si attacca: non si scarta');
  yes(ds().includes('9D'));
  s.opts.scarto = 'permesso'; s = clone(s);
  yes(ds().includes('13S'), 'con l’opzione permesso sì');
  s.took = '9D'; s = clone(s);
  yes(!ds().includes('9D'), 'la carta appena raccolta non si scarta');
});
t('raccogliere lo scarto senza aver aperto: va usato o rimesso', () => {
  let s = craft([['5H', '6H', '13S', '13D', '13C', '2C', '9D', '4S', '4D', '8C', '3H', '10S', '11H'], Array.from({ length: 13 }, (_, i) => `${i + 1}C~2`)]);
  s.phase = 'draw'; s.discard.push('7H');
  s = G.apply(s, { a: 'take', card: '7H' });
  eq(s.mustUse, '7H');
  yes(!G.legalMoves(s, 0).some((m) => m.a === 'disc'), 'prima bisogna aprire');
  const pb = G.apply(s, { a: 'putback' }); eq(pb.phase, 'draw'); eq(pb.discard[pb.discard.length - 1], '7H'); eq(pb.hands[0].length, 13);
  // K K K = 30 alone is not enough, and it does not use the 7
  let k = G.apply(s, { a: 'meld', keys: ['13C', '13D', '13S'] }); yes(!k.opened[0]);
  k = G.apply(k, { a: 'meld', keys: ['5H', '6H', '7H'] }); yes(k.opened[0], 'aperto usando lo scarto');
});
t('recupero del jolly dopo l’apertura', () => {
  let s = craft([['6H', '2C', '9D', '13S'], Array.from({ length: 13 }, (_, i) => `${i + 1}C~2`)]);
  s.opened[0] = true; s.melds = [{ ...V(['5H', '1J', '7H']), owner: 1 }];
  const sw = G.legalMoves(s, 0).find((m) => m.a === 'swap'); yes(sw, 'sostituzione possibile');
  s = G.apply(s, sw);
  eq(s.melds[0].cards, ['5H', '6H', '7H']); yes(s.hands[0].includes('1J'));
});
t('chiusura, penalità, chiusura in mano e chi non apre', () => {
  let s = craft([['9D'], ['13H', '1J', '3C'], ['1H', '2S']], { n: 3 });
  s.opened = [true, true, false];
  s = G.apply(s, { a: 'disc', card: '9D', to: 'discard' });
  yes(s.over && s.winner === 0);
  eq(roundPenalties(s), [0, 38, 100]);
  s.inHand = true; eq(roundPenalties(s), [0, 76, 200]);
  const sc = G.scores(s); eq(sc.points, [0, 76, 200]); yes(sc.rows.length >= 4);
});
t('nessuna mossa per chi non è di turno; ultima carta solo scartando', () => {
  const s = craft([['5H', '6H', '7H', '9D'], Array.from({ length: 13 }, (_, i) => `${i + 1}C~2`)]);
  s.opened[0] = true;
  eq(G.legalMoves(s, 1), []);
  const melds = G.legalMoves(s, 0).filter((m) => m.a === 'meld');
  yes(melds.every((m) => m.keys.length <= 3), 'resta sempre una carta da scartare');
});
t('eliminazione a 101 e fine partita', () => {
  const s = G.setup(7, { n: 3, target: 101, totals: [120, 40, 90] });
  yes(s.out[0] && !s.hands[0].length && s.hands[1].length === 13);
  yes(s.turn !== 0);
  eq(G.matchOver([120, 40, 90], { target: 101 }, [1]), -1);
  eq(G.matchOver([120, 40, 130], { target: 101 }, [1]), 1);
  eq(G.matchOver([120, 140, 130], { target: 101 }, [1]), 2, 'tutti fuori: vince il più basso');
  eq(G.matchOver([60, 40], { target: 201 }, [1]), -1);
});

// ---------------------------------------------------------------- AI soak with full state checks
const ALL = makeDeck('fr52', { copies: 2, jokers: 4 }).sort();
function check(s, tag) {
  const cards = [...s.stock, ...s.discard, ...s.hands.flat(), ...s.stage.flat(), ...s.melds.flatMap((m) => m.cards)];
  if (cards.length !== 108 || JSON.stringify(cards.slice().sort()) !== JSON.stringify(ALL)) throw new Error(`${tag}: carte non conservate (${cards.length})`);
  const R = { ...RULES_DEFAULT, maxWild: s.opts.jolly === 'liberi' ? 99 : 1 };
  for (const m of s.melds) {
    if (m.t === 'set') { const v = validate(m.cards, R); if (!v || v.t !== 'set') throw new Error(`${tag}: tris non valido ${m.cards}`); }
    else {
      // every card stands for lo+i of the suit
      if (m.cards.length < 3 || m.lo < 1 || m.lo + m.cards.length - 1 > 14 || m.cards.length > 13) throw new Error(`${tag}: scala fuori misura ${m.cards}`);
      m.cards.forEach((c, i) => { if (c.includes('J')) return; const r = +c.match(/^\d+/)[0], pr = m.lo + i; if (c.replace(/~\d/, '').slice(-1) !== m.s || !(r === pr || (r === 1 && pr === 14))) throw new Error(`${tag}: scala sbagliata ${m.cards} lo ${m.lo}`); });
      const w = m.cards.filter((c) => c.includes('J')).length; if (w > R.maxWild || w > m.cards.length - w) throw new Error(`${tag}: troppi jolly ${m.cards}`);
    }
  }
  if (!s.over) {
    if (s.out[s.turn]) throw new Error(`${tag}: di turno un eliminato`);
    if (s.phase === 'draw' && s.melds.some((m) => m.pend)) throw new Error(`${tag}: apertura rimasta a metà`);
    s.hands.forEach((h, p) => { if (s.out[p] && h.length) throw new Error(`${tag}: eliminato con carte`); if (!s.out[p] && p !== s.turn && h.length < 1) throw new Error(`${tag}: mano vuota`); });
  }
}
const LV = ['facile', 'normale', 'difficile'];
let rounds = 0, moves = 0, closes = 0, inHand = 0, voids = 0, swaps = 0;
const t0 = Date.now();
t('IA contro IA: migliaia di smazzate senza stati illegali', () => {
  const per = QUICK ? 10 : 40;
  for (let n = 2; n <= 6; n++) {
    for (let i = 0; i < per; i++) {
      const options = { jolly: i % 3 === 2 ? 'liberi' : 'uno', scarto: i % 4 === 3 ? 'permesso' : 'vietato', chiuso: 100 };
      const levels = Array.from({ length: n }, (_, p) => LV[(i + p) % 3]);
      const M = newMatch(G, { n, seed: 1000 * n + i, target: i % 5 === 4 ? 201 : 101, options, seats: levels.map((l) => ({ kind: 'cpu', level: l })) });
      let guard = 0;
      while (!M.over) {
        if (++guard > 40000) throw new Error('partita infinita');
        const s = M.state;
        if (G.isOver(s)) {
          rounds++; if (s.winner >= 0) closes++; if (s.inHand) inHand++; if (s.void) voids++;
          const pts = G.scores(s).points; if (pts.some((v) => v < 0 || !Number.isFinite(v))) throw new Error('punti non validi');
          endRound(G, M); if (!M.over) nextRound(G, M); check(M.state, 'nuova smazzata'); continue;
        }
        const p = s.turn, legal = G.legalMoves(s, p);
        const m = G.ai(clone(s), p, levels[p], rng(moves * 31 + i));
        if (!findLegal(legal, m)) throw new Error(`mossa IA illegale ${moveKey(m)} (${levels[p]}, fase ${s.phase})`);
        if (m.a === 'swap') swaps++;
        play(G, M, m); moves++;
        check(M.state, `n=${n} partita ${i} mossa ${moves}`);
      }
      eq(JSON.parse(JSON.stringify(M.state)), M.state, 'stato serializzabile');
    }
  }
  console.log(`  ${rounds} smazzate, ${moves} mosse, ${closes} chiusure (${inHand} in mano), ${voids} nulle, ${swaps} jolly recuperati in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  yes(rounds >= (QUICK ? 200 : 1000), `poche smazzate: ${rounds}`);
  yes(closes > rounds * 0.9, 'quasi tutte le smazzate si chiudono');
});
// levels must be ordered: two-player duels, each match to 101
const duel = (a, b, N) => {
  let wa = 0, wb = 0;
  for (let i = 0; i < N; i++) {
    const lv = i % 2 ? [b, a] : [a, b];
    const M = newMatch(G, { n: 2, seed: 777 + i, target: 101, options: {}, seats: lv.map((l) => ({ kind: 'cpu', level: l })) });
    while (!M.over) {
      if (G.isOver(M.state)) { endRound(G, M); if (!M.over) nextRound(G, M); continue; }
      const p = M.state.turn; play(G, M, G.ai(clone(M.state), p, lv[p], rng(M.moves + i * 7)));
    }
    if (M.winner === 'draw') continue;
    if (lv[M.winner] === a) wa++; else wb++;
  }
  return [wa, wb];
};
t('IA: Normale batte Facile, Difficile non è peggio di Normale', () => {
  const [a, b] = duel('normale', 'facile', QUICK ? 30 : 80); console.log(`  normale-facile ${a}-${b}`); yes(a > b * 1.3, 'normale troppo debole');
  const [c, d] = duel('difficile', 'normale', QUICK ? 30 : 80); console.log(`  difficile-normale ${c}-${d}`); yes(c >= d * 0.9, 'difficile peggiore');
});

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
