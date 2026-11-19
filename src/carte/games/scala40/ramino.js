// Ramino core shared by the Scala 40 and Burraco plug-ins (Carte Baso): meld validation with jokers /
// wildcards, attaching, joker substitution, candidate melds of a hand, best partition of a hand into
// melds (branch and bound, used by the AIs and by the "suggest" buttons), hand sorting, card keys and
// the table layout helpers. Pure JS, no DOM (the tiny CSS injector is guarded): usable from node tests.
//
// RULES object (per game): {
//   twoWild: false | true      2s are wildcards too (Burraco "pinelle"); a 2 of the run's suit in its own
//                              place (A-2-3, 2-3-4) counts as a natural card
//   maxWild: 1 | 99            wildcards allowed in one meld
//   wildLeNat: true            wildcards may never outnumber the natural cards
//   setDistinct: true          a set (tris / poker) needs different suits (Scala 40); false: any suits (Burraco)
//   setMax: 4 | 99             largest set
//   noSetOf2: true             no set of 2s (with twoWild the 2s are wildcards there)
// }
// A MELD on the table: { t: 'set', r, cards } or { t: 'run', s, lo, cards } (cards[i] stands for rank lo+i,
// ranks 1..14 where 14 is the ace above the king) plus game fields (owner, pending...).
import { rank as rank0, suit as suit0, base as base0 } from '../../core/cards.js';

// parsed card ids are cached: the AIs look at the same 108 ids millions of times
const PC = new Map();
const parse = (c) => { let x = PC.get(c); if (!x) { const s = suit0(c); x = { r: rank0(c), s, b: base0(c), j: s === 'J' }; x.k = x.j ? 'J' : x.b; PC.set(c, x); } return x; };
export const rank = (c) => parse(c).r;
export const suit = (c) => parse(c).s;
export const base = (c) => parse(c).b;
export const isJoker = (c) => parse(c).j;

export const SUITS = ['H', 'D', 'C', 'S'];
export const SYM = { H: '♥', D: '♦', C: '♣', S: '♠' };
export const RL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const keyOf = (c) => parse(c).k;
export const isWild = (c, R) => isJoker(c) || (!!R.twoWild && rank(c) === 2);
export const short = (c) => (isJoker(c) ? 'Jolly' : `${RL[rank(c)] || rank(c)}${SYM[suit(c)]}`);
export const shortList = (cs) => cs.map(short).join(' ');

