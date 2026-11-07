// Track geometry + quasi-steady-state lap simulation (point-mass model).
// Corner speeds come from curvature, aero downforce and mechanical grip; straights
// from power/drag; braking zones from a backward pass. Lap times are calibrated to
// real-world reference laps, so differences between cars emerge from physics.
import { CIRCUITS } from '../data/circuits.js';

const G = 9.81;
const DS = 5; // meters per sample
const geoCache = {};

// Clean raw circuit points: drop near-duplicates and spikes (points that make the line
// double back on itself), which otherwise create cusps and tiny loops in the spline.
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
      if (lu < mean * 0.18) continue; // duplicate
      const cos = (ux * vx + uy * vy) / (lu * lv || 1);
      if (cos < -0.35) continue; // spike: turns back more than ~110°
      out.push(b);
    }
    if (out.length === p.length) break;
    p = out;
  }
  return p;
}

// Centripetal Catmull-Rom (alpha 0.5): no cusps or self-intersections inside a segment
function catmullClosed(pts, sub) {
  const n = pts.length, out = [];
  const tj = (ti, a, b) => ti + Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const P0 = pts[(i - 1 + n) % n], P1 = pts[i], P2 = pts[(i + 1) % n], P3 = pts[(i + 2) % n];
    const t0 = 0, t1 = tj(t0, P0, P1), t2 = tj(t1, P1, P2), t3 = tj(t2, P2, P3);
    for (let s = 0; s < sub; s++) {
      const t = t1 + (t2 - t1) * (s / sub);
      const pt = [0, 1].map((k) => {
        const A1 = (t1 - t) / (t1 - t0) * P0[k] + (t - t0) / (t1 - t0) * P1[k];
        const A2 = (t2 - t) / (t2 - t1) * P1[k] + (t - t1) / (t2 - t1) * P2[k];
        const A3 = (t3 - t) / (t3 - t2) * P2[k] + (t - t2) / (t3 - t2) * P3[k];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        return (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      });
      out.push(pt);
    }
  }
  return out;
}

