// Rimbalzo — brick breaker simulation (pure logic). 48 levels: 12 drawn by hand (mirrored halves) and
// 36 from the seeded generator, plus an endless generated mode. Every level is checked for
// solvability: each breakable brick must be reachable through non-metal cells from the open field.
// Field: W x H units, y up; bricks on a 13-column grid near the top, paddle at the bottom.
import { rng, clamp, hitCB } from './rng.js';

export const W = 104, H = 150, COLS = 13, BW = 8, BH = 4, TOP = H - 14, ROWS = 18;
export const PADDLE_Y = 10;
export const CAPS = {
  multi: { name: 'Multipalla', color: '#36e0ff', good: true },
  largo: { name: 'Racchetta larga', color: '#3dffb0', good: true },
  stretto: { name: 'Racchetta stretta', color: '#ff5a5a', good: false },
  laser: { name: 'Laser', color: '#ff4fd8', good: true },
  colla: { name: 'Colla', color: '#ffe14d', good: true },
  lento: { name: 'Rallenta', color: '#7d8cff', good: true },
  fuoco: { name: 'Palla di fuoco', color: '#ff8a1f', good: true },
  vita: { name: 'Vita extra', color: '#ffffff', good: true },
};
const CAP_LIST = ['multi', 'multi', 'largo', 'largo', 'laser', 'colla', 'lento', 'fuoco', 'stretto', 'vita'];

// hand-made levels: left half + centre column (7 chars), mirrored to 13
const sym = (h) => h + [...h.slice(0, 6)].reverse().join('');
const HAND = [
  { name: 'Primo rimbalzo', rows: ['.......', '..11111', '..11111', '..22222', '..11111'] },
  { name: 'Piramide', rows: ['......1', '.....12', '....123', '...1222', '..111*1', '.111111'] },
  { name: 'Scacchiera', rows: ['1.1.1.1', '.2.2.2.', '1.1.1*1', '.2.2.2.', '1.1.1.1', '.3.3.3.'] },
  { name: 'Ponti', rows: ['MMM....', '1111111', '2222...', '1111.*.', '....MMM', '3333333'] },
  { name: 'Cuore', rows: ['.......', '.22...2', '2112.21', '21111*1', '2111111', '.211111', '..21111', '...2111', '....211', '.....21', '......2'] },
  { name: 'Fortezza', rows: ['1111111', '1MMMMMM', '1M22222', '1M2X2X2', '1M22*22', '1M.....', '1......'] },
  { name: 'Onde', rows: ['1.....3', '21...32', '.21.32.', '..2X2..', '.12.21.', '12...21', '2.....1'] },
  { name: 'Polveriera', rows: ['2222222', '2X2X2X2', '2222222', '.......', '1X1X1X1', '1111111'] },
  { name: 'Colonnato', rows: ['3.3.3.3', '3.3.3.3', '2.2*2.2', '2.2.2.2', '1.1.1.1', '1.1.1.1', 'M.M.M.M'] },
  { name: 'Occhio', rows: ['..33333', '.322222', '3221111', '32113X3', '3221111', '.322222', '..33333'] },
  { name: 'Corridoi', rows: ['3333333', '2MM.MM.', '2222222', '.......', 'X1X1X*X', '1111111', 'M..M..M'] },
  { name: 'Gran finale', rows: ['3333333', '3X3X3X3', '2222222', '2*2*2*2', '1111111', 'MM.MM.M', '1111111', '3333333'] },
];
export const LEVEL_COUNT = 48;

// cell codes: 0 empty, 1-3 hit points, 4 gold (5 hits), 8 metal, 9 explosive; bonus flag separately
const CH = { '.': 0, '1': 1, '2': 2, '3': 3, G: 4, M: 8, X: 9, '*': 1 };
export function parseRows(rows) {
  const cells = [];
  rows.forEach((row, r) => { const line = row.length === 7 ? sym(row) : row; for (let c = 0; c < COLS; c++) { const ch = line[c] || '.'; const v = CH[ch] ?? 0; if (v) cells.push({ c, r, v, bonus: ch === '*' }); } });
  return cells;
}
export const breakable = (v) => v > 0 && v !== 8;

