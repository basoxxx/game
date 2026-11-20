// Ingorgo — rules, state and solver. Pure logic (no DOM, no three.js): the game, the generator, the
// screens and the node tests (tools/ingorgo-gen-test.mjs) all import it.
//
// LEVEL JSON (campaign data, generator output, daily puzzle):
//   { w, h, goal: 'hero' | 'all',
//     cars: [{ x, y, len, ax: 0 (horizontal) | 1 (vertical), dir: 1 | -1 (facing: right/down = 1), kind?, hero? }],
//     walls?: [[x, y]],                 // planters, pillars: blocked cells
//     arrows?: [[x, y, d]],             // one-way cells, d = 0 →, 1 ↓, 2 ←, 3 ↑ (only same-axis traffic is restricted)
//     lights?: [[x, y, g]],             // traffic lights (group 0/1): every move flips them; red cells cannot be entered
//     ferry?: { x, y, len },            // a river fills column x, the ferry (len cells) slides along it: cars cross on it
//     phase?: 0 | 1,                    // starting light phase
//     time?: seconds,                   // timed jam (Ora di punta)
//     opt: minimal moves (solver), id?, seed?, world? }
// Rules: a move slides ONE vehicle any number of cells along its axis (or the ferry along the river).
//   goal 'hero': the hero car must leave through the gap in front of it (its facing edge).
//   goal 'all':  every vehicle must leave, each only through the edge it faces (nose first).
//   A vehicle cannot enter walls, water, other vehicles, a one-way cell against the arrow or a red light.
//   The ferry moves only when nothing is on it.
// STATE: Int8Array [pos of each car (x for horizontal, y for vertical; EXITED once out) …, ferryY, phase]

export const EXITED = -99;
export const DV = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // → ↓ ← ↑
export const dirIndex = (ax, d) => (ax === 0 ? (d > 0 ? 0 : 2) : (d > 0 ? 1 : 3));

// compile a level into fast lookup tables
export function compile(L) {
  const w = L.w, h = L.h, N = w * h;
  const walls = new Uint8Array(N), arrows = new Int8Array(N).fill(-1), lights = new Int8Array(N).fill(-1);
  for (const [x, y] of L.walls || []) walls[y * w + x] = 1;
  for (const [x, y, d] of L.arrows || []) arrows[y * w + x] = d;
  for (const [x, y, g] of L.lights || []) lights[y * w + x] = g;
  const cars = L.cars.map((c, i) => ({ ...c, i, fix: c.ax === 0 ? c.y : c.x }));
  const hero = cars.findIndex((c) => c.hero);
  const B = {
    w, h, N, goal: L.goal || 'hero', cars, n: cars.length, hero, walls, arrows, lights,
    hasLights: (L.lights || []).length > 0, hasArrows: (L.arrows || []).length > 0,
    rx: L.ferry ? L.ferry.x : -1, fl: L.ferry ? L.ferry.len : 0,
  };
  return B;
}
export function initState(B, L) {
  const s = new Int8Array(B.n + 2);
  B.cars.forEach((c, i) => { s[i] = c.ax === 0 ? c.x : c.y; });
  s[B.n] = L.ferry ? L.ferry.y : 0;
  s[B.n + 1] = B.hasLights ? (L.phase || 0) & 1 : 0;
  return s;
}
export const stateKey = (s) => { let k = ''; for (let i = 0; i < s.length; i++) k += String.fromCharCode(s[i] + 128); return k; };

// occupancy: 0 free, car index + 1, 255 wall / water
export function occupancy(B, s, out) {
  const o = out || new Uint8Array(B.N); o.fill(0);
  const w = B.w;
  for (let i = 0; i < B.N; i++) if (B.walls[i]) o[i] = 255;
  if (B.rx >= 0) { const fy = s[B.n]; for (let y = 0; y < B.h; y++) if (y < fy || y >= fy + B.fl) o[y * w + B.rx] = 255; }
  for (let i = 0; i < B.n; i++) {
    const p = s[i]; if (p === EXITED) continue;
    const c = B.cars[i];
    for (let k = 0; k < c.len; k++) o[c.ax === 0 ? c.fix * w + p + k : (p + k) * w + c.fix] = i + 1;
  }
  return o;
}
export const canExit = (B, i, d) => (B.goal === 'hero' ? i === B.hero && d === B.cars[i].dir : d === B.cars[i].dir);
export const isRed = (B, s, cell) => B.lights[cell] >= 0 && ((s[B.n + 1] + B.lights[cell]) & 1) === 1;

