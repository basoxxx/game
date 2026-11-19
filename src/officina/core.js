// Officina — game rules on a plain state object: grid and merges, shop, income and telemetry, free
// deliveries, auto-merge, races and trophies, garages, research, missions, boosts, offline earnings and
// the new-season (prestige) loop. No DOM and no three.js: the screen, the 3D garage, the node tests and
// the headless economy simulation (tools/officina-econ.mjs) all drive the same functions.
import { CARS, CAR_MAX, PART_IDS, PART_MAX, REGIONS, RESEARCH, PERKS, EVENTS, MISSIONS, MISSION_BONUS, BOOSTS, researchById, researchCost, perkById, carDef, rivalOf } from './data.js';

// ───────── tuning (the econ tool overrides these to explore)
export const K = {
  incBase: 0.8, incG: 2.15,          // income/s of a tier-1 car, growth per tier
  costBase: 30, costG: 3.45,          // shop price of a tier, growth per tier
  costN: 1.085,                      // price growth for each car bought at the same tier (per season)
  partCostMul: 2.2,                  // a parts crate costs this many cars of the top shop tier (base price)
  partIncome: 0.02,                  // +2% income per installed part level
  deliverEvery: 26,                  // seconds between free crates
  lapBase: 22,                       // lap time of a kart on the test track (s)
  rpPerLap: 1,
  offCapH: 2, offEff: 0.4,
  dpPerTrophy: 1 / 10, dpE0: 7, dpPow: 1.25, dpIncome: 0.05,
  shopGap: 4,
  sellFrac: 0.35,
  adrenalinePerMerge: 0.05, adrenalineDur: 45,
};

export const SAVE_VERSION = 1;
const PARTS0 = () => ({ motore: 0, aero: 0, gomme: 0, telaio: 0 });
export const car = (t, parts) => ({ k: 'car', t, parts: { ...PARTS0(), ...(parts || {}) } });
export const part = (p, t) => ({ k: 'part', p, t });
export const crate = (c, t, p) => (c === 'part' ? { k: 'crate', c, t, p } : { k: 'crate', c, t });
export const gridSize = (r) => REGIONS[r].dims[0] * REGIONS[r].dims[1];
export const dayKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function newSeason(s, now = Date.now()) {
  const lancio = s.perks?.lancio || 0;
  Object.assign(s, {
    coins: [0, 600, 6e4, 6e6][s.perks?.mecenate || 0] + 20,
    rp: 0, research: {}, region: 0, trophies: 0, events: {},
    grid: Array(gridSize(0)).fill(null), buys: {}, best: 1 + 2 * lancio, seasonEarned: 0, deliverT: 8, mergeT: 0,
    boostUntil: 0, adrUntil: 0, charge: 0, seasonStart: now,
  });
  // a garage never starts empty: two karts ready to merge (the tutorial's first move)
  s.grid[0] = car(Math.max(1, 1 + 2 * lancio - 2)); s.grid[1] = car(Math.max(1, 1 + 2 * lancio - 2));
  return s;
}
export function newState(now = Date.now()) {
  const s = {
    v: SAVE_VERSION, tokens: 3, dp: 0, dpEarned: 0, perks: {}, season: 1, trophiesAll: 0, bestEver: 1,
    seen: [1], seenParts: {}, missions: null, lastSeen: now, created: now, tut: 0,
    stats: { merges: 0, bought: 0, races: 0, wins: 0, earned: 0, laps: 0, crates: 0, installs: 0, play: 0, seasons: 0 },
    opt: { numbers: true, autoOpen: true },
  };
  newSeason(s, now);
  return s;
}
// repairs whatever comes from storage (old saves, hand edits): never throws
export function normalize(d, now = Date.now()) {
  const s = newState(now);
  if (!d || typeof d !== 'object') return s;
  for (const k of Object.keys(s)) if (d[k] !== undefined && typeof d[k] === typeof s[k]) s[k] = d[k];
  if (d.missions && typeof d.missions === 'object') s.missions = d.missions;
  s.stats = { ...newState(now).stats, ...(d.stats || {}) };
  s.opt = { numbers: true, autoOpen: true, ...(d.opt || {}) };
  s.region = Math.max(0, Math.min(REGIONS.length - 1, s.region | 0));
  const n = gridSize(s.region), g = Array.isArray(d.grid) ? d.grid : [];
  s.grid = Array.from({ length: n }, (_, i) => cleanItem(g[i]));
  s.best = Math.max(1, Math.min(CAR_MAX, s.best | 0));
  for (const it of s.grid) if (it?.k === 'car') s.best = Math.max(s.best, it.t);
  s.bestEver = Math.max(s.bestEver, s.best);
  if (!Array.isArray(s.seen)) s.seen = [1];
  for (const k of ['coins', 'rp', 'tokens', 'dp', 'dpEarned', 'seasonEarned']) if (!isFinite(s[k]) || s[k] < 0) s[k] = 0;
  return s;
}
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  const t = Math.max(1, it.t | 0);
  if (it.k === 'car') return car(Math.min(CAR_MAX, t), Object.fromEntries(PART_IDS.map((p) => [p, Math.max(0, Math.min(PART_MAX, it.parts?.[p] | 0))])));
  if (it.k === 'part' && PART_IDS.includes(it.p)) return part(it.p, Math.min(PART_MAX, t));
  if (it.k === 'crate') return it.c === 'part' && PART_IDS.includes(it.p) ? crate('part', Math.min(PART_MAX, t), it.p) : crate('car', Math.min(CAR_MAX, t));
  return null;
}

