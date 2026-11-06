// Track geometry + quasi-steady-state lap simulation (point-mass model).
// Corner speeds come from curvature, aero downforce and mechanical grip; straights
// from power/drag; braking zones from a backward pass. Lap times are calibrated to
// real-world reference laps, so differences between cars emerge from physics.
import { CIRCUITS } from '../data/circuits.js';

const G = 9.81;
const DS = 5; // meters per sample
const geoCache = {};

function catmullClosed(pts, sub) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

export function trackGeometry(cid) {
  if (geoCache[cid]) return geoCache[cid];
  const C = CIRCUITS[cid];
  if (!C) return null;
  const dense = catmullClosed(C.pts, 12);
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
  const g = { cid, name: C.name, N, ds, len: total, x, y, hdg, k: ks, corners, bbox: [minx, miny, maxx, maxy] };
  geoCache[cid] = g;
  return g;
}

export const CAR_BASE = {
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
