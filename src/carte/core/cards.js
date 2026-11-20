// Carte Baso — card and deck model, seeded randomness, dealing. Pure JS, no DOM: usable from node tests.
//
// A CARD is a short string id, unique inside a game state:
//   Italian 40 (it40):  `${rank}${suit}`  rank 1..10 (8 Fante, 9 Cavallo, 10 Re), suit d c s b
//                       (d Denari, c Coppe, s Spade, b Bastoni)            e.g. '7d' = settebello
//   French 52 (fr52):   `${rank}${suit}`  rank 1..13 (1 Asso, 11 J, 12 Q, 13 K), suit H D C S
//                       (H Cuori, D Quadri, C Fiori, S Picche)            e.g. '12H' = donna di cuori
//   Jokers:             '1J' (red), '2J' (black)
//   Several decks:      copy 2+ gets a suffix '~2', '~3' ('7H~2' is the second seven of hearts)
// Helpers below parse them: rank(c), suit(c), copyOf(c), base(c), deckOf(c), isJoker(c), isRed(c).
// All game state is plain JSON (arrays, numbers, strings) so it can be cloned, saved and replayed.

export const SUITS = {
  it40: ['d', 'c', 's', 'b'],
  fr52: ['H', 'D', 'C', 'S'],
};
export const SUIT_NAME = { d: 'Denari', c: 'Coppe', s: 'Spade', b: 'Bastoni', H: 'Cuori', D: 'Quadri', C: 'Fiori', S: 'Picche', J: 'Jolly' };
export const SUIT_SYM = { H: '♥', D: '♦', C: '♣', S: '♠' };
export const DECKS = {
  it40: { id: 'it40', name: 'Carte italiane (40)', ranks: 10, suits: SUITS.it40, aspect: 0.58, styles: ['napoletane', 'piacentine'] },
  fr52: { id: 'fr52', name: 'Carte francesi (52)', ranks: 13, suits: SUITS.fr52, aspect: 0.7, styles: ['francesi'] },
};
export const FACE_STYLES = {
  napoletane: { id: 'napoletane', name: 'Napoletane', deck: 'it40' },
  piacentine: { id: 'piacentine', name: 'Piacentine', deck: 'it40' },
  francesi: { id: 'francesi', name: 'Francesi', deck: 'fr52' },
};

const RX = /^(\d+)([a-zA-Z])(?:~(\d+))?$/;
export const rank = (c) => parseInt(c, 10);
export const suit = (c) => { const m = RX.exec(c); return m ? m[2] : ''; };
export const copyOf = (c) => { const i = c.indexOf('~'); return i < 0 ? 1 : +c.slice(i + 1); };
export const base = (c) => { const i = c.indexOf('~'); return i < 0 ? c : c.slice(0, i); };
export const isJoker = (c) => suit(c) === 'J';
export const deckOf = (c) => { const s = suit(c); return s === 'J' || SUITS.fr52.includes(s) ? 'fr52' : 'it40'; };
export const isRed = (c) => { const s = suit(c); return s === 'H' || s === 'D' || (s === 'J' && rank(c) === 1); };
export const isCard = (c) => typeof c === 'string' && RX.test(c);

const IT_RANK = ['', 'Asso', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Fante', 'Cavallo', 'Re'];
const FR_RANK = ['', 'Asso', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci', 'Jack', 'Donna', 'Re'];
// "Sette di Denari", "Donna di Cuori", "Jolly rosso"
export function cardName(c) {
  const r = rank(c), s = suit(c);
  if (s === 'J') return r === 1 ? 'Jolly rosso' : 'Jolly nero';
  return `${(deckOf(c) === 'it40' ? IT_RANK : FR_RANK)[r] || r} di ${SUIT_NAME[s]}`;
}
// short label for logs / accessibility: "7♦", "Re Spade"
export function cardShort(c) {
  const r = rank(c), s = suit(c);
  if (s === 'J') return 'Jolly';
  if (deckOf(c) === 'fr52') return `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || r}${SUIT_SYM[s]}`;
  return `${({ 1: 'A', 8: 'F', 9: 'C', 10: 'R' })[r] || r} ${SUIT_NAME[s]}`;
}

// makeDeck('it40') -> 40 ids; makeDeck('fr52', { copies: 2, jokers: 4 }) -> 108 ids (burraco)
// opts.ranks: restrict ranks (e.g. [1,7,8,9,10,11,12,13] for a 32-card deck)
export function makeDeck(kind = 'it40', { copies = 1, jokers = 0, ranks = null } = {}) {
  const D = DECKS[kind]; if (!D) throw new Error(`mazzo sconosciuto: ${kind}`);
  const out = [];
  for (let k = 1; k <= copies; k++) {
    const sfx = k === 1 ? '' : `~${k}`;
    for (const s of D.suits) for (let r = 1; r <= D.ranks; r++) if (!ranks || ranks.includes(r)) out.push(`${r}${s}${sfx}`);
  }
  for (let j = 0; j < jokers; j++) { const k = Math.floor(j / 2) + 1; out.push(`${(j % 2) + 1}J${k === 1 ? '' : `~${k}`}`); }
  return out;
}

// ---- seeded randomness (mulberry32). The generator state is one uint32, so it lives inside the
// serialisable game state: `state.rng`. rand(state) advances it.
export function seedOf(x) {
  if (typeof x === 'number' && isFinite(x)) return x >>> 0;
  let h = 2166136261; const s = String(x ?? Date.now());
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function nextRand(seed) { // -> [float 0..1, nextSeed]
  let t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}
export function rand(state) { const [v, s] = nextRand(state.rng >>> 0); state.rng = s; return v; }
// a plain closure generator (for AI playouts and tools); not serialisable
export function rng(seed) { let s = seedOf(seed); return () => { const [v, n] = nextRand(s); s = n; return v; }; }
export function shuffle(arr, r = Math.random) {
  const a = arr.slice(), f = typeof r === 'function' ? r : () => rand(r);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// deal(deck, n, per) -> { hands: [[...]...], rest }; cards are taken from the END of the deck
// (the deck array is "top = last"), one at a time round-robin starting from `first`.
export function deal(deck, n, per, first = 0, packet = 1) {
  const rest = deck.slice(), hands = Array.from({ length: n }, () => []);
  for (let round = 0; round < per; round += packet) {
    for (let k = 0; k < n; k++) { const p = (first + k) % n; for (let i = 0; i < packet && round + i < per; i++) hands[p].push(rest.pop()); }
  }
  return { hands, rest };
}
export const clone = (s) => (typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s)));
export const removeCard = (arr, c) => { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); return i >= 0; };
// turn order: Italian games go counter-clockwise, i.e. to the player on the RIGHT. Player indexes
// increase in turn order, so next(p) is simply p + 1.
export const nextPlayer = (p, n, step = 1) => (((p + step) % n) + n) % n;
// teams helper: 4 players in pairs -> [[0,2],[1,3]]; otherwise each player alone
export const defaultTeams = (n, pairs = false) => (pairs && n === 4 ? [[0, 2], [1, 3]] : Array.from({ length: n }, (_, i) => [i]));
export const teamOf = (teams, p) => teams.findIndex((t) => t.includes(p));
