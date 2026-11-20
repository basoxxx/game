// Scala 40 — the Italian rummy: 2-6 players, two French decks + 4 jokers, 13 cards each, open with at
// least 40 points, sets (tris/poker of different suits) and runs (scale), joker substitution, close by
// discarding the last card; the others pay the points left in hand, out at 101 (or 201).
// Plug-in for Carte Baso (interface: src/carte/README.md). Rules and AI helpers: ./scala40/ramino.js.
import meta from './scala40.meta.js';
import { makeDeck, shuffle, clone } from '../core/cards.js';
import {
  validate, attach, jokerTargets, swapJoker, sortHand, idsFor, cachedPartition, keepScore,
  keyOf, short, shortList, meldGrid, injectCSS, sortMove, grouped, rank, suit, isJoker, SUITS,
} from './scala40/ramino.js';

injectCSS();
// ------------------------------------------------------------------ rules
export const rulesOf = (s) => ({ twoWild: false, maxWild: s.opts.jolly === 'liberi' ? 99 : 1, wildLeNat: true, setDistinct: true, setMax: 4 });
export const RULES_DEFAULT = { twoWild: false, maxWild: 1, wildLeNat: true, setDistinct: true, setMax: 4 };
// points of a card left in hand
export const penalty = (c) => (isJoker(c) ? 25 : rank(c) === 1 ? 11 : rank(c) >= 11 ? 10 : rank(c));
// points of a meld for the opening (the joker is worth the card it stands for; ace 1 in A-2-3, else 11)
export function meldPoints(m) {
  const v = (r) => (r === 1 ? 1 : r === 14 ? 11 : r >= 11 ? 10 : r);
  if (m.t === 'set') return m.cards.length * (m.r === 1 ? 11 : m.r >= 11 ? 10 : m.r);
  return m.cards.reduce((a, _, i) => a + v(m.lo + i), 0);
}
const alive = (s, p) => !s.out[p];
const nextAlive = (s, p) => { for (let k = 1; k <= s.n; k++) { const q = (p + k) % s.n; if (!s.out[q]) return q; } return p; };
const pendingMelds = (s) => s.melds.filter((m) => m.pend);
const pendingPts = (s) => pendingMelds(s).reduce((a, m) => a + meldPoints(m), 0);
const OPEN = 40;

function setup(seed, opts) {
  const n = Math.max(2, Math.min(6, opts.n || 2));
  const target = opts.target || 101;
  const s = {
    n, rng: seed >>> 0, dealer: opts.dealer ?? 0, phase: 'draw', over: false, winner: -1, void: false,
    opts: { jolly: opts.jolly || 'uno', scarto: opts.scarto || 'vietato', chiuso: +(opts.chiuso ?? 100) || 100, target },
    teams: Array.from({ length: n }, (_, i) => [i]),
    out: Array.from({ length: n }, (_, i) => (opts.totals?.[i] ?? 0) >= target),
  };
  if (s.out.filter((x) => !x).length < 2) s.out = s.out.map(() => false); // safety: never fewer than two
  s.stock = shuffle(makeDeck('fr52', { copies: 2, jokers: 4 }), s);
  s.hands = Array.from({ length: n }, () => []);
  const first = nextAlive(s, s.dealer);
  for (let k = 0; k < 13; k++) for (let i = 0; i < n; i++) { const p = (first + i) % n; if (alive(s, p)) s.hands[p].push(s.stock.pop()); }
  s.discard = [s.stock.pop()];
  s.melds = []; s.opened = Array(n).fill(false); s.openedAt = Array(n).fill(-1);
  s.stage = Array.from({ length: n }, () => []); s.sort = Array(n).fill('suit');
  s.picked = Array.from({ length: n }, () => []); s.thrown = Array.from({ length: n }, () => []);
  s.mustUse = null; s.took = null; s.turn = first; s.turnNo = 0; s.reshuffles = 0; s.inHand = false; s.last = null; s.startHand = 13;
  return s;
}

