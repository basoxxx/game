// Serpentone — the simulation: snakes, food, collisions, AI, power-ups and the mode rules. Pure JS
// (no three.js, no DOM), deterministic for a seed, so node tests can run it and the renderer only reads it.
//
// A snake is a head that moves forward and turns toward a target angle; every `HS` units of travel the
// head drops a point into a ring buffer (its path). The body is the path sampled at fixed arc lengths,
// so it follows the head's track exactly (no cut corners) however many segments are drawn.
import { rng, MODES, DIFFS, PERSONAS, AI_NAMES, SKINS, PATTERNS, HATS, POWERS, ARENAS, pickMissions } from './meta.js';

export const HS = 0.25;              // path resolution (world units between recorded points)
const CAP = 4096;                    // path points per snake (max length = CAP * HS)
export const START_MASS = 10;
const SPEED = 11, BOOST = 1.85, MIN_BOOST = 14;
export const radiusOf = (m) => Math.min(3.4, 0.55 + 0.07 * Math.sqrt(Math.max(0, m)));
export const lengthOf = (m) => Math.min((CAP - 16) * HS, 5 + Math.max(0, m) * 0.18);
export const turnOf = (r) => 4.6 / (0.55 + r * 0.45);
const CELL = 8;
const FOODCAP = 8000, SEGCAP = 40000;
const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const hexNum = (h) => parseInt(h.slice(1), 16);

export class Snake {
  constructor(id, o) {
    this.id = id; this.name = o.name; this.player = o.player ?? -1; this.ai = this.player < 0 || !!o.auto;
    this.skin = o.skin || 'lime'; this.pattern = o.pattern || 'tinta'; this.hat = o.hat || 'nessuno';
    this.pers = o.pers || 'goloso';
    this.hx = new Float32Array(CAP); this.hz = new Float32Array(CAP); this.hn = 0;
    this.alive = false; this.kills = 0; this.eaten = 0; this.best = 0; this.deaths = 0; this.powers = 0; this.boostT = 0;
    this.thinkT = 0; this.boostHold = 0; this.respawnT = 0; this.power = null; this.placed = 0; this.aliveT = 0;
    this.input = { ta: null, turn: 0, boost: false };
    this.color = hexNum((SKINS.find((s) => s.id === this.skin) || SKINS[0]).c[0]);
  }
  spawn(x, z, a, m) {
    this.x = x; this.z = z; this.a = a; this.ta = a; this.m = m; this.alive = true; this.boosting = false; this.power = null;
    this.r = radiusOf(m); this.L = lengthOf(m); this.dropAcc = 0; this.aliveT = 0; this.spawnT = 0;
    // a straight path behind the head, as long as the body
    const n = Math.min(CAP - 2, Math.ceil(this.L / HS) + 4);
    this.hn = 0;
    for (let i = n; i >= 1; i--) this.rec(x - Math.cos(a) * i * HS, z - Math.sin(a) * i * HS);
    this.lx = this.hx[(this.hn - 1) % CAP]; this.lz = this.hz[(this.hn - 1) % CAP];
    this.best = Math.max(this.best, m);
  }
  rec(x, z) { const k = this.hn % CAP; this.hx[k] = x; this.hz[k] = z; this.hn++; }
  // point at arc length s behind the head → out[0], out[1]
  sample(s, out) {
    const lx = this.hx[(this.hn - 1) % CAP], lz = this.hz[(this.hn - 1) % CAP];
    const ex = this.x - lx, ez = this.z - lz, e = Math.hypot(ex, ez);
    if (s <= e) { const t = e > 1e-6 ? s / e : 0; out[0] = this.x - ex * t; out[1] = this.z - ez * t; return out; }
    const f = (s - e) / HS, avail = Math.min(this.hn, CAP) - 2;
    let k = Math.floor(f), fr = f - k;
    if (k >= avail) { k = avail; fr = 0; }
    const i0 = (this.hn - 1 - k + CAP * 4) % CAP, i1 = (this.hn - 2 - k + CAP * 4) % CAP;
    out[0] = this.hx[i0] + (this.hx[i1] - this.hx[i0]) * fr; out[1] = this.hz[i0] + (this.hz[i1] - this.hz[i0]) * fr;
    return out;
  }
  // radius along the body: full, then tapering over the last 30%
  radAt(s) { const u = s / this.L; return this.r * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3 * 0.55); }
  get score() { return Math.floor(this.m); }
}

