// Generates the game's ORIGINAL circuit layouts (src/data/circuits.js).
//
// The real-world centerlines from tools/convert-tracks.mjs (bacinger/f1-circuits, MIT) are only
// used as a design brief: their curvature profile is reduced to a list of primitives (straights
// and corners with a turning angle and a minimum radius), which is then redesigned with seeded,
// deterministic operations: corners re-angled and re-sized, complexes split / merged / turned into
// sweeping esses, straights re-proportioned, flat-out kinks added, plus one signature feature per
// circuit (banked carousel, long parabolic final corner, stadium section, sweeping snake, ...).
// The redesigned loop is closed exactly (turning angle and position), rebuilt with clothoid-like
// corners and re-sampled. Every candidate is checked with the game's own track physics
// (src/engine/trackphys.js): no unintended crossings, separation between sections, start straight
// and pit-lane clearance, minimum radius, grip fit and top speed close to the brief's character,
// and a minimum outline difference from the reference after optimal similarity alignment
// (rotation, scale, mirror and start offset). The best candidate per circuit is written out.
//
// Usage: node tools/redesign-tracks.mjs [--only=cid,cid] [--tries=N] [--dry] [--report=file.json]
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { referenceCircuits } from './convert-tracks.mjs';
import { CIRCUITS } from '../src/data/circuits.js';
import { trackGeometry, trackGrip, speedProfile, carParams } from '../src/engine/trackphys.js';
import { TRACKS } from '../src/data/tracks.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ONLY = args.only ? String(args.only).split(',') : null;
const TRIES = +(args.tries || 700);
const OUT = fileURLToPath(new URL('../src/data/circuits.js', import.meta.url));

