// Bastione — headless, deterministic tower-defense simulation (no DOM, no three.js).
//   const s = new Sim(level, { diff, tree, hero, heroLvl, spells, seed, mode, aid, aidBoss })
//   aid / aidBoss: the campaign catch-up (extra starting gold, boss hp factor; see catchUp in data.js)
//   s.step(dt) advances by dt (call with a fixed step: 1/60 live, 1/30 in tools)
//   commands: build(slot, type) upgrade(slot) specialize(slot, 0|1) sell(slot) setMode(slot, mode)
//             callWave() moveHero(x, z) ability(i) cast(spell, x, z)  → true when done
//   state: 'ready' (before the first wave) | 'play' | 'won' | 'lost'
//   read by the renderer: enemies, soldiers, hero, projs, fields, towers, slots, ev (events, drained by
//   the caller), gold, lives, wave, waveT (countdown to the next wave), spells
import { TOWERS, towerById, ENEMIES, heroById, SPELLS, treeEffects, investCost, SELL_BACK, LIVES, starsFor, diffById } from './data.js';
import { buildLevel, waveHp, endlessWave, rng, samplePath } from './levels.js';

const WAVE_GAP = 16;          // seconds between the end of a wave's spawning and the next wave
const FIRST_WAIT = 1e9;       // the first wave waits for the player
const MODES = ['first', 'strong', 'last', 'near'];
export const TARGET_MODES = { first: 'Il primo', strong: 'Il più forte', last: 'L’ultimo', near: 'Il più vicino' };

class Path {
  constructor(pts) {
    this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.samples = samplePath(pts, 0.5);
  }
  // position + unit direction at distance d
  at(d, o) {
    const P = this.pts, C = this.cum;
    d = Math.max(0, Math.min(this.len, d));
    let i = 1; while (i < C.length - 1 && C[i] < d) i++;
    const a = P[i - 1], b = P[i], L = C[i] - C[i - 1] || 1, t = (d - C[i - 1]) / L;
    o.x = a[0] + (b[0] - a[0]) * t; o.z = a[1] + (b[1] - a[1]) * t; o.dx = (b[0] - a[0]) / L; o.dz = (b[1] - a[1]) / L;
    return o;
  }
}
const TMP = { x: 0, z: 0, dx: 0, dz: 0 };
const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

export class Sim {
  constructor(level, opts = {}) {
    const L = this.L = buildLevel(level);
    this.o = opts;
    this.R = rng(opts.seed ?? 12345);
    this.diff = diffById(opts.diff || 'normale');
    this.fx = treeEffects(opts.tree || {});
    this.rule = L.rule || {};
    this.endless = !!L.endless;
    this.paths = L.paths.map((p) => new Path(p));
    this.slots = L.slotsXY.map(([x, z], i) => ({ i, x, z, tower: null }));
    this.keep = { x: L.keep[0], z: L.keep[1] };
    this.gold = Math.round((L.gold + this.fx.gold0) * (this.rule.gold ? 1 : 1)) + Math.max(0, Math.round(opts.aid || 0));
    this.maxLives = opts.lives || LIVES; this.lives = this.maxLives;
    this.state = 'ready'; this.t = 0; this.wave = 0; this.waveT = FIRST_WAIT; this.waveTotal = this.endless ? Infinity : L.waveList.length;
    this.spawnQ = []; this.enemies = []; this.soldiers = []; this.projs = []; this.fields = []; this.ev = []; this.towers = [];
    this.nid = 1; this.stats = { kills: 0, leaks: 0, gold: 0, built: 0, spent: 0, dmg: 0, earlyGold: 0, peak: 0, spells: 0, abilities: 0 };
    // hero
    this.hero = null;
    if (!this.rule.noHero && opts.hero !== null) {
      const H = heroById(opts.hero || 'capitano'), k = 1 + 0.12 * (opts.heroLvl || 0);
      const home = this.heroHome();
      this.hero = { def: H, id: 'hero', x: home.x, z: home.z, tx: null, tz: null, hp: H.hp * k, max: H.hp * k, dmg: H.dmg * k, dead: false, respawn: 0, atkT: 0, target: null, blocking: [], cd: [0, 0], face: 0, moving: false, atkAnim: 0, armor: H.armor };
    }
    // spells
    const owned = opts.spells || ['meteore', 'rinforzi'];
    this.spells = SPELLS.filter((s) => owned.includes(s.id)).map((s) => ({ def: s, cd: 0, max: s.cd * (s.id === 'meteore' ? this.fx.meteorCd : 1) }));
    this.buffT = 0;
  }
  // a sensible default spot for the hero: on the road, ~65% of the way, near the most build spots
  heroHome() {
    const p = this.paths[0], o = { x: 0, z: 0, dx: 0, dz: 0 };
    let best = null, bs = -1;
    for (let f = 0.45; f <= 0.8; f += 0.05) { p.at(p.len * f, o); let s = 0; for (const sl of this.slots) if (d2(sl.x, sl.z, o.x, o.z) < 42) s++; if (s > bs) { bs = s; best = { x: o.x, z: o.z }; } }
    return best || { x: 0, z: 0 };
  }
  emit(e) { this.ev.push(e); }