export class Sim {
  constructor(o = {}) {
    this.o = { mode: 'classica', arena: 'giardino', diff: 'normale', seed: 1, players: 1, rivals: null, twist: null, ...o };
    const tw = this.o.twist || {};
    this.mode = MODES[this.o.mode] || MODES.classica; this.modeId = MODES[this.o.mode] ? this.o.mode : 'classica';
    this.arena = ARENAS[this.o.arena] || ARENAS.giardino;
    this.diff = DIFFS[this.o.diff] || DIFFS.normale;
    this.rand = rng(this.o.seed);
    this.R = Math.round((this.modeId === 'battaglia' ? 170 : this.mode.duo ? 170 : 200) * (tw.arena || 1));
    this.ring = this.mode.ring ? this.R : 0; this.ringT = this.R;
    this.W = this.R + 24; this.G = Math.ceil((2 * this.W) / CELL);
    this.foodMul = tw.food || 1; this.freeBoost = !!tw.freeBoost; this.powerMul = tw.powers || 1; this.startMass = tw.start || START_MASS;
    this.time = 0; this.left = this.mode.time; this.over = false; this.result = null;
    this.events = []; this.snakes = []; this.items = [];
    // food (struct of arrays) + free list
    this.fx = new Float32Array(FOODCAP); this.fz = new Float32Array(FOODCAP); this.fv = new Float32Array(FOODCAP); this.fc = new Uint32Array(FOODCAP); this.fa = new Uint8Array(FOODCAP); this.ft = new Float32Array(FOODCAP);
    this.free = []; for (let i = FOODCAP - 1; i >= 0; i--) this.free.push(i); this.nFood = 0;
    // body collision samples + grids (counting sort per step)
    this.sx = new Float32Array(SEGCAP); this.sz = new Float32Array(SEGCAP); this.sr = new Float32Array(SEGCAP); this.so = new Int16Array(SEGCAP); this.nSeg = 0;
    const N = this.G * this.G;
    this.segStart = new Int32Array(N + 1); this.segIdx = new Int32Array(SEGCAP);
    this.foodStart = new Int32Array(N + 1); this.foodIdx = new Int32Array(FOODCAP);
    this.cellOf = new Int32Array(Math.max(SEGCAP, FOODCAP));
    this.foodTarget = Math.round(((this.R * this.R) / (200 * 200)) * 2400 * this.foodMul);
    this.powerT = 6;
    this.pal = this.arena.pal.map(hexNum);
    this.tmp = [0, 0];
    this.missions = this.o.missions !== false ? pickMissions(this.rand, this.modeId, this.o.diff) : [];
    this.setup();
  }

  // ---------- setup
  setup() {
    const o = this.o, names = [...AI_NAMES];
    const np = this.mode.duo ? 2 : Math.max(1, Math.min(2, o.players || 1));
    const pl = o.playerLooks || [];
    for (let p = 0; p < np; p++) {
      const L = pl[p] || {};
      const s = new Snake(this.snakes.length, { name: L.name || (np > 1 ? `Giocatore ${p + 1}` : 'Tu'), player: p, skin: L.skin || (p ? 'fragola' : 'lime'), pattern: L.pattern || 'strisce', hat: L.hat || 'nessuno', auto: !!L.auto });
      this.snakes.push(s);
    }
    this.players = this.snakes.slice();
    const nR = o.rivals ?? this.mode.rivals;
    const pers = Object.keys(PERSONAS);
    for (let i = 0; i < nR; i++) this.addRival(names, pers);
    for (const s of this.snakes) this.place(s, s.player >= 0 ? this.startMass : this.rivalMass(true));
    // players start apart from each other and from everyone's heads
    for (let i = 0; i < this.foodTarget; i++) this.spawnFood();
  }
  addRival(names = [...AI_NAMES], pers = Object.keys(PERSONAS)) {
    const used = new Set(this.snakes.map((s) => s.name));
    const pool = names.filter((n) => !used.has(n));
    const name = pool.length ? pool[Math.floor(this.rand() * pool.length)] : `Biscia ${this.snakes.length}`;
    const s = new Snake(this.snakes.length, {
      name, pers: pers[Math.floor(this.rand() * pers.length)],
      skin: SKINS[Math.floor(this.rand() * SKINS.length)].id, pattern: PATTERNS[Math.floor(this.rand() * PATTERNS.length)].id,
      hat: this.rand() < 0.45 ? HATS[1 + Math.floor(this.rand() * (HATS.length - 1))].id : 'nessuno',
    });
    this.snakes.push(s);
    return s;
  }
  rivalMass(first) {
    if (this.modeId === 'battaglia') return 30;
    const t = this.time;
    const hi = first ? 140 : 60 + Math.min(300, t * 1.2);
    return Math.round(Math.max(this.startMass, this.startMass + this.rand() * hi * (this.modeId === 'sopravvivenza' ? 0.6 + t / 200 : 1)));
  }
  // a safe spot: far from bodies and the border
  place(s, m) {
    const lim = (this.ring || this.R) * 0.82;
    let bx = 0, bz = 0, bd = -1;
    for (let t = 0; t < 40; t++) {
      const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * lim;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let near = 1e9;
      for (const o of this.snakes) {
        if (!o.alive || o === s) continue;
        near = Math.min(near, Math.hypot(o.x - x, o.z - z) - o.L * 0.5);
      }
      for (let i = 0; i < this.nSeg; i += 7) near = Math.min(near, Math.hypot(this.sx[i] - x, this.sz[i] - z));
      if (near > bd) { bd = near; bx = x; bz = z; }
      if (near > 40) break;
    }
    // face the centre (roughly), so a new snake does not start toward the wall
    const a = Math.atan2(-bz, -bx) + (this.rand() - 0.5) * 1.6;
    s.spawn(bx, bz, a, m);
    s.thinkT = this.rand() * 0.2;
    s.spawnT = 2; // brief spawn shield (no collisions while it fades in)
    this.events.push({ t: 'spawn', s: s.id });
  }

