// Territorio — pure game logic (no three.js, no DOM): the board grid, movement, trails, loop capture,
// eliminations, power-ups and the AI rivals. Deterministic for a given seed and sequence of step(dt),
// so it runs the same in the browser, in the node unit tests (tools/territorio-test.mjs) and in the
// cover script.
//
// Grid: W x H cells, cell (i, j) has index j * W + i. Cell centres are at (i + 0.5, j + 0.5).
//   own[c]   land id owning the cell (0 neutral, OBST for an obstacle). A land id is the player id in
//            free-for-all modes and TEAM0 + team in team mode.
//   trail[c] id of the player whose trail runs over the cell (0 none).
// Capture: when a player re-enters its land with a trail, the trail becomes land and every cell that
// can no longer reach the edge of the board through non-own cells (4-connected flood from the
// border) is filled. Movement is continuous but cell changes are always 4-connected (a diagonal step
// visits the intermediate cell), so trails never leak through corners.

export const OBST = 255;
export const TEAM0 = 200;

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

// AI personalities: loop = excursion size (cells), risk = how late they turn back with a rival
// around, hunt = appetite for cutting trails, maxTrail = trail length that sends them home.
export const PERSONAS = {
  prudente: { name: 'Prudente', loop: [5, 10], risk: 0.25, hunt: 0.15, maxTrail: 34, wander: 0.2 },
  avido: { name: 'Avido', loop: [11, 22], risk: 0.75, hunt: 0.2, maxTrail: 90, wander: 0.1 },
  cacciatore: { name: 'Cacciatore', loop: [6, 12], risk: 0.5, hunt: 0.95, maxTrail: 44, wander: 0.3 },
  furbo: { name: 'Furbo', loop: [8, 15], risk: 0.4, hunt: 0.55, maxTrail: 60, wander: 0.2 },
  pazzo: { name: 'Scheggia', loop: [9, 26], risk: 1, hunt: 0.4, maxTrail: 120, wander: 0.5 },
};
export const AI_LEVELS = {
  facile: { speed: 0.9, react: 0.32, aim: 0.55, sense: 0.6 },
  normale: { speed: 0.97, react: 0.2, aim: 0.8, sense: 0.85 },
  difficile: { speed: 1, react: 0.12, aim: 1, sense: 1 },
};

export const POWERS = {
  turbo: { name: 'Turbo', dur: 5, color: '#2ee6a6' },
  scudo: { name: 'Scudo', dur: 6, color: '#3aa0ff' },
  gelo: { name: 'Gelo', dur: 2.6, color: '#bfefff' },
};
const POWER_KINDS = Object.keys(POWERS);

const SPEED = 7;          // cells per second
const TURN = 7.5;         // rad per second
const START_R = 3.2;      // radius of the starting land
const RESPAWN = 3;        // seconds

