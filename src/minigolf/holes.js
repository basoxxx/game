// Minigolf Baso — hole format and world builder. Pure JS (no three.js): the game, the headless solver
// (tools/minigolf-check.mjs) and the editor all build the very same collision world from a hole.
//
// A hole is a small grid of 1 m tiles written as text rows (top row = north, far from the camera):
//   .  void            _  felt          S  tee            H  cup
//   s  sand            i  ice           w  water (hazard) l  lava (hazard)   g  low-gravity felt
//   ^ > v <  ramp rising one level towards N / E / S / W (its height digit is the low end)
//   8 6 2 4  conveyor belt pushing N / E / S / W (numpad)
//   B  bumper          M  windmill      Z  sliding gate   O  loop-the-loop
//   T→t, U→u  teleporter entrance → exit       X  solid block (obstacle)
// An optional height map (same size, digits 0-9) raises tiles by 0.25 m per level.
// Walls build themselves: rails where a tile meets the void, faces where it meets a lower tile,
// nothing between tiles that join (a ramp joins its low and high neighbours). A ramp whose high end
// drops to a lower tile is a jump; a tile next to water or lava has no rail, so the ball can go in.
export const LV = 0.25, RAIL_T = 0.07, RAIL_H = 0.12, BALL_R = 0.06, CUP_R = 0.105;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W in (x, z)
const RAMP = { '^': 0, '>': 1, v: 2, '<': 3 };
const BELT = { 8: 0, 6: 1, 2: 2, 4: 3 };
export const TILE_NAMES = {
  _: 'Prato', S: 'Partenza', H: 'Buca', s: 'Sabbia', i: 'Ghiaccio', w: 'Acqua', l: 'Lava', g: 'Gravità bassa',
  '^': 'Rampa', '>': 'Rampa', v: 'Rampa', '<': 'Rampa', 8: 'Nastro', 6: 'Nastro', 2: 'Nastro', 4: 'Nastro',
  B: 'Respingente', M: 'Mulino', Z: 'Cancello mobile', O: 'Giro della morte', T: 'Teletrasporto', t: 'Uscita teletrasporto',
  U: 'Teletrasporto 2', u: 'Uscita teletrasporto 2', X: 'Blocco', '.': 'Vuoto',
};
export const SURF = { // rolling resistance (m/s² per g), static friction, restitution of the floor
  felt: { mu: 0.058, ms: 0.07 }, sand: { mu: 0.42, ms: 0.35 }, ice: { mu: 0.012, ms: 0.02 },
};
export const isHaz = (t) => t === 'w' || t === 'l';
const solidTile = (t) => t && t !== '.' && t !== ' ';

export function parseHole(spec) {
  const rows = spec.rows.map((r) => r.replace(/ /g, '.'));
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const cells = [];
  let tee = null, cup = null;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const t = rows[r][c] || '.';
    const hc = spec.h?.[r]?.[c];
    const lv = hc && /[0-9]/.test(hc) ? +hc : 0;
    const cell = { c, r, t: solidTile(t) ? t : '.', lv, ramp: RAMP[t] ?? -1, belt: BELT[t] ?? -1 };
    cells.push(cell);
    if (t === 'S') tee = cell;
    if (t === 'H') cup = cell;
  }
  return { W, H, cells, tee, cup, g: spec.g || 1, at: (c, r) => (c < 0 || r < 0 || c >= W || r >= H ? null : cells[r * W + c]) };
}

// heights of the 4 corners NW NE SE SW
export function cornerY(cell) {
  const b = cell.lv * LV;
  if (cell.t === 'X') return [b + 0.42, b + 0.42, b + 0.42, b + 0.42];
  if (isHaz(cell.t)) return [b - 0.1, b - 0.1, b - 0.1, b - 0.1];
  if (cell.ramp < 0) return [b, b, b, b];
  const up = [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 1], [1, 0, 0, 1]][cell.ramp];
  return up.map((u) => b + u * LV);
}
// floor height at a point of a tile (bilinear on the corners: exact for flat tiles and ramps)
export function floorAt(cell, x, z) {
  const k = cornerY(cell), u = x - cell.c, v = z - cell.r;
  return (k[0] * (1 - u) + k[1] * u) * (1 - v) + (k[3] * (1 - u) + k[2] * u) * v;
}
const CORN = [[0, 0], [1, 0], [1, 1], [0, 1]];
const SIDE = [[0, 1], [1, 2], [2, 3], [3, 0]]; // N E S W as corner pairs

