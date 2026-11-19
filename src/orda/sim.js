// Orda — the deterministic simulation. No three.js, no DOM: the renderer (game.js) reads its state
// after each step, the headless balance tool (tools/orda-balance.mjs) and the tests drive it directly.
//
// World: x is lateral (−w/2 … w/2), z runs from the player's cannon (z = CANNON_Z) to the enemy base
// front (z = len). Level data uses `y` for that forward distance (see levels.js); it becomes z here.
//
// Crowds are kept in two struct-of-arrays pools (blue, red). A figure carries `h` hit points; one
// "unit" of a team has hpUnit hit points, so a figure stands for ceil(h / hpUnit) units. When a pool is
// full (low-end devices get smaller pools) clones are folded into the parent figure's units instead of
// being dropped, so the game math is the same on every device: only the number of drawn bodies differs.
import { upEffects, champById, CHARGE_K } from './meta.js';

export const CANNON_Z = 1.5;
export const COUNTDOWN = 1;     // seconds of "pronti…" before the first shot
export const RED_SPEED = 6;     // m/s of a red figure (levels may override with redSpeed)
export const CANNON_SLIDE = 24; // m/s of the cannon under keys / stick
export const BASE_DEPTH = 7;
const MAX_GATES = 32;

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// collision radius of a red: giants are wide
const redR = (R, j) => (R.kind[j] === 2 ? 0.75 + 0.12 * Math.log2(Math.max(2, R.u[j])) : 0.3 * unitScale(R.u[j]));
export const unitScale = (u) => (u <= 1 ? 1 : Math.min(3.4, 1 + 0.36 * Math.log2(u)));

export class Pool {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    this.x = new Float32Array(cap); this.z = new Float32Array(cap); this.vx = new Float32Array(cap);
    this.h = new Float32Array(cap); this.u = new Float32Array(cap); this.mask = new Uint32Array(cap);
    this.ph = new Float32Array(cap); this.age = new Float32Array(cap); this.kind = new Uint8Array(cap); this.air = new Float32Array(cap);
  }
  add(x, z, h, mask, ph, kind = 0) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.vx[i] = 0; this.h[i] = h; this.u[i] = 1; this.mask[i] = mask; this.ph[i] = ph; this.age[i] = 0; this.kind[i] = kind; this.air[i] = 0;
    return i;
  }
  // drop the dead (h <= 0), keeping the arrays packed
  compact() {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.h[i] <= 1e-6) continue;
      if (w !== i) { this.x[w] = this.x[i]; this.z[w] = this.z[i]; this.vx[w] = this.vx[i]; this.h[w] = this.h[i]; this.u[w] = this.u[i]; this.mask[w] = this.mask[i]; this.ph[w] = this.ph[i]; this.age[w] = this.age[i]; this.kind[w] = this.kind[i]; this.air[w] = this.air[i]; }
      w++;
    }
    this.n = w;
  }
}

// gate maths on a crowd of `u` units; gate state is mutated for the budget / alternating kinds
function gateApply(g, u) {
  switch (g.type) {
    case 'mul': return u * g.value;
    case 'add': return u + g.value;
    case 'sub': { const take = Math.min(u, g.left); g.left -= take; if (g.left <= 0) g.broken = true; return u - take; }
    case 'div': { g.acc += u; const out = Math.floor(g.acc / g.value) - g.out; g.out += out; return out; }
    case 'split': return u * g.value;
    case 'rec': return u + (g.take || 0);
  }
  return u;
}
// gate kinds: mul ×n · add +n · sub −n (a budget that runs out) · div ÷n · split ×n that throws the
// crowd into two lanes · rec ("riciclo") gives back up to n of the figures lost to traps so far
export const gateLabel = (type, value, g) => (type === 'mul' ? `×${value}` : type === 'add' ? `+${value}` : type === 'sub' ? `−${g ? Math.max(0, Math.ceil(g.left)) : value}` : type === 'split' ? `⇆×${value}` : type === 'rec' ? `♻+${g ? Math.floor(g.avail || 0) : value}` : `÷${value}`);
export const gateGood = (type) => type === 'mul' || type === 'add' || type === 'split' || type === 'rec';
export const GATE_TYPES = ['mul', 'add', 'sub', 'div', 'split', 'rec'];

