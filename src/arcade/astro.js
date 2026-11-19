// Astro Baso — vertical space shooter simulation (pure logic, deterministic for a seed).
// Field: W x H units, y grows upwards, the ships live near the bottom. 3 sectors x 8 waves + a boss each.
// Inputs (per ship, written by the host): { ax, ay } analog -1..1, { mx, my } direct displacement in field
// units (touch drag), bomb (edge flag, consumed), fire (true = autofire on).
import { rng, clamp, hitCC } from './rng.js';

export const W = 90, H = 160;
export const SECTORS = [
  { name: 'Nebulosa Fragola', boss: 'granchio', bossName: 'Granchio Quasar', tint: '#ff4f8b' },
  { name: 'Cintura di Ghiaccio', boss: 'medusa', bossName: 'Medusa Ionica', tint: '#36e0ff' },
  { name: 'Abisso Violetto', boss: 'occhio', bossName: 'Occhio del Vuoto', tint: '#a65bff' },
];
export const WAVES_PER_SECTOR = 8;
export const ITEMS = {
  P: { name: 'Arma +1', color: '#ff4fd8' },
  S: { name: 'Scudo', color: '#36e0ff' },
  B: { name: 'Bomba +1', color: '#ffb21f' },
  L: { name: 'Raggio', color: '#7dff5a' },
  M: { name: 'Magnete', color: '#ffe14d' },
};
const ENEMY = {
  dardo: { hp: 1, r: 3, score: 100, drop: 0.04 },
  ondina: { hp: 2, r: 3.2, score: 150, drop: 0.05 },
  corazza: { hp: 9, r: 5.5, score: 600, drop: 0.45 },
  girandola: { hp: 5, r: 4.2, score: 400, drop: 0.25 },
  cometa: { hp: 1, r: 2.6, score: 120, drop: 0.03 },
  mina: { hp: 2, r: 3, score: 200, drop: 0.06 },
};
const BOSS = {
  granchio: { hp: 520, r: 11, score: 20000 },
  medusa: { hp: 760, r: 10, score: 35000 },
  occhio: { hp: 1050, r: 10, score: 50000 },
};

export class AstroSim {
  constructor(o = {}) {
    this.o = { seed: 1, players: 1, lives: 3, bombs: 2, weapon: 0, aggro: 1, scoreMul: 1, sector: 0, god: false, ...o };
    this.r = rng(this.o.seed);
    this.W = W; this.H = H; this.time = 0;
    this.ships = [];
    for (let i = 0; i < this.o.players; i++) this.ships.push(this.newShip(i));
    this.bullets = []; this.ebullets = []; this.enemies = []; this.items = []; this.gems = []; this.events = [];
    this.score = 0; this.chain = 0; this.chainT = 0; this.mult = 1; this.maxMult = 1; this.kills = 0; this.bossKills = 0;
    this.sector = this.o.sector; this.wave = 0; this.queue = []; this.waveT = 1.5; this.state = 'waves'; this.stateT = 0;
    this.boss = null; this.over = false; this.result = null; this.win = false; this.columns = [];
    this.uid = 1;
  }
  newShip(i) {
    return { i, x: W / 2 + (this.o.players > 1 ? (i ? 14 : -14) : 0), y: 18, r: 1.5, hr: 4, alive: true, lives: this.o.lives, inv: 2, weapon: this.o.weapon, shield: 0, laser: 0, magnet: 0, bombs: this.o.bombs, fireT: 0, respawn: 0, tilt: 0,
      input: { ax: 0, ay: 0, mx: 0, my: 0, bomb: false, fire: true }, auto: false };
  }
  ev(k, x, y, extra) { this.events.push({ k, x, y, ...extra }); }
  get aggro() { return this.o.aggro * (1 + this.sector * 0.28 + this.wave * 0.03); }

