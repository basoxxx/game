// Demolition-racing venues: procedural closed tracks (with jumps and elevation), figure-of-eights
// with a level crossing, a muddy farm circuit and a derby arena. Each venue also produces a
// terrain heightfield that is flattened under the track and raised into berms beside it, plus
// water features (streams, puddles) and a pre-computed racing line with a braking-aware speed
// profile for the AI.

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noise1(seed) { const r = rng(seed); const a = Array.from({ length: 6 }, () => [r() * 6.283, 1 + Math.floor(r() * 4), r()]); return (t) => a.reduce((s, [p, f, w]) => s + Math.sin(t * f + p) * (0.4 + w), 0) / 3; }

// surface: grip multiplier, rolling drag, particle colour
export const SURFACES = {
  asphalt: { name: 'asfalto', grip: 1.25, drag: 0, dust: null },
  dirt: { name: 'sterrato', grip: 1.0, drag: 0, dust: [0.66, 0.57, 0.45] },
  mud: { name: 'fango', grip: 0.82, drag: 0.012, dust: [0.36, 0.27, 0.18] },
};

export const VENUES = [
  { id: 'cava', name: 'Cava di Pietrarossa', desc: 'Sterrato veloce tra le pareti di una cava, con due salti e un tornante in discesa.', kind: 'race', surface: 'dirt', surfaceName: 'sterrato', laps: 3, seed: 11, R: 175, wob: 0.34, elev: 9, jumps: [0.18, 0.62], width: 15, sky: 'day', ground: 'rock', quarry: true },
  { id: 'otto', name: 'Otto Volante', desc: 'Figura a otto con incrocio a raso: ogni giro due volte nel mezzo del traffico.', kind: 'race', surface: 'asphalt', surfaceName: 'asfalto', laps: 4, eight: true, A: 150, elev: 0, jumps: [], width: 15, sky: 'dusk', ground: 'grass' },
  { id: 'pineta', name: 'Pineta del Fango', desc: 'Sterrato stretto nel bosco, dossi ciechi, un guado e un grande salto sul ruscello.', kind: 'race', surface: 'dirt', surfaceName: 'sterrato', laps: 3, seed: 37, R: 210, wob: 0.42, elev: 12, jumps: [0.1, 0.45, 0.77], width: 13, sky: 'day', ground: 'grass', forest: true, water: [{ s: 0.5, w: 6, ang: 0.3, depth: 0.5 }, { s: 0.27, w: 8, ang: -0.25, depth: 0.42 }] },
  { id: 'fattoria', name: 'Fattoria Pantano', desc: 'Circuito di campagna nel fango: pozzanghere, fienili, balle di paglia e un guado davanti alla stalla.', kind: 'race', surface: 'mud', surfaceName: 'fango', laps: 3, seed: 53, R: 150, wob: 0.38, elev: 4, jumps: [0.36, 0.83], width: 14, sky: 'day', ground: 'grass', farm: true, puddles: 22, water: [{ s: 0.6, w: 7, ang: 0.15, depth: 0.4 }] },
  { id: 'stadio', name: 'Stadio Ferrovecchio', desc: 'Otto in notturna sotto i riflettori: rampe sui rettilinei e incrocio a raso davanti alle tribune.', kind: 'race', surface: 'dirt', surfaceName: 'terra battuta', laps: 5, eight: true, A: 118, elev: 0, jumps: [0.13, 0.63], jumpH: 2.2, width: 14, sky: 'night', ground: 'rock', stadium: true },
  { id: 'arena', name: 'Arena Rottami', desc: 'Demolition derby: l’ultima auto che si muove vince.', kind: 'derby', surface: 'dirt', surfaceName: 'sterrato', laps: 0, width: 0, arenaR: 62, sky: 'dusk', ground: 'rock' },
  { id: 'porto', name: 'Porto Vecchio', desc: 'Banchine di cemento tra muri di container e gru giganti, con un salto sopra la darsena.', kind: 'race', surface: 'asphalt', surfaceName: 'cemento', laps: 3, seed: 71, R: 160, wob: 0.3, elev: 1.5, jumps: [0.52], jumpH: 2.4, width: 15, sky: 'day', ground: 'rock', port: true, flat: true, water: [{ s: 0.536, w: 7, ang: 0, depth: 0.5, canal: true }] },
  { id: 'fossa', name: 'Fossa dei Leoni', desc: 'Derby notturno in una buca di fango sotto i fari, con un’isola di rottami in mezzo.', kind: 'derby', surface: 'mud', surfaceName: 'fango', laps: 0, width: 0, arenaR: 54, sky: 'night', ground: 'rock', island: 5 },
  { id: 'rampa', name: 'Rampa del Diavolo', desc: 'Una discesa, un trampolino e il vuoto: salto in lungo con tre tentativi.', kind: 'stunt', surface: 'asphalt', surfaceName: 'asfalto', laps: 0, width: 30, sky: 'day', ground: 'grass' },
];
export const STUNT = { x0: -300, x1: 260, lip: 0, lipH: 5.2, kick: 17, startY: 22, slope: 0.13 };
function stuntY(x) {
  const S = STUNT;
  if (x < -70) { const t = (x - S.x0) / (-70 - S.x0); return S.startY * (1 - t) ** 1.6; } // run-in down the hill
  if (x <= 0) return 0;
  if (x <= 6) return -1.2 * (x / 6);
  const d = Math.min(x, 150) - 6, sl = S.slope; // landing slope, eased in so short jumps land softly
  return -1.2 - (d < 20 ? sl * d * d / 40 : sl * (d - 10));
}

