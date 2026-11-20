// Scopa — Scopa classica (2, 3 or 4 players in pairs), Scopone scientifico (4 in pairs, 10 cards each,
// optional Napola) and Scopa d'assi (the ace sweeps the table). Plug-in for Carte Baso (interface:
// src/carte/README.md). Pure functions over JSON state; the Difficile AI counts the cards and runs
// Monte Carlo playouts of the rest of the hand over the cards it cannot see.
import meta from './scopa.meta.js';
import { makeDeck, shuffle, rank, suit, clone, nextPlayer, cardName } from '../core/cards.js';

// primiera values
const PRIM = { 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10 };
export const primiera = (cards) => {
  let tot = 0;
  for (const s of ['d', 'c', 's', 'b']) { let best = 0; for (const c of cards) if (suit(c) === s && PRIM[rank(c)] > best) best = PRIM[rank(c)]; if (!best) return 0; tot += best; }
  return tot;
};
const teamOf = (s, p) => s.teams.findIndex((t) => t.includes(p));

// all the captures a card can make on this table: [[ids]...]; [] if none (then it is laid down)
export function captures(card, table, variant = 'classica') {
  const r = rank(card);
  if (variant === 'assi' && r === 1) {
    const aces = table.filter((c) => rank(c) === 1);
    if (aces.length) return aces.map((c) => [c]);
    return table.length ? [table.slice()] : [];
  }
  const eq = table.filter((c) => rank(c) === r);
  if (eq.length) return eq.map((c) => [c]); // a card of the same value must be taken alone
  const out = [], n = table.length;
  // subsets of 2+ cards summing to r (table is small: at most a dozen cards)
  const walk = (i, sum, pick) => {
    if (sum === r && pick.length >= 2) { out.push(pick.slice()); return; }
    if (i >= n || sum >= r) return;
    const v = rank(table[i]);
    if (sum + v <= r) { pick.push(table[i]); walk(i + 1, sum + v, pick); pick.pop(); }
    walk(i + 1, sum, pick);
  };
  walk(0, 0, []);
  return out;
}

