// Kart Baso — track and arena geometry for the simulation (no three.js).
// A track is a closed centre line (Catmull-Rom through the control points, sampled every ~2.5 m) plus
// open shortcut paths that join it. The drivable area is the union of every path's road + shoulder:
// walls only exist where a kart would leave all of them, so shortcuts open the walls by themselves.
import { trackDef, arenaById, THEMES } from './data.js';

const cr = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
}
export const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ───────── a sampled path
export class Path {
  // ctrl: [[x, z, y, w]], closed loop or open (open paths get phantom end points along `ends`)
  constructor(ctrl, { closed = true, step = 2.5, ends = null } = {}) {
    this.closed = closed;
    const P = ctrl.slice();
    const n = P.length;
    const get = (i) => {
      if (closed) return P[((i % n) + n) % n];
      if (i < 0) return ends ? ends[0] : P[0];
      if (i >= n) return ends ? ends[1] : P[n - 1];
      return P[i];
    };
    const X = [], Z = [], Y = [], W = [], U = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
      const est = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const k = Math.max(2, Math.ceil(est / step));
      for (let j = 0; j < k; j++) {
        const t = j / k;
        X.push(cr(a[0], b[0], c[0], d[0], t)); Z.push(cr(a[1], b[1], c[1], d[1], t));
        // heights and widths: smooth (cubic) but never overshoot → smoothstep between control points
        const st = t * t * (3 - 2 * t);
        Y.push(b[2] + (c[2] - b[2]) * st); W.push(b[3] + (c[3] - b[3]) * st); U.push(i + t);
      }
    }
    if (!closed) { const e = P[n - 1]; X.push(e[0]); Z.push(e[1]); Y.push(e[2]); W.push(e[3]); U.push(n - 1); }
    const N = this.n = X.length;
    this.x = Float32Array.from(X); this.z = Float32Array.from(Z); this.y = Float32Array.from(Y); this.w = Float32Array.from(W); this.u = Float32Array.from(U);
    this.ramp = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.s = new Float32Array(N + 1);
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = closed ? (i - 1 + N) % N : Math.max(0, i - 1), b = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
      let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
    }
    let s = 0;
    for (let i = 0; i < N; i++) {
      this.s[i] = s;
      const j = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
      s += Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]);
    }
    this.s[N] = s; this.len = s;
    for (let i = 0; i < N; i++) {
      const j = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
      const a0 = Math.atan2(this.tx[i], this.tz[i]), a1 = Math.atan2(this.tx[j], this.tz[j]);
      let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const ds = Math.max(0.5, this.s[i + 1] - this.s[i]);
      this.curv[i] = d / ds; // + = turning left
    }
  }
  wrap(i) { return this.closed ? ((i % this.n) + this.n) % this.n : Math.max(0, Math.min(this.n - 1, i)); }
  // right-hand normal of node i (lat > 0 = right of travel)
  nx(i) { return -this.tz[i]; }
  nz(i) { return this.tx[i]; }
  // nearest point on the polyline. hint: node index to search around (-1 = everywhere)
  nearest(x, z, hint = -1, out = {}) {
    const n = this.n, segs = this.closed ? n : n - 1;
    let lo = 0, hi = segs - 1;
    if (hint >= 0) { lo = hint - 14; hi = hint + 14; }
    let bi = 0, bt = 0, bd = Infinity;
    for (let k = lo; k <= hi; k++) {
      let i = k;
      if (this.closed) i = ((k % n) + n) % n; else if (i < 0 || i >= segs) continue;
      const j = this.closed ? (i + 1) % n : i + 1;
      const ax = this.x[i], az = this.z[i], ex = this.x[j] - ax, ez = this.z[j] - az;
      const l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t - x, pz = az + ez * t - z, d = px * px + pz * pz;
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    if (hint >= 0 && Math.sqrt(bd) > this.w[bi] * 2.5) return this.nearest(x, z, -1, out);
    const j = this.closed ? (bi + 1) % n : Math.min(n - 1, bi + 1);
    const tx = this.tx[bi] + (this.tx[j] - this.tx[bi]) * bt, tz = this.tz[bi] + (this.tz[j] - this.tz[bi]) * bt;
    const tl = Math.hypot(tx, tz) || 1;
    const cx = this.x[bi] + (this.x[j] - this.x[bi]) * bt, cz = this.z[bi] + (this.z[j] - this.z[bi]) * bt;
    out.i = bi; out.t = bt; out.tx = tx / tl; out.tz = tz / tl;
    out.lat = (x - cx) * (-out.tz) + (z - cz) * out.tx;
    out.cx = cx; out.cz = cz;
    out.y = this.y[bi] + (this.y[j] - this.y[bi]) * bt;
    out.w = this.w[bi] + (this.w[j] - this.w[bi]) * bt;
    out.ramp = this.ramp[bi] + (this.ramp[j] - this.ramp[bi]) * bt;
    out.s = this.s[bi] + (this.s[bi + 1] - this.s[bi]) * bt;
    out.u = this.u[bi];
    return out;
  }
  // world point at arc length s (wrapped on loops) and lateral offset (m)
  pointAt(s, lat = 0, out = {}) {
    const L = this.len;
    if (this.closed) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L - 0.01, s));
    let lo = 0, hi = this.n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.s[m] <= s) lo = m; else hi = m - 1; }
    const i = lo, j = this.closed ? (i + 1) % this.n : Math.min(this.n - 1, i + 1);
    const seg = this.s[i + 1] - this.s[i] || 1, t = Math.max(0, Math.min(1, (s - this.s[i]) / seg));
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t, tl = Math.hypot(tx, tz) || 1;
    out.tx = tx / tl; out.tz = tz / tl;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t - out.tz * lat;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t + out.tx * lat;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    out.w = this.w[i] + (this.w[j] - this.w[i]) * t;
    out.i = i;
    return out;
  }
  sAtU(u) {
    // arc length at control parameter u
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = i + 1, uj = j < n ? this.u[j] : (this.closed ? this.u[n - 1] + (this.u[n - 1] - this.u[n - 2]) : this.u[n - 1]);
      if (u >= this.u[i] && u <= uj) { const t = (u - this.u[i]) / ((uj - this.u[i]) || 1); return this.s[i] + (this.s[i + 1] - this.s[i]) * t; }
    }
    return u <= 0 ? 0 : this.len;
  }
}

