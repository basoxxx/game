// Carte Baso — rules and scoring tests + AI-vs-AI soak for every plug-in in src/carte/games.
//   node tools/carte-test.mjs            (QUICK=1 for a shorter soak)
// Exits non-zero on the first failure. Every AI move is validated against legalMoves().
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDeck, shuffle, rank, suit, deal, rng, nextRand, seedOf, cardName, base, copyOf, isJoker, deckOf, isRed } from '../src/carte/core/cards.js';
import { newMatch, play, legalFor, endRound, nextRound, simulate, aiMove, findLegal, moveKey } from '../src/carte/core/match.js';
import { captures, primiera, napola, tally } from '../src/carte/games/scopa.js';
import { trickWinner, pts, signalOf } from '../src/carte/games/briscola.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };

// plug-ins (node has no import.meta.glob: read the folder)
const games = [];
for (const f of readdirSync(join(ROOT, 'src/carte/games')).filter((x) => x.endsWith('.js') && !x.endsWith('.meta.js'))) {
  const m = await import(pathToFileURL(join(ROOT, 'src/carte/games', f)).href);
  if (m.default?.id && typeof m.default.setup === 'function') games.push(m.default);
}
const G = Object.fromEntries(games.map((g) => [g.id, g]));

// ---------------------------------------------------------------- core
t('mazzi', () => {
  eq(makeDeck('it40').length, 40); eq(makeDeck('fr52').length, 52); eq(makeDeck('fr52', { copies: 2, jokers: 4 }).length, 108);
  eq(new Set(makeDeck('fr52', { copies: 2, jokers: 4 })).size, 108, 'id unici');
  eq(rank('10b'), 10); eq(suit('10b'), 'b'); eq(rank('13H~2'), 13); eq(suit('13H~2'), 'H'); eq(base('13H~2'), '13H'); eq(copyOf('13H~2'), 2);
  yes(isJoker('2J~2')); eq(deckOf('7d'), 'it40'); eq(deckOf('7D'), 'fr52'); yes(isRed('1J')); yes(!isRed('2J'));
  eq(cardName('7d'), 'Sette di Denari'); eq(cardName('12H'), 'Donna di Cuori'); eq(cardName('9s'), 'Cavallo di Spade');
});
t('rng e mescolata deterministici', () => {
  const a = shuffle(makeDeck('it40'), { rng: 42 }), b = shuffle(makeDeck('it40'), { rng: 42 });
  eq(a, b); yes(JSON.stringify(a) !== JSON.stringify(makeDeck('it40')));
  eq(new Set(a).size, 40); const r = rng('x'); const v = r(); yes(v >= 0 && v < 1); eq(nextRand(seedOf(5))[1], nextRand(5)[1]);
  const d = deal(makeDeck('it40'), 4, 10); eq(d.hands.map((h) => h.length), [10, 10, 10, 10]); eq(d.rest.length, 0);
});
t('mosse: chiave canonica', () => { eq(moveKey({ card: 'a', label: 'x', take: [] }), moveKey({ take: [], card: 'a' })); yes(findLegal([{ card: '1d', take: ['1c'] }], { take: ['1c'], card: '1d', label: 'z' })); });