// solvability: BFS from the open area under the grid through every non-metal cell
export function reachable(cells, rows = ROWS) {
  const g = new Map(cells.map((b) => [b.r * COLS + b.c, b]));
  const seen = new Set(), q = [];
  for (let c = 0; c < COLS; c++) q.push([rows, c]);
  while (q.length) {
    const [r, c] = q.pop(); const k = r * COLS + c;
    if (r < 0 || c < 0 || c >= COLS || r > rows || seen.has(k)) continue;
    const b = g.get(k); if (b && b.v === 8) continue;
    seen.add(k); q.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return cells.filter((b) => breakable(b.v)).every((b) => seen.has(b.r * COLS + b.c));
}
export function validate(cells) { return cells.some((b) => breakable(b.v)) && reachable(cells); }
// fixes unreachable layouts by turning metal into tough bricks until every brick is reachable
export function repair(cells) {
  let guard = 0;
  while (!reachable(cells) && guard++ < 60) { const m = cells.filter((b) => b.v === 8); if (!m.length) break; m[m.length - 1 - (guard % m.length)].v = 3; }
  if (!cells.some((b) => breakable(b.v))) cells.push({ c: 6, r: 3, v: 1, bonus: false });
  return cells;
}

// seeded generator: mirrored patterns from a few families, harder with difficulty d (0..1)
export function genLevel(seed, d = 0.5) {
  const r = rng(seed);
  const fam = r.pick(['blocchi', 'anelli', 'diagonali', 'rumore', 'colonne', 'diamante', 'strisce', 'isole']);
  const rows = 6 + Math.round(r() * 3 + d * 5), half = [];
  const hp = () => { const x = r(); return x < 0.12 + d * 0.25 ? 3 : x < 0.35 + d * 0.3 ? 2 : 1; };
  for (let y = 0; y < rows; y++) {
    const line = [];
    for (let x = 0; x < 7; x++) {
      let on = false;
      const cx = 6 - x, cy = y - rows / 2;
      switch (fam) {
        case 'blocchi': on = ((x >> 1) + (y >> 1)) % 2 === 0 || r() < 0.2; break;
        case 'anelli': { const q = Math.round(Math.hypot(cx * 0.9, cy * 1.6)); on = q % 2 === 0; break; }
        case 'diagonali': on = (x + y) % 3 !== 0; break;
        case 'rumore': on = r() < 0.62; break;
        case 'colonne': on = x % 2 === (y < 2 ? 1 : 0) || y === 0; break;
        case 'diamante': on = Math.abs(cx) + Math.abs(cy) * 1.4 < rows * 0.75; break;
        case 'strisce': on = y % 2 === 0 || x === 6; break;
        case 'isole': on = (x % 3 !== 2 && y % 3 !== 2); break;
      }
      let ch = '.';
      if (on) {
        const v = hp(); ch = String(v);
        const z = r();
        if (z < 0.04 + d * 0.06 && y > 0 && x >= 2 && half[y - 1][x] !== 'M' && line[x - 1] !== 'M') ch = 'M';
        else if (z < 0.1 + d * 0.05) ch = 'X';
        else if (z < 0.13 + d * 0.05) ch = '*';
        else if (z < 0.15 + d * 0.05 && d > 0.4) ch = 'G';
      }
      line.push(ch);
    }
    half.push(line.join(''));
  }
  // leave a couple of empty rows on top sometimes so balls can run behind the wall
  if (r() < 0.4) half.unshift('.......');
  const cells = repair(parseRows(half));
  return { name: `${FAM_NAME[fam]} ${1 + (seed % 97)}`, cells };
}
const FAM_NAME = { blocchi: 'Blocchi', anelli: 'Anelli', diagonali: 'Diagonali', rumore: 'Coriandoli', colonne: 'Colonne', diamante: 'Diamante', strisce: 'Strisce', isole: 'Isole' };

export function levelDef(n) { // 1-based
  if (n <= HAND.length) return { name: HAND[n - 1].name, cells: repair(parseRows(HAND[n - 1].rows)), hand: true };
  return genLevel(7919 * n + 13, clamp((n - 10) / 38, 0, 1));
}

export class RimbalzoSim {
  constructor(o = {}) {
    this.o = { seed: 1, level: 1, endless: false, daily: false, lives: 3, startBalls: 1, speedMul: 1, scoreMul: 1, dropMul: 1, noLose: false, maxLevels: 0, ...o };
    this.r = rng(this.o.seed);
    this.W = W; this.H = H; this.time = 0; this.score = 0; this.lives = this.o.lives; this.over = false; this.result = null; this.events = [];
    this.level = this.o.level; this.cleared = 0; this.bricksBroken = 0; this.maxCombo = 0;
    this.paddle = { x: W / 2, w: 18, tw: 18, vx: 0, wideT: 0, laserT: 0, glue: 0, fireT: 0, lastX: W / 2 };
    this.input = { ax: 0, px: null, launch: false };
    this.auto = false;
    this.loadLevel();
  }
  ev(k, x, y, extra) { this.events.push({ k, x, y, ...extra }); }
  loadLevel() {
    const L = this.o.endless || this.o.daily ? genLevel(this.o.seed * 31 + this.level * 977, clamp(0.25 + this.level * 0.06, 0, 1)) : levelDef(this.level);
    this.levelName = L.name;
    this.bricks = L.cells.map((b, i) => ({ ...b, id: i, hp: b.v === 4 ? 5 : b.v === 9 ? 1 : b.v === 8 ? 1e9 : b.v, x: b.c * BW + BW / 2, y: TOP - b.r * BH - BH / 2, alive: true, flash: 0 }));
    this.grid = new Map(this.bricks.map((b) => [b.r * COLS + b.c, b]));
    this.left = this.bricks.filter((b) => breakable(b.v)).length;
    this.balls = []; this.caps = []; this.shots = [];
    this.fire = 0; this.slow = 0; this.combo = 0; this.idle = 0;
    this.paddle.wideT = 0; this.paddle.laserT = 0; this.paddle.glue = 0; this.paddle.tw = 18;
    this.speed = 62 * this.o.speedMul;
    for (let i = 0; i < this.o.startBalls; i++) this.newBall(true, (i - (this.o.startBalls - 1) / 2) * 3);
    this.state = 'play'; this.stateT = 0;
    this.ev('level', W / 2, H / 2, { n: this.level, name: this.levelName });
  }
  newBall(stuck, off = 0) {
    const b = { x: this.paddle.x + off, y: PADDLE_Y + 2.8, vx: 0, vy: 0, r: 1.5, stuck, off, trail: [] };
    this.balls.push(b); return b;
  }
  launch(b) { b.stuck = false; const a = (this.r() - 0.5) * 0.6 + (b.off || 0) * 0.08; const sp = this.ballSpeed(); b.vx = Math.sin(a) * sp; b.vy = Math.cos(a) * sp; this.ev('launch', b.x, b.y); }
  ballSpeed() { return this.speed * (this.slow > 0 ? 0.7 : 1); }
  step(dt) {
    if (this.over) return;
    this.time += dt; this.stateT += dt;
    if (this.state === 'clear') { if (this.stateT > 1.8) this.nextLevel(); return; }
    const P = this.paddle, I = this.input;
    if (this.auto) this.autopilot();
    const prev = P.x;
    if (I.px != null) P.x += (I.px - P.x) * Math.min(1, dt * 30);
    P.x += clamp(I.ax, -1, 1) * 110 * dt;
    P.tw = P.wideT > 0 ? 28 : P.wideT < 0 ? 11 : 18;
    P.w += (P.tw - P.w) * Math.min(1, dt * 8);
    P.x = clamp(P.x, P.w / 2, W - P.w / 2);
    P.vx = (P.x - prev) / Math.max(dt, 1e-4);
    if (P.wideT > 0) P.wideT = Math.max(0, P.wideT - dt); else if (P.wideT < 0) P.wideT = Math.min(0, P.wideT + dt);
    this.fire = Math.max(0, this.fire - dt); this.slow = Math.max(0, this.slow - dt);
    if (P.laserT > 0) { P.laserT -= dt; P.fireT -= dt; if (P.fireT <= 0) { P.fireT = 0.32; this.shots.push({ x: P.x - P.w / 2 + 1.5, y: PADDLE_Y + 2 }, { x: P.x + P.w / 2 - 1.5, y: PADDLE_Y + 2 }); this.ev('laser', P.x, PADDLE_Y); } }
    if (P.glue > 0) P.glue -= dt;
    const launch = I.launch; I.launch = false;
    for (const b of this.balls) if (b.stuck) { b.x = P.x + b.off; b.y = PADDLE_Y + 2.8; if (launch || (this.auto && this.stateT > 0.6) || b.stuckT > 4) this.launch(b); b.stuckT = (b.stuckT || 0) + dt; }
    // balls, substepped
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]; if (b.stuck) continue;
      const sp = Math.hypot(b.vx, b.vy), n = Math.max(1, Math.ceil((sp * dt) / 0.6)), h = dt / n;
      for (let k = 0; k < n; k++) { if (this.moveBall(b, h)) { this.balls.splice(i, 1); break; } }
      b.trail.unshift(b.x, b.y); if (b.trail.length > 16) b.trail.length = 16;
    }
    // laser shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.y += 120 * dt;
      const c = Math.floor(s.x / BW), r = Math.floor((TOP - s.y) / BH), br = r >= 0 && r < ROWS ? this.grid.get(r * COLS + c) : null;
      if (br && br.alive) { this.hitBrick(br, 1); this.shots.splice(i, 1); continue; }
      if (s.y > H) this.shots.splice(i, 1);
    }
    // capsules
    for (let i = this.caps.length - 1; i >= 0; i--) {
      const c = this.caps[i]; c.y -= 24 * dt; c.t += dt;
      if (Math.abs(c.y - PADDLE_Y) < 2.6 && Math.abs(c.x - P.x) < P.w / 2 + 3) { this.caps.splice(i, 1); this.catchCap(c.type); continue; }
      if (c.y < -4) this.caps.splice(i, 1);
    }
    for (const br of this.bricks) if (br.flash > 0) br.flash -= dt;
    this.idle += dt;
    if (!this.balls.length) this.loseLife();
    if (this.left <= 0 && this.state === 'play') this.levelClear();
  }
  moveBall(b, h) {
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); this.ev('wall', b.x, b.y); }
    if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); this.ev('wall', b.x, b.y); }
    if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); this.ev('wall', b.x, b.y); }
    const P = this.paddle;
    if (b.vy < 0 && b.y - b.r < PADDLE_Y + 1.3 && b.y > PADDLE_Y - 2 && Math.abs(b.x - P.x) < P.w / 2 + b.r) {
      const u = clamp((b.x - P.x) / (P.w / 2), -1, 1), a = u * 1.1 + clamp(P.vx / 400, -0.2, 0.2);
      const sp = Math.min(this.ballSpeed() * 1.0, 118);
      b.vx = Math.sin(a) * sp; b.vy = Math.cos(a) * sp; b.y = PADDLE_Y + 1.3 + b.r;
      this.combo = 0;
      if (P.glue > 0) { b.stuck = true; b.off = b.x - P.x; b.stuckT = 0; }
      this.ev('paddle', b.x, b.y);
    }
    if (b.y < -4) {
      if (this.o.noLose) { b.y = 1; b.vy = Math.abs(b.vy); return false; }
      this.ev('drop', b.x, 0); return true;
    }
    // bricks around the ball
    const c0 = Math.floor((b.x - b.r) / BW), c1 = Math.floor((b.x + b.r) / BW), r0 = Math.floor((TOP - (b.y + b.r)) / BH), r1 = Math.floor((TOP - (b.y - b.r)) / BH);
    let best = null, bp = 0, bax = 0;
    for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) {
      const br = this.grid.get(r * COLS + c); if (!br || !br.alive) continue;
      if (!hitCB(b.x, b.y, b.r, br.x, br.y, BW / 2, BH / 2)) continue;
      const px = BW / 2 + b.r - Math.abs(b.x - br.x), py = BH / 2 + b.r - Math.abs(b.y - br.y);
      const pen = Math.min(px, py);
      if (!best || pen > bp) { best = br; bp = pen; bax = px < py ? 0 : 1; }
    }
    if (best) {
      const pass = this.fire > 0 && best.v !== 8;
      if (!pass) {
        if (bax === 0) { b.vx = b.x < best.x ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += (b.x < best.x ? -1 : 1) * bp; }
        else { b.vy = b.y < best.y ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += (b.y < best.y ? -1 : 1) * bp; }
      }
      this.hitBrick(best, pass ? 99 : 1);
      // keep the ball from going flat; slight speed-up per hit
      this.speed = Math.min(98 * this.o.speedMul, this.speed + 0.25);
    }
    const sp = Math.hypot(b.vx, b.vy) || 1;
    if (Math.abs(b.vy) / sp < 0.3) { const s = Math.sign(b.vy) || 1; b.vy = s * sp * 0.3; b.vx = Math.sign(b.vx) * sp * Math.sqrt(1 - 0.09); }
    if (this.idle > 10) { this.idle = 0; const a = Math.atan2(b.vy, b.vx) + (this.r() - 0.5) * 0.5; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; }
    return false;
  }
  hitBrick(br, dmg) {
    if (!br.alive) return;
    br.flash = 0.12;
    if (br.v === 8) { this.ev('metal', br.x, br.y); return; }
    this.idle = 0;
    br.hp -= dmg;
    if (br.hp > 0) { this.ev('crack', br.x, br.y, { hp: br.hp }); this.addScore(10, br.x, br.y); return; }
    br.alive = false; this.left--; this.bricksBroken++;
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    const base = br.v === 4 ? 400 : br.v === 9 ? 120 : 40 + br.v * 20;
    this.addScore(base * (1 + Math.min(this.combo, 20) * 0.1), br.x, br.y);
    this.ev('break', br.x, br.y, { v: br.v, r: br.r });
    if (br.bonus || this.r() < 0.1 * this.o.dropMul) this.caps.push({ x: br.x, y: br.y, type: br.bonus ? this.r.pick(['multi', 'largo', 'laser', 'fuoco']) : this.r.pick(CAP_LIST), t: 0 });
    if (br.v === 9) {
      this.ev('explode', br.x, br.y);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const n = this.grid.get((br.r + dr) * COLS + br.c + dc); if (n && n.alive && n !== br && n.c === br.c + dc) this.hitBrick(n, 99); }
    }
  }
  catchCap(t) {
    const P = this.paddle;
    this.addScore(100, P.x, PADDLE_Y);
    if (t === 'multi') { const src = this.balls.find((b) => !b.stuck) || this.balls[0]; if (src) for (let k = 0; k < 2 && this.balls.length < 12; k++) { const sp = Math.hypot(src.vx, src.vy) || this.ballSpeed(), a = Math.atan2(src.vy || 1, src.vx) + (k ? 0.5 : -0.5); this.balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a) * sp), r: 1.5, stuck: false, trail: [] }); } }
    else if (t === 'largo') P.wideT = 16;
    else if (t === 'stretto') P.wideT = -10;
    else if (t === 'laser') P.laserT = 9;
    else if (t === 'colla') P.glue = 14;
    else if (t === 'lento') this.slow = 10;
    else if (t === 'fuoco') this.fire = 7;
    else if (t === 'vita') this.lives = Math.min(9, this.lives + 1);
    this.capsCaught = (this.capsCaught || 0) + 1;
    this.ev('cap', P.x, PADDLE_Y, { type: t });
  }
  addScore(v, x, y) { const pts = Math.round(v * this.o.scoreMul); this.score += pts; if (pts >= 100) this.ev('score', x, y, { pts }); }
  loseLife() {
    this.lives--; this.ev('lose', this.paddle.x, PADDLE_Y, { left: this.lives });
    if (this.lives <= 0) { this.finish(false); return; }
    this.caps.length = 0; this.shots.length = 0; this.fire = 0; this.slow = 0; this.paddle.wideT = 0; this.paddle.laserT = 0; this.paddle.glue = 0;
    this.speed = Math.max(62 * this.o.speedMul, this.speed * 0.9);
    this.newBall(true);
  }
  levelClear() {
    this.state = 'clear'; this.stateT = 0; this.cleared++;
    const bonus = 1000 + this.level * 100 + this.lives * 250;
    this.addScore(bonus, W / 2, H / 2);
    this.ev('clear', W / 2, H / 2, { n: this.level, bonus });
  }
  nextLevel() {
    const max = this.o.daily ? 5 : this.o.endless ? 1e9 : this.o.maxLevels || LEVEL_COUNT;
    if (this.cleared >= max || (!this.o.endless && !this.o.daily && this.level >= LEVEL_COUNT)) { this.finish(true); return; }
    this.level++; this.loadLevel();
  }
  finish(win) {
    if (this.over) return;
    this.over = true;
    this.result = { game: 'rimbalzo', score: this.score, win, level: this.level, cleared: this.cleared, bricks: this.bricksBroken, maxCombo: this.maxCombo, time: Math.round(this.time) };
    this.ev('end', W / 2, H / 2, { win });
  }
  clearShot(x0, x1, aim) {
    const y0 = PADDLE_Y, y1 = aim.y, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.5);
    for (let i = 1; i < n; i++) {
      let x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
      if (x < 0) x = -x; if (x > W) x = 2 * W - x;
      const c = Math.floor(x / BW), r = Math.floor((TOP - y) / BH);
      if (r < 0 || r >= ROWS) continue;
      const br = this.grid.get(r * COLS + c);
      if (br && br.alive && br !== aim) return false;
    }
    return true;
  }
  autopilot() {
    const P = this.paddle;
    let tgt = null;
    for (const b of this.balls) if (!b.stuck && b.vy < 0 && (!tgt || b.y < tgt.y)) tgt = b;
    if (!tgt) tgt = this.balls.find((b) => !b.stuck);
    if (!tgt) { this.input.px = null; this.input.ax = 0; return; }
    // aim at one remaining brick (a different one every few seconds), from where the ball will land
    const alive = this.bricks.filter((br) => br.alive && br.v !== 8);
    const t = tgt.vy < 0 ? (tgt.y - PADDLE_Y - 1.3 - tgt.r) / -tgt.vy : 0;
    let px = tgt.x + tgt.vx * Math.min(t, 3);
    for (let k = 0; k < 4 && (px < 0 || px > W); k++) px = px < 0 ? -px : 2 * W - px;
    let u = 0;
    if (alive.length) {
      // bricks the ball can see from the paddle, directly or off a side wall
      const k = Math.floor(this.time / 3);
      let a = null;
      for (let j = 0; j < alive.length && a == null; j++) {
        const aim = alive[(k + j * 7) % alive.length];
        for (const ax of [aim.x, -aim.x, 2 * W - aim.x]) { const an = Math.atan2(ax - px, aim.y - PADDLE_Y); if (Math.abs(an) < 1.0 && this.clearShot(px, ax, aim)) { a = an; break; } }
      }
      if (a == null) a = Math.sin(this.time * 1.3) * 0.8;
      u = clamp(a / 1.1, -0.9, 0.9);
    }
    this.input.px = clamp(px - u * P.w / 2, 0, W);
    this.input.ax = 0;
  }
}
