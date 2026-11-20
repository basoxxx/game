// Festa Baso — skill and brain minigames: Più vicino alla buca (Minigolf physics), Ingorgo lampo (Ingorgo
// generator + solver), Corsa all'officina (Officina merge), Semaforo (reflexes), Ritmo Baso (rhythm) and
// Memoria a colori (memory). Pure simulations, see base.js. CPU players may act through `inp.m` macros.
import { Base } from './base.js';
import { clamp, angDiff } from '../util.js';
import { Sim as GolfSim, DT as GDT } from '../../minigolf/physics.js';
import { compile, initState, carRange, apply, isGoal, solve, EXITED, occupancy } from '../../ingorgo/core.js';
import { JAMS } from '../data/ingorgo-bank.js';

// ─────────────────────────────── Più vicino alla buca: two shots each, the closest ball wins
export const GOLF_HOLE = { rows: ['.______.', '________', '___H____', '________', '__s__s__', '________', '_B____B_', '________', '___XX___', '________', '________', '___S____'] };
const tri = (p) => { const u = p % 2; return u < 1 ? u : 2 - u; };
let golfPlan = null;
const GOLF_BANKS = [[-0.73, 0.98], [-0.73, 0.97], [0.62, 0.96], [0.61, 0.95], [-0.52, 0.93], [-0.5, 0.93], [0.6, 0.96], [-0.74, 0.98], [-0.64, 0.8], [0.8, 0.96]];
export class Golf extends Base {
  constructor(o) {
    super(o, 50);
    this.low = true; this.unit = 'cm'; this.shots = 2;
    this.g = Array.from({ length: this.n }, () => { const s = new GolfSim(GOLF_HOLE); return { sim: s, ang: 0, pow: 0, ph: 0, charging: false, left: this.shots, best: 99, last: null, wait: 0, state: 'aim' }; });
    const s0 = this.g[0].sim; this.cup = s0.cup; this.tee = s0.teePos;
    this.d0 = Math.hypot(this.tee[0] - this.cup.x, this.tee[2] - this.cup.z);
    this.score = new Array(this.n).fill(this.d0 * 100);
    this.acc = 0;
  }
  dist(sim) { return sim.state === 'holed' ? 0 : Math.hypot(sim.p[0] - this.cup.x, sim.p[2] - this.cup.z); }
  update(dt, inp) {
    this.acc += dt; let steps = 0; while (this.acc >= GDT) { this.acc -= GDT; steps++; }
    for (let i = 0; i < this.n; i++) {
      const g = this.g[i], I = inp[i];
      for (let k = 0; k < steps; k++) g.sim.step();
      if (g.state === 'aim') {
        g.ang = clamp(g.ang + I.x * 0.9 * dt, -1.2, 1.2);
        if (I.a) { if (!g.charging) { g.charging = true; g.ph = 0; } g.ph += dt * 1.1; g.pow = tri(g.ph); }
        else if (g.charging) { g.charging = false; g.sim.shoot(g.ang, Math.max(0.03, g.pow)); g.state = 'roll'; g.left--; this.ev('shot', { i }); }
      } else if (g.state === 'roll') {
        const st = g.sim.state;
        if (st !== 'moving') {
          const d = st === 'penalty' ? 99 : this.dist(g.sim);
          g.last = d; if (d < g.best) { g.best = d; g.at = this.t; } g.state = 'wait'; g.wait = 1.4;
          this.ev(st === 'holed' ? 'holed' : st === 'penalty' ? 'out' : 'rest', { i, d });
          this.score[i] = Math.min(g.best, this.d0) * 100;
        }
      } else if (g.state === 'wait') {
        g.wait -= dt;
        if (g.wait <= 0) { if (g.left > 0 && g.best > 0) { g.sim.reset(g.sim.teePos); g.state = 'aim'; g.pow = 0; } else g.state = 'done'; }
      }
    }
    if (this.g.every((g) => g.state === 'done')) this.finish();
  }
  plan() {
    if (golfPlan) return golfPlan;
    const c = this.cup, base = Math.atan2(c.x - this.tee[0], -(c.z - this.tee[2])), out = [];
    const s = new GolfSim(GOLF_HOLE);
    const ev = (a, p) => { s.reset(s.teePos); s.shoot(a, p); s.run(12); out.push({ a, p, d: s.state === 'holed' ? 0 : s.state === 'penalty' ? 99 : Math.hypot(s.p[0] - c.x, s.p[2] - c.z) }); };
    // the wall on the straight line sends a plain shot back: the good lines bank off the side walls (found
    // offline with a fine search of the whole angle / power range, checked again here against the physics)
    for (const [a, p] of GOLF_BANKS) for (const da of [-0.01, 0, 0.01]) ev(base + a + da, p);
    for (let da = -0.12; da <= 0.121; da += 0.03) for (let p = 0.3; p <= 0.8; p += 0.05) ev(base + da, p);
    out.sort((a, b) => a.d - b.d);
    return (golfPlan = out);
  }
  ai(i, inp, dt) {
    const g = this.g[i], sk = this.skill[i];
    if (g.state !== 'aim') return;
    if (!g.tgt) { const pl = this.plan(), k = Math.min(pl.length - 1, Math.floor(this.ar() * (1 - sk) * 10)); g.tgt = { a: pl[k].a + (this.ar() - 0.5) * (0.03 + (1 - sk) * 0.1), p: clamp(pl[k].p + (this.ar() - 0.5) * (0.02 + (1 - sk) * 0.12), 0.05, 1) }; }
    const da = angDiff(g.ang, g.tgt.a);
    if (Math.abs(da) > 0.01 && !g.charging) { inp.x = clamp(da * 20, -1, 1); return; }
    if (!g.charging) { inp.a = true; return; }
    const rising = (g.ph % 2) < 1;
    inp.a = !(rising && g.pow >= g.tgt.p - 0.012);
    if (!inp.a) g.tgt = null;
  }
  // two balls in the cup: the one holed with the first shot wins, then the quicker one
  tie() { return this.g.map((g) => g.left * 1000 - (g.at || 0)); }
  hud(i) { const g = this.g[i]; return g.best < 99 ? `Migliore ${Math.round(g.best * 100)} cm · tiri ${g.left}` : `Tiri ${g.left}`; }
  result() { const r = super.result(); r.scores = this.g.map((g) => (g.best < 99 ? Math.round(g.best * 100) : null)); return r; }
}

