// Minigolf Baso — ball physics. A single sphere against the hole's triangles (spatial hash), moving
// blades and gates, bumpers, belts, teleporters and hazards. Fixed 240 Hz steps with extra sub-steps
// so the ball never moves more than a third of its radius at once: no tunnelling at any speed, and the
// same shot from the same state always ends in the same place (replays, solver, daily hole).
import { buildWorld, BALL_R, CUP_R, SURF, isHaz, floorAt } from './holes.js';

export const DT = 1 / 240, G = 9.81, VMAX = 7.2, SHOT_MAX = 30;
export const powerToSpeed = (p) => 0.25 + 5.3 * Math.pow(Math.max(0, Math.min(1, p)), 1.5);
const CELL = 0.5;

export class Sim {
  constructor(spec) {
    const w = this.w = buildWorld(spec);
    this.hole = w.hole;
    this.grid = new Map();
    this.cand = [];
    const pad = BALL_R + 0.06;
    for (const t of w.tris) {
      const xs = [t.a[0], t.b[0], t.c[0]], zs = [t.a[2], t.b[2], t.c[2]];
      const x0 = Math.floor((Math.min(...xs) - pad) / CELL), x1 = Math.floor((Math.max(...xs) + pad) / CELL);
      const z0 = Math.floor((Math.min(...zs) - pad) / CELL), z1 = Math.floor((Math.max(...zs) + pad) / CELL);
      t.ymin = Math.min(t.a[1], t.b[1], t.c[1]) - pad; t.ymax = Math.max(t.a[1], t.b[1], t.c[1]) + pad;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 4096 + z; let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(t); }
    }
    this.cup = this.hole.cup ? { x: this.hole.cup.c + 0.5, z: this.hole.cup.r + 0.5, y: floorAt(this.hole.cup, this.hole.cup.c + 0.5, this.hole.cup.r + 0.5) } : null;
    const te = this.hole.tee;
    this.teePos = te ? [te.c + 0.5, floorAt(te, te.c + 0.5, te.r + 0.5) + BALL_R, te.r + 0.5] : [0.5, BALL_R, 0.5];
    this.t = 0;
    this.reset(this.teePos);
  }
  reset(pos) {
    this.p = [...pos]; this.v = [0, 0, 0]; this.state = 'rest'; this.restT = 0; this.shotT = 0;
    this.ground = null; this.tpLock = null; this.events = []; this.lastPos = [...pos]; this.lipT = 0; this.bladeT = 0;
  }
  tileAt(x, z) { return this.hole.at(Math.floor(x), Math.floor(z)); }
  shoot(angle, power) {
    if (this.state !== 'rest') return false;
    const sp = powerToSpeed(power);
    this.lastPos = [...this.p];
    this.v = [Math.sin(angle) * sp, 0, -Math.cos(angle) * sp];
    this.state = 'moving'; this.restT = 0; this.shotT = 0; this.events = []; this.hit = 0;
    return true;
  }
  // kinematic shapes at time t: oriented boxes {c, ax:[u0,u1,u2], h:[e0,e1,e2], vel(q), spin}
  kinBoxes(t) {
    const out = [];
    for (const k of this.w.kin) {
      if (k.type === 'blade') {
        const a = k.w * t + k.ph, ca = Math.cos(a), sa = Math.sin(a);
        // blade direction in the plane across the passage: down at a = 0
        const d = [k.lat[0] * sa, -ca, k.lat[2] * sa];
        const off = 0.05 + k.half[0];
        const c = [k.hub[0] + d[0] * off, k.hub[1] + d[1] * off, k.hub[2] + d[2] * off];
        const ax = k.axis, u1 = [ax[1] * d[2] - ax[2] * d[1], ax[2] * d[0] - ax[0] * d[2], ax[0] * d[1] - ax[1] * d[0]];
        const om = [ax[0] * k.w, ax[1] * k.w, ax[2] * k.w];
        out.push({ c, u: [d, u1, ax], h: k.half, vel: (q) => { const r = [q[0] - k.hub[0], q[1] - k.hub[1], q[2] - k.hub[2]]; return [om[1] * r[2] - om[2] * r[1], om[2] * r[0] - om[0] * r[2], om[0] * r[1] - om[1] * r[0]]; }, k });
      } else if (k.type === 'slide') {
        const w = (2 * Math.PI) / k.per, s = Math.sin(w * t + k.ph), cs = Math.cos(w * t + k.ph);
        const c = [k.c[0] + k.lat[0] * k.amp * s, k.c[1], k.c[2] + k.lat[2] * k.amp * s];
        const vv = [k.lat[0] * k.amp * w * cs, 0, k.lat[2] * k.amp * w * cs];
        out.push({ c, u: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [k.half[0], k.half[1], k.half[2]], vel: () => vv, k });
      }
    }
    return out;
  }
  // one fixed step (always advances the clock: windmills keep turning while the ball rests)
  step() {
    this.t += DT;
    if (this.state !== 'moving') return;
    this.shotT += DT;
    const sp = Math.hypot(...this.v);
    const n = Math.min(10, Math.max(1, Math.ceil((sp * DT) / (BALL_R * 0.33))));
    const h = DT / n;
    for (let i = 0; i < n && this.state === 'moving'; i++) this.sub(h, this.t - DT + (i + 1) * h);
    if (this.state !== 'moving') return;
    // at rest?
    const v = Math.hypot(...this.v);
    const g = this.ground;
    if (g && v < 0.05) {
      const tile = this.tileAt(this.p[0], this.p[2]);
      const su = surf(tile);
      const slope = Math.sqrt(Math.max(0, 1 - g[1] * g[1]));
      const onBelt = tile && tile.belt >= 0;
      if (slope < su.ms + 1e-3 && !onBelt) { this.restT += DT; if (this.restT > 0.18) this.stop(); }
      else this.restT = 0;
    } else this.restT = 0;
    if (this.shotT > SHOT_MAX) this.stop();
  }
  stop() { this.v = [0, 0, 0]; this.state = 'rest'; this.events.push({ type: 'rest' }); }
  sub(h, t) {
    const p = this.p, v = this.v;
    const tile = this.tileAt(p[0], p[2]);
    const grav = G * this.hole.g * (tile?.t === 'g' ? 0.35 : 1);
    // rolling resistance and belts from the last contact
    const gn = this.ground;
    if (gn) {
      const su = surf(tile);
      const vn = v[0] * gn[0] + v[1] * gn[1] + v[2] * gn[2];
      let vt = [v[0] - vn * gn[0], v[1] - vn * gn[1], v[2] - vn * gn[2]];
      if (tile && tile.belt >= 0) {
        const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][tile.belt], bs = 1.5;
        const k = Math.min(1, 2.6 * h);
        vt = [vt[0] + (D[0] * bs - vt[0]) * k, vt[1], vt[2] + (D[1] * bs - vt[2]) * k];
      }
      const s = Math.hypot(...vt);
      if (s > 1e-9) {
        const dec = su.mu * grav * Math.max(0.2, gn[1]) * h + 0.012 * s * h;
        const f = Math.max(0, s - dec) / s;
        vt = [vt[0] * f, vt[1] * f, vt[2] * f];
      }
      v[0] = vt[0] + vn * gn[0]; v[1] = vt[1] + vn * gn[1]; v[2] = vt[2] + vn * gn[2];
    }
    v[1] -= grav * h;
    const s2 = Math.hypot(...v); if (s2 > VMAX) { v[0] *= VMAX / s2; v[1] *= VMAX / s2; v[2] *= VMAX / s2; }
    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    this.ground = null;
    this.collideTris();
    this.collideKin(t);
    this.collideBumpers();
    this.checks(t);
  }
  collideTris() {
    const p = this.p, v = this.v, R = BALL_R;
    const list = this.grid.get(Math.floor(p[0] / CELL) * 4096 + Math.floor(p[2] / CELL));
    if (!list) return;
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (const t of list) {
        if (p[1] < t.ymin || p[1] > t.ymax) continue;
        const q = closestPtTri(p, t.a, t.b, t.c);
        const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2);
        let n;
        if (d > 1e-7) n = [dx / d, dy / d, dz / d];
        else { const s = Math.sign(dx * t.n[0] + dy * t.n[1] + dz * t.n[2]) || 1; n = [t.n[0] * s, t.n[1] * s, t.n[2] * s]; }
        this.contact(n, R - d, t.e, null);
        any = true;
      }
      if (!any) break;
    }
  }
  contact(n, pen, e, vs) {
    const p = this.p, v = this.v;
    p[0] += n[0] * pen; p[1] += n[1] * pen; p[2] += n[2] * pen;
    const rv = vs ? [v[0] - vs[0], v[1] - vs[1], v[2] - vs[2]] : v;
    const vn = rv[0] * n[0] + rv[1] * n[1] + rv[2] * n[2];
    if (vn < 0) {
      const floor = n[1] > 0.6;
      const ee = floor ? (vn < -0.9 ? e : 0) : (vn < -0.15 ? e : 0.1);
      const j = -(1 + ee) * vn;
      v[0] += j * n[0]; v[1] += j * n[1]; v[2] += j * n[2];
      if (!floor && vn < -0.25) { // a wall knock: lose a bit of the sliding speed too
        const vn2 = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        for (let i = 0; i < 3; i++) v[i] = (v[i] - vn2 * n[i]) * 0.94 + vn2 * n[i];
        if (-vn > 0.4) this.events.push({ type: 'wall', s: -vn });
      } else if (floor && vn < -1.2) this.events.push({ type: 'land', s: -vn });
    }
    if (n[1] > 0.35 && (!this.ground || n[1] > this.ground[1])) this.ground = n;
  }
  collideKin(t) {
    const p = this.p, R = BALL_R;
    for (const b of this.kinBoxes(t)) {
      const rx = p[0] - b.c[0], ry = p[1] - b.c[1], rz = p[2] - b.c[2];
      const ext = b.h[0] + b.h[1] + b.h[2] + R;
      if (rx * rx + ry * ry + rz * rz > ext * ext) continue;
      const L = b.u.map((u) => rx * u[0] + ry * u[1] + rz * u[2]);
      const inside = L.every((l, i) => Math.abs(l) < b.h[i]);
      let n, pen;
      if (inside) {
        let bi = 0, bd = 1e9;
        for (let i = 0; i < 3; i++) { const d = b.h[i] - Math.abs(L[i]); if (d < bd) { bd = d; bi = i; } }
        const s = Math.sign(L[bi]) || 1; n = b.u[bi].map((x) => x * s); pen = bd + R;
      } else {
        const Q = L.map((l, i) => Math.max(-b.h[i], Math.min(b.h[i], l)));
        const d = [L[0] - Q[0], L[1] - Q[1], L[2] - Q[2]];
        const dl = Math.hypot(...d); if (dl >= R) continue;
        n = [0, 1, 2].map((j) => (b.u[0][j] * d[0] + b.u[1][j] * d[1] + b.u[2][j] * d[2]) / dl); pen = R - dl;
      }
      const q = [p[0] - n[0] * R, p[1] - n[1] * R, p[2] - n[2] * R];
      const vs = b.vel(q);
      this.contact(n, pen, 0.55, vs);
      if (b.k.type === 'blade' && !this.bladeT) { this.events.push({ type: 'blade' }); this.bladeT = 1; }
    }
    if (this.bladeT) this.bladeT = Math.max(0, this.bladeT - 0.004);
  }
  collideBumpers() {
    const p = this.p, v = this.v, R = BALL_R;
    for (const b of this.w.bumpers) {
      if (p[1] > b.y + b.h + R || p[1] < b.y - R) continue;
      const dx = p[0] - b.x, dz = p[2] - b.z, d = Math.hypot(dx, dz);
      if (d >= b.r + R || d < 1e-9) continue;
      const n = [dx / d, 0, dz / d];
      p[0] += n[0] * (b.r + R - d); p[2] += n[2] * (b.r + R - d);
      const vn = v[0] * n[0] + v[2] * n[2];
      if (vn < 0) {
        const j = -vn * 2.25 + 0.6; // springy: gives back more than it got
        v[0] += j * n[0]; v[2] += j * n[2];
        this.events.push({ type: 'bump', b });
      }
    }
  }
  checks(t) {
    const p = this.p, v = this.v;
    const tile = this.tileAt(p[0], p[2]);
    // teleporters
    for (const pd of this.w.pads) {
      const d = Math.hypot(p[0] - pd.x, p[2] - pd.z);
      if (this.tpLock === pd && d > 0.3) this.tpLock = null;
      if ((pd.kind === 'T' || pd.kind === 'U') && d < 0.2 && p[1] < pd.y + 0.2 && this.tpLock !== pd) {
        const exit = this.w.pads.find((o) => o.kind === pd.kind.toLowerCase());
        if (!exit) continue;
        const dir = exitDir(this.hole, exit.cell);
        const sp = Math.max(1.2, Math.hypot(v[0], v[2]));
        p[0] = exit.x + dir[0] * 0.05; p[1] = exit.y + BALL_R + 0.01; p[2] = exit.z + dir[1] * 0.05;
        v[0] = dir[0] * sp; v[1] = 0; v[2] = dir[1] * sp;
        this.tpLock = exit; this.events.push({ type: 'tele', from: pd, to: exit });
        return;
      }
    }
    // cup
    const c = this.cup;
    if (c && tile === this.hole.cup) {
      const d = Math.hypot(p[0] - c.x, p[2] - c.z);
      const sp = Math.hypot(v[0], v[2]);
      if (d < CUP_R && p[1] < c.y + BALL_R + 0.03) {
        const cap = 1.25 + 1.5 * (1 - d / CUP_R);
        if (sp < cap) { this.state = 'holed'; this.v = [0, 0, 0]; this.p = [c.x, c.y - 0.06, c.z]; this.events.push({ type: 'holed' }); return; }
        // too fast: the far lip kicks it up a little
        if (!this.lipT || t - this.lipT > 0.3) { this.lipT = t; v[1] += 0.25 + 0.1 * sp; this.events.push({ type: 'lip' }); }
      }
    }
    // hazards and falling off
    if (tile && isHaz(tile.t) && p[1] < tile.lv * 0.25 - 0.03 + BALL_R * 0.5) { this.penalty(tile.t === 'w' ? 'water' : 'lava'); return; }
    if (p[1] < this.w.minY - 0.5 || p[0] < -3 || p[2] < -3 || p[0] > this.hole.W + 3 || p[2] > this.hole.H + 3) this.penalty('out');
  }
  penalty(why) {
    this.events.push({ type: 'penalty', why, at: [...this.p] });
    this.state = 'penalty';
    this.v = [0, 0, 0];
  }
  // after a penalty the game puts the ball back where the shot started
  respot() { this.reset(this.lastPos); }
  // run until the ball stops (headless: solver, preview, tests)
  run(maxT = SHOT_MAX + 1) {
    let n = 0; const lim = maxT / DT;
    while (this.state === 'moving' && n++ < lim) this.step();
    return this.state;
  }
}

