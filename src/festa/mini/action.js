// Festa Baso — action minigames: Tiro alla fune and Corsa delle porte (Orda), Sprint kart and Battaglia
// dei palloncini (Kart Baso), Autoscontro (Scontro Totale). Pure simulations, see base.js for the contract.
import { Base } from './base.js';
import { clamp, angDiff, aimAt } from '../util.js';

const TAU = Math.PI * 2;
// steer a heading towards the stick direction; returns the stick strength (0..1)
function stickHeading(h, inp, rate, dt) {
  const m = Math.min(1, Math.hypot(inp.x, inp.y));
  if (m < 0.3) return { h, m: 0 };
  const want = Math.atan2(inp.y, inp.x);
  const d = angDiff(h, want);
  return { h: h + clamp(d, -rate * dt, rate * dt), m };
}

// ─────────────────────────────── Tiro alla fune: teams mash the action button, the rope slides
export class Tiro extends Base {
  constructor(o) {
    super(o, 30);
    const n = this.n;
    this.team = n === 2 ? [0, 1] : n === 3 ? [0, 1, 1] : [0, 1, 0, 1];
    this.rope = 0; this.v = 0; this.rate = new Array(n).fill(0); this.aiT = new Array(n).fill(0.4); this.win = -1; this.unit = 'strattoni';
  }
  update(dt, inp) {
    const F = [0, 0], c = [0, 0];
    for (let i = 0; i < this.n; i++) {
      if (inp[i].ap) { this.rate[i] += 1; this.score[i]++; this.ev('pull', { i }); }
      this.rate[i] *= Math.exp(-dt * 2.2);
      F[this.team[i]] += Math.min(this.rate[i], 6); c[this.team[i]]++;
    }
    const f = F[1] / c[1] - F[0] / c[0]; // + pulls towards team 1 (right)
    this.v += (f * 0.12 - this.v * 1.6) * dt;
    this.rope = clamp(this.rope + this.v * dt, -1, 1);
    if (Math.abs(this.rope) >= 1) { this.win = this.rope > 0 ? 1 : 0; this.finish(); }
  }
  finish() { if (this.done) return; if (this.win < 0) this.win = Math.abs(this.rope) < 0.02 ? -2 : this.rope > 0 ? 1 : 0; super.finish(); }
  ai(i, inp, dt) {
    this.aiT[i] -= dt;
    if (this.aiT[i] <= 0) { inp.ap = inp.a = true; const f = 4 + this.skill[i] * 5; this.aiT[i] = (1 / f) * (0.7 + 0.6 * this.ar()); }
  }
  hud(i) { return `Squadra ${this.team[i] ? 'B' : 'A'} · ${this.score[i]}`; }
  result() {
    const r = super.result();
    if (this.win === -2) r.places = r.places.map(() => 1);
    else { const nw = this.team.filter((t) => t === this.win).length; r.places = this.team.map((t) => (t === this.win ? 1 : nw + 1)); }
    r.teams = this.team.slice(); r.winTeam = this.win;
    return r;
  }
}