export function trackGeometry(cid) {
  if (geoCache[cid]) return geoCache[cid];
  const C = CIRCUITS[cid];
  if (!C) return null;
  const dense = catmullClosed(cleanPts(C.pts), 12);
  // arc length
  const L = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const raw = L[L.length - 1];
  const scale = C.len / raw;
  const total = C.len;
  const N = Math.round(total / DS);
  const x = new Float64Array(N), y = new Float64Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / N) * raw;
    while (L[j + 1] < target) j++;
    const f = (target - L[j]) / (L[j + 1] - L[j] || 1);
    const a = dense[j], b = dense[(j + 1) % dense.length];
    x[i] = (a[0] + (b[0] - a[0]) * f) * scale; y[i] = (a[1] + (b[1] - a[1]) * f) * scale;
  }
  const ds = total / N;
  // light smoothing of the resampled line (±10 m), 2 passes
  for (let pass = 0; pass < 2; pass++) {
    const sx = new Float64Array(N), sy = new Float64Array(N);
    for (let i = 0; i < N; i++) { let ax = 0, ay = 0; for (let q = -2; q <= 2; q++) { const w = 3 - Math.abs(q); ax += x[(i + q + N) % N] * w; ay += y[(i + q + N) % N] * w; } sx[i] = ax / 9; sy[i] = ay / 9; }
    x.set(sx); y.set(sy);
  }
  // keep separate parts of the circuit at least MIN_SEP apart (data is coarse: parallel
  // sections can overlap). True crossings (Suzuka) are kept and turned into a bridge.
  const MIN_SEP = 24;
  const cross = [];
  {
    const near = (i, j) => { let d = Math.abs(i - j); d = Math.min(d, N - d); return d < 24; };
    const segX = (i, j) => { const a = i, b = (i + 1) % N, c = j, d = (j + 1) % N; const d1 = (x[b] - x[a]) * (y[c] - y[a]) - (y[b] - y[a]) * (x[c] - x[a]); const d2 = (x[b] - x[a]) * (y[d] - y[a]) - (y[b] - y[a]) * (x[d] - x[a]); const d3 = (x[d] - x[c]) * (y[a] - y[c]) - (y[d] - y[c]) * (x[a] - x[c]); const d4 = (x[d] - x[c]) * (y[b] - y[c]) - (y[d] - y[c]) * (x[b] - x[c]); return d1 * d2 < 0 && d3 * d4 < 0; };
    for (let i = 0; i < N; i++) for (let j = i + 24; j < N; j++) if (!near(i, j) && Math.abs(x[i] - x[j]) < 12 && Math.abs(y[i] - y[j]) < 12 && segX(i, j)) cross.push([i, j]);
    const isCross = (i, j) => cross.some(([a, b]) => { const da = Math.min(Math.abs(a - i), N - Math.abs(a - i)), db = Math.min(Math.abs(b - j), N - Math.abs(b - j)); const ea = Math.min(Math.abs(a - j), N - Math.abs(a - j)), eb = Math.min(Math.abs(b - i), N - Math.abs(b - i)); return (da < 16 && db < 16) || (ea < 16 && eb < 16); });
    let cand = [];
    for (let i = 0; i < N; i++) for (let j = i + 24; j < N; j++) if (!near(i, j) && Math.abs(x[i] - x[j]) < MIN_SEP + 6 && Math.abs(y[i] - y[j]) < MIN_SEP + 6 && !isCross(i, j)) cand.push([i, j]);
    for (let it = 0; it < 40 && cand.length; it++) {
      const dx = new Float64Array(N), dy = new Float64Array(N); let moved = 0;
      for (const [i, j] of cand) {
        const vx = x[j] - x[i], vy = y[j] - y[i]; const d = Math.hypot(vx, vy) || 0.01;
        if (d >= MIN_SEP) continue;
        const push = (MIN_SEP - d) * 0.25; const ux = vx / d, uy = vy / d;
        dx[i] -= ux * push; dy[i] -= uy * push; dx[j] += ux * push; dy[j] += uy * push; moved++;
      }
      if (!moved) break;
      // spread displacement smoothly to neighbours so the line stays fair
      for (let pass = 0; pass < 3; pass++) { const ax = new Float64Array(N), ay = new Float64Array(N); for (let i = 0; i < N; i++) { ax[i] = (dx[(i - 1 + N) % N] + 2 * dx[i] + dx[(i + 1) % N]) / 4; ay[i] = (dy[(i - 1 + N) % N] + 2 * dy[i] + dy[(i + 1) % N]) / 4; } dx.set(ax); dy.set(ay); }
      for (let i = 0; i < N; i++) { x[i] += dx[i] * 1.6; y[i] += dy[i] * 1.6; }
      cand.moved = true;
    }
    if (cand.moved) for (let pass = 0; pass < 4; pass++) {
      const sx = new Float64Array(N), sy = new Float64Array(N);
      for (let i = 0; i < N; i++) { let ax = 0, ay = 0; for (let q = -3; q <= 3; q++) { const w = 4 - Math.abs(q); ax += x[(i + q + N) % N] * w; ay += y[(i + q + N) % N] * w; } sx[i] = ax / 16; sy[i] = ay / 16; }
      x.set(sx); y.set(sy);
    }
  }
  // heading & curvature (smoothed)
  const hdg = new Float64Array(N), k = new Float64Array(N);
  for (let i = 0; i < N; i++) { const b = (i + 1) % N, a = (i - 1 + N) % N; hdg[i] = Math.atan2(y[b] - y[a], x[b] - x[a]); }
  const W = 3;
  for (let i = 0; i < N; i++) {
    let d = hdg[(i + W) % N] - hdg[(i - W + N) % N];
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    k[i] = d / (2 * W * ds);
  }
  const ks = new Float64Array(N);
  const SW = 4;
  for (let i = 0; i < N; i++) { let s = 0; for (let q = -SW; q <= SW; q++) s += k[(i + q + N) % N]; ks[i] = s / (2 * SW + 1); }
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, x[i]); maxx = Math.max(maxx, x[i]); miny = Math.min(miny, y[i]); maxy = Math.max(maxy, y[i]); }
  // corners: local curvature peaks above threshold
  const corners = [];
  for (let i = 0; i < N; i++) {
    const a = Math.abs(ks[i]);
    if (a < 1 / 260) continue;
    let peak = true;
    for (let q = -14; q <= 14; q++) if (q && Math.abs(ks[(i + q + N) % N]) > a) { peak = false; break; }
    if (peak && (!corners.length || i - corners[corners.length - 1].i > 16)) corners.push({ i, dir: Math.sign(ks[i]), r: 1 / a });
  }
  const g = { cid, name: C.name, N, ds, len: total, x, y, hdg, k: ks, corners, cross, bbox: [minx, miny, maxx, maxy] };
  geoCache[cid] = g;
  return g;
}