export class Sim {
  /**
   * @param level level JSON (levels.js shape)
   * @param o { up: upgrade levels, champ: id, champLvl, cap: max bodies per team, seed, hooks }
   */
  constructor(level, o = {}) {
    this.level = level; this.o = o;
    this.rand = rng(o.seed ?? (level.id || 1) * 7919 + 13);
    this.W = level.w || 16; this.L = level.len || 64;
    const E = this.E = upEffects(o.up || {});
    this.hpB = E.hp; this.hpR = level.redHp || 1;
    this.spdB = E.speed; this.spdR = level.redSpeed || RED_SPEED;
    const cap = o.cap || 1600;
    this.blue = new Pool(cap); this.red = new Pool(Math.max(200, Math.round(cap * 0.6)));
    this.t = 0; this.time = level.time || 120; this.count = o.countdown ?? level.countdown ?? COUNTDOWN;
    this.bonus = !!level.bonus;
    this.state = 'count'; this.why = '';
    const chp = Math.round((level.cannon?.hp || 20) * E.armor);
    this.cannon = { x: 0, hp: chp, max: chp, fireAcc: 0, shotAcc: 0, recoil: 0, vx: 0 };
    const b = level.base || {};
    this.base = {
      hp: b.hp || 100, max: b.hp || 100, w: b.w || 9, z: this.L, boss: !!b.boss, name: b.name || '',
      spawners: (b.spawners || []).map((s) => ({ x: s.x || 0, rate: s.rate || 0.5, count: s.count || 1, spread: s.spread ?? 1.2, acc: 0.5 })),
      waves: b.waves ? { every: b.waves.every || 10, count: b.waves.count || 10, acc: 0 } : null,
      ramp: b.ramp ?? 0.25, mult: 1, shieldT: 0, phase: 0,
      phases: (b.phases || []).map((p) => ({ ...p, done: false })), bruteHp: b.bruteHp || 18, dead: false,
      giants: b.giants ? { every: b.giants.every || 12, hp: b.giants.hp || 40, acc: (b.giants.every || 12) - (b.giants.first ?? 4) } : null,
    };
    this.gates = (level.gates || []).slice(0, MAX_GATES).map((g, i) => ({
      i, bit: (1 << i) >>> 0, x0: g.x || 0, cx: g.x || 0, z: g.y, w: g.w || 4.5, type: g.type, value: g.value, base: { type: g.type, value: g.value },
      move: g.move || null, toggle: g.toggle || null, left: g.type === 'sub' ? g.value : 0, acc: 0, out: 0, flash: 0, passed: 0, broken: false, on: true, tt: 0,
      rainbow: !!g.rainbow, to: g.to ?? 4.5, avail: 0, take: 0,
    }));
    this.fallen = 0; // blue units lost to traps and bad gates: the "riciclo" gates give them back
    this.combo = 0; this.comboTier = 1; this.comboGain = 0; this.comboLoss = 0;
    this.obs = (level.obstacles || []).map((ob) => ({ ...ob, z: ob.y, cx: ob.x || 0, cz: ob.y, ang: ob.ang || 0, w: ob.w || 3, d: ob.d || 1, hits: 0 }));
    this.towers = (b.towers || []).map((tw) => ({ x: tw.x, z: tw.y, hp: tw.hp || 30, max: tw.hp || 30, rate: tw.rate || 0.4, count: tw.count || 2, acc: 0, r: 1.15, dead: false, hit: 0 }));
    // champions
    const C = champById(o.champ || 'colosso');
    this.champDef = C; this.champLvl = o.champLvl || 0;
    this.champs = [];
    this.charge = 0; this.chargeNeed = Math.round((level.charge || 24 + (+level.id || 10) * 2.2) * E.charge * CHARGE_K);
    this.ev = []; this.clashN = 0;
    this.stats = { sent: 0, cloned: 0, kills: 0, towers: 0, champs: 0, baseDmg: 0, lost: 0, gates: 0, peak: 0, champDmg: 0, reds: 0, comboMax: 1, comboSum: 0, giants: 0, recycled: 0, jumps: 0, peakUnits: 0 };
    this.hooks = o.hooks || {};
    // spatial grid for the red crowd
    this.cs = 1.25; this.gx0 = -this.W / 2 - 2; this.gz0 = -2;
    this.gcols = Math.ceil((this.W + 4) / this.cs); this.grows = Math.ceil((this.L + BASE_DEPTH + 6) / this.cs);
    this.cellStart = new Int32Array(this.gcols * this.grows + 1); this.cellIdx = new Int32Array(this.red.cap);
    this.input = { x: null, dx: 0, fire: false, champ: false };
  }

  // ---------- queries
  units(pool, i) { return Math.max(1, Math.ceil(pool.h[i] / (pool === this.blue ? this.hpB : this.hpR) - 1e-4)); }
  blueUnits() { let s = 0; const B = this.blue; for (let i = 0; i < B.n; i++) s += B.u[i]; return s; }
  redUnits() { let s = 0; const R = this.red; for (let i = 0; i < R.n; i++) s += R.u[i]; return s; }
  emit(e) { if (this.ev.length < 400) this.ev.push(e); }
  ready() { return this.charge >= this.chargeNeed; }

  // ---------- main step (call with dt ≤ 1/20; the renderer sub-steps)
  step(dt) {
    if (this.state === 'won' || this.state === 'lost') return;
    const inp = this.input;
    this.moveCannon(dt, inp);
    if (this.state === 'count') { this.count -= dt; if (this.count <= 0) { this.state = 'play'; this.emit({ t: 'go' }); } this.animate(dt); return; }
    this.t += dt; this.time -= dt; this.clashN = 0;
    this.animate(dt);
    if (inp.fire || this.o.autofire) this.fire(dt);
    if (inp.champ) { inp.champ = false; this.launch(); }
    this.spawnRed(dt);
    this.moveBlue(dt);
    this.moveRed(dt);
    this.spread(dt);
    this.buildGrid();
    this.clash();
    this.moveChamps(dt);
    this.blue.compact(); this.red.compact();
    for (let i = 0; i < this.blue.n; i++) this.blue.u[i] = this.units(this.blue, i);
    for (let i = 0; i < this.red.n; i++) this.red.u[i] = this.units(this.red, i);
    this.stats.peak = Math.max(this.stats.peak, this.blue.n);
    this.updateCombo(dt);
    if (this.bonus) { if (this.time <= 0) { this.time = 0; this.end(true, 'bonus'); } return; }
    if (this.base.hp <= 0 && !this.base.dead) { this.base.hp = 0; this.base.dead = true; this.end(true, 'base'); }
    else if (this.cannon.hp <= 0) { this.cannon.hp = 0; this.end(false, 'overrun'); }
    else if (this.time <= 0) { this.time = 0; this.end(false, 'time'); }
  }
  // "Valanga": a meter fed by what the gates add, drained by what traps and bad gates take; tiers x1…x5
  updateCombo(dt) {
    const ref = Math.max(1, this.E.rate * this.E.shot);
    let m = this.combo + this.comboGain / (ref * 5) - this.comboLoss / (ref * 2.5);
    m -= m * 0.42 * dt;
    this.combo = m = clamp(m, 0, 4.999);
    this.comboGain = this.comboLoss = 0;
    const tier = 1 + Math.floor(m);
    if (tier !== this.comboTier) { if (tier > this.comboTier) this.emit({ t: 'combo', n: tier }); else if (tier === 1) this.emit({ t: 'comboEnd', n: this.comboTier }); this.comboTier = tier; }
    this.stats.comboMax = Math.max(this.stats.comboMax, tier); this.stats.comboSum += (tier - 1) * dt;
  }
  end(win, why) {
    this.state = win ? 'won' : 'lost'; this.why = why;
    this.left = this.blueUnits();
    this.emit({ t: win ? 'win' : 'lose', why });
    this.hooks.onEnd?.(this);
  }
  result() {
    return { win: this.state === 'won', why: this.why, time: +this.t.toFixed(2), left: this.left ?? this.blueUnits(), cannonHp: this.cannon.hp, cannonMax: this.cannon.max, baseHp: Math.max(0, Math.round(this.base.hp)), baseMax: this.base.max, ...this.stats };
  }

