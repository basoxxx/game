// Burraco — 2 players or 4 in pairs, two French decks + 4 jokers; jokers and 2s (pinelle) are wildcards
// (at most one per meld). 11 cards each plus two pozzetti of 11; draw one card or take the WHOLE discard
// pile, meld sets and runs, attach to your side's melds, discard. A meld of 7+ cards is a burraco (pulito
// 200 without wildcards, sporco 100). Close after taking the pozzetto, with at least one burraco.
// Plug-in for Carte Baso (interface: src/carte/README.md). Meld logic shared with Scala 40: ./scala40/ramino.js.
import meta from './burraco.meta.js';
import { makeDeck, shuffle, clone } from '../core/cards.js';
import {
  validate, attach, sortHand, idsFor, cachedPartition, keepScore, wildCount, isWild,
  keyOf, short, shortList, meldGrid, injectCSS, sortMove, grouped, rank, suit, isJoker,
} from './scala40/ramino.js';

injectCSS();
export const R = { twoWild: true, maxWild: 1, wildLeNat: true, setDistinct: false, setMax: 99, noSetOf2: true };
// card values (melded: plus; left in hand: minus)
export const value = (c) => (isJoker(c) ? 30 : rank(c) === 2 ? 20 : rank(c) === 1 ? 15 : rank(c) >= 8 ? 10 : 5);
export const isBurraco = (m) => m.cards.length >= 7;
export const isPulito = (m) => isBurraco(m) && wildCount(m, R) === 0;
const teamOf = (s, p) => s.teams.findIndex((t) => t.includes(p));
const teamMelds = (s, T) => s.melds.map((m, i) => [m, i]).filter(([m]) => m.team === T);
const qualifies = (s, m) => (s.opts.chiusura === 'pulito' ? isPulito(m) : isBurraco(m));
const closeOk = (s, T, extra = null, replace = -1) => s.melds.some((m, i) => m.team === T && i !== replace && qualifies(s, m)) || (!!extra && qualifies(s, extra));

function setup(seed, opts) {
  const n = opts.variant === 'coppie' || opts.n === 4 ? 4 : 2;
  const s = {
    n, variant: n === 4 ? 'coppie' : 'due', rng: seed >>> 0, dealer: opts.dealer ?? 0, phase: 'draw', over: false, closer: -1,
    opts: { chiusura: opts.chiusura || 'qualsiasi', target: opts.target || 2005 },
    teams: n === 4 ? [[0, 2], [1, 3]] : [[0], [1]],
  };
  s.stock = shuffle(makeDeck('fr52', { copies: 2, jokers: 4 }), s);
  s.hands = Array.from({ length: n }, () => []);
  const first = (s.dealer + 1) % n;
  for (let k = 0; k < 11; k++) for (let i = 0; i < n; i++) s.hands[(first + i) % n].push(s.stock.pop());
  s.pz = [s.stock.splice(s.stock.length - 11, 11), s.stock.splice(s.stock.length - 11, 11)];
  s.tookPz = [false, false];
  s.discard = [s.stock.pop()];
  s.melds = []; s.stage = Array.from({ length: n }, () => []); s.sort = Array(n).fill('suit');
  s.picked = Array.from({ length: n }, () => []); s.thrown = Array.from({ length: n }, () => []);
  s.took1 = null; s.turn = first; s.turnNo = 0; s.last = null;
  return s;
}