export const CAR_BASE = {
  junior: { mu: 1.85, kA: 0.00036, P: 620, cd: 0.00105, brakeMu: 1.95 },
  formula: { mu: 2.05, kA: 0.00046, P: 980, cd: 0.00112, brakeMu: 2.1 },
  endurance: { mu: 1.85, kA: 0.0003, P: 560, cd: 0.00066, brakeMu: 1.9 },
};

export function carParams(catId, parts, extra = {}) {
  const b = CAR_BASE[catId] || CAR_BASE.formula;
  const p = (id) => (parts?.[id] ?? 85) - 85;
  return {
    mu: b.mu * (1 + p('chassis') * 0.0013 + p('tyre') * 0.0004 + (extra.grip || 0)),
    kA: b.kA * (1 + p('aero') * 0.0045 + (extra.aero || 0)),
    P: b.P * (1 + p('engine') * 0.0027 + (extra.power || 0)),
    cd: b.cd * (1 + p('aero') * 0.0011 - (extra.lowdrag || 0)),
    brakeMu: b.brakeMu * (1 + p('chassis') * 0.0015),
  };
}

// returns {v: Float64Array (m/s), t: cumulative time, lap}
export function speedProfile(geo, cp) {
  const { N, ds, k } = geo;
  const vlim = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const R = 1 / Math.max(1e-5, Math.abs(k[i]));
    const den = 1 - G * cp.kA * R;
    let v = den <= 0.02 ? 120 : Math.sqrt((G * cp.mu * R) / den);
    vlim[i] = Math.min(v, 120);
  }
  const v = new Float64Array(N);
  // start at the slowest point and do forward/backward passes twice around the loop
  let start = 0; for (let i = 1; i < N; i++) if (vlim[i] < vlim[start]) start = i;
  for (let i = 0; i < N; i++) v[i] = vlim[i];
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < N; n++) {
      const i = (start + n) % N, j = (i + 1) % N;
      const vi = v[i];
      const traction = G * cp.mu * 1.05;
      const a = Math.max(0, Math.min(traction, cp.P / Math.max(vi, 8)) - cp.cd * vi * vi);
      v[j] = Math.min(v[j], Math.sqrt(vi * vi + 2 * a * ds));
    }
    for (let n = 0; n < N; n++) {
      const j = (start - n + N) % N, i = (j - 1 + N) % N;
      const vj = v[j];
      const b = G * (cp.brakeMu + cp.kA * vj * vj * 0.9) + cp.cd * vj * vj;
      v[i] = Math.min(v[i], Math.sqrt(vj * vj + 2 * b * ds));
    }
  }
  const t = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) { const vi = (v[i] + v[(i + 1) % N]) / 2; t[i + 1] = t[i] + ds / Math.max(1, vi); }
  return { v, t, lap: t[N] };
}

