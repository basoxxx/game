// Briscola — 2 players, or 4 in pairs with optional partner signals. Plug-in for Carte Baso
// (interface: src/carte/README.md). Pure functions over JSON state; the AI counts cards and, at
// Difficile, runs Monte Carlo playouts over the cards it cannot see.
import meta from './briscola.meta.js';
import { makeDeck, shuffle, rank, suit, clone, nextPlayer, rand, cardName, SUIT_NAME } from '../core/cards.js';

export const POINTS = { 1: 11, 3: 10, 10: 4, 9: 3, 8: 2 };
export const pts = (c) => POINTS[rank(c)] || 0;
// strength inside a suit: A 3 R C F 7 6 5 4 2
const STR = { 1: 10, 3: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1 };
export const str = (c) => STR[rank(c)];
// does card b beat card a (a already on the table) given the lead suit and the trump suit?
function beats(b, a, lead, trump) {
  const sb = suit(b), sa = suit(a);
  if (sb === sa) return str(b) > str(a);
  if (sb === trump) return true;
  return false;
}
export function trickWinner(trick, trump) {
  let best = trick[0];
  for (const t of trick.slice(1)) if (beats(t.c, best.c, suit(trick[0].c), trump)) best = t;
  return best.p;
}
const teamOf = (s, p) => s.teams.findIndex((t) => t.includes(p));

function setup(seed, opts) {
  const n = opts.n === 4 ? 4 : 2;
  const s = { n, rng: seed >>> 0, teams: n === 4 ? [[0, 2], [1, 3]] : [[0], [1]], dealer: opts.dealer ?? 0, segnali: !!opts.segnali && n === 4 };
  const deck = shuffle(makeDeck('it40'), s);
  s.hands = Array.from({ length: n }, () => []);
  // deal 3 each, starting to the dealer's right (counter-clockwise), one at a time
  for (let k = 0; k < 3; k++) for (let i = 1; i <= n; i++) s.hands[(s.dealer + i) % n].push(deck.pop());
  s.trump = deck.pop(); s.trumpSuit = suit(s.trump);
  s.deck = [s.trump, ...deck]; // the face-up trump lies under the stock: drawn last (deck top = last element)
  s.turn = (s.dealer + 1) % n; s.lead = s.turn;
  s.trick = []; s.won = Array.from({ length: n }, () => []); s.last = null; s.tricks = 0; s.seen = [];
  s.over = false;
  return s;
}
function legalMoves(s, p) {
  if (s.over || p !== s.turn) return [];
  return s.hands[p].map((c) => ({ card: c }));
}
// mutate: play one card; resolve the trick when complete
function step(s, m) {
  const p = s.turn, h = s.hands[p], i = h.indexOf(m.card);
  h.splice(i, 1); s.trick.push({ p, c: m.card }); s.seen.push(m.card);
  if (s.trick.length < s.n) { s.turn = nextPlayer(p, s.n); return s; }
  const w = trickWinner(s.trick, s.trumpSuit);
  s.won[w].push(...s.trick.map((t) => t.c));
  s.last = { trick: s.trick, w }; s.trick = []; s.tricks++;
  // draw: winner first, then counter-clockwise
  if (s.deck.length) for (let k = 0; k < s.n; k++) { const q = (w + k) % s.n; if (s.deck.length) s.hands[q].push(s.deck.pop()); }
  s.turn = w; s.lead = w;
  if (s.hands.every((x) => !x.length)) { s.over = true; s.turn = -1; }
  return s;
}
const apply = (s, m) => step(clone(s), m);
// animation: the completed trick stays on the table for a moment before it is collected
function steps(s, m) {
  if (s.trick.length !== s.n - 1) return [];
  const t = clone(s); const h = t.hands[t.turn]; h.splice(h.indexOf(m.card), 1); t.trick.push({ p: t.turn, c: m.card });
  t.turn = -1; t.pause = 900; t.winnerShow = trickWinner(t.trick, t.trumpSuit);
  return [t];
}
const isOver = (s) => !!s.over;
function teamPoints(s) { return s.teams.map((t) => t.reduce((a, p) => a + s.won[p].reduce((b, c) => b + pts(c), 0), 0)); }
function scores(s) {
  const tp = teamPoints(s);
  const win = tp[0] > 60 ? 0 : tp[1] > 60 ? 1 : -1;
  const records = {};
  return {
    points: tp.map((_, i) => (i === win ? 1 : 0)),
    rows: [{ label: 'Punti delle carte', values: tp }, { label: 'Carte prese', values: s.teams.map((t) => t.reduce((a, p) => a + s.won[p].length, 0)) }, { label: 'Esito', values: tp.map((v, i) => (win === -1 ? 'Pari (60)' : i === win ? (v >= 91 ? 'Vinta! (cappotto)' : 'Vinta') : 'Persa')) }],
    records: Object.assign(records, { punti: tp[0] }),
    note: win === -1 ? 'Sessanta a sessanta: la smazzata è patta.' : tp[win] === 120 ? 'Tutti i 120 punti in una smazzata!' : '',
    coins: win === 0 ? (tp[0] >= 91 ? 6 : 3) : 0,
  };
}