// would leaving `rem` cards in hand be allowed? (`ok` = the side can close after this move)
function okRemain(s, p, rem, ok) {
  const T = teamOf(s, p);
  if (rem >= 2) return true;
  if (rem === 1) return !s.tookPz[T] || ok;
  return !s.tookPz[T]; // 0: the pozzetto is taken "in volo"
}
function forbidden(s, p) {
  const hand = s.hands[p], f = new Set();
  if (s.took1 && hand.includes(s.took1) && hand.length > 1) f.add(s.took1);
  return f;
}
function canDiscard(s, p, c) {
  const T = teamOf(s, p), total = s.hands[p].length + s.stage[p].length;
  if (total - 1 >= 1) return true;
  return !s.tookPz[T] || closeOk(s, T);
}
const memo = new WeakMap();
function legalMoves(s, p) {
  if (s.over || p !== s.turn) return [];
  let byP = memo.get(s); if (byP && byP[p]) return byP[p];
  const out = compute(s, p);
  if (!byP) { byP = {}; memo.set(s, byP); } byP[p] = out;
  return out;
}
const BUDGETS = [300, 1800];
function compute(s, p) {
  const hand = s.hands[p], stage = s.stage[p], out = [], T = teamOf(s, p), total = hand.length + stage.length;
  const sortBtn = sortMove(s.sort[p]);
  if (s.phase === 'draw') {
    if (s.stock.length) out.push({ a: 'draw', card: s.stock[s.stock.length - 1] });
    if (s.discard.length) out.push({ a: 'take', card: s.discard[s.discard.length - 1], label: s.discard.length > 1 ? `Raccogli gli scarti (${s.discard.length})` : undefined });
    out.push(sortBtn);
    return out;
  }
  const forbid = forbidden(s, p);
  for (const c of hand) {
    out.push({ a: 'stage', card: c, to: 'stage' });
    for (const [m, i] of teamMelds(s, T)) {
      const nm = attach(m, c, R);
      if (nm && okRemain(s, p, total - 1, closeOk(s, T, nm, i))) out.push({ a: 'att', card: c, m: i, to: `m${i}`, label: `Attacca ${short(c)}` });
    }
    if (!forbid.has(c) && canDiscard(s, p, c)) out.push({ a: 'disc', card: c, to: 'discard', label: `Scarta ${short(c)}` });
  }
  for (const c of stage) out.push({ a: 'unstage', card: c, to: `hand${p}` });
  if (stage.length) {
    const m = validate(stage, R);
    if (m && okRemain(s, p, total - stage.length, closeOk(s, T, m))) out.push({ a: 'meldStage', label: `Cala ${shortList(m.cards)}`, primary: true });
    out.push({ a: 'clear', label: 'Rimetti in mano' });
  }
  const keySet = new Set();
  BUDGETS.forEach((budget, bi) => {
    const plan = planFor(s, p, budget);
    plan.melds.forEach((x, j) => {
      const keys = x.cards.map(keyOf).sort(), id = keys.join(',');
      if (keySet.has(id) || !okRemain(s, p, hand.length - keys.length + stage.length, closeOk(s, T, x.meld))) return; keySet.add(id);
      out.push({ a: 'meld', keys, label: !stage.length && bi === 1 && j < 2 ? `Cala ${shortList(x.cards)}` : undefined });
    });
  });
  out.push(sortBtn);
  return out;
}
// melds of the hand worth laying: points, long runs (toward a burraco), wildcards kept when possible
function planFor(s, p, budget = 1800, hand = s.hands[p], wildCost = 12) {
  const T = teamOf(s, p);
  const maxCards = s.tookPz[T] ? hand.length - 1 : hand.length;
  const val = (cards, m) => {
    const w = wildCount(m, R) > 0, n = cards.length;
    return cards.reduce((a, c) => a + value(c), 0) + n * 3 + (n >= 7 ? (w ? 100 : 200) : 0) - (w ? wildCost : 0);
  };
  const kv = (k) => (k === 'J' ? 30 : rank(k) === 2 ? 20 : rank(k) === 1 ? 15 : rank(k) >= 8 ? 10 : 5) + 3 + 30;
  return cachedPartition(`b${wildCost}`, hand, R, val, kv, { maxCards, budget });
}