// ─────────────────────────────── Ingorgo lampo: the same jam for everybody, free the red car first
export class Ingorgo extends Base {
  constructor(o) {
    super(o, 60);
    this.unit = 'ingorghi'; this.levels = [];
    this.p = Array.from({ length: this.n }, () => ({ k: -1, s: null, cx: 0, cy: 0, moves: 0, solved: 0, at: 0, aiT: 1.5, path: null, flash: 0 }));
    for (let i = 0; i < this.n; i++) this.next(i);
  }
  level(k) {
    while (this.levels.length <= k) {
      // easy jams first, then harder ones; which ones depends on the seed (same for every player)
      const j = this.levels.length, tier = Math.min(5, j), pool = JAMS.filter((_, k) => k % 6 === tier);
      const L = pool[(this.seed + j * 3) % pool.length];
      const B = compile(L); this.levels.push({ L, B, s0: initState(B, L) });
    }
    return this.levels[k];
  }
  next(i) {
    const p = this.p[i]; p.k++; const lv = this.level(p.k); p.s = lv.s0.slice(); p.path = null;
    const h = lv.B.cars[lv.B.hero]; p.cx = h.x; p.cy = h.y;
  }
  carAt(B, s, x, y) { const occ = occupancy(B, s); const v = occ[y * B.w + x]; return v && v !== 255 ? v - 1 : -1; }
  move(i, m) {
    const p = this.p[i], { B } = this.levels[p.k];
    p.s = apply(B, p.s, m); p.moves++; this.ev('move', { i });
    if (m[1] !== EXITED) { const c = B.cars[m[0]]; if (c.ax === 0) p.cx = clamp(p.cx, m[1], m[1] + c.len - 1); else p.cy = clamp(p.cy, m[1], m[1] + c.len - 1); }
    if (isGoal(B, p.s)) { p.solved++; p.at = this.t; this.score[i] = p.solved; this.ev('solved', { i, k: p.k }); p.flash = 0.8; this.next(i); }
  }
  update(dt, inp) {
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], I = inp[i], { B } = this.levels[p.k]; p.flash = Math.max(0, p.flash - dt);
      if (I.m) { this.move(i, I.m); continue; }
      const d = this.tap(i, I, dt);
      if (d < 0) continue;
      const dx = [0, 1, 0, -1][d], dy = [-1, 0, 1, 0][d];
      if (I.a) {
        const ci = this.carAt(B, p.s, p.cx, p.cy); if (ci < 0) continue;
        const c = B.cars[ci]; if ((c.ax === 0) !== (dx !== 0)) continue;
        const dir = dx || dy, r = carRange(B, p.s, ci), np = p.s[ci] + dir;
        if (np >= r.lo && np <= r.hi) { this.move(i, [ci, np]); if (c.ax === 0) p.cx += dx; else p.cy += dy; }
        else if ((dir > 0 && r.outHi && np > r.hi) || (dir < 0 && r.outLo && np < r.lo)) this.move(i, [ci, EXITED]);
      } else { p.cx = clamp(p.cx + dx, 0, B.w - 1); p.cy = clamp(p.cy + dy, 0, B.h - 1); }
    }
  }
  ai(i, inp, dt) {
    const p = this.p[i], sk = this.skill[i], { B } = this.levels[p.k];
    p.aiT -= dt; if (p.aiT > 0) return;
    p.aiT = 1.5 - sk * 0.95 + this.ar() * 0.4;
    if (!p.path || !p.path.length) { const r = solve(B, p.s, 60000); p.path = r ? r.moves.slice() : []; }
    const m = p.path.shift(); if (!m) return;
    const c = B.cars[m[0]]; p.cx = c.ax === 0 ? clamp(p.s[m[0]], 0, B.w - 1) : c.fix; p.cy = c.ax === 0 ? c.fix : clamp(p.s[m[0]], 0, B.h - 1);
    inp.m = m;
  }
  // equal jams freed: who freed the last one first, then fewer moves
  tie() { return this.p.map((p) => -p.at * 1000 - p.moves); }
  hud(i) { return `${this.p[i].solved} liberati`; }
}

