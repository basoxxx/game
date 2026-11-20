// Blackjack rules engine (Carte Baso): one player against the dealer, 6-deck shoe with a cut card,
// dealer stands (S17) or hits (H17) soft 17, peek for blackjack with an Ace or ten up, insurance 2:1,
// blackjack pays 3:2, double on any two cards (and after split if allowed), split up to 4 hands
// (split aces get one card each and cannot be resplit; 21 after a split is not a blackjack), late
// surrender optional. Pure functions over JSON state. PLAY MONEY ONLY: fictional chips.
import { makeDeck, shuffle, clone, rng, seedOf } from '../../core/cards.js';
import { handValue, isBlackjack, cardValue, basic, ADVICE, hiLo } from './strategy.js';

export const DECKS = 6, SHOE = DECKS * 52, MIN_BET = 10, MAX_BET = 1000, START_BANK = 1000;
export const CHIPS = [10, 20, 50, 100, 500];
const fmt = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// the shoe for match `base` number `no`: deterministic, so only (no, pos) travels between hands and the
// state stores no cards of the shoe (shoes are memoised here; the state keeps base / shoeNo / pos)
const SHOES = new Map();
export function shoeOf(base, no) {
  const k = `${base >>> 0}|${no}`;
  let v = SHOES.get(k);
  if (!v) { if (SHOES.size > 8) SHOES.delete(SHOES.keys().next().value); v = makeShoe(base, no); SHOES.set(k, v); }
  return v;
}
export function makeShoe(base, no) {
  const r = rng(seedOf(((base >>> 0) ^ Math.imul(no + 1, 0x9e3779b9)) >>> 0));
  const cards = shuffle(makeDeck('fr52', { copies: DECKS }), r);
  const cut = SHOE - 52 - Math.floor(r() * 30) - 8; // the cut card sits 60-90 cards from the end
  return { cards, cut };
}
// cfg: { seed, base, bank, shoeNo, pos, lastBet, rules: { h17, surrender, das }, count: 'off'|'mostra'|'quiz', stats }
export function newRound(cfg) {
  let shoeNo = cfg.shoeNo || 0, pos = cfg.pos || 0;
  let { cut } = cfg.fixed ? { cut: cfg.fixed.length } : shoeOf(cfg.base, shoeNo);
  let fresh = false;
  if (pos === 0 || pos >= cut) { if (pos >= cut) { shoeNo++; ({ cut } = shoeOf(cfg.base, shoeNo)); } pos = 1; fresh = true; } // card 0 is burned
  const s = {
    n: 1, teams: [[0]], rng: cfg.seed >>> 0, phase: 'bet', turn: 0, over: false, say: null,
    bank: cfg.bank, bank0: cfg.bank, bet: 0, lastBet: cfg.lastBet || 0,
    cut, shoeNo, pos, pos0: pos, fresh, base: cfg.base >>> 0,
    dealer: [], holeUp: false, hands: [], cur: 0, ins: 0, insDone: false,
    rules: { h17: !!cfg.rules?.h17, surrender: cfg.rules?.surrender !== false, das: cfg.rules?.das !== false },
    ...(cfg.fixed ? { fixed: cfg.fixed.slice() } : {}),
    count: cfg.count || 'off', quiz: null, hints: 0, hintOk: 0, log: [], stats: cfg.stats || null,
  };
  if (s.count === 'quiz' && pos > 1) {
    const rc = seenCount(s);
    const opts = [rc - 2, rc - 1, rc, rc + 1, rc + 2];
    const r = rng(s.rng ^ 0x51ed);
    const pick = [rc]; while (pick.length < 3) { const v = opts[Math.floor(r() * opts.length)]; if (!pick.includes(v)) pick.push(v); }
    s.quiz = { answer: rc, options: pick.sort((a, b) => a - b), asked: false, ok: null };
  }
  return s;
}
export const shoeCards = (s) => s.fixed || shoeOf(s.base, s.shoeNo).cards; // `fixed`: a stacked shoe (tests)
const draw = (s) => shoeCards(s)[s.pos++];
export const dealerValue = (s) => handValue(s.holeUp ? s.dealer : s.dealer.slice(0, 1));
// Hi-Lo running count of every card the player has seen in this shoe (the hole card only once it is up)
export function seenCount(s) {
  let rc = 0;
  const shoe = shoeCards(s);
  for (let i = 1; i < s.pos; i++) { const c = shoe[i]; if (!s.holeUp && s.dealer[1] === c) continue; rc += hiLo(c); }
  return rc;
}
export const decksLeft = (s) => Math.max(0.5, (SHOE - s.pos) / 52);
export const trueCount = (s) => seenCount(s) / decksLeft(s);