// ------------------------------------------------------------------ apply
function afterHandChange(s, p) {
  const T = teamOf(s, p);
  if (!s.hands[p].length && !s.stage[p].length && !s.tookPz[T] && s.phase === 'play') {
    s.hands[p] = s.pz[T]; s.pz[T] = null; s.tookPz[T] = true;
    s.say = { text: 'Pozzetto in volo!', cls: 'blue' };
  }
}
function layMeld(s, p, ids) {
  const m = validate(ids, R); if (!m) throw new Error('burraco: combinazione non valida');
  for (const c of ids) { const h = s.hands[p], i = h.indexOf(c); if (i >= 0) h.splice(i, 1); else { const t = s.stage[p], j = t.indexOf(c); if (j >= 0) t.splice(j, 1); } }
  s.melds.push({ ...m, team: teamOf(s, p), owner: p });
  s.last = { p, cards: m.cards.slice() };
  if (isBurraco(m)) s.say = { text: isPulito(m) ? 'Burraco pulito!' : 'Burraco!', chime: true };
  afterHandChange(s, p);
}
function endTurn(s, p) {
  s.hands[p].push(...s.stage[p]); s.stage[p] = [];
  s.took1 = null; s.turnNo++; s.turn = (p + 1) % s.n; s.phase = 'draw';
  if (!s.stock.length) { s.over = true; s.turn = -1; s.say = { text: 'Tallone finito' }; }
}
function step(s, m) {
  const p = s.turn, hand = s.hands[p], T = teamOf(s, p);
  s.say = null;
  const take = (c) => { const i = hand.indexOf(c); if (i < 0) throw new Error(`burraco: ${c} non in mano`); hand.splice(i, 1); };
  switch (m.a) {
    case 'sort': s.sort[p] = m.mode; break;
    case 'draw': hand.push(s.stock.pop()); s.phase = 'play'; s.last = null; break;
    case 'take': s.took1 = s.discard.length === 1 ? s.discard[0] : null; hand.push(...s.discard); s.picked[p].push(...s.discard); s.discard = []; s.phase = 'play'; s.last = null; break;
    case 'stage': take(m.card); s.stage[p].push(m.card); break;
    case 'unstage': { const t = s.stage[p]; t.splice(t.indexOf(m.card), 1); hand.push(m.card); break; }
    case 'clear': hand.push(...s.stage[p]); s.stage[p] = []; break;
    case 'meldStage': layMeld(s, p, s.stage[p].slice()); break;
    case 'meld': layMeld(s, p, idsFor(m.keys, hand)); break;
    case 'att': {
      take(m.card); const was = isBurraco(s.melds[m.m]);
      s.melds[m.m] = attach(s.melds[m.m], m.card, R); s.last = { p, cards: [m.card] };
      if (!was && isBurraco(s.melds[m.m])) s.say = { text: isPulito(s.melds[m.m]) ? 'Burraco pulito!' : 'Burraco!', chime: true };
      afterHandChange(s, p); break;
    }
    case 'disc': {
      hand.push(...s.stage[p]); s.stage[p] = [];
      take(m.card); s.discard.push(m.card); s.thrown[p].push(m.card); s.last = { p, cards: [m.card] };
      if (!hand.length) {
        if (!s.tookPz[T]) { s.hands[p] = s.pz[T]; s.pz[T] = null; s.tookPz[T] = true; s.say = { text: 'Pozzetto!', cls: 'blue' }; }
        else { s.over = true; s.closer = p; s.turn = -1; s.say = { text: 'Chiusura!', chime: true }; return s; }
      }
      endTurn(s, p); break;
    }
    default: throw new Error(`burraco: mossa sconosciuta ${m.a}`);
  }
  return s;
}
const apply = (s, m) => step(clone(s), m);
const isOver = (s) => !!s.over;

// ------------------------------------------------------------------ scoring
export function tally(s) {
  return s.teams.map((team, T) => {
    const melds = s.melds.filter((m) => m.team === T);
    const cards = melds.reduce((a, m) => a + m.cards.reduce((b, c) => b + value(c), 0), 0);
    const puliti = melds.filter(isPulito).length, sporchi = melds.filter((m) => isBurraco(m) && !isPulito(m)).length;
    const close = s.closer >= 0 && team.includes(s.closer) ? 100 : 0;
    const hand = -team.reduce((a, p) => a + s.hands[p].reduce((b, c) => b + value(c), 0) + s.stage[p].reduce((b, c) => b + value(c), 0), 0);
    const pz = s.tookPz[T] ? 0 : -100;
    return { cards, puliti, sporchi, close, hand, pz, total: cards + puliti * 200 + sporchi * 100 + close + hand + pz };
  });
}
function scores(s) {
  const t = tally(s);
  const best = (f) => { const v = t.map(f), m = Math.max(...v); return v.filter((x) => x === m).length === 1 ? v.indexOf(m) : -1; };
  const rows = [
    { label: 'Carte calate', values: t.map((x) => x.cards), best: best((x) => x.cards) },
    { label: 'Burraco puliti (200)', values: t.map((x) => (x.puliti ? `${x.puliti} = ${x.puliti * 200}` : '–')) },
    { label: 'Burraco sporchi (100)', values: t.map((x) => (x.sporchi ? `${x.sporchi} = ${x.sporchi * 100}` : '–')) },
    { label: 'Chiusura (100)', values: t.map((x) => (x.close ? '+100' : '–')), best: t.findIndex((x) => x.close) },
    { label: 'Carte in mano', values: t.map((x) => x.hand || 0) },
    { label: 'Pozzetto non preso', values: t.map((x) => (x.pz ? x.pz : '–')) },
    { label: 'Totale smazzata', values: t.map((x) => x.total), best: best((x) => x.total) },
  ];
  const me = t[0];
  return {
    points: t.map((x) => x.total), rows,
    records: { smazzata: me.total, burraco: me.puliti + me.sporchi },
    coins: Math.max(0, Math.round(me.total / 100)) + me.puliti * 2,
    note: s.closer >= 0 ? '' : 'Il tallone è finito: nessuna chiusura.',
  };
}
function matchOver(totals, cfg, rounds) {
  const target = cfg.target || 2005, max = Math.max(...totals);
  const lead = totals.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  if (target <= 1) return lead.length === 1 ? lead[0] : 'draw';
  if (max >= target && lead.length === 1) return lead[0];
  if (rounds.length >= (cfg.maxRounds || 30)) return lead.length === 1 ? lead[0] : 'draw';
  return -1;
}