// ---------------------------------------------------------------- helpers
const DEG = Math.PI / 180;
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// same point cleaning + centripetal Catmull-Rom as trackphys.js (to compute the exact `len`)
function cleanPts(pts) {
  let p = pts.slice();
  const segLen = (i) => Math.hypot(p[(i + 1) % p.length][0] - p[i][0], p[(i + 1) % p.length][1] - p[i][1]);
  for (let pass = 0; pass < 6; pass++) {
    const n = p.length; let mean = 0; for (let i = 0; i < n; i++) mean += segLen(i); mean /= n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < mean * 0.18) continue;
      const cos = (ux * vx + uy * vy) / (lu * lv || 1);
      if (cos < -0.35) continue;
      out.push(b);
    }
    if (out.length === p.length) break;
    p = out;
  }
  return p;
}
function catmullClosed(pts, sub) {
  const n = pts.length, out = [];
  const tj = (ti, a, b) => ti + Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const P0 = pts[(i - 1 + n) % n], P1 = pts[i], P2 = pts[(i + 1) % n], P3 = pts[(i + 2) % n];
    const t0 = 0, t1 = tj(t0, P0, P1), t2 = tj(t1, P1, P2), t3 = tj(t2, P2, P3);
    for (let s = 0; s < sub; s++) {
      const t = t1 + (t2 - t1) * (s / sub);
      out.push([0, 1].map((k) => {
        const A1 = (t1 - t) / (t1 - t0) * P0[k] + (t - t0) / (t1 - t0) * P1[k];
        const A2 = (t2 - t) / (t2 - t1) * P1[k] + (t - t1) / (t2 - t1) * P2[k];
        const A3 = (t3 - t) / (t3 - t2) * P2[k] + (t - t2) / (t3 - t2) * P3[k];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        return (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }));
    }
  }
  return out;
}
function splineLen(pts) { const d = catmullClosed(cleanPts(pts), 12); let L = 0; for (let i = 0; i < d.length; i++) { const a = d[i], b = d[(i + 1) % d.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }

// ---------------------------------------------------------------- reference -> primitives
// Primitive: {t:'S', L, kp?, ksc} straight (kp = the brief's gentle curvature, stretched to L)
//            {t:'C', th, R, kp? | ri, ro} corner: turning angle th, min radius R
export function segment(geo) {
  const { N, ds, k } = geo;
  const core = 1 / 260, ext = 1 / 700;
  const lab = new Int8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(k[i]) > core) lab[i] = Math.sign(k[i]);
  // grow cores while same sign and above the gentle threshold
  for (let grow = 0; grow < N; grow++) {
    let ch = 0;
    for (let i = 0; i < N; i++) {
      if (lab[i]) continue;
      const s = Math.sign(k[i]); if (Math.abs(k[i]) <= ext) continue;
      if (lab[(i - 1 + N) % N] === s || lab[(i + 1) % N] === s) { lab[i] = s; ch++; }
    }
    if (!ch) break;
  }
  // close short same-sign gaps (< 20 m)
  for (let i = 0; i < N; i++) if (!lab[i]) {
    let a = i; while (!lab[(a - 1 + N) % N] && i - a < 6) a--; let b = i; while (!lab[(b + 1) % N] && b - i < 6) b++;
    const la = lab[(a - 1 + N) % N], lb = lab[(b + 1) % N];
    if (la && la === lb && b - a + 1 <= 4) for (let q = a; q <= b; q++) lab[(q + N) % N] = la;
  }
  // start from index 0: find the run containing 0
  let s0 = 0; while (lab[(s0 - 1 + N) % N] === lab[0] && s0 > -N) s0--;
  const runs = [];
  for (let n = 0, i = s0; n < N;) { const l = lab[(i + N) % N]; let m = 0; while (m + n < N && lab[(i + m + N) % N] === l) m++; runs.push({ l, a: i, n: m }); i += m; n += m; }
  let split0 = 0; // samples into the first run where the start line sits
  if (runs[0].l !== 0) {
    // the brief's start line is in a bend (e.g. a curved street start): move it to the middle
    // of the nearest decent straight
    let bi = -1, bd = Infinity, pos = 0;
    runs.forEach((r, i) => { const d = Math.min(pos, N - pos - r.n); if (r.l === 0 && r.n * ds >= 120 && d < bd) { bd = d; bi = i; } pos += r.n; });
    runs.push(...runs.splice(0, bi));
    split0 = Math.floor(runs[0].n / 2);
  }
  const prims = [];
  for (const r of runs) {
    let th = 0, km = 0; const kp = new Float64Array(r.n);
    for (let q = 0; q < r.n; q++) { const kk = k[(r.a + q + N) % N]; kp[q] = kk; th += kk * ds; km = Math.max(km, Math.abs(kk)); }
    if (r.l === 0) prims.push({ t: 'S', L: r.n * ds, kp, L0: r.n * ds, ksc: 1, a: r.a });
    else prims.push({ t: 'C', th, th0: th, R: 1 / km, R0: 1 / km, kp, L0: r.n * ds, ri: 0.3, ro: 0.3, a: r.a });
  }
  // split the run containing index 0 into an "after" (first) and "before" (last) half
  const first = prims[0];
  if (first.t !== 'S') throw new Error(geo.cid + ': index 0 is not on a straight');
  const nb = split0 || -first.a;
  const kb = first.kp.slice(0, nb), ka = first.kp.slice(nb);
  prims[0] = { t: 'S', L: ka.length * ds, kp: ka, L0: ka.length * ds, ksc: 1, start: 1 };
  prims.push({ t: 'S', L: kb.length * ds, kp: kb, L0: kb.length * ds, ksc: 1, start: 2 });
  for (const p of prims) if (p.t === 'C' && p.R < 12) p.R = 12;
  // a full loop in the brief (hand-drawn data) becomes a plain bend
  for (const p of prims) if (p.t === 'C' && Math.abs(p.th) > 310 * DEG) { p.th -= Math.sign(p.th) * 2 * Math.PI; p.kp = null; p.R = Math.max(p.R, 40); }
  return prims;
}
// Corners either keep the brief's curvature shape (kp: scaled in angle and stretched in length so
// that the peak curvature matches 1/R) or are parametric (flat-top profile with ramp shares ri/ro).
const cornerArea = (c) => 1 - (c.ri + c.ro) / 2;
const cornerLen = (c) => c.kp ? c.L0 * (c.R / c.R0) * Math.abs(c.th / c.th0) : Math.abs(c.th) * c.R / cornerArea(c);
const straightPhi = (p) => (p.kp ? p.kp.reduce((a, b) => a + b, 0) * (p.L0 / p.kp.length) * p.ksc : 0);
const primAngle = (p) => (p.t === 'S' ? straightPhi(p) : p.th);
const sampleProf = (kp, u) => kp[Math.min(kp.length - 1, Math.floor(u * kp.length))];

// curvature samples (step h) of a primitive
function primK(p, h) {
  if (p.t === 'S') {
    const n = Math.max(1, Math.round(p.L / h)); const hh = p.L / n; const k = new Float64Array(n);
    if (p.kp) for (let q = 0; q < n; q++) k[q] = sampleProf(p.kp, (q + 0.5) / n) * p.ksc * p.L0 / p.L;
    return { h: hh, k };
  }
  const L = cornerLen(p); const n = Math.max(6, Math.round(L / h)); const hh = L / n;
  const w = new Float64Array(n);
  if (p.kp) {
    for (let q = 0; q < n; q++) w[q] = sampleProf(p.kp, (q + 0.5) / n);
  } else {
    const sm = (t) => (1 - Math.cos(Math.PI * clamp(t, 0, 1))) / 2;
    for (let q = 0; q < n; q++) { const u = (q + 0.5) / n; w[q] = u < p.ri ? sm(u / p.ri) : u > 1 - p.ro ? sm((1 - u) / p.ro) : 1; }
  }
  let I = 0; for (let q = 0; q < n; q++) I += w[q] * hh;
  for (let q = 0; q < n; q++) w[q] *= p.th / I;
  return { h: hh, k: w };
}
// displacement of a primitive in its local frame (straights: also per metre, their shape scales)
function primDisp(p) {
  const { h, k } = primK(p, 0.5); let x = 0, y = 0, a = 0;
  for (let q = 0; q < k.length; q++) { const am = a + k[q] * h / 2; x += Math.cos(am) * h; y += Math.sin(am) * h; a += k[q] * h; }
  if (p.t === 'S') return { dx: x, dy: y, dh: a, ux: x / p.L, uy: y / p.L };
  return { dx: x, dy: y, dh: a };
}
export const totalTurn = (prims) => prims.reduce((s, p) => s + primAngle(p), 0);

// exact closure: fix the heading with the corners, the position with the straight lengths
export const closeWhy = { sign: 0, det: 0, iter: 0 };
export function closeLoop(prims, Theta, minL) {
  const err = Theta - totalTurn(prims);
  const cs = prims.filter((p) => p.t === 'C' && Math.abs(p.th) > 15 * DEG);
  const tw = cs.reduce((s, p) => s + Math.abs(p.th), 0);
  for (const p of cs) { const s0 = Math.sign(p.th); p.th += err * Math.abs(p.th) / tw; if (Math.sign(p.th) !== s0) { closeWhy.sign++; return false; } }
  const disp = prims.map(primDisp);
  // weighted min-norm length changes; straights close to their minimum get a small weight
  // (barrier-like), so repeated solves converge without fixing them for good
  for (let it = 0; it < 80; it++) {
    let h = 0, ex = 0, ey = 0; const U = [];
    prims.forEach((p, i) => {
      const c = Math.cos(h), s = Math.sin(h), d = disp[i];
      if (p.t === 'S') { ex += (d.ux * c - d.uy * s) * p.L; ey += (d.ux * s + d.uy * c) * p.L; U.push([i, d.ux * c - d.uy * s, d.ux * s + d.uy * c, Math.pow(Math.max(p.L - minL(p), 0.5) + 0.5 * Math.max(p.L, 20), 1.3)]); }
      else { ex += d.dx * c - d.dy * s; ey += d.dx * s + d.dy * c; }
      h += d.dh;
    });
    if (Math.hypot(ex, ey) < 0.05) return true;
    let a = 0, b = 0, cc = 0; for (const [, ux, uy, w] of U) { a += w * ux * ux; b += w * ux * uy; cc += w * uy * uy; }
    const det = a * cc - b * b; if (Math.abs(det) < 1e-6) { closeWhy.det++; return false; }
    const lx = (-ex * cc + ey * b) / det, ly = (-ey * a + ex * b) / det;
    for (const [i, ux, uy, w] of U) {
      const p = prims[i]; const nl = p.L + w * (ux * lx + uy * ly);
      p.L = Math.max(minL(p), nl);
    }
    if (it > 60 && Math.hypot(ex, ey) > 400) break;
  }
  closeWhy.iter++; return false;
}

// render primitives to a dense polyline (step ~1 m), starting at the origin heading h0
export function render(prims, h0) {
  const xs = [], ys = [], ks = []; let x = 0, y = 0, a = h0;
  for (const p of prims) {
    const { h, k } = primK(p, 1);
    for (let q = 0; q < k.length; q++) { xs.push(x); ys.push(y); ks.push(k[q]); const am = a + k[q] * h / 2; x += Math.cos(am) * h; y += Math.sin(am) * h; a += k[q] * h; }
  }
  return { xs, ys, ks, gap: Math.hypot(x, y) };
}

// adaptive output points: dense in corners, sparse on straights
function samplePts(r) {
  const { xs, ys, ks } = r; const n = xs.length;
  const kmax = (i) => { let m = 0; for (let q = -25; q <= 25; q++) m = Math.max(m, Math.abs(ks[(i + q + n) % n])); return m; };
  const out = [[xs[0], ys[0]]]; let acc = 0;
  for (let i = 1; i < n; i++) {
    acc += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    const step = clamp(0.5 / Math.max(1e-6, kmax(i)), 9, 42);
    if (acc >= step && n - i > step * 0.6) { out.push([xs[i], ys[i]]); acc = 0; }
  }
  return out;
}

// ---------------------------------------------------------------- redesign operations
const CHAR = {
  // character of the brief: power, street, flow, stop (stop-and-go)
  aus: 'flow', chn: 'flow', jpn: 'flow', bhr: 'stop', ksa: 'power', mia: 'street', can: 'stop', mon: 'tight', esp: 'flow', aut: 'power',
  gbr: 'flow', bel: 'power', hun: 'twisty', ned: 'twisty', ita: 'power', mad: 'street', aze: 'tight', sgp: 'tight', usa: 'flow', mex: 'stop',
  bra: 'flow', lvg: 'power', qat: 'flow', abu: 'stop', imo: 'flow', por: 'flow', mug: 'flow', sep: 'flow', ist: 'flow', nur: 'stop', lem: 'power', fuj: 'power',
};
const SIGS = {
  power: ['carousel', 'parabolic', 'snake'], flow: ['carousel', 'snake', 'parabolic', 'stadium'], stop: ['stadium', 'carousel', 'parabolic'],
  street: ['stadium', 'parabolic', 'snake'], tight: ['stadium'], twisty: ['carousel', 'stadium', 'snake'],
};
const tight = (cid) => CHAR[cid] === 'tight';
// Hand-written briefs for layouts whose reference is too sparse for the automatic redesign to
// close cleanly: straights (m) and corners [angle°, radius m], first and last are the start halves.
const CUSTOM = {
  aut: [300, [-90, 35], 700, [-150, 18], 800, [-80, 30], 260, [50, 70], 200, [-60, 50], 220, [40, 110], 160, [-50, 55], 300, [40, 90], 120, [-60, 45], 300],
};
function customBase(list) {
  return list.map((e, i) => (typeof e === 'number' ? { t: 'S', L: e, kp: null, ksc: 1, ...(i === 0 ? { start: 1 } : i === list.length - 1 ? { start: 2 } : {}) } : { t: 'C', th: e[0] * DEG, R: e[1], ri: 0.3, ro: 0.3 }));
}

function redesign(cid, base, rng, amp = 1) {
  const P = base.map((p) => ({ ...p }));
  const log = [];
  const rr = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const isFree = (p) => !p.start && !p.mod;
  const corners = () => P.map((p, i) => [p, i]).filter(([p]) => p.t === 'C');
  const longest = Math.max(...P.filter((p) => p.t === 'S').map((p) => p.L));
  const Rmin = tight(cid) || CHAR[cid] === 'street' ? 13 : 15;
  // 1. structural complex replacements (3-6)
  const nOps = 2 + Math.floor(rng() * (1 + 3.5 * amp));
  const tried = new Set();
  for (let o = 0, guard = 0; o < nOps && guard < 40; guard++) {
    const op = pick(['split', 'split', 'merge', 'esse', 'kinks', 'swapdir', 'chicane']);
    if (tried.has(op + o) && guard > 30) break;
    tried.add(op + o);
    if (op === 'split') {
      const c = corners().filter(([p, i]) => isFree(p) && Math.abs(p.th) > 65 * DEG);
      if (!c.length) continue; const [p, i] = pick(c);
      const r = rr(0.35, 0.65); const R1 = Math.max(Rmin, p.R * rr(0.75, 1.5)), R2 = Math.max(Rmin, p.R * rr(0.75, 1.5));
      P.splice(i, 1, { t: 'C', th: p.th * r, R: R1, ri: 0.3, ro: 0.3, mod: 1 }, { t: 'S', L: rr(35, tight(cid) ? 70 : 120), phi: 0, mod: 1 }, { t: 'C', th: p.th * (1 - r), R: R2, ri: 0.3, ro: 0.3, mod: 1 });
      log.push(`split ${Math.round(Math.abs(p.th) / DEG)}° corner into a double apex`); o++;
    } else if (op === 'merge') {
      const c = corners().filter(([p, i]) => isFree(p) && P[i + 1]?.t === 'S' && P[i + 1].L < 220 && !P[i + 1].start && P[i + 2]?.t === 'C' && isFree(P[i + 2]) && Math.sign(P[i + 2].th) === Math.sign(p.th) && Math.abs(p.th + P[i + 2].th) < 200 * DEG);
      if (!c.length) continue; const [p, i] = pick(c); const q = P[i + 2];
      const R = Math.max(Rmin, (tight(cid) ? Math.min(p.R, q.R) : Math.max(p.R, q.R)) * rr(1.0, 1.4));
      P.splice(i, 3, { t: 'C', th: p.th + q.th, R, ri: 0.3, ro: 0.3, mod: 1 });
      log.push(`merged two corners into one ${Math.round(Math.abs(p.th + q.th) / DEG)}° bend`); o++;
    } else if (op === 'esse' && !tight(cid)) {
      const c = corners().filter(([p, i]) => isFree(p) && P[i + 1]?.t === 'S' && P[i + 1].L < 120 && !P[i + 1].start && P[i + 2]?.t === 'C' && isFree(P[i + 2]) && Math.sign(P[i + 2].th) !== Math.sign(p.th) && p.R < 120);
      if (!c.length) continue; const [p, i] = pick(c); const q = P[i + 2];
      const f = rr(1.6, 2.6); p.R *= f; q.R *= f; P[i + 1].L = P[i + 1].L * 1.5 + 20; p.mod = q.mod = P[i + 1].mod = 1;
      log.push('chicane opened into a sweeping esse'); o++;
    } else if (op === 'kinks') {
      const c = P.map((p, i) => [p, i]).filter(([p]) => p.t === 'S' && isFree(p) && p.L > 450);
      if (!c.length) continue; const [p, i] = pick(c);
      const th = rr(10, 22) * DEG * (rng() < 0.5 ? 1 : -1), R = rr(260, 420), f = rr(0.3, 0.6);
      P.splice(i, 1, { ...p, L: p.L * f, mod: 1 }, { t: 'C', th, R, ri: 0.35, ro: 0.35, mod: 1 }, { t: 'S', L: rr(60, 140), phi: 0, mod: 1 }, { t: 'C', th: -th, R, ri: 0.35, ro: 0.35, mod: 1 }, { t: 'S', L: p.L * (1 - f), phi: 0, mod: 1 });
      log.push('flat-out kinks added on a straight'); o++;
    } else if (op === 'swapdir') {
      // a medium corner turns the other way, compensated by a neighbouring one: a new sequence
      const c = corners().filter(([p, i]) => isFree(p) && Math.abs(p.th) > 25 * DEG && Math.abs(p.th) < 75 * DEG);
      if (c.length < 2) continue; const [p, i] = pick(c);
      const others = c.filter(([q, j]) => j !== i && Math.sign(q.th) === Math.sign(p.th) && Math.abs(q.th) + 2 * Math.abs(p.th) < 175 * DEG);
      if (!others.length) continue; const [q] = pick(others);
      q.th += 2 * p.th; p.th = -p.th; p.mod = q.mod = 1;
      log.push('corner direction reversed (sequence rewritten)'); o++;
    } else if (op === 'chicane' && CHAR[cid] !== 'flow') {
      const c = P.map((p, i) => [p, i]).filter(([p]) => p.t === 'S' && isFree(p) && p.L > 500 && p.L < longest * 0.95);
      if (!c.length) continue; const [p, i] = pick(c);
      const th = rr(40, 60) * DEG * (rng() < 0.5 ? 1 : -1), R = rr(Rmin + 3, 30), f = rr(0.55, 0.8);
      P.splice(i, 1, { ...p, L: p.L * f, mod: 1 }, { t: 'C', th, R, ri: 0.3, ro: 0.3, mod: 1 }, { t: 'S', L: rr(10, 25), phi: 0, mod: 1 }, { t: 'C', th: -th, R, ri: 0.3, ro: 0.3, mod: 1 }, { t: 'S', L: p.L * (1 - f), phi: 0, mod: 1 });
      log.push('new chicane on a straight'); o++;
    }
  }
  // 2. signature feature
  const sig = pick(SIGS[CHAR[cid]]);
  if (sig === 'carousel') {
    const c = corners().filter(([p]) => !p.start && Math.abs(p.th) > 80 * DEG && Math.abs(p.th) < 210 * DEG);
    if (c.length) { const [p] = pick(c); p.R = clamp(p.R * rr(1.6, 2.4), 55, 110); p.ri = 0.12; p.ro = 0.12; p.kp = null; p.mod = 1; log.push(`signature: banked carousel (${Math.round(Math.abs(p.th) / DEG)}°, R${Math.round(p.R)})`); }
  } else if (sig === 'parabolic') {
    let j = P.length - 2; while (j > 0 && P[j].t !== 'C') j--;
    const p = P[j]; if (p && p.t === 'C' && Math.abs(p.th) > 45 * DEG) { p.R = clamp(p.R * rr(1.5, 2.2), 45, 150); p.ri = 0.1; p.ro = 0.65; p.kp = null; p.mod = 1; log.push(`signature: long parabolic final corner (${Math.round(Math.abs(p.th) / DEG)}°)`); }
  } else if (sig === 'stadium') {
    const c = corners().filter(([p]) => isFree(p) && Math.abs(p.th) > 55 * DEG && Math.abs(p.th) < 130 * DEG);
    if (c.length) {
      const [p, i] = pick(c); const s = Math.sign(p.th), b = rr(55, 80) * DEG, R = Math.max(Rmin, rr(16, 26));
      P.splice(i, 1, { t: 'C', th: p.th / 2 + s * b, R, ri: 0.3, ro: 0.3, mod: 1 }, { t: 'S', L: rr(45, 80), phi: 0, mod: 1 }, { t: 'C', th: -2 * s * b, R: R + 4, ri: 0.3, ro: 0.3, mod: 1 }, { t: 'S', L: rr(45, 80), phi: 0, mod: 1 }, { t: 'C', th: p.th / 2 + s * b, R, ri: 0.3, ro: 0.3, mod: 1 });
      log.push('signature: stadium section (three tight turns)');
    }
  } else if (sig === 'snake') {
    const c = P.map((p, i) => [p, i]).filter(([p]) => p.t === 'S' && !p.start && p.L > 550 && p.L < longest * 0.95);
    if (c.length) {
      const [p, i] = pick(c); const th = rr(28, 40) * DEG * (rng() < 0.5 ? 1 : -1), R = rr(110, 170); const seg = [];
      seg.push({ ...p, L: p.L * 0.3, mod: 1 });
      [1, -2, 2, -1].forEach((m, n) => { seg.push({ t: 'C', th: th * m / (Math.abs(m) === 2 ? 1 : 1), R, ri: 0.3, ro: 0.3, mod: 1 }); if (n < 3) seg.push({ t: 'S', L: rr(15, 40), phi: 0, mod: 1 }); });
      seg.push({ t: 'S', L: p.L * 0.3, phi: 0, mod: 1 });
      P.splice(i, 1, ...seg);
      log.push('signature: sweeping snake of esses');
    }
  }
  // 3. re-angle corner pairs (keeps the total turning)
  const nRe = 2 + Math.floor(rng() * (2 + 3 * amp));
  for (let o = 0; o < nRe; o++) {
    const c = corners().filter(([p]) => Math.abs(p.th) > 30 * DEG);
    if (c.length < 2) break;
    const [a] = pick(c), [b] = pick(c); if (a === b) continue;
    const d = rr(15, 15 + 35 * amp) * DEG;
    const na = a.th + d * Math.sign(a.th), nb = b.th - d * Math.sign(a.th);
    if (Math.sign(na) !== Math.sign(a.th) || Math.sign(nb) !== Math.sign(b.th) || Math.abs(na) > 215 * DEG || Math.abs(nb) > 215 * DEG || Math.abs(na) < 12 * DEG || Math.abs(nb) < 12 * DEG) continue;
    a.th = na; b.th = nb;
  }
  log.push(`${nRe} corners re-angled`);
  // 4. radius changes
  for (const [p] of corners()) if (!p.mod || rng() < 0.3) { if (rng() < 0.45) p.R = Math.max(Rmin, p.R * rr(tight(cid) ? 0.8 : 0.65, tight(cid) ? 1.25 : 1.6)); }
  for (const [p] of corners()) { p.R = Math.max(Rmin, p.R); if (Math.abs(p.th) > 150 * DEG) p.R = Math.max(p.R, 15); }
  // 5. re-proportion the straights (the longest keeps its role)
  for (const p of P) if (p.t === 'S' && !p.start && p.L > 30) p.L *= p.L >= longest * 0.98 ? rr(0.92, 1.18) : rr(1 - 0.5 * amp, 1 + 0.6 * amp);
  return { P, log, sig };
}

// crossings (count) and min separation of sections >= 120 m apart along the line, via a grid
export function quickCheck(xs, ys) {
  const step = 5, P = []; for (let i = 0; i < xs.length; i += step) P.push([xs[i], ys[i]]);
  const n = P.length, C = 30, grid = new Map(); const key = (x, y) => Math.floor(x / C) + ',' + Math.floor(y / C);
  P.forEach((p, i) => { const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const gap = Math.round(120 / step); let minSep = Infinity; const cr = [];
  const sx = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    const [x, y] = P[i]; const gx = Math.floor(x / C), gy = Math.floor(y / C);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get((gx + dx) + ',' + (gy + dy)) || []) {
      if (j <= i) continue; let d = j - i; d = Math.min(d, n - d);
      if (pass === 0) { if (d >= 3 && sx(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n]) && !cr.some(([a, b]) => Math.abs(a - i) < 30 && Math.abs(b - j) < 30)) cr.push([i, j]); continue; }
      if (d < gap) continue;
      if (cr.some(([a, b]) => Math.abs(a - i) < 16 && Math.abs(b - j) < 16)) continue;
      minSep = Math.min(minSep, Math.hypot(P[j][0] - x, P[j][1] - y));
    }
  }
  return { crosses: cr.length, minSep };
}