// ---------------------------------------------------------------- legality
export function allowed(s) {
  const h = s.hands[s.cur];
  if (s.phase !== 'play' || !h) return {};
  const two = h.cards.length === 2;
  return {
    double: two && s.bank >= h.bet && (!h.split || s.rules.das) && !h.aces,
    split: two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && s.hands.length < 4 && s.bank >= h.bet && !h.aces,
    surrender: two && s.rules.surrender && s.hands.length === 1 && !h.split,
  };
}
export function moves(s) {
  if (s.over) return [];
  const out = [];
  if (s.phase === 'bet') {
    if (s.quiz && !s.quiz.asked) for (const v of s.quiz.options) out.push({ a: 'guess', v, label: `Conteggio ${v > 0 ? '+' : ''}${v}` });
    const room = Math.min(s.bank, MAX_BET) - s.bet;
    for (const v of CHIPS) if (v <= room) out.push({ a: 'chip', v, label: String(v) });
    if (s.bet > 0) out.push({ a: 'clear', label: 'Azzera' });
    if (s.lastBet && s.lastBet !== s.bet && s.lastBet <= Math.min(s.bank, MAX_BET)) out.push({ a: 'repeat', label: `Ripeti ${fmt(s.lastBet)}` });
    if (s.bet >= MIN_BET && (!s.quiz || s.quiz.asked)) out.push({ a: 'deal', label: 'Distribuisci', primary: true });
    return out;
  }
  if (s.phase === 'ins') {
    const amt = s.hands[0].bet / 2, bj = isBlackjack(s.hands[0].cards);
    if (s.bank >= amt) out.push({ a: 'ins', yes: true, label: bj ? `Pari soldi (assicura ${fmt(amt)})` : `Assicurazione ${fmt(amt)}` });
    out.push({ a: 'ins', yes: false, label: 'No, grazie', primary: true });
    return out;
  }
  if (s.phase === 'play') {
    const A = allowed(s);
    out.push({ a: 'hit', label: 'Carta', primary: true }, { a: 'stand', label: 'Stai' });
    if (A.double) out.push({ a: 'double', label: 'Raddoppia' });
    if (A.split) out.push({ a: 'split', label: 'Dividi' });
    if (A.surrender) out.push({ a: 'surrender', label: 'Resa (½)' });
    out.push({ a: 'hint', label: 'Consiglio' });
  }
  return out;
}
const same = (a, b) => a.a === b.a && (a.v ?? null) === (b.v ?? null) && (a.yes ?? null) === (b.yes ?? null);
export const isLegal = (s, m) => moves(s).some((x) => same(x, m));
export const advice = (s) => { const h = s.hands[s.cur]; return h ? basic(h.cards, s.dealer[0], s.rules, allowed(s)) : null; };