  // ───────── commands
  towerCost(def, tier, spec = -1) {
    const c = spec >= 0 ? def.spec[spec].cost : def.tiers[tier].cost;
    return tier === 0 && spec < 0 ? Math.round(c * this.fx.discount) : c;
  }
  canBuild(type) { return !this.rule.only || this.rule.only.includes(type); }
  build(si, type) {
    const s = this.slots[si], def = towerById(type);
    if (!s || s.tower || !def || !this.canBuild(type) || this.over()) return false;
    const c = this.towerCost(def, 0); if (this.gold < c) return false;
    this.gold -= c; this.stats.spent += c; this.stats.built++;
    const t = { id: this.nid++, slot: si, x: s.x, z: s.z, def, tier: 0, spec: -1, cd: 0.3, mode: def.target || 'first', invest: c, kills: 0, dmg: 0, men: [], mineT: 0, aim: 0, fireT: 0, buff: 1 };
    s.tower = t; this.towers.push(t);
    if (def.barracks) this.rally(t);
    this.refreshBuffs();
    this.emit({ k: 'build', t });
    return true;
  }
  upgrade(si) {
    const t = this.slots[si]?.tower; if (!t || this.over()) return false;
    if (t.tier < 2) { const c = this.towerCost(t.def, t.tier + 1); if (this.gold < c) return false; this.gold -= c; t.invest += c; this.stats.spent += c; t.tier++; }
    else return false;
    if (t.def.barracks) this.reman(t);
    this.refreshBuffs();
    this.emit({ k: 'upgrade', t });
    return true;
  }
  specialize(si, k) {
    const t = this.slots[si]?.tower; if (!t || t.tier < 2 || t.spec >= 0 || this.over()) return false;
    const c = t.def.spec[k].cost; if (this.gold < c) return false;
    this.gold -= c; t.invest += c; this.stats.spent += c; t.spec = k;
    if (t.def.barracks) this.reman(t);
    this.refreshBuffs();
    this.emit({ k: 'upgrade', t, spec: true });
    return true;
  }
  sell(si) {
    const s = this.slots[si], t = s?.tower; if (!t || this.over()) return false;
    const back = Math.round(t.invest * SELL_BACK);
    this.gold += back; s.tower = null; this.towers.splice(this.towers.indexOf(t), 1);
    for (const m of t.men) { this.dropSoldier(m); }
    this.soldiers = this.soldiers.filter((m) => m.tower !== t);
    this.refreshBuffs();
    this.emit({ k: 'sell', t, gold: back });
    return true;
  }
  setMode(si, mode) { const t = this.slots[si]?.tower; if (!t || !MODES.includes(mode)) return false; t.mode = mode; return true; }
  nextUpgradeCost(t) { if (!t) return null; if (t.tier < 2) return this.towerCost(t.def, t.tier + 1); if (t.spec < 0) return Math.min(t.def.spec[0].cost, t.def.spec[1].cost); return null; }
  // the next wave now; early calls pay a bonus for the seconds skipped
  callWave() {
    if (this.over() || this.wave >= this.waveTotal) return false;
    if (this.state === 'play' && this.waveT > WAVE_GAP + 0.01) return false; // still spawning the current one
    let bonus = 0;
    if (this.state === 'play' && this.waveT > 0.5) { bonus = Math.round(this.waveT * 1.5); this.gold += bonus; this.stats.earlyGold += bonus; }
    this.state = 'play';
    this.startWave();
    if (bonus) this.emit({ k: 'early', gold: bonus });
    return true;
  }
  startWave() {
    const w = this.wave;
    let groups, hp;
    if (this.endless) ({ groups, hp } = endlessWave(this.L, w)); else { groups = this.L.waveList[w]; hp = waveHp(this.L, w); }
    let end = 0;
    for (const g of groups) {
      for (let i = 0; i < g.n; i++) this.spawnQ.push({ at: this.t + g.delay + i * g.gap, type: g.type, path: Math.min(g.path || 0, this.paths.length - 1), hp: g.boss ? (this.L.bossHp || 1) * (this.o.aidBoss || 1) : hp * (g.hpMul || 1) });
      end = Math.max(end, g.delay + g.n * g.gap);
    }
    this.spawnQ.sort((a, b) => a.at - b.at);
    this.wave++;
    this.waveT = end + WAVE_GAP;
    // interest of the banks
    for (const t of this.towers) { const st = this.stat(t); if (st.interest) { const g = Math.round(Math.min(this.gold, 2000) * st.interest); if (g > 0) { this.gold += g; this.stats.gold += g; this.emit({ k: 'gold', x: t.x, z: t.z, n: g }); } } }
    this.emit({ k: 'wave', i: this.wave, boss: groups.some((g) => ENEMIES[g.type].boss) });
  }
  moveHero(x, z) {
    const h = this.hero; if (!h || h.dead || this.over()) return false;
    h.tx = Math.max(-17.5, Math.min(17.5, x)); h.tz = Math.max(-11.5, Math.min(11.5, z));
    for (const e of h.blocking) if (e.blocker === h) e.blocker = null;
    h.blocking = []; h.target = null; h.moving = true;
    return true;
  }
  // hero ability i (0|1). Targeted abilities aim at the biggest group within reach of the hero.
  ability(i, x, z) {
    const h = this.hero; if (!h || h.dead || this.over() || h.cd[i] > 0) return false;
    const A = h.def.ab[i];
    let px = x, pz = z;
    if (px == null) { const c = this.cluster(h.x, h.z, 7, A.r, !!h.def.air || A.id === 'cometa' || A.id === 'pioggia'); if (!c) { if (['pioggia', 'rete', 'cometa', 'portale'].includes(A.id)) return false; px = h.x; pz = h.z; } else { px = c.x; pz = c.z; } }
    const near = (cx, cz, r, air = true) => this.enemies.filter((e) => e.hp > 0 && (air || !e.fly) && d2(e.x, e.z, cx, cz) < r * r);
    const k = 1 + 0.12 * (this.o.heroLvl || 0);
    switch (A.id) {
      case 'carica': for (const e of near(h.x, h.z, A.r, false)) { this.hurt(e, 80 * k, 'phys', null); e.stun = Math.max(e.stun, e.def.boss ? 0.6 : 2); } px = h.x; pz = h.z; break;
      case 'stendardo': this.buffT = 8; this.buffAt = { x: h.x, z: h.z, r: A.r }; px = h.x; pz = h.z; break;
      case 'pioggia': for (let j = 0; j < 10; j++) { const a = this.R() * 6.283, r = Math.sqrt(this.R()) * A.r; this.projs.push(this.proj('arrow', h.x, 1.2, h.z, null, px + Math.cos(a) * r, pz + Math.sin(a) * r, 0.5 + j * 0.06, { dmg: 45 * k, dtype: 'phys', splash: 0.7, air: true })); } break;
      case 'rete': for (const e of near(px, pz, A.r)) e.stun = Math.max(e.stun, e.def.boss ? 1 : 3); break;
      case 'cometa': this.projs.push(this.proj('comet', px - 4, 14, pz - 6, null, px, pz, 0.9, { dmg: 260 * k, dtype: 'magic', splash: A.r, air: true })); break;
      case 'portale': for (const e of near(px, pz, A.r)) if (!e.def.boss) { e.d = Math.max(0, e.d - 8); if (e.blocker) { this.unblock(e); } this.emit({ k: 'warp', x: e.x, z: e.z }); } break;
      case 'terremoto': for (const e of near(h.x, h.z, A.r, false)) { this.hurt(e, 120 * k, 'phys', null); e.slowF = Math.max(e.slowF, 0.5); e.slowT = Math.max(e.slowT, 3); } px = h.x; pz = h.z; break;
      case 'ruggito': for (const e of near(h.x, h.z, A.r, false)) if (!e.def.boss) { e.back = 2.5; this.unblock(e); } px = h.x; pz = h.z; break;
    }
    h.cd[i] = A.cd * this.fx.heroCd;
    this.stats.abilities++;
    this.emit({ k: 'ability', id: A.id, x: px, z: pz, r: A.r });
    return true;
  }
  cast(id, x, z) {
    const s = this.spells.find((q) => q.def.id === id); if (!s || s.cd > 0 || this.over() || this.state === 'ready') return false;
    x = Math.max(-18, Math.min(18, x)); z = Math.max(-12, Math.min(12, z));
    if (id === 'meteore') for (let j = 0; j < 3; j++) { const a = this.R() * 6.283, r = Math.sqrt(this.R()) * s.def.r * 0.8; this.projs.push(this.proj('meteor', x - 6 + j * 2, 16, z - 8, null, x + Math.cos(a) * r, z + Math.sin(a) * r, 0.7 + j * 0.3, { dmg: 110 * this.fx.meteor, dtype: 'true', splash: 1.7, fire: { dps: 15, t: 2.5, r: 1.4 } })); }
    else if (id === 'rinforzi') { const k = this.fx.militia; for (let j = 0; j < 2; j++) { const m = this.soldier(null, x + (j ? 0.6 : -0.6), z, { hp: 120 * k, dmg: 9 * k, rate: 1, armor: 0.2 }); m.life = 20; m.home = { x: x + (j ? 0.6 : -0.6), z }; } }
    else if (id === 'glaciazione') { for (const e of this.enemies) if (e.hp > 0 && d2(e.x, e.z, x, z) < s.def.r * s.def.r) e.freeze = Math.max(e.freeze, e.def.boss ? 1.5 : 3); }
    s.cd = s.max; this.stats.spells++;
    this.emit({ k: 'spell', id, x, z, r: s.def.r });
    return true;
  }
  over() { return this.state === 'won' || this.state === 'lost'; }