// ---------------------------------------------------------------- metrics
function resample(x, y, M) {
  const n = x.length, L = [0]; for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(x[i % n] - x[i - 1], y[i % n] - y[i - 1]));
  const T = L[n], out = []; let j = 0;
  for (let m = 0; m < M; m++) { const t = m / M * T; while (L[j + 1] < t) j++; const f = (t - L[j]) / (L[j + 1] - L[j] || 1); out.push([x[j] + (x[(j + 1) % n] - x[j]) * f, y[j] + (y[(j + 1) % n] - y[j]) * f]); }
  return out;
}
// Outline difference after the best similarity alignment of B onto A: scale fixed by the
// perimeter ratio, best rotation / translation / mirror found by multi-start symmetric ICP.
// Returns mean and max (Hausdorff) point-to-outline distance as a share of A's extent.
export function outlineDeviation(ax, ay, bx, by, M = 300) {
  const per = (x, y) => { let L = 0; for (let i = 0; i < x.length; i++) L += Math.hypot(x[(i + 1) % x.length] - x[i], y[(i + 1) % y.length] - y[i]); return L; };
  const sc = per(ax, ay) / per(bx, by);
  const cen = (P) => { let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; } return [cx / P.length, cy / P.length]; };
  const A = resample(ax, ay, M); const ca = cen(A); const Ac = A.map((p) => [p[0] - ca[0], p[1] - ca[1]]);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity; for (const p of Ac) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  const ext = Math.max(maxx - minx, maxy - miny);
  const nn = (P, Q) => P.map((p) => { let bd = Infinity, bi = 0; for (let j = 0; j < Q.length; j++) { const q = Q[j]; const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (d < bd) { bd = d; bi = j; } } return [Math.sqrt(bd), bi]; });
  let best = null;
  for (const mir of [1, -1]) {
    const B0 = resample(bx, by, M).map((p) => [p[0] * sc, p[1] * sc * mir]); const cb = cen(B0); const Bc = B0.map((p) => [p[0] - cb[0], p[1] - cb[1]]);
    for (let r0 = 0; r0 < 12; r0++) {
      let ang = r0 / 12 * 2 * Math.PI, tx = 0, ty = 0, Bt = null, cost = 0;
      for (let it = 0; it < 10; it++) {
        const c = Math.cos(ang), s = Math.sin(ang);
        Bt = Bc.map((p) => [p[0] * c - p[1] * s + tx, p[0] * s + p[1] * c + ty]);
        const n1 = nn(Bt, Ac), n2 = nn(Ac, Bt);
        // pairs (b in Bc frame, a): rigid Procrustes on symmetric correspondences
        const pr = []; n1.forEach(([, j], i) => pr.push([Bc[i], Ac[j]])); n2.forEach(([, j], i) => pr.push([Bc[j], Ac[i]]));
        let mbx = 0, mby = 0, max = 0, may = 0; for (const [b, a] of pr) { mbx += b[0]; mby += b[1]; max += a[0]; may += a[1]; }
        mbx /= pr.length; mby /= pr.length; max /= pr.length; may /= pr.length;
        let re = 0, im = 0; for (const [b, a] of pr) { const bx2 = b[0] - mbx, by2 = b[1] - mby, ax2 = a[0] - max, ay2 = a[1] - may; re += ax2 * bx2 + ay2 * by2; im += ay2 * bx2 - ax2 * by2; }
        ang = Math.atan2(im, re); const c2 = Math.cos(ang), s2 = Math.sin(ang);
        tx = max - (mbx * c2 - mby * s2); ty = may - (mbx * s2 + mby * c2);
        cost = (n1.reduce((q, v) => q + v[0], 0) + n2.reduce((q, v) => q + v[0], 0)) / (2 * M);
      }
      const c = Math.cos(ang), s = Math.sin(ang); Bt = Bc.map((p) => [p[0] * c - p[1] * s + tx, p[0] * s + p[1] * c + ty]);
      const d1 = nn(Bt, Ac).map((v) => v[0]), d2 = nn(Ac, Bt).map((v) => v[0]);
      const mean = (d1.reduce((q, v) => q + v, 0) + d2.reduce((q, v) => q + v, 0)) / (2 * M);
      if (!best || mean < best.mean) best = { mean, max: Math.max(...d1, ...d2), aligned: Bt };
    }
  }
  return { mean: best.mean / ext, max: best.max / ext, aligned: best.aligned, ref: Ac };
}
// turning-angle (curvature) profile correlation, best over start shift / mirror / direction
export function turnCorr(ka, kb) {
  const M = 360; const rs = (k) => { const n = k.length, o = new Float64Array(M); for (let m = 0; m < M; m++) { let s = 0, c = 0; const a = Math.floor(m / M * n), b = Math.floor((m + 1) / M * n); for (let i = a; i < Math.max(a + 1, b); i++) { s += k[i % n]; c++; } o[m] = s / c; } return o; };
  const sm = (o) => { const r = new Float64Array(M); for (let m = 0; m < M; m++) { let s = 0; for (let q = -2; q <= 2; q++) s += o[(m + q + M) % M]; r[m] = s / 5; } return r; };
  const A = sm(rs(ka)), B0 = sm(rs(kb));
  const z = (o) => { const mu = o.reduce((a, b) => a + b, 0) / M; const sd = Math.sqrt(o.reduce((a, b) => a + (b - mu) ** 2, 0) / M) || 1; return o.map((v) => (v - mu) / sd); };
  const Az = z(A); let best = -1;
  for (const mir of [1, -1]) for (const rev of [false, true]) {
    let B = Array.from(B0, (v) => v * mir); if (rev) B = B.reverse().map((v) => -v);
    const Bz = z(Float64Array.from(B));
    for (let sh = 0; sh < M; sh++) { let s = 0; for (let m = 0; m < M; m++) s += Az[m] * Bz[(m + sh) % M]; best = Math.max(best, s / M); }
  }
  return best;
}