// ───────── derived values
const R = (s, id) => s.research?.[id] || 0;
// highest tier sold by the shop: four below the best car of the season (Fornitori ufficiali: one closer),
// never above best - 2; Partenza lanciata (perk) lifts the floor at the start of a season
export function shopMaxOf(s) {
  const floor = 1 + 2 * (s.perks?.lancio || 0);
  return Math.min(CAR_MAX - 2, Math.max(floor, Math.min(s.best - 2, s.best - K.shopGap + R(s, 'fornitori'))));
}
const P = (s, id) => s.perks?.[id] || 0;
export function derived(s) {
  const reg = REGIONS[s.region];
  return {
    lanes: reg.lanes + R(s, 'corsie') + P(s, 'corsia'),
    mult: reg.mult * (1 + 0.2 * R(s, 'sponsor')) * (1 + K.dpIncome * (s.dpEarned || 0)),
    shopMax: shopMaxOf(s),
    deliverEvery: K.deliverEvery * Math.pow(0.88, R(s, 'consegne')),
    mergeEvery: Math.max(R(s, 'capo'), 2 * P(s, 'capo')) ? 22 - 3 * Math.max(R(s, 'capo'), 2 * P(s, 'capo')) : 0,
    offCap: (K.offCapH + R(s, 'offcap') + 2 * P(s, 'memoria')) * 3600,
    offEff: Math.min(0.95, K.offEff + 0.06 * R(s, 'offeff') + 0.1 * P(s, 'memoria')),
    rpMult: (1 + 0.25 * R(s, 'telem')) * (1 + 0.5 * P(s, 'archivio')) * (1 + 0.02 * (s.dpEarned || 0)),
    raceBonus: 0.025 * R(s, 'pilota'),
    raceReward: 1 + 0.25 * R(s, 'premi'),
    ers: R(s, 'ers'), ersDur: 3 + 0.75 * R(s, 'ers'),
    adrDur: K.adrenalineDur + 20 * R(s, 'adrenalina'),
    crateUp: 0.07 * R(s, 'casse'),
    discount: Math.pow(0.94, R(s, 'sconti')),
    partTier: Math.min(9, 1 + Math.floor((s.best - 1) / 5) + R(s, 'ricambi')),
    trophyNeed: (r) => Math.ceil(REGIONS[r].need * (1 - 0.15 * P(s, 'bacheca'))),
  };
}

// ───────── income and telemetry
export const carIncome = (t) => K.incBase * Math.pow(K.incG, t - 1);
export const partSum = (it) => PART_IDS.reduce((a, p) => a + (it.parts?.[p] || 0), 0);
export const itemIncome = (it) => carIncome(it.t) * (1 + K.partIncome * partSum(it));
export const lapTime = (t) => K.lapBase / (1 + 0.035 * (t - 1));
// the cars running on the test track: the best `lanes` cars of the grid (indices)
export function trackCars(s, D = derived(s)) {
  const cars = [];
  s.grid.forEach((it, i) => { if (it?.k === 'car') cars.push(i); });
  cars.sort((a, b) => itemIncome(s.grid[b]) - itemIncome(s.grid[a]) || a - b);
  return cars.slice(0, D.lanes);
}
export function baseIncome(s, D = derived(s)) { return trackCars(s, D).reduce((a, i) => a + itemIncome(s.grid[i]), 0) * D.mult; }
export function boostMult(s, now = Date.now()) { return (s.boostUntil > now ? 2 : 1) * (s.adrUntil > now ? 2 : 1); }
export function incomeRate(s, now = Date.now(), D = derived(s)) { return baseIncome(s, D) * boostMult(s, now); }
export function rpRate(s, D = derived(s)) { return trackCars(s, D).reduce((a, i) => a + K.rpPerLap / lapTime(s.grid[i].t), 0) * D.rpMult; }