  // ---------- waves
  buildWave() {
    const r = this.r, s = this.sector, n = this.wave, out = [];
    const T = ['fila', 'v', 'serpente', 'comete', 'corazze', 'girandole', 'mine', 'fila2'];
    const pool = n < 2 ? ['fila', 'v', 'serpente'] : n < 5 ? T.slice(0, 6) : T;
    const kinds = [r.pick(pool)];
    if (n >= 3 || s > 0) kinds.push(r.pick(pool));
    if (s >= 1 && n >= 5) kinds.push(r.pick(['comete', 'corazze', 'girandole', 'mine']));
    let t0 = 0;
    for (const k of kinds) {
      const side = r() < 0.5 ? -1 : 1;
      if (k === 'fila' || k === 'fila2') {
        const cnt = 5 + Math.min(4, s + (n >> 2)), x0 = r.range(18, W - 18);
        for (let i = 0; i < cnt; i++) out.push({ t: t0 + i * 0.32, type: 'dardo', x: x0, y: H + 6, p: { vy: -32 - s * 4, turnY: r.range(50, 90), side: k === 'fila2' ? -side : side } });
      } else if (k === 'v') {
        const cnt = 7, cx = r.range(25, W - 25);
        for (let i = 0; i < cnt; i++) { const o = i - 3; out.push({ t: t0 + Math.abs(o) * 0.25, type: 'ondina', x: cx + o * 7, y: H + 6, p: { vy: -20 - s * 3, amp: 6, w: 2.2, ph: o } }); }
      } else if (k === 'serpente') {
        const cnt = 8, y0 = r.range(100, 135);
        for (let i = 0; i < cnt; i++) out.push({ t: t0 + i * 0.22, type: 'dardo', x: side < 0 ? -6 : W + 6, y: y0, p: { snake: -side, vx: 34 * -side, amp: 14, w: 2.4 } });
      } else if (k === 'comete') {
        for (let i = 0; i < 4 + s; i++) out.push({ t: t0 + i * 0.5, type: 'cometa', x: r.range(8, W - 8), y: H + 6, p: {} });
      } else if (k === 'corazze') {
        const cnt = 2 + (s > 1 ? 1 : 0);
        for (let i = 0; i < cnt; i++) out.push({ t: t0 + i * 0.8, type: 'corazza', x: (W / (cnt + 1)) * (i + 1), y: H + 8, p: { stopY: r.range(108, 128) } });
      } else if (k === 'girandole') {
        for (let i = 0; i < 2; i++) out.push({ t: t0 + i * 1.1, type: 'girandola', x: i ? W * 0.7 : W * 0.3, y: H + 6, p: { stopY: r.range(95, 120) } });
      } else if (k === 'mine') {
        for (let i = 0; i < 5 + s; i++) out.push({ t: t0 + i * 0.4, type: 'mina', x: r.range(10, W - 10), y: H + 5, p: {} });
      }
      t0 += 2.2 + r() * 1.2;
    }
    return out.sort((a, b) => a.t - b.t);
  }
  spawn(sp) {
    const d = ENEMY[sp.type], hpK = 1 + this.sector * 0.5;
    const e = { id: this.uid++, type: sp.type, x: sp.x, y: sp.y, x0: sp.x, y0: sp.y, vx: 0, vy: 0, hp: Math.ceil(d.hp * hpK), r: d.r, score: d.score, drop: d.drop, t: 0, p: sp.p, fireT: 0.8 + this.r() * 1.5, flash: 0, rot: 0 };
    e.max = e.hp;
    this.enemies.push(e);
    return e;
  }
  spawnBoss() {
    const kind = SECTORS[this.sector].boss, d = BOSS[kind];
    this.boss = { kind, x: W / 2, y: H + 25, r: d.r, hp: d.hp * this.o.players ** 0.5, max: d.hp * this.o.players ** 0.5, score: d.score, t: 0, phase: 0, fireT: 2, patT: 0, pat: 0, flash: 0, orbs: kind === 'occhio' ? [0, 1, 2, 3, 4, 5].map((i) => ({ a: (i / 6) * Math.PI * 2, hp: 30, alive: true })) : null, enter: true };
    this.ev('boss', W / 2, H, { name: SECTORS[this.sector].bossName });
  }