// ─────────────────────────────── Corsa all'officina: merge identical cars, first to a level-7 racer
export const OF_MAX = 6;
export class Officina extends Base {
  constructor(o) {
    super(o, 55);
    this.cols = 4; this.rows = 3; this.unit = 'livello';
    this.p = Array.from({ length: this.n }, () => ({ grid: new Array(12).fill(0), cx: 0, cy: 0, held: -1, best: 1, bestAt: 0, aiT: 1, buy: 0 }));
    for (const p of this.p) { p.grid[0] = 1; p.grid[1] = 1; }
    this.spawnT = 1.2; this.wave = 0;
  }
  val(p) { return p.grid.reduce((a, t) => a + (t ? 2 ** (t - 1) : 0), 0); }
  act(i, from, to) {
    const p = this.p[i], g = p.grid;
    if (from === to || !g[from]) return;
    if (g[to] === g[from] && g[to] < OF_MAX) { g[to]++; g[from] = 0; this.ev('merge', { i, cell: to, t: g[to] }); if (g[to] > p.best) { p.best = g[to]; p.bestAt = this.t; } }
    else { const t = g[to]; g[to] = g[from]; g[from] = t; this.ev('swap', { i }); }
  }
  update(dt, inp) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5; this.wave++;
      const lv = this.wave % 5 === 0 ? 2 : 1, r = this.r();
      for (let i = 0; i < this.n; i++) { const p = this.p[i], free = p.grid.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0); if (free.length) { const c = free[Math.floor(r * free.length)]; p.grid[c] = lv; this.ev('spawn', { i, cell: c }); } }
    }
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], I = inp[i]; p.buy -= dt;
      if (I.m) { if (I.m[0] === 'buy') { if (!p.grid[I.m[1]] && p.buy <= 0) { p.grid[I.m[1]] = 1; p.buy = 0.45; this.ev('buy', { i, cell: I.m[1] }); } } else this.act(i, I.m[0], I.m[1]); p.held = -1; continue; }
      const d = this.tap(i, I, dt);
      if (d >= 0) { p.cx = clamp(p.cx + [0, 1, 0, -1][d], 0, this.cols - 1); p.cy = clamp(p.cy + [-1, 0, 1, 0][d], 0, this.rows - 1); }
      if (I.ap) {
        const c = p.cy * this.cols + p.cx;
        if (p.held < 0) { if (p.grid[c]) p.held = c; else if (p.buy <= 0) { p.grid[c] = 1; p.buy = 0.45; this.ev('buy', { i, cell: c }); } }
        else { this.act(i, p.held, c); p.held = -1; }
      }
    }
    this.score = this.p.map((p) => p.best);
    if (this.p.some((p) => p.best >= OF_MAX)) this.finish();
  }
  ai(i, inp, dt) {
    const p = this.p[i], sk = this.skill[i]; p.aiT -= dt; if (p.aiT > 0) return;
    const g = p.grid; let pair = null;
    for (let t = OF_MAX - 1; t >= 1 && !pair; t--) { const ks = g.map((v, k) => (v === t ? k : -1)).filter((k) => k >= 0); if (ks.length >= 2) pair = ks; }
    if (!pair) { const free = g.findIndex((v) => !v); p.aiT = 0.35 + (1 - sk) * 0.4 + this.ar() * 0.2; if (free >= 0) { p.cx = free % 4; p.cy = Math.floor(free / 4); inp.m = ['buy', free]; } return; }
    const [a, b] = pair; const dist = Math.abs((a % 4) - (b % 4)) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4));
    p.aiT = 0.45 + dist * (0.2 - sk * 0.12) + (1 - sk) * 0.5 + this.ar() * 0.25;
    p.cx = b % 4; p.cy = Math.floor(b / 4); inp.m = [a, b];
  }
  // same top level: who got there first, then the garage worth more
  tie() { return this.p.map((p) => -p.bestAt * 1000 + this.val(p) * 1e-3); }
  hud(i) { return `Livello max ${this.p[i].best}`; }
}