// ------------------------------------------------------------------ validation
// naturals: [{ c, r }] same suit; wilds: [card]. Returns a run or null.
function buildRun(nat, wilds, s) {
  nat = nat.slice().sort((a, b) => a.r - b.r);
  for (let i = 1; i < nat.length; i++) if (nat[i].r === nat[i - 1].r) return null;
  const lo = nat[0].r, hi = nat[nat.length - 1].r;
  if (hi - lo > 12) return null;
  const gaps = hi - lo + 1 - nat.length;
  if (gaps > wilds.length) return null;
  let extra = wilds.length - gaps, top = hi, bot = lo;
  const maxR = lo === 1 ? 13 : 14, minR = hi === 14 ? 2 : 1;
  while (extra && top < maxR && top - bot < 12) { top++; extra--; }
  while (extra && bot > minR && top - bot < 12) { bot--; extra--; }
  if (extra) return null;
  const cards = []; let wi = 0, ni = 0;
  for (let r = bot; r <= top; r++) {
    if (ni < nat.length && nat[ni].r === r) cards.push(nat[ni++].c); else cards.push(wilds[wi++]);
  }
  return { t: 'run', s, lo: bot, cards };
}
// how many cards of a meld are used as wildcards
export function wildCount(m, R) {
  if (m.t === 'set') return m.cards.filter((c) => isJoker(c) || rank(c) !== m.r).length;
  return m.cards.filter((c, i) => isJoker(c) || suit(c) !== m.s || (rank(c) === 1 ? !(m.lo + i === 1 || m.lo + i === 14) : rank(c) !== m.lo + i)).length;
}
// the rank a run position stands for (1..14)
export const posRank = (m, i) => m.lo + i;
// is card i of the meld a wildcard (not standing for itself)?
export function isWildAt(m, i) {
  const c = m.cards[i];
  if (isJoker(c)) return true;
  if (m.t === 'set') return rank(c) !== m.r;
  const pr = m.lo + i;
  return suit(c) !== m.s || (rank(c) === 1 ? !(pr === 1 || pr === 14) : rank(c) !== pr);
}
function okCounts(nNat, nWild, R) {
  if (nNat < 2) return false;
  if (nWild > R.maxWild) return false;
  if (R.wildLeNat && nWild > nNat) return false;
  return true;
}
function trySet(cards, R) {
  const nat = cards.filter((c) => !isJoker(c) && !(R.twoWild && rank(c) === 2));
  const wild = cards.filter((c) => !nat.includes(c));
  if (!nat.length) return null;
  const r = rank(nat[0]);
  if (nat.some((c) => rank(c) !== r)) return null;
  if (R.noSetOf2 && r === 2) return null;
  if (cards.length < 3 || cards.length > (R.setMax || 99)) return null;
  if (R.setDistinct && new Set(nat.map(suit)).size !== nat.length) return null;
  if (!okCounts(nat.length, wild.length, R)) return null;
  const order = { H: 0, D: 1, C: 2, S: 3 };
  return { t: 'set', r, cards: [...nat.sort((a, b) => order[suit(a)] - order[suit(b)]), ...wild] };
}
function tryRun(cards, R) {
  const jok = cards.filter(isJoker), rest = cards.filter((c) => !isJoker(c));
  if (cards.length < 3) return null;
  // with twoWild the 2s may stand for themselves (one of them at most) or be wildcards
  const twos = R.twoWild ? rest.filter((c) => rank(c) === 2) : [];
  const plain = rest.filter((c) => !twos.includes(c));
  const options = [null, ...twos];
  let best = null;
  for (const nat2 of options) {
    const nats = nat2 ? [...plain, nat2] : plain;
    const wilds = [...jok, ...twos.filter((c) => c !== nat2)];
    if (!nats.length) continue;
    const s = suit(nats[0]);
    if (nats.some((c) => suit(c) !== s)) continue;
    if (!okCounts(nats.length, wilds.length, R)) continue;
    const aces = nats.filter((c) => rank(c) === 1);
    if (aces.length > 1) continue;
    for (const aceHigh of aces.length ? [false, true] : [false]) {
      const nat = nats.map((c) => ({ c, r: rank(c) === 1 && aceHigh ? 14 : rank(c) }));
      const m = buildRun(nat, wilds, s);
      if (m && (!best || wildCount(m, R) < wildCount(best, R))) best = m;
    }
  }
  return best;
}
// validate(cards, R) -> normalized meld (ordered cards) or null
export function validate(cards, R) {
  if (!cards || cards.length < 3) return null;
  return trySet(cards, R) || tryRun(cards, R);
}
export const sameCards = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);