// ───────── shop
export function carCost(s, t, D = derived(s)) { return Math.ceil(K.costBase * Math.pow(K.costG, t - 1) * Math.pow(K.costN, s.buys[t] || 0) * D.discount); }
export function partCost(s, D = derived(s)) { return Math.ceil(K.costBase * Math.pow(K.costG, D.shopMax - 1) * K.partCostMul * D.discount); }
export const freeSlot = (s) => s.grid.findIndex((x) => !x);
export const emptyCount = (s) => s.grid.reduce((a, x) => a + (x ? 0 : 1), 0);
export function buyCar(s, t = derived(s).shopMax, mis) {
  const D = derived(s), i = freeSlot(s);
  if (t > D.shopMax || t < 1) return { ok: false, why: 'tier' };
  if (i < 0) return { ok: false, why: 'full' };
  const c = carCost(s, t, D);
  if (s.coins < c) return { ok: false, why: 'coins', cost: c };
  s.coins -= c; s.buys[t] = (s.buys[t] || 0) + 1; s.grid[i] = car(t); s.stats.bought++;
  progress(s, 'buy', 1);
  return { ok: true, slot: i, cost: c, item: s.grid[i] };
}
export function buyPart(s, rnd = Math.random) {
  const D = derived(s), i = freeSlot(s);
  if (i < 0) return { ok: false, why: 'full' };
  const c = partCost(s, D);
  if (s.coins < c) return { ok: false, why: 'coins', cost: c };
  s.coins -= c;
  s.grid[i] = part(PART_IDS[Math.floor(rnd() * 4) % 4], D.partTier);
  return { ok: true, slot: i, cost: c, item: s.grid[i] };
}
// value of an item in coins (for scrapping): a share of what it would cost to rebuild from the shop
export function sellValue(s, it) {
  if (!it) return 0;
  const sm = derived(s).shopMax;
  if (it.k === 'car') return Math.floor(K.sellFrac * K.costBase * Math.pow(K.costG, Math.min(it.t, sm) - 1) * Math.pow(2, Math.max(0, it.t - sm)));
  if (it.k === 'part') return Math.floor(K.sellFrac * partCost(s) * Math.pow(2, it.t - derived(s).partTier) * 0.5);
  return 0;
}
export function sell(s, i) {
  const it = s.grid[i]; if (!it || it.k === 'crate') return { ok: false };
  const v = Math.max(1, sellValue(s, it));
  s.grid[i] = null; s.coins += v;
  return { ok: true, value: v };
}