// ─────────────────────────────── Semaforo: five red lights, go when they go out (false starts cost)
export class Riflessi extends Base {
  constructor(o) {
    super(o, 0);
    this.rounds = 5; this.round = 0; this.unit = 'punti';
    this.best = new Array(this.n).fill(null); this.sum = new Array(this.n).fill(0);
    this.newRound();
  }
  newRound() {
    this.ph = 'lights'; this.pt = 0; this.lit = 0; this.hold = 0.6 + this.r() * 1.8; this.goT = 0;
    this.rt = new Array(this.n).fill(null); this.fs = new Array(this.n).fill(false); this.pts = new Array(this.n).fill(0);
    this.aiPlan = this.skill.map((sk) => ({ fs: this.ar() < 0.05 * (1 - sk), at: 0.17 + (1 - sk) * 0.22 + this.ar() * 0.08, fsAt: 0.5 + this.ar() * 2.5 }));
  }
  update(dt, inp) {
    this.pt += dt;
    if (this.ph === 'lights') { this.lit = Math.min(5, Math.floor(this.pt / 0.55) + 1); if (this.pt >= 5 * 0.55) { this.ph = 'hold'; this.pt = 0; } }
    else if (this.ph === 'hold' && this.pt >= this.hold) { this.ph = 'go'; this.pt = 0; this.lit = 0; this.ev('go'); }
    for (let i = 0; i < this.n; i++) {
      if (!inp[i].ap || this.rt[i] != null || this.fs[i]) continue;
      if (this.ph === 'lights' || this.ph === 'hold') { this.fs[i] = true; this.score[i] -= 1; this.pts[i] = -1; this.ev('false', { i }); }
      else if (this.ph === 'go') { this.rt[i] = this.pt; this.sum[i] += this.pt; if (this.best[i] == null || this.pt < this.best[i]) this.best[i] = this.pt; this.ev('press', { i, rt: this.pt }); }
    }
    if (this.ph === 'go' && (this.pt > 1.5 || this.rt.every((r, i) => r != null || this.fs[i]))) {
      const order = this.rt.map((r, i) => [r, i]).filter(([r]) => r != null).sort((a, b) => a[0] - b[0]);
      order.forEach(([, i], k) => { const pt = [3, 2, 1, 0][k] || 0; this.pts[i] = pt; this.score[i] += pt; });
      this.ph = 'show'; this.pt = 0; this.ev('round', { order: order.map((o) => o[1]) });
    } else if (this.ph === 'show' && this.pt > 1.6) { if (++this.round >= this.rounds) this.finish(); else this.newRound(); }
    if (this.t > 70) this.finish();
  }
  ai(i, inp) {
    const pl = this.aiPlan[i];
    if (pl.fs && (this.ph === 'hold' || this.ph === 'lights') && this.pt > pl.fsAt * 0.5 && this.ph === 'hold') { inp.ap = true; pl.fs = false; }
    if (this.ph === 'go' && this.pt >= pl.at) inp.ap = true;
  }
  tie() { return this.best.map((b, i) => (b == null ? -1e6 : -b * 1000 - this.sum[i])); }
  hud(i) { return `${this.score[i]} pt${this.best[i] != null ? ` · ${Math.round(this.best[i] * 1000)} ms` : ''}`; }
}