const profCache = {};
const gripCache = {};
// Per-track grip calibration: finds the grip multiplier (asphalt/line/temperature) so the
// reference car laps in the real reference time while top speeds stay physical.
export function trackGrip(catId, cid, realLap) {
  const key = catId + ':' + cid + ':' + realLap;
  if (gripCache[key]) return gripCache[key];
  const geo = trackGeometry(cid);
  const base = carParams(catId, null);
  if (!realLap) return 1;
  let lo = 0.5, hi = 2.2;
  for (let it = 0; it < 22; it++) {
    const m = (lo + hi) / 2;
    const lap = speedProfile(geo, { ...base, mu: base.mu * m, kA: base.kA * m, brakeMu: base.brakeMu * m }).lap;
    if (lap > realLap) lo = m; else hi = m;
  }
  gripCache[key] = (lo + hi) / 2;
  return gripCache[key];
}
function gripped(cp, m) { return { ...cp, mu: cp.mu * m, kA: cp.kA * m, brakeMu: cp.brakeMu * m }; }

export function referenceProfile(catId, cid, realLap) {
  const key = catId + ':' + cid + ':' + (realLap || 0);
  if (profCache[key]) return profCache[key];
  const geo = trackGeometry(cid);
  const m = realLap ? trackGrip(catId, cid, realLap) : 1;
  const pr = speedProfile(geo, gripped(carParams(catId, null), m));
  profCache[key] = pr;
  return pr;
}

// lap time (s) for given parts on a track (reference car with all parts at 85 = real lap)
export function physicsLap(catId, track, parts, extra) {
  const geo = trackGeometry(track.cid);
  const m = trackGrip(catId, track.cid, track.lap);
  const ref = referenceProfile(catId, track.cid, track.lap);
  const pr = speedProfile(geo, gripped(carParams(catId, parts, extra), m));
  return track.lap * (pr.lap / ref.lap);
}

// Sensitivity: seconds gained per +5 points on each part
const sensCache = {};
export function partSensitivity(catId, track) {
  const key = catId + ':' + track.id;
  if (sensCache[key]) return sensCache[key];
  const base = { aero: 85, engine: 85, chassis: 85, tyre: 85 };
  const b = physicsLap(catId, track, base);
  const out = {};
  for (const p of ['aero', 'engine', 'chassis']) out[p] = +(b - physicsLap(catId, track, { ...base, [p]: 90 })).toFixed(3);
  sensCache[key] = out;
  return out;
}

// map from time fraction of lap -> sample index (uses reference profile)
export function sampleAtTimeFrac(prof, frac) {
  const T = prof.t, N = T.length - 1;
  const target = ((frac % 1) + 1) % 1 * T[N];
  let lo = 0, hi = N;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (T[m] <= target) lo = m; else hi = m; }
  const f = (target - T[lo]) / ((T[hi] - T[lo]) || 1);
  return lo + f;
}

export function trackStats(catId, track) {
  const geo = trackGeometry(track.cid);
  const pr = referenceProfile(catId, track.cid, track.lap);
  const scale = pr.lap / track.lap;
  let vmax = 0, vmin = 999, full = 0;
  for (let i = 0; i < geo.N; i++) { const v = pr.v[i] * scale; vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
  // full throttle share: where speed is rising
  for (let i = 0; i < geo.N; i++) if (pr.v[(i + 1) % geo.N] >= pr.v[i] - 0.01) full++;
  return { vmax: vmax * 3.6, vmin: vmin * 3.6, full: full / geo.N, corners: geo.corners.length, len: geo.len };
}

// DRS zones: the longest full-throttle straights (fractions of lap distance)
export function drsZones(catId, track, max = 2) {
  const geo = trackGeometry(track.cid); const pr = referenceProfile(catId, track.cid, track.lap);
  const N = geo.N; const zones = []; let start = -1;
  const accel = (i) => pr.v[(i + 1) % N] >= pr.v[i] - 0.02;
  for (let i = 0; i < N * 2; i++) {
    const j = i % N;
    if (accel(j) && Math.abs(geo.k[j]) < 1 / 500) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - start > 0) zones.push([start, i]); start = -1; if (i >= N) break; }
  }
  return zones.filter((z) => z[0] < N).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, max)
    .map(([a, b]) => [a / N + (b - a) / N * 0.25, b / N]);
}