// returns { pts:[{x,y,z,h,k}], N, ds, width, len, bbox, jumps, crossings }
export function buildTrack(v) {
  if (v.kind === 'derby') return { arena: true, R: v.arenaR, island: v.island || 0, pts: [], N: 0, width: 0, len: 0, bbox: [-v.arenaR, -v.arenaR, v.arenaR, v.arenaR] };
  if (v.kind === 'stunt') {
    // open, straight runway along +x: run-in down a hill, a kicker at x = 0, a long landing slope
    const ds = 2.5, pts = [];
    for (let x = STUNT.x0; x <= STUNT.x1; x += ds) pts.push({ x, z: 0, y: stuntY(x), h: 0, k: 0 });
    return { stunt: true, pts, N: pts.length, ds, width: v.width, len: STUNT.x1 - STUNT.x0, bbox: [STUNT.x0, -40, STUNT.x1, 40], jumps: [], crossings: [], lipX: STUNT.lip, lipIdx: Math.round((STUNT.lip - STUNT.x0) / ds) };
  }
  const M = 2400; const raw = [];
  const n1 = noise1(v.seed || 5), n2 = noise1((v.seed || 5) * 7 + 3);
  for (let k = 0; k < M; k++) {
    const t = (k / M) * Math.PI * 2;
    if (v.eight) raw.push([v.A * Math.sin(t), v.A * 0.62 * Math.sin(t) * Math.cos(t)]);
    else { const r = v.R * (1 + v.wob * n1(t) * 0.55 + 0.12 * Math.sin(3 * t + 1)); raw.push([r * Math.cos(t), r * Math.sin(t) * 0.82]); }
  }
  // resample at equal arc length
  const L = [0]; for (let k = 1; k <= M; k++) { const a = raw[k - 1], b = raw[k % M]; L.push(L[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = L[M], ds = 2.5, N = Math.round(len / ds); const pts = [];
  const JH = v.jumpH || 2.6;
  let j = 0;
  for (let i = 0; i < N; i++) {
    const tgt = (i / N) * len; while (L[j + 1] < tgt) j++;
    const f = (tgt - L[j]) / (L[j + 1] - L[j] || 1), a = raw[j], b = raw[(j + 1) % M];
    const s = i / N;
    let y = v.elev ? v.elev * n2(s * Math.PI * 2) : 0;
    // jumps: kicker ramp then a short drop so cars fly
    for (const jp of v.jumps || []) {
      let d = (s - jp) * len; if (d < -len / 2) d += len; if (d > len / 2) d -= len;
      if (d > -22 && d <= 0) y += JH * ((d + 22) / 22) ** 1.7;
      else if (d > 0 && d < 34) y += JH * Math.max(0, 1 - d / 7) - Math.min(1.2, d / 18) * (1 - d / 34) * 2;
    }
    pts.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y });
  }
  // headings and curvature
  for (let i = 0; i < N; i++) { const p = pts[(i - 1 + N) % N], q = pts[(i + 1) % N]; pts[i].h = Math.atan2(q.z - p.z, q.x - p.x); }
  for (let i = 0; i < N; i++) { let d = pts[(i + 3) % N].h - pts[(i - 3 + N) % N].h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; pts[i].k = d / (6 * ds); }
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
  const crossings = v.eight ? [0, Math.round(N / 2)] : [];
  return { pts, N, ds, width: v.width, len, bbox: [minx, minz, maxx, maxz], jumps: v.jumps || [], crossings };
}

// Racing line: lateral offsets that minimise curvature inside the track, then a speed profile
// (lateral grip limit, backward pass for braking points, forward pass for acceleration).
export function buildRacingLine(tr, v) {
  const N = tr.N, P = tr.pts, hw = tr.width / 2 - 2.2;
  const off = new Float32Array(N);
  const X = new Float32Array(N), Z = new Float32Array(N);
  const nx = (i) => -Math.sin(P[i].h), nz = (i) => Math.cos(P[i].h);
  const upd = () => { for (let i = 0; i < N; i++) { X[i] = P[i].x + nx(i) * off[i]; Z[i] = P[i].z + nz(i) * off[i]; } };
  upd();
  // the crossing of a figure-eight must stay central (both directions use it)
  const pinned = new Uint8Array(N); for (const c of tr.crossings || []) for (let k = -6; k <= 6; k++) pinned[(c + k + N) % N] = 1;
  for (let it = 0; it < 160; it++) {
    const K = it < 80 ? 6 : 3;
    for (let i = 0; i < N; i++) {
      if (pinned[i]) { off[i] *= 0.5; continue; }
      const a = (i - K + N) % N, b = (i + K) % N;
      const mx = (X[a] + X[b]) / 2, mz = (Z[a] + Z[b]) / 2;
      const o = (mx - P[i].x) * nx(i) + (mz - P[i].z) * nz(i);
      off[i] = Math.max(-hw, Math.min(hw, off[i] + (o - off[i]) * 0.6));
    }
    upd();
  }
  // curvature of the line
  const head = new Float32Array(N), kap = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; head[i] = Math.atan2(Z[b] - Z[a], X[b] - X[a]); }
  for (let i = 0; i < N; i++) { let d = head[(i + 2) % N] - head[(i - 2 + N) % N]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; kap[i] = d / (4 * tr.ds); }
  const sf = SURFACES[v.surface] || SURFACES.dirt;
  const aLat = 10.5 * sf.grip, aBrk = 8.5 * Math.min(1.1, sf.grip), aAcc = 5.5, vMax = 48;
  const spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { let km = 0; for (let k = -2; k <= 2; k++) km = Math.max(km, Math.abs(kap[(i + k + N) % N])); spd[i] = Math.min(vMax, Math.sqrt(aLat / Math.max(km, 1e-4))); }
  // slow down a little before jump kickers so cars land straight
  for (const jp of tr.jumps || []) { const c = Math.floor(jp * N); for (let k = -10; k <= 2; k++) { const i = (c + k + N) % N; spd[i] = Math.min(spd[i], 33); } }
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const n = spd[(i + 1) % N]; spd[i] = Math.min(spd[i], Math.sqrt(n * n + 2 * aBrk * tr.ds)); }
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { const p = spd[(i - 1 + N) % N]; spd[i] = Math.min(spd[i], Math.sqrt(p * p + 2 * aAcc * tr.ds)); }
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const n = spd[(i + 1) % N]; spd[i] = Math.min(spd[i], Math.sqrt(n * n + 2 * aBrk * tr.ds)); }
  return { off, spd, kap, X, Z };
}

