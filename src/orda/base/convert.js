// Orda · Razzie — turns a base layout (a rival's, or the attacker's in a «Vendetta») into a plain
// Orda level JSON for OrdaGame (mode 'raid'), and an OrdaGame result back into a destruction % and
// loot. Pure functions: no DOM, no three.js.
//
// Mapping (see src/orda/levels.js for the level shape):
//   the front half of the arena  → procedural positive gates (×/+) so the horde can grow
//   grid rows 0..8               → y from 52% of the lane to just before the base
//   grid columns 0..8            → x across the 16 m arena
//   muro (runs of walls)         → obstacles 'wall'
//   porta (trap gate)            → gates 'div' (+ a 'sub' gate right behind for the levels with −n)
//   gelo / mortaio / cecchino    → base.towers (hp, rate, count; `kind`/`range`/`slow` are hints)
//   caserma                      → base.spawners (counter-attacks) + waves
//   hq                           → base.hp (on the campaign's HP curve for the equivalent level)
//   scudo                        → base.phases with a shield
import { GRID, BUILDINGS, REVENGE_BONUS } from './data.js';
import { rng, hash } from './logic.js';

const W = 16, COLW = 1.65;
export let HP_K = 1.1; // raid bases are sturdier than campaign levels of the same rank (walls and traps are gentler than pits and saws)
export const setHpK = (k) => { HP_K = k; };
export const colX = (c) => +((c + 0.5 - GRID / 2) * COLW).toFixed(2);
// campaign level the rival matches (1..30) and the campaign's base HP curve for non-boss levels
export const eqLevel = (diff) => Math.max(1, Math.min(30, Math.round(diff * 2.8)));
export const hpCurve = (n) => Math.round((30 + 38 * n + 1.6 * n * n) / 10) * 10;
const WORLD_OF = (n) => Math.min(5, Math.floor((n - 1) / 5));