// geometry validity on the game's processed line
export function checkGeo(geo, opts = {}) {
  const { N, ds, x, y, k } = geo; const issues = [];
  for (let i = 0; i < N; i++) if (!isFinite(x[i]) || !isFinite(y[i]) || !isFinite(k[i])) { issues.push('NaN'); break; }
  // crossings (clustered)
  const segX = (i, j) => { const a = i, b = (i + 1) % N, c = j, d = (j + 1) % N; const d1 = (x[b] - x[a]) * (y[c] - y[a]) - (y[b] - y[a]) * (x[c] - x[a]); const d2 = (x[b] - x[a]) * (y[d] - y[a]) - (y[b] - y[a]) * (x[d] - x[a]); const d3 = (x[d] - x[c]) * (y[a] - y[c]) - (y[d] - y[c]) * (x[a] - x[c]); const d4 = (x[d] - x[c]) * (y[b] - y[c]) - (y[d] - y[c]) * (x[b] - x[c]); return d1 * d2 < 0 && d3 * d4 < 0; };
  const crosses = [];
  for (let i = 0; i < N; i++) for (let j = i + 3; j < N; j++) { if (i === 0 && j === N - 1) continue; if (Math.abs(x[i] - x[j]) > 12 || Math.abs(y[i] - y[j]) > 12) continue; if (segX(i, j) && !crosses.some(([a, b]) => Math.abs(a - i) < 20 && Math.abs(b - j) < 20)) crosses.push([i, j]); }
  // separation between non-adjacent sections (arc gap >= 120 m), ignoring the crossing area
  let minSep = Infinity, at = null;
  for (let i = 0; i < N; i++) for (let j = i + 24; j < N; j++) {
    let d = j - i; d = Math.min(d, N - d); if (d < 24) continue;
    if (crosses.some(([a, b]) => (Math.abs(a - i) < 14 && Math.abs(b - j) < 14))) continue;
    const dx = x[j] - x[i], dy = y[j] - y[i]; if (Math.abs(dx) > 60 || Math.abs(dy) > 60) continue;
    const dd = Math.hypot(dx, dy); if (dd < minSep) { minSep = dd; at = [i, j]; }
  }
  // radius / cusps
  let kmax = 0, dh = 0; for (let i = 0; i < N; i++) { kmax = Math.max(kmax, Math.abs(k[i])); dh = Math.max(dh, Math.abs(wrapA(geo.hdg[(i + 1) % N] - geo.hdg[i]))); }
  // start straight: run through index 0 with |k| < 1/500
  let a = 0, b = 0; while (Math.abs(k[(a - 1 + N) % N]) < 1 / 500 && a > -N / 2) a--; while (Math.abs(k[(b + 1) % N]) < 1 / 500 && b < N / 2) b++;
  const startStraight = (b - a) * ds, startAfter = b * ds, startBefore = -a * ds;
  // pit side (+, left of travel) clearance around the start, as race3d.js measures it
  let pitClr = 999;
  for (let i = -60; i <= 60; i++) {
    const ii = (i + N) % N, c = Math.cos(geo.hdg[ii]), sn = Math.sin(geo.hdg[ii]);
    for (let j = 0; j < N; j++) { let d = Math.abs(ii - j); d = Math.min(d, N - d); if (d < 16) continue; const vx = x[j] - x[ii], vy = y[j] - y[ii]; if (Math.abs(vx) > 90 || Math.abs(vy) > 90) continue; const lon = vx * c + vy * sn, lat = -vx * sn + vy * c; if (Math.abs(lon) > 14) continue; if (lat > 0) pitClr = Math.min(pitClr, lat); }
  }
  const crossAng = crosses.map(([i, j]) => Math.abs(Math.sin(geo.hdg[i] - geo.hdg[j])));
  return { crosses: crosses.length, crossAt: crosses, crossAng: crossAng.length ? Math.asin(Math.min(...crossAng)) / DEG : 90, minSep, sepAt: at, minR: 1 / kmax, maxDh: dh, startStraight, startAfter, startBefore, pitClr, corners: geo.corners.length, trackCross: geo.cross.length, issues };
}

