// Bastione — autopilot: plays a level the way a player would (builds, upgrades, specialises, hero
// abilities and spells). Used by the balance tool, the self-tests, the "Autogioco" test hook and the
// cover renderer. skill: 'good' (thinks every 0.5 s, uses everything) | 'casual' (slower, no spells,
// fewer upgrades, random tower picks).
import { TOWERS, towerById, ENEMIES } from './data.js';
import { rng } from './levels.js';

const d2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
function power(def, st) {
  if (!st) return 0;
  if (def.mine) return 0;
  if (def.barracks) return st.men * (st.hp / 40 + st.dmg * st.rate * 1.2) * (st.shoot ? 1.4 : 1) * (1 + st.armor);
  let p = (st.dmg || 0) * (st.rate || 1);
  if (st.splash) p *= 1 + st.splash * 0.9;
  if (st.chain) p *= 1 + (st.chain.n - 1) * st.chain.fall * 0.8;
  if (st.poison) p += st.poison.dps * 1.6 * (1 + (st.splash || 0) * 0.6);
  if (st.burn) p += st.burn.dps * 0.8 * st.rate * 2;
  if (st.slow) p *= 1.25 + st.slow.f;
  if (st.aura) p = st.dmg * st.rate * 3.5 * (1 + st.slow.f);
  return p * (0.6 + st.range / 12);
}
export class Autopilot {
  constructor(sim, { skill = 'good', seed = 7, hero = true, spells = true } = {}) {
    this.s = sim; this.skill = skill; this.R = rng(seed); this.next = 0; this.hero = hero; this.spells = spells && skill === 'good';
    const L = sim.L, samples = sim.paths.flatMap((p) => p.samples);
    this.cover = sim.slots.map((sl) => samples.filter((q) => d2(q.x, q.z, sl.x, sl.z) < 36).length);
    this.coverFar = sim.slots.map((sl) => samples.filter((q) => d2(q.x, q.z, sl.x, sl.z) < 90).length);
    const types = new Set(); for (const w of L.waveList || []) for (const g of w) types.add(g.type); for (const k of Object.keys(L.roster || {})) types.add(k); if (L.boss) types.add(L.boss);
    this.air = [...types].some((t) => ENEMIES[t]?.fly);
    this.armored = [...types].some((t) => ENEMIES[t]?.armor >= 0.5);
    this.long = (L.waves || 10) >= 11;
  }
  // tower type for a new build on slot i
  pickType(i) {
    const s = this.s, built = s.towers.map((t) => t.def.id), n = built.length;
    const count = (id) => built.filter((x) => x === id).length;
    const ok = (id) => s.canBuild(id);
    if (this.skill === 'casual') { const pool = (this.air ? ['balestra', 'tesla', 'caserma', 'gelo', 'balestra', 'cecchino'] : ['balestra', 'cannone', 'caserma', 'gelo', 'tesla', 'mortaio']).filter(ok); return pool[Math.floor(this.R() * pool.length)] || TOWERS.find((t) => ok(t.id)).id; }
    const airN = s.towers.filter((t) => t.def.air).length;
    const want = [];
    if (count('caserma') < 1 + Math.floor(n / 5)) want.push('caserma');
    if (this.air && airN < Math.max(2, Math.ceil(n * 0.45))) want.push(this.armored ? 'tesla' : 'balestra', 'tesla', 'cecchino');
    if (this.armored) want.push('tesla', 'veleno', 'gelo');
    if (count('gelo') < 1 && n >= 2) want.push('gelo');
    if (this.coverFar[i] > 60 && count('mortaio') < 2 && n >= 3) want.push('mortaio');
    want.push('cannone', 'balestra', 'tesla', 'cecchino', 'veleno', 'gelo', 'mortaio');
    // variety: the first wanted type that is not over-represented yet
    const cap = 1 + Math.floor(n / 5);
    return want.find((t) => ok(t) && count(t) < cap) || want.find(ok) || TOWERS.find((t) => ok(t.id) && !t.mine).id;
  }
  bestSpec(t) {
    const st = [0, 1].map((k) => power(t.def, t.def.spec[k]));
    if (t.def.id === 'miniera') return 0;
    if (t.def.id === 'gelo') return 0;
    return st[1] > st[0] ? 1 : 0;
  }
  think() {
    const s = this.s;
    // candidate actions: [value, cost, fn]
    const acts = [];
    const free = s.slots.filter((sl) => !sl.tower);
    const mines = [];
    if (free.length) {
      const sl = free.reduce((a, b) => (this.cover[b.i] > this.cover[a.i] ? b : a));
      const type = this.pickType(sl.i), def = towerById(type), cost = s.towerCost(def, 0);
      const v = (this.cover[sl.i] * power(def, s.stat({ def, tier: 0, spec: -1, buff: 1, x: sl.x, z: sl.z }))) / cost;
      acts.push([v * (s.towers.length < 4 ? 3 : 1.15), cost, () => s.build(sl.i, type)]);
      // a gold mine on the least useful spot, early in long levels
      const left = s.L.waves - s.wave;
      if (this.skill === 'good' && this.long && left > 6 && s.towers.length >= 3 && s.canBuild('miniera') && !s.towers.some((t) => t.def.mine) && free.length > 1) {
        const ms = free.reduce((a, b) => (this.cover[b.i] < this.cover[a.i] ? b : a));
        mines.push([0.5, s.towerCost(towerById('miniera'), 0), () => s.build(ms.i, 'miniera')]);
      }
    }
    for (const t of s.towers) {
      const cov = this.cover[t.slot], left = s.L.waves - s.wave;
      if (t.def.mine) {
        if (t.tier < 2 && left > 5) mines.push([0.35, s.towerCost(t.def, t.tier + 1), () => s.upgrade(t.slot)]);
        else if (t.tier >= 2 && t.spec < 0 && left > 6) mines.push([0.25, t.def.spec[0].cost, () => s.specialize(t.slot, 0)]);
        continue;
      }
      if (t.tier < 2) {
        const c = s.towerCost(t.def, t.tier + 1);
        const gain = power(t.def, t.def.tiers[t.tier + 1]) - power(t.def, t.def.tiers[t.tier]);
        acts.push([(cov * gain) / c, c, () => s.upgrade(t.slot)]);
      } else if (t.spec < 0) {
        const k = this.skill === 'good' ? this.bestSpec(t) : t.id % 2, c = t.def.spec[k].cost;
        const gain = power(t.def, t.def.spec[k]) - power(t.def, t.def.tiers[2]);
        acts.push([(cov * gain) / c, c, () => s.specialize(t.slot, k)]);
      }
    }
    // mines are worth a share of the best combat move
    const top = Math.max(0, ...acts.map((a) => a[0]));
    for (const m of mines) acts.push([m[0] * top, m[1], m[2]]);
    acts.sort((a, b) => b[0] - a[0]);
    const best = acts[0];
    if (!best || best[0] <= 0) return false;
    if (this.skill === 'casual' && this.R() < 0.35) return false; // a casual player hesitates
    if (s.gold >= best[1]) { best[2](); return true; }
    // the best move is too expensive: take a good affordable one instead of hoarding
    const alt = acts.find((a) => a[0] > 0 && a[1] <= s.gold && a[0] >= best[0] * (this.skill === 'good' ? (best[1] - s.gold > 60 ? 0.3 : 0.55) : 0.3));
    if (alt) { alt[2](); return true; }
    return false;
  }
  tick(dt) {
    const s = this.s;
    if (s.over()) return;
    this.next -= dt;
    if (this.next <= 0) {
      this.next = this.skill === 'good' ? 0.5 : 4;
      let n = 0; while (n++ < 4 && this.think());
      if (s.state === 'ready' && (s.towers.length >= 2 || s.gold < 70)) s.callWave();
    }
    // hero + spells
    const h = s.hero;
    if (h && !h.dead && this.hero && this.skill === 'good') {
      for (let i = 0; i < 2; i++) if (h.cd[i] <= 0) {
        const A = h.def.ab[i];
        const c = s.cluster(h.x, h.z, 7, A.r, true);
        const near = s.enemies.filter((e) => e.hp > 0 && d2(e.x, e.z, h.x, h.z) < A.r * A.r).length;
        if (A.id === 'stendardo' ? near >= 3 : ['carica', 'terremoto', 'ruggito'].includes(A.id) ? near >= 3 : c && c.n >= 4) s.ability(i);
      }
    }
    if (this.spells && s.state === 'play') {
      for (const sp of s.spells) {
        if (sp.cd > 0) continue;
        if (sp.def.id === 'rinforzi') {
          // in front of the most advanced ground enemy
          let lead = null; for (const e of s.enemies) if (e.hp > 0 && !e.fly && (!lead || e.d / s.paths[e.path].len > lead.d / s.paths[lead.path].len)) lead = e;
          if (lead && lead.d / s.paths[lead.path].len > 0.6) s.cast('rinforzi', lead.x, lead.z);
          continue;
        }
        let best = null;
        for (const e of s.enemies) { if (e.hp <= 0) continue; const c = s.cluster(e.x, e.z, 0.1, sp.def.r, sp.def.id !== 'meteore'); if (c && (!best || c.n > best.n)) best = c; }
        if (best && best.n >= (sp.def.id === 'meteore' ? 6 : 7)) s.cast(sp.def.id, best.x, best.z);
      }
    }
  }
}
// run a whole level headlessly; returns the sim result
export function autoplay(Sim, level, opts = {}, ap = {}, dt = 1 / 30, maxT = 1800) {
  const s = new Sim(level, opts), a = new Autopilot(s, ap);
  while (!s.over() && s.t < maxT) { a.tick(dt); s.step(dt); s.ev.length = 0; }
  return { r: s.result(), s };
}