// ───────── merges
export function mergeResult(a, b, cap = CAR_MAX) {
  if (!a || !b || a.k === 'crate' || b.k === 'crate') return null;
  if (a.k === 'car' && b.k === 'car' && a.t === b.t && a.t < CAR_MAX) {
    if (cap && a.t >= cap) return { type: 'reject', why: 'cap' };
    const parts = {}; for (const p of PART_IDS) parts[p] = Math.max(a.parts[p] || 0, b.parts[p] || 0);
    return { type: 'merge', item: car(a.t + 1, parts) };
  }
  if (a.k === 'part' && b.k === 'part' && a.p === b.p && a.t === b.t && a.t < PART_MAX) return { type: 'merge', item: part(a.p, a.t + 1) };
  if (a.k === 'part' && b.k === 'car') {
    const have = b.parts[a.p] || 0;
    if (a.t > have) return { type: 'install', item: car(b.t, { ...b.parts, [a.p]: a.t }), back: have ? part(a.p, have) : null };
    if (a.t === have && have < PART_MAX) return { type: 'install', item: car(b.t, { ...b.parts, [a.p]: have + 1 }), back: null, fused: true };
    return { type: 'reject', why: 'part-low' };
  }
  return null;
}
export const canMerge = (a, b, cap) => { const r = mergeResult(a, b, cap); return !!r && r.type !== 'reject'; };
// drag item from slot `from` onto slot `to`: merge, install a part, move to an empty slot or swap
export function move(s, from, to) {
  if (from === to || from < 0 || to < 0 || from >= s.grid.length || to >= s.grid.length) return { type: 'none' };
  const a = s.grid[from], b = s.grid[to];
  if (!a) return { type: 'none' };
  if (!b) { s.grid[to] = a; s.grid[from] = null; return { type: 'move' }; }
  const r = mergeResult(a, b, REGIONS[s.region].cap);
  if (r?.type === 'merge') {
    s.grid[to] = r.item; s.grid[from] = null; s.stats.merges++;
    s.charge = Math.min(1, (s.charge || 0) + K.adrenalinePerMerge);
    progress(s, 'merge', 1);
    const out = { type: 'merge', item: r.item };
    if (r.item.k === 'car') Object.assign(out, discover(s, r.item.t));
    else { const k = r.item.p; if ((s.seenParts[k] || 0) < r.item.t) { s.seenParts[k] = r.item.t; out.newPart = true; } }
    return out;
  }
  if (r?.type === 'install') {
    s.grid[to] = r.item; s.grid[from] = r.back; s.stats.installs++;
    progress(s, 'install', 1);
    return { type: 'install', item: r.item, back: r.back, fused: !!r.fused, kind: a.p };
  }
  if (r?.type === 'reject') return { type: 'reject', why: r.why };
  s.grid[to] = a; s.grid[from] = b;
  return { type: 'swap' };
}
function discover(s, t) {
  const out = {};
  if (t > s.best) { s.best = t; out.newBest = true; }
  if (t > s.bestEver) s.bestEver = t;
  if (!s.seen.includes(t)) { s.seen.push(t); out.newModel = true; s.tokens += 1; }
  return out;
}
// every mergeable pair (lowest tier first): [from, to]
export function findPair(s, kinds = ['car', 'part']) {
  let best = null;
  const n = s.grid.length, cap = REGIONS[s.region].cap;
  for (let i = 0; i < n; i++) {
    const a = s.grid[i]; if (!a || !kinds.includes(a.k)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = s.grid[j]; if (!b || b.k !== a.k) continue;
      const r = mergeResult(a, b, cap); if (r?.type !== 'merge') continue;
      const score = a.k === 'car' ? a.t : a.t + 100;
      if (!best || score < best.score) best = { from: j, to: i, score };
    }
  }
  return best;
}
export function mergeAll(s, max = 99) { const done = []; for (let k = 0; k < max; k++) { const p = findPair(s); if (!p) break; done.push({ ...move(s, p.from, p.to), from: p.from, to: p.to }); } return done; }
export function openCrate(s, i, rnd = Math.random) {
  const c = s.grid[i]; if (!c || c.k !== 'crate') return null;
  const D = derived(s);
  let it;
  if (c.c === 'part') it = part(c.p, c.t);
  else { const t = Math.min(CAR_MAX, c.t + (rnd() < D.crateUp ? 1 : 0)); it = car(t); }
  s.grid[i] = it; s.stats.crates++;
  progress(s, 'crates', 1);
  return { item: it, ...(it.k === 'car' ? discover(s, it.t) : {}) };
}

// ───────── time: income, telemetry, laps, deliveries, auto-merge. Returns the events of this step.
export function tick(s, dt, now = Date.now(), rnd = Math.random) {
  const D = derived(s), ev = [];
  const inc = incomeRate(s, now, D) * dt;
  s.coins += inc; s.seasonEarned += inc; s.stats.earned += inc; s.stats.play += dt;
  const rp = rpRate(s, D) * dt; s.rp += rp;
  s._lapAcc = (s._lapAcc || 0) + trackCars(s, D).reduce((a, i) => a + dt / lapTime(s.grid[i].t), 0);
  if (s._lapAcc >= 1) { const n = Math.floor(s._lapAcc); s._lapAcc -= n; s.stats.laps += n; progress(s, 'laps', n); }
  s.deliverT -= dt;
  if (s.deliverT <= 0) {
    const i = freeSlot(s);
    if (i >= 0) { s.grid[i] = crate('car', Math.max(1, D.shopMax - 2)); ev.push({ type: 'delivery', slot: i }); s.deliverT = D.deliverEvery; }
    else s.deliverT = 3; // try again soon
  }
  if (D.mergeEvery) {
    s.mergeT = (s.mergeT || 0) + dt;
    if (s.mergeT >= D.mergeEvery) { s.mergeT = 0; const p = findPair(s); if (p) ev.push({ type: 'automerge', from: p.from, to: p.to, res: move(s, p.from, p.to) }); }
  }
  const r = checkRegion(s); if (r) ev.push(r);
  return ev;
}