export function lapTargets(cid) {
  const out = [];
  for (const cat of ['formula', 'junior', 'endurance']) for (const t of TRACKS[cat]) if (t.cid === cid) out.push([cat, t.lap, t.id]);
  return out;
}
export function charStats(key, cid) {
  const [cat, lap] = lapTargets(cid)[0] || ['formula', 90];
  const m = trackGrip(cat, key, lap); const geo = trackGeometry(key);
  const base = carParams(cat, null); const pr = speedProfile(geo, { ...base, mu: base.mu * m, kA: base.kA * m, brakeMu: base.brakeMu * m });
  let vmax = 0, vmin = 1e9, full = 0, brakes = 0; const N = geo.N;
  for (let i = 0; i < N; i++) { vmax = Math.max(vmax, pr.v[i]); vmin = Math.min(vmin, pr.v[i]); if (pr.v[(i + 1) % N] >= pr.v[i] - 0.01) full++; }
  // heavy braking zones (speed drop > 90 km/h) = overtaking spots
  for (let i = 0; i < N; i++) { const p = pr.v[(i - 1 + N) % N], v = pr.v[i], nx = pr.v[(i + 1) % N]; if (v >= p && v > nx) { let j = i, mn = v; for (let q = 1; q < N / 2; q++) { const w = pr.v[(i + q) % N]; if (w > pr.v[(i + q - 1) % N] + 0.01) break; mn = w; } if ((v - mn) * 3.6 > 90) brakes++; } }
  return { grip: m, vmax: vmax * 3.6, vmin: vmin * 3.6, full: full / N, brakes, lap: pr.lap };
}

