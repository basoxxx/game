// Corri Baso — endless runner simulation (pure logic). Three lanes, rows of obstacles every `gap`
// metres generated ahead of the runner from a seed. The generator walks a "safe lane" path (it moves at
// most one lane per row) so that every row always has a way through: free, jumpable or slidable.
// Inputs are discrete actions pushed by the host: 'left' | 'right' | 'up' (jump) | 'down' (slide).
import { rng, clamp } from './rng.js';

export const LANE_W = 2.6, LANES = [-1, 0, 1];
export const POWERS = {
  magnete: { name: 'Magnete', color: '#ff4fd8', dur: 10 },
  scudo: { name: 'Scudo', color: '#36e0ff', dur: 0 },
  doppio: { name: 'Punti x2', color: '#ffe14d', dur: 14 },
  molla: { name: 'Super molla', color: '#3dffb0', dur: 0 },
};
// obstacles: low = jump over, high = slide under, block = change lane, tram = long block over several rows
export const OBST = { low: { h: 1.0, len: 0.8 }, high: { h: 3.2, len: 0.7, under: 1.2 }, block: { h: 2.6, len: 2.4 }, tram: { h: 3.0 } };
export const MISSION_TYPES = {
  coins: { text: (n) => `Raccogli ${n} monete in una corsa`, goals: [50, 100, 160, 250, 400] },
  dist: { text: (n) => `Corri ${n.toLocaleString('it-IT')} m in una corsa`, goals: [500, 1000, 1800, 3000, 5000] },
  jumps: { text: (n) => `Salta ${n} volte in una corsa`, goals: [10, 20, 35, 50, 80] },
  slides: { text: (n) => `Scivola ${n} volte in una corsa`, goals: [8, 15, 25, 40, 60] },
  powers: { text: (n) => `Prendi ${n} ${n === 1 ? 'potenziamento' : 'potenziamenti'} in una corsa`, goals: [1, 2, 4, 6, 9] },
  score: { text: (n) => `Fai ${n.toLocaleString('it-IT')} punti in una corsa`, goals: [3000, 8000, 16000, 30000, 60000] },
};
export function newMission(rnd, have = [], level = 0) {
  const types = Object.keys(MISSION_TYPES).filter((t) => !have.includes(t));
  const t = types[Math.floor(rnd() * types.length)] || 'coins';
  const g = MISSION_TYPES[t].goals; const goal = g[Math.min(g.length - 1, level)];
  return { id: t, goal, coins: 40 + Math.min(level, 6) * 30 };
}
export const missionText = (m) => MISSION_TYPES[m.id]?.text(m.goal) || '';
export function missionValue(m, r) { return { coins: r.coins, dist: r.dist, jumps: r.jumps, slides: r.slides, powers: r.powers, score: r.score }[m.id] || 0; }

export function* rowGen(seed, density = 1) {
  const r = rng(seed);
  let safe = 0, tram = [0, 0, 0], idx = 0;
  while (true) {
    idx++;
    const lvl = Math.min(1, idx / 160);
    const cells = [0, 0, 0].map((_, i) => (tram[i] > 0 ? 'tram' : 'free'));
    // the safe lane may drift by one; never into a running tram
    const opts = [safe - 1, safe, safe + 1].filter((l) => l >= -1 && l <= 1 && tram[l + 1] <= 0);
    if (opts.length) safe = r.pick(opts);
    const busy = idx < 3 ? 0 : r() < 0.25 + lvl * 0.25 * density ? 2 : r() < 0.85 ? 1 : 0;
    const others = LANES.filter((l) => l !== safe && cells[l + 1] === 'free');
    for (let k = 0; k < busy && others.length; k++) {
      const l = others.splice(Math.floor(r() * others.length), 1)[0];
      const x = r();
      if (x < 0.2 + lvl * 0.1 && idx > 6) { cells[l + 1] = 'tram'; tram[l + 1] = 2 + Math.floor(r() * 3); }
      else cells[l + 1] = x < 0.55 ? 'block' : x < 0.8 ? 'low' : 'high';
    }
    // the safe lane itself sometimes asks for a jump or a slide
    if (idx > 4 && r() < 0.35 + lvl * 0.3) cells[safe + 1] = r() < 0.55 ? 'low' : 'high';
    const row = { idx, cells, safe };
    for (let i = 0; i < 3; i++) if (tram[i] > 0) tram[i]--;
    // coins on the safe lane or an arc over a barrier; power-ups now and then
    row.coin = r() < 0.55 ? safe : r() < 0.3 ? r.pick(LANES) : null;
    if (row.coin != null && (cells[row.coin + 1] === 'block' || cells[row.coin + 1] === 'tram')) row.coin = safe;
    row.power = idx > 8 && r() < 0.045 ? { lane: r.pick(LANES.filter((l) => cells[l + 1] === 'free').concat([safe])), type: r.pick(['magnete', 'scudo', 'doppio', 'molla']) } : null;
    yield row;
  }
}
export const passable = (cell) => cell === 'free' || cell === 'low' || cell === 'high';