  // ---------- food
  spawnFood(x, z, v, c, fresh = 0) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    if (x === undefined) {
      const lim = (this.ring || this.R) - 3;
      // clustered: half the pellets near a few drifting "gardens"
      const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * lim;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      v = this.rand() < 0.08 ? 3 : this.rand() < 0.3 ? 2 : 1;
      c = this.pal[Math.floor(this.rand() * this.pal.length)];
    }
    this.fx[i] = x; this.fz[i] = z; this.fv[i] = v; this.fc[i] = c; this.fa[i] = 1; this.ft[i] = fresh; this.nFood++;
    return i;
  }
  killFood(i) { if (!this.fa[i]) return; this.fa[i] = 0; this.free.push(i); this.nFood--; }

  // ---------- grids
  cell(x, z) {
    const G = this.G;
    let cx = Math.floor((x + this.W) / CELL), cz = Math.floor((z + this.W) / CELL);
    cx = cx < 0 ? 0 : cx >= G ? G - 1 : cx; cz = cz < 0 ? 0 : cz >= G ? G - 1 : cz;
    return cx + cz * G;
  }
  buildSegments() {
    let n = 0; const p = this.tmp;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const step = Math.max(0.45, s.r * 0.7);
      for (let d = s.r * 0.9; d < s.L && n < SEGCAP; d += step) {
        s.sample(d, p); this.sx[n] = p[0]; this.sz[n] = p[1]; this.sr[n] = s.radAt(d) * 0.92; this.so[n] = s.id; n++;
      }
    }
    this.nSeg = n;
    this.sortGrid(n, this.sx, this.sz, this.segStart, this.segIdx, null);
  }
  buildFood() {
    // compact pass over the live pellets
    this.sortGrid(FOODCAP, this.fx, this.fz, this.foodStart, this.foodIdx, this.fa);
  }
  sortGrid(n, X, Z, start, idx, alive) {
    const N = this.G * this.G, cof = this.cellOf;
    start.fill(0);
    for (let i = 0; i < n; i++) { if (alive && !alive[i]) { cof[i] = -1; continue; } const c = this.cell(X[i], Z[i]); cof[i] = c; start[c + 1]++; }
    for (let c = 0; c < N; c++) start[c + 1] += start[c];
    const fill = this._fill || (this._fill = new Int32Array(N));
    fill.set(start.subarray(0, N));
    for (let i = 0; i < n; i++) { const c = cof[i]; if (c >= 0) idx[fill[c]++] = i; }
  }
  // calls fn(i) for every body sample within cells overlapping (x,z,rad)
  eachSeg(x, z, rad, fn) {
    const G = this.G, c0x = Math.max(0, Math.floor((x - rad + this.W) / CELL)), c1x = Math.min(G - 1, Math.floor((x + rad + this.W) / CELL));
    const c0z = Math.max(0, Math.floor((z - rad + this.W) / CELL)), c1z = Math.min(G - 1, Math.floor((z + rad + this.W) / CELL));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = cx + cz * G;
      for (let k = this.segStart[c], e = this.segStart[c + 1]; k < e; k++) if (fn(this.segIdx[k]) === true) return true;
    }
    return false;
  }
  eachFood(x, z, rad, fn) {
    const G = this.G, c0x = Math.max(0, Math.floor((x - rad + this.W) / CELL)), c1x = Math.min(G - 1, Math.floor((x + rad + this.W) / CELL));
    const c0z = Math.max(0, Math.floor((z - rad + this.W) / CELL)), c1z = Math.min(G - 1, Math.floor((z + rad + this.W) / CELL));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = cx + cz * G;
      for (let k = this.foodStart[c], e = this.foodStart[c + 1]; k < e; k++) fn(this.foodIdx[k]);
    }
  }

  // ---------- the step
  step(dt) {
    if (this.over) return;
    // substeps keep fast snakes from tunnelling through thin bodies
    const n = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < n && !this.over; i++) this.tick(dt / n);
  }
  tick(dt) {
    this.time += dt;
    if (this.mode.time) this.left = Math.max(0, this.mode.time - this.time);
    this.updateRing(dt);
    this.buildSegments();
    this.buildFood();
    for (const s of this.snakes) {
      if (!s.alive) { this.waitRespawn(s, dt); continue; }
      if (s.ai) this.think(s, dt);
      this.move(s, dt);
    }
    this.eat(dt);
    this.collide();
    this.updateItems(dt);
    this.refill(dt);
    this.updateFood(dt);
    this.rules(dt);
    this.trackMissions(dt);
  }
  waitRespawn(s, dt) {
    if (s.respawnT <= 0) return;
    s.respawnT -= dt;
    if (s.respawnT <= 0) this.place(s, s.player >= 0 ? this.startMass : this.rivalMass(false));
  }
  updateRing(dt) {
    if (!this.mode.ring) return;
    // waits 20 s, then closes to 15% of the arena over 150 s, then keeps squeezing slowly
    const t = this.time, R = this.R, min = R * 0.15;
    this.ringT = t < 20 ? R : t < 170 ? R - (R - min) * ((t - 20) / 150) : Math.max(12, min - (t - 170) * 0.35);
    this.ring += (this.ringT - this.ring) * Math.min(1, dt * 4);
  }
  move(s, dt) {
    s.aliveT += dt; if (s.spawnT > 0) s.spawnT -= dt;
    const inp = s.input;
    if (!s.ai) {
      if (inp.ta != null) s.ta = inp.ta;
      else if (inp.turn) s.ta = s.a + inp.turn * 1.2;
    }
    const tr = turnOf(s.r) * (s.boosting ? 0.8 : 1);
    const d = wrap(s.ta - s.a), mx = tr * dt;
    s.a = wrap(s.a + (d > mx ? mx : d < -mx ? -mx : d));
    const pw = s.power?.type;
    const free = this.freeBoost || pw === 'speed';
    const want = s.ai ? s.boostHold > 0 : !!inp.boost;
    if (s.ai && s.boostHold > 0) s.boostHold -= dt;
    s.boosting = want && (free || s.m > MIN_BOOST);
    let v = SPEED * (1 + Math.min(0.12, s.r * 0.02)) * (pw === 'speed' ? 1.18 : 1);
    if (s.boosting) {
      v *= BOOST;
      if (s.player >= 0) s.boostT += dt;
      if (!free) {
        const cost = (2.4 + s.m * 0.006) * dt;
        s.m = Math.max(MIN_BOOST * 0.9, s.m - cost); s.dropAcc += cost;
        if (s.dropAcc >= 1.2) { // what the boost burns falls behind the tail as food
          s.sample(s.L * 0.98, this.tmp);
          this.spawnFood(this.tmp[0] + (this.rand() - 0.5), this.tmp[1] + (this.rand() - 0.5), s.dropAcc * 0.7, s.color, 0.6);
          s.dropAcc = 0;
        }
      }
    }
    s.x += Math.cos(s.a) * v * dt; s.z += Math.sin(s.a) * v * dt;
    // grow toward the target size smoothly
    s.r += (radiusOf(s.m) - s.r) * Math.min(1, dt * 3);
    s.L += (lengthOf(s.m) - s.L) * Math.min(1, dt * 2.5);
    // record the path
    let dx = s.x - s.lx, dz = s.z - s.lz, dd = Math.hypot(dx, dz);
    while (dd >= HS) { s.lx += (dx / dd) * HS; s.lz += (dz / dd) * HS; s.rec(s.lx, s.lz); dx = s.x - s.lx; dz = s.z - s.lz; dd = Math.hypot(dx, dz); }
    if (s.power) { s.power.t -= dt; if (s.power.t <= 0) { this.events.push({ t: 'powerEnd', s: s.id, type: s.power.type }); s.power = null; } }
    if (s.m > s.best) s.best = s.m;
  }
  eat(dt = 1 / 60) {
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const mag = s.power?.type === 'magnet' ? 16 + s.r * 2 : 0;
      const reach = s.r + 0.9, suck = s.r * 2.4 + 2.5;
      const R = Math.max(reach, suck, mag);
      const dbl = s.power?.type === 'double' ? 2 : 1;
      this.eachFood(s.x, s.z, R, (i) => {
        if (!this.fa[i]) return;
        const dx = this.fx[i] - s.x, dz = this.fz[i] - s.z, d = Math.hypot(dx, dz);
        if (d < reach + Math.sqrt(this.fv[i]) * 0.25) {
          const v = this.fv[i] * dbl;
          s.m += v; s.eaten++;
          this.events.push({ t: 'eat', s: s.id, x: this.fx[i], z: this.fz[i], c: this.fc[i], v });
          this.killFood(i);
        } else if (d < Math.max(suck, mag)) {
          // pulled toward the mouth (stronger with the magnet)
          const k = Math.min(1, ((mag && d < mag ? 26 : 13) * dt) / d);
          this.fx[i] -= dx * k; this.fz[i] -= dz * k;
        }
      });
    }
  }
  collide() {
    const S = this.snakes;
    for (const s of S) {
      if (!s.alive || s.spawnT > 0) continue;
      // the arena wall
      if (Math.hypot(s.x, s.z) > this.R - s.r * 0.6) { this.kill(s, null, 'wall'); continue; }
      const ghost = s.power?.type === 'ghost';
      if (ghost) continue;
      let by = -1;
      this.eachSeg(s.x, s.z, s.r + 3.5, (i) => {
        const o = this.so[i]; if (o === s.id) return;
        const os = S[o]; if (os.spawnT > 0) return;
        const dx = this.sx[i] - s.x, dz = this.sz[i] - s.z, rr = this.sr[i] + s.r * 0.78;
        if (dx * dx + dz * dz < rr * rr) { by = o; return true; }
      });
      if (by >= 0) { this.kill(s, S[by], 'body'); continue; }
      // head to head: the smaller one loses (both if equal)
      for (const o of S) {
        if (o === s || !o.alive || o.spawnT > 0 || o.power?.type === 'ghost') continue;
        const rr = (s.r + o.r) * 0.85;
        if ((o.x - s.x) ** 2 + (o.z - s.z) ** 2 < rr * rr) {
          if (s.m < o.m) this.kill(s, o, 'head'); else if (s.m > o.m) this.kill(o, s, 'head'); else { this.kill(s, o, 'head'); this.kill(o, s, 'head'); }
          break;
        }
      }
    }
  }
  kill(s, by, why) {
    if (!s.alive) return;
    s.alive = false; s.deaths++; s.boosting = false;
    if (by && by !== s) by.kills++;
    // the body becomes a trail of glowing food
    const p = this.tmp;
    const n = Math.max(4, Math.min(240, Math.round(s.L / Math.max(0.8, s.r * 1.1))));
    const per = Math.max(0.8, (s.m * 0.72) / n);
    const sk = SKINS.find((k) => k.id === s.skin) || SKINS[0];
    const cols = sk.c.slice(0, 2).map(hexNum);
    for (let i = 0; i < n; i++) {
      s.sample((i / n) * s.L, p);
      const j = s.r * 0.7;
      this.spawnFood(p[0] + (this.rand() - 0.5) * j * 2, p[1] + (this.rand() - 0.5) * j * 2, per, cols[i % 2], 1);
    }
    this.events.push({ t: 'die', s: s.id, by: by ? by.id : -1, why, x: s.x, z: s.z, m: s.m });
    if (this.modeId === 'battaglia') s.placed = this.snakes.filter((o) => o.alive).length + 1;
    const respawn = this.mode.respawn || (this.modeId === 'sopravvivenza' && s.player < 0);
    if (respawn) s.respawnT = s.player >= 0 ? 2.5 : 2 + this.rand() * 3;
  }
  // ---------- power-ups
  updateItems(dt) {
    this.powerT -= dt * this.powerMul;
    if (this.powerT <= 0 && this.items.length < 5) {
      this.powerT = 7 + this.rand() * 6;
      const types = Object.keys(POWERS), lim = (this.ring || this.R) * 0.8;
      const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * lim;
      this.items.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, type: types[Math.floor(this.rand() * types.length)], t: 0, id: (this._iid = (this._iid || 0) + 1) });
    }
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k]; it.t += dt;
      if (it.t > 40 || (this.ring && Math.hypot(it.x, it.z) > this.ring)) { this.items.splice(k, 1); continue; }
      for (const s of this.snakes) {
        if (!s.alive) continue;
        if (Math.hypot(s.x - it.x, s.z - it.z) < s.r + 1.6) {
          s.power = { type: it.type, t: POWERS[it.type].dur, dur: POWERS[it.type].dur };
          s.powers++;
          this.events.push({ t: 'power', s: s.id, type: it.type, x: it.x, z: it.z });
          this.items.splice(k, 1); break;
        }
      }
    }
  }
  refill(dt) {
    // natural food keeps the arena stocked (a few per tick, never all at once)
    const want = this.mode.ring ? Math.round(this.foodTarget * Math.max(0.25, (this.ring / this.R) ** 2)) : this.foodTarget;
    let k = Math.min(6, Math.ceil((want - this.nFood) * dt * 2));
    while (k-- > 0) this.spawnFood();
  }
  updateFood(dt) {
    // freshly dropped food glows a little longer (render hint); food outside the ring fizzles
    for (let i = 0; i < FOODCAP; i++) {
      if (!this.fa[i]) continue;
      if (this.ft[i] > 0) this.ft[i] = Math.max(0, this.ft[i] - dt * 0.25);
      if (this.ring && (i & 7) === (Math.floor(this.time * 60) & 7) && this.fx[i] * this.fx[i] + this.fz[i] * this.fz[i] > (this.ring + 6) ** 2 && this.rand() < 0.05) this.killFood(i);
    }
  }

  // ---------- rules per mode
  rules(dt) {
    const S = this.snakes, mode = this.modeId;
    if (this.mode.ring) {
      for (const s of S) {
        if (!s.alive) continue;
        if (Math.hypot(s.x, s.z) > this.ring) {
          s.m -= (8 + s.m * 0.04) * dt; s.outT = (s.outT || 0) + dt;
          if (s.m < START_MASS * 0.8) this.kill(s, null, 'ring');
        } else s.outT = 0;
      }
    }
    if (mode === 'sopravvivenza') {
      // more and smarter rivals as time goes by
      const want = Math.min(16, this.mode.rivals + Math.floor(this.time / 30));
      while (S.length - this.players.length < want) { const s = this.addRival(); this.place(s, this.rivalMass(false)); }
    }
    const P = this.players;
    if (this.mode.time && this.left <= 0) return this.finish('time');
    if (mode === 'sopravvivenza' && P.every((p) => !p.alive)) return this.finish('dead');
    if (mode === 'battaglia') {
      const alive = S.filter((s) => s.alive);
      if (P.every((p) => !p.alive)) return this.finish('dead');
      if (alive.length <= 1) { if (alive[0]) alive[0].placed = 1; return this.finish('last'); }
    }
  }
  ranking() {
    if (this.modeId === 'battaglia') return [...this.snakes].sort((a, b) => (b.alive - a.alive) || (a.alive ? b.m - a.m : a.placed - b.placed));
    return [...this.snakes].sort((a, b) => (b.alive ? b.m : 0) - (a.alive ? a.m : 0) || b.best - a.best);
  }
  finish(why) {
    if (this.over) return;
    this.over = true;
    const rk = this.ranking();
    this.result = {
      why, mode: this.modeId, time: this.time,
      players: this.players.map((p) => ({ id: p.id, name: p.name, pos: rk.indexOf(p) + 1, len: p.alive ? Math.floor(p.m) : 0, best: Math.floor(p.best), kills: p.kills, eaten: p.eaten, deaths: p.deaths, alive: p.alive, aliveT: p.aliveT })),
      ranking: rk.map((s) => ({ id: s.id, name: s.name, player: s.player, len: s.alive ? Math.floor(s.m) : 0, alive: s.alive, color: '#' + s.color.toString(16).padStart(6, '0') })),
      of: this.snakes.length,
    };
    this.trackMissions(0, true);
    this.events.push({ t: 'end', why });
  }
  trackMissions(dt, final) {
    const p = this.players[0]; if (!p || !this.missions.length) return;
    for (const m of this.missions) {
      if (m.done && m.id !== 'nodeath') continue;
      switch (m.id) {
        case 'eat': m.have = p.eaten; break;
        case 'mass': m.have = Math.floor(p.best); break;
        case 'kill': m.have = p.kills; break;
        case 'power': m.have = p.powers; break;
        case 'boost': m.have = Math.floor(p.boostT); break;
        case 'survive': m.have = Math.floor(p.alive ? this.time : m.have); break;
        case 'top': if (final) m.have = this.ranking().indexOf(p) + 1; break;
        case 'nodeath': m.have = p.deaths; m.done = !!final && p.deaths === 0; continue;
      }
      const was = m.done;
      m.done = m.id === 'top' ? !!final && m.have <= m.n && m.have > 0 : m.have >= m.n;
      if (m.done && !was) this.events.push({ t: 'mission', m });
    }
  }

  // ---------- AI
  diffAt(s) {
    const D = this.diff;
    if (this.modeId !== 'sopravvivenza') return D;
    // survival: the pack sharpens over three minutes
    const k = Math.min(1, this.time / 180), H = DIFFS.difficile;
    return { react: D.react + (H.react - D.react) * k, look: D.look + (H.look - D.look) * k, caution: D.caution + (H.caution - D.caution) * k, aggro: D.aggro + (H.aggro - D.aggro) * k, smart: D.smart + (H.smart - D.smart) * k, boost: D.boost };
  }
  // 0 (clear) .. 1 (wall of bodies right ahead) along a ray
  rayDanger(s, cx, cz, look, smart) {
    const n = 7, wall = this.R - s.r * 1.6, ring = this.ring ? this.ring - s.r * 2 : 0;
    const steps = Math.max(2, Math.round(n * (0.55 + smart * 0.45)));
    for (let j = 1; j <= steps; j++) {
      const t = (j / n) * look, px = s.x + cx * t, pz = s.z + cz * t, w = 1 - (j - 1) / n;
      const rr = px * px + pz * pz;
      if (rr > wall * wall) return w;
      if (ring && rr > ring * ring && Math.hypot(s.x, s.z) < ring) return w * 0.75;
      const hit = this.eachSeg(px, pz, s.r + 3.6, (i) => {
        if (this.so[i] === s.id) return;
        const dx = this.sx[i] - px, dz = this.sz[i] - pz, q = this.sr[i] + s.r + 0.9;
        if (dx * dx + dz * dz < q * q) return true;
      });
      if (hit) return w;
      // heads moving into the lane (bigger or equal heads only: a smaller one would die)
      for (const o of this.snakes) {
        if (o === s || !o.alive || o.m < s.m * 0.9) continue;
        const hx = o.x + Math.cos(o.a) * t * 0.6, hz = o.z + Math.sin(o.a) * t * 0.6, q = o.r + s.r + 1.2;
        if ((hx - px) ** 2 + (hz - pz) ** 2 < q * q) return w * 0.9;
      }
    }
    return 0;
  }
  think(s, dt) {
    s.thinkT -= dt;
    if (s.thinkT > 0) return;
    const D = this.diffAt(s), P = PERSONAS[s.pers] || PERSONAS.goloso;
    s.thinkT = D.react * (0.75 + this.rand() * 0.5);
    const look = (8 + s.r * 5) * D.look * (s.boosting ? 1.5 : 1);
    // nearby food: summarised as a few weighted points
    const fd = []; let fx = 0, fz = 0, fw = 0;
    this.eachFood(s.x, s.z, 28, (i) => {
      if (!this.fa[i]) return;
      const dx = this.fx[i] - s.x, dz = this.fz[i] - s.z, d = Math.hypot(dx, dz);
      if (d > 28 || d < 0.01) return;
      const w = this.fv[i] / (d + 3);
      if (fd.length < 60) fd.push(dx / d, dz / d, w);
      fx += dx * w; fz += dz * w; fw += w;
    });
    for (const it of this.items) { const dx = it.x - s.x, dz = it.z - s.z, d = Math.hypot(dx, dz); if (d < 40 && d > 0.01) fd.push(dx / d, dz / d, 2.5 / (d + 3)); }
    // a target: a smaller snake close by
    let tgt = null, td = 1e9;
    for (const o of this.snakes) {
      if (o === s || !o.alive || o.m > s.m * 0.85 || o.spawnT > 0) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (d < 40 + s.r * 4 && d < td) { td = d; tgt = o; }
    }
    const hunt = tgt ? P.hunt * D.aggro : 0;
    let ix = 0, iz = 0;
    if (tgt) {
      // cut it off: aim a few metres in front of its head (or circle it if we are big and patient)
      const lead = 6 + tgt.r * 3 + td * 0.25;
      ix = tgt.x + Math.cos(tgt.a) * lead - s.x; iz = tgt.z + Math.sin(tgt.a) * lead - s.z;
      if (P.circle && s.L > td * 3 && this.rand() < 0.7) { const a = Math.atan2(tgt.z - s.z, tgt.x - s.x) + (s.id & 1 ? 1.25 : -1.25); ix = Math.cos(a); iz = Math.sin(a); }
      const l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l;
    }
    const cands = [];
    for (let k = -5; k <= 5; k++) cands.push(s.a + k * 0.3);
    if (fw > 0) cands.push(Math.atan2(fz, fx));
    if (tgt) cands.push(Math.atan2(iz, ix));
    cands.push(Math.atan2(-s.z, -s.x)); // toward the centre
    let best = s.a, bs = -1e9, bdang = 1;
    for (const a of cands) {
      const cx = Math.cos(a), cz = Math.sin(a);
      const dang = this.rayDanger(s, cx, cz, look, D.smart);
      let food = 0;
      for (let k = 0; k < fd.length; k += 3) { const dot = fd[k] * cx + fd[k + 1] * cz; if (dot > 0.3) food += fd[k + 2] * dot * dot * dot; }
      food = (food * 3) / (food + 1.2);
      let sc = food * P.food * 1.6 - dang * 9 * P.caution * D.caution - Math.abs(wrap(a - s.a)) * 0.25;
      if (tgt) { const dot = ix * cx + iz * cz; sc += Math.max(0, dot) ** 2 * hunt * 1.6; }
      // drift back toward the middle near the wall
      const rr = Math.hypot(s.x, s.z) / this.R; if (rr > 0.75) sc += ((-s.x * cx - s.z * cz) / (rr * this.R)) * (rr - 0.75) * 4;
      if (this.ring) { const q = Math.hypot(s.x, s.z) / this.ring; if (q > 0.8) sc += ((-s.x * cx - s.z * cz) / Math.max(1, Math.hypot(s.x, s.z))) * (q - 0.8) * 8; }
      if (sc > bs) { bs = sc; best = a; bdang = dang; }
    }
    // the occasional slip (easier rivals)
    if (this.rand() < (1 - D.smart) * 0.3) best += (this.rand() - 0.5) * 1.4;
    s.ta = best;
    if (bdang > 0.45 && this.rand() < D.smart) s.boostHold = 0;
    // boost: to snap at a target, to escape, or just for fun (daredevils)
    const canB = s.m > 30 || this.freeBoost || s.power?.type === 'speed';
    if (canB && s.boostHold <= 0) {
      const r = this.rand();
      if (bdang > 0.3) { /* never sprint into trouble */ }
      else if (tgt && td < 26 && r < 0.35 * D.boost * P.boost) s.boostHold = 0.4 + this.rand() * 0.6;
      else if (bdang > 0.5 && r < 0.2 * D.boost * P.caution) s.boostHold = 0.3;
      else if (r < 0.025 * P.boost * D.boost) s.boostHold = 0.5 + this.rand();
      else if (this.ring && Math.hypot(s.x, s.z) > this.ring * 0.95 && r < 0.6) s.boostHold = 0.6;
    }
  }

  // ---------- autopilot for a player (tests, attract): plays like a strong rival
  autopilot(p, on = true) { p.ai = on; if (on) { p.pers = 'goloso'; p.thinkT = 0; } }
}