  // ───────── tower stats (tiers + tree + buffs)
  stat(t) {
    const base = t.spec >= 0 ? t.def.spec[t.spec] : t.def.tiers[t.tier];
    const id = t.def.id, fx = this.fx;
    const s = { ...base };
    if (s.dmg != null && !t.def.barracks) s.dmg *= (fx.dmg[id] || 1) * t.buff;
    if (s.range != null && !t.def.barracks) s.range *= fx.range[id] || 1;
    if (s.splash) s.splash *= id === 'cannone' || id === 'mortaio' ? fx.splash : 1;
    if (s.slow) s.slow = { f: s.slow.f, t: s.slow.t * fx.dur };
    if (s.poison) s.poison = { dps: s.poison.dps * (fx.dmg[id] || 1) * t.buff, t: s.poison.t * fx.dur };
    if (this.buffT > 0 && this.buffAt && s.rate && d2(t.x, t.z, this.buffAt.x, this.buffAt.z) < this.buffAt.r ** 2) s.rate *= 1.4;
    if (t.def.barracks) { s.hp *= fx.men; s.dmg *= fx.men * t.buff; }
    return s;
  }
  refreshBuffs() {
    const banks = this.towers.filter((t) => t.def.mine && t.spec === 1);
    for (const t of this.towers) { t.buff = 1; for (const b of banks) if (b !== t && d2(b.x, b.z, t.x, t.z) < 36) t.buff = 1.2; }
  }
  // barracks: the rally point is the closest bit of road
  rally(t) {
    let best = null, bd = 1e9;
    for (const p of this.paths) for (const s of p.samples) { const d = d2(s.x, s.z, t.x, t.z); if (d < bd) { bd = d; best = s; } }
    t.rally = best ? { x: best.x, z: best.z } : { x: t.x, z: t.z };
    this.reman(t);
  }
  reman(t) {
    const st = this.stat(t);
    const offs = [[0, 0], [0.75, 0.45], [-0.75, 0.45], [0, -0.8]];
    for (let i = 0; i < st.men; i++) {
      let m = t.men[i];
      const home = { x: t.rally.x + offs[i][0], z: t.rally.z + offs[i][1] };
      if (!m) { m = this.soldier(t, t.x, t.z, st); t.men.push(m); }
      m.home = home; const frac = m.hp / m.max; m.max = st.hp; m.hp = Math.max(1, frac * st.hp); m.dmg = st.dmg; m.rate = st.rate; m.armor = st.armor; m.regen = st.regen || 0; m.shoot = st.shoot || null; m.rank = t.spec >= 0 ? 3 + t.spec : t.tier;
    }
  }
  soldier(t, x, z, st) {
    const m = { id: this.nid++, tower: t, x, z, home: { x, z }, hp: st.hp, max: st.hp, dmg: st.dmg, rate: st.rate || 1, armor: st.armor || 0, regen: st.regen || 0, shoot: st.shoot || null, target: null, atkT: 0, dead: false, respawn: 0, life: 0, face: 0, moving: false, rank: 0, atkAnim: 0 };
    this.soldiers.push(m); return m;
  }
  dropSoldier(m) { if (m.target && m.target.blocker === m) m.target.blocker = null; m.target = null; }
  unblock(e) { const b = e.blocker; if (!b) return; e.blocker = null; if (b.target === e) b.target = null; if (b.blocking) b.blocking = b.blocking.filter((x) => x !== e); }