// ------------------------------------------------------------------ AI
const oppTeam = (s, T) => 1 - T;
// the other side could close at any moment: get the points out of the hand
const rush = (s, T) => s.tookPz[1 - T] && closeOk(s, 1 - T) && s.hands.some((h, q) => !s.teams[T].includes(q) && h.length <= 4);
function seenCounts(s, p) {
  const seen = {}; const add = (c) => { const k = keyOf(c); seen[k] = (seen[k] || 0) + 1; };
  s.discard.forEach(add); s.melds.forEach((m) => m.cards.forEach(add)); s.hands[p].forEach(add);
  return seen;
}
// natural cards that some meld of side T could take
const feeds = (s, T, c) => !isWild(c, R) && s.melds.some((m) => m.team === T && attach(m, c, R));
function attachGain(s, T, cards) {
  let g = 0;
  for (const c of cards) if (!isWild(c, R) && s.melds.some((m) => m.team === T && attach(m, c, R))) g += value(c) + 4;
  return g;
}
function chooseDiscard(s, p, level, rng, moves) {
  const ds = moves.filter((m) => m.a === 'disc');
  if (ds.length <= 1) return ds[0] || null;
  const T = teamOf(s, p), O = oppTeam(s, T), hand = s.hands[p];
  const plan = planFor(s, p, level === 'facile' ? BUDGETS[0] : BUDGETS[1]);
  const inPlan = new Set(plan.melds.flatMap((x) => x.cards));
  const seen = level === 'difficile' ? seenCounts(s, p) : null;
  const nxt = (p + 1) % s.n;
  const sc = ds.map((m) => {
    const c = m.card;
    let keep = keepScore(c, hand, R, { seen }) + (inPlan.has(c) ? 30 : 0) + (isWild(c, R) ? 200 : 0);
    if (level !== 'facile') {
      if (feeds(s, O, c)) keep += level === 'difficile' ? 60 : 35; // never hand the pile to the opponents
      if (feeds(s, T, c)) keep += 25; // our side can still use it
      for (const x of s.picked[nxt].slice(-12)) { if (isWild(x, R)) continue; if (rank(x) === rank(c)) keep += 3; if (suit(x) === suit(c) && Math.abs(rank(x) - rank(c)) <= 2) keep += 2; }
      for (const x of s.thrown[nxt].slice(-6)) if (rank(x) === rank(c)) keep -= 3;
    }
    keep -= value(c) * (level === 'difficile' && rush(s, T) ? 1.2 : 0.25);
    return { m, keep };
  }).sort((a, b) => a.keep - b.keep);
  if (level === 'facile') return sc[Math.floor(rng() * Math.min(3, sc.length))].m;
  return sc[0].m;
}
function aiMoves(s, p) {
  // the subset of legalMoves the AI uses, built directly
  const out = [], hand = s.hands[p], T = teamOf(s, p), total = hand.length + s.stage[p].length;
  if (s.phase === 'draw') {
    if (s.stock.length) out.push({ a: 'draw', card: s.stock[s.stock.length - 1] });
    if (s.discard.length) out.push({ a: 'take', card: s.discard[s.discard.length - 1] });
    return out;
  }
  if (s.stage[p].length) out.push({ a: 'clear' });
  for (const c of hand) for (const [m, i] of teamMelds(s, T)) {
    const nm = attach(m, c, R);
    if (nm && okRemain(s, p, total - 1, closeOk(s, T, nm, i))) out.push({ a: 'att', card: c, m: i, to: `m${i}`, nm });
  }
  const f = forbidden(s, p);
  for (const c of hand) if (!f.has(c) && canDiscard(s, p, c)) out.push({ a: 'disc', card: c, to: 'discard' });
  return out;
}
function ai(s, p, level = 'normale', rng = Math.random) {
  const T = teamOf(s, p), O = oppTeam(s, T), hand = s.hands[p], moves = aiMoves(s, p);
  const budget = level === 'facile' ? BUDGETS[0] : BUDGETS[1];
  const clean = (m) => { if (!m) return m; const { nm, ...r } = m; return r; };
  if (s.phase === 'draw') {
    const draw = moves.find((m) => m.a === 'draw'), take = moves.find((m) => m.a === 'take');
    if (!take) return draw;
    if (!draw) return take;
    const pile = s.discard, top = pile[pile.length - 1];
    if (level === 'facile') {
      const p1 = planFor(s, p, budget, [...hand, top]);
      if (p1.melds.some((x) => x.cards.includes(top)) || feeds(s, T, top)) return rng() < 0.7 ? take : draw;
      return draw;
    }
    const base = planFor(s, p, budget).value, withPile = planFor(s, p, budget, [...hand, ...pile]).value;
    const gain = withPile - base + attachGain(s, T, pile);
    const danger = s.tookPz[O] && closeOk(s, O) ? pile.reduce((a, c) => a + value(c), 0) * (level === 'difficile' ? 0.5 : 0.3) : 0;
    const need = level === 'difficile' ? 12 : 18;
    if (gain - danger >= need || (pile.length >= 4 && gain - danger > 4)) return take;
    return draw;
  }
  if (s.stage[p].length) return { a: 'clear' };
  const total = hand.length;
  // 1. lay the planned melds
  const plan = planFor(s, p, budget);
  for (const x of plan.melds) {
    const keys = x.cards.map(keyOf).sort();
    if (okRemain(s, p, total - keys.length, closeOk(s, T, x.meld))) { if (level !== 'facile' || rng() < 0.8) return { a: 'meld', keys }; }
  }
  // 2. attach: naturals always (the longest meld first), wildcards to complete a burraco or near the end
  const att = moves.filter((m) => m.a === 'att');
  const nat = att.filter((m) => !isWild(m.card, R));
  if (nat.length) {
    nat.sort((a, b) => (isBurraco(b.nm) - isBurraco(a.nm)) * 50 + (b.nm.cards.length - a.nm.cards.length));
    if (level !== 'facile' || rng() < 0.8) return clean(nat[0]);
  }
  const wild = att.filter((m) => isWild(m.card, R));
  if (wild.length) {
    const closing = s.tookPz[T] && hand.length <= 3;
    const mk = wild.filter((m) => !isBurraco(s.melds[m.m]) && isBurraco(m.nm) && (level !== 'difficile' || hand.length <= 6 || s.stock.length < 15));
    if (mk.length) return clean(mk[0]);
    if (closing || (!s.tookPz[T] && hand.length <= 2) || (level === 'difficile' && rush(s, T))) return clean(wild[0]);
  }
  // 3. discard
  return chooseDiscard(s, p, level, rng, moves) || clean(moves.find((m) => m.a === 'disc')) || { a: 'clear' };
}