// ------------------------------------------------------------------ AI
// partner signal: the traditional "segni" summarised as one word (shared by partners when enabled)
export function signalOf(s, p) {
  const h = s.hands[p], t = s.trumpSuit;
  if (h.includes(`1${t}`)) return { id: 'asso', text: 'Asso di briscola' };
  if (h.includes(`3${t}`)) return { id: 'tre', text: 'Tre di briscola' };
  const tr = h.filter((c) => suit(c) === t);
  if (tr.length >= 2) return { id: 'briscole', text: 'Ho briscole' };
  if (h.some((c) => (rank(c) === 1 || rank(c) === 3))) return { id: 'carico', text: 'Ho un carico' };
  if (tr.length) return { id: 'una', text: 'Una briscola' };
  return { id: 'liscio', text: 'Niente' };
}
// cheapest card: no points, no trump, lowest strength
const cost = (c, t) => pts(c) * 3 + (suit(c) === t ? 14 + str(c) : 0) + str(c) * 0.1;
function heuristic(s, p, level, r) {
  const h = s.hands[p], t = s.trumpSuit, trick = s.trick;
  if (h.length === 1) return h[0];
  const byCost = h.slice().sort((a, b) => cost(a, t) - cost(b, t));
  if (level === 'facile' && r() < 0.45) return h[Math.floor(r() * h.length)];
  if (!trick.length) {
    // leading: a "liscio"; late in the game with an empty stock, lead strong if it's safe
    return byCost[0];
  }
  const lead = suit(trick[0].c), cur = trickWinner(trick, t);
  const curCard = trick.find((x) => x.p === cur).c;
  const onTable = trick.reduce((a, x) => a + pts(x.c), 0);
  const mate = s.n === 4 && teamOf(s, cur) === teamOf(s, p);
  const last = trick.length === s.n - 1;
  const winners = h.filter((c) => beats(c, curCard, lead, t)).sort((a, b) => cost(a, t) - cost(b, t));
  if (mate) {
    // partner is winning: if we are last (or the partner's card is a trump ace/three), load points
    const safe = last || (suit(curCard) === t && str(curCard) >= 9);
    if (safe) { const load = h.filter((c) => suit(c) !== t).sort((a, b) => pts(b) - pts(a))[0]; if (load && pts(load)) return load; }
    return byCost[0];
  }
  if (winners.length) {
    const w = winners[0];
    const sameSuit = suit(w) === lead && suit(w) !== t;
    // win with a card of the same suit: always good (the ace on a low card takes 11 more)
    const sameBest = winners.filter((c) => suit(c) === lead && suit(c) !== t).sort((a, b) => pts(b) - pts(a))[0];
    if (sameBest && (last || s.n === 2)) return sameBest;
    if (sameSuit) return w;
    // trumping: worth it when there are points on the table
    if (onTable >= 10 || (onTable >= 4 && suit(w) === t && pts(w) === 0) || (level !== 'facile' && s.deck.length <= s.n && onTable >= 2)) return w;
  }
  return byCost[0];
}
// Monte Carlo: deal the unseen cards at random to the others and the stock, play the rest of the hand
// out with the heuristic, keep the card with the best average point difference.
function monteCarlo(s, p, r, iters) {
  const h = s.hands[p], my = teamOf(s, p);
  if (h.length === 1) return h[0];
  const known = new Set([...h, ...s.seen, ...s.won.flat()]);
  if (s.deck.length) known.add(s.trump);
  const unseen = makeDeck('it40').filter((c) => !known.has(c));
  const sig = s.segnali ? s.teams[my].filter((q) => q !== p).map((q) => [q, signalOf(s, q).id]) : [];
  const total = Object.fromEntries(h.map((c) => [c, 0]));
  const end = Date.now() + 260; // time budget: phones stay responsive
  for (let it = 0; it < iters && (it < 6 || Date.now() < end); it++) {
    const pool = shuffle(unseen, r);
    const w = clone(s);
    // determinise: hands of the others, then the stock (trump card stays at the bottom)
    for (let q = 0; q < s.n; q++) if (q !== p) w.hands[q] = pool.splice(0, s.hands[q].length);
    w.deck = s.deck.length ? [s.trump, ...pool.splice(0, s.deck.length - 1)] : [];
    // respect a partner's signal roughly: swap the signalled card into its hand when possible
    for (const [q, id] of sig) {
      const want = id === 'asso' ? `1${s.trumpSuit}` : id === 'tre' ? `3${s.trumpSuit}` : null;
      if (want && !w.hands[q].includes(want) && unseen.includes(want)) {
        const holders = [...w.hands.filter((_, k) => k !== q && k !== p), w.deck];
        for (const arr of holders) { const i = arr.indexOf(want); if (i > 0 || (i === 0 && arr !== w.deck)) { arr[i] = w.hands[q][0]; w.hands[q][0] = want; break; } }
      }
    }
    for (const c of h) {
      const x = clone(w); step(x, { card: c });
      let guard = 60;
      while (!x.over && guard--) { const q = x.turn; step(x, { card: heuristic(x, q, 'normale', r) }); }
      const tp = teamPoints(x);
      total[c] += tp[my] - tp[1 - my];
    }
  }
  return h.slice().sort((a, b) => total[b] - total[a])[0];
}
function ai(s, p, level, r = Math.random) {
  if (level === 'difficile') return { card: monteCarlo(s, p, r, s.n === 4 ? 40 : 70) };
  return { card: heuristic(s, p, level, r) };
}

