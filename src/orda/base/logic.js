// Orda · La tua base — pure rules: placing / moving / upgrading buildings, real-time production with a
// capped offline accrual, raid tickets. Every function takes `now` (ms) so tests can step time.
import { GRID, HOUR, BUILDINGS, limitOf, maxLevelAt, typeUnlocked, hqUnlocked, investOf, RAID_TOKENS, RAID_REGEN_H, HQ_UNLOCK } from './data.js';

// ---- seeded randomness (mulberry32) + string hash, shared by generators and the simulation
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(...parts) {
  let h = 2166136261;
  for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// ---- layout queries
export const sizeOf = (t) => BUILDINGS[t]?.size || 1;
export const hqOf = (layout) => layout.b.find((b) => b.t === 'hq');
export const hqLevel = (layout) => hqOf(layout)?.l || 1;
export const countOf = (layout, t) => layout.b.filter((b) => b.t === t).length;
export function cellsOf(b) {
  const s = sizeOf(b.t), out = [];
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) out.push([b.x + dx, b.y + dy]);
  return out;
}
export function occupancy(layout, skipId = null) {
  const g = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  for (const b of layout.b) if (b.id !== skipId) for (const [x, y] of cellsOf(b)) if (x >= 0 && y >= 0 && x < GRID && y < GRID) g[y][x] = b;
  return g;
}
export const at = (layout, x, y) => occupancy(layout)[y]?.[x] || null;

export function fits(layout, t, x, y, skipId = null) {
  const s = sizeOf(t);
  if (x < 0 || y < 0 || x + s > GRID || y + s > GRID) return false;
  const g = occupancy(layout, skipId);
  for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (g[y + dy][x + dx]) return false;
  return true;
}

// Can the player build a new `t` right now? → { ok, why } (why = Italian, shown in the UI)
export function canBuild(state, t, prog) {
  const B = BUILDINGS[t]; if (!B || t === 'hq') return { ok: false, why: 'Edificio sconosciuto' };
  if (!typeUnlocked(t, prog)) return { ok: false, why: `Si sblocca al livello ${B.unlock} della campagna`, locked: true };
  const hq = hqLevel(state.layout), lim = limitOf(t, hq), n = countOf(state.layout, t);
  if (n >= lim) return { ok: false, why: lim ? `Limite raggiunto (${n}/${lim}): potenzia il QG per costruirne altri` : 'Potenzia il QG per costruirlo', limit: true };
  const c = B.cost(1);
  if (!afford(state, c)) return { ok: false, why: 'Risorse insufficienti', poor: true, cost: c };
  return { ok: true, cost: c, n, lim };
}
export function canUpgrade(state, b, prog) {
  const B = BUILDINGS[b.t], next = b.l + 1;
  if (next > B.max) return { ok: false, why: 'Livello massimo', max: true };
  if (b.t === 'hq' && !hqUnlocked(next, prog)) return { ok: false, why: `QG livello ${next}: completa il livello ${HQ_REQ(next)} della campagna`, locked: true };
  if (b.t !== 'hq' && next > maxLevelAt(b.t, hqLevel(state.layout))) return { ok: false, why: `Serve il QG al livello ${b.t === 'muro' ? next - 1 : next}`, hq: true };
  const c = B.cost(next);
  if (!afford(state, c)) return { ok: false, why: 'Risorse insufficienti', poor: true, cost: c };
  return { ok: true, cost: c };
}
const HQ_REQ = (l) => HQ_UNLOCK[l];

export const afford = (state, c) => state.bricks >= (c.bricks || 0) && wallet.get(state) >= (c.coins || 0);
function pay(state, c) { state.bricks -= c.bricks || 0; wallet.add(state, -(c.coins || 0)); }

// Coins live in the Orda wallet shared with the campaign. The screen plugs the real wallet in with
// setWallet(); by default (tests) coins are kept on the base state itself.
const wallet = { get: (s) => s.coins || 0, add: (s, n) => { s.coins = (s.coins || 0) + n; } };
export function setWallet(get, add) { wallet.get = get; wallet.add = add; }
export const coinsOf = (s) => wallet.get(s);
export const addCoins = (s, n) => wallet.add(s, n);

// ---- mutations (return the building / null). They mutate `state` in place.
export function build(state, t, x, y, prog, now = Date.now()) {
  const c = canBuild(state, t, prog); if (!c.ok || !fits(state.layout, t, x, y)) return null;
  pay(state, c.cost);
  const b = { id: ++state.layout.nid, t, x, y, l: 1 };
  if (BUILDINGS[t].kind === 'prod') b.since = now;
  state.layout.b.push(b);
  return b;
}
export function upgrade(state, id, prog, now = Date.now()) {
  const b = state.layout.b.find((q) => q.id === id); if (!b) return null;
  const c = canUpgrade(state, b, prog); if (!c.ok) return null;
  // production banked at the old rate before the rate changes
  if (BUILDINGS[b.t].kind === 'prod') collect(state, b.id, now);
  pay(state, c.cost); b.l++;
  return b;
}
export function move(state, id, x, y) {
  const b = state.layout.b.find((q) => q.id === id); if (!b || !fits(state.layout, b.t, x, y, id)) return null;
  b.x = x; b.y = y; return b;
}
// selling a wall / building gives back half the bricks (never the HQ)
export function demolish(state, id) {
  const i = state.layout.b.findIndex((q) => q.id === id); if (i < 0 || state.layout.b[i].t === 'hq') return null;
  const b = state.layout.b[i], refund = Math.floor(investBricks(b.t, b.l) / 2);
  state.layout.b.splice(i, 1); state.bricks += refund;
  return refund;
}
function investBricks(t, l) { let v = 0; for (let i = 1; i <= l; i++) v += BUILDINGS[t].cost(i).bricks; return v; }