// passage axis of a tile (for windmills, gates, loops): 0 = runs N-S, 1 = runs E-W
export function axisOf(hole, cell) {
  const open = (d) => { const n = hole.at(cell.c + DIRS[d][0], cell.r + DIRS[d][1]); return n && n.t !== '.' && n.t !== 'X'; };
  const ns = open(0) || open(2), ew = open(1) || open(3);
  return ns && !ew ? 0 : ew && !ns ? 1 : (open(0) && open(2)) ? 0 : 1;
}

// tile distance to the cup over joined tiles (teleporters included): the solver's heuristic and the
// side a windmill faces
export function tileDist(hole, from) {
  const D = new Map(); const key = (c) => c.r * hole.W + c.c;
  if (!from) return D;
  const q = [from]; D.set(key(from), 0);
  while (q.length) {
    const a = q.shift(), d = D.get(key(a));
    const nb = [];
    for (let s = 0; s < 4; s++) { const n = hole.at(a.c + DIRS[s][0], a.r + DIRS[s][1]); if (n && n.t !== '.' && n.t !== 'X') nb.push(n); }
    for (const [A, B] of [['T', 't'], ['U', 'u']]) {
      if (a.t === A || a.t === B) for (const o of hole.cells) if (o.t === (a.t === A ? B : A)) nb.push(o);
    }
    for (const n of nb) if (!D.has(key(n))) { D.set(key(n), d + 1); q.push(n); }
  }
  return D;
}