  // ───────── enemies
  spawn(q) {
    const E = ENEMIES[q.type], P = this.paths[q.path];
    const hp = E.hp * q.hp * this.diff.hp;
    const e = { id: this.nid++, type: q.type, def: E, hp, max: hp, path: q.path, d: q.d || 0, off: q.off ?? (this.R() - 0.5) * 1.1, x: 0, z: 0, y: E.fly ? 2.2 : 0, fly: !!E.fly,
      speed: E.speed * (this.rule.speed || 1) * (0.94 + this.R() * 0.12), slowF: 0, slowT: 0, stun: 0, freeze: 0, back: 0, poison: null, burn: null, corrode: 0, corrodeT: 0,
      blocker: null, atkT: 0, healT: 0, stompT: E.stomp ? E.stomp.every * 0.6 : 0, summonT: E.summon ? E.summon.every : 0, face: 0, gold: E.gold, armor: Math.min(0.9, E.armor + (this.rule.armor || 0)) };
    P.at(e.d, TMP); e.x = TMP.x - TMP.dz * e.off; e.z = TMP.z + TMP.dx * e.off; e.face = Math.atan2(TMP.dx, TMP.dz);
    this.enemies.push(e);
    if (E.boss) this.emit({ k: 'boss', e });
    return e;
  }
  hurt(e, dmg, dtype, src, pierce = 0) {
    if (e.hp <= 0) return 0;
    const cor = e.corrodeT > 0 ? e.corrode : 0;
    let m = 1;
    if (dtype === 'phys') m = 1 - e.armor * (1 - pierce) * (1 - cor);
    else if (dtype === 'magic') m = 1 - e.def.mres * (1 - cor);
    const v = dmg * m;
    e.hp -= v; this.stats.dmg += v; if (src) src.dmg += v;
    if (e.hp <= 0) this.kill(e, src);
    return v;
  }
  kill(e, src) {
    e.hp = 0;
    const g = Math.round(e.gold * this.diff.gold);
    this.gold += g; this.stats.gold += g; this.stats.kills++; if (src) src.kills++;
    this.unblock(e);
    this.emit({ k: 'die', x: e.x, z: e.z, y: e.y, type: e.type, gold: g, boss: !!e.def.boss });
    if (e.def.split) for (let i = 0; i < e.def.split.n; i++) { const m = this.spawn({ type: e.def.split.type, path: e.path, hp: e.max / e.def.hp / this.diff.hp, d: Math.max(0, e.d - 0.4 * i), off: e.off + (i ? 0.4 : -0.4) }); m.stun = 0.3; }
    if (e.poison?.spread) for (const o of this.enemies) if (o !== e && o.hp > 0 && !o.fly && d2(o.x, o.z, e.x, e.z) < 3.2) o.poison = { ...e.poison, t: Math.max(o.poison?.t || 0, 3) };
  }
  // biggest group (by count) of enemies near (x, z) within reach; r = group radius
  cluster(x, z, reach, r, air = true) {
    let best = null, bn = 0;
    for (const e of this.enemies) {
      if (e.hp <= 0 || (!air && e.fly) || d2(e.x, e.z, x, z) > reach * reach) continue;
      let n = 0; for (const o of this.enemies) if (o.hp > 0 && (air || !o.fly) && d2(o.x, o.z, e.x, e.z) < r * r) n += o.def.boss ? 4 : 1;
      if (n > bn) { bn = n; best = e; }
    }
    return best ? { x: best.x, z: best.z, n: bn } : null;
  }