// ------------------------------------------------------------------ view
function view(s, viewer, ctx = {}) {
  const piles = [];
  const reveal = s.over;
  const P = ctx.portrait, dx = P ? 0.1 : s.n === 4 ? 0.2 : 0.08, dy = P ? 0.12 : 0.5, sc = P ? 0.72 : 0.9;
  piles.push({ id: 'deck', x: dx, y: dy, scale: sc, z: 10, layout: 'stack', up: false, source: true, cards: s.deck.slice(1).map((c) => ({ id: c })), label: s.deck.length ? String(s.deck.length) : '' });
  if (s.deck.length) piles.push({ id: 'trump', x: dx, y: dy, ox: 0.55, scale: sc, layout: 'stack', rot: 90, cards: [{ id: s.trump, up: true }], z: 0 });
  for (let p = 0; p < s.n; p++) {
    piles.push({ id: `hand${p}`, seat: p, slot: 'hand', cards: s.hands[p].map((c) => ({ id: c, up: reveal || p === viewer })) });
    piles.push({ id: `won${p}`, seat: p, slot: 'side', layout: 'stack', up: false, cards: s.won[p] });
  }
  for (const t of s.trick) piles.push({ id: `play${t.p}`, seat: t.p, slot: 'play', cards: [{ id: t.c, up: true }], z: 50 + s.trick.indexOf(t) });
  const hl = s.winnerShow != null ? s.trick.filter((t) => t.p === s.winnerShow).map((t) => t.c) : [];
  const seats = Array.from({ length: s.n }, (_, p) => {
    let sub = '';
    if (s.segnali && ctx.partnerOf?.(viewer) === p && !s.over) sub = `Segnale: ${signalOf(s, p).text}`;
    return { sub };
  });
  return { piles, hl, seats, mine: `hand${viewer}`, info: `Briscola: ${SUIT_NAME[s.trumpSuit]} (${cardName(s.trump)})` };
}
function describe(s, m) { return cardName(m.card); }
function status(s) { return `Briscola ${SUIT_NAME[s.trumpSuit]} · ${s.deck.length} carte nel mazzo`; }