// can `c` be attached to some meld on the table (for the "no attachable discard" rule)?
const attachableAnywhere = (s, c, R) => s.melds.some((m) => !m.pend && attach(m, c, R, { keepPlace: true }));
// cards that may not be discarded now
function forbidden(s, p, R) {
  const hand = s.hands[p];
  let forbid = new Set();
  if (hand.length > 1) {
    if (s.opts.scarto === 'vietato' && s.opened[p]) for (const c of hand) if (attachableAnywhere(s, c, R)) forbid.add(c);
    if (s.took && hand.includes(s.took)) forbid.add(s.took);
    if (forbid.size >= hand.length) forbid = new Set();
  }
  return forbid;
}
const memo = new WeakMap();
function legalMoves(s, p) {
  if (s.over || p !== s.turn || s.out[p]) return [];
  let byP = memo.get(s); if (byP && byP[p]) return byP[p];
  const out = compute(s, p);
  if (!byP) { byP = {}; memo.set(s, byP); } byP[p] = out;
  return out;
}
function compute(s, p) {
  const R = rulesOf(s), hand = s.hands[p], stage = s.stage[p], out = [];
  const sortBtn = sortMove(s.sort[p]);
  if (s.phase === 'draw') {
    out.push({ a: 'draw', card: s.stock[s.stock.length - 1] });
    if (s.discard.length && !s.putBack) out.push({ a: 'take', card: s.discard[s.discard.length - 1] });
    out.push(sortBtn);
    return out;
  }
  const opened = s.opened[p], pend = pendingMelds(s).length > 0;
  const blocked = !opened && (pend || s.mustUse); // the opening is still incomplete: no discard yet
  const forbid = forbidden(s, p, R);
  for (const c of hand) {
    out.push({ a: 'stage', card: c, to: 'stage' });
    if (opened && hand.length + stage.length >= 2 && hand.length >= 2) {
      s.melds.forEach((m, i) => {
        if (attach(m, c, R, { keepPlace: true })) out.push({ a: 'att', card: c, m: i, to: `m${i}`, label: `Attacca ${short(c)}` });
        if (!isJoker(c)) for (const t of jokerTargets(m)) if (swapJoker(m, t.i, c, R)) out.push({ a: 'swap', card: c, m: i, j: t.i, to: `m${i}`, label: `Sostituisci il jolly con ${short(c)}` });
      });
    }
    if (!blocked && !forbid.has(c)) out.push({ a: 'disc', card: c, to: 'discard', label: `Scarta ${short(c)}` });
  }
  for (const c of stage) out.push({ a: 'unstage', card: c, to: `hand${p}` });
  if (stage.length) {
    const m = validate(stage, R);
    if (m && hand.length >= 1) out.push({ a: 'meldStage', label: `Cala ${shortList(m.cards)}${!opened ? ` (${meldPoints(m)} punti)` : ''}`, primary: true });
    out.push({ a: 'clear', label: 'Rimetti in mano' });
  }
  // melds by keys: the melds of the best partitions the CPU levels look for (any other meld is built
  // in the tray). Listing every possible meld would make hundreds of moves.
  const keySet = new Set();
  for (const budget of BUDGETS) {
    for (const x of planFor(s, p, R, { budget }).melds) {
      const keys = x.cards.map(keyOf).sort(), id = keys.join(',');
      if (keySet.has(id) || hand.length - keys.length < 1) continue; keySet.add(id);
      out.push({ a: 'meld', keys });
    }
  }
  if (pend) out.push({ a: 'cancel', label: `Ritira la calata (${pendingPts(s)}/${OPEN})` });
  if (!opened && s.mustUse) out.push({ a: 'putback', label: 'Rimetti lo scarto' });
  // suggestions for the human (the best partition of the hand)
  if (!stage.length) {
    const plan = planFor(s, p, R, { budget: BUDGETS[1] });
    if (plan.melds.length) {
      if (!opened) {
        const pts = plan.melds.reduce((a, x) => a + meldPoints(x.meld), 0) + pendingPts(s);
        if (pts >= OPEN) out.push({ a: 'open', melds: plan.melds.map((x) => x.cards.map(keyOf).sort()), label: `Apri con ${pts} punti`, primary: true });
      } else plan.melds.slice(0, 2).forEach((x) => out.push({ a: 'meld', keys: x.cards.map(keyOf).sort(), label: `Cala ${shortList(x.cards)}` }));
    }
  }
  out.push(sortBtn);
  return out;
}
// best melds of the hand: unopened -> opening points (must use the card taken from the discards);
// opened -> as many penalty points as possible out of the hand. One card is always kept for the discard.
function planFor(s, p, R, { budget = 2500, hand = s.hands[p], must = s.opened[p] || !s.hands[p].includes(s.mustUse) ? null : s.mustUse } = {}) {
  const opened = s.opened[p];
  const value = opened ? (cards) => cards.reduce((a, c) => a + penalty(c), 0) + cards.length * 0.5 : (cards, m) => meldPoints(m) + (cards.some(isJoker) ? -2 : 0);
  const kv = (k) => (k === 'J' ? 25 : opened ? penalty(k) + 0.5 : rank(k) === 1 ? 11 : Math.min(10, rank(k)));
  return cachedPartition(opened ? 'so' : 'su', hand, R, value, kv, { maxCards: hand.length - 1, must: must ? keyOf(must) : null, budget });
}
const BUDGETS = [400, 2500];