export class Sim {
  // opts: { w, h, seed, obstacles: Uint8Array|null, players: [{ name, human, persona, team, color }],
  //         teams: bool, respawn: { human: bool, ai: bool }, time: seconds|0, ai: 'normale', powers: bool,
  //         target: share (0..1) that ends the match, spawns: [[x,y],...]|null }
  constructor(o) {
    this.o = o;
    const W = this.W = o.w, H = this.H = o.h, N = W * H;
    this.own = new Uint8Array(N); this.trail = new Uint8Array(N);
    this.stamp = new Float32Array(N).fill(-99); // time each cell was last captured (render flash)
    this.seen = new Int32Array(N); this.queue = new Int32Array(N); this.mark = 1;
    if (o.obstacles) for (let c = 0; c < N; c++) if (o.obstacles[c]) this.own[c] = OBST;
    this.free = 0; for (let c = 0; c < N; c++) if (this.own[c] !== OBST) this.free++;
    this.count = new Int32Array(256); this.count[0] = this.free; this.count[OBST] = N - this.free;
    this.rand = rng(o.seed || 1);
    this.t = 0; this.time = o.time || 0; this.over = false; this.events = [];
    this.lvl = AI_LEVELS[o.ai] || AI_LEVELS.normale;
    this.powers = []; this.powerT = 6; this.dirty = true; this.dirtyStamp = true;
    this.players = o.players.map((d, i) => ({
      id: i + 1, name: d.name, human: !!d.human, slot: d.slot ?? -1, persona: PERSONAS[d.persona] ? d.persona : 'furbo', team: d.team ?? -1,
      land: o.teams ? TEAM0 + (d.team || 0) : i + 1, color: d.color,
      x: 0, y: 0, ang: 0, want: 0, cell: -1, alive: false, out: false, trail: [], respawnT: 0,
      turbo: 0, shield: 0, frozen: 0, kills: 0, deaths: 0, best: 0, captured: 0, powers: 0, loops: 0, bigLoop: 0, ai: { plan: null, think: 0 },
    }));
    const spots = o.spawns || this.spawnSpots(this.players.length);
    this.players.forEach((p, i) => this.spawn(p, spots[i]));
  }

  // ---------- helpers
  idx(i, j) { return j * this.W + i; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.H; }
  solid(i, j) { return !this.inside(i, j) || this.own[j * this.W + i] === OBST; }
  setOwn(c, land) { const o = this.own[c]; if (o === land || o === OBST) return; this.count[o]--; this.count[land]++; this.own[c] = land; this.stamp[c] = this.t; }
  share(land) { return this.count[land] / this.free; }
  pctOf(p) { return this.share(p.land) * 100; }
  foe(a, b) { return a !== b && !(this.o.teams && a.team === b.team); }