// ---------------------------------------------------------------- actions (MUTATE s)
const snap = (s, frames, pause, extra = {}) => { if (frames) frames.push(Object.assign(clone(s), { turn: -1, pause, say: null }, extra)); };
export function act(s, m, frames = null) {
  if (!isLegal(s, m)) throw new Error(`blackjack: mossa illegale ${JSON.stringify(m)} (${s.phase})`);
  s.say = null;
  switch (m.a) {
    case 'guess': {
      s.quiz.asked = true; s.quiz.ok = m.v === s.quiz.answer;
      s.say = s.quiz.ok ? { text: `Giusto! ${sg(s.quiz.answer)}`, cls: 'blue' } : { text: `Era ${sg(s.quiz.answer)}`, cls: '' };
      return s;
    }
    case 'chip': s.bet += m.v; return s;
    case 'clear': s.bet = 0; return s;
    case 'repeat': s.bet = s.lastBet; return s;
    case 'deal': return deal(s, frames);
    case 'ins': return insurance(s, m.yes, frames);
    case 'hint': { const c = advice(s); s.hints++; s.hint = c; s.say = { text: ADVICE[c], cls: 'blue' }; return s; }
    default: return playMove(s, m, frames);
  }
}
const sg = (v) => `${v > 0 ? '+' : ''}${v}`;
function deal(s, frames) {
  const bet = s.bet; s.bank -= bet; s.lastBet = bet; s.bet = 0;
  const h = { cards: [], bet, split: false, aces: false, done: false, doubled: false, res: null, pay: 0 };
  s.hands = [h];
  h.cards.push(draw(s)); s.dealer.push(draw(s)); h.cards.push(draw(s)); s.dealer.push(draw(s));
  s.log.push(`Puntata ${fmt(bet)}`);
  const up = cardValue(s.dealer[0]);
  if (up === 11) { s.phase = 'ins'; return s; }
  return afterPeek(s, frames);
}
function insurance(s, yes, frames) {
  if (yes) { s.ins = s.hands[0].bet / 2; s.bank -= s.ins; s.log.push(`Assicurazione ${fmt(s.ins)}`); }
  s.insDone = true;
  return afterPeek(s, frames);
}
// the dealer peeks with an Ace or a ten up; blackjacks are settled at once
function afterPeek(s, frames) {
  const h = s.hands[0], up = cardValue(s.dealer[0]);
  const dbj = (up === 11 || up === 10) && isBlackjack(s.dealer);
  if (dbj || isBlackjack(h.cards)) { snap(s, frames, 700); s.holeUp = true; return settle(s, frames); }
  if (up === 11 && s.ins) s.log.push('Il banco non ha blackjack: assicurazione persa');
  s.phase = 'play'; s.cur = 0;
  return s;
}
function playMove(s, m, frames) {
  const h = s.hands[s.cur];
  if (m.a === 'hit') { h.cards.push(draw(s)); const v = handValue(h.cards).total; if (v >= 21) { h.done = true; if (v > 21) h.res = 'bust'; } }
  else if (m.a === 'stand') h.done = true;
  else if (m.a === 'double') { s.bank -= h.bet; h.bet *= 2; h.doubled = true; h.cards.push(draw(s)); h.done = true; if (handValue(h.cards).total > 21) h.res = 'bust'; }
  else if (m.a === 'surrender') { h.done = true; h.res = 'sur'; }
  else if (m.a === 'split') {
    const aces = cardValue(h.cards[0]) === 11;
    s.bank -= h.bet;
    const h2 = { cards: [h.cards.pop()], bet: h.bet, split: true, aces, done: false, doubled: false, res: null, pay: 0 };
    h.split = true; h.aces = aces;
    s.hands.splice(s.cur + 1, 0, h2);
    snap(s, frames, 420);
    h.cards.push(draw(s)); h2.cards.push(draw(s));
    for (const x of [h, h2]) if (x.aces || handValue(x.cards).total === 21) x.done = true;
  }
  if (m.a === 'hit' || m.a === 'double' || m.a === 'stand' || m.a === 'surrender') s.log.push(`Mano ${s.cur + 1}: ${({ hit: 'carta', stand: 'sta', double: 'raddoppia', surrender: 'resa' })[m.a]}`);
  else s.log.push(`Mano ${s.cur + 1}: divide`);
  if (s.hint) { if ({ hit: 'H', stand: 'S', double: 'D', split: 'P', surrender: 'R' }[m.a] === s.hint) s.hintOk++; s.hint = null; }
  while (s.cur < s.hands.length && s.hands[s.cur].done) s.cur++;
  if (s.cur < s.hands.length) return s;
  s.cur = s.hands.length - 1;
  return dealerPlays(s, frames);
}
function dealerPlays(s, frames) {
  snap(s, frames, 380);
  s.holeUp = true; s.phase = 'dealer';
  const live = s.hands.some((h) => !h.res);
  if (live) {
    snap(s, frames, 650);
    for (;;) {
      const { total, soft } = handValue(s.dealer);
      if (total > 17 || (total === 17 && !(soft && s.rules.h17))) break;
      s.dealer.push(draw(s));
      snap(s, frames, 600);
    }
  }
  return settle(s, frames);
}
// pay every hand; bank already lost the bets, so each payout returns stake + win
export function settle(s) {
  s.holeUp = true;
  const d = handValue(s.dealer), dbj = isBlackjack(s.dealer);
  if (s.ins) { if (dbj) { s.bank += s.ins * 3; s.insWon = true; s.log.push(`Assicurazione pagata 2:1 (+${fmt(s.ins * 2)})`); } else s.insWon = false; }
  for (const h of s.hands) {
    const v = handValue(h.cards).total, pbj = !h.split && isBlackjack(h.cards);
    if (h.res === 'sur') h.pay = h.bet / 2;
    else if (h.res === 'bust') h.pay = 0;
    else if (pbj && !dbj) { h.res = 'bj'; h.pay = h.bet + h.bet * 1.5; }
    else if (dbj) { h.res = pbj ? 'push' : 'lose'; h.pay = pbj ? h.bet : 0; }
    else if (d.total > 21 || v > d.total) { h.res = 'win'; h.pay = h.bet * 2; }
    else if (v === d.total) { h.res = 'push'; h.pay = h.bet; }
    else { h.res = 'lose'; h.pay = 0; }
    s.bank += h.pay;
  }
  s.phase = 'done'; s.over = true; s.turn = -1;
  const net = s.bank - s.bank0;
  const bj = s.hands.some((h) => h.res === 'bj');
  s.say = bj ? { text: 'Blackjack!', chime: true } : d.total > 21 && s.hands.some((h) => h.res === 'win') ? { text: 'Il banco sballa!', cls: 'blue' }
    : net > 0 ? { text: `+${fmt(net)}` } : s.hands.every((h) => h.res === 'bust') ? { text: 'Sballato', cls: 'blue' } : null;
  return s;
}
export const RES_TXT = { win: 'Vinta', lose: 'Persa', push: 'Pari', bj: 'Blackjack 3:2', bust: 'Sballata', sur: 'Resa' };