// Water features: streams crossing the track at fraction s (rotated by ang), puddles on the
// racing surface. Positions are resolved once against the track.
export function buildWater(v, tr) {
  const out = { streams: [], puddles: [] };
  if (tr.arena) return out;
  for (const w of v.water || []) {
    const i = Math.floor(w.s * tr.N), p = tr.pts[i];
    const dir = p.h + Math.PI / 2 + (w.ang || 0); // stream direction (across the track)
    const dx = Math.cos(dir), dz = Math.sin(dir);
    // the stream runs until it would come near another part of the circuit
    let len = 160;
    for (let a = tr.width; a < 160 && len === 160; a += 2.5) for (const sg of [1, -1]) {
      const x = p.x + dx * a * sg, z = p.z + dz * a * sg;
      for (let k = 0; k < tr.N; k += 2) { const d = Math.abs(k - i); if (Math.min(d, tr.N - d) * tr.ds < 60) continue; const q = tr.pts[k]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < (tr.width / 2 + w.w + 14) ** 2) { len = Math.max(28, a - 6); break; } }
    }
    out.streams.push({ i, x: p.x, z: p.z, y: p.y, dx, dz, w: w.w, depth: w.depth || 0.45, len });
  }
  if (v.puddles) {
    const R = rng((v.seed || 1) * 31 + 7);
    for (let n = 0; n < v.puddles; n++) {
      const i = Math.floor(R() * tr.N), p = tr.pts[i];
      if ((tr.jumps || []).some((jp) => { const d = Math.abs(i / tr.N - jp); return Math.min(d, 1 - d) * tr.len < 45; })) continue;
      const lat = (R() - 0.5) * tr.width * 0.75;
      out.puddles.push({ x: p.x - Math.sin(p.h) * lat, z: p.z + Math.cos(p.h) * lat, r: 2.2 + R() * 3.2, rot: R() * 3, i });
    }
  }
  return out;
}