  moveCannon(dt, inp) {
    const c = this.cannon, lim = this.W / 2 - 0.9;
    if (inp.x != null) { const d = clamp(inp.x, -lim, lim) - c.x; c.x += d * Math.min(1, dt * 34); }
    else if (inp.dx) c.x += inp.dx * CANNON_SLIDE * dt;
    c.x = clamp(c.x, -lim, lim);
    c.recoil = Math.max(0, c.recoil - dt * 6);
  }

  // moving and toggling gates, rotating bars, sliding saws and barriers
  animate(dt) {
    const t = this.t;
    for (const g of this.gates) {
      g.flash = Math.max(0, g.flash - dt * 3);
      if (g.type === 'rec') g.avail = Math.min(this.fallen, g.value);
      if (g.move) g.cx = g.x0 + (g.move.amp || 3) * Math.sin(t * (g.move.speed || 0.5) * Math.PI * 2 + (g.move.phase || 0));
      if (g.toggle && this.state === 'play') {
        const every = g.toggle.every || 3, k = Math.floor(t / every) % 2;
        g.tt = every - (t % every);
        const want = k ? g.toggle : g.base;
        if (g.type !== want.type || g.value !== want.value) { g.type = want.type; g.value = want.value; g.left = g.type === 'sub' ? g.value : 0; g.acc = g.out = 0; g.broken = false; g.flash = 1; this.emit({ t: 'toggle', g: g.i }); }
      }
    }
    for (const ob of this.obs) {
      if (ob.type === 'spin') ob.ang += (ob.speed ?? 1.6) * dt;
      else if (ob.type === 'saw' || ob.type === 'barrier') ob.cx = ob.x + (ob.amp ?? 3) * Math.sin(t * (ob.speed ?? 0.4) * Math.PI * 2 + (ob.phase || 0));
      if (ob.type === 'saw') ob.ang += dt * 12;
    }
  }