// ------------------------------------------------------------------ apply
function layMeld(s, p, ids, R) {
  const m = validate(ids, R); if (!m) throw new Error('scala40: combinazione non valida');
  for (const c of ids) { const h = s.hands[p], i = h.indexOf(c); if (i >= 0) h.splice(i, 1); else { const t = s.stage[p], j = t.indexOf(c); if (j >= 0) t.splice(j, 1); } }
  s.melds.push({ ...m, owner: p, pend: !s.opened[p] });
  s.last = { p, cards: m.cards.slice() };
  checkOpen(s, p);
}
function checkOpen(s, p) {
  if (s.opened[p]) return;
  const pend = pendingMelds(s), pts = pend.reduce((a, m) => a + meldPoints(m), 0);
  const used = !s.mustUse || pend.some((m) => m.cards.includes(s.mustUse));
  if (pts >= OPEN && used) {
    s.opened[p] = true; s.openedAt[p] = s.turnNo; s.mustUse = null;
    for (const m of pend) delete m.pend;
    s.say = { text: `Aperto con ${pts}!`, cls: 'blue' };
  }
}
function cancelPending(s, p) {
  while (s.melds.length && s.melds[s.melds.length - 1].pend) { const m = s.melds.pop(); s.hands[p].push(...m.cards); }
}
function endTurn(s, p) {
  s.hands[p].push(...s.stage[p]); s.stage[p] = [];
  s.took = null; s.mustUse = null; s.putBack = false; s.turnNo++;
  s.turn = nextAlive(s, p); s.phase = 'draw';
  if (s.turnNo > 120 * s.n) { s.over = true; s.void = true; s.turn = -1; s.say = { text: 'Smazzata nulla' }; return; } // safety net
  if (!s.stock.length) {
    if (s.reshuffles >= 2 || s.discard.length < 2) { s.over = true; s.void = true; s.turn = -1; s.say = { text: 'Tallone finito' }; return; }
    const top = s.discard.pop();
    s.stock = shuffle(s.discard, s); s.discard = [top]; s.reshuffles++;
    s.say = { text: 'Si rimescola' };
  }
}
function step(s, m) {
  const p = s.turn, R = rulesOf(s), hand = s.hands[p];
  s.say = null;
  const take = (c) => { const i = hand.indexOf(c); if (i < 0) throw new Error(`scala40: ${c} non in mano`); hand.splice(i, 1); };
  switch (m.a) {
    case 'sort': s.sort[p] = m.mode; break;
    case 'draw': hand.push(s.stock.pop()); s.phase = 'play'; s.last = null; break;
    case 'take': { const c = s.discard.pop(); hand.push(c); s.took = c; s.picked[p].push(c); if (!s.opened[p]) s.mustUse = c; s.phase = 'play'; s.last = null; break; }
    case 'stage': take(m.card); s.stage[p].push(m.card); break;
    case 'unstage': { const t = s.stage[p]; t.splice(t.indexOf(m.card), 1); hand.push(m.card); break; }
    case 'clear': hand.push(...s.stage[p]); s.stage[p] = []; break;
    case 'meldStage': layMeld(s, p, s.stage[p].slice(), R); break;
    case 'meld': layMeld(s, p, idsFor(m.keys, hand), R); break;
    case 'open': for (const keys of m.melds) layMeld(s, p, idsFor(keys, hand), R); break;
    case 'att': { take(m.card); s.melds[m.m] = attach(s.melds[m.m], m.card, R, { keepPlace: true }); s.last = { p, cards: [m.card] }; break; }
    case 'swap': {
      take(m.card); const old = s.melds[m.m], j = old.cards[m.j];
      s.melds[m.m] = swapJoker(old, m.j, m.card, R); hand.push(j); s.last = { p, cards: [m.card] };
      s.say = { text: 'Jolly recuperato!', cls: 'blue' }; break;
    }
    case 'cancel': cancelPending(s, p); break;
    case 'putback': cancelPending(s, p); take(s.mustUse); s.discard.push(s.mustUse); s.picked[p].pop(); s.mustUse = null; s.took = null; s.putBack = true; s.phase = 'draw'; break;
    case 'disc': {
      hand.push(...s.stage[p]); s.stage[p] = [];
      take(m.card); s.discard.push(m.card); s.thrown[p].push(m.card); s.last = { p, cards: [m.card] };
      if (!hand.length) {
        s.over = true; s.winner = p; s.turn = -1;
        s.inHand = s.openedAt[p] === s.turnNo;
        s.say = { text: s.inHand ? 'Chiusura in mano!' : 'Chiuso!', chime: true };
        return s;
      }
      endTurn(s, p); break;
    }
    default: throw new Error(`scala40: mossa sconosciuta ${m.a}`);
  }
  return s;
}
const apply = (s, m) => step(clone(s), m);
const isOver = (s) => !!s.over;