// ---- production: stored = rate × hours since `since`, capped at rate × capH. `since` moves forward
// when collected, so the cap is what limits offline accrual.
export function stored(b, now = Date.now()) {
  const B = BUILDINGS[b.t]; if (B.kind !== 'prod') return 0;
  const h = Math.max(0, (now - (b.since ?? now)) / HOUR);
  return Math.floor(Math.min(h, B.capH(b.l)) * B.rate(b.l));
}
export const isFull = (b, now = Date.now()) => BUILDINGS[b.t].kind === 'prod' && stored(b, now) >= BUILDINGS[b.t].rate(b.l) * BUILDINGS[b.t].capH(b.l);
export function collect(state, id, now = Date.now()) {
  const b = state.layout.b.find((q) => q.id === id); if (!b || BUILDINGS[b.t].kind !== 'prod') return 0;
  const n = stored(b, now), B = BUILDINGS[b.t];
  // keep the fractional remainder: since moves by exactly the time the collected amount took
  const full = (now - (b.since ?? now)) / HOUR >= B.capH(b.l);
  b.since = full ? now : (b.since ?? now) + (n / B.rate(b.l)) * HOUR;
  if (B.res === 'coins') addCoins(state, n); else state.bricks += n;
  state.stats.produced[B.res] = (state.stats.produced[B.res] || 0) + n;
  return { res: B.res, n };
}
export function collectAll(state, now = Date.now()) {
  const got = { coins: 0, bricks: 0 };
  for (const b of state.layout.b) if (BUILDINGS[b.t].kind === 'prod') { const r = collect(state, b.id, now); if (r) got[r.res] += r.n; }
  return got;
}
export function pending(state, now = Date.now()) {
  const p = { coins: 0, bricks: 0 };
  for (const b of state.layout.b) { const B = BUILDINGS[b.t]; if (B.kind === 'prod') p[B.res] += stored(b, now); }
  return p;
}
export function ratePerHour(state) {
  const p = { coins: 0, bricks: 0 };
  for (const b of state.layout.b) { const B = BUILDINGS[b.t]; if (B.kind === 'prod') p[B.res] += B.rate(b.l); }
  return p;
}

// ---- raid tickets: regenerate one every RAID_REGEN_H up to RAID_TOKENS
export function tokens(state, now = Date.now()) {
  const r = state.raids;
  if (r.tokens >= RAID_TOKENS) { r.tokenAt = now; return { n: RAID_TOKENS, next: 0 }; }
  const per = RAID_REGEN_H * HOUR, gained = Math.floor((now - r.tokenAt) / per);
  if (gained > 0) { r.tokens = Math.min(RAID_TOKENS, r.tokens + gained); r.tokenAt = r.tokens >= RAID_TOKENS ? now : r.tokenAt + gained * per; }
  return { n: r.tokens, next: r.tokens >= RAID_TOKENS ? 0 : r.tokenAt + per - now };
}
export function spendToken(state, now = Date.now()) {
  const t = tokens(state, now); if (t.n <= 0) return false;
  if (state.raids.tokens >= RAID_TOKENS) state.raids.tokenAt = now;
  state.raids.tokens--; return true;
}

// ---- base strength: a single number for matchmaking and the UI
export function baseValue(layout) { return layout.b.reduce((a, b) => a + investOf(b.t, b.l), 0); }
export function power(layout) {
  let p = 0;
  for (const b of layout.b) { const k = BUILDINGS[b.t].kind; p += (k === 'tower' ? 3 : k === 'spawner' ? 2.5 : k === 'trap' ? 2.5 : k === 'wall' ? 0.6 : k === 'core' ? 4 : 1) * b.l; }
  return Math.round(p * 10);
}

// ---- the default starter base: HQ in the back, a forge, a mine and a few walls
export function starterLayout() {
  const c = Math.floor(GRID / 2) - 1;
  const b = [
    { id: 1, t: 'hq', x: c, y: GRID - 3, l: 1 },
    { id: 2, t: 'fornace', x: 1, y: GRID - 2, l: 1 },
    { id: 3, t: 'muro', x: c - 1, y: GRID - 5, l: 1 }, { id: 4, t: 'muro', x: c, y: GRID - 5, l: 1 }, { id: 5, t: 'muro', x: c + 1, y: GRID - 5, l: 1 }, { id: 6, t: 'muro', x: c + 2, y: GRID - 5, l: 1 },
  ];
  return { b, nid: 6 };
}