function surf(tile) { return tile?.t === 's' ? SURF.sand : tile?.t === 'i' ? SURF.ice : SURF.felt; }
export function exitDir(hole, cell) {
  // the exit pad sends the ball into its open neighbour: north first, then east, west, south
  for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
    const n = hole.at(cell.c + dx, cell.r + dz);
    if (n && n.t !== '.' && n.t !== 'X' && n.t !== 'w' && n.t !== 'l') return [dx, dz];
  }
  return [0, -1];
}

// closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
export function closestPtTri(p, a, b, c) {
  const ab0 = b[0] - a[0], ab1 = b[1] - a[1], ab2 = b[2] - a[2];
  const ac0 = c[0] - a[0], ac1 = c[1] - a[1], ac2 = c[2] - a[2];
  const ap0 = p[0] - a[0], ap1 = p[1] - a[1], ap2 = p[2] - a[2];
  const d1 = ab0 * ap0 + ab1 * ap1 + ab2 * ap2, d2 = ac0 * ap0 + ac1 * ap1 + ac2 * ap2;
  if (d1 <= 0 && d2 <= 0) return a;
  const bp0 = p[0] - b[0], bp1 = p[1] - b[1], bp2 = p[2] - b[2];
  const d3 = ab0 * bp0 + ab1 * bp1 + ab2 * bp2, d4 = ac0 * bp0 + ac1 * bp1 + ac2 * bp2;
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab0, a[1] + v * ab1, a[2] + v * ab2]; }
  const cp0 = p[0] - c[0], cp1 = p[1] - c[1], cp2 = p[2] - c[2];
  const d5 = ab0 * cp0 + ab1 * cp1 + ab2 * cp2, d6 = ac0 * cp0 + ac1 * cp1 + ac2 * cp2;
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac0, a[1] + w * ac1, a[2] + w * ac2]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab0 * v + ac0 * w, a[1] + ab1 * v + ac1 * w, a[2] + ab2 * v + ac2 * w];
}