// attach(meld, card, R, { keepPlace }) -> new meld or null. keepPlace (Scala 40): the cards already on the
// table keep the rank they stand for (a natural may only go at the ends; a joker is never pushed away:
// that is a substitution). Without keepPlace (Burraco) the meld is rebuilt and a wildcard whose place is
// taken by the natural card slides to an end.
export function attach(meld, card, R, { keepPlace = false } = {}) {
  if (meld.t === 'set') {
    const m = trySet([...meld.cards, card], R);
    return m ? { ...meld, ...m } : null;
  }
  if (keepPlace) {
    const len = meld.cards.length, lo = meld.lo, hi = lo + len - 1;
    if (len + 1 > 13) return null;
    const wOk = (cards) => { const w = cards.filter(isJoker).length, n = cards.length - w; return w <= R.maxWild && (!R.wildLeNat || w <= n); };
    if (!wOk([...meld.cards, card])) return null;
    const lowOk = lo > 1 && !(hi === 14 && lo - 1 < 2), highOk = hi < 14 && !(lo === 1 && hi + 1 > 13);
    if (isJoker(card)) {
      if (highOk) return { ...meld, cards: [...meld.cards, card] };
      if (lowOk) return { ...meld, lo: lo - 1, cards: [card, ...meld.cards] };
      return null;
    }
    if (suit(card) !== meld.s) return null;
    const r = rank(card);
    if (highOk && (r === hi + 1 || (r === 1 && hi + 1 === 14))) return { ...meld, cards: [...meld.cards, card] };
    if (lowOk && r === lo - 1) return { ...meld, lo: lo - 1, cards: [card, ...meld.cards] };
    return null;
  }
  const m = tryRun([...meld.cards, card], R);
  if (!m || m.s !== meld.s) return null;
  return { ...meld, ...m };
}
// Scala 40: the natural card a joker of a meld stands for. Runs: one card; sets: any missing suit.
export function jokerTargets(m) {
  const out = [];
  m.cards.forEach((c, i) => {
    if (!isJoker(c)) return;
    if (m.t === 'run') { const pr = m.lo + i; out.push({ i, keys: [`${pr === 14 ? 1 : pr}${m.s}`] }); }
    else { const have = new Set(m.cards.filter((x) => !isJoker(x)).map(suit)); out.push({ i, keys: SUITS.filter((s) => !have.has(s)).map((s) => `${m.r}${s}`) }); }
  });
  return out;
}
// swap: replace the joker at index i with `card` (a natural it stands for) -> new meld or null
export function swapJoker(m, i, card, R) {
  if (!isJoker(m.cards[i]) || isJoker(card)) return null;
  const t = jokerTargets(m).find((x) => x.i === i);
  if (!t || !t.keys.includes(base(card))) return null;
  const cards = m.cards.slice(); cards[i] = card;
  if (m.t === 'set') { const v = trySet(cards, R); return v ? { ...m, ...v } : null; }
  return { ...m, cards };
}

// ------------------------------------------------------------------ hand sorting
const SO = { H: 0, S: 1, D: 2, C: 3 }; // red/black alternate
export function sortHand(hand, mode = 'suit') {
  const rv = (c) => (isJoker(c) ? 99 : rank(c) === 1 ? (mode === 'rank' ? 14 : 1) : rank(c));
  return hand.slice().sort((a, b) => {
    if (isJoker(a) !== isJoker(b)) return isJoker(a) ? 1 : -1;
    if (mode === 'rank') return rv(a) - rv(b) || SO[suit(a)] - SO[suit(b)] || a.localeCompare(b);
    return SO[suit(a)] - SO[suit(b)] || rv(a) - rv(b) || a.localeCompare(b);
  });
}

// the "Ordina" button cycles: by suit -> by rank -> melds grouped (the suggested melds first)
const NEXT = { suit: ['rank', 'Ordina per valore'], rank: ['gruppi', 'Raggruppa le combinazioni'], gruppi: ['suit', 'Ordina per seme'] };
export const sortMove = (cur) => ({ a: 'sort', mode: NEXT[cur]?.[0] || 'rank', label: NEXT[cur]?.[1] || 'Ordina per valore' });
// hand order with the cards of plan.melds first (meld by meld), then the rest by suit
export function grouped(hand, plan) {
  const first = plan.melds.flatMap((x) => x.cards).filter((c) => hand.includes(c));
  const rest = sortHand(hand.filter((c) => !first.includes(c)), 'suit');
  return [...first, ...rest];
}