export class CorriSim {
  constructor(o = {}) {
    this.o = { seed: 1, startSpeed: 1, coinMul: 1, scoreMul: 1, density: 1, missionMul: 1, god: false, ...o };
    this.gen = rowGen(this.o.seed, this.o.density);
    this.time = 0; this.dist = 0; this.score = 0; this.coins = 0; this.jumps = 0; this.slides = 0; this.powers = 0; this.stumbles = 0;
    this.v = 12 * this.o.startSpeed; this.over = false; this.result = null; this.events = []; this.actions = [];
    this.p = { lane: 0, x: 0, y: 0, vy: 0, slide: 0, air: false, shield: false, magnet: 0, dbl: 0, spring: 0, stumble: 0, inv: 0, fromLane: 0, laneT: 1, run: 0 };
    this.obst = []; this.coinsList = []; this.pups = []; this.rows = [];
    this.nextZ = 30; this.genTo(this.nextZ + 220);
    this.auto = false;
  }
  ev(k, extra) { this.events.push({ k, ...extra }); }
  get gap() { return 13 + this.v * 0.55; }
  genTo(z) {
    while (this.nextZ < z) {
      const row = this.gen.next().value, zz = this.nextZ, g = this.gap;
      row.z = zz; this.rows.push(row);
      row.cells.forEach((c, i) => {
        const lane = i - 1;
        if (c === 'tram') {
          // a tram row spans to the next row: one long body per contiguous run
          const prev = this.obst.find((o) => o.type === 'tram' && o.lane === lane && o.z1 >= zz - g - 0.1);
          if (prev) prev.z1 = zz + 3; else this.obst.push({ type: 'tram', lane, z0: zz - 3, z1: zz + 3, id: this.obst.length + zz });
        } else if (c !== 'free') this.obst.push({ type: c, lane, z0: zz - OBST[c].len / 2, z1: zz + (c === 'block' ? OBST.block.len : OBST[c].len) / 2, id: this.obst.length + zz });
      });
      if (row.coin != null) {
        const c = row.cells[row.coin + 1], n = 5;
        for (let k = 0; k < n; k++) { const t = (k - (n - 1) / 2) / ((n - 1) / 2); const z = zz + t * 3.2; this.coinsList.push({ lane: row.coin, z, y: c === 'low' ? 1.2 + (1 - t * t) * 1.6 : c === 'high' ? 0.5 : 0.7, got: false }); }
        // a trail of coins in the gap
        for (let k = 1; k < 4; k++) this.coinsList.push({ lane: row.coin, z: zz + (g * k) / 4, y: 0.7, got: false });
      }
      if (row.power) this.pups.push({ lane: row.power.lane, z: zz + g / 2, type: row.power.type, got: false });
      this.nextZ += g;
    }
  }
  act(a) { this.actions.push(a); }
  laneBlocked(lane, z, pad = 0.6) { return this.obst.some((o) => o.lane === lane && (o.type === 'block' || o.type === 'tram') && z > o.z0 - pad && z < o.z1 + pad); }
  step(dt) {
    if (this.over) return;
    const sub = Math.max(1, Math.ceil(dt * 120)), h = dt / sub;
    for (let i = 0; i < sub && !this.over; i++) this.tick(h);
  }
  tick(dt) {
    const p = this.p;
    this.time += dt;
    if (this.auto) this.autopilot();
    while (this.actions.length) {
      const a = this.actions.shift();
      if (a === 'left' || a === 'right') {
        const to = clamp(p.lane + (a === 'left' ? -1 : 1), -1, 1);
        if (to === p.lane) { this.ev('bump'); continue; }
        if (this.laneBlocked(to, this.dist, 0.2) && !(p.spring > 0 && p.y > 3.5)) { this.hitSide(); continue; }
        p.fromLane = p.x / LANE_W; p.lane = to; p.laneT = 0; this.ev('lane', { to });
      } else if (a === 'up') {
        if (!p.air) { p.vy = 10.5; p.air = true; p.slide = 0; this.jumps++; this.ev('jump'); }
      } else if (a === 'down') {
        if (p.air) p.vy = Math.min(p.vy, -18);
        else { if (p.slide <= 0) { this.slides++; this.ev('slide'); } p.slide = 0.75; }
      }
    }
    // speed ramps towards 34 m/s
    this.v = Math.min(36, Math.max(this.v, 12 * this.o.startSpeed + 22 * (1 - Math.exp(-this.dist / 2600))));
    if (p.stumble > 0) p.stumble -= dt;
    const v = this.v * (p.stumble > 0 ? 0.8 : 1);
    this.dist += v * dt; p.run += v * dt;
    p.laneT = Math.min(1, p.laneT + dt * 7);
    const e = 1 - (1 - p.laneT) ** 3; p.x = (p.fromLane + (p.lane - p.fromLane) * e) * LANE_W;
    if (p.air) { p.vy -= (p.spring > 0 ? 9 : 30) * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; p.air = false; if (p.spring > 0) p.spring = 0; this.ev('land'); } }
    if (p.slide > 0) p.slide -= dt;
    p.magnet = Math.max(0, p.magnet - dt); p.dbl = Math.max(0, p.dbl - dt); p.inv = Math.max(0, p.inv - dt);
    const mult = this.mult;
    this.score += v * dt * mult * this.o.scoreMul * 0.5;
    // collisions with obstacles under the runner
    const z = this.dist;
    for (const o of this.obst) {
      if (o.hit || z < o.z0 - 0.35 || z > o.z1 + 0.35) continue;
      if (Math.abs(p.x - o.lane * LANE_W) > 1.1) continue;
      let clear = false;
      if (o.type === 'low') clear = p.y > 0.85;
      else if (o.type === 'high') clear = p.slide > 0 && !p.air;
      else clear = p.y > OBST[o.type].h + 0.2;
      if (p.spring > 0) clear = true; // the spring flight clears everything
      if (!clear) { o.hit = true; this.crash(o); if (this.over) return; }
    }
    // coins and power-ups
    const mr = p.magnet > 0 ? 7 : 0;
    for (const c of this.coinsList) {
      if (c.got || Math.abs(c.z - z) > Math.max(1, mr)) continue;
      const cx = c.lane * LANE_W;
      if (mr ? Math.abs(cx - p.x) < 9 : Math.abs(cx - p.x) < 1.2 && Math.abs(c.y - (p.y + (p.slide > 0 ? 0.4 : 0.9))) < 1.2) {
        c.got = true; const n = this.o.coinMul; this.coins += n; this.score += 10 * n * mult * this.o.scoreMul; this.ev('coin', { lane: c.lane, z: c.z, y: c.y });
      }
    }
    for (const u of this.pups) {
      if (u.got || Math.abs(u.z - z) > 1 || Math.abs(u.lane * LANE_W - p.x) > 1.3) continue;
      u.got = true; this.powers++; this.power(u.type);
    }
    // prune and extend
    if (this.obst.length > 80) this.obst = this.obst.filter((o) => o.z1 > z - 20);
    if (this.coinsList.length > 300) this.coinsList = this.coinsList.filter((c) => c.z > z - 20);
    if (this.pups.length > 20) this.pups = this.pups.filter((c) => c.z > z - 20);
    if (this.rows.length > 60) this.rows = this.rows.filter((r) => r.z > z - 30);
    this.genTo(z + 220);
  }
  get mult() { return (1 + (this.o.missionMul - 1)) * (this.p.dbl > 0 ? 2 : 1); }
  power(t) {
    const p = this.p;
    if (t === 'magnete') p.magnet = POWERS.magnete.dur;
    else if (t === 'scudo') p.shield = true;
    else if (t === 'doppio') p.dbl = POWERS.doppio.dur;
    else if (t === 'molla') { p.spring = 1; p.vy = 17; p.air = true; p.slide = 0; }
    this.ev('power', { type: t });
  }
  hitSide() {
    const p = this.p;
    this.ev('stumble');
    if (p.stumble > 0 && !this.o.god) { this.crash({ type: 'side' }); return; }
    p.stumble = 3.5; this.stumbles++;
  }
  crash(o) {
    const p = this.p;
    if (p.inv > 0 || this.o.god) return;
    if (p.shield) { p.shield = false; p.inv = 1.2; this.ev('shieldbreak'); return; }
    this.over = true; this.ev('crash', { type: o.type });
    this.result = { game: 'corri', score: Math.round(this.score), dist: Math.round(this.dist), coins: this.coins, jumps: this.jumps, slides: this.slides, powers: this.powers, time: Math.round(this.time), win: false };
  }
  // look-ahead pilot (tests and the menu demo): reads the next rows and takes the matching action
  autopilot() {
    const p = this.p, z = this.dist;
    if (p.laneT < 1) return;
    // follow the generator's safe lane of the next row (it is always reachable one lane at a time)
    const row = this.rows.find((r) => r.z > z + 0.5);
    if (row && row.safe !== p.lane && !p.air) {
      const step = p.lane + Math.sign(row.safe - p.lane);
      const busy = this.obst.some((o) => o.lane === step && o.z1 > z - 0.6 && o.z0 < z + 2.5 + this.v * 0.08);
      if (!busy) { this.act(step < p.lane ? 'left' : 'right'); return; }
    }
    const mine = this.obst.filter((o) => o.lane === p.lane && o.z1 > z - 0.3 && (o.type === 'low' || o.type === 'high')).sort((a, b) => a.z0 - b.z0)[0];
    if (mine && mine.z0 - z < 1.6 + this.v * 0.07 && mine.z0 - z > 0) {
      if (mine.type === 'low' && !p.air) this.act('up');
      else if (mine.type === 'high' && p.slide <= 0.1) this.act('down');
    }
  }
}