// how far car i can slide each way: { lo, hi, outLo, outHi } (positions lo..hi are legal; out* = may leave)
export function carRange(B, s, i, o) {
  const occ = o || occupancy(B, s);
  const c = B.cars[i], p = s[i], w = B.w, size = c.ax === 0 ? B.w : B.h;
  const r = { lo: p, hi: p, outLo: false, outHi: false };
  if (p === EXITED) return r;
  for (const d of [1, -1]) {
    const di = dirIndex(c.ax, d);
    for (let k = 1; ; k++) {
      const f = d > 0 ? p + c.len - 1 + k : p - k; // the cell the nose enters
      if (f < 0 || f >= size) { if (canExit(B, i, d)) { if (d > 0) r.outHi = true; else r.outLo = true; } break; }
      const cell = c.ax === 0 ? c.fix * w + f : f * w + c.fix;
      if (occ[cell]) break;
      const a = B.arrows[cell];
      if (a >= 0 && (a & 1) === c.ax && a !== di) break; // one-way, wrong direction
      if (isRed(B, s, cell)) break;
      if (d > 0) r.hi = p + k; else r.lo = p - k;
    }
  }
  return r;
}
// ferry can move when no car stands on it; any position along the river
export function ferryFree(B, s, o) {
  if (B.rx < 0) return false;
  const occ = o || occupancy(B, s), fy = s[B.n];
  for (let y = fy; y < fy + B.fl; y++) if (occ[y * B.w + B.rx]) return false;
  return true;
}
// all legal moves: [car index | -1 for the ferry, new position | EXITED]
export function moves(B, s, o) {
  const occ = occupancy(B, s, o), out = [];
  for (let i = 0; i < B.n; i++) {
    if (s[i] === EXITED) continue;
    const r = carRange(B, s, i, occ);
    for (let p = r.lo; p <= r.hi; p++) if (p !== s[i]) out.push([i, p]);
    if (r.outLo || r.outHi) out.push([i, EXITED]);
  }
  if (B.rx >= 0 && ferryFree(B, s, occ)) for (let y = 0; y + B.fl <= B.h; y++) if (y !== s[B.n]) out.push([-1, y]);
  return out;
}
// Search moves: in 'all' puzzles without traffic lights, a car that can leave right now may as well
// leave first (removing a car never blocks anything and it needs at least that one move anyway), so the
// solver only follows that move: same optimal length, a tiny fraction of the orderings.
export function searchMoves(B, s, o) {
  if (B.goal === 'all' && !B.hasLights) {
    const occ = occupancy(B, s, o);
    for (let i = 0; i < B.n; i++) { if (s[i] === EXITED) continue; const r = carRange(B, s, i, occ); if (r.outLo || r.outHi) return [[i, EXITED]]; }
    return moves(B, s, occ);
  }
  return moves(B, s, o);
}
export function apply(B, s, m) {
  const t = s.slice();
  if (m[0] < 0) t[B.n] = m[1]; else t[m[0]] = m[1];
  if (B.hasLights) t[B.n + 1] ^= 1;
  return t;
}
export function isGoal(B, s) {
  if (B.goal === 'hero') return s[B.hero] === EXITED;
  for (let i = 0; i < B.n; i++) if (s[i] !== EXITED) return false;
  return true;
}
export function legal(B, s, m) { return moves(B, s).some((x) => x[0] === m[0] && x[1] === m[1]); }

// admissible heuristic (every listed vehicle needs at least one more move)
function heur(B, s, occ) {
  if (B.goal === 'all') { let n = 0; for (let i = 0; i < B.n; i++) if (s[i] !== EXITED) n++; return n; }
  const i = B.hero, p = s[i]; if (p === EXITED) return 0;
  const c = B.cars[i], size = c.ax === 0 ? B.w : B.h, seen = new Set();
  occupancy(B, s, occ);
  if (c.dir > 0) { for (let f = p + c.len; f < size; f++) { const v = occ[c.ax === 0 ? c.fix * B.w + f : f * B.w + c.fix]; if (v && v !== 255) seen.add(v); } }
  else { for (let f = p - 1; f >= 0; f--) { const v = occ[c.ax === 0 ? c.fix * B.w + f : f * B.w + c.fix]; if (v && v !== 255) seen.add(v); } }
  return 1 + seen.size;
}

