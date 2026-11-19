// Texas Hold'em rules engine (Carte Baso): one HAND per framework round. Pure functions over plain
// JSON state, no DOM. Betting rounds with fold / check / call / bet / raise / all-in, min-raise rules
// (an all-in for less than a full raise does not reopen the betting to players who already acted),
// uncalled bets returned, side pots, showdown with split pots (odd chips from the button's left).
// Play money only: the "chips" are fictional numbers with no value.
import { makeDeck, shuffle, clone } from '../../core/cards.js';
import { evalIds, handName, bestFive, catName } from './eval.js';

export const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
// tournament blind levels (Sit & Go); past the end every level doubles
export const BLINDS = [[10, 20], [15, 30], [25, 50], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000]];
export function blindsAt(level) {
  if (level < BLINDS.length) return BLINDS[level];
  const [s, b] = BLINDS[BLINDS.length - 1], k = 2 ** (level - BLINDS.length + 1);
  return [s * k, b * k];
}
export const START = { torneo: 1500, cash: 2000 };
export const CASH_BLINDS = [10, 20];

const sum = (a) => a.reduce((x, y) => x + y, 0);
export const potTotal = (s) => sum(s.contrib);
export const collected = (s) => sum(s.contrib) - sum(s.bets);
export const dealtIn = (s, p) => !s.out[p];
export const live = (s, p) => !s.out[p] && !s.folded[p];
export const canAct = (s, p) => live(s, p) && s.stacks[p] > 0;
export const isAllIn = (s, p) => live(s, p) && s.stacks[p] === 0;
const needs = (s, p) => canAct(s, p) && (!s.acted[p] || s.bets[p] < s.cur);
export function nextFrom(s, from, pred) { for (let k = 1; k <= s.n; k++) { const q = (from + k) % s.n; if (pred(q)) return q; } return -1; }
const liveCount = (s) => s.out.reduce((a, o, p) => a + (live(s, p) ? 1 : 0), 0);
const actCount = (s) => s.out.reduce((a, o, p) => a + (canAct(s, p) ? 1 : 0), 0);

// ---------------------------------------------------------------- new hand
// cfg: { n, seed, stacks: [...], btn, sb, bb, names? }  (players with stack 0 sit out)
export function newHand(cfg) {
  const n = cfg.n;
  const s = {
    n, rng: cfg.seed >>> 0, sb: cfg.sb, bb: cfg.bb, street: 0, over: false, turn: -1, say: null,
    stacks: cfg.stacks.slice(), start: cfg.stacks.slice(), bets: Array(n).fill(0), contrib: Array(n).fill(0),
    out: cfg.stacks.map((x) => x <= 0), folded: Array(n).fill(false), acted: Array(n).fill(false), actedAt: Array(n).fill(0),
    hole: Array.from({ length: n }, () => []), board: [], deck: [], muck: [], burn: [], log: [], cur: 0, lastRaise: cfg.bb, raises: 0,
    btn: 0, sbSeat: -1, bbSeat: -1, result: null,
  };
  const alive = (p) => !s.out[p];
  s.btn = alive(cfg.btn % n) ? cfg.btn % n : nextFrom(s, cfg.btn % n, alive);
  const players = s.out.filter((o) => !o).length;
  if (players < 2) { s.over = true; s.result = { pots: [], winners: [], shown: [], won: Array(n).fill(0), note: 'Non ci sono abbastanza giocatori.' }; return s; }
  s.deck = cfg.deck ? cfg.deck.slice() : shuffle(makeDeck('fr52'), s); // cfg.deck: a stacked deck (tests), top = last
  if (players === 2) { s.sbSeat = s.btn; s.bbSeat = nextFrom(s, s.btn, alive); }
  else { s.sbSeat = nextFrom(s, s.btn, alive); s.bbSeat = nextFrom(s, s.sbSeat, alive); }
  // deal two cards each, one at a time, starting left of the button
  for (let k = 0; k < 2; k++) { let p = s.btn; for (let i = 0; i < players; i++) { p = nextFrom(s, p, alive); s.hole[p].push(s.deck.pop()); } }
  put(s, s.sbSeat, Math.min(s.sb, s.stacks[s.sbSeat])); s.log.push({ p: s.sbSeat, st: 0, a: 'sb', amt: s.bets[s.sbSeat] });
  put(s, s.bbSeat, Math.min(s.bb, s.stacks[s.bbSeat])); s.log.push({ p: s.bbSeat, st: 0, a: 'bb', amt: s.bets[s.bbSeat] });
  s.cur = s.bb; s.lastRaise = s.bb;
  s.turn = nextFrom(s, s.bbSeat, (q) => needs(s, q));
  if (s.turn < 0) closeStreet(s, null);
  return s;
}
function put(s, p, amt) { amt = Math.max(0, Math.min(amt, s.stacks[p])); s.stacks[p] -= amt; s.bets[p] += amt; s.contrib[p] += amt; return amt; }