  // ───────── projectiles: homing (target) or lobbed at a point; land → damage
  proj(kind, x, y, z, target, tx, tz, T, p) {
    return { id: this.nid++, kind, x0: x, y0: y, z0: z, x, y, z, target, tx, tz, t: 0, T, ...p };
  }
  fire(t, st, e) {
    const kind = st.kind;
    t.aim = Math.atan2(e.x - t.x, e.z - t.z); t.fireT = 0.25;
    if (kind === 'zap') {
      const hit = [e], pts = [[t.x, 3.2, t.z], [e.x, e.y + 0.6, e.z]];
      let dmg = st.dmg, last = e;
      this.hurt(e, dmg, st.dtype, t); if (st.stun) e.stun = Math.max(e.stun, e.def.boss ? 0.15 : st.stun);
      for (let j = 1; j < st.chain.n; j++) {
        let nx = null, nd = st.chain.r * st.chain.r;
        for (const o of this.enemies) { if (o.hp <= 0 || hit.includes(o)) continue; const d = d2(o.x, o.z, last.x, last.z); if (d < nd) { nd = d; nx = o; } }
        if (!nx) break;
        dmg *= st.chain.fall; hit.push(nx); pts.push([nx.x, nx.y + 0.6, nx.z]); this.hurt(nx, dmg, st.dtype, t); if (st.stun) nx.stun = Math.max(nx.stun, nx.def.boss ? 0.15 : st.stun); last = nx;
      }
      this.emit({ k: 'zap', pts, t });
      return;
    }
    const h0 = t.def.id === 'mortaio' ? 2.6 : 3.1;
    const dist = Math.sqrt(d2(t.x, t.z, e.x, e.z));
    const homing = kind === 'arrow' || kind === 'firearrow' || kind === 'bullet' || kind === 'frost';
    const speed = kind === 'bullet' ? 45 : kind === 'frost' ? 16 : kind === 'arrow' || kind === 'firearrow' ? 20 : 0;
    let T = homing ? dist / speed : kind === 'shell' || kind === 'bigshell' ? 1.1 + dist * 0.05 : kind === 'goo' ? 0.7 : 0.45 + dist * 0.05;
    let tx = e.x, tz = e.z;
    if (!homing) { // lead the target: where it will be when the shell lands
      const P = this.paths[e.path]; const sp = this.moving(e) ? e.speed * (1 - e.slowF) : 0;
      P.at(e.d + sp * T, TMP); tx = TMP.x - TMP.dz * e.off; tz = TMP.z + TMP.dx * e.off;
    }
    let dmg = st.dmg;
    if (st.crit && this.R() < st.crit) dmg *= 2;
    const p = this.proj(kind, t.x, h0, t.z, homing ? e : null, tx, tz, Math.max(0.08, T), { dmg, dtype: st.dtype, splash: st.splash || 0, slow: st.slow, burn: st.burn, poison: st.poison, corrode: st.corrode, spread: st.spread, stun: st.stun, freeze: st.freeze, fire: st.fire, pierce: st.pierce || 0, exec: st.exec, src: t, air: !!t.def.air, ty: e.y });
    this.projs.push(p);
    this.emit({ k: 'shot', t, kind });
  }
  land(p) {
    const src = p.src || null;
    const apply = (e, k = 1) => {
      if (p.exec && !e.def.boss && this.R() < p.exec) { this.hurt(e, e.hp + 1, 'true', src); return; }
      this.hurt(e, p.dmg * k, p.dtype, src, p.pierce);
      if (e.hp <= 0) return;
      if (p.slow) { e.slowF = Math.max(e.slowF, p.slow.f * (e.def.boss ? 0.6 : 1)); e.slowT = Math.max(e.slowT, p.slow.t); }
      if (p.freeze && this.R() < p.freeze.p && !e.def.boss) e.freeze = Math.max(e.freeze, p.freeze.t);
      if (p.burn) e.burn = { dps: p.burn.dps, t: p.burn.t, src };
      if (p.poison) { if (!e.poison || e.poison.dps <= p.poison.dps) e.poison = { dps: p.poison.dps, t: p.poison.t, spread: p.spread, src }; else e.poison.t = Math.max(e.poison.t, p.poison.t); }
      if (p.corrode) { e.corrode = p.corrode; e.corrodeT = 4; }
      if (p.stun && !e.def.boss) e.stun = Math.max(e.stun, p.stun);
    };
    if (p.splash > 0) {
      const r2 = p.splash * p.splash;
      for (const e of this.enemies) {
        if (e.hp <= 0 || (e.fly && !p.air)) continue;
        const d = d2(e.x, e.z, p.tx, p.tz); if (d > r2) continue;
        apply(e, p.kind === 'frost' || p.kind === 'goo' ? 1 : 1 - 0.35 * Math.sqrt(d / r2));
      }
      if (p.fire) this.fields.push({ id: this.nid++, kind: 'fire', x: p.tx, z: p.tz, r: p.fire.r, dps: p.fire.dps, t: p.fire.t, max: p.fire.t, src });
      if (p.kind === 'goo') this.fields.push({ id: this.nid++, kind: 'goo', x: p.tx, z: p.tz, r: p.splash, dps: 0, t: 1.4, max: 1.4 });
      this.emit({ k: 'boom', x: p.tx, z: p.tz, r: p.splash, kind: p.kind });
    } else if (p.target && p.target.hp > 0) { apply(p.target); this.emit({ k: 'hit', x: p.target.x, y: p.target.y, z: p.target.z, kind: p.kind }); }
  }
  moving(e) { return !(e.stun > 0 || e.freeze > 0 || (e.blocker && this.engaged(e))); }
  engaged(e) { const b = e.blocker; return b && !b.dead && d2(b.x, b.z, e.x, e.z) < 1.3 * 1.3 * (e.def.scale > 1.4 ? 2.2 : 1); }

