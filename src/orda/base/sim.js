// Orda · La tua base — deterministic battle simulation on the base grid. Used for the offline attacks
// on the player's base (and to rate rival bases). Same layout + same attack = same outcome, always.
//
// The attacking horde is a few squads of little blue figures entering from the front row. Each squad
// walks the cheapest path to the HQ (Dijkstra on the grid: walls cost their HP, trap gates and tower
// fire add a penalty), spends figures 1:1 against the HP of whatever blocks it, gets divided by trap
// gates, shot by towers and intercepted by red figures from the barracks.
import { GRID, BUILDINGS, investOf } from './data.js';
import { rng, cellsOf, sizeOf } from './logic.js';

const DT = 0.1, T_MAX = 90, SPEED = 1.25, HIT_RATE = 30;

export function simulateAttack(layout, attack) {
  const R = rng(attack.seed || 1);
  const scudo = layout.b.filter((b) => b.t === 'scudo').reduce((a, b) => Math.max(a, BUILDINGS.scudo.hqBoost(b.l)), 0);
  // live state per building
  const units = layout.b.map((b) => {
    const B = BUILDINGS[b.t];
    const hp = Math.round(B.hp(b.l) * (b.t === 'hq' ? 1 + scudo : 1));
    const s = sizeOf(b.t);
    return { b, B, hp, max: hp, cx: b.x + s / 2, cy: b.y + s / 2, cd: 0, pool: 0, acc: 0, dead: false };
  });
  const cell = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  for (const u of units) for (const [x, y] of cellsOf(u.b)) if (x >= 0 && y >= 0 && x < GRID && y < GRID) cell[y][x] = u;
  const hq = units.find((u) => u.b.t === 'hq');
  const towers = units.filter((u) => u.B.kind === 'tower'), barracks = units.filter((u) => u.B.kind === 'spawner');

  // tower pressure per cell (for path costs): how much fire a cell is under
  const heat = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  const recomputeHeat = () => {
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      let h = 0;
      for (const t of towers) if (!t.dead && Math.hypot(x + 0.5 - t.cx, y + 0.5 - t.cy) <= t.B.range(t.b.l)) h += t.b.l;
      heat[y][x] = h;
    }
  };
  recomputeHeat();

  // Dijkstra from the HQ outward: dist[y][x] = cost to reach the HQ from (x,y); squads step downhill
  let dist = null;
  const stepCost = (x, y, n) => {
    const u = cell[y][x];
    let c = 1 + heat[y][x] * 0.35;
    if (u && !u.dead && u !== hq) c += u.B.kind === 'trap' ? 3 + n * 0.05 : u.hp / 6;
    return c;
  };
  const route = () => {
    const D = Array.from({ length: GRID }, () => Array(GRID).fill(Infinity));
    const open = [];
    if (!hq || hq.dead) return D;
    for (const [x, y] of cellsOf(hq.b)) { D[y][x] = 0; open.push([0, x, y]); }
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, x, y] = open.splice(bi, 1)[0];
      if (d > D[y][x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const nd = d + stepCost(x, y, 40);
        if (nd < D[ny][nx]) { D[ny][nx] = nd; open.push([nd, nx, ny]); }
      }
    }
    dist = D; return D;
  };
  route();

  // squads: entry columns spread across the front, released in waves
  const F = Math.max(1, Math.round(attack.figures));
  const K = attack.squads || Math.max(2, Math.min(5, Math.round(F / 45)));
  const squads = [];
  for (let i = 0; i < K; i++) {
    const col = Math.max(0, Math.min(GRID - 1, Math.floor(R() * GRID)));
    squads.push({ x: col + 0.5, y: -0.5, n: Math.floor(F / K) + (i < F % K ? 1 : 0), t0: i * 2.5 + R() * 1.5, slow: 0, gates: new Set(), cx: col, cy: -1, path: null, done: false, sent: 0 });
  }
  const totalSent = F;
  let t = 0, killedByTowers = 0, killedByRed = 0, divided = 0, hqDmg = 0, spentOnBuildings = 0;
  const destroyed = [];
  const events = [];

  const nextCell = (s) => {
    // from the current cell, the neighbour with the lowest distance-to-HQ
    let best = null, bd = Infinity;
    const cx = s.cx, cy = s.cy;
    if (cy < 0) { // still outside: enter the front row in the same column
      return [cx, 0];
    }
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const d = dist[ny][nx]; if (d < bd) { bd = d; best = [nx, ny]; }
    }
    return best;
  };

  while (t < T_MAX) {
    t += DT;
    const alive = squads.filter((s) => !s.done && s.n > 0 && t >= s.t0);
    const pendingSquads = squads.some((s) => !s.done && s.n > 0 && t < s.t0);
    if (!alive.length && !pendingSquads) break;
    if (hq.dead) break;
    // squads act
    for (const s of alive) {
      const nc = nextCell(s); if (!nc) { s.done = true; continue; }
      const [nx, ny] = nc, u = cell[ny][nx];
      if (u && !u.dead && u.B.kind !== 'trap') {
        // blocked: hit it (adjacent), figures are spent 1:1 against its HP
        const hit = Math.min(s.n, u.hp, HIT_RATE * DT * (1 + s.n / 60));
        s.n -= hit; u.hp -= hit;
        if (u === hq) hqDmg += hit; else spentOnBuildings += hit;
        if (u.hp <= 0.01) {
          u.dead = true; u.hp = 0; destroyed.push(u.b.id);
          events.push({ t: +t.toFixed(1), type: 'destroyed', id: u.b.id, bt: u.b.t });
          if (u === hq) break;
          if (u.B.kind === 'tower') recomputeHeat();
          route();
        }
        continue;
      }
      // walk toward the next cell centre
      const tx = nx + 0.5, ty = ny + 0.5, dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
      const v = SPEED * (1 - s.slow) * DT;
      if (d <= v) {
        s.x = tx; s.y = ty; s.cx = nx; s.cy = ny;
        if (u && !u.dead && u.B.kind === 'trap' && !s.gates.has(u.b.id)) {
          s.gates.add(u.b.id);
          const g = u.B.op(u.b.l), before = s.n;
          s.n = Math.max(0, Math.floor(s.n / g.v) - (g.sub || 0));
          divided += before - s.n;
          events.push({ t: +t.toFixed(1), type: 'gate', id: u.b.id, from: Math.round(before), to: s.n });
        }
      } else { s.x += (dx / d) * v; s.y += (dy / d) * v; }
      s.slow = 0;
    }
    if (hq.dead) break;
    // towers fire
    const live = squads.filter((s) => !s.done && s.n > 0 && t >= s.t0 && s.y > -0.6);
    for (const tw of towers) {
      if (tw.dead || !live.length) continue;
      const lv = tw.b.l, rg = tw.B.range(lv);
      const inR = live.filter((s) => s.n > 0 && Math.hypot(s.x - tw.cx, s.y - tw.cy) <= rg);
      if (!inR.length) continue;
      if (tw.b.t === 'gelo') {
        for (const s of inR) s.slow = Math.max(s.slow, tw.B.slow(lv));
        tw.acc += tw.B.dps(lv) * DT;
        const k = Math.floor(tw.acc); if (k > 0) { tw.acc -= k; const s = inR[0]; const kk = Math.min(k, s.n); s.n -= kk; killedByTowers += kk; }
      } else if (tw.b.t === 'mortaio') {
        tw.cd -= DT;
        if (tw.cd <= 0) { tw.cd = tw.B.reload(lv); const s = inR.reduce((a, b) => (b.n > a.n ? b : a)); const kk = Math.min(s.n, tw.B.splash(lv)); s.n -= kk; killedByTowers += kk; }
      } else {
        tw.acc += tw.B.dps(lv) * DT;
        const k = Math.floor(tw.acc);
        if (k > 0) { tw.acc -= k; const s = inR.reduce((a, b) => (b.y > a.y ? b : a)); const kk = Math.min(k, s.n); s.n -= kk; killedByTowers += kk; }
      }
    }
    // barracks: red figures pile up and intercept squads in reach
    for (const br of barracks) {
      if (br.dead) continue;
      const lv = br.b.l;
      br.pool = Math.min(br.B.cap(lv), br.pool + br.B.rate(lv) * DT);
      const s = live.filter((q) => q.n > 0).sort((a, b) => Math.hypot(a.x - br.cx, a.y - br.cy) - Math.hypot(b.x - br.cx, b.y - br.cy))[0];
      if (s && Math.hypot(s.x - br.cx, s.y - br.cy) <= 3.5) {
        const k = Math.min(br.pool, s.n, 10 * DT * (1 + lv * 0.3));
        br.pool -= k; s.n -= k; killedByRed += k;
      }
    }
    for (const s of squads) if (s.n < 0.5 && t >= s.t0 && !s.done) { s.n = 0; s.done = true; }
  }

  // outcome: destruction weighted by the value of each building (trap gates can't be destroyed)
  let tot = 0, got = 0;
  for (const u of units) {
    if (u.B.kind === 'trap') continue;
    const w = investOf(u.b.t, u.b.l);
    tot += w; got += w * (u.dead ? 1 : Math.max(0, 1 - u.hp / u.max) * 0.5);
  }
  const pct = tot ? Math.min(1, got / tot) : 0;
  const hqDown = !!hq?.dead;
  const stars = (pct >= 0.5 ? 1 : 0) + (hqDown ? 1 : 0) + (pct >= 0.995 ? 1 : 0);
  return {
    pct, hqDown, stars, win: stars === 0, sent: totalSent,
    destroyed, damaged: units.filter((u) => !u.dead && u.hp < u.max && u.max > 0).map((u) => u.b.id),
    killedByTowers: Math.round(killedByTowers), killedByRed: Math.round(killedByRed), divided: Math.round(divided),
    hqDmg: Math.round(hqDmg), hqHp: hq ? Math.round(hq.max) : 0, spent: Math.round(spentOnBuildings),
    time: +t.toFixed(1), events,
  };
}

// Defence rating: the largest horde (in steps of 10) a layout holds without losing a star, over a few
// fixed seeds. Used to rate rival bases and to show the player how strong the defence is.
export function defenceRating(layout, seeds = [11, 23, 37]) {
  const holds = (f) => seeds.filter((s) => simulateAttack(layout, { figures: f, seed: s }).stars === 0).length >= Math.ceil(seeds.length / 2);
  // binary search on a 10-figure grid (holding is monotonic enough in the horde size)
  let lo = 0, hi = 2400;
  if (!holds(20)) return 0;
  if (holds(hi)) return hi;
  lo = 20;
  while (hi - lo > 10) { const m = Math.round((lo + hi) / 20) * 10; if (holds(m)) lo = m; else hi = m; }
  return lo;
}