// ───────── races
export function eventsOf(region) { return EVENTS.filter((e) => e.region === region); }
export const eventGrade = (s, id) => s.events?.[id] || 0;
// reward for a race result (also bookkeeping: trophies, missions, region unlock)
export function raceReward(s, ev, grade, win, now = Date.now()) {
  const D = derived(s);
  s.stats.races++;
  const out = { win, coins: 0, rp: 0, trophy: false, tokens: 0 };
  if (!win) { out.coins = Math.ceil(baseIncome(s, D) * 4); s.coins += out.coins; return out; }
  s.stats.wins++; progress(s, 'win', 1); if (ev.type === 'drag') progress(s, 'drag', 1);
  s.charge = Math.min(1, (s.charge || 0) + 0.2);
  const first = grade > eventGrade(s, ev.id);
  const inc = Math.max(baseIncome(s, D), carIncome(rivalOf(ev, grade).t) * 3);
  if (first) {
    out.coins = Math.ceil(inc * 60 * grade * D.raceReward);
    out.rp = Math.ceil(5 * (ev.region + 1) * grade * D.raceReward);
    out.trophy = true; out.tokens = grade === 3 ? 2 : 0;
    s.events[ev.id] = grade; s.trophies++; s.trophiesAll++; s.tokens += out.tokens;
  } else {
    out.coins = Math.ceil(inc * 15 * D.raceReward);
    out.rp = Math.ceil(1 * (ev.region + 1) * D.raceReward);
  }
  s.coins += out.coins; s.rp += out.rp; s.seasonEarned += out.coins; s.stats.earned += out.coins;
  const r = checkRegion(s); if (r) out.region = r.region;
  return out;
}
export function checkRegion(s) {
  const D = derived(s), nx = s.region + 1;
  if (nx >= REGIONS.length || s.trophies < D.trophyNeed(nx) || (REGIONS[nx].season || 1) > s.season) return null;
  s.region = nx;
  const n = gridSize(nx); while (s.grid.length < n) s.grid.push(null);
  s.deliverT = Math.min(s.deliverT, 2);
  return { type: 'region', region: nx };
}

// ───────── research
export function researchState(s, id) {
  const r = researchById(id), lvl = R(s, id);
  const locked = r.req && R(s, r.req[0]) < r.req[1];
  return { r, lvl, max: lvl >= r.max, locked, cost: researchCost(r, lvl) };
}
export function doResearch(s, id) {
  const st = researchState(s, id);
  if (st.max || st.locked || s.rp < st.cost) return false;
  s.rp -= st.cost; s.research[id] = st.lvl + 1;
  progress(s, 'research', 1);
  return true;
}

// ───────── new season (prestige): Dynasty points from what this season earned and the trophies won
export const PRESTIGE_REGION = 2;
export function prestigeGain(s) {
  if (s.region < PRESTIGE_REGION) return 0;
  const e = Math.log10(Math.max(1, s.seasonEarned));
  return Math.max(1, Math.floor(Math.pow(Math.max(0, e - K.dpE0), K.dpPow) + s.trophies * K.dpPerTrophy));
}
export function prestige(s, now = Date.now()) {
  const g = prestigeGain(s); if (!g) return 0;
  s.dp += g; s.dpEarned += g; s.season++; s.stats.seasons++;
  newSeason(s, now);
  return g;
}
export function buyPerk(s, id) {
  const p = perkById(id), lvl = P(s, id); if (!p || lvl >= p.max) return false;
  const c = p.cost[lvl]; if (s.dp < c) return false;
  s.dp -= c; s.perks[id] = lvl + 1;
  if (id === 'lancio') s.best = Math.max(s.best, 1 + 2 * (lvl + 1));
  return true;
}