function deal(s) {
  const per = s.variant === 'scopone' ? 10 : 3;
  for (let k = 0; k < per; k++) for (let i = 1; i <= s.n; i++) if (s.deck.length) s.hands[(s.dealer + i) % s.n].push(s.deck.pop());
}
function setup(seed, opts) {
  const variant = ['classica', 'scopone', 'assi'].includes(opts.variant) ? opts.variant : 'classica';
  const n = variant === 'scopone' ? 4 : Math.max(2, Math.min(4, opts.n || 2));
  const s = {
    n, variant, rng: seed >>> 0, dealer: opts.dealer ?? 0, napola: variant === 'scopone' && opts.napola !== false,
    teams: n === 4 ? [[0, 2], [1, 3]] : Array.from({ length: n }, (_, i) => [i]),
  };
  // deal: 4 face up on the table (not in the Scopone scientifico); redeal if they would spoil the game
  for (let tries = 0; tries < 50; tries++) {
    s.deck = shuffle(makeDeck('it40'), s);
    s.table = variant === 'scopone' ? [] : s.deck.splice(s.deck.length - 4, 4);
    const kings = s.table.filter((c) => rank(c) === 10).length, aces = s.table.filter((c) => rank(c) === 1).length;
    if (kings < 3 && !(variant === 'assi' && aces)) break;
  }
  s.hands = Array.from({ length: n }, () => []);
  deal(s);
  s.caps = Array.from({ length: n }, () => []); s.scope = Array.from({ length: n }, () => 0); s.scopaCards = [];
  s.lastTaker = -1; s.turn = (s.dealer + 1) % n; s.over = false; s.seen = [...s.table]; s.played = 0; s.lastMove = null;
  return s;
}
function legalMoves(s, p) {
  if (s.over || p !== s.turn) return [];
  const out = [];
  for (const c of s.hands[p]) {
    const caps = captures(c, s.table, s.variant);
    if (!caps.length) out.push({ card: c, take: [], label: `Cala ${cardName(c)}` });
    else for (const t of caps) out.push({ card: c, take: t.slice().sort(), label: `Prendi ${t.map(cardName).join(' + ')}`, show: t });
  }
  return out;
}
const handsEmpty = (s) => s.hands.every((h) => !h.length);
function step(s, m) {
  const p = s.turn, h = s.hands[p];
  h.splice(h.indexOf(m.card), 1);
  s.seen.push(m.card); s.played++; s.say = null;
  const lastPlay = handsEmpty(s) && !s.deck.length;
  if (m.take.length) {
    const take = new Set(m.take);
    s.table = s.table.filter((c) => !take.has(c));
    s.caps[p].push(m.card, ...m.take); s.lastTaker = p;
    const sweepAce = s.variant === 'assi' && rank(m.card) === 1 && !m.take.some((c) => rank(c) === 1);
    if (!s.table.length && !lastPlay && !sweepAce) { s.scope[p]++; s.scopaCards.push(m.card); s.say = { text: 'Scopa!', chime: true }; }
    else if (sweepAce && m.take.length) s.say = { text: 'Asso piglia tutto!', cls: 'blue' };
    else if (m.take.includes(`7d`) || m.card === '7d') s.say = { text: 'Settebello!', cls: 'blue' };
  } else s.table.push(m.card);
  s.lastMove = { p, card: m.card, take: m.take };
  if (handsEmpty(s)) {
    if (s.deck.length) deal(s);
    else {
      // end of the hand: the table goes to the last player who captured
      if (s.lastTaker >= 0 && s.table.length) { s.caps[s.lastTaker].push(...s.table); s.lastSweep = s.table.slice(); s.table = []; }
      s.over = true; s.turn = -1; return s;
    }
  }
  s.turn = nextPlayer(p, s.n);
  return s;
}
const apply = (s, m) => step(clone(s), m);
// animation: the played card lands on the table next to what it takes, then the capture is collected
function steps(s, m) {
  if (!m.take?.length) return [];
  const t = clone(s), h = t.hands[t.turn];
  h.splice(h.indexOf(m.card), 1); t.table = [...t.table, m.card]; t.turn = -1; t.hlTake = [m.card, ...m.take]; t.pause = 700;
  return [t];
}
const isOver = (s) => !!s.over;

// ------------------------------------------------------------------ scoring
export function napola(cards) { if (!['1d', '2d', '3d'].every((c) => cards.includes(c))) return 0; let k = 3; while (k < 10 && cards.includes(`${k + 1}d`)) k++; return k; }
export function tally(s) {
  const sides = s.teams.map((t) => t.flatMap((p) => s.caps[p]));
  const scope = s.teams.map((t) => t.reduce((a, p) => a + s.scope[p], 0));
  const nC = sides.map((c) => c.length), nD = sides.map((c) => c.filter((x) => suit(x) === 'd').length), pr = sides.map(primiera);
  const best = (arr) => { const m = Math.max(...arr); return arr.filter((v) => v === m).length === 1 ? arr.indexOf(m) : -1; };
  const bC = best(nC), bD = best(nD), bP = best(pr), sb = sides.findIndex((c) => c.includes('7d'));
  const nap = s.napola ? sides.map(napola) : null;
  const points = sides.map((_, i) => (bC === i) + (bD === i) + (bP === i) + (sb === i) + scope[i] + (nap ? nap[i] : 0));
  return { sides, scope, nC, nD, pr, bC, bD, bP, sb, nap, points };
}
function scores(s) {
  const T = tally(s), mark = (b, i) => (b === i ? '✓' : '');
  const rows = [
    { label: 'Carte', values: T.nC, best: T.bC },
    { label: 'Denari', values: T.nD, best: T.bD },
    { label: 'Settebello', values: T.sides.map((_, i) => mark(T.sb, i) || '–'), best: T.sb },
    { label: 'Primiera', values: T.pr.map((v) => v || '–'), best: T.bP },
    { label: 'Scope', values: T.scope, best: -1 },
  ];
  if (T.nap) rows.push({ label: 'Napola', values: T.nap.map((v) => v || '–'), best: -1 });
  const my = T.points[0], other = Math.max(...T.points.slice(1));
  return {
    points: T.points, rows,
    records: { scope: T.scope[0], punti: T.points[0] },
    coins: T.scope[0] * 2 + (my > other ? 3 : 0),
    note: T.scope[0] >= 3 ? `${T.scope[0]} scope in una smazzata!` : '',
  };
}