// ---------------------------------------------------------------- legality
export const toCall = (s, p) => Math.max(0, Math.min(s.cur - s.bets[p], s.stacks[p]));
export const maxTo = (s, p) => s.bets[p] + s.stacks[p];
export const minRaiseTo = (s) => s.cur + s.lastRaise;
// may p raise at all? not when everybody else is all-in, nor when only an incomplete raise was made
// since p last acted
export function canRaise(s, p) {
  if (!canAct(s, p) || maxTo(s, p) <= s.cur) return false;
  if (!s.out.some((o, q) => q !== p && canAct(s, q))) return false;
  return !s.acted[p] || s.cur - s.actedAt[p] >= s.lastRaise;
}
export function validRaise(s, p, to) {
  if (!canRaise(s, p) || !Number.isFinite(to) || to !== Math.floor(to)) return false;
  const mx = maxTo(s, p);
  if (to <= s.cur || to > mx) return false;
  return to >= minRaiseTo(s) || to === mx; // a short all-in is always allowed
}
export function isLegal(s, p, m) {
  if (s.over || p !== s.turn || !m) return false;
  if (m.a === 'fold') return s.cur > s.bets[p];
  if (m.a === 'check') return s.cur <= s.bets[p];
  if (m.a === 'call') return s.cur > s.bets[p];
  if (m.a === 'raise') return validRaise(s, p, m.to);
  return false;
}
const fmt = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const unit = (s) => (s.bb >= 400 ? 50 : s.bb >= 100 ? 25 : s.bb >= 40 ? 10 : 5);
// the discrete menu offered to the players (and the AI): fold, check / call, min raise, ½ pot, pot, all-in
export function menu(s, p) {
  if (s.over || p !== s.turn) return [];
  const out = [], tc = s.cur - s.bets[p];
  if (tc > 0) {
    out.push({ a: 'fold', label: 'Lascia' });
    const c = toCall(s, p);
    out.push({ a: 'call', label: c >= s.stacks[p] ? `Vedi ${fmt(c)} (all-in)` : `Vedi ${fmt(c)}`, primary: true });
  } else out.push({ a: 'check', label: 'Passa', primary: true });
  if (canRaise(s, p)) {
    const mx = maxTo(s, p), mn = Math.min(minRaiseTo(s), mx), u = unit(s);
    const pot = potTotal(s) + Math.max(0, tc);
    const verb = s.cur === 0 ? 'Punta' : 'Rilancia a';
    const tos = new Set();
    const add = (to) => { to = Math.ceil(to / u) * u; if (to < mn) to = mn; if (to < mx) tos.add(to); };
    add(mn);
    if (s.street === 0 && s.cur === s.bb) add(s.bb * 3);
    add(s.cur + pot * 0.5); add(s.cur + pot);
    for (const to of [...tos].sort((a, b) => a - b)) {
      const tag = to === mn ? ' (min)' : '';
      out.push({ a: 'raise', to, label: `${verb} ${fmt(to)}${tag}` });
    }
    out.push({ a: 'raise', to: mx, label: `All-in ${fmt(mx)}` });
  }
  return out;
}

// ---------------------------------------------------------------- actions
const snap = (s, frames, pause, extra = {}) => { if (frames) frames.push(Object.assign(clone(s), { turn: -1, pause, say: null }, extra)); };
// act(s, move, frames?) MUTATES s. frames (optional array) receives snapshots for animation.
export function act(s, m, frames = null) {
  const p = s.turn;
  if (!isLegal(s, p, m)) throw new Error(`poker: mossa illegale ${JSON.stringify(m)} per ${p}`);
  s.say = null;
  const st = s.street;
  if (m.a === 'fold') { s.folded[p] = true; s.muck.push(...s.hole[p]); s.log.push({ p, st, a: 'fold' }); }
  else if (m.a === 'check') { s.acted[p] = true; s.actedAt[p] = s.cur; s.log.push({ p, st, a: 'check' }); }
  else if (m.a === 'call') { const c = put(s, p, s.cur - s.bets[p]); s.acted[p] = true; s.actedAt[p] = s.cur; s.log.push({ p, st, a: 'call', amt: c, allin: s.stacks[p] === 0 }); }
  else {
    const to = m.to, inc = to - s.cur, wasBet = s.cur === 0;
    put(s, p, to - s.bets[p]);
    if (inc >= s.lastRaise) s.lastRaise = inc;
    s.cur = to; s.acted[p] = true; s.actedAt[p] = to; s.raises++;
    s.log.push({ p, st, a: wasBet ? 'bet' : 'raise', amt: to, allin: s.stacks[p] === 0 });
  }
  if (liveCount(s) === 1) { snap(s, frames, 420); return finishUncontested(s, frames); }
  const nx = nextFrom(s, p, (q) => needs(s, q));
  if (nx >= 0) { s.turn = nx; return s; }
  snap(s, frames, 360);
  return closeStreet(s, frames);
}
// the bet nobody matched goes back to its owner
export function refundUncalled(s) {
  let hi = -1;
  for (let p = 0; p < s.n; p++) if (hi < 0 || s.bets[p] > s.bets[hi]) hi = p;
  if (hi < 0) return 0;
  const second = Math.max(0, ...s.bets.filter((_, q) => q !== hi));
  const back = s.bets[hi] - second;
  if (back > 0) { s.bets[hi] -= back; s.contrib[hi] -= back; s.stacks[hi] += back; }
  return back;
}
function closeStreet(s, frames) {
  refundUncalled(s);
  if (s.bets.some((b) => b > 0)) snap(s, frames, 480, { collecting: true });
  s.bets.fill(0); s.acted.fill(false); s.actedAt.fill(0); s.cur = 0; s.lastRaise = s.bb; s.raises = 0;
  if (s.street === 3) return showdown(s, frames);
  if (actCount(s) <= 1) { // everybody (but at most one) is all-in: run the board out
    s.allinRun = true;
    while (s.street < 3) { dealStreet(s); if (s.street < 3) snap(s, frames, 900); }
    return showdown(s, frames);
  }
  dealStreet(s);
  s.turn = nextFrom(s, s.btn, (q) => needs(s, q));
  if (s.turn < 0) return closeStreet(s, frames);
  return s;
}
function dealStreet(s) {
  s.street++;
  s.burn.push(s.deck.pop());
  const k = s.street === 1 ? 3 : 1;
  for (let i = 0; i < k; i++) s.board.push(s.deck.pop());
}