// Optimal solver: A* with a bucket queue (unit move cost, admissible heuristic).
// Returns { moves: [[i, pos], …], n, expanded } or null (unsolvable / over the node cap).
export function solve(B, s0, cap = 250000) {
  const occ = new Uint8Array(B.N);
  const k0 = stateKey(s0);
  const g = new Map([[k0, 0]]), par = new Map([[k0, null]]), st = new Map([[k0, s0]]);
  const buckets = []; const push = (f, k, gg) => { (buckets[f] || (buckets[f] = [])).push(k, gg); };
  push(heur(B, s0, occ), k0, 0);
  let expanded = 0;
  for (let f = 0; f < buckets.length; f++) {
    const b = buckets[f]; if (!b) continue;
    while (b.length) {
      const ge = b.pop(), k = b.pop(), s = st.get(k), gs = g.get(k);
      if (ge !== gs) continue; // stale entry (reached again by a shorter path)
      if (isGoal(B, s)) {
        const path = []; let cur = k;
        while (par.get(cur)) { const [pk, m] = par.get(cur); path.push(m); cur = pk; }
        path.reverse();
        return { moves: path, n: path.length, expanded };
      }
      if (++expanded > cap) return null;
      for (const m of searchMoves(B, s, occ)) {
        const t = apply(B, s, m), tk = stateKey(t), ng = gs + 1;
        const old = g.get(tk);
        if (old !== undefined && old <= ng) continue;
        g.set(tk, ng); par.set(tk, [k, m]); st.set(tk, t);
        const nf = ng + heur(B, t, occ);
        push(nf < f ? f : nf, tk, ng);
      }
    }
  }
  return null;
}

// Full exploration of everything reachable from s0 (generator): forward BFS with the edges kept, then
// distance-to-goal for every state by a backward BFS. Returns null when more than `cap` states.
// Speed: states are keyed by a number (3 bits per entry, EXITED = 7) updated incrementally from the
// parent's key, and a neighbour's array is only built when it is new; the visiting order (and so every
// generated level) is exactly the same as with the string keys.
const enc3 = (v) => (v === EXITED ? 7 : v);
export function numKeyer(len) {
  if (len > 17) return null; // 3 × 17 = 51 bits: still exact in a double
  const P = new Float64Array(len); for (let i = 0; i < len; i++) P[i] = 8 ** i;
  return { P, of: (s) => { let k = 0; for (let i = 0; i < len; i++) k += enc3(s[i]) * P[i]; return k; } };
}
// key of apply(B, s, m) from the key ks of s, without building the state
const nextKey = (B, K, s, ks, m) => {
  const j = m[0] < 0 ? B.n : m[0];
  let k = ks + (enc3(m[1]) - enc3(s[j])) * K.P[j];
  if (B.hasLights) k += (s[B.n + 1] ? -1 : 1) * K.P[B.n + 1];
  return k;
};
export function explore(B, s0, cap = 40000) {
  const occ = new Uint8Array(B.N), len = s0.length;
  const K = numKeyer(len), idx = new Map();
  // states live in one flat buffer (len entries each) and the edges in flat lists: no per-state arrays
  let flat = new Int8Array(Math.min(cap, 4096) * len), n = 1;
  flat.set(s0, 0);
  const keys = [K ? K.of(s0) : stateKey(s0)]; idx.set(keys[0], 0);
  let eFrom = new Int32Array(1 << 14), eTo = new Int32Array(1 << 14), ne = 0;
  const s = new Int8Array(len), goal = new Uint8Array(cap);
  for (let q = 0; q < n; q++) {
    const base = q * len; for (let i = 0; i < len; i++) s[i] = flat[base + i];
    if (isGoal(B, s)) { goal[q] = 1; continue; }
    const ks = keys[q];
    for (const m of searchMoves(B, s, occ)) {
      const k = K ? nextKey(B, K, s, ks, m) : stateKey(apply(B, s, m));
      let j = idx.get(k);
      if (j === undefined) {
        j = n; if (j >= cap) return null;
        if ((n + 1) * len > flat.length) { const f = new Int8Array(Math.min(cap, n * 2) * len); f.set(flat); flat = f; }
        const o = n * len; for (let i = 0; i < len; i++) flat[o + i] = s[i];
        flat[o + (m[0] < 0 ? B.n : m[0])] = m[1]; if (B.hasLights) flat[o + B.n + 1] ^= 1;
        idx.set(k, j); keys.push(k); n++;
      }
      if (ne === eFrom.length) { const a = new Int32Array(ne * 2), b = new Int32Array(ne * 2); a.set(eFrom); b.set(eTo); eFrom = a; eTo = b; }
      eFrom[ne] = q; eTo[ne] = j; ne++;
    }
  }
  // distance to the goal for every state: backward BFS over the reversed edges (CSR)
  const start = new Int32Array(n + 1), rev = new Int32Array(ne);
  for (let e = 0; e < ne; e++) start[eTo[e] + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, n);
  for (let e = 0; e < ne; e++) rev[fill[eTo[e]]++] = eFrom[e];
  const dist = new Int32Array(n).fill(-1), queue = new Int32Array(n); let qn = 0;
  for (let i = 0; i < n; i++) if (goal[i]) { dist[i] = 0; queue[qn++] = i; }
  for (let q = 0; q < qn; q++) { const i = queue[q]; for (let e = start[i]; e < start[i + 1]; e++) { const j = rev[e]; if (dist[j] < 0) { dist[j] = dist[i] + 1; queue[qn++] = j; } } }
  return { flat, len, dist, n, at: (i, k) => flat[i * len + k], state: (i) => flat.slice(i * len, (i + 1) * len) };
}