// ------------------------------------------------------------------ candidate melds of a hand (by keys)
// counts: { key: n } with 'J' for jokers. Returns [{ keys: [...], t }] — every distinct valid meld that can
// be formed (copies of the same card are interchangeable, so melds are listed by keys).
export function countKeys(cards) { const m = {}; for (const c of cards) { const k = keyOf(c); m[k] = (m[k] || 0) + 1; } return m; }
export function candidates(counts, R, { maxLen = 13 } = {}) {
  const out = [], seen = new Set();
  const push = (keys, t) => { const id = keys.slice().sort().join(','); if (seen.has(id)) return; seen.add(id); out.push({ keys, t }); };
  const J = counts.J || 0;
  const twoKeys = R.twoWild ? SUITS.map((s) => `2${s}`).filter((k) => counts[k]) : [];
  // wildcard choices for `need` wild slots: combos of available wild keys (jokers first)
  const wildPool = []; for (let i = 0; i < J; i++) wildPool.push('J'); for (const k of twoKeys) for (let i = 0; i < counts[k]; i++) wildPool.push(k);
  const wildCombos = (need, exclude = {}) => {
    if (!need) return [[]];
    const pool = wildPool.slice(); for (const [k, n] of Object.entries(exclude)) for (let i = 0; i < n; i++) { const j = pool.indexOf(k); if (j >= 0) pool.splice(j, 1); }
    const res = [], ids = new Set();
    const rec = (start, pick) => {
      if (pick.length === need) { const id = pick.join(','); if (!ids.has(id)) { ids.add(id); res.push(pick.slice()); } return; }
      for (let i = start; i < pool.length; i++) { if (i > start && pool[i] === pool[i - 1]) continue; pick.push(pool[i]); rec(i + 1, pick); pick.pop(); }
    };
    rec(0, []);
    return res;
  };
  const maxW = (nNat) => Math.min(R.maxWild, R.wildLeNat ? nNat : 99);
  // runs
  for (const s of SUITS) {
    const hv = []; for (let r = 1; r <= 14; r++) hv[r] = (counts[`${r === 14 ? 1 : r}${s}`] || 0) > 0;
    if (hv.filter(Boolean).length < 2) continue;
    const has = (r) => hv[r];
    const wl = Math.min(R.maxWild, wildPool.length);
    for (let lo = 1; lo <= 12; lo++) {
      if (!has(lo) && !wl) continue;
      let nNat = 0, nMiss = 0;
      for (let hi = lo; hi <= Math.min(14, lo + 12, lo + maxLen - 1); hi++) {
        if (has(hi)) nNat++; else nMiss++;
        if (nMiss > wl) break;
        if (hi - lo < 2 || nNat < 2 || (R.wildLeNat && nMiss > nNat)) continue;
        const natKeys = [], used = {};
        for (let r = lo; r <= hi; r++) if (has(r)) { const k = `${r === 14 ? 1 : r}${s}`; natKeys.push(k); used[k] = (used[k] || 0) + 1; }
        for (const w of wildCombos(nMiss, used)) push([...natKeys, ...w], 'run');
      }
    }
  }
  // sets
  for (let r = 1; r <= 13; r++) {
    if (R.noSetOf2 && r === 2) continue;
    if (R.twoWild && r === 2) continue;
    const per = SUITS.map((s) => counts[`${r}${s}`] || 0);
    if (per.reduce((a, b) => a + b, 0) + Math.min(J + twoKeys.length, R.maxWild) < 3) continue;
    const lim = per.map((n) => (R.setDistinct ? Math.min(1, n) : n));
    const rec = (i, pick) => {
      if (i === 4) {
        const nNat = pick.length; if (nNat < 2) return;
        for (let w = 0; w <= maxW(nNat); w++) {
          if (nNat + w < 3 || nNat + w > (R.setMax || 99)) continue;
          for (const wc of wildCombos(w)) push([...pick, ...wc], 'set');
        }
        return;
      }
      for (let k = 0; k <= lim[i]; k++) { for (let j = 0; j < k; j++) pick.push(`${r}${SUITS[i]}`); rec(i + 1, pick); for (let j = 0; j < k; j++) pick.pop(); }
    };
    rec(0, []);
  }
  return out;
}
// pick actual card ids for keys out of a hand (first copies first); null if impossible
export function idsFor(keys, hand) {
  const pool = hand.slice(), out = [];
  for (const k of keys) { const i = pool.findIndex((c) => keyOf(c) === k); if (i < 0) return null; out.push(pool[i]); pool.splice(i, 1); }
  return out;
}

