// Orda · Difesa — attacks on the player's base while they are away. Fully deterministic: the world
// is cut in ATTACK_SLOT_H slots, each slot has a fixed chance (from the player's seed) of an attack at
// a fixed minute; the outcome comes from simulateAttack() on the player's current layout. On return the
// game runs the slots that elapsed, writes reports, applies (bounded) losses and a shield, and offers
// a «Vendetta» raid on the attacker's base.
import { HOUR, BUILDINGS, ATTACK_SLOT_H, ATTACK_CHANCE, ATTACK_MAX_PER_RETURN, ATTACK_MIN_AWAY_H, SHIELD_BASE_H, SHIELD_HEAVY_H, NEWBIE_CAMPAIGN, LOSS_MAX, BANK_LOSS_MAX, REVENGE_TTL_H } from './data.js';
import { rng, hash, hqLevel, stored } from './logic.js';
import { simulateAttack, defenceRating } from './sim.js';
import { genRival, playerDiff } from './rivals.js';

export const shieldHoursOf = (layout) => layout.b.filter((b) => b.t === 'scudo').reduce((a, b) => Math.max(a, BUILDINGS.scudo.shieldH(b.l)), 0);
export const protectOf = (layout) => layout.b.filter((b) => b.t === 'scudo').reduce((a, b) => Math.max(a, BUILDINGS.scudo.protect(b.l)), 0);

// The horde an attacker of difficulty d brings: half from the attacker's strength, half from how strong
// the defence is (its rating), so investing in defences pays off without making attacks pointless.
// A typical base of difficulty d holds about 120·d figures.
export const attackFigures = (d, r, rating = 120 * d) => Math.round((0.5 * rating + 0.5 * 120 * d) * (0.7 + r * 0.6));

// Attacks scheduled in (from, to]: [{ at, slot }]
export function scheduled(seed, from, to) {
  const out = [], per = ATTACK_SLOT_H * HOUR;
  for (let s = Math.floor(from / per); s * per <= to; s++) {
    const R = rng(hash('atk', seed, s));
    if (R() >= ATTACK_CHANCE) continue;
    const at = Math.floor(s * per + (0.1 + R() * 0.8) * per);
    if (at > from && at <= to) out.push({ at, slot: s });
  }
  return out;
}

// Runs the attacks since the player was last seen. Mutates state; returns the new reports.
export function checkAttacks(state, prog, now = Date.now()) {
  const D = state.defense;
  const last = D.lastSeen || 0;
  D.lastSeen = now;
  if (!last || now - last < ATTACK_MIN_AWAY_H * HOUR) return [];
  if ((prog?.lvl || 0) < NEWBIE_CAMPAIGN) return [];
  // the first hour after leaving is always quiet
  const from = Math.max(last + ATTACK_MIN_AWAY_H * HOUR, D.checkedUntil || 0);
  D.checkedUntil = now;
  let list = scheduled(state.seed, from, now);
  // at most N per return: the most recent ones (older ones are «lost in the fog»)
  if (list.length > ATTACK_MAX_PER_RETURN) list = list.slice(-ATTACK_MAX_PER_RETURN);
  const out = [];
  let rating = null;
  for (const a of list) {
    if (a.at < (D.shieldUntil || 0)) continue;
    rating ??= defenceRating(state.layout);
    out.push(resolveAttack(state, prog, a, rating));
  }
  return out;
}
export function resolveAttack(state, prog, a, rating = defenceRating(state.layout)) {
  const D = state.defense, L = state.layout;
  const R = rng(hash('atkr', state.seed, a.slot));
  const hq = hqLevel(L);
  const diff = Math.max(1, Math.min(10, playerDiff(prog, hq) + (R() - 0.45) * 2.2));
  const rseed = (hash('atkb', state.seed, a.slot) % 1e9) + 1;
  const rv = genRival(rseed, diff);
  const figures = attackFigures(diff, R(), rating);
  const sim = simulateAttack(L, { figures, seed: hash('sim', state.seed, a.slot) });
  // losses: part of what the forge and the mine had in storage at that moment, and a little of the
  // bricks in the bank. Never coins from the wallet, never buildings (they are rebuilt for free).
  const prot = protectOf(L);
  const frac = LOSS_MAX * sim.pct * (1 - prot);
  const lost = { coins: 0, bricks: 0 };
  for (const b of L.b) {
    const B = BUILDINGS[b.t]; if (B.kind !== 'prod') continue;
    const n = Math.floor(stored(b, a.at) * frac); if (n <= 0) continue;
    lost[B.res] += n;
    b.since = (b.since ?? a.at) + (n / B.rate(b.l)) * HOUR; // the stolen part is gone from the storage
  }
  const bank = Math.min(20 + 15 * hq, Math.floor(state.bricks * BANK_LOSS_MAX * sim.pct * (1 - prot)));
  state.bricks -= bank; lost.bricks += bank;
  // a held defence pays a little
  const bonus = sim.stars === 0 ? 20 + 12 * hq : 0;
  state.bricks += bonus;
  const shieldH = (sim.stars === 0 ? 2 : SHIELD_BASE_H + (sim.pct > 0.5 ? SHIELD_HEAVY_H : 0)) + shieldHoursOf(L);
  D.shieldUntil = Math.max(D.shieldUntil || 0, a.at + shieldH * HOUR);
  const byType = {};
  for (const id of sim.destroyed) { const b = L.b.find((q) => q.id === id); if (b) byType[b.t] = (byType[b.t] || 0) + 1; }
  const rep = {
    id: `${a.slot}`, at: a.at, seen: false,
    attacker: { seed: rseed, diff: rv.diff, name: rv.name, leader: rv.leader, color: rv.color },
    figures, pct: +sim.pct.toFixed(3), stars: sim.stars, hqDown: sim.hqDown, destroyed: byType,
    killed: { towers: sim.killedByTowers, red: sim.killedByRed, gates: sim.divided },
    lost, bonus, shieldH, shieldUntil: a.at + shieldH * HOUR,
    revenge: { until: a.at + REVENGE_TTL_H * HOUR, done: false },
  };
  D.reports.unshift(rep);
  D.reports = D.reports.slice(0, 12);
  state.stats.attacked = (state.stats.attacked || 0) + 1;
  if (sim.stars === 0) state.stats.defended = (state.stats.defended || 0) + 1;
  return rep;
}

export const shielded = (state, now = Date.now()) => Math.max(0, (state.defense.shieldUntil || 0) - now);
