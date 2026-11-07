// Demolition-racing venues: procedural closed tracks (with jumps and elevation), a figure-of-eight
// with a level crossing, and a derby arena. Each venue also produces a terrain heightfield that is
// flattened under the track and raised into berms beside it.

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noise1(seed) { const r = rng(seed); const a = Array.from({ length: 6 }, () => [r() * 6.283, 1 + Math.floor(r() * 4), r()]); return (t) => a.reduce((s, [p, f, w]) => s + Math.sin(t * f + p) * (0.4 + w), 0) / 3; }

export const VENUES = [
  { id: 'cava', name: 'Cava di Pietrarossa', desc: 'Sterrato veloce tra le pareti di una cava, con due salti e un tornante in discesa.', kind: 'race', surface: 'dirt', laps: 3, seed: 11, R: 175, wob: 0.34, elev: 9, jumps: [0.18, 0.62], width: 15, sky: 'day', ground: 'rock' },
  { id: 'otto', name: 'Otto Volante', desc: 'Figura a otto con incrocio a raso: ogni giro due volte nel mezzo del traffico.', kind: 'race', surface: 'asphalt', laps: 4, eight: true, A: 150, elev: 0, jumps: [], width: 15, sky: 'dusk', ground: 'grass' },
  { id: 'pineta', name: 'Pineta del Fango', desc: 'Sterrato stretto nel bosco, dossi ciechi e un grande salto sul ruscello.', kind: 'race', surface: 'dirt', laps: 3, seed: 37, R: 210, wob: 0.42, elev: 12, jumps: [0.1, 0.45, 0.77], width: 13, sky: 'day', ground: 'grass', forest: true },
  { id: 'arena', name: 'Arena Rottami', desc: 'Demolition derby: l’ultima auto che si muove vince.', kind: 'derby', surface: 'dirt', laps: 0, width: 0, arenaR: 62, sky: 'dusk', ground: 'rock' },
];

// returns { pts:[{x,y,z}], N, ds, width, len, bbox, crossings }
export function buildTrack(v) {
  if (v.kind === 'derby') return { arena: true, R: v.arenaR, pts: [], N: 0, width: 0, len: 0, bbox: [-v.arenaR, -v.arenaR, v.arenaR, v.arenaR] };
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
  let j = 0;
  for (let i = 0; i < N; i++) {
    const tgt = (i / N) * len; while (L[j + 1] < tgt) j++;
    const f = (tgt - L[j]) / (L[j + 1] - L[j] || 1), a = raw[j], b = raw[(j + 1) % M];
    const s = i / N;
    let y = v.elev ? v.elev * n2(s * Math.PI * 2) : 0;
    // jumps: kicker ramp then a short drop so cars fly
    for (const jp of v.jumps || []) {
      let d = (s - jp) * len; if (d < -len / 2) d += len; if (d > len / 2) d -= len;
      if (d > -22 && d <= 0) y += 2.6 * ((d + 22) / 22) ** 1.7;
      else if (d > 0 && d < 34) y += 2.6 * Math.max(0, 1 - d / 7) - Math.min(1.2, d / 18) * (1 - d / 34) * 2;
    }
    pts.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y });
  }
  // headings and curvature
  for (let i = 0; i < N; i++) { const p = pts[(i - 1 + N) % N], q = pts[(i + 1) % N]; pts[i].h = Math.atan2(q.z - p.z, q.x - p.x); }
  for (let i = 0; i < N; i++) { let d = pts[(i + 3) % N].h - pts[(i - 3 + N) % N].h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; pts[i].k = d / (6 * ds); }
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); }
  return { pts, N, ds, width: v.width, len, bbox: [minx, minz, maxx, maxz], jumps: v.jumps || [] };
}