// ------------------------------------------------------------------ best partition (branch and bound)
// hand: card ids. value(meldCards, meld) -> number to maximise; keyValue(key) -> upper bound of a single
// card. opts: { maxCards (melded at most), must: key that has to be melded, budget }.
// Returns { melds: [{ cards, meld }], value, dead: [cards] }.
export function bestPartition(hand, R, value, keyValue, { maxCards = 99, must = null, budget = 2500, cands = null } = {}) {
  const counts = countKeys(hand);
  const list = (cands || candidates(counts, R)).map((c) => {
    const ids = idsFor(c.keys, hand); if (!ids) return null;
    const m = validate(ids, R); if (!m) return null;
    const need = {}; for (const k of c.keys) need[k] = (need[k] || 0) + 1;
    return { keys: c.keys, need, ids, m, v: value(m.cards, m) };
  }).filter((x) => x && x.v > 0).sort((a, b) => b.v - a.v);
  const byKey = {};
  for (const c of list) for (const k of Object.keys(c.need)) (byKey[k] ||= []).push(c);
  const avail = { ...counts };
  let best = { v: -1, pick: [] }, nodes = 0;
  const chosen = [];
  const pivots = Object.keys(counts).filter((k) => k !== 'J').sort();
  const potential = () => { let p = 0; for (const k of Object.keys(avail)) if (avail[k] > 0) p += keyValue(k) * avail[k]; return p; };
  const fits = (c) => Object.entries(c.need).every(([k, n]) => (avail[k] || 0) >= n);
  let meldedN = 0;
  const rec = (pi, v) => {
    if (++nodes > budget) return;
    while (pi < pivots.length && !(avail[pivots[pi]] > 0)) pi++;
    if (pi >= pivots.length) {
      if (must && !chosen.some((c) => c.need[must])) return;
      if (v > best.v) best = { v, pick: chosen.slice() };
      return;
    }
    if (v + potential() <= best.v) return;
    const k = pivots[pi];
    for (const c of byKey[k] || []) {
      if (!fits(c)) continue;
      const len = c.keys.length; if (meldedN + len > maxCards) continue;
      for (const [kk, n] of Object.entries(c.need)) avail[kk] -= n;
      chosen.push(c); meldedN += len;
      rec(pi, v + c.v);
      chosen.pop(); meldedN -= len;
      for (const [kk, n] of Object.entries(c.need)) avail[kk] += n;
      if (nodes > budget) return;
    }
    // k stays in hand (one copy)
    if (must === k && avail[k] === 1 && !chosen.some((c) => c.need[must])) return;
    avail[k]--; rec(pi, v); avail[k]++;
  };
  rec(0, 0);
  if (best.v < 0) best = { v: 0, pick: [] };
  // materialise ids across all the melds
  const pool = hand.slice(), melds = [];
  for (const c of best.pick) {
    const ids = idsFor(c.keys, pool); if (!ids) continue;
    for (const id of ids) pool.splice(pool.indexOf(id), 1);
    const m = validate(ids, R); if (m) melds.push({ cards: m.cards, meld: m, keys: c.keys });
  }
  return { melds, value: best.v, dead: pool, nodes };
}

// cached bestPartition: the same hand is planned several times per move (legal moves, AI, discard)
const PLAN_CACHE = new Map(), CAND_CACHE = new Map();
export function candsFor(hand, R) {
  const key = `${R.maxWild}|${R.twoWild ? 1 : 0}|${hand.map(keyOf).sort().join(',')}`;
  let c = CAND_CACHE.get(key);
  if (!c) { c = candidates(countKeys(hand), R); if (CAND_CACHE.size > 500) CAND_CACHE.clear(); CAND_CACHE.set(key, c); }
  return c;
}
export function cachedPartition(tag, hand, R, value, keyValue, opts = {}) {
  const key = `${tag}|${R.maxWild}|${R.twoWild ? 1 : 0}|${opts.must || ''}|${opts.budget}|${opts.maxCards}|${hand.map(keyOf).sort().join(',')}`;
  let r = PLAN_CACHE.get(key);
  if (!r) {
    r = bestPartition(hand, R, value, keyValue, { ...opts, cands: candsFor(hand, R) });
    if (PLAN_CACHE.size > 500) PLAN_CACHE.clear();
    PLAN_CACHE.set(key, r);
  }
  // the cached plan may name other copies of the same cards: re-materialise on this hand
  const pool = hand.slice(), melds = [];
  for (const x of r.melds) {
    const ids = idsFor(x.keys, pool); if (!ids) continue;
    for (const id of ids) pool.splice(pool.indexOf(id), 1);
    const m = validate(ids, R); if (m) melds.push({ cards: m.cards, meld: m, keys: x.keys });
  }
  return { melds, value: r.value, dead: pool };
}

