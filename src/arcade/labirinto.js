// Labirinto Goloso — maze chaser simulation (pure logic). Gnam, a little round green dragon, eats the
// sugared almonds (confetti) of a pastry-shop maze while four wasps hunt him, each in its own way:
//   Pungiglione follows Gnam's scent trail (the tiles he walked on, freshest first)
//   Ronzella patrols her quarter of the maze and charges when she sees Gnam down a corridor
//   Golosa guards the almonds Gnam is heading for (the one nearest to him)
//   Specchietta mirrors Gnam through the centre of the maze and pounces when close
// Every ~20 s the hive alarm ("Sciame!") sends them all straight at Gnam for a few seconds.
// A chili pepper (peperoncino) sets Gnam on fire: wasps flee, slow, and can be toasted.
// Mazes come from a seeded mirrored generator: braided (no dead ends), a nest in the middle, one tunnel.
import { rng } from './rng.js';

export const MW = 19, MH = 21;
export const NEST = { door: [9, 9], inside: [9, 10], out: [9, 8] };
export const HERO_START = [9, 13], BONUS_AT = [9, 12], TUNNEL_Y = 7;
export const ENEMIES = [
  { id: 'pungiglione', name: 'Pungiglione', color: '#ff3b4f', ai: 'scent', release: 0 },
  { id: 'ronzella', name: 'Ronzella', color: '#ff7ad9', ai: 'patrol', release: 2.5 },
  { id: 'golosa', name: 'Golosa', color: '#ff9f1c', ai: 'guard', release: 6 },
  { id: 'specchietta', name: 'Specchietta', color: '#33e1ff', ai: 'mirror', release: 9.5 },
  { id: 'zigzag', name: 'Zigzag', color: '#c7ff3d', ai: 'zig', release: 13 },
];
export const BONUSES = [
  { id: 'bigne', name: 'Bignè', pts: 100 }, { id: 'cannolo', name: 'Cannolo', pts: 300 }, { id: 'cassata', name: 'Cassatina', pts: 500 },
  { id: 'gelato', name: 'Gelato', pts: 700 }, { id: 'torta', name: 'Torta', pts: 1000 }, { id: 'babà', name: 'Babà', pts: 2000 },
  { id: 'panettone', name: 'Panettone', pts: 3000 }, { id: 'tiramisu', name: 'Tiramisù', pts: 5000 },
];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up (y-1), right, down, left — y grows downwards in the maze