// ------------------------------------------------------------------ AI
const DEN = (c) => suit(c) === 'd';
// how good is it to own these cards (captured): settebello, denari, primiera cards, plain count
const cardVal = (c) => (c === '7d' ? 7 : 0) + (DEN(c) ? 1.1 : 0) + (rank(c) === 7 ? 1.6 : rank(c) === 6 ? 0.8 : rank(c) === 1 ? 0.5 : 0) + 0.35;
function unseenCards(s, p) { const known = new Set([...s.hands[p], ...s.seen]); return makeDeck('it40').filter((c) => !known.has(c)); }
function evalMove(s, p, m, unseen, level) {
  let v = 0;
  const after = m.take.length ? s.table.filter((c) => !m.take.includes(c)) : [...s.table, m.card];
  const lastPlay = s.hands.every((h, q) => (q === p ? h.length === 1 : !h.length)) && !s.deck.length;
  if (m.take.length) {
    v += cardVal(m.card) + m.take.reduce((a, c) => a + cardVal(c), 0);
    if (!after.length && !lastPlay && !(s.variant === 'assi' && rank(m.card) === 1)) v += 10; // scopa
  } else {
    v -= cardVal(m.card) * 0.7; // giving away a card the others can take
    if (rank(m.card) === 7) v -= 1.5;
  }
  if (level === 'facile') return v;
  // risk: the next opponent sweeps the table (needs a card equal to the table total, or the single card)
  const nextOpp = (() => { for (let k = 1; k < s.n; k++) { const q = nextPlayer(p, s.n, k); if (teamOf(s, q) !== teamOf(s, p)) return q; } return -1; })();
  if (after.length && !lastPlay && nextOpp >= 0) {
    const sum = after.reduce((a, c) => a + rank(c), 0);
    if (sum <= 10 || (s.variant === 'assi')) {
      const target = s.variant === 'assi' ? 1 : sum;
      const outs = unseen.filter((c) => rank(c) === target).length;
      const handN = s.hands[nextOpp].length || 3;
      const pr = Math.min(1, outs * handN / Math.max(1, unseen.length));
      v -= pr * (8 + after.reduce((a, c) => a + cardVal(c), 0));
    }
    // leaving the settebello / a seven exposed
    for (const c of after) if (rank(c) === 7) { const outs = unseen.filter((x) => rank(x) === 7 || false).length; v -= (c === '7d' ? 4 : 1) * Math.min(1, outs / 3); }
  }
  // a partner plays right after us in 4: leaving a sweepable table for the partner is good
  return v;
}
function heuristic(s, p, level, r) {
  const ms = legalMoves(s, p);
  if (ms.length === 1) return ms[0];
  if (level === 'facile' && r() < 0.35) return ms[Math.floor(r() * ms.length)];
  const unseen = level === 'facile' ? [] : unseenCards(s, p);
  let best = ms[0], bv = -1e9;
  for (const m of ms) { const v = evalMove(s, p, m, unseen, level) + r() * 0.01; if (v > bv) { bv = v; best = m; } }
  return best;
}
function value(s, my) {
  const T = tally(s), o = T.points.map((_, i) => i).filter((i) => i !== my);
  const oppPts = Math.max(...o.map((i) => T.points[i]));
  const oppC = Math.max(...o.map((i) => T.nC[i])), oppD = Math.max(...o.map((i) => T.nD[i])), oppP = Math.max(...o.map((i) => T.pr[i]));
  return T.points[my] - oppPts + (T.nC[my] - oppC) * 0.04 + (T.nD[my] - oppD) * 0.08 + (T.pr[my] - oppP) * 0.01;
}
function monteCarlo(s, p, r, iters) {
  const ms = legalMoves(s, p);
  if (ms.length === 1) return ms[0];
  const my = teamOf(s, p), unseen = unseenCards(s, p);
  // prune to the best few by heuristic to keep it fast
  const cand = ms.map((m) => [m, evalMove(s, p, m, unseen, 'normale')]).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
  const tot = new Array(cand.length).fill(0);
  const end = Date.now() + 260; // time budget: phones stay responsive
  for (let it = 0; it < iters && (it < 4 || Date.now() < end); it++) {
    const pool = shuffle(unseen, r);
    const w = clone(s);
    for (let q = 0; q < s.n; q++) if (q !== p) w.hands[q] = pool.splice(0, s.hands[q].length);
    w.deck = pool.splice(0, s.deck.length);
    cand.forEach((m, i) => {
      const x = clone(w); step(x, m);
      let guard = 200;
      while (!x.over && guard--) step(x, heuristic(x, x.turn, 'normale', r));
      tot[i] += value(x, my);
    });
  }
  let bi = 0; for (let i = 1; i < cand.length; i++) if (tot[i] > tot[bi]) bi = i;
  return cand[bi];
}
function ai(s, p, level, r = Math.random) {
  if (level === 'difficile') {
    const left = s.deck.length + s.hands.reduce((a, h) => a + h.length, 0);
    return monteCarlo(s, p, r, left > 24 ? 14 : left > 12 ? 24 : 40);
  }
  return heuristic(s, p, level, r);
}