// ─────────────────────────────── Ritmo Baso: tap on the beat (perfect / great / ok), stray taps cost
export class Ritmo extends Base {
  constructor(o) {
    super(o, 0);
    this.beat = 0.5; this.unit = 'punti';
    const notes = [];
    for (let b = 4; b < 58; b++) {
      const bar = b % 8, r = this.r();
      if (bar === 7 && r < 0.6) continue;
      if (r < 0.78) notes.push(b * this.beat);
      if (b > 16 && r > 0.82) notes.push((b + 0.5) * this.beat);
    }
    this.notes = notes.sort((a, b) => a - b); this.end = this.notes[this.notes.length - 1] + 1.5;
    this.p = Array.from({ length: this.n }, () => ({ judged: new Int8Array(this.notes.length), combo: 0, best: 0, hits: 0, miss: 0, last: null, lastT: -9, ni: 0 }));
    this.aiPlan = this.skill.map((sk) => this.notes.map((t) => (this.ar() < 0.02 + 0.13 * (1 - sk) ? null : t + gauss(this.ar) * (0.018 + 0.08 * (1 - sk)))));
    this.aiK = new Array(this.n).fill(0);
  }
  update(dt, inp) {
    const t = this.t;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      while (p.ni < this.notes.length && this.notes[p.ni] < t - 0.18) { if (!p.judged[p.ni]) { p.judged[p.ni] = -1; p.combo = 0; p.miss++; p.last = 'miss'; p.lastT = t; } p.ni++; }
      if (!inp[i].ap) continue;
      let k = -1, bd = 0.2;
      for (let j = p.ni; j < this.notes.length && this.notes[j] < t + 0.2; j++) { if (p.judged[j]) continue; const d = Math.abs(this.notes[j] - t); if (d < bd) { bd = d; k = j; } }
      if (k < 0) { this.score[i] = Math.max(0, this.score[i] - 1); p.combo = 0; p.last = 'stray'; p.lastT = t; continue; }
      const q = bd <= 0.05 ? 3 : bd <= 0.1 ? 2 : bd <= 0.18 ? 1 : 0;
      p.judged[k] = q || -1; if (q) { p.combo++; p.hits++; p.best = Math.max(p.best, p.combo); this.score[i] += q + (p.combo % 10 === 0 ? 2 : 0); } else { p.combo = 0; p.miss++; }
      p.last = ['miss', 'ok', 'bene', 'perfetto'][q]; p.lastT = t; this.ev('hit', { i, q });
    }
    if (t >= this.end) this.finish();
  }
  ai(i, inp) {
    const pl = this.aiPlan[i];
    while (this.aiK[i] < pl.length && (pl[this.aiK[i]] == null || pl[this.aiK[i]] < this.t - 0.25)) this.aiK[i]++;
    if (this.aiK[i] < pl.length && this.t >= pl[this.aiK[i]]) { inp.ap = true; this.aiK[i]++; }
  }
  tie() { return this.p.map((p) => p.best * 1000 + p.hits); }
  hud(i) { const p = this.p[i]; return `${this.score[i]} pt · combo ${p.combo}`; }
}
function gauss(r) { return (r() + r() + r() - 1.5) * 1.15; }

