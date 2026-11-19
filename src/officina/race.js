// Officina — race model shared by the 3D race view and the headless tools: tracks (straights and short
// closed circuits sampled every metre), car performance from tier + installed parts, and a step-wise race
// run (drag with gear shifts, flying lap against a ghost, two-lap head-to-head with hybrid boost).
// Pure math: no DOM, no three.js.
import { CLASSES, carDef, rivalOf, RACE_TYPES } from './data.js';

// ───────── tracks
const LOOPS = {
  anello: [[0, 0], [120, 0], [170, 30], [170, 90], [120, 120], [0, 120], [-50, 90], [-50, 30]],
  esse: [[0, 0], [140, 0], [190, 40], [150, 90], [90, 70], [40, 110], [-30, 100], [-60, 40]],
  chicane: [[0, 0], [90, 0], [112, 16], [134, 0], [220, 0], [250, 60], [180, 112], [40, 112], [-25, 60]],
  tornante: [[0, 0], [210, 0], [245, 35], [205, 70], [90, 70], [70, 100], [110, 135], [190, 150], [170, 190], [-20, 185], [-60, 90]],
  ovale: [[0, 0], [200, 0], [262, 60], [200, 120], [0, 120], [-62, 60]],
  mistro: [[0, 0], [150, 0], [205, 48], [160, 80], [205, 120], [120, 155], [0, 140], [-52, 70]],
};
const cache = new Map();
function catmull(P, n) {
  const out = [], N = P.length;
  for (let i = 0; i < N; i++) {
    const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
// resample a closed polyline every `step` metres
function resample(pl, step = 1) {
  const pts = [], N = pl.length; let acc = 0;
  pts.push(pl[0]);
  for (let i = 0; i < N; i++) {
    const a = pl[i], b = pl[(i + 1) % N]; let seg = Math.hypot(b[0] - a[0], b[1] - a[1]), u = 0;
    while (acc + (seg - u) >= step) { u += step - acc; acc = 0; const f = u / seg; pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
    acc += seg - u;
  }
  if (Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < step * 0.5) pts.pop();
  return pts;
}
export function makeTrack(id) {
  if (cache.has(id)) return cache.get(id);
  let tr;
  const drag = /^drag(\d+)$/.exec(id);
  if (drag) {
    const len = +drag[1], n = len + 160;
    const x = [], z = [], h = [], r = [];
    for (let i = 0; i < n; i++) { x.push(i); z.push(0); h.push(0); r.push(Infinity); }
    tr = { id, loop: false, len, n, x, z, h, r, name: `${len} metri` };
  } else {
    const P = resample(catmull((LOOPS[id] || LOOPS.anello).map(([a, b]) => [a * 0.7, b * 0.7]), 24), 1), n = P.length;
    const x = P.map((p) => p[0]), z = P.map((p) => p[1]), h = [], r = [];
    for (let i = 0; i < n; i++) { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; h.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
    // radius from the heading change over ±6 m (smoothed)
    const W = 6;
    for (let i = 0; i < n; i++) { let d = h[(i + W) % n] - h[(i - W + n) % n]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; r.push(Math.abs(d) < 1e-4 ? Infinity : (2 * W) / Math.abs(d)); }
    // direction: make the loop counter-clockwise-agnostic, just record the signed turn for the camera
    tr = { id, loop: true, len: n, n, x, z, h, r, name: { anello: 'Anello', esse: 'Le Esse', chicane: 'Chicane', tornante: 'Tornante', ovale: 'Ovale veloce', mistro: 'Misto' }[id] || id };
  }
  cache.set(id, tr);
  return tr;
}
// position on the track at distance s (metres), lateral offset `off` (left +)
export function trackPos(tr, s, off = 0) {
  const n = tr.n; let f = tr.loop ? ((s % n) + n) % n : Math.max(0, Math.min(n - 1.001, s));
  const i = Math.floor(f), j = tr.loop ? (i + 1) % n : Math.min(n - 1, i + 1), u = f - i;
  const x = tr.x[i] + (tr.x[j] - tr.x[i]) * u, z = tr.z[i] + (tr.z[j] - tr.z[i]) * u;
  let dh = tr.h[j] - tr.h[i]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const h = tr.h[i] + dh * u;
  return { x: x - Math.sin(h) * off, z: z + Math.cos(h) * off, h };
}

// ───────── car performance
const AERO = { kart: 0, junior: 0.6, rally: 0.2, gt: 0.4, endurance: 0.9, formula: 1 };
const GEARS = { kart: 2, junior: 6, rally: 5, gt: 6, endurance: 7, formula: 8 };
// car = { t, parts: { motore, aero, gomme, telaio } }, bonus = fraction (pilot research)
export function carPerf(car, bonus = 0) {
  const t = car.t || 1, p = car.parts || {}, m = p.motore || 0, a = p.aero || 0, g = p.gomme || 0, c = p.telaio || 0;
  const cls = carDef(t).cls, B = Math.pow(1.12, t - 1);
  const acc = 5.2 * Math.pow(B, 0.55) * (1 + 0.05 * m + 0.02 * c) * (1 + bonus);
  const vtop = 28 * Math.pow(B, 0.36) * (1 + 0.025 * m + 0.012 * a + 0.006 * c);
  const lat = 0.95 * Math.pow(B, 0.22) * (1 + 0.04 * g + 0.03 * a + 0.015 * c) * (1 + bonus * 0.6);
  const brake = 7 * Math.pow(B, 0.25) * (1 + 0.04 * g + 0.01 * c);
  const aeroK = AERO[cls] * (0.6 + 0.05 * a) * 0.00011;
  // index shown in the UI: grows ~12% a tier, parts weigh in
  const pi = Math.round(100 * B * (1 + 0.045 * m + 0.03 * a + 0.03 * g + 0.025 * c) * (1 + bonus));
  return { t, cls, acc, vtop, lat, brake, aeroK, gears: GEARS[cls], pi, kmh: Math.round(vtop * 3.6), launch: 9.81 * lat * 0.92 };
}
export const perfIndex = (car, bonus = 0) => carPerf(car, bonus).pi;

// corner-limited speed profile with braking look-ahead (two passes so a loop wraps around)
function speedProfile(tr, P) {
  const n = tr.n, vl = new Float32Array(n), g = 9.81;
  for (let i = 0; i < n; i++) {
    const r = tr.r[i];
    if (!isFinite(r)) { vl[i] = 1e3; continue; }
    const k = P.lat * g * r, d = 1 - k * P.aeroK;
    vl[i] = d > 0.05 ? Math.sqrt(k / d) : 1e3;
  }
  const passes = tr.loop ? 2 : 1;
  for (let p = 0; p < passes; p++) for (let i = n - 1; i >= 0; i--) {
    const j = tr.loop ? (i + 1) % n : i + 1; if (j >= n) continue;
    vl[i] = Math.min(vl[i], Math.sqrt(vl[j] * vl[j] + 2 * P.brake * 1));
  }
  return vl;
}

// ───────── one racer on track
class Racer {
  constructor(tr, P, { lane = 0, laps = 1, flying = false, ers = 0, ersDur = 3, ai = false, rnd = Math.random, skill = 'auto' } = {}) {
    this.tr = tr; this.P = P; this.lane = lane; this.ai = ai; this.rnd = rnd; this.skill = skill;
    this.vl = speedProfile(tr, P);
    this.total = tr.loop ? tr.n * laps : tr.len;
    this.s = 0; this.v = flying ? Math.min(this.vl[0], P.vtop * 0.85) : 0; this.t = 0; this.done = false; this.finishT = 0;
    this.gear = 1; this.lag = 0; this.limiter = 0; this.shifts = []; // drag only
    this.ers = ers; this.ersDur = ersDur; this.boostT = 0; this.lastShift = null;
  }
  get dragMode() { return !this.tr.loop; }
  gearTop(g) { return this.P.vtop * Math.pow(g / this.P.gears, 0.85); }
  rpm() { const g = this.gear, lo = g > 1 ? this.gearTop(g - 1) * 0.62 : 0, hi = this.gearTop(g); return Math.max(0, Math.min(1.05, (this.v - lo) / Math.max(1, hi - lo))); }
  shift(kind) { // kind: 'perfect' | 'good' | 'early' | 'auto'
    if (this.gear >= this.P.gears || this.lag > 0) return null;
    const r = this.rpm();
    let q = kind || (r >= 0.86 ? 'perfect' : r >= 0.7 ? 'good' : 'early');
    this.lag = { perfect: 0.05, good: 0.11, early: 0.26, auto: 0.1 }[q];
    this.gear++; this.lastShift = q; this.shifts.push(q);
    return q;
  }
  boost() { if (this.ers <= 0 || this.boostT > 0 || this.done) return false; this.ers--; this.boostT = this.ersDur; return true; }
  vlimAt(s) { const n = this.tr.n, i = this.tr.loop ? Math.floor(((s % n) + n) % n) : Math.min(n - 1, Math.floor(s)); return this.vl[i]; }
  step(dt) {
    if (this.done) { this.v = Math.max(0, this.v - this.P.brake * 0.5 * dt); this.s += this.v * dt; return; }
    this.t += dt;
    const P = this.P, bo = this.boostT > 0 ? 1 : 0;
    if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
    const vtop = P.vtop * (bo ? 1.07 : 1);
    let a = P.acc * (bo ? 1.35 : 1) * Math.max(0, 1 - (this.v / vtop) ** 2);
    a = Math.min(a, P.launch);
    if (this.dragMode) {
      if (this.lag > 0) { this.lag -= dt; a = 0; }
      else if (this.gear < P.gears && this.v >= this.gearTop(this.gear) * 0.995) {
        a = 0; this.limiter += dt;
        // nobody pressed: the gearbox shifts by itself after a beat on the limiter
        if (this.ai) this.shift(this.rnd() < 0.5 ? 'perfect' : 'good');
        else if (this.skill !== 'auto') this.shift('good');
        else if (this.limiter > 0.06) { this.limiter = 0; this.shift('auto'); }
      } else if (this.gear < P.gears && (this.ai || this.skill !== 'auto') && this.rpm() > (this.skill === 'perfect' ? 0.9 : 0.88 + this.rnd() * 0.1)) this.shift(this.skill === 'perfect' ? 'perfect' : undefined);
    } else if (this.ai || this.skill !== 'auto') {
      // boost on the straights: the speed limit ahead is far above the current speed
      if (this.ers > 0 && this.boostT <= 0 && this.vlimAt(this.s + 60) > this.v * 1.35 && this.v > 12) this.boost();
    }
    let v = this.v + a * dt;
    v = Math.min(v, this.vlimAt(this.s + v * dt));
    this.v = Math.max(0, v);
    this.s += this.v * dt;
    if (this.s >= this.total) {
      const over = this.s - this.total; this.finishT = this.t - (this.v > 0 ? over / this.v : 0); this.done = true;
    }
  }
}

// ───────── a race: player vs rival. opts: { ev, grade, car, bonus, ers (extra charges), ersDur, seed, skill }
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export class RaceRun {
  constructor({ ev, grade = 1, car, bonus = 0, ers = 0, ersDur = 3, seed = 1, skill = 'auto' }) {
    this.ev = ev; this.grade = grade; this.type = ev.type; this.tr = makeTrack(ev.track);
    const rnd = this.rnd = rng(seed * 7919 + grade * 31 + 17);
    this.rivalCar = rivalOf(ev, grade);
    const laps = 1, flying = this.type === 'time';
    const baseErs = this.type === 'h2h' ? 2 : this.type === 'time' ? 1 : 0; // drag: gear shifts instead
    const pe = baseErs ? baseErs + ers : 0;
    this.me = new Racer(this.tr, carPerf(car, bonus), { lane: this.type === 'time' ? 0 : -1, laps, flying, ers: pe, ersDur: ersDur, skill, rnd });
    // the rival drives well but not perfectly: a little random per race
    const rp = carPerf(this.rivalCar, (this.rivalCar.bonus || 0) + 0.07 * (rnd() - 0.5));
    this.rival = new Racer(this.tr, rp, { lane: this.type === 'time' ? 0 : 1, laps, flying, ers: baseErs, ersDur: 3, ai: true, rnd });
    this.t = 0; this.state = 'grid'; this.countdown = this.type === 'time' ? 1.2 : 2.6; this.result = null;
  }
  get racers() { return [this.me, this.rival]; }
  // player input: 'shift' (drag) or 'boost' (circuits). Returns what happened, for the HUD.
  input(kind = 'action') {
    if (this.state !== 'race') return null;
    if (this.type === 'drag' && (kind === 'shift' || kind === 'action')) return this.me.shift();
    if (this.type !== 'drag' && (kind === 'boost' || kind === 'action')) return this.me.boost() ? 'boost' : null;
    return null;
  }
  step(dt) {
    if (this.state === 'grid') { this.countdown -= dt; if (this.countdown <= 0) this.state = 'race'; return; }
    if (this.state === 'done') { for (const r of this.racers) r.step(dt); return; }
    this.t += dt;
    for (const r of this.racers) r.step(dt);
    if (this.me.done && this.rival.done || (this.me.done && this.t > this.me.finishT + 8) || this.t > 240) this.finish();
  }
  finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    const a = this.me.done ? this.me.finishT : Infinity, b = this.rival.done ? this.rival.finishT : this.estimate(this.rival);
    this.result = { win: a < b, me: a, rival: b, gap: a - b, shifts: this.me.shifts.slice() };
  }
  estimate(r) { return r.t + Math.max(0, r.total - r.s) / Math.max(1, r.v); }
  leader() { return this.me.s >= this.rival.s ? this.me : this.rival; }
  // headless: run to the end (60 Hz is not needed for the outcome: 30 Hz)
  runToEnd(dt = 1 / 30) { let guard = 0; while (this.state !== 'done' && guard++ < 30 * 300) this.step(dt); if (this.state !== 'done') this.finish(); return this.result; }
}
// quick outcome for the tools and the "chance" hint: skill 'auto' | 'good' | 'perfect'
export function simulateRace(opts) { return new RaceRun(opts).runToEnd(); }
export { RACE_TYPES, CLASSES };