// ---------------------------------------------------------------- input (pure, tested in node)
// samples: [[timeStamp ms, position (cells), clientX, clientY], …] of one drag
// Release speed (cells / s) of a flick, 0 when the release was not one. Measured over the last 90 ms
// before the finger lifted (older movement does not count), and only when the finger itself moved fast
// on screen (≥ 750 px/s): on a phone a cell is ~55 px, so a quick but careful drag (the old test was
// 6 cells/s over the last 8 samples ≈ 330 px/s) no longer flings the car to the end of its lane.
export const FLICK = { cells: 6, px: 750, window: 90 };
export function flickSpeed(sm, tUp) {
  if (!sm || sm.length < 2) return 0;
  const b = sm[sm.length - 1]; if (tUp - b[0] > 80) return 0; // the finger stopped before lifting
  let a = sm[0]; for (const q of sm) if (b[0] - q[0] <= FLICK.window) { a = q; break; }
  const dt = (b[0] - a[0]) / 1000; if (dt < 0.016) return 0;
  const vel = (b[1] - a[1]) / dt, px = Math.hypot(b[2] - a[2], b[3] - a[3]) / dt;
  return Math.abs(vel) >= FLICK.cells && px >= FLICK.px ? vel : 0;
}

// stars: 3 = optimal (+ a little slack on long puzzles), 2 = within ~50%, 1 = solved
export function starLimits(opt) { const s3 = opt + (opt >= 25 ? 2 : opt >= 12 ? 1 : 0); return [s3, Math.ceil(opt * 1.5) + 2]; }
export function starsFor(L, movesUsed, secs = 0, hinted = false) {
  const [a, b] = starLimits(L.opt);
  let st = movesUsed <= a ? 3 : movesUsed <= b ? 2 : 1;
  if (L.time) { const t3 = L.time * 0.55, t2 = L.time * 0.8; st = Math.min(st, secs <= t3 ? 3 : secs <= t2 ? 2 : 1); }
  if (hinted) st = Math.min(st, 2);
  return st;
}

// compact level string (campaign data in levels.js and share codes)
// format: w h goal|cars (x y len ax dir kind hero)…|walls|arrows|lights|ferry|phase|time|opt
export function encodeLevel(L) {
  const cars = L.cars.map((c) => `${c.x}${c.y}${c.len}${c.ax}${c.dir > 0 ? 1 : 0}${c.hero ? 'H' : (c.kind || 'a')[0]}`).join(',');
  const pairs = (a) => (a || []).map((v) => v.join('')).join(',');
  return [`${L.w}${L.h}${L.goal === 'all' ? 'A' : 'H'}`, cars, pairs(L.walls), pairs(L.arrows), pairs(L.lights), L.ferry ? `${L.ferry.x}${L.ferry.y}${L.ferry.len}` : '', L.phase || 0, L.time || 0, L.opt || 0].join('|');
}
const KIND_OF = { a: 'auto', t: 'taxi', m: 'mini', s: 'sport', p: 'polizia', f: 'furgone', b: 'bus', c: 'camion', g: 'gelati', H: 'eroe' };
export function decodeLevel(str) {
  const [head, cars, walls, arrows, lights, ferry, phase, time, opt] = str.split('|');
  const nums = (s) => (s ? s.split(',').map((v) => [...v].map(Number)) : []);
  const L = {
    w: +head[0], h: +head[1], goal: head[2] === 'A' ? 'all' : 'hero',
    cars: cars.split(',').map((v) => ({ x: +v[0], y: +v[1], len: +v[2], ax: +v[3], dir: v[4] === '1' ? 1 : -1, kind: KIND_OF[v[5]] || 'auto', ...(v[5] === 'H' ? { hero: true } : {}) })),
    walls: nums(walls), arrows: nums(arrows), lights: nums(lights), opt: +opt || 0,
  };
  if (ferry) L.ferry = { x: +ferry[0], y: +ferry[1], len: +ferry[2] };
  if (+phase) L.phase = 1;
  if (+time) L.time = +time;
  return L;
}