  fire(dt) {
    const c = this.cannon, E = this.E;
    c.fireAcc += E.rate * dt;
    while (c.fireAcc >= 1) {
      c.fireAcc -= 1;
      c.shotAcc += E.shot;
      const k = Math.floor(c.shotAcc); c.shotAcc -= k;
      for (let j = 0; j < k; j++) {
        const x = c.x + (j - (k - 1) / 2) * 0.5 + (this.rand() - 0.5) * 0.2;
        if (this.blue.add(x, CANNON_Z + 0.9 + this.rand() * 0.2, this.hpB, 0, this.rand()) < 0) this.foldInto(this.blue, x, CANNON_Z + 1, 1);
        this.stats.sent++;
      }
      c.recoil = 1;
      this.emit({ t: 'fire', x: c.x, k });
    }
  }
  // pool full: give the units to the nearest figure of that team instead
  foldInto(P, x, z, units) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < P.n; i += 3) { const d = Math.abs(P.x[i] - x) + Math.abs(P.z[i] - z); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) P.h[best] += units * (P === this.blue ? this.hpB : this.hpR);
  }

  launch() {
    if (!this.ready() || this.state !== 'play') return false;
    this.charge = 0;
    const C = this.champDef, st = C.stats(this.champLvl);
    const ch = { id: C.id, x: this.cannon.x, z: CANNON_Z + 1.2, hp: st.hp, max: st.hp, st, alive: true, air: 0, hop: 0, mask: 0, split: st.split || 0, towers: new Set(), age: 0, hit: 0 };
    this.champs.push(ch); this.stats.champs++;
    this.emit({ t: 'champ', id: C.id, x: ch.x });
    return true;
  }

  spawnRed(dt) {
    const b = this.base, R = this.red, k = 1 + b.ramp * (this.t / 60);
    if (b.shieldT > 0) b.shieldT -= dt;
    for (const s of b.spawners) {
      s.acc += s.rate * k * b.mult * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        // big bursts come as a few chunky reds (same hit points, fewer bodies)
        const nb = Math.min(s.count, 6), per = Math.floor(s.count / nb); let rem = s.count - per * nb;
        for (let j = 0; j < nb; j++) { const u = per + (rem > 0 ? 1 : 0); if (rem > 0) rem--; this.addRed(clamp(s.x + (this.rand() - 0.5) * 2 * s.spread, -b.w / 2 + 0.4, b.w / 2 - 0.4), b.z - 0.6 - this.rand() * 0.6, u); }
        this.emit({ t: 'spawn', x: s.x });
      }
    }
    if (b.giants) {
      b.giants.acc += dt;
      if (b.giants.acc >= b.giants.every) { b.giants.acc = 0; this.giant(b.giants.hp); }
    }
    if (b.waves) {
      b.waves.acc += dt;
      if (b.waves.acc >= b.waves.every) { b.waves.acc = 0; this.wave(b.waves.count); }
    }
    for (const tw of this.towers) {
      if (tw.dead) continue;
      tw.hit = Math.max(0, tw.hit - dt * 4);
      tw.acc += tw.rate * dt;
      while (tw.acc >= 1) { tw.acc -= 1; for (let j = 0; j < tw.count; j++) this.addRed(tw.x + (this.rand() - 0.5) * 1.6, tw.z - tw.r - 0.3, 1); }
    }
    // boss phases: a wave, brutes, a moment of shield, a faster rhythm
    for (const p of b.phases) {
      if (p.done || b.hp / b.max > p.at) continue;
      p.done = true; b.phase++;
      if (p.wave) this.wave(p.wave);
      for (let j = 0; j < (p.brute || 0); j++) this.addRed((j - ((p.brute || 1) - 1) / 2) * 2.6, b.z - 1.5, p.bruteHp || b.bruteHp, 1);
      if (p.giant) this.giant(p.giant);
      if (p.shield) b.shieldT = p.shield;
      if (p.rate) b.mult *= p.rate;
      this.emit({ t: 'phase', n: b.phase, shield: p.shield || 0 });
      this.hooks.onWave?.(this, p);
    }
  }
  wave(n) {
    const b = this.base;
    for (let j = 0; j < n; j++) this.addRed(-b.w / 2 + 0.5 + ((j + 0.5) / n) * (b.w - 1) + (this.rand() - 0.5) * 0.4, b.z - 0.6 - this.rand() * 1.4, 1);
    this.emit({ t: 'wave', n });
  }
  // a red giant: one huge, slow body with many hit points — the river has to wear it down
  giant(hp) {
    const x = (this.rand() - 0.5) * 3;
    this.addRed(x, this.base.z - 1.6, hp, 2);
    this.stats.giants++;
    this.emit({ t: 'giant', x, hp });
  }
  addRed(x, z, units, kind = 0) {
    this.stats.reds += units;
    const i = this.red.add(x, z, units * this.hpR, 0, this.rand(), kind);
    if (i < 0) this.foldInto(this.red, x, z, units); else this.red.u[i] = units;
  }

  // ---------- obstacles (shared by both crowds). Returns 0 = fine, 1 = killed
  obstacle(P, i, r, dir) {
    for (const ob of this.obs) {
      const x = P.x[i], z = P.z[i];
      if (ob.type === 'jump' || ob.type === 'push') {
        // pads only work on the blue crowd: a jump pad throws it over what follows, a lane switch
        // slides it to the pad's target x (the damping turns vx into a shift of vx / 4)
        if (dir < 0 || Math.abs(x - ob.cx) >= ob.w / 2 || Math.abs(z - ob.cz) >= ob.d / 2) continue;
        if (ob.type === 'jump') { if (P.air[i] <= 0) { P.air[i] = ob.air ?? 1; ob.hits++; this.stats.jumps++; this.emit({ t: 'jump', x, z }); } }
        else { P.vx[i] = clamp((ob.to - x) * 4, -24, 24); if (!ob.hitT || this.t - ob.hitT > 0.4) { ob.hitT = this.t; this.emit({ t: 'push', x, z, to: ob.to }); } }
        continue;
      }
      if (ob.type === 'wall' || ob.type === 'barrier') {
        const hw = ob.w / 2 + r, hd = ob.d / 2 + r, dx = x - ob.cx, dz = z - ob.cz;
        if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
        const px = hw - Math.abs(dx), pz = dir > 0 ? z + r - (ob.cz - ob.d / 2) : (ob.cz + ob.d / 2) - (z - r);
        if (pz < px && pz < 0.6) { P.z[i] = dir > 0 ? ob.cz - hd : ob.cz + hd; P.vx[i] = (dx >= 0 ? 1 : -1) * 5.5; }
        else P.x[i] = ob.cx + (dx >= 0 ? hw : -hw);
      } else if (ob.type === 'pit') {
        if (Math.abs(x - ob.cx) < ob.w / 2 && Math.abs(z - ob.cz) < ob.d / 2) { this.emit({ t: 'fall', x, z, team: P === this.blue ? 0 : 1 }); ob.hits++; return 1; }
      } else if (ob.type === 'spin') {
        const ca = Math.cos(ob.ang), sa = Math.sin(ob.ang), dx = x - ob.cx, dz = z - ob.cz, len = ob.len || 3.5;
        const along = clamp(dx * ca + dz * sa, -len, len), qx = dx - along * ca, qz = dz - along * sa;
        if (qx * qx + qz * qz < (0.22 + r) * (0.22 + r)) {
          // the bar swats: a figure is knocked aside (and back), one in three goes flying for good
          const sgn = Math.sign(ob.speed ?? 1), kx = -sa * sgn, kz = ca * sgn;
          ob.hits++;
          if (this.rand() < 0.25) { this.emit({ t: 'fling', x, z, team: P === this.blue ? 0 : 1, vx: kx * 8, vz: kz * 8 }); return 1; }
          P.x[i] += kx * 1.3; P.z[i] -= dir * 0.4; P.vx[i] = kx * 8;
          this.emit({ t: 'swat', x, z });
        }
      } else if (ob.type === 'saw') {
        const rr = (ob.r || 1.1) + r, dx = x - ob.cx, dz = z - ob.cz;
        if (dx * dx + dz * dz < rr * rr) { this.emit({ t: 'saw', x, z, team: P === this.blue ? 0 : 1 }); ob.hits++; return 1; }
      }
    }
    return 0;
  }

  moveBlue(dt) {
    const B = this.blue, b = this.base, L = this.L, lim = this.W / 2 - 0.3, spd = this.spdB, t = this.t;
    const damp = Math.exp(-4 * dt);
    for (let i = 0; i < B.n; i++) {
      if (B.h[i] <= 0) continue;
      B.age[i] += dt;
      const u = B.u[i], r = 0.3 * unitScale(u), z0 = B.z[i];
      const air = B.air[i] > 0; if (air) B.air[i] = Math.max(0, B.air[i] - dt);
      B.z[i] += spd * (u > 8 ? 0.85 : 1) * (air ? 1.15 : 1) * dt;
      B.vx[i] *= damp;
      B.x[i] += B.vx[i] * dt + Math.sin(t * 3 + B.ph[i] * 6.28) * 0.22 * dt;
      // funnel into the base front
      if (B.z[i] > L - 11) { const tx = clamp(B.x[i], -b.w / 2 + 0.7, b.w / 2 - 0.7); B.x[i] += (tx - B.x[i]) * Math.min(1, dt * 2.2); }
      B.x[i] = clamp(B.x[i], -lim, lim);
      // gates crossed this step (each gate counts once per figure: clones inherit the mark)
      const z1 = B.z[i];
      for (const g of this.gates) {
        if (g.broken || (B.mask[i] & g.bit) || z0 >= g.z || z1 < g.z || Math.abs(B.x[i] - g.cx) > g.w / 2) continue;
        B.mask[i] |= g.bit;
        this.passGate(g, i);
        if (B.h[i] <= 0) break;
      }
      if (B.h[i] <= 0) continue;
      if (!air && this.obstacle(B, i, r, 1)) { this.stats.lost += B.u[i]; this.fallen += B.u[i]; this.comboLoss += B.u[i]; B.h[i] = 0; continue; }
      // towers soak the crowd up
      for (const tw of this.towers) {
        if (air) break;
        if (tw.dead) continue;
        const dx = B.x[i] - tw.x, dz = B.z[i] - tw.z, rr = tw.r + r;
        if (dx * dx + dz * dz < rr * rr) { this.hitTower(tw, B.u[i]); B.h[i] = 0; break; }
      }
      if (B.h[i] <= 0) continue;
      if (B.z[i] >= L - r && Math.abs(B.x[i]) < b.w / 2 + 0.4) {
        this.hitBase(B.u[i], B.x[i]);
        B.h[i] = 0;
      }
    }
  }
  passGate(g, i) {
    const B = this.blue, u = B.u[i];
    if (g.type === 'rec') { g.take = Math.floor(Math.min(this.fallen, g.value)); this.fallen -= g.take; this.stats.recycled += g.take; }
    const nu = Math.max(0, Math.floor(gateApply(g, u)));
    g.flash = 1; this.stats.gates++;
    if (nu === u) return;
    if (nu < u) {
      B.h[i] = nu * this.hpB; B.u[i] = nu;
      this.fallen += u - nu; this.comboLoss += u - nu;
      if (nu <= 0) { this.emit({ t: 'eaten', x: B.x[i], z: B.z[i], g: g.i }); this.stats.lost += u; }
      else this.emit({ t: 'minus', x: B.x[i], z: g.z, n: u - nu, g: g.i });
      g.passed -= u - nu;
      return;
    }
    let extra = nu - u; g.passed += extra; this.stats.cloned += extra; this.comboGain += extra;
    const room = B.cap - B.n, c = Math.min(extra, room, 14);
    if (c <= 0) { B.h[i] = nu * this.hpB; B.u[i] = nu; return; }
    const per = Math.floor(extra / c); let rem = extra - per * c;
    const lim = this.W / 2 - 0.3;
    for (let k = 0; k < c; k++) {
      const n = per + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
      const j = B.add(clamp(B.x[i] + (this.rand() - 0.5) * 1.5, -lim, lim), B.z[i] + this.rand() * 0.7, n * this.hpB, B.mask[i], this.rand());
      if (j >= 0) { B.u[j] = n; B.vx[j] = (this.rand() - 0.5) * 3; B.air[j] = B.air[i]; }
      // split: the clones go to one lane, the original to the other
      if (j >= 0 && g.type === 'split') B.vx[j] = clamp((clamp(g.cx + g.to, -lim, lim) - B.x[j]) * 4, -24, 24);
    }
    if (g.type === 'split') B.vx[i] = clamp((clamp(g.cx - g.to, -lim, lim) - B.x[i]) * 4, -24, 24);
    this.emit({ t: 'clone', x: B.x[i], z: g.z, n: extra, g: g.i, v: g.type === 'mul' || g.type === 'split' ? g.value : 0, u });
  }
  hitTower(tw, units) {
    tw.hp -= units; tw.hit = 1;
    this.charge += units * 0.05;
    if (tw.hp <= 0 && !tw.dead) { tw.dead = true; this.stats.towers++; this.charge += 6; this.emit({ t: 'tower', x: tw.x, z: tw.z }); }
  }
  hitBase(units, x, champ = false) {
    const b = this.base;
    let d = units;
    if (b.shieldT > 0) { d *= champ ? 0.5 : 0.15; this.emit({ t: 'shield', x }); }
    b.hp -= d; this.stats.baseDmg += d;
    if (!champ) this.charge += units * 0.12;
    this.emit({ t: 'hit', x, n: d, champ });
    this.hooks.onBaseHit?.(this, d);
  }

  moveRed(dt) {
    const R = this.red, c = this.cannon, lim = this.W / 2 - 0.3;
    for (let i = 0; i < R.n; i++) {
      if (R.h[i] <= 0) continue;
      R.age[i] += dt;
      const u = R.u[i], kind = R.kind[i], brute = kind > 0, r = redR(R, i);
      R.z[i] -= this.spdR * (kind === 2 ? 0.4 : brute ? 0.5 : 1) * dt;
      R.vx[i] *= Math.exp(-4 * dt);
      R.x[i] += R.vx[i] * dt + Math.sin(this.t * 2.6 + R.ph[i] * 6.28) * 0.2 * dt;
      if (R.z[i] < 16) R.x[i] += clamp(c.x - R.x[i], -1, 1) * 1.6 * dt;
      R.x[i] = clamp(R.x[i], -lim, lim);
      if (!brute && this.obstacle(R, i, r, -1)) { R.h[i] = 0; continue; }
      if (R.z[i] <= CANNON_Z + 0.3) {
        c.hp -= Math.min(u, kind === 2 ? 15 : 8); R.h[i] = 0;
        this.emit({ t: 'hurt', x: R.x[i], n: u });
      }
    }
  }

  // the blue stream fans out into a crowd: neighbours in the same cell nudge each other sideways
  // (x only, so the forward flow and the gate maths are untouched). Cheap: one counting sort.
  spread(dt) {
    const B = this.blue, n = B.n; if (n < 2) return;
    const cs = 0.7, x0 = -this.W / 2 - 1, cols = Math.ceil((this.W + 2) / cs), rows = Math.ceil((this.L + 10) / cs), nc = cols * rows;
    if (!this._sp || this._sp.nc !== nc || this._sp.cap !== B.cap) this._sp = { nc, cap: B.cap, st: new Int32Array(nc + 1), fill: new Int32Array(nc + 1), cell: new Int32Array(B.cap), idx: new Int32Array(B.cap) };
    const S = this._sp; S.st.fill(0);
    for (let i = 0; i < n; i++) { const c = clamp(((B.x[i] - x0) / cs) | 0, 0, cols - 1) + clamp(((B.z[i] + 2) / cs) | 0, 0, rows - 1) * cols; S.cell[i] = c; S.st[c + 1]++; }
    for (let k = 0; k < nc; k++) S.st[k + 1] += S.st[k];
    S.fill.set(S.st); for (let i = 0; i < n; i++) S.idx[S.fill[S.cell[i]]++] = i;
    const lim = this.W / 2 - 0.3, k = Math.min(1, dt * 9);
    for (let c = 0; c < nc; c++) {
      const a = S.st[c], b = S.st[c + 1]; if (b - a < 2) continue;
      for (let p = a; p < b; p++) for (let q = p + 1; q < Math.min(b, p + 8); q++) {
        const i = S.idx[p], j = S.idx[q], dx = B.x[j] - B.x[i], dz = B.z[j] - B.z[i], r = 0.26 * (unitScale(B.u[i]) + unitScale(B.u[j]));
        const d2 = dx * dx + dz * dz; if (d2 >= r * r) continue;
        const push = (r - Math.sqrt(d2)) * 0.5 * k * (dx === 0 ? (B.ph[i] > B.ph[j] ? 1 : -1) : Math.sign(dx));
        B.x[i] = clamp(B.x[i] - push, -lim, lim); B.x[j] = clamp(B.x[j] + push, -lim, lim);
      }
    }
  }
  buildGrid() {
    const R = this.red, cs = this.cs, cols = this.gcols, rows = this.grows, nc = cols * rows, st = this.cellStart;
    st.fill(0);
    const cell = this._cell || (this._cell = new Int32Array(R.cap));
    for (let i = 0; i < R.n; i++) {
      const cx = clamp(((R.x[i] - this.gx0) / cs) | 0, 0, cols - 1), cz = clamp(((R.z[i] - this.gz0) / cs) | 0, 0, rows - 1);
      const k = cz * cols + cx; cell[i] = k; st[k + 1]++;
    }
    for (let k = 0; k < nc; k++) st[k + 1] += st[k];
    const fill = this._fill || (this._fill = new Int32Array(nc + 1)); fill.set(st);
    for (let i = 0; i < R.n; i++) this.cellIdx[fill[cell[i]]++] = i;
  }
  // visit reds near (x, z) within `reach` cells
  nearRed(x, z, reach, fn) {
    const cs = this.cs, cols = this.gcols, rows = this.grows, st = this.cellStart, idx = this.cellIdx;
    const cx = ((x - this.gx0) / cs) | 0, cz = ((z - this.gz0) / cs) | 0;
    for (let a = Math.max(0, cz - reach); a <= Math.min(rows - 1, cz + reach); a++) {
      for (let b = Math.max(0, cx - reach); b <= Math.min(cols - 1, cx + reach); b++) {
        const k = a * cols + b;
        for (let p = st[k]; p < st[k + 1]; p++) if (fn(idx[p]) === false) return;
      }
    }
  }
  // blue meets red: both lose the same hit points (1:1 for equal strength)
  clash() {
    const B = this.blue, R = this.red;
    if (!R.n) return;
    this.giantsOn = false; for (let j = 0; j < R.n; j++) if (R.kind[j] === 2) { this.giantsOn = true; break; }
    for (let i = 0; i < B.n; i++) {
      if (B.h[i] <= 0 || B.air[i] > 0.15) continue; // a jumping crowd sails over the reds
      const rb = 0.3 * unitScale(B.u[i]), x = B.x[i], z = B.z[i];
      this.nearRed(x, z, this.giantsOn ? 2 : 1, (j) => {
        if (R.h[j] <= 0) return;
        const rr = redR(R, j), dx = R.x[j] - x, dz = R.z[j] - z, s = rb + rr;
        if (dx * dx + dz * dz > s * s) return;
        const m = Math.min(B.h[i], R.h[j]);
        B.h[i] -= m; R.h[j] -= m;
        this.stats.kills += m / this.hpR; this.charge += (m / this.hpR) * 0.1;
        if (R.h[j] <= 1e-6) { if (R.kind[j] === 2) this.emit({ t: 'giantDown', x: R.x[j], z: R.z[j] }); else if (R.z[j] < CANNON_Z + 3.2) this.emit({ t: 'save', x: R.x[j], z: R.z[j] }); }
        if (this.clashN++ < 24) this.emit({ t: 'clash', x: (x + R.x[j]) / 2, z: (z + R.z[j]) / 2 });
        if (B.h[i] <= 1e-6) return false;
      });
    }
  }

  moveChamps(dt) {
    const b = this.base, R = this.red, L = this.L;
    for (const ch of this.champs) {
      if (!ch.alive) continue;
      ch.age += dt; ch.hit = Math.max(0, ch.hit - dt * 4);
      const st = ch.st, jumper = ch.id === 'grillo';
      let spd = st.spd;
      // obstacles: the jumper sails over them; the others wade through pits and take blade hits
      if (!jumper) {
        for (const ob of this.obs) {
          const dx = ch.x - ob.cx, dz = ch.z - ob.cz;
          if (ob.type === 'wall' || ob.type === 'barrier') {
            const hw = ob.w / 2 + st.r, hd = ob.d / 2 + st.r;
            if (Math.abs(dx) < hw && Math.abs(dz) < hd) { if (hd - Math.abs(dz) < hw - Math.abs(dx) && dz < 0) { ch.z = ob.cz - hd; ch.x += (dx >= 0 ? 1 : -1) * 4 * dt; } else ch.x = ob.cx + (dx >= 0 ? hw : -hw); }
          } else if (ob.type === 'pit') {
            if (Math.abs(dx) < ob.w / 2 && Math.abs(dz) < ob.d / 2) { spd *= 0.5; ch.hp -= 10 * dt; }
          } else if (ob.type === 'spin') {
            const ca = Math.cos(ob.ang), sa = Math.sin(ob.ang), len = ob.len || 3.5, along = clamp(dx * ca + dz * sa, -len, len), qx = dx - along * ca, qz = dz - along * sa;
            if (qx * qx + qz * qz < (st.r + 0.3) ** 2) { ch.hp -= 18 * dt; ch.hit = 1; }
          } else if (ob.type === 'saw') {
            if (dx * dx + dz * dz < (st.r + (ob.r || 1.1)) ** 2) { ch.hp -= 18 * dt; ch.hit = 1; }
          }
        }
      }
      const z0 = ch.z;
      ch.z += spd * dt;
      if (ch.z > L - 12) ch.x += (clamp(ch.x, -b.w / 2 + 1, b.w / 2 - 1) - ch.x) * Math.min(1, dt * 2);
      ch.x = clamp(ch.x, -this.W / 2 + st.r, this.W / 2 - st.r);
      if (jumper) { // hop cycle; each landing is a shockwave
        const ph0 = ch.hop; ch.hop += dt / 0.72; ch.air = Math.sin((ch.hop % 1) * Math.PI) * 1.9;
        if (Math.floor(ch.hop) !== Math.floor(ph0)) this.slam(ch, st.slam);
      }
      // gates: the splitter multiplies too
      if (ch.id === 'matrioska') for (const g of this.gates) {
        if (g.broken || (ch.mask & g.bit) || z0 >= g.z || ch.z < g.z || Math.abs(ch.x - g.cx) > g.w / 2 + 0.5) continue;
        ch.mask |= g.bit; const before = ch.split; ch.split = Math.max(1, Math.min(400, Math.floor(gateApply(g, ch.split)))); g.flash = 1;
        this.emit({ t: 'clone', x: ch.x, z: g.z, n: ch.split - before, g: g.i, champ: true });
      }
      // plough through reds (on the ground)
      if (ch.air < 0.6) {
        const reach = ch.id === 'testuggine' ? st.aura : st.r + 0.3, cost = ch.id === 'colosso' ? 0.35 : ch.id === 'testuggine' ? 0.8 : 0.6;
        this.nearRed(ch.x, ch.z, Math.ceil(reach / this.cs) + 1, (j) => {
          if (R.h[j] <= 0) return;
          const dx = R.x[j] - ch.x, dz = R.z[j] - ch.z, rr = reach + redR(R, j);
          if (dx * dx + dz * dz > rr * rr) return;
          // a giant is worn down, not flattened in one go
          if (R.kind[j] === 2) { const m = Math.min(R.h[j], 40 * this.hpR * dt); R.h[j] -= m; ch.hp -= (m / this.hpR) * cost; ch.hit = 1; this.stats.kills += m / this.hpR; if (R.h[j] <= 1e-6) this.emit({ t: 'giantDown', x: R.x[j], z: R.z[j] }); return; }
          const u = R.h[j] / this.hpR; R.h[j] = 0; ch.hp -= u * cost; ch.hit = 1;
          this.stats.kills += u; this.charge += u * 0.04;
          if (this.clashN++ < 40) this.emit({ t: 'squash', x: R.x[j], z: R.z[j] });
          if (ch.hp <= 0) return false;
        });
      }
      // towers in the way take a big hit once
      for (const tw of this.towers) {
        if (tw.dead || ch.towers.has(tw)) continue;
        if ((ch.x - tw.x) ** 2 + (ch.z - tw.z) ** 2 < (tw.r + st.r) ** 2) { ch.towers.add(tw); this.hitTower(tw, st.dmg); ch.hp -= 8; this.emit({ t: 'champTower', x: tw.x, z: tw.z }); }
      }
      if (ch.hp <= 0) { this.champDown(ch, false); continue; }
      if (ch.z >= L - st.r * 0.6) this.champDown(ch, true);
    }
    this.champs = this.champs.filter((c) => c.alive || c.fade > 0);
    for (const c of this.champs) if (!c.alive) c.fade -= dt;
  }
  slam(ch, rad) {
    const R = this.red;
    let n = 0;
    this.nearRed(ch.x, ch.z, Math.ceil(rad / this.cs) + 1, (j) => {
      if (R.h[j] <= 0) return;
      const dx = R.x[j] - ch.x, dz = R.z[j] - ch.z;
      if (dx * dx + dz * dz > rad * rad) return;
      const u = Math.min(R.h[j], R.kind[j] === 2 ? 12 * this.hpR : Infinity) / this.hpR; R.h[j] -= u * this.hpR; n += u; ch.hp -= u * 0.15;
      if (R.kind[j] === 2 && R.h[j] <= 1e-6) this.emit({ t: 'giantDown', x: R.x[j], z: R.z[j] });
    });
    this.stats.kills += n; this.charge += n * 0.04;
    this.emit({ t: 'slam', x: ch.x, z: ch.z, r: rad, n });
  }
  champDown(ch, atBase) {
    ch.alive = false; ch.fade = 0.6;
    if (atBase) {
      this.hitBase(ch.st.dmg, ch.x, true); this.stats.champDmg += ch.st.dmg;
      this.emit({ t: 'champHit', x: ch.x, z: ch.z, id: ch.id, n: ch.st.dmg });
    } else this.emit({ t: 'champDown', x: ch.x, z: ch.z, id: ch.id });
    if (ch.id === 'matrioska') this.burst(ch.x, Math.min(ch.z, this.L - 1.2), ch.split);
  }
  // the splitter opens up: `n` units of blue right where she stands, already past every gate
  burst(x, z, n) {
    const B = this.blue, c = Math.min(n, B.cap - B.n, 40), all = 0xffffffff >>> 0, lim = this.W / 2 - 0.3;
    if (c <= 0) return;
    const per = Math.floor(n / c); let rem = n - per * c;
    for (let k = 0; k < c; k++) {
      const u = per + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
      const a = (k / c) * Math.PI * 2, rr = 0.5 + this.rand() * 1.4;
      const j = B.add(clamp(x + Math.cos(a) * rr, -lim, lim), z + Math.sin(a) * rr * 0.5, u * this.hpB, all, this.rand());
      if (j >= 0) { B.u[j] = u; B.vx[j] = Math.cos(a) * 3; }
    }
    this.emit({ t: 'burst', x, z, n });
  }
}

