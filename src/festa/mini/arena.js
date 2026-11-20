// Festa Baso — arena minigames: Mini voragine (Voragine), Arena dei serpenti (Serpentone), Pittura del
// territorio (Territorio) and Bastione unito (Bastione, co-op). Pure simulations, see base.js.
import { Base } from './base.js';
import { clamp, angDiff, aimAt } from '../util.js';

const TAU = Math.PI * 2;

// ─────────────────────────────── Mini voragine: holes swallow the square, bigger holes eat smaller ones
export const VO_KINDS = [
  { id: 'cono', s: 0.35, v: 1, w: 30 }, { id: 'panchina', s: 0.6, v: 2, w: 22 }, { id: 'albero', s: 0.9, v: 4, w: 18 },
  { id: 'auto', s: 1.3, v: 7, w: 14 }, { id: 'furgone', s: 1.8, v: 12, w: 8 }, { id: 'casa', s: 2.6, v: 25, w: 4 },
];
export class Voragine extends Base {
  constructor(o) {
    super(o, 40);
    this.W = 22; this.H = 15; this.unit = 'massa';
    this.h = Array.from({ length: this.n }, (_, i) => ({ x: (i & 1 ? 1 : -1) * 15, y: (i & 2 ? 1 : -1) * 9, r: 1, m: 0, tx: 0, ty: 0, aiT: 0 }));
    this.o = []; for (let k = 0; k < 120; k++) this.o.push(this.newObj(k));
    this.spawnT = 0;
  }
  newObj(id, kind) {
    const r = this.r, tot = VO_KINDS.reduce((a, k) => a + k.w, 0);
    if (kind == null) { let x = r() * tot; kind = 0; while (x > VO_KINDS[kind].w) { x -= VO_KINDS[kind].w; kind++; } }
    return { id, k: kind, s: VO_KINDS[kind].s, v: VO_KINDS[kind].v, x: (r() * 2 - 1) * (this.W - 1.5), y: (r() * 2 - 1) * (this.H - 1.5), rot: r() * TAU, alive: true, ver: (this.o?.[id]?.ver || 0) + 1 };
  }
  radius(m) { return 1 + 0.16 * Math.sqrt(m); }
  update(dt, inp) {
    for (let i = 0; i < this.n; i++) {
      const h = this.h[i], I = inp[i], sp = Math.max(5, 8.5 - h.r * 0.6);
      h.x = clamp(h.x + I.x * sp * dt, -this.W + h.r * 0.6, this.W - h.r * 0.6); h.y = clamp(h.y + I.y * sp * dt, -this.H + h.r * 0.6, this.H - h.r * 0.6);
      for (const o of this.o) {
        if (!o.alive || h.r < o.s * 1.05) continue;
        const d = Math.hypot(o.x - h.x, o.y - h.y);
        if (d < h.r - o.s * 0.3) { o.alive = false; o.by = i; o.t = this.t; h.m += o.v; this.ev('eat', { i, id: o.id, k: o.k }); }
      }
      h.r = this.radius(h.m);
    }
    for (let i = 0; i < this.n; i++) for (let j = 0; j < this.n; j++) {
      if (i === j) continue; const a = this.h[i], b = this.h[j];
      if (a.r > b.r * 1.3 && Math.hypot(a.x - b.x, a.y - b.y) < a.r - b.r * 0.4) {
        const lost = Math.round(b.m * 0.35); b.m -= lost; a.m += lost + 5; a.r = this.radius(a.m); b.r = this.radius(b.m);
        b.x = -a.x * 0.8; b.y = -a.y * 0.8; this.ev('gulp', { i, victim: j });
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      const dead = this.o.find((o) => !o.alive && this.t - o.t > 1.2);
      if (dead) { const big = Math.max(...this.h.map((h) => h.r)); let k = Math.floor(this.r() * VO_KINDS.length); if (this.r() < 0.5) k = Math.min(k, 2); if (big > 2.4 && this.r() < 0.4) k = 3 + Math.floor(this.r() * 3); this.o[dead.id] = this.newObj(dead.id, k); }
    }
    this.score = this.h.map((h) => h.m);
  }
  ai(i, inp, dt) {
    const h = this.h[i], sk = this.skill[i];
    h.aiT -= dt;
    if (h.aiT <= 0) {
      h.aiT = 0.35 + (1 - sk) * 0.5;
      let best = null, bs = 0;
      for (let k = 0; k < 40; k++) {
        const o = this.o[Math.floor(this.ar() * this.o.length)]; if (!o.alive || h.r < o.s * 1.05) continue;
        const sc = o.v / (Math.hypot(o.x - h.x, o.y - h.y) + 2); if (sc > bs) { bs = sc; best = o; }
      }
      for (let j = 0; j < this.n; j++) { const b = this.h[j]; if (j !== i && h.r > b.r * 1.3 && Math.hypot(b.x - h.x, b.y - h.y) < 7 && sk > 0.4) best = b; }
      if (best) { h.tx = best.x; h.ty = best.y; } else { h.tx = (this.ar() * 2 - 1) * this.W * 0.8; h.ty = (this.ar() * 2 - 1) * this.H * 0.8; }
    }
    aimAt(inp, h.x, h.y, h.tx, h.ty);
    for (let j = 0; j < this.n; j++) { const b = this.h[j]; if (j !== i && b.r > h.r * 1.3 && Math.hypot(b.x - h.x, b.y - h.y) < 4 + b.r) aimAt(inp, b.x, b.y, h.x, h.y); }
  }
  hud(i) { return `${Math.round(this.h[i].m)} kg`; }
}

// ─────────────────────────────── Arena dei serpenti: eat glowing food, make the others crash into you
export class Serpenti extends Base {
  constructor(o) {
    super(o, 45);
    this.RA = 20; this.SP = 0.45; this.unit = 'punti';
    this.s = Array.from({ length: this.n }, (_, i) => this.spawn({ kills: 0, deaths: 0, eaten: 0 }, i));
    this.food = []; for (let k = 0; k < 70; k++) this.food.push(this.newFood(k));
  }
  spawn(s, i) {
    const a = (i / this.n) * TAU + this.r() * 0.5, d = 9 + this.r() * 5;
    Object.assign(s, { x: Math.cos(a) * d, y: Math.sin(a) * d, h: a + Math.PI + (this.r() - 0.5), L: 6, pts: [], dead: 0, inv: 1.5, boost: false });
    for (let k = 0; k < 6 / this.SP; k++) s.pts.unshift({ x: s.x - Math.cos(s.h) * k * this.SP, y: s.y - Math.sin(s.h) * k * this.SP });
    return s;
  }
  newFood(id, x, y) {
    const r = this.r(), a = this.r() * TAU, d = Math.sqrt(r) * (this.RA - 1.5);
    return { id, x: x ?? Math.cos(a) * d, y: y ?? Math.sin(a) * d, v: 1, alive: true, ver: (this.food?.[id]?.ver || 0) + 1, c: Math.floor(this.r() * 6) };
  }
  kill(i, by) {
    const s = this.s[i]; s.dead = 1.6; s.deaths++; this.score[i] = Math.max(0, this.score[i] - 2);
    if (by >= 0 && by !== i) { this.s[by].kills++; this.score[by] += 5; }
    for (let k = 0; k < s.pts.length; k += 4) { const f = this.food.find((q) => !q.alive); if (f) this.food[f.id] = this.newFood(f.id, s.pts[k].x, s.pts[k].y); }
    this.ev('crash', { i, by, x: s.x, y: s.y });
  }
  update(dt, inp) {
    for (let i = 0; i < this.n; i++) {
      const s = this.s[i], I = inp[i];
      if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) this.spawn(s, i); continue; }
      s.inv = Math.max(0, s.inv - dt);
      const m = Math.hypot(I.x, I.y);
      if (m > 0.3) s.h += clamp(angDiff(s.h, Math.atan2(I.y, I.x)), -4.2 * dt, 4.2 * dt);
      s.boost = I.a && s.L > 5;
      if (s.boost) s.L -= dt * 1.1;
      const sp = s.boost ? 11.5 : 7.2;
      s.x += Math.cos(s.h) * sp * dt; s.y += Math.sin(s.h) * sp * dt;
      const last = s.pts[s.pts.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= this.SP) s.pts.push({ x: s.x, y: s.y });
      const keep = Math.ceil(s.L / this.SP); if (s.pts.length > keep) s.pts.splice(0, s.pts.length - keep);
      for (const f of this.food) if (f.alive && Math.hypot(f.x - s.x, f.y - s.y) < 1.1) { f.alive = false; f.t = this.t; s.L += 0.7; s.eaten++; this.score[i] += 1; this.ev('eat', { i, id: f.id }); }
      if (Math.hypot(s.x, s.y) > this.RA) this.kill(i, -1);
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.s[i]; if (s.dead > 0 || s.inv > 0) continue;
      for (let j = 0; j < this.n && s.dead <= 0; j++) {
        if (j === i) continue; const o = this.s[j]; if (o.dead > 0) continue;
        for (let k = 0; k < o.pts.length; k++) { const p = o.pts[k]; if (Math.abs(p.x - s.x) < 0.8 && Math.hypot(p.x - s.x, p.y - s.y) < 0.8) { this.kill(i, j); break; } }
      }
    }
    for (const f of this.food) if (!f.alive && this.t - f.t > 2) this.food[f.id] = this.newFood(f.id);
  }
  danger(i, h, dist) {
    const s = this.s[i], x = s.x + Math.cos(h) * dist, y = s.y + Math.sin(h) * dist;
    if (Math.hypot(x, y) > this.RA - 1.2) return true;
    for (let j = 0; j < this.n; j++) { if (j === i || this.s[j].dead > 0) continue; for (const p of this.s[j].pts) if (Math.abs(p.x - x) < 1.5 && Math.hypot(p.x - x, p.y - y) < 1.5) return true; }
    return false;
  }
  ai(i, inp) {
    const s = this.s[i], sk = this.skill[i]; if (s.dead > 0) return;
    let best = null, bd = 1e9;
    for (const f of this.food) { if (!f.alive) continue; const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < bd) { bd = d; best = f; } }
    let want = best ? Math.atan2(best.y - s.y, best.x - s.x) : Math.atan2(-s.y, -s.x);
    const look = 2.5 + sk * 2;
    if (this.ar() < 0.4 + sk * 0.6 && this.danger(i, want, look)) {
      for (const d of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6]) if (!this.danger(i, s.h + d, look)) { want = s.h + d; break; }
    }
    inp.x = Math.cos(want); inp.y = Math.sin(want);
    inp.a = s.L > 9 && bd < 6 && bd > 3 && sk > 0.5;
  }
  tie() { return this.s.map((s) => s.kills * 100 - s.deaths * 10 + (s.dead > 0 ? 0 : s.L * 0.01)); }
  hud(i) { const s = this.s[i]; return s.dead > 0 ? 'Schiantato!' : `${this.score[i]} pt · ${s.kills} K.O.`; }
}