  spawnSpots(n) {
    const out = [], W = this.W, H = this.H, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34, a0 = this.rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2, r = n > 6 && i % 2 ? R * 0.62 : R;
      out.push(this.findSpot(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return out;
  }
  spotOk(x, y, strict) {
    const r = Math.ceil(START_R) + 1;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const X = Math.floor(x) + i, Y = Math.floor(y) + j;
      if (!this.inside(X, Y)) return false;
      const c = this.idx(X, Y);
      if (this.own[c] === OBST || this.trail[c]) return false;
      if (strict && this.own[c]) return false;
    }
    return true;
  }
  findSpot(x, y) {
    for (let k = 0; k < 400; k++) {
      const r = k * 0.35, a = k * 2.4;
      const X = Math.max(5, Math.min(this.W - 5, x + Math.cos(a) * r)), Y = Math.max(5, Math.min(this.H - 5, y + Math.sin(a) * r));
      if (this.spotOk(X, Y, true)) return [Math.floor(X) + 0.5, Math.floor(Y) + 0.5];
    }
    return [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
  }
  respawnSpot(p) {
    // team mode: back in the team's land when there is some; else a free patch far from the heads
    if (this.o.teams && this.count[p.land] > 30) {
      for (let k = 0; k < 300; k++) {
        const c = (this.rand() * this.W * this.H) | 0;
        if (this.own[c] === p.land && !this.trail[c]) { const i = c % this.W, j = (c / this.W) | 0; if (this.spotOk(i, j, false)) return [i + 0.5, j + 0.5]; }
      }
    }
    let best = null, bs = -1;
    for (let k = 0; k < 60; k++) {
      const x = 6 + this.rand() * (this.W - 12), y = 6 + this.rand() * (this.H - 12);
      if (!this.spotOk(x, y, k < 40)) continue;
      let d = 1e9; for (const q of this.players) if (q.alive) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
      if (d > bs) { bs = d; best = [Math.floor(x) + 0.5, Math.floor(y) + 0.5]; }
    }
    return best || this.findSpot(this.W / 2, this.H / 2);
  }
  spawn(p, at) {
    const [x, y] = at;
    p.x = x; p.y = y; p.alive = true; p.out = false; p.trail = []; p.turbo = 0; p.shield = 1.5; p.frozen = 0; p.respawnT = 0;
    const r = START_R;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      if (i * i + j * j > r * r) continue;
      const X = Math.floor(x) + i, Y = Math.floor(y) + j;
      if (this.inside(X, Y)) { const c = this.idx(X, Y); if (!this.trail[c]) this.setOwn(c, p.land); }
    }
    p.cell = this.idx(Math.floor(x), Math.floor(y));
    p.ang = Math.atan2(this.H / 2 - y, this.W / 2 - x); p.want = p.ang;
    p.ai = { plan: null, think: 0 };
    this.dirty = this.dirtyStamp = true;
    this.events.push({ type: 'spawn', p });
  }

  // ---------- main step
  step(dt) {
    if (this.over) return;
    this.t += dt;
    if (this.o.time) { this.time = Math.max(0, this.o.time - this.t); if (this.time <= 0) { this.finish('time'); return; } }
    for (const p of this.players) {
      if (!p.alive) {
        if (p.respawnT > 0) { p.respawnT -= dt; if (p.respawnT <= 0) this.spawn(p, this.respawnSpot(p)); }
        continue;
      }
      p.turbo = Math.max(0, p.turbo - dt); p.shield = Math.max(0, p.shield - dt); p.frozen = Math.max(0, p.frozen - dt);
      if (!p.human || p.auto) this.think(p, dt);
    }
    // sub-steps: nobody moves more than 0.45 cells at once
    const vmax = SPEED * 1.5 * dt, n = Math.max(1, Math.ceil(vmax / 0.45)), h = dt / n;
    for (let s = 0; s < n; s++) {
      for (const p of this.players) if (p.alive) this.move(p, h);
      this.heads();
    }
    this.updatePowers(dt);
    for (const p of this.players) if (p.alive) p.best = Math.max(p.best, this.share(p.land));
    this.checkEnd();
  }
  speedOf(p) { return p.frozen > 0 ? 0 : SPEED * (p.turbo > 0 ? 1.45 : 1) * (p.human && !p.auto ? 1 : this.lvl.speed); }
  move(p, h) {
    // turn toward the wanted heading at a limited rate (no instant U-turns)
    let d = p.want - p.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    const tr = TURN * h; p.ang = Math.atan2(Math.sin(p.ang + Math.max(-tr, Math.min(tr, d))), Math.cos(p.ang + Math.max(-tr, Math.min(tr, d))));
    const v = this.speedOf(p) * h; if (!v) return;
    let nx = p.x + Math.cos(p.ang) * v, ny = p.y + Math.sin(p.ang) * v;
    // walls and obstacles: slide along them
    if (this.solid(Math.floor(nx), Math.floor(ny))) {
      const okX = !this.solid(Math.floor(nx), Math.floor(p.y)), okY = !this.solid(Math.floor(p.x), Math.floor(ny));
      if (okX && (!okY || Math.abs(Math.cos(p.ang)) >= Math.abs(Math.sin(p.ang)))) ny = p.y;
      else if (okY) nx = p.x;
      else { nx = p.x; ny = p.y; }
      if (!p.bumpT || this.t - p.bumpT > 0.6) { p.bumpT = this.t; this.events.push({ type: 'bump', p }); }
      if (!p.human || p.auto) p.ai.plan = null;
    }
    const oi = Math.floor(p.x), oj = Math.floor(p.y), ni = Math.floor(nx), nj = Math.floor(ny);
    p.x = nx; p.y = ny;
    if (oi === ni && oj === nj) return;
    if (oi !== ni && oj !== nj) {
      // diagonal: visit the cell the path crossed first (keeps the trail 4-connected)
      const fx = ni > oi ? (oi + 1 - (p.x - Math.cos(p.ang) * v)) : ((p.x - Math.cos(p.ang) * v) - oi);
      const fy = nj > oj ? (oj + 1 - (p.y - Math.sin(p.ang) * v)) : ((p.y - Math.sin(p.ang) * v) - oj);
      const tx = Math.abs(fx / (Math.cos(p.ang) || 1e-6)), ty = Math.abs(fy / (Math.sin(p.ang) || 1e-6));
      const mid = tx < ty ? [ni, oj] : [oi, nj];
      if (this.solid(mid[0], mid[1])) { const alt = tx < ty ? [oi, nj] : [ni, oj]; if (!this.solid(alt[0], alt[1])) this.enter(p, this.idx(alt[0], alt[1])); }
      else this.enter(p, this.idx(mid[0], mid[1]));
      if (!p.alive) return;
    }
    this.enter(p, this.idx(ni, nj));
  }
  enter(p, c) {
    if (c === p.cell) return;
    p.cell = c;
    const t = this.trail[c];
    if (t) {
      if (t === p.id) {
        const L = p.trail.length;
        // brushing the last couple of cells of your own trail (a tight turn) is not a cut
        if (!(L && (p.trail[L - 1] === c || p.trail[L - 2] === c || p.trail[L - 3] === c))) {
          if (p.shield <= 0) { this.kill(p, p, 'self'); return; }
        }
      } else {
        const q = this.players[t - 1];
        if (this.foe(p, q) && q.alive && q.shield <= 0) this.kill(q, p, 'cut');
      }
    }
    if (this.own[c] === p.land) {
      p.out = false;
      if (p.trail.length) this.capture(p);
    } else {
      p.out = true;
      if (!this.trail[c]) { this.trail[c] = p.id; this.dirty = true; }
      if (p.trail[p.trail.length - 1] !== c) p.trail.push(c);
    }
  }
  heads() {
    const P = this.players;
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
      const p = P[a], q = P[b];
      if (!p.alive || !q.alive || !this.foe(p, q)) continue;
      if (Math.abs(p.x - q.x) > 0.8 || Math.abs(p.y - q.y) > 0.8) continue;
      // head-on: whoever is out of its land loses; both out → the longer trail loses (both on a tie)
      let kp = false, kq = false;
      if (p.out && !q.out) kp = true; else if (q.out && !p.out) kq = true;
      else if (p.out && q.out) { if (p.trail.length >= q.trail.length) kp = true; if (q.trail.length >= p.trail.length) kq = true; }
      if (kp && p.shield <= 0) this.kill(p, q, 'head');
      if (kq && q.shield <= 0) this.kill(q, p, 'head');
    }
  }