// ------------------------------------------------------------------ view
function view(s, viewer, ctx = {}) {
  const P = ctx.portrait, piles = [];
  piles.push({ id: 'deck', x: P ? 0.1 : s.n >= 3 ? 0.16 : 0.06, y: P ? 0.08 : 0.5, scale: 0.72, layout: 'stack', up: false, source: true, cards: s.deck, label: s.deck.length ? String(s.deck.length) : '' });
  piles.push({ id: 'table', x: 0.5, y: P ? 0.5 : 0.48, layout: 'row', wrap: true, w: P ? 0.98 : 0.8, gap: 1.06, cards: s.table.map((c) => ({ id: c, up: true })), outline: !s.table.length && !s.over, label: s.table.length ? '' : '' });
  for (let p = 0; p < s.n; p++) {
    piles.push({ id: `hand${p}`, seat: p, slot: 'hand', cards: s.hands[p].map((c) => ({ id: c, up: p === viewer })) });
    const sc = new Set(s.scopaCards);
    piles.push({ id: `cap${p}`, seat: p, slot: 'side', layout: 'stack', up: false, cards: s.caps[p].map((c) => (sc.has(c) ? { id: c, up: true, rot: 90, mark: true } : { id: c })) });
  }
  const seats = Array.from({ length: s.n }, (_, p) => ({ sub: `${s.caps[p].length} carte${s.scope[p] ? ` · ${s.scope[p]} scop${s.scope[p] === 1 ? 'a' : 'e'}` : ''}` }));
  return { piles, hl: s.hlTake || (s.lastMove && s.turn !== -1 ? [] : []), seats, mine: `hand${viewer}` };
}
const VNAME = { classica: 'Scopa', scopone: 'Scopone scientifico', assi: 'Scopa d’assi' };
function status(s) { return `${VNAME[s.variant]} · ${s.deck.length ? `${s.deck.length} carte nel mazzo` : s.variant === 'scopone' ? `${s.hands[s.turn]?.length ?? 0} carte in mano` : 'ultima mano'}${s.table.length ? ` · in tavola ${s.table.reduce((a, c) => a + rank(c), 0)}` : ''}`; }