// Terrain heightfield (columns along x, rows along z, matches Rapier's layout: H[col*(rows+1)+row])
export function buildTerrain(v, tr) {
  const margin = tr.arena ? 140 : 190, cell = 2.5;
  const [x0, z0, x1, z1] = tr.bbox;
  const sx = Math.ceil((x1 - x0 + 2 * margin) / cell) * cell, sz = Math.ceil((z1 - z0 + 2 * margin) / cell) * cell;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const nc = Math.round(sx / cell), nr = Math.round(sz / cell);
  const H = new Float32Array((nr + 1) * (nc + 1)), B = new Float32Array((nr + 1) * (nc + 1)); // B = track blend (1 on the racing surface)
  const ns = noise1((v.seed || 3) + 101), ns2 = noise1((v.seed || 3) + 202);
  const X = (c) => cx - sx / 2 + c * cell, Z = (r) => cz - sz / 2 + r * cell;
  for (let c = 0; c <= nc; c++) for (let r = 0; r <= nr; r++) {
    const x = X(c), z = Z(r);
    const hills = ns(x * 0.011) * 7 + ns2(z * 0.009) * 7 + ns(x * 0.031 + z * 0.02) * 2;
    let h = hills;
    if (tr.arena) {
      const d = Math.hypot(x - cx, z - cz);
      h = d < tr.R ? 0 : d < tr.R + 10 ? ((d - tr.R) / 10) ** 2 * 7 : 7 + (d - tr.R - 10) * 0.25 + hills * 0.4;
      B[c * (nr + 1) + r] = d < tr.R + 1 ? 1 : 0;
    }
    // valley rim: hills rise towards the edges so the world never ends in a flat plain
    const de = Math.min(c, nc - c, r, nr - r) * cell;
    if (de < 140) h += ((140 - de) / 140) ** 2 * 38;
    H[c * (nr + 1) + r] = h;
  }
  if (!tr.arena) {
    const best = new Float32Array((nr + 1) * (nc + 1)).fill(1e9), ty = new Float32Array((nr + 1) * (nc + 1));
    const R = tr.width / 2 + 26;
    for (const p of tr.pts) {
      const c0 = Math.max(0, Math.floor((p.x - R - (cx - sx / 2)) / cell)), c1 = Math.min(nc, Math.ceil((p.x + R - (cx - sx / 2)) / cell));
      const r0 = Math.max(0, Math.floor((p.z - R - (cz - sz / 2)) / cell)), r1 = Math.min(nr, Math.ceil((p.z + R - (cz - sz / 2)) / cell));
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { const k = c * (nr + 1) + r; const d = Math.hypot(X(c) - p.x, Z(r) - p.z); if (d < best[k]) { best[k] = d; ty[k] = p.y; } }
    }
    const hw = tr.width / 2;
    for (let k = 0; k < H.length; k++) {
      const d = best[k]; if (d > R) continue;
      // flat track, then a raised berm, then blend back into the hills
      const berm = d > hw + 2 && d < hw + 11 ? Math.sin(((d - hw - 2) / 9) * Math.PI) * 1.9 : 0;
      const w = d <= hw + 2 ? 1 : d >= R ? 0 : 1 - ((d - hw - 2) / (R - hw - 2)) ** 1.5;
      H[k] = ty[k] * w + H[k] * (1 - w) + berm * Math.min(1, w * 1.4);
      B[k] = d <= hw ? 1 : d <= hw + 3 ? 1 - (d - hw) / 3 : 0;
    }
  }
  return { H, B, nr, nc, sx, sz, cx, cz, cell, X, Z,
    heightAt(x, z) { const fc = (x - (cx - sx / 2)) / cell, fr = (z - (cz - sz / 2)) / cell; const c = Math.max(0, Math.min(nc - 1, Math.floor(fc))), r = Math.max(0, Math.min(nr - 1, Math.floor(fr))); const u = Math.min(1, Math.max(0, fc - c)), w = Math.min(1, Math.max(0, fr - r)); const h = (cc, rr) => H[cc * (nr + 1) + rr]; return h(c, r) * (1 - u) * (1 - w) + h(c + 1, r) * u * (1 - w) + h(c, r + 1) * (1 - u) * w + h(c + 1, r + 1) * u * w; } };
}
