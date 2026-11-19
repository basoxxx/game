// Festa Baso — rules of the party board ("Tabellone") and of the quick tournament ("Torneo"). Pure logic:
// the screen animates it, tools/festa-test.mjs plays whole games headless.
//
// Board: a loop of spaces; on your turn you roll the die (1-10) and hop; passing the star you buy it for
// 20 coins; you land on blue (+3), red (-3) or an event. After everyone moved: a minigame, coins by place.
// After the last round: three bonus stars (awards), then the podium; the winner is the «Re della festa».
import { rng, shuffle, placesOf } from './util.js';

const T = 'blu', R = 'rosso', E = 'evento', S = 'bonus';
const TYPES = [T, T, E, T, R, T, T, S, T, E, T, R, T, T, E, T, T, R, T, S, T, E, T, R, T, T, E, R];
// a rounded loop around the island (x, z in board units)
export const BOARD = TYPES.map((type, i) => {
  const u = i / TYPES.length * Math.PI * 2;
  const r = 13 + Math.sin(u * 3) * 2.2;
  return { i, type, x: Math.cos(u) * r * 1.35, z: Math.sin(u) * r * 0.95 };
});
export const STAR_COST = 20;
export const MINI_COINS = [10, 6, 3, 1];
export const SPACE_INFO = {
  blu: 'Casella blu: +3 monete', rosso: 'Casella rossa: −3 monete', evento: 'Evento a sorpresa', bonus: 'Casella bonus: +6 monete',
};

export function newBoard({ n, rounds = 8, seed = Date.now() & 0xffffff, names = [], minis }) {
  const r = rng(seed);
  const B = {
    n, rounds, round: 1, turn: 0, phase: 'roll', seed, dice: 0, steps: 0, log: [], mini: null, last: null,
    minis: minis?.length ? minis.slice() : null, queue: [], star: 0,
    players: Array.from({ length: n }, (_, i) => ({ i, name: names[i] || `Giocatore ${i + 1}`, coins: 10, stars: 0, pos: 0, miniWins: 0, coinsWon: 0, red: 0, events: 0, steps: 0, bought: 0 })),
  };
  Object.defineProperty(B, 'r', { value: r, enumerable: false });
  B.star = 8 + Math.floor(r() * 12);
  return B;
}
const say = (B, text, kind = '') => { B.log.push({ text, kind, round: B.round }); if (B.log.length > 40) B.log.shift(); B.last = { text, kind }; };
function moveStar(B) { const r = B.r; let s; do { s = Math.floor(r() * BOARD.length); } while (s === B.star || B.players.some((p) => p.pos === s)); B.star = s; }
export function nextMini(B) {
  const pool = B.minis || [];
  if (!B.queue.length) B.queue = shuffle(B.r, pool);
  return B.queue.shift();
}

