// Rally stage scenery (open road): terrain corridor hugging the road, road surface per surface type,
// verges, forest by biome, spectators behind the tape at corners and crests, start / finish arches.
// Moved out of race3d.js so the rally look can evolve without touching the circuit renderer.
import * as THREE from 'three';
import { makeForest, makeTreeShadows, vegOfKind } from '../vegetation.js';
import { pbr, detailPatch, HeightFog, loadTex } from '../gfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RALLY_LOOK } from './biomes.js';
import { buildRallyExtras } from './scenery.js';
import { installRallyFx } from './rallyfx.js';
import { canvasTex, noise, personGeo } from '../race3d.js';

// rally-specific CC0 texture sets (Poly Haven, webp in public/assets/rally); the light setting
// never downloads them (canvas noise instead)
function rallyPbr(id, { repeat = [1, 1], color = 0xffffff, roughness = 1, normalScale = 1 } = {}) {
  const t = ['diff', 'nor_gl', 'rough'].map((m, k) => { const x = loadTex(`rally/${id}_${m}_1k.webp`, k === 0).clone(); x.repeat.set(repeat[0], repeat[1]); return x; });
  return new THREE.MeshStandardMaterial({ map: t[0], normalMap: t[1], roughnessMap: t[2], roughness, color, normalScale: new THREE.Vector2(normalScale, normalScale) });
}
const texSet = (id, o) => (id.startsWith('rally:') ? rallyPbr(id.slice(6), o) : pbr(id, o));

// look of each rally: forest mix and density, how green / dry / snowy the land is
export const RALLY_BIOME = {
  mc: { trees: [['conifer', 0.75], ['broad', 0.25]], dens: 0.75, huts: 1.6, snowLand: 0.55 },
  swe: { trees: [['conifer', 1]], dens: 1.35 },
  ken: { trees: [['desert', 0.45], ['bush', 0.4], ['broad', 0.15]], dens: 0.22, ground: 0xc9a46a, tint: 0xb8763e, tintAmt: 0.7, road: 0xc8916a },
  cro: { trees: [['broad', 0.6], ['conifer', 0.2], ['bush', 0.2]], dens: 0.9 },
  por: { trees: [['conifer', 0.5], ['broad', 0.5]], dens: 1.0, road: 0xc9a27e },
  ita: { trees: [['bush', 0.5], ['broad', 0.3], ['desert', 0.2]], dens: 0.45, ground: 0xc2b47e, tint: 0xc9a066, tintAmt: 0.55 },
  gre: { trees: [['bush', 0.55], ['broad', 0.3], ['desert', 0.15]], dens: 0.5, ground: 0xc8b98a, tint: 0xd0a96a, tintAmt: 0.6, road: 0xe0cfb0 },
  fin: { trees: [['conifer', 0.85], ['broad', 0.15]], dens: 1.55 },
  chi: { trees: [['conifer', 0.7], ['broad', 0.3]], dens: 1.1, road: 0xb08a68 },
  eur: { trees: [['broad', 0.45], ['conifer', 0.4], ['bush', 0.15]], dens: 0.8, huts: 1.4 },
  jpn: { trees: [['conifer', 0.5], ['broad', 0.5]], dens: 1.45 },
  gbr: { trees: [['conifer', 0.9], ['broad', 0.1]], dens: 1.3, road: 0x8e7a66 },
};