// cell values: 0 corridor, 1 wall, 2 nest interior, 3 nest door
export function genMaze(seed) {
  const r = rng(seed), W = MW, H = MH, g = new Uint8Array(W * H).fill(1);
  const at = (x, y) => g[y * W + x];
  const set = (x, y, v) => { g[y * W + x] = v; g[y * W + (W - 1 - x)] = v; };
  // perfect maze on the left half (odd cells, x 1..9), then mirrored
  const seen = new Set(), st = [[9, 19]]; seen.add('9,19'); set(9, 19, 0);
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const nb = DIRS.map(([dx, dy]) => [x + dx * 2, y + dy * 2, x + dx, y + dy]).filter(([nx, ny]) => nx >= 1 && nx <= 9 && ny >= 1 && ny <= H - 2 && !seen.has(nx + ',' + ny));
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny, wx, wy] = nb[Math.floor(r() * nb.length)];
    set(wx, wy, 0); set(nx, ny, 0); seen.add(nx + ',' + ny); st.push([nx, ny]);
  }
  // extra loops: knock a few random walls between cells so the maze has many routes
  for (let k = 0; k < 14; k++) {
    const x = 1 + 2 * Math.floor(r() * 5), y = 1 + 2 * Math.floor(r() * 10), [dx, dy] = DIRS[Math.floor(r() * 4)];
    const wx = x + dx, wy = y + dy, nx = x + dx * 2, ny = y + dy * 2;
    if (nx >= 1 && nx <= W - 2 && ny >= 1 && ny <= H - 2 && wx <= 9) set(wx, wy, 0);
  }
  // nest and the ring corridor around it
  for (let y = 8; y <= 12; y++) for (let x = 6; x <= 9; x++) set(x, y, 0);
  for (let x = 7; x <= 9; x++) { set(x, 9, 1); set(x, 11, 1); }
  set(7, 10, 1); set(8, 10, 2); set(9, 10, 2); set(9, 9, 3);
  // tunnel through the side walls
  set(0, TUNNEL_Y, 0); set(1, TUNNEL_Y, 0);
  // braid: no dead ends (symmetric fixes)
  const isOpen = (x, y) => { if (x < 0 || x >= W) return y === TUNNEL_Y; if (y < 0 || y >= H) return false; return at(x, y) === 0; };
  for (let pass = 0; pass < 4; pass++) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x <= 9; x++) {
      if (at(x, y) !== 0) continue;
      const n = DIRS.filter(([dx, dy]) => isOpen(x + dx, y + dy)).length;
      if (n >= 2) continue;
      const cand = DIRS.map(([dx, dy]) => [x + dx, y + dy, x + dx * 2, y + dy * 2]).filter(([wx, wy, bx, by]) => wx >= 1 && wx <= W - 2 && wy >= 1 && wy <= H - 2 && at(wx, wy) === 1 && !(wy >= 9 && wy <= 11 && wx >= 7 && wx <= 11) && bx >= 0 && bx < W && by >= 0 && by < H && at(bx, by) === 0);
      const pick = cand.length ? cand[Math.floor(r() * cand.length)] : null;
      if (pick) set(pick[0], pick[1], 0);
    }
  }
  return g;
}
export function mazeInfo(g) {
  const W = MW, H = MH, open = [], deadEnds = [];
  const ok = (x, y) => { if (x < 0 || x >= W) return y === TUNNEL_Y; if (y < 0 || y >= H) return false; return g[y * W + x] === 0; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] === 0) { open.push([x, y]); if (DIRS.filter(([dx, dy]) => ok(x + dx, y + dy)).length < 2) deadEnds.push([x, y]); }
  // flood from the hero start
  const seen = new Uint8Array(W * H), q = [HERO_START];
  seen[HERO_START[1] * W + HERO_START[0]] = 1;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of DIRS) { let nx = x + dx; const ny = y + dy; if (nx < 0) nx = W - 1; if (nx >= W) nx = 0; if (ny < 0 || ny >= H || !ok(nx, ny) || seen[ny * W + nx]) continue; seen[ny * W + nx] = 1; q.push([nx, ny]); } }
  const unreachable = open.filter(([x, y]) => !seen[y * W + x]);
  let sym = true; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] !== g[y * W + W - 1 - x]) sym = false;
  return { open: open.length, deadEnds, unreachable, sym };
}