// ───────── race track
export class Track {
  constructor(key) {
    const def = this.def = trackDef(key);
    this.kind = 'race'; this.key = def.key || def.id; this.id = def.id;
    this.theme = THEMES[def.theme];
    this.void = !!def.void;
    this.shoulder = def.shoulder;
    this.off = this.theme.off;
    const ctrl = def.pts.map((p) => [p[0], p[1], p[2] || 0, p[3] || def.w]);
    const main = this.main = new Path(ctrl, { closed: true });
    main.surf = 'road'; main.margin = def.void ? 0 : def.shoulder; main.isMain = true;
    this.len = main.len;
    // jumps: a kicker profile along the road
    this.jumps = [];
    for (const f of def.feats) if (f.k === 'jump') {
      const s0 = main.sAtU(f.u); this.jumps.push({ s0, len: f.len, h: f.h });
      for (let i = 0; i < main.n; i++) {
        let a = main.s[i] - s0; if (a < -main.len / 2) a += main.len; if (a > main.len / 2) a -= main.len;
        if (a >= 0 && a <= f.len) main.ramp[i] = Math.max(main.ramp[i], f.h * Math.pow(a / f.len, 1.25));
      }
    }
    // shortcuts
    this.paths = [main];
    for (const c of def.cuts || []) {
      const sa = main.sAtU(c.from), sb = main.sAtU(c.to);
      const A = main.pointAt(sa), B = main.pointAt(sb);
      const A0 = main.pointAt(sa - 12), B1 = main.pointAt(sb + 12);
      const pts = [[A.x, A.z, A.y, c.w], ...c.via.map((v, i) => [v[0], v[1], A.y + (B.y - A.y) * ((i + 1) / (c.via.length + 1)), c.w]), [B.x, B.z, B.y, c.w]];
      const p = new Path(pts, { closed: false, step: 2.5, ends: [[A0.x, A0.z, A0.y, c.w], [B1.x, B1.z, B1.y, c.w]] });
      p.surf = c.surf || 'dirt'; p.margin = 1.2; p.cut = c;
      p.sFrom = sa; p.sTo = sb < sa ? sb + main.len : sb;
      this.paths.push(p);
    }
    this.rails = (def.rails || []).map(([a, b]) => [main.sAtU(a), b >= ctrl.length ? main.len : main.sAtU(b)]);
    this.buildFeatures();
    this.q = {}; this.q2 = {};
  }
  // progress (m along the main loop) for a point on path p at arc length s
  progOn(p, s) {
    if (p.isMain) return s;
    const f = Math.max(0, Math.min(1, s / p.len));
    return (p.sFrom + (p.sTo - p.sFrom) * f) % this.len;
  }
  railAt(s) { for (const [a, b] of this.rails) if (s >= a - 1 && s <= b + 1) return true; return false; }
  // Full ground probe for a kart at (x, z). hint: last main node. Fills `o`.
  probe(x, z, hint = -1, o = {}) {
    const main = this.main;
    const q = main.nearest(x, z, hint, this.q);
    let best = main, bq = q, bex = Math.abs(q.lat) - q.w / 2;
    o.ni = q.i;
    o.mainLat = q.lat; o.mainS = q.s;
    for (let k = 1; k < this.paths.length; k++) {
      const p = this.paths[k];
      const r = p.nearest(x, z, -1, this.q2);
      const ex = Math.abs(r.lat) - r.w / 2;
      if (ex < bex && (ex < 0 || bex > 0)) { best = p; bex = ex; bq = { ...r }; }
    }
    o.path = best; o.excess = bex; o.lat = bq.lat; o.w = bq.w; o.tx = bq.tx; o.tz = bq.tz;
    o.prog = this.progOn(best, bq.s);
    const onRoad = bex <= 0;
    o.surf = onRoad ? best.surf : this.off;
    o.gy = bq.y + (onRoad ? bq.ramp : 0);
    o.wall = null;
    if (this.void) {
      // no ground beyond the edge; rails here and there
      if (best.isMain && this.railAt(bq.s) && Math.abs(bq.lat) > bq.w / 2 + 0.2) o.wall = { lat: bq.lat, edge: bq.w / 2 + 0.2, tx: bq.tx, tz: bq.tz, cx: bq.cx, cz: bq.cz };
      else if (bex > 0.6) { o.gy = -Infinity; o.surf = 'void'; }
      return o;
    }
    if (this.off === 'lava' && bex > 1.8) o.surf = 'lava';
    // walls: outside every path's road + margin
    let inside = false;
    for (const p of this.paths) {
      const r = p === best ? bq : p.nearest(x, z, p === main ? hint : -1, this.q2);
      if (Math.abs(r.lat) <= r.w / 2 + p.margin) { inside = true; break; }
    }
    if (!inside) {
      // push back toward the path that is closest to letting us in
      let bp = null, bd = Infinity, br = null;
      for (const p of this.paths) { const r = p.nearest(x, z, p === main ? hint : -1, {}); const d = Math.abs(r.lat) - (r.w / 2 + p.margin); if (d < bd) { bd = d; bp = p; br = r; } }
      o.wall = { lat: br.lat, edge: br.w / 2 + bp.margin, tx: br.tx, tz: br.tz, cx: br.cx, cz: br.cz };
    }
    return o;
  }
  // respawn spot on the main road for a given progress
  respawnAt(prog) { const p = this.main.pointAt(prog - 4, 0); return { x: p.x, z: p.z, y: p.y, h: Math.atan2(p.tx, p.tz) }; }
  // grid slots behind the start line (row of 2, staggered)
  grid(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      const p = this.main.pointAt(-8 - row * 6.5 - (i % 2) * 2.2, side * this.main.w[0] * 0.22);
      out.push({ x: p.x, z: p.z, y: p.y, h: Math.atan2(p.tx, p.tz), prog: -8 - row * 6.5 - (i % 2) * 2.2 });
    }
    return out;
  }
  buildFeatures() {
    const def = this.def, main = this.main, R = rng(hashStr(this.key));
    const F = this.F = { boxes: [], coins: [], boosts: [], muds: [], bumpers: [], geysers: [] };
    const at = (u, lat, w) => { const s = main.sAtU(u); const p = main.pointAt(s, 0); return main.pointAt(s, (lat || 0) * (p.w / 2) * (w ?? 1)); };
    for (const f of def.feats) {
      if (f.k === 'items') {
        const s = main.sAtU(f.u), p0 = main.pointAt(s);
        for (let k = 0; k < 4; k++) { const p = main.pointAt(s, (-0.75 + k * 0.5) * p0.w / 2); F.boxes.push({ x: p.x, z: p.z, y: p.y + 1, t: 0 }); }
      } else if (f.k === 'coins') {
        const s = main.sAtU(f.u);
        for (let k = 0; k < (f.n || 5); k++) { const p0 = main.pointAt(s + k * 3.2); const p = main.pointAt(s + k * 3.2, (f.lat || 0) * p0.w / 2); F.coins.push({ x: p.x, z: p.z, y: p.y + 0.9, t: 0 }); }
      } else if (f.k === 'boost') {
        const p = at(f.u, f.lat); F.boosts.push({ x: p.x, z: p.z, y: p.y, tx: p.tx, tz: p.tz, hl: 3, hw: f.belt ? 3.4 : 2.2, belt: !!f.belt });
      } else if (f.k === 'mud') {
        const p = at(f.u, f.lat); F.muds.push({ x: p.x, z: p.z, y: p.y, r: f.r || 4, ice: !!f.ice, mesh: f.mesh || 'mud' });
      } else if (f.k === 'bumper') {
        const s = main.sAtU(f.u), p = main.pointAt(s);
        F.bumpers.push({ s, cx: p.x, cz: p.z, y: p.y, nx: -p.tz, nz: p.tx, tx: p.tx, tz: p.tz, amp: (f.amp || 0.6) * p.w / 2, period: f.period || 4, phase: R() * 6.28, r: f.mesh === 'cow' ? 2.2 : f.mesh === 'press' ? 2.6 : 2, mesh: f.mesh || 'ball', x: p.x, z: p.z, vx: 0, vz: 0 });
      } else if (f.k === 'geyser') {
        const p = at(f.u, f.lat); F.geysers.push({ x: p.x, z: p.z, y: p.y, r: 2.4, period: f.period || 4, phase: R() * 3, on: false });
      }
    }
    for (const p of this.paths) if (p.cut) {
      if (p.cut.items) for (const f of [0.45]) { const q = p.pointAt(p.len * f); for (const l of [-0.3, 0.3]) { const r = p.pointAt(p.len * f, l * q.w); F.boxes.push({ x: r.x, z: r.z, y: r.y + 1, t: 0 }); } }
      if (p.cut.coins) for (let k = 0; k < p.cut.coins; k++) { const r = p.pointAt(p.len * (0.25 + k * 0.5 / p.cut.coins)); F.coins.push({ x: r.x, z: r.z, y: r.y + 0.9, t: 0 }); }
    }
  }
  // AI helpers: point ahead on the main loop and the heading change over the next `dist` metres
  ahead(prog, dist, lat = 0, out = {}) { return this.main.pointAt(prog + dist, lat, out); }
  bendAhead(prog, d0, d1) {
    const a = this.main.pointAt(prog + d0), b = this.main.pointAt(prog + d1);
    let d = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    return d; // + = bends left
  }
}