export function buildRallyStage(r3) {
  const surf = r3.surface || 'gravel';
  const info = r3.geo.rally || {}, BI = RALLY_BIOME[info.id] || {};
  // icy tarmac (Monte): tarmac road with snow banks and white patches; how much depends on the ice share
  const ice = surf === 'tarmac' ? info.ice || 0 : 0, mixed = ice > 0.02, wetRoad = !!info.wet && (surf === 'gravel' || surf === 'rough');
  const snowy = surf === 'snow' || mixed;
  r3.rallyInfo = { surf, ice, mixed, wetRoad, id: info.id };
  const W = surf === 'tarmac' ? 7 : 6;
  r3.TW = W;
  const cols = { gravel: ['#8b6a43', '#6d5232'], rough: ['#7a5534', '#5a3d22'], tarmac: ['#3d4046', mixed ? '#d9e3ea' : '#2e3035'], snow: ['#e9f2f8', '#c7d7e3'] }[surf];
  const road = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, cols[0], 255, 14000, 3); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w * 0.25, 0, w * 0.12, h); c.fillRect(w * 0.63, 0, w * 0.12, h); if (surf === 'tarmac') { c.fillStyle = '#e8e8e8'; for (let y = 0; y < h; y += 64) c.fillRect(w / 2 - 2, y, 4, 32); } });
  // road surface per type: loose pebbles (mud when wet), rocky hardpack, tarmac, packed snow, icy asphalt
  const roadId = mixed ? 'rally:asphalt_snow' : surf === 'gravel' ? (wetRoad ? 'rally:brown_mud_rocks_01' : 'rally:pebble_ground_01') : surf === 'rough' ? 'rally:dry_ground_rocks' : surf === 'snow' ? 'snow_02' : 'asphalt_02';
  const roadCol = mixed ? 0x9a9ea4 : surf === 'tarmac' ? 0x8a8a8a : surf === 'snow' ? 0xffffff : BI.road ?? (surf === 'gravel' ? 0xc4ae92 : 0xd6c2a6);
  r3.asphaltMat = r3.low ? new THREE.MeshStandardMaterial({ map: road, roughness: surf === 'snow' ? 0.5 : 0.95 }) : detailPatch(texSet(roadId, { color: roadCol, roughness: surf === 'snow' ? 0.6 : 1 }), { macro: 0.16, macroScale: 0.05, wet: surf !== 'snow', key: 'stage-road' + roadId, track: { halfW: W / 2, uScale: surf === 'tarmac' ? 5 : 2.5, ruts: surf !== 'tarmac', snow: surf === 'snow' } });
  const vergeId = snowy ? (surf === 'snow' ? 'snow_02' : 'rally:snow_03') : surf === 'rough' ? 'rally:dry_ground_rocks' : 'rally:forest_ground_04';
  const vergeMat = r3.low ? new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => noise(c, w, h, cols[1], 255, 5000, 3)), roughness: 1 }) : texSet(vergeId, { color: snowy ? 0xffffff : surf === 'rough' ? 0xc8b49a : 0xb0a490 });
  const groundCol = snowy ? '#dfe9f1' : surf === 'tarmac' ? '#4f6b3a' : '#5d6b38';
  const N = r3.geo.N, gx = r3.geo.x, gz = r3.geo.y, gh = r3.geo.h || new Float64Array(N);
  let hAvg = 0, hMin = Infinity; for (let i = 0; i < N; i++) { hAvg += gh[i]; hMin = Math.min(hMin, gh[i]); } hAvg /= N;
  // terrain heightfield that hugs the road (road height near it, rolling ground further away)
  const C = 40, cells = new Map();
  for (let i = 0; i < N; i++) { const k = Math.floor(gx[i] / C) + ',' + Math.floor(gz[i] / C); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); }
  const near = (x, z) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C); let bd = Infinity, bi = -1;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = cells.get((cx + a) + ',' + (cz + b)); if (l) for (const i of l) { const d = (gx[i] - x) ** 2 + (gz[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } }
    return [bd, bi];
  };
  const ph = [0, 1, 2, 3, 4, 5].map(() => Math.random() * 6.283), RL = RALLY_LOOK[surf] || RALLY_LOOK.gravel;
  const [bx0, bz0, bx1, bz1] = r3.geo.bbox; const M = 320;
  const X0 = bx0 - M, Z0 = bz0 - M, X1 = bx1 + M, Z1 = bz1 + M;
  const G = r3.low ? 110 : 220; const cellW = Math.max((X1 - X0) / G, (Z1 - Z0) / Math.max(20, Math.round(G * (Z1 - Z0) / (X1 - X0))));
  const sm = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  const terrH = (x, z, hi = -1, hd = 0) => {
    const edge = Math.max(sm(X0 + M * 0.8, X0, x), sm(X1 - M * 0.8, X1, x), sm(Z0 + M * 0.8, Z0, z), sm(Z1 - M * 0.8, Z1, z));
    let T = hAvg + 7 * Math.sin(x * 0.004 + ph[0]) * Math.cos(z * 0.0035 + ph[1]) + 3 * Math.sin(x * 0.011 + z * 0.009 + ph[2]);
    T = T + (hMin - 2.5 - T) * edge;
    let [d2, i] = near(x, z); let d = Math.sqrt(d2);
    if (i < 0) { if (hi < 0) { i = nearFar(x, z); if (i < 0) return T; d = Math.hypot(gx[i] - x, gz[i] - z); } else { i = hi; d = hd; } }
    // the land follows the road's own height nearby and eases to the rolling ground far away;
    // beyond the verges it rises into ridges and drops into hollows (valley roads, hillsides)
    const w = sm(W / 2 + 2.5, 60, d), wf = sm(120, 520, d);
    const ridge = Math.sin(x * 0.0085 + ph[4]) * Math.cos(z * 0.0075 + ph[5]) + 0.45 * Math.sin((x - z) * 0.019 + ph[2]);
    const rel = RL.relief * sm(30, 220, d) * (0.25 + Math.max(-0.45, ridge)) * (1 - edge);
    const base = gh[i] - 0.3;
    return base + (rel + 2.5 * sm(10, 40, d)) * w + (T - base) * wf;
  };
  // coarse lookup for points far from the road (props on the hills, cameras)
  const nearFar = (x, z) => { let b = Infinity, bi = -1; for (let i = 0; i < N; i += 6) { const d = (gx[i] - x) ** 2 + (gz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return b < 1.2e6 ? bi : -1; };
  r3.terrH = terrH;
  {
    // terrain corridor: cross-sections along the road (fine by the verges, coarse further out),
    // every vertex on the same height function, so the land hugs the road on stages of any
    // length (a uniform grid over a 20 km stage is far too coarse to follow it)
    const offs = [3.4, 6, 10, 17, 28, 45, 70, 105, 150, 210, 290, 420, 900], st = r3.low ? 2 : 1;
    const lat = [...offs.slice().reverse().map((o) => -o), ...offs], P = lat.length, rows = Math.floor((N - 1) / st) + 1;
    const pos = new Float32Array(rows * P * 3), uv = new Float32Array(rows * P * 2), idx = [];
    // free lateral room on each side of every row: half the distance to the next stretch of road
    // across (hairpin legs, parallel switchbacks) and, on the inside of a bend, the bend radius,
    // so cross-sections never fold through each other or poke up through the road
    const room = [new Float32Array(rows).fill(1e9), new Float32Array(rows).fill(1e9)];
    {
      const HC = 220, hc = new Map();
      for (let j = 0; j < N; j += 2) { const k = Math.floor(gx[j] / HC) + ',' + Math.floor(gz[j] / HC); if (!hc.has(k)) hc.set(k, []); hc.get(k).push(j); }
      const hd = r3.geo.hdg, ds = r3.geo.ds;
      for (let r = 0; r < rows; r++) {
        const i = Math.min(N - 1, r * st), c = Math.cos(hd[i]), sn = Math.sin(hd[i]);
        const cx = Math.floor(gx[i] / HC), cz = Math.floor(gz[i] / HC);
        for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const l = hc.get((cx + a) + ',' + (cz + b)); if (l) for (const j of l) {
          const vx = gx[j] - gx[i], vz = gz[j] - gz[i], lon = vx * c + vz * sn, la = -vx * sn + vz * c;
          if (Math.abs(lon) > Math.abs(la) * 0.7 || Math.abs(la) < 1) continue;
          const sd = la > 0 ? 0 : 1, h = Math.abs(la) / 2; if (h < room[sd][r]) room[sd][r] = h;
        } }
        const i0 = Math.max(0, i - 2), i1 = Math.min(N - 1, i + 2);
        let dh = hd[i1] - hd[i0]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        const kk = dh / Math.max(1e-6, (i1 - i0) * ds);
        if (Math.abs(kk) > 1 / 900) { const sd = kk > 0 ? 0 : 1; room[sd][r] = Math.min(room[sd][r], 0.92 / Math.abs(kk)); }
      }
      // smooth the limits along the road so neighbouring rows stay close (no jagged edges)
      for (const R of room) { const t = Float32Array.from(R); for (let r = 0; r < rows; r++) { let m = 1e9; for (let q = -3; q <= 3; q++) m = Math.min(m, t[Math.min(rows - 1, Math.max(0, r + q))]); R[r] = Math.max(W / 2 + 2.6, m); } }
    }
    for (let r = 0; r < rows; r++) {
      const i = Math.min(N - 1, r * st), nx = -Math.sin(r3.geo.hdg[i]), nz = Math.cos(r3.geo.hdg[i]);
      lat.forEach((o0, q) => {
        const lim = room[o0 > 0 ? 0 : 1][r], o = Math.sign(o0) * Math.min(Math.abs(o0), lim);
        const x = gx[i] + nx * o, z = gz[i] + nz * o, k = r * P + q;
        pos[k * 3] = x; pos[k * 3 + 1] = Math.abs(o) > 500 ? hMin - 3.2 : terrH(x, z, i, Math.abs(o)); pos[k * 3 + 2] = z; uv[k * 2] = x / 21; uv[k * 2 + 1] = z / 21;
        if (r < rows - 1 && q < P - 1 && !(o0 < 0 && lat[q + 1] > 0)) idx.push(k, k + 1, k + P, k + 1, k + P + 1, k + P);
      });
    }
    // under the road: one quad per row between the two inner edges, just below the verge
    for (let r = 0; r < rows - 1; r++) { const k = r * P + offs.length - 1; idx.push(k, k + 1, k + P, k + 1, k + P + 1, k + P); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const tm = r3.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [1, 1]), roughness: 1 })
      : detailPatch(texSet(mixed ? 'rally:snow_03' : snowy ? 'snow_02' : 'aerial_grass_rock', { color: snowy ? 0xffffff : BI.ground ?? RL.ground }), { macro: 0.32, macroScale: 0.018, tint: snowy ? 0xdfe8f0 : BI.tint ?? RL.tint, tintAmt: BI.tintAmt ?? RL.tintAmt, key: 'stage' });
    const terr = new THREE.Mesh(g, tm); terr.receiveShadow = true; r3.scene.add(terr);
    r3.groundH = (x, z) => terrH(x, z);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), r3.low ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, groundCol, 255, 12000, 3), [600, 600]), roughness: 1 }) : detailPatch(pbr(snowy ? 'snow_02' : 'aerial_grass_rock', { repeat: [3000, 3000], color: snowy ? 0xffffff : BI.ground ?? RL.ground }), { macro: 0.2, macroScale: 0.01 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((bx0 + bx1) / 2, hMin - 3, (bz0 + bz1) / 2); ground.receiveShadow = true;
  r3.scene.add(ground);
  // verges fray into the terrain
  r3.edgeDissolve(vergeMat, { lat: 1.4, lon: 1e-3, scale: 0.9 });
  r3.scene.add(r3.ribbonEdge(r3.ribbon(W / 2, W / 2 + 2.5, 0.01, vergeMat, 1 / 2, 1, 1.25), false, 2.5));
  r3.scene.add(r3.ribbonEdge(r3.ribbon(-W / 2 - 2.5, -W / 2, 0.01, vergeMat, 1 / 2, 1, 1.25), true, 2.5));
  {
    // the road carries track-space data (lateral offset, driving line, cornerness) for ruts / rubber
    r3.computeLine();
    const road = r3.ribbon(-W / 2, W / 2, 0.03, r3.asphaltMat, surf === 'tarmac' ? 1 / 5 : 1 / 2.5, 1, surf === 'tarmac' ? W / 5 : W / 2.5);
    const cnt = road.geometry.attributes.position.count / 2, a = new Float32Array(cnt * 6);
    for (let n = 0; n < cnt; n++) { const i = Math.min(N - 1, n); const kk = Math.min(1, Math.abs(r3.geo.k[i]) * 60); a.set([-W / 2, r3.line[i], kk, W / 2, r3.line[i], kk], n * 6); }
    road.geometry.setAttribute('aTrk', new THREE.BufferAttribute(a, 3));
    r3.scene.add(road);
  }
  if (snowy) {
    const bankMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
    const bh = surf === 'snow' ? 0.5 : 0.18 + 0.25 * ice;
    for (const side of [1, -1]) { const m = r3.ribbon(side * (W / 2 + 2.4), side * (W / 2 + 3.4), bh, bankMat, 0.05, 2); r3.scene.add(m); }
  }
  if (mixed) buildIcePatches(r3, W, ice);
  installRallyFx(r3, { surface: surf, ice, wet: !!info.wet });
  // dense forest along the road (photoreal impostors standing on the terrain)
  const kinds = BI.trees || (surf === 'rough' ? [['bush', 0.4], ['broad', 0.35], ['desert', 0.25]] : surf === 'snow' ? [['conifer', 1]] : [['conifer', 0.7], ['broad', 0.3]]);
  const pool = vegOfKind(kinds.map((k) => k[0]));
  const pick = () => { let r = Math.random(); for (const [k, w] of kinds) { if ((r -= w) <= 0) return k; } return kinds[0][0]; };
  const items = []; const target = Math.round(Math.min(9000 * (BI.dens || 1), N * 7 * (BI.dens || 1)) * (r3.low ? 0.35 : 1));
  r3.tvCams = r3.makeTvCams();
  const sight = r3.tvCams.flatMap((c) => [0, -12, -24].map((dd) => { const j = Math.max(0, Math.min(N - 1, c.i + dd)); return [c.pos.x, c.pos.z, gx[j], gz[j]]; }));
  const blocks = (px, pz) => sight.some(([x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)); return (px - x0 - dx * t) ** 2 + (pz - z0 - dz * t) ** 2 < 49; });
  for (let k = 0; k < target * 3 && items.length < target; k++) {
    const i = Math.floor(Math.random() * N); const side = Math.random() < 0.5 ? 1 : -1;
    // two thirds form a wall of trees close to the road, the rest the forest behind
    const off = side * (W / 2 + 7 + (Math.random() < 0.66 ? Math.random() * 30 : Math.random() ** 1.5 * 140));
    const nx = -Math.sin(r3.geo.hdg[i]), nz = Math.cos(r3.geo.hdg[i]);
    const cx = gx[i] + nx * off, cz = gz[i] + nz * off;
    const kind = pick(); const opts = pool.filter((m) => m.kind === kind); if (!opts.length) continue;
    for (let q = 0; q < 3 && items.length < target; q++) {
      const px = cx + (Math.random() - 0.5) * 16, pz = cz + (Math.random() - 0.5) * 16;
      const [d2] = near(px, pz); if (d2 < (W / 2 + 5.5) ** 2 || blocks(px, pz)) continue;
      const meta = opts[Math.floor(Math.random() * opts.length)];
      const h = { conifer: 11 + Math.random() * 10, broad: 6 + Math.random() * 6, bush: 1.8 + Math.random() * 2, desert: 4 + Math.random() * 3 }[meta.kind];
      const v = (0.82 + Math.random() * 0.26) * (meta.kind === 'bush' ? 1.25 : 1);
      items.push({ x: px, y: r3.groundH(px, pz) - 0.2, z: pz, h, meta, rot: Math.random() * 6.283, tint: snowy ? [v * 0.9, v * 0.95, v] : [v * (0.95 + Math.random() * 0.1), v, v * 0.9] });
    }
  }
  if (items.length) { r3.scene.add(makeTreeShadows(items)); r3.forest = makeForest(items); r3.forest.material.uniforms.sunDir.value = r3.sunDir; r3.scene.add(r3.forest); }
  buildRallyDressing(r3, near, r3.groundH, surf);
  buildRallyExtras(r3, near, surf === 'tarmac' && mixed ? 'snow' : surf, BI.huts ? { ...RL, huts: BI.huts } : RL);
  // start & finish arches
  for (const [i, col] of [[2, 0x22d37a], [N - 3, 0xffffff]]) {
    const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    for (const zz of [W / 2 + 1, -W / 2 - 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), m); p.position.set(0, 2.5, zz); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, W + 2.8), m); beam.position.y = 5; g.add(beam);
    r3.placeAt(g, i, 0, r3.geo.h ? r3.geo.h[i] : 0); r3.scene.add(g);
  }
  if (r3.scene.fog) { r3.scene.fog = new HeightFog(r3.scene.fog.color, 0.0007); r3.fogDensity = r3.scene.fog.density; }
}