  // ---------- capture: trail → land, then flood the outside from the border; the rest is enclosed
  capture(p) {
    const L = p.land, W = this.W, H = this.H, own = this.own;
    const before = this.count[L], len = p.trail.length;
    for (const c of p.trail) { if (this.trail[c] === p.id) this.trail[c] = 0; this.setOwn(c, L); }
    p.trail = []; p.out = false;
    // bounding box of the land: everything outside it can reach the border for sure
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let j = 0; j < H; j++) { const r = j * W; for (let i = 0; i < W; i++) if (own[r + i] === L) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; } }
    if (x1 >= 0) {
      const m = ++this.mark, seen = this.seen, q = this.queue; let qh = 0, qt = 0;
      const X0 = x0 - 1, Y0 = y0 - 1, X1 = x1 + 1, Y1 = y1 + 1; // the ring around the box is "outside"
      const push = (i, j) => {
        if (i < X0 || j < Y0 || i > X1 || j > Y1) return;
        if (i < 0 || j < 0 || i >= W || j >= H) return;
        const c = j * W + i; if (seen[c] === m || own[c] === L) return; seen[c] = m; q[qt++] = c;
      };
      for (let i = X0; i <= X1; i++) { push(i, Y0); push(i, Y1); }
      for (let j = Y0; j <= Y1; j++) { push(X0, j); push(X1, j); }
      // cells of the box on the board edge touch the outside of the board too
      for (let i = Math.max(0, X0); i <= Math.min(W - 1, X1); i++) { if (y0 === 0) push(i, 0); if (y1 === H - 1) push(i, H - 1); }
      for (let j = Math.max(0, Y0); j <= Math.min(H - 1, Y1); j++) { if (x0 === 0) push(0, j); if (x1 === W - 1) push(W - 1, j); }
      while (qh < qt) { const c = q[qh++], i = c % W, j = (c / W) | 0; push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
      for (let j = Math.max(0, y0); j <= y1; j++) for (let i = Math.max(0, x0); i <= x1; i++) {
        const c = j * W + i; if (seen[c] !== m && own[c] !== L && own[c] !== OBST) this.setOwn(c, L);
      }
    }
    const gained = this.count[L] - before;
    p.captured += gained; p.loops++; p.bigLoop = Math.max(p.bigLoop, gained);
    this.dirty = this.dirtyStamp = true;
    this.events.push({ type: 'capture', p, n: gained, len, pct: (gained / this.free) * 100 });
    // a rival left without land is out
    for (const q of this.players) if (q.alive && q.land !== L && this.count[q.land] <= 0) this.kill(q, p, 'land');
    // power-ups swallowed by the new land are taken
    for (const pw of this.powers) if (!pw.taken && own[this.idx(Math.floor(pw.x), Math.floor(pw.y))] === L && Math.hypot(pw.x - p.x, pw.y - p.y) < 30) this.take(p, pw);
  }

  kill(q, by, why) {
    if (!q.alive) return;
    q.alive = false; q.out = false; q.deaths++;
    const len = q.trail.length;
    for (const c of q.trail) if (this.trail[c] === q.id) this.trail[c] = 0;
    q.trail = [];
    if (!this.o.teams) { const L = q.land, own = this.own; for (let c = 0; c < own.length; c++) if (own[c] === L) { this.count[L]--; this.count[0]++; own[c] = 0; this.stamp[c] = this.t; } this.dirtyStamp = true; }
    const R = this.o.respawn || {};
    q.respawnT = (q.human ? R.human : R.ai) ? RESPAWN : 0;
    if (by && by !== q) by.kills++;
    this.dirty = true;
    this.events.push({ type: 'kill', p: q, by, why, len, x: q.x, y: q.y });
  }

  // ---------- power-ups
  updatePowers(dt) {
    if (this.o.powers === false) return;
    this.powerT -= dt;
    this.powers = this.powers.filter((pw) => !pw.taken && (pw.life -= dt) > 0);
    if (this.powerT <= 0 && this.powers.length < 3 + (this.players.length > 6 ? 1 : 0)) {
      this.powerT = 7 + this.rand() * 6;
      for (let k = 0; k < 40; k++) {
        const i = 3 + ((this.rand() * (this.W - 6)) | 0), j = 3 + ((this.rand() * (this.H - 6)) | 0), c = this.idx(i, j);
        if (this.own[c] === OBST || this.trail[c]) continue;
        if (this.players.some((p) => p.alive && Math.hypot(p.x - i, p.y - j) < 6)) continue;
        this.powers.push({ x: i + 0.5, y: j + 0.5, kind: POWER_KINDS[(this.rand() * POWER_KINDS.length) | 0], life: 22, id: (this.pid = (this.pid || 0) + 1) });
        break;
      }
    }
    for (const pw of this.powers) for (const p of this.players) if (p.alive && !pw.taken && Math.abs(p.x - pw.x) < 1.1 && Math.abs(p.y - pw.y) < 1.1) this.take(p, pw);
  }
  take(p, pw) {
    pw.taken = true; p.powers++;
    const D = POWERS[pw.kind];
    if (pw.kind === 'turbo') p.turbo = D.dur;
    else if (pw.kind === 'scudo') p.shield = D.dur;
    else for (const q of this.players) if (q.alive && this.foe(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < 40) q.frozen = D.dur;
    this.events.push({ type: 'power', p, kind: pw.kind, x: pw.x, y: pw.y });
  }

  // ---------- end of the match
  checkEnd() {
    const humans = this.players.filter((p) => p.human);
    const target = this.o.target || 0;
    for (const p of this.players) if (target && p.alive && this.share(p.land) >= target) { this.finish('target', p); return; }
    if (humans.length && humans.every((p) => !p.alive && p.respawnT <= 0)) { this.finish('out'); return; }
    if (this.o.lastStanding) {
      const alive = this.players.filter((p) => p.alive || p.respawnT > 0);
      const sides = new Set(alive.map((p) => (this.o.teams ? 't' + p.team : p.id)));
      if (sides.size <= 1) this.finish('last', alive[0]);
    }
  }
  finish(why, who) { if (this.over) return; this.over = true; this.why = why; this.winnerP = who || null; this.events.push({ type: 'end', why, p: who }); }
  ranking() {
    if (this.o.teams) {
      const teams = [...new Set(this.players.map((p) => p.team))].map((t) => ({ team: t, land: TEAM0 + t, pct: this.share(TEAM0 + t) * 100, players: this.players.filter((p) => p.team === t) }));
      return teams.sort((a, b) => b.pct - a.pct);
    }
    return [...this.players].sort((a, b) => (this.count[b.land] - this.count[a.land]) || (b.alive - a.alive) || (b.best - a.best));
  }

  // ---------- AI
  nearestOwn(p, maxR = 40) {
    const ci = Math.floor(p.x), cj = Math.floor(p.y);
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let k = -r; k <= r; k++) for (const [i, j] of [[ci + k, cj - r], [ci + k, cj + r], [ci - r, cj + k], [ci + r, cj + k]]) {
        if (!this.inside(i, j) || this.own[this.idx(i, j)] !== p.land) continue;
        const d = Math.hypot(i + 0.5 - p.x, j + 0.5 - p.y); if (d < bd) { bd = d; best = [i + 0.5, j + 0.5]; }
      }
      if (best) return { x: best[0], y: best[1], d: bd };
    }
    return null;
  }
  // how many cells straight ahead are safe (no wall/obstacle, no own trail) up to n
  clear(p, ang, n) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 1; s <= n; s++) {
      const i = Math.floor(p.x + dx * s * 0.9), j = Math.floor(p.y + dy * s * 0.9);
      if (this.solid(i, j)) return s - 1;
      const c = this.idx(i, j);
      if (this.trail[c] === p.id && !p.trail.slice(-3).includes(c)) return s - 1;
    }
    return n;
  }
  openness(p, ang, n) {
    let s = 0; const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let k = 2; k <= n; k += 2) {
      const i = Math.floor(p.x + dx * k), j = Math.floor(p.y + dy * k);
      if (this.solid(i, j)) break;
      const o = this.own[this.idx(i, j)];
      s += o === p.land ? 0 : o ? 1.4 : 1;
    }
    return s;
  }
  think(p, dt) {
    const A = p.ai, L = this.lvl, per = PERSONAS[p.persona];
    A.think -= dt; if (A.think > 0 && !(p.out && this.clear(p, p.ang, 2) < 2)) return; A.think = L.react * (0.7 + this.rand() * 0.6);
    const own = this.own[p.cell] === p.land;
    let goal = null;
    // threat: closest foe head to any of my trail cells, against my way home
    if (p.trail.length) {
      const home = this.nearestOwn(p, 90) || { x: p.x, y: p.y, d: 0 };
      let threat = 1e9;
      for (const q of this.players) {
        if (!q.alive || !this.foe(p, q) || q.frozen > 0) continue;
        for (let k = 0; k < p.trail.length; k += 3) { const c = p.trail[k]; threat = Math.min(threat, Math.hypot(q.x - (c % this.W) - 0.5, q.y - ((c / this.W) | 0) - 0.5)); }
        threat = Math.min(threat, Math.hypot(q.x - p.x, q.y - p.y));
      }
      const margin = 3 + (1 - per.risk) * 8;
      if (p.shield <= 0 && threat * L.sense < home.d * 1.05 + margin) A.plan = { ret: true };
      if (p.trail.length > per.maxTrail) A.plan = { ret: true };
      if (A.plan?.ret) goal = home;
    }
    // hunting: a foe out of its land with a trail I can reach before it gets home
    if (!goal && this.rand() < per.hunt * L.aim) {
      let best = null, bd = 18 + per.hunt * 14;
      for (const q of this.players) {
        if (!q.alive || !this.foe(p, q) || !q.trail.length || q.shield > 0) continue;
        for (let k = 0; k < q.trail.length; k += 2) {
          const c = q.trail[k], x = (c % this.W) + 0.5, y = ((c / this.W) | 0) + 0.5, d = Math.hypot(x - p.x, y - p.y);
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (best && (!p.trail.length || p.trail.length < per.maxTrail * 0.5)) goal = best;
    }
    if (!goal) {
      if (!A.plan || A.plan.ret) {
        if (A.plan?.ret && p.trail.length) goal = this.nearestOwn(p, 90);
        else if (own) {
          // pick a direction toward open land and plan a rectangle: out, sideways, home
          let ba = p.ang, bs = -1;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2, s = this.openness(p, a, 16) + this.clear(p, a, 6) * 0.5 + this.rand() * 3;
            if (s > bs) { bs = s; ba = a; }
          }
          const len = per.loop[0] + this.rand() * (per.loop[1] - per.loop[0]);
          const side = this.rand() < 0.5 ? 1 : -1;
          A.plan = { legs: [[ba, len], [ba + side * Math.PI / 2, len * (0.6 + this.rand() * 0.6)], [ba + side * Math.PI, len * 0.8]], i: 0, sx: p.x, sy: p.y, home: true };
        } else A.plan = { ret: true };
      }
      if (A.plan && !A.plan.ret && A.plan.legs) {
        const P = A.plan, leg = P.legs[P.i];
        // inside our land the first leg only starts counting once we leave it
        if (own && P.i === 0) { P.sx = p.x; P.sy = p.y; }
        const done = Math.hypot(p.x - P.sx, p.y - P.sy) >= leg[1];
        if (done) { P.i++; P.sx = p.x; P.sy = p.y; if (P.i >= P.legs.length) A.plan = { ret: true }; }
        if (A.plan.legs) { const a = A.plan.legs[A.plan.i][0]; goal = { x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10 }; }
        else goal = this.nearestOwn(p);
        if (!p.trail.length && !own) { /* lost: straight home */ goal = this.nearestOwn(p) || goal; }
      }
      if (A.plan?.ret && !p.trail.length && own) A.plan = null;
    }
    if (!goal) goal = { x: this.W / 2, y: this.H / 2 };
    let want = Math.atan2(goal.y - p.y, goal.x - p.x);
    // local avoidance: the clear heading closest to the wanted one (and cheapest to turn to)
    const look = 4 + Math.round(this.speedOf(p) * 0.35);
    if (this.clear(p, want, look) < look) {
      let bs = -1e9, best = want;
      for (let k = 0; k < 24; k++) {
        const a = want + ((k < 12 ? k : k - 24) * Math.PI) / 12, c = this.clear(p, a, 12);
        const turn = Math.abs(Math.atan2(Math.sin(a - p.ang), Math.cos(a - p.ang)));
        const sc = Math.min(c, look + 2) * 3 + Math.cos(a - want) * 5 - turn * 2;
        if (sc > bs) { bs = sc; best = a; }
      }
      want = best;
    }
    p.want = want + (this.rand() - 0.5) * (1 - L.aim) * 0.4;
  }
}
