// Burraco (Carte Baso) — rules, scoring and AI tests.
//   node tools/carte-burraco-test.mjs        (QUICK=1 for a shorter soak)
// Melds with jokers and pinelle (natural 2s, sliding wildcards), burraco pulito/sporco, pozzetto in volo
// and by discard, closing rules, the scoring table, and thousands of AI-vs-AI rounds (in two and in pairs)
// where every AI move is checked against legalMoves() and the state against the rules after every move.
import G, { R, value, isBurraco, isPulito, tally } from '../src/carte/games/burraco.js';
import { validate, attach, wildCount } from '../src/carte/games/scala40/ramino.js';
import { newMatch, play, endRound, nextRound, findLegal, moveKey } from '../src/carte/core/match.js';
import { clone, rng, makeDeck } from '../src/carte/core/cards.js';

const QUICK = !!process.env.QUICK;
let ok = 0, fail = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { fail++; console.error(`✗ ${name}\n   ${e.stack || e.message}`); } };
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`); };
const yes = (v, msg) => { if (!v) throw new Error(msg || 'atteso vero'); };
const V = (cs) => validate(cs, R);

// ---------------------------------------------------------------- melds
t('scale con jolly e pinelle', () => {
  eq(V(['5H', '6H', '2S']), { t: 'run', s: 'H', lo: 5, cards: ['5H', '6H', '2S'] }, 'pinella in cima');
  eq(V(['5H', '2S', '7H']).cards, ['5H', '2S', '7H'], 'pinella nel buco');
  eq(wildCount(V(['1H', '2H', '3H']), R), 0, 'A-2-3: il 2 è naturale');
  eq(wildCount(V(['2H', '3H', '4H']), R), 0, '2-3-4 naturale');
  eq(V(['2H', '3H', '1J']).cards, ['2H', '3H', '1J'], '2 naturale + jolly');
  eq(wildCount(V(['2H', '3H', '1J']), R), 1);
  const m = V(['2H', '2S', '4H']); eq(m.cards, ['2H', '2S', '4H'], '2♥ naturale, 2♠ matta al posto del 3'); eq(wildCount(m, R), 1);
  eq(V(['5H', '2S', '1J']), null, 'due matte');
  eq(V(['5H', '2H~2', '2H']), null, 'due 2 di cuori lontani dal loro posto');
  eq(V(['12H', '13H', '1H']).lo, 12, 'Q-K-A');
  eq(V(['13H', '1H', '3H']), null, 'mai a giro');
  eq(V(['13H', '1H', '2H']).cards, ['2H', '13H', '1H'], 'K-A-2: il 2 fa da matta (Q)');
  eq(V(['5H', '6H', '7D']), null);
  eq(V(['5D', '2D', '7D']).cards, ['5D', '2D', '7D'], '2 dello stesso seme lontano: matta');
});
t('combinazioni (tris) del burraco', () => {
  eq(V(['7H', '7H~2', '7C']).t, 'set', 'semi uguali ammessi');
  eq(V(['7H', '7D', '7C', '7S', '7H~2', '7D~2']).cards.length, 6, 'sei sette');
  eq(V(['7H', '7D', '2C']).t, 'set', 'una pinella');
  eq(V(['7H', '2D', '1J']), null, 'due matte');
  eq(V(['2H', '2D', '2C']), null, 'niente combinazioni di 2');
  eq(V(['1J', '2J', '2S']), null);
});
t('attacchi: la matta scivola in fondo', () => {
  const run = V(['5H', '6H', '2S']); // 2♠ = 7
  const a = attach(run, '7H', R); eq(a.cards, ['5H', '6H', '7H', '2S'], 'il 7 vero prende il posto, la pinella va in cima'); eq(wildCount(a, R), 1);
  eq(attach(run, '1J', R), null, 'seconda matta');
  eq(attach(V(['5H', '6H', '7H']), '2C', R).cards, ['5H', '6H', '7H', '2C']);
  eq(attach(V(['7H', '7D', '7C']), '7H~2', R).cards.length, 4);
  eq(attach(V(['7H', '7D', '2C']), '1J', R), null);
  const q = V(['12H', '13H', '1J']); // jolly = A
  eq(attach(q, '1H', R).cards, ['1J', '12H', '13H', '1H'], 'l’asso vero spinge il jolly sotto');
});
t('burraco pulito e sporco', () => {
  const p7 = V(['3H', '4H', '5H', '6H', '7H', '8H', '9H']);
  yes(isBurraco(p7) && isPulito(p7));
  const p2 = V(['1S', '2S', '3S', '4S', '5S', '6S', '7S']); yes(isPulito(p2), 'il 2 al suo posto non sporca');
  const sp = V(['3H', '4H', '5H', '1J', '7H', '8H', '9H']); yes(isBurraco(sp) && !isPulito(sp));
  const set7 = V(['9H', '9H~2', '9D', '9D~2', '9C', '9S', '9S~2']); yes(isPulito(set7), 'burraco di 9');
  yes(!isBurraco(V(['3H', '4H', '5H', '6H', '7H', '8H'])));
});
t('valori delle carte', () => { eq(['1J', '2D', '1H', '13S', '8C', '7H', '3D'].map(value), [30, 20, 15, 10, 10, 5, 5]); });

// ---------------------------------------------------------------- flow on crafted states
function craft(hands, o = {}) {
  const s = G.setup(4242, { variant: hands.length === 4 ? 'coppie' : 'due', target: 2005, ...o });
  const used = new Set(hands.flat());
  s.hands = hands.map((h) => h.slice());
  const rest = makeDeck('fr52', { copies: 2, jokers: 4 }).filter((c) => !used.has(c));
  s.pz = [rest.splice(0, 11), rest.splice(0, 11)];
  s.discard = [rest.pop()]; s.stock = rest; s.turn = 0; s.phase = 'play';
  return s;
}
t('pozzetto in volo calando tutte le carte', () => {
  let s = craft([['5H', '6H', '7H'], ['9C', '9D', '9S', '4C']]);
  const m = G.legalMoves(s, 0).find((x) => x.a === 'meld'); yes(m, 'si può calare tutto');
  s = G.apply(s, m);
  yes(s.tookPz[0] && s.hands[0].length === 11 && s.turn === 0, 'preso il pozzetto, si continua');
});
t('pozzetto scartando l’ultima carta', () => {
  let s = craft([['5H'], ['9C', '9D', '9S', '4C']]);
  s = G.apply(s, { a: 'disc', card: '5H', to: 'discard' });
  yes(s.tookPz[0] && s.hands[0].length === 11 && s.turn === 1, 'pozzetto alla prossima mano');
});
t('chiusura: serve il pozzetto preso e un burraco', () => {
  let s = craft([['5H', '9D'], ['9C', '4C', '4S']]);
  s.tookPz[0] = true; s.pz[0] = null;
  s.melds = [{ ...V(['3S', '4S~2', '5S', '6S', '7S', '8S']), team: 0, owner: 0 }];
  const L = () => G.legalMoves(s, 0);
  yes(!L().some((m) => m.a === 'att' && m.card === '9S'), 'nessun attacco strano');
  // attaching 9D? not a spade: only discards. With 2 cards, discarding one is fine
  yes(L().some((m) => m.a === 'disc'));
  s.hands[0] = ['9D']; s = clone(s);
  yes(!L().some((m) => m.a === 'disc'), 'senza burraco non si chiude');
  s.melds[0] = { ...V(['3S', '4S~2', '5S', '6S', '7S', '8S', '9S']), team: 0, owner: 0 }; s = clone(s);
  const d = L().find((m) => m.a === 'disc'); yes(d, 'con il burraco si chiude');
  s = G.apply(s, d); yes(s.over && s.closer === 0);
  const T = tally(s);
  eq(T[0].close, 100); eq(T[0].puliti, 1); eq(T[1].pz, -100);
  eq(T[0].cards, [3, 4, 5, 6, 7, 8, 9].map((r) => value(`${r}S`)).reduce((a, b) => a + b, 0));
  eq(T[1].hand, -(10 + 5 + 5));
  eq(T[0].total, 45 + 200 + 100);
  eq(T[1].total, -20 - 100);
  eq(G.scores(s).points, [345, -120]);
});
t('chiusura solo con burraco pulito (opzione)', () => {
  let s = craft([['9D'], ['9C', '4C']], { chiusura: 'pulito' });
  s.tookPz[0] = true; s.pz[0] = null;
  s.melds = [{ ...V(['3S', '1J', '5S', '6S', '7S', '8S', '9S']), team: 0, owner: 0 }];
  yes(!G.legalMoves(s, 0).some((m) => m.a === 'disc'), 'sporco non basta');
});
t('non si scarta la sola carta raccolta; si raccoglie tutto il pozzo', () => {
  let s = craft([['5H', '9D', '13C'], ['9C', '4C']]);
  s.phase = 'draw'; s.discard = ['4D', '8S', '12H'];
  s = G.apply(s, { a: 'take', card: '12H' });
  eq(s.hands[0].length, 6); eq(s.discard, []);
  s = craft([['5H', '9D', '13C'], ['9C', '4C']]); s.phase = 'draw'; s.discard = ['12H'];
  s = G.apply(s, { a: 'take', card: '12H' });
  yes(!G.legalMoves(s, 0).some((m) => m.a === 'disc' && m.card === '12H'));
});
t('a coppie si attacca solo alle proprie combinazioni', () => {
  const s = craft([['8H', '4C', '5C'], ['9C', '4D'], ['6S', '6D'], ['1C', '1D']]);
  s.melds = [{ ...V(['5H', '6H', '7H']), team: 1, owner: 1 }, { ...V(['9H', '10H', '11H']), team: 0, owner: 2 }];
  const att = G.legalMoves(s, 0).filter((m) => m.a === 'att');
  yes(att.length && att.every((m) => m.m === 1), 'solo alla combinazione del compagno');
});
t('fine partita a 2005', () => {
  eq(G.matchOver([2100, 1500], { target: 2005 }, [1]), 0);
  eq(G.matchOver([2100, 2100], { target: 2005 }, [1]), -1, 'pari: si continua');
  eq(G.matchOver([300, 200], { target: 1 }, [1]), 0, 'una smazzata');
  eq(G.matchOver([1900, 200], { target: 2005 }, [1]), -1);
});

// ---------------------------------------------------------------- AI soak with full state checks
const ALL = makeDeck('fr52', { copies: 2, jokers: 4 }).sort();
function check(s, tag) {
  const cards = [...s.stock, ...s.discard, ...s.hands.flat(), ...s.stage.flat(), ...s.melds.flatMap((m) => m.cards), ...s.pz.filter(Boolean).flat()];
  if (cards.length !== 108 || JSON.stringify(cards.slice().sort()) !== JSON.stringify(ALL)) throw new Error(`${tag}: carte non conservate (${cards.length})`);
  for (const m of s.melds) {
    const v = validate(m.cards, R);
    if (!v) throw new Error(`${tag}: combinazione non valida ${m.cards}`);
    if (wildCount(m, R) > 1) throw new Error(`${tag}: più di una matta ${m.cards}`);
    if (m.t === 'run') m.cards.forEach((c, i) => { const pr = m.lo + i; const r = +c.match(/^\d+/)[0], su = c.replace(/~\d/, '').slice(-1); const nat = su === m.s && (r === pr || (r === 1 && pr === 14)); if (!nat && !(su === 'J' || r === 2)) throw new Error(`${tag}: scala sbagliata ${m.cards}`); });
    if (!s.teams[m.team].includes(m.owner)) throw new Error(`${tag}: combinazione della coppia sbagliata`);
  }
  if (!s.over) {
    s.hands.forEach((h, p) => { if (p !== s.turn && !h.length) throw new Error(`${tag}: mano vuota fuori turno`); });
    s.teams.forEach((tm, T) => { if (s.tookPz[T] === !!s.pz[T]) throw new Error(`${tag}: pozzetto incoerente`); });
  }
}
const LV = ['facile', 'normale', 'difficile'];
let rounds = 0, moves = 0, closes = 0, puliti = 0, sporchi = 0, volo = 0;
const t0 = Date.now();
t('IA contro IA: migliaia di smazzate senza stati illegali', () => {
  const goal = QUICK ? 120 : 1000; // rounds
  for (let i = 0; rounds < goal; i++) {
    for (const variant of ['due', 'coppie']) {
      if (rounds >= goal) break;
      const n = variant === 'due' ? 2 : 4;
      const levels = Array.from({ length: n }, (_, p) => LV[(i + p) % 3]);
      const M = newMatch(G, { variant, n, seed: 3000 * n + i, target: i % 4 === 0 ? 2005 : 1, options: { chiusura: i % 5 === 4 ? 'pulito' : 'qualsiasi' }, seats: levels.map((l) => ({ kind: 'cpu', level: l })) });
      let guard = 0;
      while (!M.over) {
        if (++guard > 40000) throw new Error('partita infinita');
        const s = M.state;
        if (G.isOver(s)) {
          rounds++; if (s.closer >= 0) closes++;
          for (const m of s.melds) if (isBurraco(m)) { if (isPulito(m)) puliti++; else sporchi++; }
          const sc = G.scores(s); if (sc.points.some((v) => !Number.isFinite(v))) throw new Error('punti non validi');
          endRound(G, M); if (!M.over) nextRound(G, M); check(M.state, 'nuova smazzata'); continue;
        }
        const p = s.turn, legal = G.legalMoves(s, p);
        const m = G.ai(clone(s), p, levels[p], rng(moves * 17 + i));
        if (!findLegal(legal, m)) throw new Error(`mossa IA illegale ${moveKey(m)} (${levels[p]}, fase ${s.phase})`);
        const tookBefore = s.tookPz.slice();
        play(G, M, m); moves++;
        if (M.state.turn === p && M.state.tookPz.some((x, T) => x && !tookBefore[T])) volo++;
        check(M.state, `${variant} partita ${i} mossa ${moves}`);
      }
      eq(JSON.parse(JSON.stringify(M.state)), M.state, 'stato serializzabile');
    }
  }
  console.log(`  ${rounds} smazzate, ${moves} mosse, ${closes} chiusure, ${puliti} burraco puliti, ${sporchi} sporchi, ${volo} pozzetti in volo in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  yes(rounds >= goal, `poche smazzate: ${rounds}`);
  yes(closes > rounds * 0.3, `troppe poche chiusure: ${closes}/${rounds}`);
});
const duel = (a, b, N, variant = 'due') => {
  let wa = 0, wb = 0, diff = 0; const n = variant === 'due' ? 2 : 4;
  for (let i = 0; i < N; i++) {
    const lv = Array.from({ length: n }, (_, p) => ((p % 2 === 0) !== !!(i % 2) ? a : b));
    const M = newMatch(G, { variant, n, seed: 900 + i, target: 1, options: {}, seats: lv.map((l) => ({ kind: 'cpu', level: l })) });
    while (!M.over) {
      if (G.isOver(M.state)) { endRound(G, M); if (!M.over) nextRound(G, M); continue; }
      const p = M.state.turn; play(G, M, G.ai(clone(M.state), p, lv[p], rng(M.moves + i * 13)));
    }
    const r = M.rounds[M.rounds.length - 1], A = lv[0] === a ? 0 : 1; diff += r.points[A] - r.points[1 - A];
    if (M.winner === 'draw') continue;
    if (lv[M.winner] === a) wa++; else wb++;
  }
  return [wa, wb, diff / N];
};
t('IA: Normale batte Facile, Difficile non è peggio di Normale', () => {
  const [a, b] = duel('normale', 'facile', QUICK ? 40 : 120); console.log(`  normale-facile ${a}-${b}`); yes(a > b * 1.3, 'normale troppo debole');
  const [c, d, df] = duel('difficile', 'normale', QUICK ? 60 : 160); console.log(`  difficile-normale ${c}-${d} (${df.toFixed(1)} punti a smazzata)`); yes(c >= d * 0.9 || df > 0, 'difficile peggiore');
});

console.log(`${ok} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