// ─────────────────────────────── Corsa delle porte: each player's crowd runs down a lane through gates
const GATE = { add: (c, v) => c + v, mul: (c, v) => c * v, sub: (c, v) => c - v, div: (c, v) => Math.ceil(c / v) };
export const gateText = (g) => (g.t === 'add' ? `+${g.v}` : g.t === 'mul' ? `×${g.v}` : g.t === 'sub' ? `−${g.v}` : `÷${g.v}`);
export class Porte extends Base {
  constructor(o) {
    super(o, 40);
    this.L = 240; this.speed = 9; this.W = 8; this.unit = 'omini';
    this.d = 0; this.x = new Array(this.n).fill(0); this.count = new Array(this.n).fill(10); this.raw = this.count.slice(); this.goodAt = new Array(this.n).fill(0); this.score = this.count.slice(); this.tgt = new Array(this.n).fill(0);
    const r = this.r, rows = [];
    for (let z = 26, k = 0; z < this.L - 12; z += 21, k++) {
      if (k % 3 === 2) rows.push({ z, kind: 'saw', ph: r() * TAU, w: 1.1 + r() * 0.9 });
      else {
        const good = () => (r() < 0.5 ? { t: 'add', v: 5 + Math.floor(r() * 4) * 5 } : { t: 'mul', v: r() < 0.75 ? 2 : 3 });
        const bad = () => (r() < 0.6 ? { t: 'sub', v: 5 + Math.floor(r() * 5) * 5 } : { t: 'div', v: 2 });
        const a = good(), b = r() < 0.55 ? bad() : good();
        rows.push({ z, kind: 'gate', g: r() < 0.5 ? [a, b] : [b, a] });
      }
    }
    this.rows = rows;
  }
  sawX(row, t) { return Math.sin(t * row.w + row.ph) * (this.W / 2 - 1); }
  update(dt, inp) {
    const d0 = this.d; this.d += this.speed * dt;
    for (let i = 0; i < this.n; i++) this.x[i] = clamp(this.x[i] + inp[i].x * 9 * dt, -this.W / 2 + 0.8, this.W / 2 - 0.8);
    for (const row of this.rows) {
      if (!(d0 < row.z && this.d >= row.z)) continue;
      for (let i = 0; i < this.n; i++) {
        const c0 = this.count[i];
        if (row.kind === 'gate') { const g = row.g[this.x[i] < 0 ? 0 : 1]; this.count[i] = clamp(Math.round(GATE[g.t](c0, g.v)), 1, 9999); this.raw[i] = clamp(GATE[g.t](this.raw[i], g.v), 1, 1e12); this.ev('gate', { i, g, good: this.count[i] >= c0 }); }
        else if (Math.abs(this.x[i] - this.sawX(row, this.t)) < 1.7) { this.count[i] = Math.max(1, Math.round(c0 * 0.6)); this.raw[i] = Math.max(1, this.raw[i] * 0.6); this.ev('saw', { i }); }
      }
    }
    this.score = this.count.slice();
    if (this.d >= this.L) this.finish();
  }
  ai(i, inp) {
    const next = this.rows.find((r) => r.z > this.d);
    if (next && next !== this._aiRow?.[i]) {
      (this._aiRow ||= [])[i] = next;
      const sk = this.skill[i];
      if (next.kind === 'gate') {
        const v = next.g.map((g) => GATE[g.t](this.count[i], g.v));
        let side = v[0] >= v[1] ? 0 : 1; if (this.ar() > 0.55 + 0.45 * sk) side = 1 - side;
        this.tgt[i] = side ? 2 : -2;
      } else {
        const tt = this.t + (next.z - this.d) / this.speed, sx = this.sawX(next, tt);
        this.tgt[i] = this.ar() < 0.5 + 0.5 * sk ? (sx > 0 ? -2.6 : 2.6) : sx;
      }
    }
    const dx = this.tgt[i] - this.x[i]; inp.x = Math.abs(dx) < 0.2 ? 0 : clamp(dx * 1.5, -1, 1);
  }
  // a full crowd (9999) still ranks by what the gates would have given it
  tie() { return this.raw.slice(); }
  hud(i) { return `${this.count[i]} omini`; }
}