// ------------------------------------------------------------------ view
function view(s, viewer, ctx = {}) {
  const P = ctx.portrait, piles = [], VT = teamOf(s, viewer), myTurn = s.turn === viewer && !s.over;
  piles.push({ id: 'rm', cls: 'rm-mark', x: 0, y: 0, cards: [] });
  piles.push({ id: 'stock', x: P ? 0.08 : 0.05, y: P ? 0.06 : 0.17, scale: P ? 0.62 : 0.68, layout: 'stack', up: false, source: true, cards: s.stock, label: String(s.stock.length) });
  s.pz.forEach((pz, i) => { if (pz) piles.push({ id: `pz${i}`, x: P ? 0.22 + i * 0.07 : 0.05, y: P ? 0.06 : 0.48 + i * 0.09, rot: P ? 0 : 90, scale: P ? 0.5 : 0.55, layout: 'stack', up: false, cards: pz, label: i === 0 ? 'Pozzetti' : '' }); });
  piles.push({ id: 'discard', x: P ? 0.66 : 0.5, y: P ? 0.06 : 0.5, w: P ? 0.6 : 0.5, scale: P ? 0.62 : 0.6, layout: 'row', gap: 0.3, cards: s.discard.map((c) => ({ id: c, up: true })), outline: true, label: s.discard.length > 1 ? `Scarti · ${s.discard.length}` : 'Scarti' });
  const lab = (m) => (isBurraco(m) ? (isPulito(m) ? 'Burraco pulito' : 'Burraco sporco') : '');
  const grid = (T, rect, align) => meldGrid(s.melds.map((m, i) => ({ ...m, i })).filter((m) => m.team === T), rect, {
    cols: P ? 3 : 5, scale: P ? 0.56 : 0.52, gap: 0.3, rowH: P ? 0.12 : 0.2, align, idOf: (m) => `m${m.i}`,
    extra: (m) => ({ cls: `rm-meld${isBurraco(m) ? ' rm-bur' : ''}`, label: lab(m), z: 10 + m.i * 20 }),
  });
  piles.push(...grid(1 - VT, P ? { x0: 0, x1: 1, y0: 0.15, y1: 0.48 } : { x0: 0.1, x1: 0.9, y0: 0.0, y1: 0.4 }, 'top'));
  piles.push(...grid(VT, P ? { x0: 0, x1: 1, y0: 0.62, y1: 0.99 } : { x0: 0.1, x1: 0.88, y0: 0.6, y1: 0.97 }, 'top'));
  const st = s.stage[viewer] || [];
  if ((myTurn && s.phase === 'play') || st.length) {
    const v = st.length ? validate(st, R) : null;
    piles.push({ id: 'stage', cls: 'rm-stage', x: P ? 0.5 : 0.055, y: P ? 0.555 : 0.86, w: P ? 0.8 : 0.11, scale: P ? 0.56 : 0.56, layout: 'row', gap: 0.36, outline: true, cards: (v ? v.cards : st).map((c) => ({ id: c, up: true })), label: v ? 'Valida' : st.length ? 'Combinazione…' : 'Nuova combinazione' });
  }
  for (let p = 0; p < s.n; p++) {
    const mine = p === viewer, h = s.hands[p];
    piles.push(mine
      ? { id: `hand${p}`, seat: p, slot: 'hand', layout: 'row', gap: P ? 0.5 : 0.6, maxW: P ? 0.97 : 0.82, wrap: h.length > (P ? 16 : 24), rowGap: 0.55, oy: h.length > (P ? 16 : 24) ? -0.28 : 0, cards: (s.sort[p] === 'gruppi' ? grouped(h, planFor(s, p, BUDGETS[1])) : sortHand(h, s.sort[p])).map((c) => ({ id: c, up: true })) }
      : { id: `hand${p}`, seat: p, slot: 'hand', cards: h.map((c) => ({ id: c, up: !!s.over })) });
  }
  const seats = Array.from({ length: s.n }, (_, p) => ({ sub: `${s.hands[p].length} carte${s.tookPz[teamOf(s, p)] ? ' · pozzetto preso' : ''}` }));
  const hl = s.last && s.last.p !== viewer ? s.last.cards.slice() : [];
  // your turn: the cards of your hand that fit one of your side's melds glow
  if (myTurn && s.phase === 'play') for (const c of s.hands[viewer]) if (!isWild(c, R) && s.melds.some((m) => m.team === VT && attach(m, c, R))) hl.push(c);
  return { piles, hl, seats, mine: `hand${viewer}`, size: P ? 0.64 : 0.8 };
}
function status(s, viewer) {
  if (s.over) return s.closer >= 0 ? 'Chiusura' : 'Tallone finito';
  const me = s.turn === viewer, T = teamOf(s, viewer);
  const what = !me ? '' : s.phase === 'draw' ? 'Pesca o raccogli tutti gli scarti' : s.tookPz[T] ? (closeOk(s, T) ? 'Puoi chiudere: cala tutto e scarta l’ultima' : 'Per chiudere serve un burraco') : 'Cala, attacca o scarta';
  return `Tallone ${s.stock.length}${what ? ` · ${what}` : ''}`;
}