const RULES = `
<h3>Lo scopo</h3><p>Si gioca con 40 carte italiane. Si prendono carte dal tavolo per fare punti; vince chi arriva per primo a 11 (o 21) punti. Se più giocatori superano il traguardo nella stessa smazzata vince chi ha più punti; a pari punti si continua.</p>
<h3>Come si prende</h3><p>Al proprio turno si gioca una carta. Se in tavola c’è una carta dello <b>stesso valore</b> la si deve prendere (e solo quella); altrimenti si possono prendere <b>più carte la cui somma</b> è uguale al valore della carta giocata (Fante 8, Cavallo 9, Re 10). Se la carta può prendere, la presa è obbligatoria; se non prende, resta in tavola. Quando ci sono più prese possibili si sceglie quale fare.</p>
<p>Chi prende tutte le carte in tavola fa <b>scopa</b> (1 punto), tranne con l’ultima carta della smazzata. A fine smazzata le carte rimaste in tavola vanno a chi ha preso per ultimo.</p>
<h3>Il punteggio di ogni smazzata</h3><ul><li><b>Carte</b>: 1 punto a chi ne ha prese di più (21 o più su 40).</li><li><b>Denari</b>: 1 punto a chi ha più carte di denari.</li><li><b>Settebello</b>: 1 punto a chi ha il sette di denari.</li><li><b>Primiera</b>: 1 punto a chi ha la primiera migliore: per ogni seme conta la carta più alta secondo 7 = 21, 6 = 18, Asso = 16, 5 = 15, 4 = 14, 3 = 13, 2 = 12, figure = 10 (serve almeno una carta per seme).</li><li><b>Scope</b>: 1 punto ciascuna.</li></ul><p>In caso di parità in carte, denari o primiera il punto non si assegna.</p>
<h3>Le varianti</h3><ul>
<li><b>Scopa classica</b>: 3 carte a testa e 4 in tavola, poi altre 3 a testa finché c’è mazzo. In 2, in 3 o in 4 a coppie (i compagni sommano le prese). Se in tavola escono tre Re si rimescola.</li>
<li><b>Scopone scientifico</b>: in 4 a coppie, tutte le carte distribuite subito (10 a testa) e tavolo vuoto. Con la <b>Napola</b> (Asso, Due e Tre di denari) si guadagnano 3 punti più uno per ogni denaro successivo in scala (4, 5…).</li>
<li><b>Scopa d’assi</b> (asso piglia tutto): l’Asso giocato prende tutte le carte in tavola, ma non vale scopa; se in tavola c’è già un Asso prende solo quello.</li></ul>
<h3>Comandi</h3><p>Tocca o trascina una carta per giocarla; se può fare più prese diverse, scegli quale dal menu (le carte prese si illuminano). Da tastiera <span class="kbd">←</span> <span class="kbd">→</span> e <span class="kbd">Invio</span>, oppure i numeri.</p>`;

export default {
  ...meta,
  desc: 'Prendi per uguale o per somma, fai scopa e conta carte, denari, settebello e primiera. Classica in 2-4, Scopone scientifico a coppie e Scopa d’assi.',
  players: [2, 4], decks: ['it40'],
  thumb: ['7d', '1c', '10b'],
  variants: [
    { id: 'classica', name: 'Scopa classica', desc: 'In 2, 3 o 4 a coppie: 3 carte a testa, 4 in tavola.', players: [2, 4], teams: (c) => c.n === 4 },
    { id: 'scopone', name: 'Scopone scientifico', desc: 'In 4 a coppie, 10 carte a testa e tavolo vuoto.', players: [4, 4], teams: true },
    { id: 'assi', name: 'Scopa d’assi', desc: 'L’Asso piglia tutto quello che c’è in tavola.', players: [2, 4], teams: (c) => c.n === 4 },
  ],
  options: [{ id: 'napola', name: 'Napola', when: (o) => o.variant === 'scopone', values: [{ v: true, label: 'Sì' }, { v: false, label: 'No' }], default: true }],
  targets: [{ v: 11, label: '11 punti' }, { v: 21, label: '21 punti' }, { v: 31, label: '31 punti' }],
  defaultTarget: 11,
  records: { scope: 'Scope in una smazzata', punti: 'Punti in una smazzata' },
  undo: 'facile',
  setup, legalMoves, apply, steps, ai, isOver, scores, view, status, rules: RULES,
  describe: (s, m) => (m.take.length ? `${cardName(m.card)} prende ${m.take.map(cardName).join(', ')}` : `${cardName(m.card)} in tavola`),
};