// ─────────────────────────────── Memoria a colori: watch the arrows, repeat them, the line grows
export const MEM_SYMS = ['↑', '→', '↓', '←'];
export class Memoria extends Base {
  constructor(o) {
    super(o, 0);
    this.unit = 'punti'; this.seq = []; this.round = 0; this.maxRounds = 6;
    for (let k = 0; k < 3; k++) this.seq.push(Math.floor(this.r() * 4));
    this.startRound();
  }
  startRound() {
    this.ph = 'show'; this.pt = 0; this.first = -1;
    this.showT = this.seq.length * 0.62 + 0.4; this.limit = this.seq.length * 0.85 + 2.5;
    this.p = Array.from({ length: this.n }, (_, i) => ({ pos: 0, ok: null, at: 0, aiT: 0, wrongAt: this.aiErr(i) }));
    this.slow ||= new Array(this.n).fill(0);
  }
  aiErr(i) { const sk = this.skill[i], L = this.seq.length; for (let k = 0; k < L; k++) if (this.ar() < 0.015 + Math.max(0, L - 3) * 0.05 * (1.25 - sk)) return k; return -1; }
  shown() { return this.ph === 'show' ? Math.floor(this.pt / 0.62) : -1; }
  update(dt, inp) {
    this.pt += dt;
    if (this.ph === 'show') { if (this.pt >= this.showT) { this.ph = 'input'; this.pt = 0; this.ev('input'); } }
    else if (this.ph === 'input') {
      for (let i = 0; i < this.n; i++) {
        const p = this.p[i], I = inp[i]; if (p.ok != null) continue;
        const d = I.m != null ? I.m : this.tap(i, I, dt, false); if (d < 0) continue;
        if (d === this.seq[p.pos]) { p.pos++; this.ev('ok', { i }); if (p.pos >= this.seq.length) { p.ok = true; p.at = this.pt; this.slow[i] += this.pt; let pts = this.seq.length; if (this.first < 0) { this.first = i; pts += 2; } this.score[i] += pts; this.ev('done', { i }); } }
        else { p.ok = false; this.ev('wrong', { i }); }
      }
      if (this.pt > this.limit || this.p.every((p) => p.ok != null)) { this.ph = 'show2'; this.pt = 0; for (const p of this.p) if (p.ok == null) p.ok = false; }
    } else if (this.ph === 'show2' && this.pt > 1.4) {
      if (++this.round >= this.maxRounds || this.t > 60) this.finish();
      else { this.seq.push(Math.floor(this.r() * 4)); this.startRound(); }
    }
  }
  ai(i, inp, dt) {
    const p = this.p[i], sk = this.skill[i]; if (this.ph !== 'input' || p.ok != null) return;
    p.aiT -= dt; if (p.aiT > 0) return;
    p.aiT = 0.22 + (1 - sk) * 0.35 + this.ar() * 0.15;
    inp.m = p.pos === p.wrongAt ? (this.seq[p.pos] + 1 + Math.floor(this.ar() * 3)) % 4 : this.seq[p.pos];
  }
  // same points: the quicker hands win (total time spent on the sequences completed)
  tie() { return this.slow.map((t) => -t); }
  hud(i) { const p = this.p[i]; return `${this.score[i]} pt${this.ph === 'input' ? ` · ${p.pos}/${this.seq.length}` : ''}`; }
}