const RULES = `<h3>Burraco</h3>
<p>Due mazzi francesi con 4 jolly (108 carte). Si gioca in <b>due</b> o in <b>quattro a coppie</b> (il compagno siede di fronte). Ognuno riceve 11 carte; altre due pile da 11 sono i <b>pozzetti</b>, una per coppia (o per giocatore, in due). Al proprio turno si pesca una carta dal tallone <b>oppure si raccoglie tutto il pozzo degli scarti</b>, si cala o si attacca, poi si scarta una carta.</p>
<h3>Combinazioni</h3>
<ul><li><b>Scala</b>: 3 o più carte consecutive dello stesso seme (asso sotto il 2 o sopra il re, mai a giro).</li>
<li><b>Combinazione</b> (tris): 3 o più carte dello stesso valore, di qualsiasi seme (anche doppie). Non si fanno combinazioni di 2.</li>
<li><b>Jolly e pinelle</b> (i 2) sono matte: <b>al massimo una per combinazione</b>. Un 2 nella sua scala, al suo posto (A-2-3♥, 2-3-4♥), vale come carta naturale. Se si attacca la carta che la matta sostituisce, la matta scivola in fondo alla scala.</li>
<li>Si attacca solo alle combinazioni della propria coppia.</li></ul>
<h3>Burraco e pozzetto</h3>
<p>Una combinazione di <b>7 o più carte</b> è un burraco: <b>pulito</b> senza matte (200 punti), <b>sporco</b> con una matta (100). Chi resta senza carte prende il pozzetto della sua coppia: se ci arriva calando lo prende «in volo» e continua a giocare, se ci arriva scartando lo gioca dal turno successivo.</p>
<h3>Chiusura</h3>
<p>Si chiude restando senza carte con l'ultimo scarto, solo se la coppia ha già preso il pozzetto e ha almeno un burraco (opzione: un burraco pulito). Non si può scartare la sola carta appena raccolta dagli scarti. Se il tallone finisce la smazzata termina senza chiusura.</p>
<h3>Punteggio</h3>
<p>Valore delle carte calate: jolly 30, pinella 20, asso 15, dall'8 al re 10, dal 3 al 7 5. Si aggiungono i burraco (200/100) e 100 per la chiusura; si tolgono le carte rimaste in mano e 100 se la coppia non ha preso il pozzetto. Vince chi arriva per primo a <b>2005</b> punti (opzioni 1005, 1505 o una sola smazzata).</p>
<h3>Come si gioca qui</h3>
<p>Tocca il tallone per pescare o lo scarto in cima per raccogliere tutto il pozzo. Poi tocca una carta e la destinazione (o trascinala): la «nuova combinazione» per comporla e poi «Cala», una combinazione della tua coppia per attaccarla, gli scarti per scartarla. I pulsanti «Cala…» suggeriscono le combinazioni della mano; «Ordina» alterna seme e valore.</p>`;