  // ───────── main step
  step(dt) {
    if (this.over()) return;
    this.t += dt;
    if (this.state === 'play') this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjs(dt);
    this.updateFields(dt);
    this.updateSoldiers(dt);
    this.updateHero(dt);
    for (const s of this.spells) s.cd = Math.max(0, s.cd - dt);
    if (this.buffT > 0) this.buffT -= dt;
    if (this.enemies.length > 400) this.enemies = this.enemies.filter((e) => e.hp > 0);
    else if (this.enemies.some((e) => e.hp <= 0)) this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.stats.peak = Math.max(this.stats.peak, this.enemies.length);
    if (this.lives <= 0) { this.lives = 0; this.state = 'lost'; this.emit({ k: 'lose' }); return; }
    if (!this.endless && this.wave >= this.waveTotal && !this.spawnQ.length && !this.enemies.length && this.state === 'play') { this.state = 'won'; this.emit({ k: 'win' }); }
  }
  updateWaves(dt) {
    while (this.spawnQ.length && this.spawnQ[0].at <= this.t) this.spawn(this.spawnQ.shift());
    if (this.wave < this.waveTotal) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.startWave();
    }
  }
  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const E = e.def;
      // status effects
      if (e.poison) { this.hurt(e, e.poison.dps * dt, 'true', e.poison.src); e.poison.t -= dt; if (e.poison && e.poison.t <= 0) e.poison = null; if (e.hp <= 0) continue; }
      if (e.burn) { this.hurt(e, e.burn.dps * dt, 'true', e.burn.src); e.burn.t -= dt; if (e.burn && e.burn.t <= 0) e.burn = null; if (e.hp <= 0) continue; }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 0; }
      if (e.corrodeT > 0) e.corrodeT -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.freeze > 0) e.freeze -= dt;
      // healer
      if (E.heal) { e.healT -= dt; if (e.healT <= 0) { e.healT = E.heal.every; let n = 0; for (const o of this.enemies) if (o.hp > 0 && o !== e && !o.def.heal && o.hp < o.max && d2(o.x, o.z, e.x, e.z) < E.heal.r * E.heal.r) { o.hp = Math.min(o.max, o.hp + E.heal.hp * (o.max / o.def.hp)); n++; } if (n) this.emit({ k: 'heal', x: e.x, z: e.z }); } }
      // boss: stomp soldiers, summon
      if (E.stomp) { e.stompT -= dt; if (e.stompT <= 0 && (e.blocker || this.soldiers.some((m) => !m.dead && d2(m.x, m.z, e.x, e.z) < E.stomp.r ** 2))) { e.stompT = E.stomp.every; this.stomp(e); } }
      if (E.summon && this.moving(e)) { e.summonT -= dt; if (e.summonT <= 0) { e.summonT = E.summon.every; for (let i = 0; i < E.summon.n; i++) this.spawn({ type: E.summon.type, path: e.path, hp: (this.endless ? 1 : waveHp(this.L, this.wave - 1)), d: Math.max(0, e.d + 1 + i * 0.6), off: (i - 1) * 0.6 }); this.emit({ k: 'summon', x: e.x, z: e.z }); } }
      const P = this.paths[e.path];
      if (e.stun > 0 || e.freeze > 0) { /* frozen in place */ }
      else if (e.blocker && !e.fly) {
        const b = e.blocker;
        if (b.dead) e.blocker = null;
        else if (this.engaged(e)) {
          e.atkT -= dt;
          if (e.atkT <= 0) { e.atkT = 1; const v = E.dps * (1 - (b.armor || 0)); b.hp -= v; b.hit = 0.2; if (b.hp <= 0) { if (b === this.hero) this.heroDown(); else this.soldierDown(b); } }
          e.face = Math.atan2(b.x - e.x, b.z - e.z);
        } else e.d += e.speed * 0.4 * dt; // the defender is on the way: slow down
      } else if (e.back > 0) { e.back -= dt; e.d = Math.max(0, e.d - e.speed * 0.9 * dt); }
      else e.d += e.speed * (1 - e.slowF) * dt;
      P.at(e.d, TMP);
      e.x = TMP.x - TMP.dz * e.off; e.z = TMP.z + TMP.dx * e.off;
      if (!e.blocker || e.fly) e.face = Math.atan2(TMP.dx, TMP.dz) + (e.back > 0 ? Math.PI : 0);
      if (e.d >= P.len - 0.05) { // reached the keep
        e.hp = 0; this.unblock(e);
        const n = E.lives; this.lives -= n; this.stats.leaks += n;
        this.emit({ k: 'leak', n, x: e.x, z: e.z, boss: !!E.boss });
      }
    }
  }
  stomp(e) {
    const r2 = e.def.stomp.r ** 2;
    for (const m of this.soldiers) if (!m.dead && m.life >= 0 && d2(m.x, m.z, e.x, e.z) < r2) { m.hp -= e.def.stomp.dmg * (1 - m.armor); m.hit = 0.3; if (m.hp <= 0) this.soldierDown(m); }
    const h = this.hero; if (h && !h.dead && d2(h.x, h.z, e.x, e.z) < r2) { h.hp -= e.def.stomp.dmg * (1 - h.def.armor); h.hit = 0.3; if (h.hp <= 0) this.heroDown(); }
    this.emit({ k: 'stomp', x: e.x, z: e.z, r: e.def.stomp.r });
  }
  // pick a target for a tower
  pick(t, st, air) {
    const r2 = st.range * st.range, m2 = st.min ? st.min * st.min : 0;
    let best = null, bv = -1e18;
    for (const e of this.enemies) {
      if (e.hp <= 0 || (e.fly && !air)) continue;
      const d = d2(e.x, e.z, t.x, t.z); if (d > r2 || d < m2) continue;
      const prog = e.d - this.paths[e.path].len; // closer to the keep → higher
      const v = t.mode === 'strong' ? e.hp * 10 + prog * 0.01 : t.mode === 'last' ? -prog : t.mode === 'near' ? -d : prog;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }
  updateTowers(dt) {
    for (const t of this.towers) {
      if (t.fireT > 0) t.fireT -= dt;
      if (t.def.barracks) continue;
      const st = this.stat(t);
      if (t.def.mine) {
        if (this.state === 'play' && (this.enemies.length || this.spawnQ.length)) { t.mineT += dt; if (t.mineT >= st.every) { t.mineT -= st.every; this.gold += st.gold; this.stats.gold += st.gold; this.emit({ k: 'gold', x: t.x, z: t.z, n: st.gold }); } }
        continue;
      }
      t.cd -= dt;
      if (t.cd > 0) continue;
      if (st.aura) {
        let any = false; const r2 = st.range * st.range;
        for (const e of this.enemies) if (e.hp > 0 && d2(e.x, e.z, t.x, t.z) < r2) { any = true; this.hurt(e, st.dmg, st.dtype, t); if (e.hp > 0) { e.slowF = Math.max(e.slowF, st.slow.f * (e.def.boss ? 0.6 : 1)); e.slowT = Math.max(e.slowT, st.slow.t); } }
        t.cd = 1 / st.rate; t.active = any;
        continue;
      }
      const e = this.pick(t, st, !!t.def.air);
      if (!e) { t.cd = 0.1; continue; }
      this.fire(t, st, e);
      t.cd = 1 / st.rate;
    }
  }
  updateProjs(dt) {
    const keep = [];
    for (const p of this.projs) {
      p.t += dt;
      if (p.target && p.target.hp > 0) { p.tx = p.target.x; p.tz = p.target.z; p.ty = p.target.y; }
      const f = Math.min(1, p.t / p.T);
      p.x = p.x0 + (p.tx - p.x0) * f; p.z = p.z0 + (p.tz - p.z0) * f;
      const arc = p.kind === 'shell' || p.kind === 'bigshell' ? 7 : p.kind === 'ball' || p.kind === 'bigball' ? 2.2 : p.kind === 'goo' ? 3 : p.kind === 'arrow' || p.kind === 'firearrow' ? 0.6 : 0;
      const ty = (p.ty || 0) + 0.6;
      p.y = p.y0 + (ty - p.y0) * f + arc * 4 * f * (1 - f);
      if (p.kind === 'meteor' || p.kind === 'comet') p.y = p.y0 * (1 - f);
      if (f >= 1) this.land(p); else keep.push(p);
    }
    this.projs = keep;
  }
  updateFields(dt) {
    if (!this.fields.length) return;
    for (const f of this.fields) {
      f.t -= dt;
      if (f.dps) { const r2 = f.r * f.r; for (const e of this.enemies) if (e.hp > 0 && !e.fly && d2(e.x, e.z, f.x, f.z) < r2) this.hurt(e, f.dps * dt, 'true', f.src); }
    }
    this.fields = this.fields.filter((f) => f.t > 0);
  }
  soldierDown(m) {
    m.dead = true; m.hp = 0; this.dropSoldier(m);
    m.respawn = m.tower ? this.stat(m.tower).respawn : 0;
    this.emit({ k: 'fall', x: m.x, z: m.z, team: 'blue' });
    if (!m.tower) m.life = -1;
  }
  // a free enemy for a melee unit standing at (x, z) guarding `home`
  engage(u, reach) {
    let best = null, bd = reach * reach;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.fly || e.def.boss || (e.blocker && e.blocker !== u && !e.blocker.dead)) continue;
      const d = d2(e.x, e.z, u.home ? u.home.x : u.x, u.home ? u.home.z : u.z); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  walk(u, x, z, sp, dt) {
    const dx = x - u.x, dz = z - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { u.moving = false; return true; }
    const s = Math.min(d, sp * dt); u.x += (dx / d) * s; u.z += (dz / d) * s; u.face = Math.atan2(dx, dz); u.moving = true;
    return d - s < 0.05;
  }
  updateSoldiers(dt) {
    let gone = false;
    for (const m of this.soldiers) {
      if (m.hit > 0) m.hit -= dt;
      if (m.atkAnim > 0) m.atkAnim -= dt;
      if (m.life > 0) { m.life -= dt; if (m.life <= 0) { this.dropSoldier(m); m.dead = true; m.life = -1; gone = true; this.emit({ k: 'poof', x: m.x, z: m.z }); continue; } }
      if (m.life < 0) { gone = true; continue; }
      if (m.dead) {
        if (!m.tower) continue;
        m.respawn -= dt;
        if (m.respawn <= 0) { m.dead = false; m.hp = m.max; m.x = m.tower.x; m.z = m.tower.z; this.emit({ k: 'respawn', x: m.x, z: m.z }); }
        continue;
      }
      if (m.target && (m.target.hp <= 0 || m.target.blocker !== m)) m.target = null;
      if (!m.target) { const e = this.engage(m, 2.4); if (e) { m.target = e; e.blocker = m; } }
      const e = m.target;
      if (e) {
        const dist = Math.sqrt(d2(m.x, m.z, e.x, e.z));
        if (dist > 0.75) this.walk(m, e.x, e.z, 3, dt); else { m.moving = false; m.face = Math.atan2(e.x - m.x, e.z - m.z); }
        m.atkT -= dt;
        if (dist < 1.1 && m.atkT <= 0) { m.atkT = 1 / m.rate; m.atkAnim = 0.25; this.hurt(e, m.dmg, 'phys', m.tower); }
      } else {
        this.walk(m, m.home.x, m.home.z, 3, dt);
        if (m.regen) m.hp = Math.min(m.max, m.hp + m.regen * dt); else if (!m.moving) m.hp = Math.min(m.max, m.hp + m.max * 0.04 * dt);
        if (m.shoot) {
          m.atkT -= dt;
          if (m.atkT <= 0) {
            let best = null, bd = m.shoot.range ** 2;
            for (const o of this.enemies) { if (o.hp <= 0) continue; const d = d2(o.x, o.z, m.x, m.z); if (d < bd) { bd = d; best = o; } }
            if (best) { m.atkT = 1 / m.shoot.rate; this.projs.push(this.proj('arrow', m.x, 1, m.z, best, best.x, best.z, Math.sqrt(bd) / 18 + 0.05, { dmg: m.shoot.dmg * this.fx.men, dtype: 'phys', splash: 0, src: m.tower, air: true, ty: best.y })); m.face = Math.atan2(best.x - m.x, best.z - m.z); m.atkAnim = 0.25; }
          }
        }
      }
    }
    if (gone) this.soldiers = this.soldiers.filter((m) => m.life >= 0);
  }
  heroDown() {
    const h = this.hero; h.dead = true; h.hp = 0; h.respawn = 14; h.target = null;
    for (const e of h.blocking) if (e.blocker === h) e.blocker = null;
    h.blocking = [];
    this.emit({ k: 'herodown', x: h.x, z: h.z });
  }
  updateHero(dt) {
    const h = this.hero; if (!h) return;
    h.cd[0] = Math.max(0, h.cd[0] - dt); h.cd[1] = Math.max(0, h.cd[1] - dt);
    if (h.hit > 0) h.hit -= dt;
    if (h.atkAnim > 0) h.atkAnim -= dt;
    const H = h.def;
    if (h.dead) {
      h.respawn -= dt;
      if (h.respawn <= 0) { h.dead = false; h.hp = h.max; h.x = this.keep.x; h.z = this.keep.z; if (h.tx == null) { const p = this.heroHome(); h.tx = p.x; h.tz = p.z; h.moving = true; } this.emit({ k: 'respawn', x: h.x, z: h.z, hero: true }); }
      return;
    }
    if (h.moving && h.tx != null) {
      if (this.walk(h, h.tx, h.tz, H.speed, dt)) { h.moving = false; h.home = { x: h.tx, z: h.tz }; }
      return;
    }
    h.home = h.home || { x: h.x, z: h.z };
    h.blocking = h.blocking.filter((e) => e.hp > 0 && e.blocker === h);
    if (H.melee) {
      while (h.blocking.length < H.block) { const e = this.engage(h, 2.8); if (!e) break; e.blocker = h; h.blocking.push(e); }
      if (h.target && !h.blocking.includes(h.target)) h.target = null;
      h.target = h.target || h.blocking[0] || null;
      const e = h.target;
      if (e) {
        const dist = Math.sqrt(d2(h.x, h.z, e.x, e.z));
        if (dist > 0.9) this.walk(h, e.x, e.z, H.speed, dt); else { h.moving = false; h.face = Math.atan2(e.x - h.x, e.z - h.z); }
        h.atkT -= dt;
        if (dist < 1.3 && h.atkT <= 0) {
          h.atkT = 1 / H.rate; h.atkAnim = 0.3;
          if (H.splash) { for (const o of this.enemies) if (o.hp > 0 && !o.fly && d2(o.x, o.z, e.x, e.z) < H.splash ** 2) this.hurt(o, h.dmg, 'phys', null); } else this.hurt(e, h.dmg, 'phys', null);
        }
      } else { this.walk(h, h.home.x, h.home.z, H.speed, dt); h.hp = Math.min(h.max, h.hp + h.max * 0.03 * dt); }
    } else {
      h.atkT -= dt;
      if (h.atkT <= 0) {
        let best = null, bd = H.range * H.range;
        for (const o of this.enemies) { if (o.hp <= 0 || (o.fly && !H.air)) continue; const d = d2(o.x, o.z, h.x, h.z); if (d < bd) { bd = d; best = o; } }
        if (best) {
          h.atkT = 1 / H.rate; h.atkAnim = 0.3; h.face = Math.atan2(best.x - h.x, best.z - h.z);
          const T = Math.sqrt(bd) / (H.magic ? 12 : 22) + 0.05;
          this.projs.push(this.proj(H.magic ? 'fireball' : 'arrow', h.x, 1.4, h.z, best, best.x, best.z, T, { dmg: h.dmg, dtype: H.magic ? 'magic' : 'phys', splash: H.splash || 0, air: true, ty: best.y }));
        } else h.atkT = 0.1;
      }
      if (!h.moving) h.hp = Math.min(h.max, h.hp + h.max * 0.03 * dt);
    }
    // enemies hitting the hero: handled in updateEnemies through blocker (hero.armor)
    if (h.hp <= 0) this.heroDown();
  }

  // ───────── results
  result() {
    const win = this.state === 'won';
    return { win, lives: this.lives, maxLives: this.maxLives, stars: win ? starsFor(this.lives, this.maxLives) : 0, wave: this.wave, waves: this.endless ? this.wave : this.waveTotal,
      time: +this.t.toFixed(1), kills: this.stats.kills, leaks: this.stats.leaks, built: this.stats.built, gold: this.stats.gold, spells: this.stats.spells, abilities: this.stats.abilities, peak: this.stats.peak };
  }
  debug() { return { state: this.state, t: +this.t.toFixed(2), wave: this.wave, waves: this.waveTotal, gold: this.gold, lives: this.lives, enemies: this.enemies.length, towers: this.towers.length, soldiers: this.soldiers.filter((m) => !m.dead).length, projs: this.projs.length, hero: this.hero ? { x: +this.hero.x.toFixed(1), z: +this.hero.z.toFixed(1), hp: Math.round(this.hero.hp), dead: this.hero.dead } : null }; }
}