// ------------------------------------------------------------------ AI helpers
// how much a card is worth keeping in hand (higher = keep): neighbours, pairs, outs still unseen
export function keepScore(c, hand, R, { seen = null, copies = 2 } = {}) {
  if (isWild(c, R)) return 1000;
  const r = rank(c), s = suit(c);
  let v = 0;
  const outs = (k) => (seen ? Math.max(0, copies - (seen[k] || 0)) / copies : 1);
  for (const o of hand) {
    if (o === c) continue;
    if (isWild(o, R)) { v += 1.5; continue; }
    const ro = rank(o), so = suit(o);
    if (ro === r && so !== s) v += 5 * (0.5 + 0.5 * outs(`${r}${SUITS.find((x) => x !== s && x !== so)}`));
    if (ro === r && so === s && !R.setDistinct) v += 4;
    if (so === s) {
      const d = Math.min(Math.abs(ro - r), r === 1 || ro === 1 ? Math.abs((ro === 1 ? 14 : ro) - (r === 1 ? 14 : r)) : 99);
      if (d === 1) v += 5 * (0.5 + 0.5 * Math.max(outs(`${Math.min(r, ro) - 1}${s}`), outs(`${Math.max(r, ro) + 1}${s}`)));
      else if (d === 2) v += 3 * (0.4 + 0.6 * outs(`${(r + ro) / 2}${s}`));
    }
  }
  return v;
}

// ------------------------------------------------------------------ view helpers
// a grid of melds inside a rectangle of the centre area (fractions). Returns pile specs.
// align: 'top' | 'bottom' | 'center' (rows stacked from that side of the rectangle)
export function meldGrid(melds, rect, { cols = 5, scale = 0.6, gap = 0.36, rowH = 0.2, align = 'top', idOf = (m, i) => `m${i}`, extra = () => ({}) } = {}) {
  const k = melds.length; if (!k) return [];
  const rows = Math.ceil(k / cols), H = rect.y1 - rect.y0, cellW = (rect.x1 - rect.x0) / cols;
  const step = Math.min(rowH, H / rows), sc = step < rowH ? scale * Math.max(0.5, step / rowH) : scale;
  const used = step * rows;
  const top = align === 'bottom' ? rect.y1 - used : align === 'center' ? rect.y0 + (H - used) / 2 : rect.y0;
  return melds.map((m, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const r = align === 'bottom' ? rows - 1 - row : row;
    return { id: idOf(m, i), x: rect.x0 + cellW * (col + 0.5), y: top + step * (r + 0.5), layout: 'row', gap, w: cellW * 0.94, scale: sc, cards: m.cards.map((c) => ({ id: c, up: true })), z: 10 + i * 20, ...extra(m, i) };
  });
}
// table CSS for the rummy games (scoped by a marker pile class, so other games are untouched)
let cssDone = false;
export function injectCSS() {
  if (cssDone || typeof document === 'undefined') return; cssDone = true;
  const st = document.createElement('style'); st.dataset.carte = 'ramino';
  st.textContent = `
.ct-root:has(.rm-mark) .ct-acts { flex-wrap: wrap; justify-content: center; width: max-content; max-width: min(96%, 760px); bottom: calc(var(--ch) * var(--rm-hand, 1) + 18px); row-gap: 6px; }
.ct-root:has(.rm-mark) .ct-acts .btn { padding: 7px 12px; font-size: 13px; min-height: 0; white-space: nowrap; }
.ct-root:has(.rm-mark) .ct-acts .btn.primary { box-shadow: 0 0 0 2px rgba(255,210,63,.55); }
.ct-pile.rm-mark { visibility: hidden !important; }
.ct-pile.rm-meld .ct-lbl { bottom: auto; top: -4px; transform: translate(-50%, -100%); font-size: 10.5px; background: rgba(0,0,0,.5); opacity: .9; }
.ct-pile.rm-stage.outline { border-color: rgba(255,210,63,.55); background: rgba(255,210,63,.08); }
.ct-pile.rm-stage .ct-lbl { bottom: auto; top: -4px; transform: translate(-50%, -100%); }
.ct-pile.rm-pend .ct-lbl { background: rgba(200,120,0,.85); }
@media (max-width: 560px), (max-height: 460px) { .ct-root:has(.rm-mark) .ct-acts .btn { padding: 5px 9px; font-size: 12px; } .ct-pile.rm-meld .ct-lbl { font-size: 9.5px; } }
`;
  document.head.appendChild(st);
}