// ---------------------------------------------------------------- Scopa
t('scopa: presa per uguale obbligatoria', () => {
  eq(captures('7d', ['7c', '3b', '4s']), [['7c']]);
  eq(captures('7d', ['7c', '7s']).length, 2);
});
t('scopa: prese per somma', () => {
  const c = captures('10d', ['2c', '3b', '5s', '7d', '8c']).map((x) => x.slice().sort().join(',')).sort();
  eq(c, ['2c,3b,5s', '2c,8c', '3b,7d'].map((x) => x.split(',').sort().join(',')).sort());
  eq(captures('2d', ['3c', '4b']), []);
  eq(captures('1d', ['3c', '4b'], 'assi'), [['3c', '4b']]);
  eq(captures('1d', ['1c', '4b'], 'assi'), [['1c']]);
  eq(captures('1d', [], 'assi'), []);
});
t('scopa: primiera e napola', () => {
  eq(primiera(['7d', '7c', '7s', '7b']), 84);
  eq(primiera(['7d', '6c', '1s', '10b']), 21 + 18 + 16 + 10);
  eq(primiera(['7d', '7c', '7s']), 0, 'manca un seme');
  eq(napola(['1d', '2d', '3d', '4d', '6d']), 4); eq(napola(['1d', '2d']), 0);
});
t('scopa: punteggio di una smazzata', () => {
  const s = { teams: [[0], [1]], napola: false, scope: [2, 1], caps: [[], []] };
  const all = makeDeck('it40');
  s.caps[0] = all.filter((c) => suit(c) === 'd' || suit(c) === 'c' || c === '7s' || c === '7b' || c === '1s'); // 23 cards
  s.caps[1] = all.filter((c) => !s.caps[0].includes(c));
  const T = tally(s);
  eq(T.nC, [23, 17]); eq(T.nD, [10, 0]); eq(T.sb, 0); eq(T.bP, 0); eq(T.points, [4 + 2, 1]);
  const s2 = { teams: [[0], [1]], napola: false, scope: [0, 0], caps: [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2)] };
  const T2 = tally(s2); eq(T2.nC, [20, 20]); eq(T2.bC, -1, 'carte 20-20: nessuno');
});
t('scopa: scopa e ultima presa', () => {
  const g = G.scopa;
  let s = g.setup(7, { n: 2, variant: 'classica', dealer: 1 });
  eq(s.table.length, 4); eq(s.hands.map((h) => h.length), [3, 3]); eq(s.deck.length, 30); eq(s.turn, 0);
  // forced position: table 3+4, player 0 has a 7 -> scopa
  s = { ...s, table: ['3c', '4b'], hands: [['7s', '2d', '5d'], ['1c', '1b', '9d']], deck: ['6c'] };
  let ms = g.legalMoves(s, 0); yes(ms.some((m) => m.card === '7s' && m.take.length === 2));
  s = g.apply(s, ms.find((m) => m.card === '7s')); eq(s.scope[0], 1); eq(s.table, []); eq(s.turn, 1);
  // last play of the hand never scores a scopa; leftover cards go to the last taker
  let z = { ...g.setup(3, { n: 2 }), table: ['5c'], hands: [['5b'], []], deck: [], turn: 0, caps: [[], []], scope: [0, 0], lastTaker: 1 };
  z = g.apply(z, { card: '5b', take: ['5c'] }); eq(z.scope[0], 0, 'niente scopa all’ultima'); yes(g.isOver(z));
  let y = { ...g.setup(3, { n: 2 }), table: ['5c', '2b'], hands: [['9b'], []], deck: [], turn: 0, caps: [[], []], scope: [0, 0], lastTaker: 1 };
  y = g.apply(y, { card: '9b', take: [] }); eq(y.caps[1].sort(), ['2b', '5c', '9b'].sort(), 'tavolo all’ultimo che ha preso');
});
t('scopa: varianti e distribuzione', () => {
  const g = G.scopa;
  const a = g.setup(11, { n: 4, variant: 'scopone' }); eq(a.table.length, 0); eq(a.hands.map((h) => h.length), [10, 10, 10, 10]); eq(a.teams, [[0, 2], [1, 3]]);
  const b = g.setup(11, { n: 3, variant: 'classica' }); eq(b.hands.map((h) => h.length), [3, 3, 3]); eq(b.deck.length, 27);
  for (let i = 0; i < 200; i++) { const c = g.setup(i, { n: 2, variant: 'assi' }); yes(!c.table.some((x) => rank(x) === 1), 'niente assi in tavola'); const d = g.setup(i, { n: 2 }); yes(d.table.filter((x) => rank(x) === 10).length < 3, 'non tre re'); }
  const ace = { ...g.setup(5, { n: 2, variant: 'assi' }), table: ['3c', '4b', '9s'], hands: [['1d', '2c', '2b'], ['5c', '6c', '7c']], turn: 0 };
  const m = g.legalMoves(ace, 0).find((x) => x.card === '1d'); eq(m.take.length, 3);
  const after = g.apply(ace, m); eq(after.scope[0], 0, 'l’asso che piglia tutto non fa scopa'); eq(after.table, []);
});
t('scopa: napola nel punteggio dello scopone', () => {
  const s = { teams: [[0, 2], [1, 3]], napola: true, scope: [0, 0, 0, 0], caps: [['1d', '2d', '3d', '4d'], [], [], ['5c']] };
  eq(tally(s).nap, [4, 0]);
});