const RULES = `
<h3>Lo scopo</h3><p>Si gioca con 40 carte italiane. Ogni smazzata vale 120 punti: vince chi (o la coppia che) ne raccoglie <b>più di 60</b>. A 60 pari la smazzata è patta.</p>
<h3>Il valore delle carte</h3><ul><li><b>Asso</b> 11 punti</li><li><b>Tre</b> 10</li><li><b>Re</b> 4</li><li><b>Cavallo</b> 3</li><li><b>Fante</b> 2</li><li>7, 6, 5, 4 e 2: nessun punto (sono i <i>lisci</i>)</li></ul>
<p>L’ordine di forza in ogni seme è Asso, Tre, Re, Cavallo, Fante, 7, 6, 5, 4, 2.</p>
<h3>Come si gioca</h3><p>Ognuno riceve 3 carte; la carta successiva si scopre e il suo seme è la <b>briscola</b>. Resta sotto il mazzo e sarà l’ultima a essere pescata.</p>
<p>Chi è di mano gioca una carta qualsiasi, gli altri rispondono con una carta qualsiasi: <b>non c’è obbligo di rispondere al seme</b>. Prende la briscola più alta; se non ci sono briscole, la carta più alta del seme giocato per primo. Chi prende pesca per primo (poi gli altri, in senso antiorario) e apre la mano successiva.</p>
<h3>In quattro</h3><p>Si gioca a coppie, i compagni seduti uno di fronte all’altro; i punti della coppia si sommano. Con i <b>segnali</b> attivi i compagni si scambiano i segni tradizionali (asso o tre di briscola, briscole, carichi, liscio): il segnale del tuo compagno appare sotto il suo nome.</p>
<h3>La partita</h3><p>Una partita secca, oppure al meglio di 3 o di 5 smazzate. Al livello Difficile la CPU conta le carte uscite e simula le possibili mani avversarie.</p>
<h3>Comandi</h3><p>Tocca o trascina una carta sul tavolo per giocarla. Da tastiera <span class="kbd">←</span> <span class="kbd">→</span> e <span class="kbd">Invio</span>, oppure i numeri <span class="kbd">1</span>–<span class="kbd">3</span>.</p>`;

export default {
  ...meta,
  desc: 'Tre carte in mano e un seme che comanda: carichi, lisci e briscole, in due o a coppie con i segnali. Vince chi supera i 60 punti.',
  players: [2, 4], decks: ['it40'],
  thumb: ['1d', '3d', '10s'],
  variants: [
    { id: 'due', name: 'A due', desc: 'Testa a testa, 120 punti in palio.', players: [2, 2] },
    { id: 'coppie', name: 'A coppie', desc: 'Quattro giocatori, due contro due.', players: [4, 4], teams: true },
  ],
  options: [
    { id: 'segnali', name: 'Segnali tra compagni', when: (o) => o.variant === 'coppie', values: [{ v: true, label: 'Sì' }, { v: false, label: 'No' }], default: true },
  ],
  targets: [{ v: 1, label: 'Partita secca' }, { v: 2, label: 'Al meglio di 3' }, { v: 3, label: 'Al meglio di 5' }],
  defaultTarget: 2,
  records: { punti: 'Punti in una smazzata' },
  undo: 'facile',
  setup, legalMoves, apply, steps, ai, isOver, scores, view, describe, status, rules: RULES,
  sounds: { play: 'play', trick: 'collect' },
};