// Terrain heightfield (columns along x, rows along z, matches Rapier's layout: H[col*(rows+1)+row])
// B = track blend (1 on the racing surface), D = signed lateral offset from the centre line (m).
export function buildTerrain(v, tr, water = { streams: [], puddles: [] }) {
  const margin = tr.arena ? 140 : 190, cell = 2.5;
  const [x0, z0, x1, z1] = tr.bbox;
  const sx = Math.ceil((x1 - x0 + 2 * margin) / cell) * cell, sz = Math.ceil((z1 - z0 + 2 * margin) / cell) * cell;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const nc = Math.round(sx / cell), nr = Math.round(sz / cell);
  const n = (nr + 1) * (nc + 1);
  const H = new Float32Array(n), B = new Float32Array(n), D = new Float32Array(n).fill(99), W = new Float32Array(n);
  const ns = noise1((v.seed || 3) + 101), ns2 = noise1((v.seed || 3) + 202), ns3 = noise1((v.seed || 3) + 303);
  const X = (c) => cx - sx / 2 + c * cell, Z = (r) => cz - sz / 2 + r * cell;
  for (let c = 0; c <= nc; c++) for (let r = 0; r <= nr; r++) {
    const x = X(c), z = Z(r);
    const hills = ns(x * 0.011) * 7 + ns2(z * 0.009) * 7 + ns(x * 0.031 + z * 0.02) * 2;
    let h = hills;
    if (tr.arena) {
      const d = Math.hypot(x - cx, z - cz);
      h = d < tr.R ? 0 : d < tr.R + 10 ? ((d - tr.R) / 10) ** 2 * 7 : 7 + (d - tr.R - 10) * 0.25 + hills * 0.4;
      if (tr.island && d < tr.island * 1.8) h += 2.3 * Math.cos(Math.min(1, d / (tr.island * 1.8)) * Math.PI / 2) ** 2; // central mud mound
      B[c * (nr + 1) + r] = d < tr.R + 1 ? 1 : 0;
    }
    if (v.stadium) {
      // flat stadium floor, raked bowl beyond it
      const ex = Math.max(0, Math.abs(x - cx) - (x1 - x0) / 2 - 16), ez = Math.max(0, Math.abs(z - cz) - (z1 - z0) / 2 - 16), e = Math.hypot(ex, ez);
      h = e <= 0 ? 0 : e < 26 ? Math.min(1, e / 8) ** 2 * 1.2 : 1.2 + (e - 26) * 0.45 + hills * 0.25;
    }
    // valley rim: hills rise towards the edges so the world never ends in a flat plain
    const de = Math.min(c, nc - c, r, nr - r) * cell;
    if (v.port) { const sea = z - (z1 + 34); if (sea > 0) { H[c * (nr + 1) + r] = -4.5; continue; } h = h * 0.25 + 0.4; if (Math.min(c, nc - c, r) * cell < 140) h += ((140 - Math.min(c, nc - c, r) * cell) / 140) ** 2 * 16; }
    else if (de < 140) h += ((140 - de) / 140) ** 2 * 38;
    H[c * (nr + 1) + r] = h;
  }
  if (!tr.arena) {
    const best = new Float32Array(n).fill(1e9), ty = new Float32Array(n), bi = new Int32Array(n);
    const R = tr.width / 2 + (v.quarry ? 40 : 26);
    for (let i = 0; i < tr.N; i++) {
      const p = tr.pts[i];
      const c0 = Math.max(0, Math.floor((p.x - R - (cx - sx / 2)) / cell)), c1 = Math.min(nc, Math.ceil((p.x + R - (cx - sx / 2)) / cell));
      const r0 = Math.max(0, Math.floor((p.z - R - (cz - sz / 2)) / cell)), r1 = Math.min(nr, Math.ceil((p.z + R - (cz - sz / 2)) / cell));
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { const k = c * (nr + 1) + r; const d = Math.hypot(X(c) - p.x, Z(r) - p.z); if (d < best[k]) { best[k] = d; ty[k] = p.y; bi[k] = i; } }
    }
    const hw = tr.width / 2, Rb = tr.width / 2 + 26;
    for (let k = 0; k < n; k++) {
      const d = best[k]; if (d > R) continue;
      if (v.port && H[k] <= -4.4) continue;
      const p = tr.pts[bi[k]], c = Math.floor(k / (nr + 1)), r = k % (nr + 1);
      D[k] = (X(c) - p.x) * -Math.sin(p.h) + (Z(r) - p.z) * Math.cos(p.h);
      if (d <= Rb) {
        // flat track, then a raised berm, then blend back into the hills
        const berm = d > hw + 2 && d < hw + 11 ? Math.sin(((d - hw - 2) / 9) * Math.PI) * (v.flat ? 0.3 : v.stadium ? 1.1 : 1.9) : 0;
        const w = d <= hw + 2 ? 1 : d >= Rb ? 0 : 1 - ((d - hw - 2) / (Rb - hw - 2)) ** 1.5;
        H[k] = ty[k] * w + H[k] * (1 - w) + berm * Math.min(1, w * 1.4);
        B[k] = d <= hw ? 1 : d <= hw + 3 ? 1 - (d - hw) / 3 : 0;
      }
      if (v.quarry && d > hw + 13) {
        // quarry: terraced rock faces rising beside the track on alternating sections
        const s = bi[k] / tr.N, side = Math.sign(D[k]);
        const amp = Math.max(0, ns3(s * 6.283 * 2 + side * 1.7) * 1.4 + 0.25) * 16;
        const t = Math.min(1, (d - hw - 13) / 6);
        const steps = Math.floor(t * 3) / 3 + (t * 3 % 1) ** 4 / 3;
        H[k] = Math.max(H[k], ty[k] + amp * steps * (0.6 + 0.4 * Math.min(1, (d - hw - 13) / 25)));
      }
    }
  }
  // streams: a channel across the world, shallow (fordable) on the racing surface
  const hAt = (x, z) => { const c = Math.max(0, Math.min(nc, Math.round((x - (cx - sx / 2)) / cell))), r = Math.max(0, Math.min(nr, Math.round((z - (cz - sz / 2)) / cell))); return H[c * (nr + 1) + r]; };
  for (const s of water.streams) {
    // water level follows the (flattened) ground along the stream axis; the ford on the track is level with it
    const steps = Math.ceil(s.len * 2 / 2.5), lv = new Float32Array(steps + 1);
    for (let q = 0; q <= steps; q++) { const a = -s.len + q * 2.5; let m = 1e9; for (let o = -3; o <= 3; o++) for (let w = -1; w <= 1; w++) m = Math.min(m, hAt(s.x + s.dx * (a + o * 2) - s.dz * w * s.w * 0.5, s.z + s.dz * (a + o * 2) + s.dx * w * s.w * 0.5)); lv[q] = m - 0.1; }
    for (let q = 0; q <= steps; q++) { const p = Math.abs(-s.len + q * 2.5); if (p < 10) lv[q] = s.y - 0.1; }
    s.level = (along) => { const f = Math.max(0, Math.min(steps, (along + s.len) / 2.5)), i = Math.min(steps - 1, Math.floor(f)); return lv[i] + (lv[i + 1] - lv[i]) * (f - i); };
    for (let k = 0; k < n; k++) {
      const c = Math.floor(k / (nr + 1)), r = k % (nr + 1), x = X(c) - s.x, z = Z(r) - s.z;
      const along = x * s.dx + z * s.dz, across = Math.abs(-x * s.dz + z * s.dx);
      if (Math.abs(along) > s.len || across > s.w * 1.25) continue;
      const level = s.level(along), f = across / s.w;
      if (f < 0.85) { const dep = (B[k] > 0.3 ? s.depth : s.depth * 2) * (1 - (f / 0.85) ** 2) + 0.06; H[k] = Math.min(H[k], level - dep); W[k] = 1 - f / 0.85; }
      else if (B[k] < 0.3) H[k] = Math.max(H[k], level + 0.12 * Math.sin(((f - 0.85) / 0.4) * Math.PI));
      else H[k] = Math.min(H[k], level + 0.04);
    }
  }
  for (const p of water.puddles) {
    const c0 = Math.max(0, Math.floor((p.x - p.r - (cx - sx / 2)) / cell)), c1 = Math.min(nc, Math.ceil((p.x + p.r - (cx - sx / 2)) / cell));
    const r0 = Math.max(0, Math.floor((p.z - p.r - (cz - sz / 2)) / cell)), r1 = Math.min(nr, Math.ceil((p.z + p.r - (cz - sz / 2)) / cell));
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { const k = c * (nr + 1) + r, d = Math.hypot(X(c) - p.x, Z(r) - p.z); if (d < p.r) { H[k] -= 0.16 * (1 - (d / p.r) ** 2); W[k] = Math.max(W[k], 1 - d / p.r); } }
  }
  const heightAt = (x, z) => { const fc = (x - (cx - sx / 2)) / cell, fr = (z - (cz - sz / 2)) / cell; const c = Math.max(0, Math.min(nc - 1, Math.floor(fc))), r = Math.max(0, Math.min(nr - 1, Math.floor(fr))); const u = Math.min(1, Math.max(0, fc - c)), w = Math.min(1, Math.max(0, fr - r)); const h = (cc, rr) => H[cc * (nr + 1) + rr]; return h(c, r) * (1 - u) * (1 - w) + h(c + 1, r) * u * (1 - w) + h(c, r + 1) * (1 - u) * w + h(c + 1, r + 1) * u * w; };
  const sampleAt = (A, x, z) => { const c = Math.max(0, Math.min(nc, Math.round((x - (cx - sx / 2)) / cell))), r = Math.max(0, Math.min(nr, Math.round((z - (cz - sz / 2)) / cell))); return A[c * (nr + 1) + r]; };
  return { H, B, D, W, nr, nc, sx, sz, cx, cz, cell, X, Z, heightAt, waterAt: (x, z) => sampleAt(W, x, z), trackAt: (x, z) => sampleAt(B, x, z) };
}