// ─────────────────────────────── Pittura del territorio: paint the floor, splash to steal big patches
export class Territorio extends Base {
  constructor(o) {
    super(o, 40);
    this.GW = 26; this.GH = 16; this.C = 1.6; this.unit = 'caselle';
    this.own = new Int8Array(this.GW * this.GH).fill(-1);
    // a few planters, mirrored so every corner is the same
    for (let k = 0; k < 5; k++) {
      const cx = 3 + Math.floor(this.r() * 9), cy = 2 + Math.floor(this.r() * 6);
      for (const [x, y] of [[cx, cy], [this.GW - 1 - cx, cy], [cx, this.GH - 1 - cy], [this.GW - 1 - cx, this.GH - 1 - cy]]) this.own[y * this.GW + x] = -2;
    }
    this.p = Array.from({ length: this.n }, (_, i) => ({ x: (i & 1 ? 1 : -1) * (this.GW / 2 - 1.5) * this.C, y: (i & 2 ? 1 : -1) * (this.GH / 2 - 1.5) * this.C, cd: 2, tx: 0, ty: 0, aiT: 0 }));
    this.ver = 0;
  }
  cell(x, y) { const cx = Math.floor(x / this.C + this.GW / 2), cy = Math.floor(y / this.C + this.GH / 2); return cx < 0 || cy < 0 || cx >= this.GW || cy >= this.GH ? -1 : cy * this.GW + cx; }
  paint(c, i) { if (c >= 0 && this.own[c] !== -2 && this.own[c] !== i) { this.own[c] = i; this.ver++; } }
  update(dt, inp) {
    const hw = (this.GW / 2) * this.C - 0.5, hh = (this.GH / 2) * this.C - 0.5;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], I = inp[i]; p.cd -= dt;
      const nx = clamp(p.x + I.x * 7.5 * dt, -hw, hw), ny = clamp(p.y + I.y * 7.5 * dt, -hh, hh);
      if (this.own[this.cell(nx, p.y)] !== -2) p.x = nx;
      if (this.own[this.cell(p.x, ny)] !== -2) p.y = ny;
      this.paint(this.cell(p.x, p.y), i);
      if (I.ap && p.cd <= 0) {
        p.cd = 3.5; this.ev('splash', { i, x: p.x, y: p.y });
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 6.5) this.paint(this.cell(p.x + dx * this.C, p.y + dy * this.C), i);
      }
    }
    const sc = new Array(this.n).fill(0); for (const o of this.own) if (o >= 0) sc[o]++; this.score = sc;
  }
  ai(i, inp, dt) {
    const p = this.p[i], sk = this.skill[i];
    p.aiT -= dt;
    if (p.aiT <= 0) {
      p.aiT = 0.4 + (1 - sk) * 0.6; let bs = -1;
      for (let k = 0; k < 30; k++) {
        const c = Math.floor(this.ar() * this.own.length), o = this.own[c]; if (o === i || o === -2) continue;
        const x = ((c % this.GW) - this.GW / 2 + 0.5) * this.C, y = (Math.floor(c / this.GW) - this.GH / 2 + 0.5) * this.C;
        const s = (o >= 0 ? 1.4 : 1) / (Math.hypot(x - p.x, y - p.y) + 3); if (s > bs) { bs = s; p.tx = x; p.ty = y; }
      }
    }
    aimAt(inp, p.x, p.y, p.tx, p.ty, 0.3);
    if (p.cd <= 0) { let c = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const q = this.own[this.cell(p.x + dx * this.C, p.y + dy * this.C)]; if (q !== i && q !== -2) c++; } if (c > 18 - sk * 8) inp.ap = true; }
  }
  hud(i) { return `${this.score[i]} caselle`; }
}