// ------------------------------------------------------------------ scoring
export function roundPenalties(s) {
  return s.hands.map((h, p) => {
    if (s.out[p] || s.void || p === s.winner) return 0;
    const base = s.opened[p] ? h.reduce((a, c) => a + penalty(c), 0) : s.opts.chiuso;
    return s.inHand ? base * 2 : base;
  });
}
function scores(s) {
  const pts = roundPenalties(s);
  const state = s.hands.map((h, p) => (s.out[p] ? 'Eliminato' : p === s.winner ? (s.inHand ? 'Chiude in mano' : 'Chiude') : s.void ? '—' : s.opened[p] ? 'Aperto' : 'Non aperto'));
  const rows = [
    { label: 'Esito', values: state, best: s.winner },
    { label: 'Carte rimaste', values: s.hands.map((h, p) => (s.out[p] ? '–' : h.length)) },
    { label: 'Valore in mano', values: s.hands.map((h, p) => (s.out[p] ? '–' : h.reduce((a, c) => a + penalty(c), 0))) },
  ];
  if (s.hands.some((h, p) => !s.out[p] && !s.opened[p] && p !== s.winner) && !s.void) rows.push({ label: `Non aperto: ${s.opts.chiuso} fissi`, values: s.hands.map((h, p) => (!s.out[p] && !s.opened[p] && p !== s.winner ? s.opts.chiuso : '–')) });
  if (s.inHand) rows.push({ label: 'Chiusura in mano: punti doppi', values: pts.map((v, p) => (p === s.winner ? '✓' : '×2')) });
  rows.push({ label: 'Penalità', values: pts });
  const melded = s.melds.filter((m) => m.owner === 0).reduce((a, m) => a + m.cards.length, 0);
  return {
    points: pts, rows,
    records: { chiusure: s.winner === 0 ? 1 : 0, calate: melded },
    coins: s.winner === 0 ? (s.inHand ? 12 : 5) : 1,
    note: s.void ? 'Smazzata nulla (tallone finito due volte o partita bloccata): nessuno paga.' : s.winner >= 0 ? `Penalità: carte rimaste in mano (jolly 25, asso 11, figure 10); chi non ha aperto paga ${s.opts.chiuso}. Si esce a ${s.opts.target}.` : '',
  };
}
function matchOver(totals, cfg, rounds) {
  const target = cfg.target || 101;
  const live = totals.map((t, i) => (t < target ? i : -1)).filter((i) => i >= 0);
  const low = () => { const m = Math.min(...totals); const w = totals.map((t, i) => (t === m ? i : -1)).filter((i) => i >= 0); return w.length === 1 ? w[0] : 'draw'; };
  if (live.length === 1) return live[0];
  if (!live.length) return low();
  if (rounds.length >= (cfg.maxRounds || 60)) return low();
  return -1;
}
function nextDealer(s, dealer) { return nextAlive(s, dealer); }