// ---------- world: collision triangles + render parts + moving things
export function buildWorld(spec) {
  const hole = spec.cells ? spec : parseHole(spec);
  const tris = []; // {a,b,c,n,e,kind}
  const parts = {}; // render material -> flat array of xyz triangles
  const push = (mat, ...pts) => { (parts[mat] ||= []).push(...pts.flat()); };
  const solid = (mat, e, ...pts) => { // pts: 3 [x,y,z]
    const [a, b, c] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n); if (l < 1e-9) return; n = n.map((x) => x / l);
    tris.push({ a, b, c, n, e });
    if (mat) push(mat, a, b, c);
  };
  const quad = (mat, e, a, b, c, d) => { solid(mat, e, a, b, c); solid(mat, e, a, c, d); };
  const vquad = (mat, a, b, c, d) => { push(mat, a, b, c); push(mat, a, c, d); };
  const kin = [], bumpers = [], pads = [], belts = [], decor = [], loops = [];
  const D = tileDist(hole, hole.tee);
  let minY = 0, maxY = 0;
  for (const cell of hole.cells) if (cell.t !== '.') { const k = cornerY(cell); minY = Math.min(minY, ...k); maxY = Math.max(maxY, ...k); }
  const baseY = minY - 0.8;
  const E = { felt: 0.25, wall: 0.68, face: 0.5, block: 0.45 };

  for (const cell of hole.cells) {
    if (cell.t === '.') continue;
    const k = cornerY(cell), x0 = cell.c, z0 = cell.r;
    const P = (i, dy = 0) => [x0 + CORN[i][0], k[i] + dy, z0 + CORN[i][1]];
    // floor (the cup tile is drawn with its hole by the renderer, the physics floor stays flat)
    const fm = cell.t === 'X' ? 'block' : cell.t === 's' ? 'sand' : cell.t === 'i' ? 'ice' : isHaz(cell.t) ? (cell.t === 'w' ? 'pool' : 'lavabed') : cell.t === 'g' ? 'grav' : cell.belt >= 0 ? null : cell.t === 'H' ? null : cell.ramp >= 0 ? 'ramp' : (cell.c + cell.r) % 2 ? 'felt2' : 'felt';
    quad(fm, E.felt, P(0), P(3), P(2), P(1));
    if (cell.belt >= 0) belts.push({ cell, dir: cell.belt, y: k[0] });
    // sides
    for (let s = 0; s < 4; s++) {
      const [ia, ib] = SIDE[s];
      const A = CORN[ia], B = CORN[ib];
      const n = hole.at(cell.c + DIRS[s][0], cell.r + DIRS[s][1]);
      const ya = k[ia], yb = k[ib];
      let na = null, nb = null;
      if (n && n.t !== '.') { const kn = cornerY(n); const os = (s + 2) % 4; const [ja, jb] = SIDE[os]; nb = kn[ja]; na = kn[jb]; }
      const ax = x0 + A[0], az = z0 + A[1], bx = x0 + B[0], bz = z0 + B[1];
      const higher = na === null || ya - na > 1e-4 || yb - nb > 1e-4;
      if (!higher) continue;
      const loA = na === null ? baseY : Math.min(na, ya), loB = na === null ? baseY : Math.min(nb, yb);
      // outward face (solid down to the neighbour, visual skirt into the void)
      if (na === null) vquad(cell.t === 'X' ? 'blockside' : 'skirt', [ax, loA, az], [ax, ya, az], [bx, yb, bz], [bx, loB, bz]);
      else quad(cell.t === 'X' ? 'blockside' : 'side', E.face, [ax, loA, az], [ax, ya, az], [bx, yb, bz], [bx, loB, bz]);
      const jump = cell.ramp === s;
      const rail = cell.t !== 'X' && !isHaz(cell.t) && !jump && !(n && isHaz(n.t));
      if (!rail) continue;
      // rail box along the edge, inside the tile
      const m = [-DIRS[s][0] * RAIL_T, -DIRS[s][1] * RAIL_T];
      const o0 = [ax, ya, az], o1 = [bx, yb, bz], i0 = [ax + m[0], ya, az + m[1]], i1 = [bx + m[0], yb, bz + m[1]];
      const up = (p) => [p[0], p[1] + RAIL_H, p[2]];
      quad('rail', E.wall, i0, up(i0), up(i1), i1);            // inner face
      quad('railtop', E.wall, up(i0), up(o0), up(o1), up(i1)); // top
      quad('rail', E.wall, o1, up(o1), up(o0), o0);            // outer face
      solid('rail', E.wall, o0, up(o0), up(i0)); solid('rail', E.wall, o0, up(i0), i0); // end caps
      solid('rail', E.wall, i1, up(i1), up(o1)); solid('rail', E.wall, i1, up(o1), o1);
    }
    const cx = x0 + 0.5, cz = z0 + 0.5, y = k[0];
    // features
    if (cell.t === 'B') bumpers.push({ x: cx, z: cz, y, r: 0.13, h: 0.22 });
    if (cell.t === 'T' || cell.t === 't' || cell.t === 'U' || cell.t === 'u') pads.push({ cell, x: cx, z: cz, y, kind: cell.t });
    if (cell.t === 'M') {
      const ax = axisOf(hole, cell);
      // the sails face the side the ball comes from (closer to the tee)
      const sides = ax === 0 ? [0, 2] : [1, 3];
      const dOf = (s) => { const n = hole.at(cell.c + DIRS[s][0], cell.r + DIRS[s][1]); return n ? D.get(n.r * hole.W + n.c) ?? 999 : 999; };
      const face = dOf(sides[0]) <= dOf(sides[1]) ? sides[0] : sides[1];
      const along = DIRS[face], lat = [Math.abs(along[1]), Math.abs(along[0])];
      // housing: two side blocks and a roof over a tunnel 0.34 m wide, 0.5 m tall
      const box = (c0, h0, mat) => addBox(solid, quad, mat, c0, h0, E.block);
      for (const sg of [-1, 1]) box([cx + lat[0] * sg * 0.335, y + 0.29, cz + lat[1] * sg * 0.335], [lat[0] * 0.165 + Math.abs(along[0]) * 0.28, 0.29, lat[1] * 0.165 + Math.abs(along[1]) * 0.28], 'mill');
      box([cx, y + 0.54, cz], [lat[0] * 0.17 + Math.abs(along[0]) * 0.28, 0.04, lat[1] * 0.17 + Math.abs(along[1]) * 0.28], 'mill');
      const hub = [cx + along[0] * 0.33, y + 0.62, cz + along[1] * 0.33];
      const w = 1.25 * (1 + ((cell.c * 7 + cell.r * 3) % 3) * 0.12);
      for (let b = 0; b < 4; b++) kin.push({ type: 'blade', hub, axis: [along[0], 0, along[1]], lat: [lat[0], 0, lat[1]], w, ph: b * Math.PI / 2, len: 0.56, half: [0.27, 0.085, 0.025], cell });
      decor.push({ type: 'mill', cell, hub, along, lat, w, y });
    }
    if (cell.t === 'Z') {
      const ax = axisOf(hole, cell);
      const lat = ax === 0 ? [1, 0] : [0, 1];
      const per = 2.6 + ((cell.c + cell.r * 3) % 3) * 0.5;
      kin.push({ type: 'slide', c: [cx, y + 0.1, cz], lat: [lat[0], 0, lat[1]], amp: 0.25, per, ph: (cell.c * 1.7 + cell.r) % 3, half: [lat[0] * 0.17 + lat[1] * 0.1, 0.1, lat[1] * 0.17 + lat[0] * 0.1], cell });
    }
    if (cell.t === 'O') {
      const ax = axisOf(hole, cell);
      const along = ax === 0 ? [0, -1] : [1, 0], lat = ax === 0 ? [1, 0] : [0, 1];
      buildLoop(solid, quad, push, [cx, y, cz], along, lat, E);
      loops.push({ cell, c: [cx, y, cz], along, lat });
    }
  }
  return { hole, tris, parts, kin, bumpers, pads, belts, decor, loops, minY, maxY, baseY, dist: D };
}