// ---------------------------------------------------------------- pots and showdown
// pots from the contributions: [{ amount, eligible: [players] }], main pot first
export function buildPots(contrib, folded, out = []) {
  const n = contrib.length;
  const levels = [...new Set(contrib.filter((c, p) => c > 0 && !folded[p] && !out[p]))].sort((a, b) => a - b);
  const pots = []; let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (let p = 0; p < n; p++) amount += Math.min(contrib[p], L) - Math.min(contrib[p], prev);
    const eligible = []; for (let p = 0; p < n; p++) if (!folded[p] && !out[p] && contrib[p] >= L) eligible.push(p);
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  // chips of folded players above the highest live level (can only happen with odd sequences): last pot
  let extra = 0; for (let p = 0; p < n; p++) extra += Math.max(0, contrib[p] - prev);
  if (extra && pots.length) pots[pots.length - 1].amount += extra;
  return pots;
}
// split `amount` among winners; odd chips go one by one starting from the first winner left of the button
export function splitPot(amount, winners, btn, n) {
  const order = winners.slice().sort((a, b) => ((a - btn - 1 + n) % n) - ((b - btn - 1 + n) % n));
  const each = Math.floor(amount / order.length); let rest = amount - each * order.length;
  const out = new Map(order.map((p) => [p, each]));
  for (const p of order) { if (!rest) break; out.set(p, out.get(p) + 1); rest--; }
  return out;
}
function award(s, pots, scoreOf) {
  const won = Array(s.n).fill(0), res = [];
  for (const pot of pots) {
    let best = -1, ws = [];
    for (const p of pot.eligible) { const v = scoreOf(p); if (v > best) { best = v; ws = [p]; } else if (v === best) ws.push(p); }
    const shares = splitPot(pot.amount, ws, s.btn, s.n);
    for (const [p, v] of shares) { won[p] += v; s.stacks[p] += v; }
    res.push({ amount: pot.amount, winners: ws, eligible: pot.eligible, score: best });
  }
  return { won, res };
}
function finishUncontested(s, frames) {
  refundUncalled(s);
  const w = s.out.findIndex((o, p) => live(s, p));
  snap(s, frames, 380, { collecting: true });
  const amount = potTotal(s);
  s.stacks[w] += amount;
  const won = Array(s.n).fill(0); won[w] = amount;
  s.bets.fill(0);
  s.result = { uncontested: true, pots: [{ amount, winners: [w], eligible: [w], score: -1 }], winners: [w], shown: [], won, names: {}, best: [] };
  s.over = true; s.turn = -1; s.street = Math.max(s.street, 0);
  return s;
}
function showdown(s, frames) {
  const shown = []; const scores = {}; const names = {};
  for (let p = 0; p < s.n; p++) if (live(s, p)) { shown.push(p); scores[p] = evalIds([...s.hole[p], ...s.board]); names[p] = handName(scores[p]); }
  const pots = buildPots(s.contrib, s.folded, s.out);
  const { won, res } = award(s, pots, (p) => scores[p]);
  const winners = [...new Set(res.flatMap((r) => r.winners))];
  const top = res[0];
  const best = top ? top.winners.flatMap((p) => bestFive([...s.hole[p], ...s.board])) : [];
  s.result = { uncontested: false, pots: res, winners, shown, won, names, scores, best };
  s.bets.fill(0);
  s.over = true; s.turn = -1; s.street = 4;
  if (top) { const sc = top.score; s.say = { text: top.winners.length > 1 ? 'Piatto diviso' : catName(top.score), cls: (sc >> 20) >= 4 ? '' : 'blue', chime: (sc >> 20) >= 6 }; }
  return s;
}
// chips on the table: stacks plus the pot while the hand is running (after the showdown the pot is paid)
export const chipsInPlay = (s) => sum(s.stacks) + (s.over ? 0 : potTotal(s));