export function layoutToLevel(rival, opts = {}) {
  const L = rival.layout, n = eqLevel(rival.diff), R = rng(hash('lvl', rival.seed, n));
  const len = Math.round(62 + Math.min(12, n * 0.45));
  const y0 = Math.round(len * 0.52), y1 = len - 5;
  const rowY = (r) => +(y0 + (r / (GRID - 1)) * (y1 - y0)).toFixed(1);
  const gates = [], obstacles = [], towers = [], spawners = [], phases = [];

  // positive gates in the approach: 2-3 rows, each a choice with a catch (a moving gate, a gate that
  // flips sign, a good gate beside a bad one). Kept leaner than the campaign: the base's own traps follow.
  const rows = n < 10 ? 2 : 3, span = y0 - 18;
  for (let i = 0; i < rows; i++) {
    const y = Math.round(14 + (i / Math.max(1, rows - 1)) * span);
    const s = R() < 0.5 ? -1 : 1, kind = R();
    if (kind < 0.35) gates.push({ x: 4 * s, y, w: 4.6, type: 'mul', value: 2 }, { x: -4 * s, y, w: 4.6, type: 'add', value: 2 + Math.floor(R() * (2 + n / 8)) });
    else if (kind < 0.6) gates.push({ x: 0, y, w: 4.2, type: 'mul', value: 2, move: { amp: +(3.5 + R() * 1.5).toFixed(1), speed: +(0.2 + R() * 0.12).toFixed(2) } });
    else if (kind < 0.8) gates.push({ x: 4 * s, y, w: 4.6, type: 'mul', value: 3, toggle: { every: +(2.6 + R()).toFixed(1), type: 'div', value: 2 } }, { x: -4 * s, y, w: 4.6, type: 'add', value: 3 });
    else gates.push({ x: 4 * s, y, w: 4.6, type: 'mul', value: 2 }, { x: -4 * s, y, w: 4.6, type: 'sub', value: 8 + n });
  }

  // walls: merge horizontal runs of wall cells into single blocks
  const wallAt = new Set(L.b.filter((b) => b.t === 'muro').map((b) => `${b.x},${b.y}`));
  const lvlAt = new Map(L.b.filter((b) => b.t === 'muro').map((b) => [`${b.x},${b.y}`, b.l]));
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      if (!wallAt.has(`${x},${y}`)) { x++; continue; }
      let e = x, lv = 0; while (e < GRID && wallAt.has(`${e},${y}`)) { lv = Math.max(lv, lvlAt.get(`${e},${y}`)); e++; }
      const run = e - x;
      obstacles.push({ type: 'wall', x: +((colX(x) + colX(e - 1)) / 2).toFixed(2), y: rowY(y), w: +(run * COLW - 0.15).toFixed(2), d: +(0.9 + lv * 0.08).toFixed(2), lvl: lv });
      x = e;
    }
  }

  // trap gates (÷) on their cell; the −n variants get a 'sub' gate right behind
  for (const b of L.b.filter((q) => q.t === 'porta')) {
    const g = BUILDINGS.porta.op(b.l), y = rowY(b.y);
    const gw = 2.8, gx = Math.max(-W / 2 + gw / 2, Math.min(W / 2 - gw / 2, colX(b.x)));
    gates.push({ x: gx, y, w: gw, type: 'div', value: g.v, trap: true });
    if (g.sub) gates.push({ x: gx, y: +(y + 1.6).toFixed(1), w: gw, type: 'sub', value: g.sub * 2, trap: true });
  }

  // towers: the base's red towers (hp, rate, count), with hints for renderers that know the type
  const towerHp = (l) => Math.round(20 + n * 4.5 + l * 10);
  for (const b of L.b) {
    const y = Math.min(len - 1.5, rowY(b.y)), x = colX(b.x), l = b.l;
    if (b.t === 'gelo') towers.push({ x, y, hp: towerHp(l), rate: +(0.3 + 0.04 * l).toFixed(2), count: 2, kind: 'slow', range: +(BUILDINGS.gelo.range(l) * COLW).toFixed(1), slow: +BUILDINGS.gelo.slow(l).toFixed(2), lvl: l });
    else if (b.t === 'mortaio') towers.push({ x, y, hp: towerHp(l) + 10, rate: +(0.22 + 0.03 * l).toFixed(2), count: 3 + Math.floor(l / 2), kind: 'splash', range: +(BUILDINGS.mortaio.range(l) * COLW).toFixed(1), lvl: l });
    else if (b.t === 'cecchino') towers.push({ x, y, hp: towerHp(l) - 5, rate: +(0.55 + 0.08 * l).toFixed(2), count: 1, kind: 'sniper', range: +(BUILDINGS.cecchino.range(l) * COLW).toFixed(1), lvl: l });
    else if (b.t === 'caserma') spawners.push({ x, rate: +(0.25 + 0.1 * l).toFixed(2), count: 1 + Math.floor(l / 2), spread: 1.4 });
  }
  // the base itself always defends like a campaign base of the same rank; barracks add on top
  const core = +(0.45 + n * 0.032).toFixed(2), cc = n >= 12 ? 2 : 1;
  spawners.unshift({ x: -3, rate: core, count: cc }, { x: 3, rate: core, count: cc });

  // HQ + shield
  const hq = L.b.find((b) => b.t === 'hq');
  const shield = L.b.filter((b) => b.t === 'scudo').reduce((a, b) => Math.max(a, b.l), 0);
  const hqL = hq?.l || 1;
  const hp = Math.round(hpCurve(n) * HP_K * (0.9 + hqL * 0.04) * (1 + (shield ? BUILDINGS.scudo.hqBoost(shield) : 0)) / 10) * 10;
  if (n >= 8) phases.push({ at: 0.5, wave: 8 + n });
  if (shield) phases.push({ at: 0.75, shield: +(1.5 + shield * 0.5).toFixed(1) });
  if (n >= 16) phases.push({ at: 0.25, wave: 12 + n, brute: 1 + (n >= 24 ? 1 : 0), rate: 1.15 });
  phases.sort((a, b) => b.at - a.at);

  const time = 110 + Math.min(40, n * 1.5);
  return {
    id: n, name: rival.name, world: opts.world ?? WORLD_OF(n), len, w: W, time: Math.round(time),
    tip: opts.revenge ? `Vendetta su ${rival.leader}: bottino ×${REVENGE_BONUS}!` : `Razzia: più distruggi, più bottino porti a casa.`,
    stars: { par: Math.round(time * 0.5), crowd: Math.round(10 + n * 1.6) },
    charge: Math.round(24 + n * 2.2),
    cannon: { hp: 25 + Math.round(n * 0.6) },
    gates: gates.slice(0, 32), obstacles,
    base: {
      hp, w: hqL >= 4 ? 11 : 10, name: rival.name, raid: true,
      spawners, waves: { every: Math.max(8, 13 - Math.floor(n / 6)), count: 6 + Math.round(n * 0.45) }, towers, ...(phases.length ? { phases } : {}),
    },
    raid: { seed: rival.seed, diff: rival.diff, leader: rival.leader, color: rival.color, revenge: !!opts.revenge, loot: rival.loot },
  };
}

// result (OrdaGame onEnd) → share of the base destroyed (0..1). The base HP counts 80%, the towers 20%.
export function destroyedPct(result, level) {
  if (!result) return 0;
  if (result.win) return 1;
  const max = result.baseMax || level?.base?.hp || 1;
  const hpFrac = result.baseHp != null ? Math.max(0, Math.min(1, 1 - result.baseHp / max)) : result.baseDmg != null ? Math.min(1, result.baseDmg / max) : 0;
  const nt = level?.base?.towers?.length || 0;
  const tw = nt ? Math.min(1, (result.towers || 0) / nt) : hpFrac;
  return Math.max(0, Math.min(1, hpFrac * 0.8 + tw * 0.2));
}
// loot = storage × destroyed% (+ a bonus for a full win), ×1.5 on a Vendetta
export function raidLoot(rival, pct, opts = {}) {
  const k = (opts.revenge ? REVENGE_BONUS : 1) * (pct >= 1 ? 1.2 : pct);
  return { coins: Math.round(rival.loot.coins * k), bricks: Math.round(rival.loot.bricks * k) };
}
// stars: a won raid keeps the game's own stars (win · time · crowd left); a lost one gets none
export const raidStars = (result) => (result?.win ? Math.max(1, Math.min(3, result.stars || 1)) : 0);