// ---------- autopilot: picks the lane that multiplies the crowd the most. Used by the tests, the
// balance tool and the cover renderer; plays like a decent (not perfect) human.
export function autopilot(sim, o = {}) {
  const W = sim.W, step = 0.5;
  let best = 0, bestS = -1e9;
  // everything on the lane, nearest first: a lane is followed through lane switches, jump pads and
  // split gates (both halves are followed)
  const items = sim._apItems || (sim._apItems = [...sim.gates.map((g) => ({ g, z: g.z })), ...sim.obs.map((ob) => ({ ob, z: ob.z }))].sort((a, b) => a.z - b.z));
  const jumpLen = sim.spdB * 1.15, lim = W / 2 - 0.3;
  // u: crowd value of the lane so far · k: share of the stream that survives the traps so far
  const lane = (x, from, u, k, airTo) => {
    for (let n = from; n < items.length; n++) {
      const g = items[n].g;
      if (g) {
        // where the gate will be (and what it will say) when a shot fired now gets there
        const ta = sim.t + (g.z - CANNON_Z) / sim.spdB;
        const cx = g.move ? g.x0 + (g.move.amp || 3) * Math.sin(ta * (g.move.speed || 0.5) * Math.PI * 2 + (g.move.phase || 0)) : g.cx;
        if (g.broken || Math.abs(x - cx) > g.w / 2 - 0.3) continue;
        const G = g.toggle && Math.floor(ta / (g.toggle.every || 3)) % 2 ? g.toggle : g.toggle ? g.base : g, type = G.type, value = G.value;
        if (type === 'split') { u *= value; return (lane(clamp(cx - g.to, -lim, lim), n + 1, u, k, airTo) + lane(clamp(cx + g.to, -lim, lim), n + 1, u, k, airTo)) / 2; }
        if (type === 'mul') u *= value; else if (type === 'add') u += value * 10 * k; else if (type === 'rec') u += (Math.min(g.avail || 0, value) * 2 + 5) * k;
        else if (type === 'sub') u = Math.max(0, u - Math.min(g.toggle ? value : g.left, 25)); else u = u / value;
        continue;
      }
      const ob = items[n].ob;
      if (ob.type === 'jump' || ob.type === 'push') {
        if (Math.abs(x - ob.cx) < ob.w / 2) { if (ob.type === 'jump') airTo = ob.z + jumpLen * (ob.air ?? 1); else x = ob.to; }
        continue;
      }
      if (ob.z < airTo) continue;
      const span = ob.type === 'spin' ? (ob.len || 3.5) : ob.type === 'saw' ? (ob.r || 1.1) + Math.abs(ob.amp ?? 3) : ob.type === 'barrier' ? ob.w / 2 + Math.abs(ob.amp ?? 3) * 0.5 : ob.w / 2;
      const c = ob.type === 'saw' || ob.type === 'barrier' ? ob.x : ob.cx;
      const dx = Math.abs(x - c);
      const f = ob.type === 'pit' ? (dx < span + 0.4 ? 0.02 : 1) : ob.type === 'spin' ? (dx < 0.7 ? 0.3 : dx < span + 0.3 ? 0.75 : 1) : dx < span + 0.3 ? (ob.type === 'wall' ? 0.85 : ob.type === 'barrier' ? 0.8 : 0.45) : 1;
      u *= f; k *= f;
    }
    for (const tw of sim.towers) if (!tw.dead && Math.abs(x - tw.x) < 1.6) u *= 0.9;
    return u;
  };
  for (let x0 = -W / 2 + 1; x0 <= W / 2 - 1 + 1e-6; x0 += step) {
    const s = lane(x0, 0, 10, 1, -1) - Math.abs(x0 - sim.cannon.x) * 0.02 - Math.abs(x0) * 0.01;
    if (s > bestS) { bestS = s; best = x0; }
  }
  // defend: a red mob close to the cannon draws the aim
  if (o.defend !== false) {
    const R = sim.red; let sx = 0, n = 0;
    for (let i = 0; i < R.n; i++) if (R.z[i] < 11) { sx += R.x[i] * R.u[i]; n += R.u[i]; }
    // only when the stream in front of the cannon can't soak them up anyway
    let nb = 0; const B = sim.blue; for (let i = 0; i < B.n; i++) if (B.z[i] < 11) nb += B.u[i];
    if (n > 2 && n > nb * 0.5) best = sx / n;
  }
  return { x: best, fire: true, champ: sim.ready() && (o.champ !== false) };
}