// ─────────────────────────────── Sprint kart: three laps of a stadium oval
export class Kart extends Base {
  constructor(o) {
    super(o, 60);
    this.L = 30; this.R = 14; this.TW = 8; this.P = 2 * this.L + TAU * this.R; this.laps = 3; this.unit = 'giri';
    this.k = Array.from({ length: this.n }, (_, i) => ({ x: -3 - (i >> 1) * 3.2, y: this.R + (i & 1 ? 1.8 : -1.8), h: 0, v: 0, prog: 0, s: 0, turbo: 0, meter: 0.6, fin: 0, place: 0, off: false }));
    for (const k of this.k) { const p = this.proj(k.x, k.y); k.s = p.s; k.prog = this.relS(p.s) - this.P; }
    this.finished = 0; this.lane = Array.from({ length: this.n }, () => (this.ar() - 0.5) * 3);
  }
  // centreline: s from the middle of the bottom straight, clockwise on screen
  at(s) {
    const L = this.L, R = this.R, P = this.P; s = (((s + L / 2) % P) + P) % P;
    if (s < L) return { x: -L / 2 + s, y: R, h: 0 };
    if (s < L + Math.PI * R) { const th = Math.PI / 2 - (s - L) / R; return { x: L / 2 + R * Math.cos(th), y: R * Math.sin(th), h: th - Math.PI / 2 }; }
    if (s < 2 * L + Math.PI * R) { const u = s - L - Math.PI * R; return { x: L / 2 - u, y: -R, h: Math.PI }; }
    const th = -Math.PI / 2 - (s - 2 * L - Math.PI * R) / R; return { x: -L / 2 + R * Math.cos(th), y: R * Math.sin(th), h: th - Math.PI / 2 };
  }
  proj(x, y) {
    const L = this.L, R = this.R; let s, lat;
    if (x >= -L / 2 && x <= L / 2) { if (y >= 0) { s = x + L / 2; lat = y - R; } else { s = L + Math.PI * R + (L / 2 - x); lat = -y - R; } }
    else if (x > L / 2) { const th = Math.atan2(y, x - L / 2); s = L + (Math.PI / 2 - th) * R; lat = Math.hypot(x - L / 2, y) - R; }
    else { let th = Math.atan2(y, x + L / 2); if (th > 0) th -= TAU; s = 2 * L + Math.PI * R + (-Math.PI / 2 - th) * R; lat = Math.hypot(x + L / 2, y) - R; }
    return { s: s - L / 2, lat };
  }
  relS(s) { return ((s % this.P) + this.P) % this.P; }
  update(dt, inp) {
    for (let i = 0; i < this.n; i++) {
      const k = this.k[i], I = inp[i];
      if (k.fin) { k.v *= Math.exp(-dt * 1.5); }
      else {
        if (I.ap && k.meter >= 1) { k.turbo = 1.6; k.meter = 0; this.ev('turbo', { i }); }
        k.meter = Math.min(1, k.meter + dt * 0.22); k.turbo = Math.max(0, k.turbo - dt);
        const p = this.proj(k.x, k.y); k.off = Math.abs(p.lat) > this.TW / 2;
        const vmax = k.turbo > 0 ? 23 : k.off ? 8 : 16;
        k.v += (vmax - k.v) * (k.v < vmax ? 1.1 : 2.5) * dt;
        k.h += clamp(I.x, -1, 1) * 2.4 * dt * clamp(k.v / 10, 0.3, 1.2);
      }
      k.x += Math.cos(k.h) * k.v * dt; k.y += Math.sin(k.h) * k.v * dt;
      const p = this.proj(k.x, k.y); let ds = p.s - k.s; ds -= Math.round(ds / this.P) * this.P; k.s = p.s; k.prog += ds;
      // hard outer walls
      if (Math.abs(p.lat) > this.TW / 2 + 3) { const c = this.at(p.s); const nx = k.x - c.x, ny = k.y - c.y, d = Math.hypot(nx, ny) || 1; k.x = c.x + nx / d * (this.TW / 2 + 3); k.y = c.y + ny / d * (this.TW / 2 + 3); k.v *= 0.6; }
      if (!k.fin && k.prog >= this.P * this.laps) { k.fin = this.t; k.place = ++this.finished; this.ev('finish', { i, place: k.place }); }
    }
    for (let i = 0; i < this.n; i++) for (let j = i + 1; j < this.n; j++) {
      const a = this.k[i], b = this.k[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 1.9) { const o = (1.9 - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o; this.ev('bump', { i, j }); }
    }
    this.score = this.k.map((k) => (k.fin ? 100000 - k.place * 1000 : k.prog));
    if (this.finished >= this.n || (this.finished && this.t - this.k.find((k) => k.place === 1).fin > 10)) this.finish();
  }
  ai(i, inp) {
    const k = this.k[i], sk = this.skill[i];
    const c = this.at(k.s + 7 + k.v * 0.35), n = { x: -Math.sin(c.h), y: Math.cos(c.h) };
    const off = this.lane[i] + Math.sin(this.t * (0.6 + i * 0.13)) * (1 - sk) * 2.6;
    const tx = c.x + n.x * off, ty = c.y + n.y * off;
    inp.x = clamp(angDiff(k.h, Math.atan2(ty - k.y, tx - k.x)) * (1.6 + sk * 1.6), -1, 1);
    if (k.meter >= 1 && Math.abs(c.h - Math.round(c.h / Math.PI) * Math.PI) < 0.05 && this.ar() < 0.02 + sk * 0.06) inp.ap = true;
  }
  hud(i) { const k = this.k[i]; return k.fin ? `Arrivato ${k.place}°` : `Giro ${Math.min(this.laps, Math.floor(Math.max(0, k.prog) / this.P) + 1)}/${this.laps}`; }
  result() { const r = super.result(); r.scores = this.k.map((k) => (k.fin ? k.fin : null)); r.unit = 's'; r.fmt = 'time'; return r; }
}

// ─────────────────────────────── Battaglia dei palloncini: karts in an arena, curly shots pop balloons
export class Palloncini extends Base {
  constructor(o) {
    super(o, 60);
    this.RA = 20; this.unit = 'palloncini';
    this.k = Array.from({ length: this.n }, (_, i) => { const a = (i / this.n) * TAU + Math.PI / 4; return { x: Math.cos(a) * 13, y: Math.sin(a) * 13, h: a + Math.PI, v: 0, b: 3, cd: 0.5, inv: 0, hits: 0, out: 0 }; });
    this.shots = []; this.sid = 0; this.aimN = new Array(this.n).fill(0); this.extra = false;
  }
  // a draw at the bell (same balloons and hits at the top) goes to a 15 s sudden death: the next pop decides
  finish() {
    if (this.done) return;
    const top = Math.max(...this.score);
    if (!this.extra && this.alive() > 1 && this.score.filter((v) => v === top).length > 1) { this.extra = true; this.dur = this.t + 15; this.ev('overtime'); return; }
    super.finish();
  }
  alive() { return this.k.filter((k) => k.b > 0).length; }
  update(dt, inp) {
    for (let i = 0; i < this.n; i++) {
      const k = this.k[i], I = inp[i];
      k.cd -= dt; k.inv = Math.max(0, k.inv - dt);
      if (k.b <= 0) { k.v *= Math.exp(-dt * 3); continue; }
      const s = stickHeading(k.h, I, 3.6, dt); k.h = s.h;
      k.v += ((s.m ? 12 * s.m : 0) - k.v) * 2 * dt;
      if (I.ap && k.cd <= 0) { k.cd = 0.9; this.shots.push({ id: ++this.sid, o: i, x: k.x + Math.cos(k.h) * 1.6, y: k.y + Math.sin(k.h) * 1.6, vx: Math.cos(k.h) * 21, vy: Math.sin(k.h) * 21, life: 1.7 }); this.ev('shoot', { i }); }
      k.x += Math.cos(k.h) * k.v * dt; k.y += Math.sin(k.h) * k.v * dt;
      const d = Math.hypot(k.x, k.y); if (d > this.RA - 1) { k.x *= (this.RA - 1) / d; k.y *= (this.RA - 1) / d; k.v *= 0.5; }
    }
    for (let i = 0; i < this.n; i++) for (let j = i + 1; j < this.n; j++) {
      const a = this.k[i], b = this.k[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 2) { const o = (2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
    for (const s of this.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const d = Math.hypot(s.x, s.y); if (d > this.RA - 0.5) { const nx = s.x / d, ny = s.y / d, dot = s.vx * nx + s.vy * ny; s.vx -= 2 * dot * nx; s.vy -= 2 * dot * ny; s.x = nx * (this.RA - 0.5); s.y = ny * (this.RA - 0.5); }
      for (let j = 0; j < this.n; j++) {
        const k = this.k[j]; if (k.b <= 0 || k.inv > 0 || (j === s.o && s.life > 1.4)) continue;
        if (Math.hypot(k.x - s.x, k.y - s.y) < 1.4) {
          s.life = 0; k.b--; k.inv = 1.5; k.lostAt = this.t; if (j !== s.o) this.k[s.o].hits++;
          this.ev('pop', { i: j, by: s.o, x: k.x, y: k.y });
          if (k.b <= 0) { k.out = this.t; this.ev('out', { i: j }); }
          if (this.extra) this.pend = true;
          break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    this.score = this.k.map((k) => (k.b > 0 ? 1000 + k.b * 100 + k.hits : k.out * 10 + k.hits));
    if (this.alive() <= 1 || this.pend) { this.pend = false; const top = Math.max(...this.score); if (this.alive() <= 1 || this.score.filter((v) => v === top).length === 1) super.finish(); }
  }
  ai(i, inp) {
    const k = this.k[i], sk = this.skill[i]; if (k.b <= 0) return;
    let best = null, bd = 1e9;
    for (let j = 0; j < this.n; j++) { if (j === i || this.k[j].b <= 0) continue; const o = this.k[j], d = Math.hypot(o.x - k.x, o.y - k.y); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    const lead = bd / 21, tx = best.x + Math.cos(best.h) * best.v * lead * sk, ty = best.y + Math.sin(best.h) * best.v * lead * sk;
    const want = Math.atan2(ty - k.y, tx - k.x);
    if (bd > 7) aimAt(inp, k.x, k.y, tx, ty);
    else { const a = want + 0.6 * Math.sin(this.t * (1.4 + sk * 0.6) + i * 1.3); inp.x = Math.cos(a); inp.y = Math.sin(a); } // weave in and out of the line of fire
    if (Math.hypot(k.x, k.y) > this.RA - 4) aimAt(inp, k.x, k.y, 0, 0);
    // each shot carries an aim error (smaller for stronger CPUs), so duels last and the seats do not mirror
    if (Math.abs(angDiff(k.h, want + this.aimN[i])) < 0.1 + (1 - sk) * 0.2 && bd < 15 && k.cd <= 0 && this.ar() < 0.1 + sk * 0.2) { inp.ap = true; this.aimN[i] = (this.ar() - 0.5) * (0.3 + (1 - sk) * 0.6); }
  }
  // still level after the sudden death: who kept the balloons longer (the latest pop taken ranks lower)
  tie() { return this.k.map((k) => -(k.lostAt || 0)); }
  hud(i) { const k = this.k[i]; return k.b > 0 ? `${this.extra && !this.done ? 'Spareggio! ' : ''}${'●'.repeat(k.b)} · ${k.hits} colpi` : 'Fuori!'; }
}

// ─────────────────────────────── Autoscontro: bumper cars on a shrinking platform
export class Autoscontro extends Base {
  constructor(o) {
    super(o, 45);
    this.unit = 'spinte'; this.R0 = 15; this.R = 15;
    this.c = Array.from({ length: this.n }, (_, i) => { const a = (i / this.n) * TAU + 0.4; return { x: Math.cos(a) * 7, y: Math.sin(a) * 7, h: a + Math.PI, vx: 0, vy: 0, cd: 0.6, fall: 0, inv: 0, last: -1, lastT: -9, ko: 0, falls: 0 }; });
  }
  update(dt, inp) {
    this.R = this.R0 - 5.5 * Math.min(1, this.t / this.dur);
    for (let i = 0; i < this.n; i++) {
      const c = this.c[i], I = inp[i];
      c.cd -= dt; c.inv = Math.max(0, c.inv - dt);
      if (c.fall > 0) {
        c.fall -= dt;
        if (c.fall <= 0) { const a = this.r() * TAU, d = this.r() * this.R * 0.35; c.x = Math.cos(a) * d; c.y = Math.sin(a) * d; c.vx = c.vy = 0; c.inv = 1.2; c.last = -1; this.ev('respawn', { i }); }
        continue;
      }
      const s = stickHeading(c.h, I, 4.2, dt); c.h = s.h;
      const acc = 16 * s.m; c.vx += Math.cos(c.h) * acc * dt; c.vy += Math.sin(c.h) * acc * dt;
      if (I.ap && c.cd <= 0) { c.cd = 1.7; c.vx += Math.cos(c.h) * 13; c.vy += Math.sin(c.h) * 13; this.ev('dash', { i }); }
      const f = Math.exp(-dt * 1.6); c.vx *= f; c.vy *= f;
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (Math.hypot(c.x, c.y) > this.R + 0.6) {
        c.fall = 1.6; c.falls++; this.score[i] -= 1; this.ev('fall', { i, x: c.x, y: c.y });
        if (c.last >= 0 && this.t - c.lastT < 3) { this.c[c.last].ko++; this.score[c.last] += 2; this.ev('ko', { i: c.last, victim: i }); }
      }
    }
    for (let i = 0; i < this.n; i++) for (let j = i + 1; j < this.n; j++) {
      const a = this.c[i], b = this.c[j]; if (a.fall > 0 || b.fall > 0 || a.inv > 0 || b.inv > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 2.3) {
        const nx = dx / d, ny = dy / d, o = (2.3 - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const imp = rel * 1.25 + 2; a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
          const ra = Math.hypot(a.vx, a.vy), rb = Math.hypot(b.vx, b.vy);
          a.last = j; a.lastT = this.t; b.last = i; b.lastT = this.t;
          this.ev('bump', { i, j, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power: Math.min(1, (ra + rb) / 30) });
        }
      }
    }
  }
  ai(i, inp) {
    const c = this.c[i], sk = this.skill[i]; if (c.fall > 0) return;
    const dc = Math.hypot(c.x, c.y);
    if (dc > this.R - 3 - (1 - sk) * -1.5) { aimAt(inp, c.x, c.y, 0, 0); return; }
    let best = null, bd = 1e9;
    for (let j = 0; j < this.n; j++) { if (j === i || this.c[j].fall > 0) continue; const o = this.c[j], d = Math.hypot(o.x - c.x, o.y - c.y) - Math.hypot(o.x, o.y) * 0.4; if (d < bd) { bd = d; best = o; } }
    if (!best) { aimAt(inp, c.x, c.y, 0, 0); return; }
    const od = Math.hypot(best.x, best.y) || 1, ox = best.x / od, oy = best.y / od;
    const far = Math.hypot(best.x - c.x, best.y - c.y);
    const tx = best.x - ox * (far > 4 ? 2.5 : 0), ty = best.y - oy * (far > 4 ? 2.5 : 0);
    aimAt(inp, c.x, c.y, tx, ty);
    const want = Math.atan2(best.y - c.y, best.x - c.x);
    if (far < 5 && Math.abs(angDiff(c.h, want)) < 0.35 && c.cd <= 0 && this.ar() < 0.1 + sk * 0.25) inp.ap = true;
  }
  // same points: fewer falls, then more K.O.
  tie() { return this.c.map((c) => -c.falls * 100 + c.ko); }
  hud(i) { const c = this.c[i]; return c.fall > 0 ? 'Giù!' : `${c.ko} K.O. · ${c.falls} ${c.falls === 1 ? 'caduta' : 'cadute'}`; }
}