// ---------------------------------------------------------------- Briscola
t('briscola: presa', () => {
  eq(trickWinner([{ p: 0, c: '2c' }, { p: 1, c: '1c' }], 'd'), 1, 'asso batte il due');
  eq(trickWinner([{ p: 0, c: '1c' }, { p: 1, c: '2d' }], 'd'), 1, 'la briscola taglia');
  eq(trickWinner([{ p: 0, c: '3c' }, { p: 1, c: '1s' }], 'd'), 0, 'seme diverso non prende');
  eq(trickWinner([{ p: 0, c: '10c' }, { p: 1, c: '3c' }], 'd'), 1, 'il tre batte il re');
  eq(trickWinner([{ p: 0, c: '5d' }, { p: 1, c: '4d' }, { p: 2, c: '1c' }, { p: 3, c: '7d' }], 'd'), 3);
  eq(makeDeck('it40').reduce((a, c) => a + pts(c), 0), 120);
});
t('briscola: distribuzione e pescata', () => {
  const g = G.briscola;
  const s = g.setup(9, { n: 2, dealer: 0 }); eq(s.hands.map((h) => h.length), [3, 3]); eq(s.deck.length, 34); eq(s.deck[0], s.trump); eq(s.turn, 1);
  let x = s; for (let i = 0; i < 2; i++) x = g.apply(x, g.legalMoves(x, x.turn)[0]);
  eq(x.hands.map((h) => h.length), [3, 3]); eq(x.deck.length, 32);
  const q = g.setup(9, { n: 4, segnali: true }); eq(q.hands.map((h) => h.length), [3, 3, 3, 3]); eq(q.deck.length, 28); yes(signalOf(q, 0).text);
  // play out: the trump card is the last card drawn
  let y = g.setup(4, { n: 2 }); const tr = y.trump; let drawnLast = null;
  while (!g.isOver(y)) { const before = new Set(y.hands.flat()); y = g.apply(y, g.legalMoves(y, y.turn)[0]); for (const c of y.hands.flat()) if (!before.has(c)) drawnLast = c; }
  eq(drawnLast, tr); eq(y.won.flat().length, 40); eq(g.scores(y).rows[0].values.reduce((a, b) => a + b, 0), 120);
});

// ---------------------------------------------------------------- AI soak: every plug-in
const LV = ['facile', 'normale', 'difficile'];
const configs = (g) => {
  const out = [];
  for (const v of g.variants?.length ? g.variants : [{ id: null, players: g.players }]) {
    const [lo, hi] = v.players || g.players;
    for (let n = lo; n <= hi; n++) out.push({ variant: v.id, n, options: Object.fromEntries((g.options || []).map((o) => [o.id, o.default])) });
  }
  return out;
};
for (const g of games) {
  const t0 = Date.now(); let matches = 0, rounds = 0, moves = 0;
  const per = g.id === 'scopa' || g.id === 'briscola' ? (QUICK ? 60 : 250) : (QUICK ? 30 : 150);
  t(`${g.id}: ${per} partite IA contro IA per configurazione senza mosse illegali`, () => {
    for (const cfg of configs(g)) {
      for (let i = 0; i < per; i++) {
        // difficile is expensive: one seat in a few matches
        const levels = Array.from({ length: cfg.n }, (_, p) => (i % 10 === 0 && p === 0 ? 'difficile' : LV[(i + p) % 2]));
        const { M, steps } = simulate(g, { ...cfg, seed: i * 97 + cfg.n, target: g.defaultTarget ?? 11, seats: levels.map((l) => ({ kind: 'cpu', level: l })) }, levels);
        yes(M.over, `${g.id} ${JSON.stringify(cfg)} seed ${i}: partita non finita`);
        matches++; rounds += M.rounds.length; moves += steps;
        // JSON round-trip of the state (it is saved to localStorage)
        eq(JSON.parse(JSON.stringify(M.state)), M.state);
      }
    }
  });
  console.log(`  ${g.id}: ${matches} partite, ${rounds} smazzate, ${moves} mosse in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// AI strength: the levels must be ordered
const duel = (g, cfg, a, b, N) => {
  let wa = 0, wb = 0;
  for (let i = 0; i < N; i++) {
    const swap = i % 2; const lv = Array.from({ length: cfg.n }, (_, p) => ((p % 2 === 0) !== !!swap ? a : b));
    const { M } = simulate(g, { ...cfg, seed: 5000 + i, target: cfg.target }, lv);
    if (M.winner === 'draw') continue;
    const winA = (M.winner % 2 === 0) !== !!swap; if (winA) wa++; else wb++;
  }
  return [wa, wb];
};
t('scopa: Normale batte Facile', () => { const [a, b] = duel(G.scopa, { variant: 'classica', n: 2, target: 11 }, 'normale', 'facile', QUICK ? 40 : 120); console.log(`  scopa normale-facile ${a}-${b}`); yes(a > b * 1.3, 'normale troppo debole'); });
t('scopa: Difficile batte Normale', () => { const [a, b] = duel(G.scopa, { variant: 'classica', n: 2, target: 11 }, 'difficile', 'normale', QUICK ? 12 : 30); console.log(`  scopa difficile-normale ${a}-${b}`); yes(a >= b, 'difficile non migliore'); });
t('briscola: Normale batte Facile', () => { const [a, b] = duel(G.briscola, { variant: 'due', n: 2, target: 1 }, 'normale', 'facile', QUICK ? 100 : 300); console.log(`  briscola normale-facile ${a}-${b}`); yes(a > b * 1.3); });
t('briscola: Difficile batte Normale', () => { const [a, b] = duel(G.briscola, { variant: 'due', n: 2, target: 1 }, 'difficile', 'normale', QUICK ? 40 : 100); console.log(`  briscola difficile-normale ${a}-${b}`); yes(a > b); });

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