// ------------------------------------------------------------------ AI
function seenCounts(s, p) {
  const seen = {};
  const add = (c) => { const k = keyOf(c); seen[k] = (seen[k] || 0) + 1; };
  s.discard.forEach(add); s.melds.forEach((m) => m.cards.forEach(add)); s.hands[p].forEach(add);
  return seen;
}
function chooseDiscard(s, p, level, rng, legal) {
  const R = rulesOf(s), hand = s.hands[p];
  const ds = legal.filter((m) => m.a === 'disc');
  if (!ds.length) return null;
  if (ds.length === 1) return ds[0];
  const plan = planFor(s, p, R, { budget: level === 'facile' ? BUDGETS[0] : BUDGETS[1] });
  const inPlan = new Set(plan.melds.flatMap((x) => x.cards));
  const seen = level === 'difficile' ? seenCounts(s, p) : null;
  const nxt = nextAlive(s, p);
  const danger = (c) => {
    if (level === 'facile') return 0;
    let d = 0;
    for (const x of s.picked[nxt]) { if (isJoker(x)) continue; if (rank(x) === rank(c) && suit(x) !== suit(c)) d += 4; if (suit(x) === suit(c) && Math.abs(rank(x) - rank(c)) <= 2) d += 3; }
    for (const x of s.thrown[nxt].slice(-6)) { if (rank(x) === rank(c)) d -= 2; if (suit(x) === suit(c) && Math.abs(rank(x) - rank(c)) <= 1) d -= 1.5; }
    return d;
  };
  const rush = s.hands.some((h, q) => q !== p && !s.out[q] && s.opened[q] && h.length <= 4); // someone may close soon: dump big cards
  const sc = ds.map((m) => {
    const c = m.card;
    let keep = keepScore(c, hand, R, { seen }) + (inPlan.has(c) ? 40 : 0);
    keep -= penalty(c) * (rush ? 0.9 : s.opened[p] ? 0.35 : 0.15);
    keep += danger(c) * (level === 'difficile' ? 1.4 : 0.8);
    return { m, keep };
  }).sort((a, b) => a.keep - b.keep);
  if (level === 'facile') return sc[Math.min(sc.length - 1, Math.floor(rng() * Math.min(3, sc.length)))].m;
  if (level === 'difficile' && sc.length > 1) {
    // one-card lookahead over the few best candidates: which discard leaves the hand that improves most
    // with the next draw, counting the copies of each card still unseen (2 decks, 4 jokers)
    const sn = seen || seenCounts(s, p), cand = sc.slice(0, 4);
    const keys = new Set(['J']);
    for (const c of hand) { if (isJoker(c)) continue; const r = rank(c), su = suit(c); for (const t of SUITS) keys.add(`${r}${t}`); for (let d = -2; d <= 2; d++) { const q = r + d; if (q >= 1 && q <= 13) keys.add(`${q}${su}`); } if (r >= 12) keys.add(`1${su}`); }
    const left = (k) => Math.max(0, (k === 'J' ? 4 : 2) - (sn[k] || 0));
    let total = 0; for (const k of keys) total += left(k);
    const score = (h) => { const pl = planFor(s, p, R, { hand: h, budget: 300, must: null }); return s.opened[p] ? pl.value : Math.min(OPEN, pl.melds.reduce((a, x) => a + meldPoints(x.meld), 0)) * 1.5 + pl.value * 0.2; };
    let best = null;
    for (const x of cand) {
      const rest = hand.filter((c) => c !== x.m.card), base = score(rest);
      let ev = 0;
      for (const k of keys) { const n = left(k); if (!n) continue; const fake = k === 'J' ? '1J~9' : `${k}~9`; ev += n * Math.max(0, score([...rest, fake]) - base); }
      const v = base + (total ? ev / total : 0) * 1.0 - penalty(x.m.card) * 0.15 - x.keep * 0.05;
      if (!best || v > best.v) best = { v, m: x.m };
    }
    return best.m;
  }
  return sc[0].m;
}
// the moves the AI needs, built directly (cheaper than the whole legalMoves list, same objects)
function aiMoves(s, p, R) {
  const hand = s.hands[p], out = [];
  if (s.phase === 'draw') {
    out.push({ a: 'draw', card: s.stock[s.stock.length - 1] });
    if (s.discard.length && !s.putBack) out.push({ a: 'take', card: s.discard[s.discard.length - 1] });
    return out;
  }
  const opened = s.opened[p], pend = pendingMelds(s).length > 0;
  if (s.stage[p].length) out.push({ a: 'clear' });
  if (opened && hand.length >= 2) {
    for (const c of hand) s.melds.forEach((m, i) => {
      if (attach(m, c, R, { keepPlace: true })) out.push({ a: 'att', card: c, m: i, to: `m${i}` });
      if (!isJoker(c)) for (const t of jokerTargets(m)) if (swapJoker(m, t.i, c, R)) out.push({ a: 'swap', card: c, m: i, j: t.i, to: `m${i}` });
    });
  }
  if (!(!opened && (pend || s.mustUse))) { const f = forbidden(s, p, R); for (const c of hand) if (!f.has(c)) out.push({ a: 'disc', card: c, to: 'discard' }); }
  if (pend) out.push({ a: 'cancel' });
  if (!opened && s.mustUse) out.push({ a: 'putback' });
  return out;
}
function ai(s, p, level = 'normale', rng = Math.random) {
  const R = rulesOf(s), hand = s.hands[p], legal = aiMoves(s, p, R);
  const find = (pred) => legal.find(pred);
  if (s.phase === 'draw') {
    const top = s.discard[s.discard.length - 1], draw = find((m) => m.a === 'draw');
    const tk = find((m) => m.a === 'take');
    if (!tk || isJoker(top) && !s.opened[p] && level === 'facile') return draw;
    const withTop = [...hand, top];
    if (!s.opened[p]) {
      const plan = planFor(s, p, R, { hand: withTop, must: top, budget: level === 'facile' ? BUDGETS[0] : BUDGETS[1] });
      const pts = plan.melds.reduce((a, x) => a + meldPoints(x.meld), 0);
      if (pts >= OPEN && plan.melds.some((x) => x.cards.includes(top)) && (level !== 'facile' || rng() < 0.6)) return tk;
      return draw;
    }
    if (isJoker(top) && (hand.length > 3 || attachableAnywhere(s, top, R))) return tk;
    const plan = planFor(s, p, R, { hand: withTop, budget: level === 'facile' ? BUDGETS[0] : BUDGETS[1] });
    const used = plan.melds.some((x) => x.cards.includes(top));
    const att = level !== 'facile' && attachableAnywhere(s, top, R);
    if ((used || att) && (level !== 'facile' || rng() < 0.5)) return tk;
    return draw;
  }
  if (s.stage[p].length) return find((m) => m.a === 'clear');
  const meldMove = (cards) => (hand.length - cards.length >= 1 ? { a: 'meld', keys: cards.map(keyOf).sort() } : null);
  if (!s.opened[p]) {
    const plan = planFor(s, p, R, { budget: level === 'facile' ? BUDGETS[0] : BUDGETS[1] });
    const pts = plan.melds.reduce((a, x) => a + meldPoints(x.meld), 0) + pendingPts(s);
    if (pts >= OPEN && plan.melds.length) {
      const first = plan.melds.find((x) => s.mustUse && x.cards.includes(s.mustUse)) || plan.melds[0];
      const mv = meldMove(first.cards); if (mv) return mv;
    }
    if (pendingMelds(s).length || s.mustUse) return find((m) => m.a === (s.mustUse ? 'putback' : 'cancel')) || find((m) => m.a === 'cancel');
    return chooseDiscard(s, p, level, rng, legal) || legal[0];
  }
  // opened: lay what we can, recover jokers, attach, then discard
  const plan = planFor(s, p, R, { budget: level === 'facile' ? BUDGETS[0] : BUDGETS[1] });
  if (plan.melds.length && (level !== 'facile' || rng() < 0.75)) { const mv = meldMove(plan.melds[0].cards); if (mv) return mv; }
  const swap = find((m) => m.a === 'swap');
  if (swap && (level !== 'facile' || rng() < 0.5)) return swap;
  const keepJ = hand.length > 3 && level !== 'facile';
  const att = legal.filter((m) => m.a === 'att' && !(isJoker(m.card) && keepJ));
  if (att.length && hand.length >= 2) {
    // attach the most expensive card first
    att.sort((a, b) => penalty(b.card) - penalty(a.card));
    if (level !== 'facile' || rng() < 0.7) return att[0];
  }
  return chooseDiscard(s, p, level, rng, legal) || legal[0];
}