// ───────── battle arena
export class Arena {
  constructor(id) {
    const def = this.def = arenaById(id);
    this.kind = 'arena'; this.id = def.id; this.key = def.id;
    this.theme = THEMES[def.theme];
    this.size = def.size; this.round = !!def.round;
    this.pillars = def.pillars.map(([x, z, r]) => ({ x, z, r }));
    this.ramps = def.ramps.map(([x, z, a]) => ({ x, z, a, fx: Math.cos(a), fz: -Math.sin(a), len: 10, hw: 5, h: 1.8 }));
    this.void = false; this.off = 'road';
    const R = rng(hashStr(def.id));
    const F = this.F = { boxes: [], coins: [], boosts: [], muds: [], bumpers: [], geysers: [] };
    const S = def.size;
    for (const [x, z] of [[-S * 0.55, 0], [S * 0.55, 0], [0, -S * 0.55], [0, S * 0.55], [-S * 0.6, -S * 0.6], [S * 0.6, -S * 0.6], [-S * 0.6, S * 0.6], [S * 0.6, S * 0.6], [-S * 0.25, -S * 0.25], [S * 0.25, S * 0.25], [-S * 0.25, S * 0.25], [S * 0.25, -S * 0.25]]) {
      let ok = true; for (const p of this.pillars) if (Math.hypot(p.x - x, p.z - z) < p.r + 3) ok = false;
      if (this.round && Math.hypot(x, z) > S - 6) ok = false;
      if (ok) F.boxes.push({ x, z, y: 1, t: 0 });
    }
    for (let i = 0; i < 18; i++) { const a = R() * 6.28, d = 10 + R() * (S - 18); const x = Math.cos(a) * d, z = Math.sin(a) * d; if (this.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 2)) continue; F.coins.push({ x, z, y: 0.9, t: 0 }); }
    for (const r of this.ramps) F.boosts.push({ x: r.x - r.fx * 7, z: r.z - r.fz * 7, y: 0, tx: r.fx, tz: r.fz, hl: 2.4, hw: 2.4 });
    this.len = 1;
  }
  probe(x, z, hint, o = {}) {
    o.ni = 0; o.prog = 0; o.path = null; o.excess = -1; o.lat = 0; o.surf = 'road'; o.tx = 0; o.tz = 1;
    let gy = 0;
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z, a = dx * r.fx + dz * r.fz, l = -dx * r.fz + dz * r.fx;
      if (Math.abs(l) < r.hw && a > -r.len / 2 && a < r.len / 2) gy = Math.max(gy, r.h * (a + r.len / 2) / r.len);
    }
    o.gy = gy; o.wall = null;
    const S = this.size;
    if (this.round) { const d = Math.hypot(x, z); if (d > S) o.wall = { circle: true, nx: x / d, nz: z / d, depth: d - S }; }
    else {
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax > S || az > S) o.wall = ax - S > az - S ? { circle: true, nx: Math.sign(x), nz: 0, depth: ax - S } : { circle: true, nx: 0, nz: Math.sign(z), depth: az - S };
    }
    return o;
  }
  spawns(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / 4, d = this.size * 0.78; const x = Math.cos(a) * d, z = Math.sin(a) * d; out.push({ x, z, y: 0, h: Math.atan2(-x, -z), prog: 0 }); }
    return out;
  }
  respawnAt(prog, rand = Math.random) { const a = rand() * 6.28, d = this.size * 0.6; const x = Math.cos(a) * d, z = Math.sin(a) * d; return { x, z, y: 0, h: Math.atan2(-x, -z) }; }
}

export function makeWorld(key, battle = false) { return battle ? new Arena(key) : new Track(key); }