// ─────────────────────────────── Bastione unito (co-op): defend the keep, build towers, personal kills
export class Bastione extends Base {
  constructor(o) {
    super(o, 45);
    this.RA = 18; this.unit = 'nemici'; this.keep = 100; this.keepMax = 100; this.coop = true;
    this.pads = Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * TAU + TAU / 12; return { x: Math.cos(a) * 7.5, y: Math.sin(a) * 7.5, owner: -1, cd: 0 }; });
    this.gates = [[16, 0], [-16, 0], [0, 16], [0, -16]];
    this.p = Array.from({ length: this.n }, (_, i) => ({ x: Math.cos(i * 1.57 + 0.78) * 4, y: Math.sin(i * 1.57 + 0.78) * 4, cd: 0.3, bl: 1, built: 0, kills: 0 }));
    this.en = []; this.eid = 0; this.spawnT = 2; this.shots = [];
  }
  hit(e, dmg, by) {
    e.hp -= dmg;
    if (e.hp <= 0 && !e.dead) { e.dead = true; if (by >= 0) { this.score[by] += e.big ? 3 : 1; this.p[by].kills++; } this.ev('kill', { by, x: e.x, y: e.y, big: e.big }); }
  }
  nearest(x, y, r) { let b = null, bd = r; for (const e of this.en) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; }
  update(dt, inp) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.25 / (0.6 + 0.22 * this.n) * (1 - 0.45 * this.t / this.dur);
      const g = this.gates[Math.floor(this.r() * 4)], big = this.r() < 0.12 + this.t / this.dur * 0.2;
      this.en.push({ id: ++this.eid, x: g[0] + (this.r() - 0.5) * 3, y: g[1] + (this.r() - 0.5) * 3, hp: big ? 6 : 2, max: big ? 6 : 2, big, sp: big ? 1.6 : 2.4, dead: false });
    }
    for (const e of this.en) {
      if (e.dead) continue; const d = Math.hypot(e.x, e.y);
      if (d < 2.8) { e.dead = true; e.hitKeep = true; this.keep -= e.big ? 12 : 5; this.ev('keep', { x: e.x, y: e.y }); continue; }
      e.x -= e.x / d * e.sp * dt; e.y -= e.y / d * e.sp * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], I = inp[i];
      p.x = clamp(p.x + I.x * 7.5 * dt, -this.RA, this.RA); p.y = clamp(p.y + I.y * 7.5 * dt, -this.RA, this.RA);
      const dk = Math.hypot(p.x, p.y); if (dk < 3.2) { p.x *= 3.2 / dk; p.y *= 3.2 / dk; }
      p.cd -= dt; p.bl -= dt;
      if (p.cd <= 0) { const e = this.nearest(p.x, p.y, 7); if (e) { p.cd = 0.42; this.shots.push({ i, x: p.x, y: p.y, tx: e.x, ty: e.y, t: 0.12 }); this.hit(e, 1, i); } }
      if (I.ap) {
        const pad = this.pads.find((q) => q.owner < 0 && Math.hypot(q.x - p.x, q.y - p.y) < 2);
        if (pad && p.built < 2) { pad.owner = i; p.built++; this.ev('build', { i, pad: this.pads.indexOf(pad) }); }
        else if (p.bl <= 0) { p.bl = 5; this.ev('blast', { i, x: p.x, y: p.y }); for (const e of this.en) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 3.6) this.hit(e, 3, i); }
      }
    }
    for (const q of this.pads) {
      if (q.owner < 0) continue; q.cd -= dt;
      if (q.cd <= 0) { const e = this.nearest(q.x, q.y, 6.5); if (e) { q.cd = 0.8; this.shots.push({ i: q.owner, x: q.x, y: q.y, tx: e.x, ty: e.y, t: 0.12, tower: true }); this.hit(e, 1, q.owner); } }
    }
    for (const s of this.shots) s.t -= dt;
    this.shots = this.shots.filter((s) => s.t > 0);
    if (this.en.length > 80) this.en = this.en.filter((e) => !e.dead);
    if (this.keep <= 0) { this.keep = 0; this.lost = true; this.finish(); }
  }
  ai(i, inp) {
    const p = this.p[i], sk = this.skill[i];
    const free = this.pads.filter((q) => q.owner < 0);
    if (p.built < 2 && free.length && this.t < 22 && this.t > 1 + i) {
      let q = free[0]; for (const f of free) if (Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(q.x - p.x, q.y - p.y)) q = f;
      if (aimAt(inp, p.x, p.y, q.x, q.y, 0.4) < 1.5) inp.ap = true; return;
    }
    let tgt = null, bd = 1e9;
    for (const e of this.en) { if (e.dead) continue; const d = Math.hypot(e.x, e.y) + Math.hypot(e.x - p.x, e.y - p.y) * (0.3 + 0.5 * (1 - sk)); if (d < bd) { bd = d; tgt = e; } }
    if (tgt) { const d = Math.hypot(tgt.x - p.x, tgt.y - p.y); if (d > 4) aimAt(inp, p.x, p.y, tgt.x, tgt.y); }
    if (p.bl <= 0) { let c = 0; for (const e of this.en) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 3.4) c++; if (c >= 3) inp.ap = true; }
  }
  hud(i) { return `${this.p[i].kills} nemici · torri ${this.p[i].built}/2`; }
  result() { const r = super.result(); r.coop = true; r.teamWin = !this.lost; return r; }
}