// ------------------------------------------------------------------ view
function view(s, viewer, ctx = {}) {
  const P = ctx.portrait, piles = [], names = (q) => ctx.seats?.[q]?.name || `G${q + 1}`;
  const myTurn = s.turn === viewer && !s.over;
  piles.push({ id: 'rm', cls: 'rm-mark', x: 0, y: 0, cards: [] });
  piles.push({ id: 'stock', x: P ? 0.1 : 0.07, y: P ? 0.075 : 0.2, scale: P ? 0.7 : 0.68, layout: 'stack', up: false, source: true, cards: s.stock, label: String(s.stock.length) });
  piles.push({ id: 'discard', x: P ? 0.3 : 0.16, y: P ? 0.075 : 0.2, scale: P ? 0.7 : 0.68, layout: 'stack', cards: s.discard.slice(-14).map((c) => ({ id: c, up: true })), outline: true, label: 'Scarti' });
  // older discards are kept off the table (a pile only shows its top)
  const R = rulesOf(s);
  const rect = P ? { x0: 0, x1: 1, y0: 0.19, y1: 0.97 } : { x0: 0.24, x1: 0.97, y0: 0.0, y1: 0.92 };
  piles.push(...meldGrid(s.melds, rect, {
    cols: P ? 3 : 5, scale: P ? 0.6 : 0.58, gap: 0.34, rowH: P ? 0.135 : 0.225, align: 'top',
    extra: (m) => ({ cls: `rm-meld${m.pend ? ' rm-pend' : ''}`, label: m.pend ? `apertura ${pendingPts(s)}/${OPEN}` : names(m.owner) }),
  }));
  // the tray where the human builds a new meld
  const st = s.stage[viewer] || [];
  if (myTurn && s.phase === 'play' || st.length) {
    const v = st.length ? validate(st, R) : null;
    piles.push({ id: 'stage', cls: 'rm-stage', x: P ? 0.72 : 0.115, y: P ? 0.075 : 0.66, w: P ? 0.5 : 0.19, scale: P ? 0.7 : 0.6, layout: 'row', gap: 0.42, outline: true, cards: (v ? v.cards : st).map((c) => ({ id: c, up: true })), label: v ? `Valida · ${meldPoints(v)} punti` : st.length ? 'Combinazione…' : 'Nuova combinazione' });
  }
  const sorted = (p) => (s.sort[p] === 'gruppi' ? grouped(s.hands[p], planFor(s, p, rulesOf(s), { budget: BUDGETS[1] })) : sortHand(s.hands[p], s.sort[p]));
  for (let p = 0; p < s.n; p++) {
    if (s.out[p]) continue;
    const mine = p === viewer;
    piles.push(mine
      ? { id: `hand${p}`, seat: p, slot: 'hand', layout: 'row', gap: P ? 0.5 : 0.62, maxW: P ? 0.97 : 0.8, cards: sorted(p).map((c) => ({ id: c, up: true })) }
      : { id: `hand${p}`, seat: p, slot: 'hand', cards: s.hands[p].map((c) => ({ id: c, up: !!s.over })) });
  }
  const seats = Array.from({ length: s.n }, (_, p) => ({ sub: s.out[p] ? 'eliminato' : `${s.hands[p].length} carte · ${s.opened[p] ? 'aperto' : 'da aprire'}` }));
  const hl = s.last && s.last.p !== viewer ? s.last.cards.slice() : [];
  // your turn: the cards of your hand that fit a meld on the table glow
  if (myTurn && s.phase === 'play' && s.opened[viewer]) for (const c of s.hands[viewer]) if (s.melds.some((m) => attach(m, c, R, { keepPlace: true }) || jokerTargets(m).some((t) => swapJoker(m, t.i, c, R)))) hl.push(c);
  return { piles, hl, seats, mine: `hand${viewer}`, size: P ? 0.66 : 0.82 };
}
function status(s, viewer) {
  if (s.over) return s.void ? 'Smazzata nulla' : 'Smazzata finita';
  const me = s.turn === viewer;
  const what = !me ? '' : s.phase === 'draw' ? 'Pesca dal tallone o prendi lo scarto' : !s.opened[viewer] ? (s.mustUse ? `Apri usando ${short(s.mustUse)}` : pendingMelds(s).length ? `Apertura ${pendingPts(s)}/${OPEN}: continua a calare` : `Per aprire servono ${OPEN} punti`) : 'Cala, attacca o scarta';
  return `Tallone ${s.stock.length}${what ? ` · ${what}` : ''}`;
}