  // ---------- frame
  step(dt) {
    if (this.over) return;
    this.time += dt;
    const sub = dt > 1 / 60 ? Math.ceil(dt * 60) : 1, h = dt / sub;
    for (let i = 0; i < sub && !this.over; i++) this.tick(h);
  }
  tick(dt) {
    this.flow(dt);
    for (const s of this.ships) this.moveShip(s, dt);
    this.moveEnemies(dt);
    if (this.boss) this.moveBoss(dt);
    this.moveBullets(dt);
    this.collide();
    this.chainT -= dt; if (this.chainT <= 0 && this.chain) { this.chain = 0; this.mult = 1; }
    for (let i = this.columns.length - 1; i >= 0; i--) { const c = this.columns[i]; c.t += dt; if (c.t > c.warn + c.dur) this.columns.splice(i, 1); }
    if (this.ships.every((s) => !s.alive && s.lives <= 0)) this.finish(false);
  }
  flow(dt) {
    this.stateT += dt;
    if (this.state === 'waves') {
      if (!this.queue.length && this.waveT > 0) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          if (this.wave >= WAVES_PER_SECTOR) { this.state = 'warn'; this.stateT = 0; this.ev('warning', W / 2, H / 2); return; }
          this.queue = this.buildWave(); this.qt = 0; this.wave++; this.ev('wave', W / 2, H / 2, { n: this.wave });
        }
        return;
      }
      this.qt += dt;
      while (this.queue.length && this.queue[0].t <= this.qt) this.spawn(this.queue.shift());
      if (!this.queue.length && !this.enemies.length) this.waveT = 1.1;
    } else if (this.state === 'warn') {
      if (this.stateT > 2.4 && !this.enemies.length) { this.state = 'boss'; this.stateT = 0; this.spawnBoss(); }
    } else if (this.state === 'boss') {
      if (!this.boss) { this.state = 'clear'; this.stateT = 0; }
    } else if (this.state === 'clear') {
      for (const g of this.gems) g.mag = true;
      if (this.stateT > 3.2) {
        if (this.sector >= SECTORS.length - 1) { this.win = true; this.finish(true); return; }
        this.sector++; this.wave = 0; this.waveT = 1; this.state = 'waves'; this.stateT = 0; this.ev('sector', W / 2, H / 2, { n: this.sector });
      }
    }
  }
  moveShip(s, dt) {
    if (!s.alive) {
      if (s.lives > 0) { s.respawn -= dt; if (s.respawn <= 0) { s.alive = true; s.inv = 2.5; s.x = W / 2; s.y = 18; s.weapon = Math.max(0, s.weapon - 1); this.ev('respawn', s.x, s.y, { p: s.i }); } }
      return;
    }
    const I = s.input;
    if (s.auto) this.autopilot(s);
    const sp = 72;
    const vx = clamp(I.ax, -1, 1) * sp, vy = clamp(I.ay, -1, 1) * sp;
    s.x += vx * dt + I.mx; s.y += vy * dt + I.my; I.mx = 0; I.my = 0;
    s.tilt += (clamp(vx / sp, -1, 1) - s.tilt) * Math.min(1, dt * 10);
    s.x = clamp(s.x, 4, W - 4); s.y = clamp(s.y, 6, H * 0.62);
    s.inv = Math.max(0, s.inv - dt); s.laser = Math.max(0, s.laser - dt); s.magnet = Math.max(0, s.magnet - dt); s.shield = Math.max(0, s.shield - dt);
    if (I.bomb) { I.bomb = false; this.bomb(s); }
    s.fireT -= dt;
    if (I.fire !== false && s.fireT <= 0 && !s.laser) { s.fireT = 0.1; this.fire(s); }
    if (s.laser) this.laserHit(s, dt);
  }
  fire(s) {
    const B = (x, vx, dmg = 1) => this.bullets.push({ x: s.x + x, y: s.y + 4, vx, vy: 150, r: 1.3, dmg, p: s.i });
    const w = s.weapon;
    if (w === 0) B(0, 0, 1.2);
    else if (w === 1) { B(-1.6, 0); B(1.6, 0); }
    else if (w === 2) { B(-1.6, 0); B(1.6, 0); B(-2.5, -26, 0.8); B(2.5, 26, 0.8); }
    else if (w === 3) { B(0, 0); B(-2.4, 0); B(2.4, 0); B(-2.5, -30, 0.8); B(2.5, 30, 0.8); }
    else { B(0, 0, 1.2); B(-2.4, 0); B(2.4, 0); B(-2.5, -24, 0.8); B(2.5, 24, 0.8); B(-3, -55, 0.7); B(3, 55, 0.7); }
    this.ev('shot', s.x, s.y, { p: s.i, w });
  }
  laserHit(s, dt) {
    const dps = 26 + s.weapon * 6;
    for (const e of this.enemies) if (Math.abs(e.x - s.x) < e.r + 2.2 && e.y > s.y) this.damage(e, dps * dt);
    const b = this.boss;
    if (b && !b.enter && Math.abs(b.x - s.x) < b.r + 2.2 && b.y > s.y) this.damageBoss(dps * dt * 0.8, b.x, b.y - b.r);
  }
  bomb(s) {
    if (s.bombs <= 0 || !s.alive) return;
    s.bombs--; s.inv = Math.max(s.inv, 1.6);
    for (const b of this.ebullets) this.gemAt(b.x, b.y, 10, true);
    this.ebullets.length = 0;
    for (const e of [...this.enemies]) this.damage(e, 40);
    if (this.boss && !this.boss.enter) this.damageBoss(this.boss.max * 0.07, this.boss.x, this.boss.y);
    this.columns.length = 0;
    this.ev('bomb', s.x, s.y, { p: s.i });
  }
  gemAt(x, y, v, mag = false) { if (this.gems.length < 260) this.gems.push({ x, y, vx: (this.r() - 0.5) * 20, vy: 10 + this.r() * 14, v, mag, t: 0 }); }

  moveEnemies(dt) {
    const ag = this.aggro;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]; e.t += dt; e.flash = Math.max(0, e.flash - dt); e.rot += dt * 3;
      const p = e.p;
      switch (e.type) {
        case 'dardo':
          if (p.snake) { e.x += p.vx * dt; e.y = e.y0 + Math.sin(e.t * p.w) * p.amp - e.t * 4; }
          else { e.y += p.vy * dt; if (e.y < p.turnY) { e.vx += p.side * 60 * dt; e.x += e.vx * dt; } }
          break;
        case 'ondina': e.y += p.vy * dt; e.x = e.x0 + Math.sin(e.t * p.w + p.ph) * p.amp; break;
        case 'cometa': {
          const tg = this.nearShip(e.x, e.y);
          if (e.t < 0.9) e.y -= 30 * dt;
          else { if (!e.locked) { e.locked = true; const dx = (tg ? tg.x : W / 2) - e.x, dy = (tg ? tg.y : 0) - e.y, l = Math.hypot(dx, dy) || 1; e.vx = (dx / l) * 75 * Math.min(1.4, ag); e.vy = (dy / l) * 75 * Math.min(1.4, ag); this.ev('dash', e.x, e.y); } e.x += e.vx * dt; e.y += e.vy * dt; }
          break;
        }
        case 'corazza':
          if (e.y > p.stopY) e.y -= 22 * dt; else { e.x = e.x0 + Math.sin(e.t * 0.7) * 14; if (e.t > 14) e.y += 30 * dt; }
          e.fireT -= dt * ag;
          if (e.fireT <= 0 && e.y < H - 4) { e.fireT = 1.6; this.aimed(e, 3, 0.22, 40); }
          break;
        case 'girandola':
          if (e.y > p.stopY && e.t < 9) e.y -= 30 * dt; else if (e.t > 9) e.y += 40 * dt;
          e.fireT -= dt * ag;
          if (e.fireT <= 0 && e.t < 9 && e.y < H - 4) { e.fireT = 1.3; this.ring(e.x, e.y, 8, 30, e.t); }
          break;
        case 'mina':
          e.y -= 16 * dt; e.x += Math.sin(e.t * 1.5 + e.x0) * 6 * dt;
          if (e.y < 30) { this.burstMine(e); this.enemies.splice(i, 1); continue; }
          break;
      }
      if ((e.type === 'dardo' || e.type === 'ondina') && e.t > 1) {
        e.fireT -= dt * ag * (e.type === 'ondina' ? 0.8 : 0.45);
        if (e.fireT <= 0 && e.y > 40 && e.y < H - 6) { e.fireT = 2.4 + this.r() * 2; this.aimed(e, 1, 0, 34); }
      }
      if (e.y < -10 || e.y > H + 40 || e.x < -30 || e.x > W + 30) this.enemies.splice(i, 1);
    }
  }
  nearShip(x, y) { let b = null, d = 1e9; for (const s of this.ships) { if (!s.alive) continue; const q = (s.x - x) ** 2 + (s.y - y) ** 2; if (q < d) { d = q; b = s; } } return b; }
  shot(x, y, vx, vy, r = 1.2, kind = 0) { if (this.ebullets.length < 600) this.ebullets.push({ x, y, vx, vy, r, kind }); }
  aimed(e, n, spread, speed) {
    const tg = this.nearShip(e.x, e.y); if (!tg) return;
    const a = Math.atan2(tg.y - e.y, tg.x - e.x), sp = speed * Math.min(1.5, 0.85 + this.aggro * 0.15);
    for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * spread; this.shot(e.x, e.y - e.r * 0.6, Math.cos(aa) * sp, Math.sin(aa) * sp); }
  }
  ring(x, y, n, speed, rot = 0, kind = 1) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rot; this.shot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 1.3, kind); } }
  burstMine(e) { this.ring(e.x, e.y, 6 + this.sector * 2, 26, e.t, 2); this.ev('mine', e.x, e.y); }

  moveBoss(dt) {
    const b = this.boss; b.t += dt; b.flash = Math.max(0, b.flash - dt);
    const restY = H - 34;
    if (b.enter) { b.y -= 18 * dt; if (b.y <= restY) { b.y = restY; b.enter = false; b.t = 0; } return; }
    const frac = b.hp / b.max; b.phase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
    const ag = this.aggro * (1 + b.phase * 0.15);
    b.fireT -= dt * ag; b.patT += dt;
    if (b.kind === 'granchio') {
      b.x = W / 2 + Math.sin(b.t * 0.5) * (22 + b.phase * 4); b.y = restY + Math.sin(b.t * 1.3) * 3;
      if (b.fireT <= 0) {
        b.pat = (b.pat + 1) % 3;
        if (b.pat === 0) { for (let k = -1; k <= 1; k += 2) { for (let i = 0; i < 5 + b.phase * 2; i++) { const a = -Math.PI / 2 + k * (0.15 + i * 0.12); this.shot(b.x + k * 10, b.y - 4, Math.cos(a) * 34, Math.sin(a) * 34, 1.4, 3); } } b.fireT = 1.5; }
        else if (b.pat === 1) { this.aimed(b, 5 + b.phase * 2, 0.16, 42); b.fireT = 1.2; }
        else { this.ring(b.x, b.y, 14 + b.phase * 4, 24, b.t, 1); b.fireT = 1.6; }
      }
    } else if (b.kind === 'medusa') {
      b.x = W / 2 + Math.sin(b.t * 0.35) * 26; b.y = restY + Math.cos(b.t * 0.7) * 5;
      if (this.r() < dt * 0.9 * this.o.players) this.shot(b.x + (this.r() - 0.5) * 16, b.y - 8, 0, -22, 1.2, 2); // drifting spores
      if (b.fireT <= 0) {
        b.pat = (b.pat + 1) % 3;
        if (b.pat === 0) { // spiral
          b.spiral = 1.6 + b.phase * 0.5; b.fireT = 2.6;
        } else if (b.pat === 1) { // electric columns: a warning first, then a beam
          const tg = this.nearShip(b.x, b.y), n = 1 + b.phase;
          for (let i = 0; i < n; i++) this.columns.push({ x: clamp((tg ? tg.x : W / 2) + (i - (n - 1) / 2) * 22, 6, W - 6), w: 5, t: 0, warn: 1.1, dur: 0.9 });
          b.fireT = 2.4;
        } else {
          for (let i = 0; i < 2 + b.phase; i++) this.spawn({ type: 'ondina', x: b.x + (i - 1) * 16, y: b.y - 6, p: { vy: -26, amp: 8, w: 2, ph: i } });
          b.fireT = 2;
        }
      }
      if (b.spiral > 0) { b.spiral -= dt; b.sT = (b.sT || 0) - dt; if (b.sT <= 0) { b.sT = 0.09; const a = b.t * 4.2; for (let k = 0; k < 3; k++) { const aa = a + (k * Math.PI * 2) / 3; this.shot(b.x, b.y, Math.cos(aa) * 30, Math.sin(aa) * 30, 1.3, 1); } } }
    } else {
      b.x = W / 2 + Math.sin(b.t * 0.6) * 20 + Math.sin(b.t * 1.7) * 6; b.y = restY + Math.sin(b.t * 0.9) * 6;
      for (const o of b.orbs) o.a += dt * (1.1 + b.phase * 0.4);
      if (b.fireT <= 0) {
        b.pat = (b.pat + 1) % 3;
        if (b.pat === 0) { for (let k = 0; k < 5; k++) { const a0 = (k / 5) * Math.PI * 2 + b.t; for (let j = 0; j < 4; j++) this.shot(b.x, b.y, Math.cos(a0 + j * 0.08) * (20 + j * 6), Math.sin(a0 + j * 0.08) * (20 + j * 6), 1.3, 1); } b.fireT = 1.6; }
        else if (b.pat === 1) { for (const o of b.orbs) if (o.alive) { const ox = b.x + Math.cos(o.a) * 18, oy = b.y + Math.sin(o.a) * 18; const tg = this.nearShip(ox, oy); if (tg) { const a = Math.atan2(tg.y - oy, tg.x - ox); this.shot(ox, oy, Math.cos(a) * 38, Math.sin(a) * 38, 1.2, 3); } } b.fireT = 1.1; }
        else { this.aimed(b, 9 + b.phase * 2, 0.11, 30); b.fireT = 1.4; if (b.phase === 2) this.ring(b.x, b.y, 18, 20, b.t, 2); }
        if (b.phase > 0 && b.orbs.every((o) => !o.alive) && this.r() < 0.5) for (const o of b.orbs) { o.alive = true; o.hp = 20; }
      }
    }
  }
  damageBoss(d, x, y) {
    const b = this.boss; if (!b || b.enter) return;
    b.hp -= d; b.flash = 0.06;
    if (b.hp <= 0) {
      this.ev('bossdown', b.x, b.y, { kind: b.kind });
      this.addScore(b.score * (1 + this.sector * 0.5), b.x, b.y, true);
      for (let i = 0; i < 40; i++) this.gemAt(b.x + (this.r() - 0.5) * 20, b.y + (this.r() - 0.5) * 16, 50, true);
      this.items.push({ x: b.x, y: b.y, vy: -12, type: 'P', t: 0 }, { x: b.x + 8, y: b.y, vy: -12, type: 'B', t: 0 });
      this.ebullets.length = 0; this.columns.length = 0; this.enemies.length = 0;
      this.boss = null; this.bossKills++;
    }
  }
  moveBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) { const b = this.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > H + 4 || b.x < -4 || b.x > W + 4) this.bullets.splice(i, 1); }
    for (let i = this.ebullets.length - 1; i >= 0; i--) { const b = this.ebullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y < -4 || b.y > H + 8 || b.x < -4 || b.x > W + 4) this.ebullets.splice(i, 1); }
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; it.t += dt; it.y += it.vy * dt; it.x += Math.sin(it.t * 2) * 6 * dt; if (it.y < -5) this.items.splice(i, 1); }
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]; g.t += dt;
      const tg = this.nearShip(g.x, g.y);
      const mag = g.mag || (tg && (tg.magnet > 0 || (tg.x - g.x) ** 2 + (tg.y - g.y) ** 2 < 100));
      if (mag && tg) { const dx = tg.x - g.x, dy = tg.y - g.y, l = Math.hypot(dx, dy) || 1, sp = 90 + g.t * 30; g.x += (dx / l) * sp * dt; g.y += (dy / l) * sp * dt; }
      else { g.vx *= Math.exp(-3 * dt); g.vy -= 30 * dt; g.vy = Math.max(g.vy, -26); g.x += g.vx * dt; g.y += g.vy * dt; }
      if (g.y < -4 || g.t > 12) this.gems.splice(i, 1);
    }
  }
  damage(e, d) {
    e.hp -= d; e.flash = 0.06;
    if (e.hp <= 0) {
      const i = this.enemies.indexOf(e); if (i < 0) return;
      this.enemies.splice(i, 1); this.kills++;
      this.chain++; this.chainT = 2; this.mult = Math.min(8, 1 + Math.floor(this.chain / 6)); this.maxMult = Math.max(this.maxMult, this.mult);
      this.addScore(e.score, e.x, e.y);
      this.ev('kill', e.x, e.y, { type: e.type, big: e.type === 'corazza' || e.type === 'girandola' });
      const gems = e.type === 'corazza' ? 8 : e.type === 'girandola' ? 5 : 1;
      for (let k = 0; k < gems; k++) this.gemAt(e.x, e.y, 20);
      if (e.type === 'mina') this.burstMine(e);
      if (this.r() < e.drop) this.items.push({ x: e.x, y: e.y, vy: -14, type: this.pickItem(), t: 0 });
    }
  }
  pickItem() {
    const s = this.ships.find((q) => q.alive) || this.ships[0];
    const r = this.r();
    if (s.weapon < 4 && r < 0.42) return 'P';
    return r < 0.58 ? 'S' : r < 0.72 ? 'B' : r < 0.86 ? 'L' : 'M';
  }
  addScore(v, x, y, big = false) {
    const pts = Math.round(v * this.mult * this.o.scoreMul);
    this.score += pts;
    this.ev('score', x, y, { pts, big });
  }
  collide() {
    // player bullets vs enemies / boss / orbs
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; let hit = false;
      for (const e of this.enemies) if (hitCC(b.x, b.y, b.r, e.x, e.y, e.r)) { this.damage(e, b.dmg); hit = true; break; }
      const B = this.boss;
      if (!hit && B && !B.enter) {
        if (B.orbs) for (const o of B.orbs) { if (!o.alive) continue; const ox = B.x + Math.cos(o.a) * 18, oy = B.y + Math.sin(o.a) * 18; if (hitCC(b.x, b.y, b.r, ox, oy, 3)) { o.hp -= b.dmg; hit = true; if (o.hp <= 0) { o.alive = false; this.ev('kill', ox, oy, { type: 'orb' }); this.addScore(500, ox, oy); } break; } }
        if (!hit && hitCC(b.x, b.y, b.r, B.x, B.y, B.r)) { this.damageBoss(b.dmg, b.x, b.y); hit = true; this.ev('hit', b.x, b.y); }
      }
      if (hit) this.bullets.splice(i, 1);
    }
    for (const s of this.ships) {
      if (!s.alive) continue;
      // pick-ups
      for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; if (hitCC(s.x, s.y, s.hr, it.x, it.y, 3)) { this.items.splice(i, 1); this.pick(s, it.type); } }
      for (let i = this.gems.length - 1; i >= 0; i--) { const g = this.gems[i]; if (hitCC(s.x, s.y, s.hr, g.x, g.y, 1.5)) { this.gems.splice(i, 1); this.score += Math.round(g.v * this.mult * this.o.scoreMul); this.gemsGot = (this.gemsGot || 0) + 1; this.ev('gem', g.x, g.y); } }
      if (s.inv > 0 || this.o.god) continue;
      let hurt = false;
      for (let i = this.ebullets.length - 1; i >= 0; i--) { const b = this.ebullets[i]; if (hitCC(s.x, s.y, s.r, b.x, b.y, b.r)) { this.ebullets.splice(i, 1); hurt = true; break; } }
      if (!hurt) for (const e of this.enemies) if (hitCC(s.x, s.y, s.r + 1, e.x, e.y, e.r * 0.8)) { this.damage(e, 99); hurt = true; break; }
      if (!hurt && this.boss && !this.boss.enter && hitCC(s.x, s.y, s.r, this.boss.x, this.boss.y, this.boss.r)) hurt = true;
      if (!hurt) for (const c of this.columns) if (c.t > c.warn && Math.abs(s.x - c.x) < c.w / 2 + s.r) { hurt = true; break; }
      if (hurt) this.hurt(s);
    }
  }
  pick(s, type) {
    if (type === 'P') { if (s.weapon < 4) s.weapon++; else this.addScore(2000, s.x, s.y); }
    else if (type === 'S') s.shield = 12;
    else if (type === 'B') s.bombs = Math.min(5, s.bombs + 1);
    else if (type === 'L') s.laser = 6;
    else if (type === 'M') s.magnet = 10;
    this.pickups = (this.pickups || 0) + 1;
    this.ev('pick', s.x, s.y, { item: type, p: s.i });
  }
  hurt(s) {
    this.chain = 0; this.mult = 1;
    if (s.shield > 0) { s.shield = 0; s.inv = 1.2; this.ev('shield', s.x, s.y, { p: s.i }); for (const b of this.ebullets) if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 < 400) b.y = -99; return; }
    s.alive = false; s.lives--; s.respawn = 1.6;
    this.ebullets = this.ebullets.filter((b) => (b.x - s.x) ** 2 + (b.y - s.y) ** 2 > 900);
    this.ev('die', s.x, s.y, { p: s.i, left: s.lives });
  }
  finish(win) {
    if (this.over) return;
    this.over = true;
    this.result = { game: 'astro', score: this.score, win, sector: this.sector, wave: this.wave, kills: this.kills, bosses: this.bossKills, maxMult: this.maxMult, time: Math.round(this.time) };
    this.ev('end', W / 2, H / 2, { win });
  }

  // simple dodging pilot (tests, attract mode): drift under the nearest target, push away from bullets
  autopilot(s) {
    const I = s.input;
    let tx = W / 2;
    const tgt = this.boss || this.enemies.reduce((a, e) => (!a || e.y < a.y ? e : a), null);
    if (tgt) tx = tgt.x;
    let fx = (tx - s.x) * 0.08, fy = (18 - s.y) * 0.05;
    for (const b of this.ebullets) {
      const dx = s.x - b.x, dy = s.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < 260 && dy < 8) { const d = Math.sqrt(d2) || 1; fx += (dx / d) * (16 / d) * 2.2; fy += (dy / d) * (16 / d) * 0.8; }
    }
    for (const c of this.columns) if (Math.abs(s.x - c.x) < c.w + 6) fx += s.x < c.x ? -2 : 2;
    I.ax = clamp(fx, -1, 1); I.ay = clamp(fy, -1, 1);
    if (s.bombs > 0 && this.ebullets.filter((b) => (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < 64).length > 3) I.bomb = true;
  }
}