// ---------------------------------------------------------------- main
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const REF = referenceCircuits();
  for (const [cid, c] of Object.entries(REF)) CIRCUITS['ref_' + cid] = c;
  let prev = {}; try { prev = JSON.parse(readFileSync(fileURLToPath(new URL('../src/data/circuits.js', import.meta.url)), 'utf8').replace(/^[\s\S]*?export const CIRCUITS = /, '').replace(/;\s*$/, '')); } catch {}
  const result = {}, report = {};
  const t0 = Date.now();
  for (const cid of Object.keys(REF)) {
    if (ONLY && !ONLY.includes(cid)) { if (prev[cid]) result[cid] = prev[cid]; continue; }
    const rg = trackGeometry('ref_' + cid); const rc = checkGeo(rg); const rs = charStats('ref_' + cid, cid);
    const base = CUSTOM[cid] ? customBase(CUSTOM[cid]) : segment(rg);
    const Theta = totalTurn(base);
    const turns = Math.round(Theta / (2 * Math.PI));
    const ThetaT = turns * 2 * Math.PI;
    const startMin = cid === 'mon' ? 105 : 140;
    let best = null; const fails = {};
    for (let t = 0; t < TRIES * 2; t++) {
      if (t === TRIES && best) break; // second round (gentler) only when the first found nothing
      const rng = rngOf(hash(cid) ^ (t * 2654435761));
      const tt = t % TRIES; const amp = (tt < TRIES * 0.5 ? 1 : tt < TRIES * 0.75 ? 0.75 : tt < TRIES * 0.9 ? 0.5 : 0.35) * (t >= TRIES ? 0.4 : 1);
      const { P, log, sig } = redesign(cid, base, rng, amp);
      const mirror = rng() < 0.5;
      if (mirror) for (const p of P) { if (p.t === 'S') p.ksc = -p.ksc; else p.th = -p.th; }
      // start straight halves stay straight, long enough for grid + pit lane
      for (const p of P) if (p.start) { p.ksc *= 0.3; p.L = Math.max(p.L, startMin); }
      const minL = (p) => (p.start ? startMin : p.L < 30 ? Math.min(p.L, 8) + 2 : 30);
      const target = REF[cid].len * (1 + (rng() - 0.5) * 0.06);
      const h0 = rng() * 2 * Math.PI;
      let ok = closeLoop(P, mirror ? -ThetaT : ThetaT, minL);
      // bring the length near the target by re-proportioning the straights, then close again
      for (let it = 0; ok && it < 6; it++) {
        const tot = P.reduce((s, p) => s + (p.t === 'S' ? p.L : cornerLen(p)), 0);
        if (Math.abs(tot / target - 1) < 0.04) break;
        const free = P.filter((p) => p.t === 'S' && !p.start && p.L > 30); const fl = free.reduce((s, p) => s + p.L, 0);
        const f = clamp((fl - (tot - target)) / fl, 0.5, 1.6); for (const p of free) p.L = Math.max(30, p.L * f);
        ok = closeLoop(P, mirror ? -ThetaT : ThetaT, minL);
      }
      if (!ok) { fails.close = (fails.close || 0) + 1; continue; }
      const r = render(P, h0);
      let len = r.xs.length; // ~1 m per sample
      const sc = target / len;
      if (sc < 0.72 || sc > 1.25) { fails.len = (fails.len || 0) + 1; if (args.v) console.log("  sc", sc.toFixed(2)); continue; }
      const xs = r.xs.map((v) => v * sc), ys = r.ys.map((v) => v * sc), ks = r.ks.map((v) => v / sc);
      { // fast pre-check on the rendered line: crossings and section separation
        const q = quickCheck(xs, ys); const want = cid === 'jpn' ? 1 : 0;
        if (q.crosses !== want) { fails.cross = (fails.cross || 0) + 1; if (args.dump && (globalThis.__dump ??= []).length < 12) globalThis.__dump.push({ q, log, xs: xs.filter((v, i) => i % 10 === 0), ys: ys.filter((v, i) => i % 10 === 0) }); continue; }
        if (q.minSep < 28) { fails.sep = (fails.sep || 0) + 1; continue; }
      }
      let pts = samplePts({ xs, ys, ks }).map((p) => [Math.round(p[0]), Math.round(p[1])]);
      // recentre
      let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx = Math.round(cx / pts.length); cy = Math.round(cy / pts.length); pts = pts.map((p) => [p[0] - cx, p[1] - cy]);
      let key = `cand_${cid}_${t}`;
      CIRCUITS[key] = { name: cid.toUpperCase(), len: Math.round(splineLen(pts)), pts };
      let g = trackGeometry(key); let c = checkGeo(g);
      if (c.pitClr < Math.min(rc.pitClr, 45)) {
        // the pit side faces another part of the circuit: use the mirror image instead
        pts = pts.map((p) => [p[0], -p[1]]); delete CIRCUITS[key]; const key2 = key + 'm';
        CIRCUITS[key2] = { name: cid.toUpperCase(), len: Math.round(splineLen(pts)), pts };
        const g2 = trackGeometry(key2), c2 = checkGeo(g2);
        if (c2.pitClr > c.pitClr) { g = g2; c = c2; key = key2; } else delete CIRCUITS[key2];
      }
      const want = cid === 'jpn' ? 1 : 0;
      const bad = [];
      if (c.issues.length) bad.push('nan');
      if (c.crosses !== want || c.crossAng < 40) bad.push('cross');
      // a bridge must stay well away from the pit lane / grid (+-300 m around the line)
      if (c.crossAt.some(([i, j]) => Math.min(i, g.N - i, j, g.N - j) < 60 + 24)) bad.push('cross');
      if (c.minSep < 27) bad.push('sep');
      if (c.minR < 12) bad.push('radius');
      if (c.startStraight < (cid === 'mon' ? 180 : 250) || c.startAfter < 70 || c.startBefore < 70) bad.push('start');
      if (c.pitClr < Math.min(rc.pitClr, 45)) bad.push('pit');
      if (bad.length) { for (const b of bad) fails[b] = (fails[b] || 0) + 1; delete CIRCUITS[key]; continue; }
      const st = charStats(key, cid);
      const gr = st.grip / rs.grip, vr = st.vmax / rs.vmax;
      if (Math.abs(gr - 1) > (tight(cid) ? 0.08 : 0.11) || Math.abs(vr - 1) > (tight(cid) ? 0.03 : 0.06) || Math.abs(st.brakes - rs.brakes) > 2) { fails.char = (fails.char || 0) + 1; delete CIRCUITS[key]; continue; }
      const dev = outlineDeviation(rg.x, rg.y, g.x, g.y, 200);
      if (dev.mean < 0.06) { fails.similar = (fails.similar || 0) + 1; delete CIRCUITS[key]; continue; }
      const tc = turnCorr(rg.k, g.k);
      const score = Math.min(dev.mean, 0.14) * 30 + Math.min(dev.max, 0.4) * 2 - Math.max(0, tc - 0.4) * 2 - Math.abs(gr - 1) * 6 - Math.abs(vr - 1) * 4 - Math.abs(st.brakes - rs.brakes) * 0.1 - Math.abs(c.corners - rc.corners) / Math.max(8, rc.corners) * 1 + Math.min(c.minSep, 40) / 200;
      if (!best || score > best.score) { if (best) delete CIRCUITS[best.key]; best = { key, score, t, log, sig, mirror, dev: { mean: dev.mean, max: dev.max }, tc, c, st, pts, len: CIRCUITS[key].len }; }
      else delete CIRCUITS[key];
    }
    if (args.v) console.log(cid, 'close', JSON.stringify(closeWhy)); closeWhy.sign = closeWhy.det = closeWhy.iter = 0;
    if (!best) { console.log(cid, 'NO VALID CANDIDATE', JSON.stringify(fails)); if (prev[cid]) result[cid] = prev[cid]; continue; }
    result[cid] = { name: cid.toUpperCase(), len: best.len, pts: best.pts };
    report[cid] = { try: best.t, refLen: REF[cid].len, len: best.len, devMean: +(best.dev.mean * 100).toFixed(1), devMax: +(best.dev.max * 100).toFixed(1), turnCorr: +best.tc.toFixed(2), mirror: best.mirror, changes: best.log, refCorners: rc.corners, corners: best.c.corners, refGrip: +rs.grip.toFixed(3), grip: +best.st.grip.toFixed(3), refVmax: Math.round(rs.vmax), vmax: Math.round(best.st.vmax), refBrakes: rs.brakes, brakes: best.st.brakes, minSep: Math.round(best.c.minSep), minR: Math.round(best.c.minR), start: Math.round(best.c.startStraight), pitClr: Math.round(best.c.pitClr), crosses: best.c.crosses, pts: best.pts.length, refPts: REF[cid].pts.length, fails };
    console.log(cid.padEnd(4), `len ${REF[cid].len}->${best.len}`, `dev ${report[cid].devMean}%/${report[cid].devMax}%`, `corr ${report[cid].turnCorr}`, `grip ${report[cid].refGrip}->${report[cid].grip}`, `vmax ${report[cid].refVmax}->${report[cid].vmax}`, `brk ${rs.brakes}->${best.st.brakes}`, `crn ${rc.corners}->${best.c.corners}`, `sep ${report[cid].minSep}`, `R ${report[cid].minR}`, `start ${report[cid].start}`, `pit ${Math.round(rc.pitClr)}->${report[cid].pitClr}`, `[${((Date.now() - t0) / 1000).toFixed(0)}s]`, JSON.stringify(fails));
  }
  if (args.dump) writeFileSync(args.dump, JSON.stringify(globalThis.__dump || []));
  if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 1));
  if (!args.dry) {
    const order = Object.keys(REF);
    const body = order.filter((c) => result[c]).map((c) => JSON.stringify(c) + ':' + JSON.stringify(result[c])).join(',\n');
    writeFileSync(OUT, '// Circuit centerlines in meters. All layouts are original designs created for this game\n' +
      '// (generated by tools/redesign-tracks.mjs). Real-world centerlines from bacinger/f1-circuits\n' +
      '// (MIT License) were used only as a starting reference for length and character.\n' +
      'export const CIRCUITS = {\n' + body + '\n};\n');
    console.log('written', OUT);
  }
}