export function boardRoll(B, value) {
  if (B.phase !== 'roll') return 0;
  B.dice = value || 1 + Math.floor(B.r() * 10); B.steps = B.dice; B.phase = 'move';
  say(B, `${B.players[B.turn].name} tira il dado: ${B.dice}!`);
  return B.dice;
}
// one hop; returns { pos, star?, landed? } so the view can animate it
export function boardMove(B) {
  if (B.phase !== 'move') return null;
  const p = B.players[B.turn]; const out = {};
  p.pos = (p.pos + 1) % BOARD.length; p.steps++; B.steps--; out.pos = p.pos;
  if (p.pos === B.star) {
    if (p.coins >= STAR_COST) { p.coins -= STAR_COST; p.stars++; p.bought++; out.star = true; say(B, `${p.name} compra una stella! (−${STAR_COST} monete)`, 'star'); moveStar(B); }
    else { out.noStar = true; say(B, `${p.name} passa dalla stella ma non ha ${STAR_COST} monete.`, 'bad'); }
  }
  if (B.steps <= 0) { out.landed = land(B, p); endTurn(B); }
  return out;
}
function land(B, p) {
  const sp = BOARD[p.pos], r = B.r;
  if (sp.type === T) { p.coins += 3; say(B, `${p.name}: casella blu, +3 monete.`, 'good'); return { type: T, coins: 3 }; }
  if (sp.type === S) { p.coins += 6; say(B, `${p.name}: casella bonus, +6 monete!`, 'good'); return { type: S, coins: 6 }; }
  if (sp.type === R) { const c = Math.min(3, p.coins); p.coins -= c; p.red++; say(B, `${p.name}: casella rossa, −${c} monete.`, 'bad'); return { type: R, coins: -c }; }
  p.events++;
  const k = Math.floor(r() * 5), others = B.players.filter((q) => q !== p);
  if (k === 0) { p.coins += 10; say(B, `Evento: pioggia di monete! ${p.name} +10.`, 'good'); return { type: E, ev: 'pioggia' }; }
  if (k === 1) { const q = others.reduce((a, b) => (b.coins > a.coins ? b : a)); const c = Math.min(5, q.coins); q.coins -= c; p.coins += c; say(B, `Evento: ${p.name} ruba ${c} monete a ${q.name}!`, 'good'); return { type: E, ev: 'furto' }; }
  if (k === 2) { const q = others[Math.floor(r() * others.length)]; const t = p.pos; p.pos = q.pos; q.pos = t; say(B, `Evento: ${p.name} e ${q.name} si scambiano di posto!`); return { type: E, ev: 'scambio' }; }
  if (k === 3) { p.pos = (B.star - 1 + BOARD.length) % BOARD.length; say(B, `Evento: il vento porta ${p.name} davanti alla stella!`, 'good'); return { type: E, ev: 'vento' }; }
  moveStar(B); say(B, 'Evento: la stella cambia posto!'); return { type: E, ev: 'stella' };
}
function endTurn(B) {
  B.turn++;
  if (B.turn >= B.n) { B.turn = 0; B.mini = nextMini(B); B.phase = 'mini'; } else B.phase = 'roll';
}
// coins by place (ties share the better place); co-op: everyone paid if the team won
export function boardAfterMini(B, res) {
  if (B.phase !== 'mini') return;
  res.places.forEach((pl, i) => {
    const p = B.players[i]; let c = MINI_COINS[pl - 1] ?? 0;
    if (res.coop) c = (res.teamWin ? 6 : 1) + (pl === 1 ? 4 : 0);
    p.coins += c; p.coinsWon += c; if (pl === 1) p.miniWins++;
  });
  B.lastMini = { id: B.mini, places: res.places.slice() };
  B.round++;
  B.phase = B.round > B.rounds ? 'final' : 'roll';
}
export function boardFinal(B) {
  if (B.phase !== 'final') return;
  const award = (title, desc, key) => {
    const best = Math.max(...B.players.map((p) => p[key]));
    if (best <= 0) return;
    const who = B.players.filter((p) => p[key] === best);
    for (const p of who) p.stars++;
    B.awards.push({ title, desc, who: who.map((p) => p.i) });
  };
  B.awards = [];
  award('Re dei minigiochi', 'più minigiochi vinti', 'miniWins');
  award('Re delle monete', 'più monete vinte nei minigiochi', 'coinsWon');
  award('Re della sfortuna', 'più caselle rosse', 'red');
  const sc = B.players.map((p) => p.stars * 1000 + p.coins);
  const pl = placesOf(sc);
  B.podium = B.players.map((p, i) => ({ ...p, place: pl[i] })).sort((a, b) => a.place - b.place || a.i - b.i);
  B.king = B.podium[0].i;
  B.phase = 'end';
}

// ───────────────────────────── Torneo: a run of minigames, first to N wins
export function newTourney({ n, target = 3, seed = Date.now() & 0xffffff, minis }) {
  const T = { n, target, seed, minis: minis.slice(), queue: [], wins: new Array(n).fill(0), played: [], champion: null, next: null };
  Object.defineProperty(T, 'r', { value: rng(seed), enumerable: false });
  T.next = tNext(T);
  return T;
}
function tNext(T) { if (!T.queue.length) T.queue = shuffle(T.r, T.minis); return T.queue.shift(); }
export function tourneyAfter(T, res) {
  res.places.forEach((pl, i) => { if (pl === 1) T.wins[i]++; });
  T.played.push({ id: T.next, places: res.places.slice() });
  const max = Math.max(...T.wins), top = T.wins.filter((w) => w === max).length;
  if (max >= T.target && top === 1) T.champion = T.wins.indexOf(max);
  else T.next = tNext(T);
}