export default {
  ...meta,
  desc: 'Il gioco di carte da salotto: pinelle e jolly, pozzetti, burraco pulito e sporco. In due o a coppie contro la CPU, si gioca fino a 2005.',
  players: [2, 4],
  variants: [
    { id: 'due', name: 'In due', desc: 'Testa a testa, un pozzetto a testa', players: [2, 2], teams: false },
    { id: 'coppie', name: 'A coppie', desc: 'Quattro giocatori, compagno di fronte', players: [4, 4], teams: true },
  ],
  decks: ['fr52'],
  thumb: ['2S', '1J', '13H'],
  options: [
    { id: 'chiusura', name: 'Per chiudere serve', values: [{ v: 'qualsiasi', label: 'Un burraco' }, { v: 'pulito', label: 'Un burraco pulito' }], default: 'qualsiasi' },
  ],
  targets: [{ v: 2005, label: '2005 punti' }, { v: 1505, label: '1505 punti' }, { v: 1005, label: '1005 punti' }, { v: 1, label: 'Una smazzata' }],
  defaultTarget: 2005,
  records: { smazzata: 'Punti in una smazzata', burraco: 'Burraco in una smazzata' },
  undo: 'facile',
  setup, legalMoves, apply, ai, isOver, scores, view, status, matchOver, rules: RULES,
};