// rally stage dressing: spectator groups behind red/white tape on the outside of corners and
// on crests, sponsor banners and flags, start / finish arches with sponsor boards
function buildRallyDressing(r3, near, terrH, surf) {
  const N = r3.geo.N, W = r3.TW, g = r3.geo;
  const spots = [];
  const minGap = Math.round(260 / g.ds);
  let last = -minGap;
  // candidates: tight corners (outside, where the action is) and crests, plus the start
  const cand = [];
  for (let i = 20; i < N - 20; i += 3) { const k = Math.abs(g.k[i]); if (k > 1 / 70) cand.push({ i, side: g.k[i] > 0 ? -1 : 1, w: k * 60 }); }
  for (const c of g.crests || []) cand.push({ i: c + 4, side: Math.random() < 0.5 ? 1 : -1, w: 2 });
  cand.sort((a, b) => b.w - a.w);
  for (const c of cand) { if (spots.some((s) => Math.abs(s.i - c.i) < minGap)) continue; spots.push(c); if (spots.length > (r3.low ? 10 : 22)) break; }
  spots.push({ i: 12, side: 1, w: 1, start: true }, { i: 12, side: -1, w: 1, start: true });
  r3.rallySpots = spots;
  void last;
  const people = [], tapes = [], posts = [], banners = [];
  const d = new THREE.Object3D(); const col = new THREE.Color();
  const jackets = ['#d8141b', '#1e41ff', '#f5c400', '#111418', '#2d6a3e', '#e8e8e8', '#ff7a00', '#5a2d82', '#0b7a8a', '#7a1f1f', '#3a4250'];
  for (const sp of spots) {
    const span = sp.start ? 10 : 9 + Math.floor(Math.random() * 8);
    const off0 = W / 2 + (sp.start ? 5 : 6.5 + Math.random() * 3);
    // tape line on posts, following the road at a fixed offset
    const tp = [];
    for (let q = -span; q <= span; q++) {
      const i = Math.max(0, Math.min(N - 1, sp.i + q));
      const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
      const px = g.x[i] + nx * sp.side * off0, pz = g.y[i] + nz * sp.side * off0, py = terrH(px, pz);
      tp.push([px, py, pz]);
      if (q % 2 === 0) { d.position.set(px, py, pz); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); posts.push(d.matrix.clone()); }
    }
    tapes.push(tp);
    // spectators: a loose crowd behind the tape, some on higher ground further back
    const n = sp.start ? 26 : 14 + Math.floor(Math.random() * 26);
    for (let k = 0; k < n; k++) {
      const q = (Math.random() * 2 - 1) * span * 0.9;
      const i = Math.max(0, Math.min(N - 1, Math.round(sp.i + q)));
      const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
      const o = off0 + 1.2 + Math.random() ** 1.6 * 9;
      const px = g.x[i] + nx * sp.side * o + (Math.random() - 0.5) * 1.5, pz = g.y[i] + nz * sp.side * o + (Math.random() - 0.5) * 1.5;
      const [d2] = near(px, pz); if (d2 < (off0 + 0.8) ** 2) continue;
      d.position.set(px, terrH(px, pz) - 0.05, pz);
      d.rotation.set(0, Math.atan2(g.x[i] - px, g.y[i] - pz) + (Math.random() - 0.5) * 0.8, 0);
      const s = 0.92 + Math.random() * 0.16; d.scale.set(s, s, s); d.updateMatrix();
      people.push([d.matrix.clone(), jackets[Math.floor(Math.random() * jackets.length)]]);
    }
    // sponsor banner on two poles behind the crowd, flags waved by fans
    if (Math.random() < 0.8 || sp.start) {
      const i = Math.max(0, Math.min(N - 1, sp.i + Math.round((Math.random() - 0.5) * span)));
      const nx = -Math.sin(g.hdg[i]), nz = Math.cos(g.hdg[i]);
      const o = off0 + 11 + Math.random() * 3;
      const px = g.x[i] + nx * sp.side * o, pz = g.y[i] + nz * sp.side * o;
      d.position.set(px, terrH(px, pz), pz); d.rotation.set(0, -g.hdg[i] + (sp.side > 0 ? Math.PI : 0), 0); d.scale.set(1, 1, 1); d.updateMatrix();
      banners.push(d.matrix.clone());
    }
  }
  // people (simple low-poly spectators)
  if (people.length) {
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    pm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `vColor = vec3(1.0);
      #ifdef USE_COLOR
        vColor = color.rgb;
      #endif
      #ifdef USE_INSTANCING_COLOR
        if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) vColor = instanceColor.rgb;
      #endif`); };
    pm.customProgramCacheKey = () => 'spect';
    const im = new THREE.InstancedMesh(personGeo('spect'), pm, people.length);
    people.forEach(([m, c], k) => { im.setMatrixAt(k, m); im.setColorAt(k, col.set(c)); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); r3.scene.add(im);
  }
  // tape posts + tape ribbons (two bands)
  if (posts.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5).translate(0, 0.55, 0), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.6 }), posts.length);
    posts.forEach((m, k) => im.setMatrixAt(k, m)); im.computeBoundingSphere(); r3.scene.add(im);
    const tex = canvasTex(64, 8, (c, w, h) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f4f4f4' : '#d8141b'; c.beginPath(); c.moveTo(k * 8, 0); c.lineTo(k * 8 + 8, 0); c.lineTo(k * 8 + 4, h); c.lineTo(k * 8 - 4, h); c.fill(); } });
    const pos = [], uv = [], idx = [];
    for (const tp of tapes) for (const yb of [0.95, 0.55]) {
      let v = 0; const b0 = pos.length / 3;
      tp.forEach(([x, y, z], k) => {
        if (k) v += Math.hypot(x - tp[k - 1][0], z - tp[k - 1][2]) / 0.8;
        const sag = 0.05 * Math.abs(Math.sin(k * Math.PI / 2));
        pos.push(x, y + yb - sag, z, x, y + yb - sag + 0.07, z); uv.push(v, 0, v, 1);
        if (k < tp.length - 1) { const a = b0 + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.5 })); r3.scene.add(tm);
  }
  // banners: 4 m sponsor cloth between two poles
  if (banners.length) {
    const M = r3.standMats(new THREE.MeshStandardMaterial());
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6).translate(0, 1.6, 0);
    const pg = mergeGeometries([pole.clone().translate(-2.1, 0, 0), pole.clone().translate(2.1, 0, 0)].map((x) => (x.index ? x.toNonIndexed() : x)));
    const pi = new THREE.InstancedMesh(pg, M.steel, banners.length); banners.forEach((m, k) => pi.setMatrixAt(k, m)); pi.computeBoundingSphere(); r3.scene.add(pi);
    // each banner shows one brand of the stand atlas (u range picked per instance by matrix hash in a tiny shader)
    const bg = new THREE.PlaneGeometry(4.1, 1.1).translate(0, 2.55, 0);
    const bm = M.ad.clone(); bm.side = THREE.DoubleSide;
    bm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        float bi = floor(fract(sin(instanceMatrix[3].x * 12.9898 + instanceMatrix[3].z * 78.233) * 43758.5453) * ${M.nBrands}.0);
        vMapUv = vec2((bi + uv.x) / ${M.nBrands}.0, uv.y);
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = vMapUv;
        #endif
      #endif`); };
    bm.customProgramCacheKey = () => 'banner';
    const bi = new THREE.InstancedMesh(bg, bm, banners.length); banners.forEach((m, k) => bi.setMatrixAt(k, m)); bi.castShadow = true; bi.computeBoundingSphere(); r3.scene.add(bi);
  }
  // obstacles for the camera / tree placement
  r3.obstacles ||= [];
}

// snow and ice on an icy tarmac stage: white drifts blown across the road and frozen patches on the
// inside of the corners (alpha-masked ribbon just above the road, more of it the icier the stage)
function buildIcePatches(r3, W, ice) {
  const tex = canvasTex(256, 1024, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let k = 0; k < 70 * (0.2 + ice); k++) {
      const y = Math.random() * h, x = Math.random() < 0.8 ? (Math.random() < 0.5 ? Math.random() * w * 0.28 : w - Math.random() * w * 0.28) : Math.random() * w;
      const r = 10 + Math.random() * 46, g = c.createRadialGradient(x, y, 0, x, y, r);
      const a = 0.45 + Math.random() * 0.4;
      g.addColorStop(0, `rgba(245,248,252,${a})`); g.addColorStop(0.6, `rgba(235,242,248,${a * 0.6})`); g.addColorStop(1, 'rgba(235,242,248,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r * (0.6 + Math.random()), r * (1 + Math.random() * 2.5), 0, 0, 7); c.fill();
    }
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = r3.ribbon(-W / 2 - 0.3, W / 2 + 0.3, 0.035, mat, 1 / 60, 1, 1);
  m.renderOrder = 1; r3.scene.add(m);
}