export class LabirintoSim {
  constructor(o = {}) {
    this.o = { seed: 1, level: 1, lives: 3, extraEnemy: 0, powerMul: 1, speedMul: 1, scoreMul: 1, god: false, ...o };
    this.r = rng(this.o.seed ^ 0x51ed);
    this.W = MW; this.H = MH; this.time = 0; this.score = 0; this.lives = this.o.lives; this.level = this.o.level; this.events = []; this.over = false; this.result = null;
    this.input = { want: null }; this.auto = false; this.levelsCleared = 0; this.eatenEnemies = 0; this.bonusGot = 0; this.extraGiven = false;
    this.loadLevel();
  }
  ev(k, x, y, extra) { this.events.push({ k, x, y, ...extra }); }
  loadLevel() {
    this.maze = genMaze(this.o.seed * 131 + this.level * 7);
    this.dots = new Uint8Array(MW * MH); // 1 almond, 2 chili
    this.dotsLeft = 0;
    for (let y = 0; y < MH; y++) for (let x = 1; x < MW - 1; x++) if (this.maze[y * MW + x] === 0 && !(x === HERO_START[0] && y === HERO_START[1])) { this.dots[y * MW + x] = 1; this.dotsLeft++; }
    for (const [x, y] of [[1, 1], [MW - 2, 1], [1, MH - 2], [MW - 2, MH - 2]]) if (this.maze[y * MW + x] === 0) this.dots[y * MW + x] = 2;
    this.dotsTotal = this.dotsLeft; this.eatenThisLevel = 0;
    this.scent = new Float32Array(MW * MH).fill(-99);
    this.bonus = null; this.bonusN = 0;
    this.resetActors();
    this.state = 'ready'; this.stateT = 0;
    this.ev('level', 9, 10, { n: this.level });
  }
  resetActors() {
    const lv = this.level, sm = this.o.speedMul;
    this.hero = { x: HERO_START[0], y: HERO_START[1], dx: -1, dy: 0, sp: Math.min(7.6, 6.0 + lv * 0.12) * sm, fire: 0, mouth: 0, alive: true };
    const n = 4 + Math.min(1, this.o.extraEnemy);
    this.enemies = ENEMIES.slice(0, n).map((d, i) => ({ ...d, i, x: i === 0 ? NEST.out[0] : 8 + (i % 2), y: i === 0 ? NEST.out[1] : NEST.inside[1], dx: -1, dy: 0, state: i === 0 ? 'hunt' : 'home', release: d.release * Math.max(0.4, 1 - lv * 0.06), sp: Math.min(7.2, 5.4 + lv * 0.14) * sm, chase: 0, wp: 0, bob: i }));
    this.alarm = 0; this.alarmT = 16; this.combo = 0;
  }
  passable(x, y, e) {
    if (x < 0 || x >= MW) return y === TUNNEL_Y;
    if (y < 0 || y >= MH) return false;
    const v = this.maze[y * MW + x];
    if (v === 0) return true;
    if (!e) return false;
    return (v === 2 || v === 3) && (e.state === 'eyes' || e.state === 'leave');
  }
  bfs(tx, ty, e) {
    const d = new Int16Array(MW * MH).fill(-1), q = [tx, ty]; let h = 0;
    tx = (tx + MW) % MW; d[ty * MW + tx] = 0;
    while (h < q.length) {
      const x = q[h++], y = q[h++], k = d[y * MW + x];
      for (const [dx, dy] of DIRS) { let nx = x + dx; const ny = y + dy; if (!this.passable(nx, ny, e)) continue; nx = (nx + MW) % MW; if (d[ny * MW + nx] >= 0) continue; d[ny * MW + nx] = k + 1; q.push(nx, ny); }
    }
    return d;
  }
  step(dt) {
    if (this.over) return;
    const sub = Math.max(1, Math.ceil(dt * 120)), h = dt / sub;
    for (let i = 0; i < sub && !this.over; i++) this.tick(h);
  }
  tick(dt) {
    this.time += dt; this.stateT += dt;
    if (this.state === 'ready') { if (this.stateT > 1.6) { this.state = 'play'; this.stateT = 0; } return; }
    if (this.state === 'dying') { if (this.stateT > 1.6) this.afterDeath(); return; }
    if (this.state === 'clear') { if (this.stateT > 2) { this.level++; this.levelsCleared++; this.loadLevel(); } return; }
    const H = this.hero;
    if (this.auto) this.autopilot();
    // hive alarm cycle
    if (this.alarm > 0) { this.alarm -= dt; if (this.alarm <= 0) this.alarmT = Math.max(11, 20 - this.level); }
    else { this.alarmT -= dt; if (this.alarmT <= 0 && H.fire <= 0) { this.alarm = Math.min(7, 4 + this.level * 0.3); this.ev('alarm', H.x, H.y); for (const e of this.enemies) if (e.state === 'hunt') { e.dx = -e.dx; e.dy = -e.dy; } } }
    if (H.fire > 0) { H.fire -= dt; if (H.fire <= 0) { for (const e of this.enemies) if (e.state === 'scared') e.state = 'hunt'; this.ev('cool', H.x, H.y); } }
    this.moveHero(dt);
    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.collide();
    if (this.bonus) { this.bonus.t -= dt; if (this.bonus.t <= 0) this.bonus = null; }
  }
  // generic tile mover: returns true at every tile centre reached so the caller can steer
  advance(a, dist, onCentre) {
    let guard = 0;
    while (dist > 1e-6 && guard++ < 8) {
      const cx = Math.round(a.x), cy = Math.round(a.y);
      const atC = Math.abs(a.x - cx) < 1e-4 && Math.abs(a.y - cy) < 1e-4;
      if (atC) { a.x = cx; a.y = cy; onCentre(cx, cy); if (!a.dx && !a.dy) return; const nx = cx + a.dx, ny = cy + a.dy; if (!this.passable(nx, ny, a.state ? a : null)) { a.stopped = true; return; } }
      a.stopped = false;
      // distance to the next centre along the direction
      const tx = a.dx ? (a.dx > 0 ? Math.floor(a.x + 1e-4) + 1 : Math.ceil(a.x - 1e-4) - 1) : a.x, ty = a.dy ? (a.dy > 0 ? Math.floor(a.y + 1e-4) + 1 : Math.ceil(a.y - 1e-4) - 1) : a.y;
      const left = Math.abs(tx - a.x) + Math.abs(ty - a.y), m = Math.min(left, dist);
      a.x += a.dx * m; a.y += a.dy * m; dist -= m;
      if (a.x < -0.5) a.x += MW; if (a.x > MW - 0.5) a.x -= MW;
      if (m >= left - 1e-6) { a.x = Math.round(a.x); a.y = Math.round(a.y); if (a.x >= MW) a.x -= MW; if (a.x < 0) a.x += MW; }
    }
  }
  moveHero(dt) {
    const H = this.hero, w = this.input.want;
    // reversing is allowed any time
    if (w && w[0] === -H.dx && w[1] === -H.dy && (H.dx || H.dy)) { H.dx = w[0]; H.dy = w[1]; }
    const inTunnel = H.y === TUNNEL_Y && (H.x < 1.5 || H.x > MW - 2.5);
    const sp = H.sp * (H.fire > 0 ? 1.08 : 1) * (inTunnel ? 0.9 : 1);
    H.mouth += dt * 10;
    this.advance(H, sp * dt, (x, y) => {
      if (this.auto) this.autopilot();
      const w = this.input.want;
      if (w && this.passable(x + w[0], y + w[1])) { H.dx = w[0]; H.dy = w[1]; }
      this.scent[y * MW + ((x + MW) % MW)] = this.time;
      this.eat(x, y);
    });
  }
  eat(x, y) {
    x = (x + MW) % MW; const k = y * MW + x, d = this.dots[k];
    if (!d) return;
    this.dots[k] = 0; this.dotsLeft--;
    if (d === 1) { this.addScore(10); this.ev('dot', x, y); }
    else {
      const dur = Math.max(2, 7.5 - this.level * 0.45) * this.o.powerMul;
      this.hero.fire = dur; this.combo = 0; this.addScore(50); this.alarm = 0;
      for (const e of this.enemies) if (e.state === 'hunt') { e.state = 'scared'; e.dx = -e.dx; e.dy = -e.dy; }
      this.ev('chili', x, y, { dur });
    }
    this.eatenThisLevel++;
    const n = this.eatenThisLevel;
    if ((n === 60 || n === 150) && !this.bonus) { const b = BONUSES[Math.min(BONUSES.length - 1, this.level - 1 + this.bonusN)]; this.bonus = { ...b, x: BONUS_AT[0], y: BONUS_AT[1], t: 9.5 }; this.bonusN++; this.ev('bonusup', BONUS_AT[0], BONUS_AT[1], { id: b.id }); }
    if (this.dotsLeft <= 0) { this.state = 'clear'; this.stateT = 0; this.addScore(1000 + this.level * 200); this.ev('clear', 9, 10, { n: this.level }); }
  }
  addScore(v) {
    const before = this.score; this.score += Math.round(v * this.o.scoreMul);
    if (!this.extraGiven && before < 10000 && this.score >= 10000) { this.extraGiven = true; this.lives++; this.ev('extra', this.hero.x, this.hero.y); }
  }
  target(e) {
    const H = this.hero, hx = Math.round(H.x), hy = Math.round(H.y);
    if (this.alarm > 0) return [hx, hy];
    switch (e.ai) {
      case 'scent': return null; // handled in choose()
      case 'patrol': {
        const Q = [[[1, 1], [8, 1], [8, 7], [1, 7]], [[10, 1], [17, 1], [17, 7], [10, 7]], [[1, 13], [8, 13], [8, 19], [1, 19]], [[10, 13], [17, 13], [17, 19], [10, 19]]][e.i % 4];
        if (e.chase > 0) return [hx, hy];
        const wp = Q[e.wp % 4];
        if (Math.abs(e.x - wp[0]) + Math.abs(e.y - wp[1]) < 2.5) e.wp++;
        return this.nearestOpen(Q[e.wp % 4]);
      }
      case 'guard': {
        let best = null, bd = 1e9;
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (this.dots[y * MW + x]) { const d = (x - hx - H.dx * 3) ** 2 + (y - hy - H.dy * 3) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
        return best || [hx, hy];
      }
      case 'mirror': {
        if (Math.abs(e.x - H.x) + Math.abs(e.y - H.y) < 5) return [hx, hy];
        return this.nearestOpen([MW - 1 - hx, MH - 1 - hy]);
      }
      default: return this.r() < 0.5 ? [hx, hy] : null;
    }
  }
  nearestOpen([x, y]) {
    x = Math.max(0, Math.min(MW - 1, x)); y = Math.max(0, Math.min(MH - 1, y));
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && this.maze[ny * MW + nx] === 0) return [nx, ny]; }
    return [x, y];
  }
  lineOfSight(e, maxD = 8) {
    const H = this.hero, ex = Math.round(e.x), ey = Math.round(e.y), hx = Math.round(H.x), hy = Math.round(H.y);
    if (ex !== hx && ey !== hy) return false;
    const n = Math.abs(ex - hx) + Math.abs(ey - hy); if (n > maxD) return false;
    const sx = Math.sign(hx - ex), sy = Math.sign(hy - ey);
    for (let i = 1; i < n; i++) if (!this.passable(ex + sx * i, ey + sy * i)) return false;
    return true;
  }
  moveEnemy(e, dt) {
    e.bob += dt;
    if (e.state === 'home') {
      e.release -= dt; e.y = NEST.inside[1] + Math.sin(e.bob * 5) * 0.2;
      if (e.release <= 0) { e.state = 'leave'; e.x = Math.round(e.x); }
      return;
    }
    if (e.state === 'leave') {
      // slide to the door column, then up and out
      const sp = 3 * dt;
      if (Math.abs(e.x - NEST.door[0]) > 0.01) e.x += Math.sign(NEST.door[0] - e.x) * Math.min(sp, Math.abs(NEST.door[0] - e.x));
      else { e.y -= sp; if (e.y <= NEST.out[1]) { e.y = NEST.out[1]; e.x = NEST.out[0]; e.state = this.hero.fire > 0 ? 'scared' : 'hunt'; e.dx = this.r() < 0.5 ? -1 : 1; e.dy = 0; } }
      return;
    }
    if (e.state === 'enter') {
      e.y += 6 * dt; if (e.y >= NEST.inside[1]) { e.y = NEST.inside[1]; e.state = 'home'; e.release = 1.2; }
      return;
    }
    if (e.ai === 'patrol' && e.state === 'hunt') { if (this.lineOfSight(e)) { if (e.chase <= 0) this.ev('spot', e.x, e.y, { id: e.id }); e.chase = 4; } else e.chase -= dt; }
    const inTunnel = e.y === TUNNEL_Y && (e.x < 2.5 || e.x > MW - 3.5);
    let sp = e.sp * (inTunnel ? 0.55 : 1);
    if (e.state === 'scared') sp *= 0.55; else if (e.state === 'eyes') sp = 13; else if (this.alarm > 0) sp *= 1.08; else if (e.ai === 'patrol' && e.chase > 0) sp *= 1.05; else sp *= 0.92;
    this.advance(e, sp * dt, (x, y) => {
      if (e.state === 'eyes' && x === NEST.out[0] && y === NEST.out[1]) { e.state = 'enter'; e.dx = 0; e.dy = 0; return; }
      this.choose(e, x, y);
    });
  }
  choose(e, x, y) {
    const opts = DIRS.filter(([dx, dy]) => this.passable(x + dx, y + dy, e) && !(dx === -e.dx && dy === -e.dy) && !(e.state !== 'eyes' && this.maze[(y + dy) * MW + ((x + dx + MW) % MW)] === 3));
    if (!opts.length) { e.dx = -e.dx; e.dy = -e.dy; return; }
    const nxt = ([dx, dy]) => [(x + dx + MW) % MW, y + dy];
    let pick = null;
    if (e.state === 'eyes') { const d = this.bfs(NEST.out[0], NEST.out[1], e); pick = opts.reduce((a, o) => { const [nx, ny] = nxt(o); const v = d[ny * MW + nx]; return !a || (v >= 0 && v < a.v) ? { o, v: v < 0 ? 999 : v } : a; }, null).o; }
    else if (e.state === 'scared') { const d = this.bfs(Math.round(this.hero.x), Math.round(this.hero.y)); const sc = opts.map((o) => { const [nx, ny] = nxt(o); return { o, v: d[ny * MW + nx] + this.r() * 2.5 }; }); pick = sc.sort((a, b) => b.v - a.v)[0].o; }
    else {
      let tg = this.target(e);
      if (e.ai === 'scent' && this.alarm <= 0) {
        // the freshest footprint next to it, if Gnam walked here in the last 9 s
        let bs = -1; for (const o of opts) { const [nx, ny] = nxt(o); const s = this.scent[ny * MW + nx]; if (s > this.time - 9 && s > bs) { bs = s; pick = o; } }
        if (!pick) tg = [Math.round(this.hero.x), Math.round(this.hero.y)];
      }
      if (!pick && tg) { const d = this.bfs(tg[0], tg[1]); let bv = 1e9; for (const o of opts) { const [nx, ny] = nxt(o); const v = d[ny * MW + nx]; const vv = v < 0 ? 999 : v; if (vv < bv) { bv = vv; pick = o; } } }
      if (!pick) pick = opts[Math.floor(this.r() * opts.length)];
    }
    e.dx = pick[0]; e.dy = pick[1];
  }
  collide() {
    const H = this.hero;
    for (const e of this.enemies) {
      if (e.state === 'home' || e.state === 'leave' || e.state === 'enter' || e.state === 'eyes') continue;
      let dx = Math.abs(e.x - H.x); dx = Math.min(dx, MW - dx);
      if (dx + Math.abs(e.y - H.y) > 0.6) continue;
      if (e.state === 'scared') {
        e.state = 'eyes'; this.combo++; this.eatenEnemies++;
        const pts = 200 * 2 ** Math.min(3, this.combo - 1); this.addScore(pts); this.ev('toast', e.x, e.y, { pts, id: e.id });
      } else if (!this.o.god) { this.die(); return; }
    }
    if (this.bonus && Math.abs(this.bonus.x - H.x) + Math.abs(this.bonus.y - H.y) < 0.6) { this.addScore(this.bonus.pts); this.bonusGot++; this.ev('bonus', this.bonus.x, this.bonus.y, { pts: this.bonus.pts, id: this.bonus.id }); this.bonus = null; }
  }
  die() {
    this.state = 'dying'; this.stateT = 0; this.lives--; this.hero.alive = false;
    this.ev('die', this.hero.x, this.hero.y, { left: this.lives });
  }
  afterDeath() {
    if (this.lives <= 0) { this.finish(false); return; }
    this.resetActors(); this.state = 'ready'; this.stateT = 0;
  }
  finish(win) {
    if (this.over) return;
    this.over = true;
    this.result = { game: 'labirinto', score: this.score, win, level: this.level, cleared: this.levelsCleared, toasted: this.eatenEnemies, bonuses: this.bonusGot, time: Math.round(this.time) };
    this.ev('end', 9, 10, { win });
  }
  // pilot for tests / demo: BFS to the nearest almond, keeping clear of hunting wasps
  autopilot() {
    const H = this.hero;
    // plan from the tile the hero is about to reach (deciding mid-tile flip-flops on ties)
    const hx = (H.dx > 0 ? Math.ceil(H.x - 1e-4) : H.dx < 0 ? Math.floor(H.x + 1e-4) : Math.round(H.x) + MW) % MW, hy = H.dy > 0 ? Math.ceil(H.y - 1e-4) : H.dy < 0 ? Math.floor(H.y + 1e-4) : Math.round(H.y);
    if ((H.dx || H.dy) && !H.stopped && this.dots[hy * MW + hx]) { this.input.want = [H.dx, H.dy]; return; }
    const danger = new Set();
    for (const e of this.enemies) if (e.state === 'hunt') { const ex = Math.round(e.x), ey = Math.round(e.y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) danger.add((ey + dy) * MW + ((ex + dx + MW) % MW)); }
    const prev = new Int32Array(MW * MH).fill(-1), q = [hy * MW + hx]; prev[q[0]] = q[0];
    let goal = -1;
    const scared = this.enemies.filter((e) => e.state === 'scared');
    for (let h = 0; h < q.length && goal < 0; h++) {
      const k = q[h], x = k % MW, y = (k / MW) | 0;
      if (k !== q[0] && (this.dots[k] || (scared.some((e) => Math.round(e.x) === x && Math.round(e.y) === y)) || (this.bonus && this.bonus.x === x && this.bonus.y === y))) { goal = k; break; }
      for (const [dx, dy] of DIRS) { let nx = x + dx; const ny = y + dy; if (!this.passable(nx, ny)) continue; nx = (nx + MW) % MW; const nk = ny * MW + nx; if (prev[nk] >= 0 || (danger.has(nk) && !this.o.god)) continue; prev[nk] = k; q.push(nk); }
    }
    if (goal < 0) { // boxed in: move away from the closest wasp
      const opts = DIRS.filter(([dx, dy]) => this.passable(hx + dx, hy + dy));
      const e = this.enemies.filter((q2) => q2.state === 'hunt').sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy))[0];
      if (e && opts.length) { const o = opts.sort((a, b) => Math.hypot(hx + b[0] - e.x, hy + b[1] - e.y) - Math.hypot(hx + a[0] - e.x, hy + a[1] - e.y))[0]; this.input.want = o; }
      return;
    }
    let k = goal; while (prev[k] !== q[0]) k = prev[k];
    const nx = k % MW, ny = (k / MW) | 0; let dx = nx - hx; if (dx > 1) dx = -1; if (dx < -1) dx = 1;
    this.input.want = [dx, ny - hy];
  }
}