function addBox(solid, quad, mat, c, h, e) {
  const v = [];
  for (let i = 0; i < 8; i++) v.push([c[0] + (i & 1 ? h[0] : -h[0]), c[1] + (i & 2 ? h[1] : -h[1]), c[2] + (i & 4 ? h[2] : -h[2])]);
  // faces (outward winding)
  quad(mat, e, v[0], v[4], v[6], v[2]); quad(mat, e, v[1], v[3], v[7], v[5]);
  quad(mat, e, v[2], v[6], v[7], v[3]); quad(mat, e, v[0], v[1], v[5], v[4]);
  quad(mat, e, v[0], v[2], v[3], v[1]); quad(mat, e, v[4], v[5], v[7], v[6]);
}

// loop-the-loop: a strip that climbs, turns over and comes down 0.5 m to the side. The tile's entry
// edge is half closed by a cap, so the ball goes in through a 0.37 m door on the strip's side and leaves
// through the opposite door (works from both ends).
export const LOOP = { R: 0.3, W: 0.17, SH: 0.25 };
export function loopPoint(c, al, la, th, l) {
  const { R, SH } = LOOP;
  const s = R * Math.sin(th), y = R - R * Math.cos(th), off = SH * (th / Math.PI - 1);
  return [c[0] + al[0] * s + la[0] * (l + off), c[1] + y, c[2] + al[1] * s + la[1] * (l + off)];
}
function buildLoop(solid, quad, push, c, al, la, E) {
  const { W } = LOOP, N = 44, LIP = 0.09;
  const lip = (p, th) => { const ins = -Math.sin(th), iny = Math.cos(th); return [p[0] + al[0] * ins * LIP, p[1] + iny * LIP, p[2] + al[1] * ins * LIP]; };
  for (let i = 1; i < N - 1; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const A0 = loopPoint(c, al, la, t0, -W), A1 = loopPoint(c, al, la, t0, W), B0 = loopPoint(c, al, la, t1, -W), B1 = loopPoint(c, al, la, t1, W);
    quad('loop', 0.2, A0, A1, B1, B0);
    for (const [p0, p1] of [[A0, B0], [A1, B1]]) quad('looprail', 0.4, p0, p1, lip(p1, t1), lip(p0, t0));
  }
  // caps: entry edge closed for lateral > -0.06, exit edge closed for lateral < 0.06
  const P = (s, l, y) => [c[0] + al[0] * s + la[0] * l, c[1] + y, c[2] + al[1] * s + la[1] * l];
  const cap = (s0, s1, l0, l1) => {
    const h = 0.15, v = [];
    for (let i = 0; i < 8; i++) v.push(P(i & 1 ? s1 : s0, i & 4 ? l1 : l0, i & 2 ? h : 0));
    quad('looprail', E.wall, v[0], v[4], v[6], v[2]); quad('looprail', E.wall, v[1], v[3], v[7], v[5]);
    quad('looprail', E.wall, v[2], v[6], v[7], v[3]); quad('looprail', E.wall, v[0], v[1], v[5], v[4]);
    quad('looprail', E.wall, v[0], v[2], v[3], v[1]); quad('looprail', E.wall, v[4], v[5], v[7], v[6]);
  };
  cap(-0.5, -0.44, -0.06, 0.5); cap(0.44, 0.5, -0.5, 0.06);
}