const RULES = `<h3>Scala 40</h3>
<p>Due mazzi di carte francesi con 4 jolly (108 carte), da 2 a 6 giocatori, 13 carte a testa. Si gioca in senso antiorario: al proprio turno si <b>pesca</b> (dal tallone, oppure l'ultima carta degli scarti), si <b>cala</b> o si <b>attacca</b> se si può, poi si <b>scarta</b> una carta.</p>
<h3>Combinazioni</h3>
<ul><li><b>Scala</b>: almeno 3 carte consecutive dello stesso seme. L'asso sta sotto il 2 (A-2-3) o sopra il re (Q-K-A), mai «a giro» (K-A-2).</li>
<li><b>Tris / poker</b>: 3 o 4 carte dello stesso valore e di semi tutti diversi.</li>
<li>Il <b>jolly</b> sostituisce qualsiasi carta. Regola scelta: un solo jolly per combinazione (opzione «Jolly: liberi» = più jolly, ma mai più delle carte naturali).</li></ul>
<h3>Apertura</h3>
<p>La prima calata deve valere <b>almeno 40 punti</b>, anche con più combinazioni nello stesso turno: asso 11 (1 nella scala A-2-3), figure 10, le altre il loro valore, il jolly quanto la carta che sostituisce. Prima di aprire non si può attaccare alle combinazioni sul tavolo. Lo scarto si può raccogliere sempre dopo aver aperto; prima, solo per aprire subito usando proprio quella carta (altrimenti la si rimette).</p>
<h3>Dopo l'apertura</h3>
<p>Si possono calare nuove combinazioni e <b>attaccare</b> carte a qualsiasi combinazione del tavolo (alle estremità delle scale, il seme mancante ai tris). Chi ha in mano la carta che un jolly rappresenta può <b>sostituirlo</b> e riprendersi il jolly. Non si può scartare la carta appena raccolta e (opzione predefinita) nemmeno una carta che si potrebbe attaccare al tavolo, salvo l'ultima.</p>
<h3>Chiusura e punteggio</h3>
<p>Chi resta senza carte scartando l'ultima <b>chiude</b> la smazzata. Gli altri pagano i punti rimasti in mano (jolly 25, asso 11, figure 10, le altre il loro valore); chi non ha ancora aperto paga 100. Chi chiude <b>in mano</b> (tutte le carte calate nello stesso turno, senza aver aperto prima) fa pagare doppio. Se il tallone finisce si rimescolano gli scarti, al secondo esaurimento la smazzata è nulla.</p>
<p>Chi arriva a <b>101</b> punti (opzione 201) è eliminato: vince l'ultimo giocatore rimasto in gara.</p>
<h3>Come si gioca qui</h3>
<p>Tocca il tallone o lo scarto per pescare. Poi tocca una carta e la destinazione (oppure trascinala): nella <b>nuova combinazione</b> per comporla e poi «Cala», su una combinazione del tavolo per attaccarla, sugli scarti per scartarla. I pulsanti «Apri con…» e «Cala…» suggeriscono le combinazioni migliori della mano; «Ordina» alterna seme e valore.</p>`;

export default {
  ...meta,
  desc: 'Due mazzi e quattro jolly, da 2 a 6 giocatori: apri con 40 punti, cala scale e tris, recupera i jolly e chiudi per primo. Chi arriva a 101 è fuori.',
  players: [2, 6],
  decks: ['fr52'],
  thumb: ['5H', '1J', '7H'],
  options: [
    { id: 'jolly', name: 'Jolly per combinazione', values: [{ v: 'uno', label: 'Uno solo' }, { v: 'liberi', label: 'Liberi' }], default: 'uno' },
    { id: 'scarto', name: 'Scartare una carta attaccabile', values: [{ v: 'vietato', label: 'Vietato' }, { v: 'permesso', label: 'Permesso' }], default: 'vietato' },
    { id: 'chiuso', name: 'Chi non ha aperto paga', values: [{ v: 100, label: '100' }, { v: 50, label: '50' }], default: 100 },
  ],
  targets: [{ v: 101, label: 'Eliminazione a 101' }, { v: 201, label: 'Eliminazione a 201' }],
  defaultTarget: 101,
  records: { calate: 'Carte calate in una smazzata' },
  undo: 'facile',
  setup, legalMoves, apply, ai, isOver, scores, view, status, matchOver, nextDealer, rules: RULES,
};