// ───────── offline earnings: base income (no boosts) × efficiency, capped
export function offlineEarnings(s, now = Date.now()) {
  const away = Math.max(0, (now - (s.lastSeen || now)) / 1000);
  const D = derived(s);
  const secs = Math.min(away, D.offCap);
  return { away, secs, capped: away > D.offCap, coins: Math.floor(baseIncome(s, D) * secs * D.offEff), rp: Math.floor(rpRate(s, D) * secs * D.offEff), eff: D.offEff, cap: D.offCap };
}
export function applyOffline(s, now = Date.now()) {
  const o = offlineEarnings(s, now);
  if (o.away < 60) { s.lastSeen = now; return null; }
  s.coins += o.coins; s.rp += o.rp; s.seasonEarned += o.coins; s.stats.earned += o.coins;
  s.deliverT = Math.min(s.deliverT, 1);
  s.lastSeen = now;
  return o;
}

// ───────── boosts (tokens) and Adrenalina (merges fill the gauge)
export function useBoost(s, id, now = Date.now(), rnd = Math.random) {
  const b = BOOSTS.find((x) => x.id === id); if (!b || s.tokens < b.cost) return null;
  const D = derived(s);
  if ((id === 'espressa' || id === 'ricambi') && freeSlot(s) < 0) return { fail: 'full' };
  s.tokens -= b.cost;
  const out = { id };
  if (id === 'turbo') s.boostUntil = Math.max(now, s.boostUntil || 0) + 600e3;
  if (id === 'straordinario') { out.coins = Math.floor(baseIncome(s, D) * 3600); s.coins += out.coins; s.seasonEarned += out.coins; s.stats.earned += out.coins; }
  if (id === 'espressa') { out.slots = []; for (let k = 0; k < 4; k++) { const i = freeSlot(s); if (i < 0) break; s.grid[i] = crate('car', D.shopMax); out.slots.push(i); } }
  if (id === 'ricambi') { out.slots = []; const best = Math.min(PART_MAX, D.partTier + 1); for (let k = 0; k < 3; k++) { const i = freeSlot(s); if (i < 0) break; s.grid[i] = crate('part', best, PART_IDS[Math.floor(rnd() * 4) % 4]); out.slots.push(i); } }
  return out;
}
export function activateAdrenaline(s, now = Date.now()) {
  if ((s.charge || 0) < 1) return false;
  s.charge = 0; s.adrUntil = now + derived(s).adrDur * 1000;
  return true;
}

// ───────── daily missions
function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
export function ensureMissions(s, now = Date.now()) {
  const key = dayKey(now);
  if (s.missions?.day === key) return s.missions;
  let h = hashStr('officina:' + key);
  const pool = MISSIONS.slice(), list = [];
  while (list.length < 3 && pool.length) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const m = pool.splice(h % pool.length, 1)[0]; list.push({ id: m.id, n: m.n(s.region), have: 0, done: false, claimed: false, tokens: m.tokens }); }
  s.missions = { day: key, list, bonus: false };
  return s.missions;
}
export function progress(s, id, n = 1) {
  const M = s.missions; if (!M?.list) return;
  for (const m of M.list) if (m.id === id && !m.done) { m.have = Math.min(m.n, m.have + n); if (m.have >= m.n) m.done = true; }
}
export function claimMission(s, i) {
  const m = s.missions?.list?.[i]; if (!m || !m.done || m.claimed) return null;
  m.claimed = true; s.tokens += m.tokens;
  const rp = 15 * (s.region + 1); s.rp += rp;
  const out = { tokens: m.tokens, rp };
  if (!s.missions.bonus && s.missions.list.every((x) => x.claimed)) { s.missions.bonus = true; s.tokens += MISSION_BONUS; out.bonus = MISSION_BONUS; }
  return out;
}
export const missionText = (m) => MISSIONS.find((x) => x.id === m.id)?.text(m.n) || m.id;

// ───────── number formatting (Italian short scale)
const SUF = ['', 'K', 'M', 'Mld', 'Bln', 'Bld', 'Tln', 'Tld', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function fmtN(n) {
  if (!isFinite(n)) return '∞';
  n = Math.floor(n);
  if (Math.abs(n) < 1e4) return n.toLocaleString('it-IT');
  let e = Math.floor(Math.log10(Math.abs(n)) / 3); e = Math.min(e, SUF.length - 1);
  const v = n / Math.pow(1000, e);
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}`.replace('.', ',') + ' ' + SUF[e];
}
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;
}
export { CARS, REGIONS, RESEARCH, PERKS, EVENTS, BOOSTS };
