// Rompicapo · Mattoncini — falling-blocks engine. Pure and time driven (tick(ms)), seeded 7-bag,
// rotation with wall kicks (the standard SRS tables), hold, next queue, ghost, soft/hard drop,
// lock delay with move reset, line clears, T-spins, combos, back-to-back, levels and three modes.
// Used by the game view (src/rompicapo/blocks-ui.js) and tools/rompicapo-test.mjs.
import { mulberry32, shuffle } from './util.js';

export const W = 10, H = 22, HIDDEN = 2; // rows 0-1 are above the visible field
export const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
// spawn state (x right, y down) inside a 3×3 box (4×4 for I, O sits in the middle of a 4-wide box)
const BASE = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
export const SHAPES = {};
for (const t of TYPES) {
  const rots = [BASE[t]];
  for (let r = 1; r < 4; r++) rots.push(t === 'O' ? BASE.O : rots[r - 1].map(([x, y]) => (t === 'I' ? [3 - y, x] : [2 - y, x])));
  SHAPES[t] = rots;
}
// SRS kick tables, written y-up as in the guideline; converted to y-down when used
const K_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const K_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
export const kicks = (t, from, to) => (t === 'O' ? [[0, 0]] : (t === 'I' ? K_I : K_JLSTZ)[`${from}>${to}`].map(([x, y]) => [x, -y]));

export const MODES = {
  maratona: { id: 'maratona', name: 'Maratona', desc: '150 linee, 15 livelli sempre più veloci.', goal: 150 },
  sprint: { id: 'sprint', name: 'Sprint 40', desc: '40 linee il più in fretta possibile.', goal: 40 },
  ultra: { id: 'ultra', name: 'Ultra 2 minuti', desc: 'Due minuti per fare più punti possibile.', time: 120000 },
  zen: { id: 'zen', name: 'Infinita', desc: 'Senza fine, la velocità cresce fino al livello 20.' },
};
export const gravityMs = (level) => 1000 * Math.pow(Math.max(0.01, 0.8 - (Math.min(level, 20) - 1) * 0.007), Math.min(level, 20) - 1);
const LINE_PTS = [0, 100, 300, 500, 800], TSPIN_PTS = [400, 800, 1200, 1600];
export const CLEAR_NAME = ['', 'Singola', 'Doppia', 'Tripla', 'Quadrupla'];

export class Blocks {
  constructor({ seed = 1, mode = 'maratona', startLevel = 1, das = 160, arr = 45, lockDelay = 500 } = {}) {
    this.rnd = mulberry32(seed); this.mode = MODES[mode] ? mode : 'maratona';
    this.board = Array.from({ length: H }, () => new Array(W).fill(0));
    this.bag = []; this.queue = []; this.hold = null; this.holdUsed = false;
    this.score = 0; this.lines = 0; this.startLevel = this.mode === 'sprint' ? 1 : startLevel; this.level = this.startLevel;
    this.combo = -1; this.b2b = false; this.time = 0; this.over = false; this.won = false; this.pieces = 0;
    this.events = []; this.stats = { tetris: 0, tspin: 0, maxCombo: 0, perfect: 0 };
    this.das = das; this.arr = arr; this.lockDelay = lockDelay;
    this.held = { left: false, right: false }; this.dasT = 0; this.arrT = 0; this.lastDir = 0; this.soft = false;
    this.fall = 0; this.lockT = 0; this.resets = 0; this.lowest = 0; this.lastRot = false; this.lastKick = 0;
    this.fill(); this.spawn();
  }
  fill() { while (this.queue.length < 7) { if (!this.bag.length) this.bag = shuffle(TYPES.slice(), this.rnd); this.queue.push(this.bag.pop()); } }
  cells(p = this.cur) { return SHAPES[p.t][p.r].map(([x, y]) => [p.x + x, p.y + y]); }
  fits(p) { for (const [x, y] of this.cells(p)) { if (x < 0 || x >= W || y >= H) return false; if (y >= 0 && this.board[y][x]) return false; } return true; }
  spawn(t = null) {
    if (!t) { t = this.queue.shift(); this.fill(); }
    this.cur = { t, r: 0, x: 3, y: 1 };
    this.fall = 0; this.lockT = 0; this.resets = 0; this.lowest = this.cur.y; this.lastRot = false;
    if (!this.fits(this.cur)) { this.cur.y--; if (!this.fits(this.cur)) { this.end(false, 'blocco'); return false; } }
    this.events.push({ e: 'spawn', t });
    return true;
  }
  end(won, why) { if (this.over) return; this.over = true; this.won = won; this.why = why; this.events.push({ e: won ? 'win' : 'over', why }); }
  onGround() { return !this.fits({ ...this.cur, y: this.cur.y + 1 }); }
  touched() { // a successful move/rotation on the ground resets the lock timer (15 times at most per row)
    if (this.cur.y > this.lowest) { this.lowest = this.cur.y; this.resets = 0; }
    if (this.onGround() && this.resets < 15) { this.lockT = 0; this.resets++; }
  }
  shift(dx) {
    if (this.over || !this.cur) return false;
    const p = { ...this.cur, x: this.cur.x + dx };
    if (!this.fits(p)) return false;
    this.cur = p; this.lastRot = false; this.touched(); this.events.push({ e: 'move' }); return true;
  }
  rotate(dir = 1) {
    if (this.over || !this.cur) return false;
    const from = this.cur.r, to = (from + (dir > 0 ? 1 : 3)) % 4, ks = kicks(this.cur.t, from, to);
    for (let k = 0; k < ks.length; k++) {
      const p = { ...this.cur, r: to, x: this.cur.x + ks[k][0], y: this.cur.y + ks[k][1] };
      if (this.fits(p)) { this.cur = p; this.lastRot = true; this.lastKick = k; this.touched(); this.events.push({ e: 'rotate', kick: k }); return true; }
    }
    return false;
  }
  ghostY() { const p = { ...this.cur }; while (this.fits({ ...p, y: p.y + 1 })) p.y++; return p.y; }
  hardDrop() {
    if (this.over) return 0;
    const y0 = this.cur.y, g = this.ghostY(), d = g - y0;
    if (d > 0) { this.cur = { ...this.cur, y: g }; this.lastRot = false; }
    this.score += 2 * d; this.events.push({ e: 'hard', d, cells: this.cells() });
    this.lock(); return d;
  }
  doHold() {
    if (this.over || this.holdUsed) return false;
    const t = this.cur.t; this.holdUsed = true; this.events.push({ e: 'hold', t });
    if (this.hold) { const h = this.hold; this.hold = t; this.spawn(h); } else { this.hold = t; this.spawn(); }
    return true;
  }
  tspin() {
    if (this.cur.t !== 'T' || !this.lastRot) return 0;
    const { x, y, r } = this.cur, occ = (cx, cy) => cx < 0 || cx >= W || cy >= H || (cy >= 0 && !!this.board[cy][cx]);
    const corners = [[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2]].map(([a, b]) => occ(a, b));
    const n = corners.filter(Boolean).length; if (n < 3) return 0;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][r]; // the two corners on the pointing side
    return corners[front[0]] && corners[front[1]] ? 2 : this.lastKick === 4 ? 2 : 1; // 2 = full, 1 = mini
  }
  lock() {
    const cells = this.cells(), color = TYPES.indexOf(this.cur.t) + 1, ts = this.tspin();
    let above = true;
    for (const [x, y] of cells) { if (y >= 0) this.board[y][x] = color; if (y >= HIDDEN) above = false; }
    this.pieces++;
    const full = []; for (let y = 0; y < H; y++) if (this.board[y].every(Boolean)) full.push(y);
    const n = full.length;
    if (n) { for (const y of full) { this.board.splice(y, 1); this.board.unshift(new Array(W).fill(0)); } }
    // scoring
    const lv = this.level; let pts = 0, kind = '';
    if (ts === 2) { pts = TSPIN_PTS[n] * lv; kind = `T-spin${n ? ' ' + CLEAR_NAME[n].toLowerCase() : ''}`; this.stats.tspin++; }
    else if (ts === 1 && n <= 1) { pts = (n ? 200 : 100) * lv; kind = 'T-spin mini'; }
    else if (n) { pts = LINE_PTS[n] * lv; kind = CLEAR_NAME[n]; }
    const hard = n === 4 || (ts && n > 0);
    if (n) {
      if (hard && this.b2b) { pts = Math.round(pts * 1.5); kind += ' · consecutiva'; }
      this.b2b = hard ? true : false;
      this.combo++; if (this.combo > 0) pts += 50 * this.combo * lv;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (n === 4) this.stats.tetris++;
    } else this.combo = -1;
    const perfect = n > 0 && this.board.every((row) => row.every((c) => !c));
    if (perfect) { pts += [0, 800, 1200, 1800, 2000][n] * lv; this.stats.perfect++; kind += ' · tavola pulita!'; }
    this.score += pts; this.lines += n;
    this.events.push({ e: 'lock', cells, color, rows: full, n, pts, kind, ts, combo: this.combo, b2b: this.b2b && hard, perfect });
    // level / goals
    if (this.mode !== 'sprint') {
      const nl = Math.min(this.mode === 'zen' ? 99 : 15, Math.max(this.startLevel, 1 + Math.floor(this.lines / 10)));
      if (nl > this.level) { this.level = nl; this.events.push({ e: 'level', level: nl }); }
    }
    const goal = MODES[this.mode].goal;
    if (goal && this.lines >= goal) { this.lines = this.mode === 'sprint' ? goal : this.lines; this.end(true, 'obiettivo'); return; }
    if (above) { this.end(false, 'fuori'); return; }
    this.holdUsed = false;
    this.spawn();
  }
  press(dir) {
    if (dir === 'soft') { this.soft = true; return; }
    this.held[dir] = true; this.lastDir = dir === 'left' ? -1 : 1; this.dasT = 0; this.arrT = 0;
    this.shift(this.lastDir);
  }
  release(dir) {
    if (dir === 'soft') { this.soft = false; return; }
    this.held[dir] = false;
    if (this.held.left || this.held.right) { this.lastDir = this.held.left ? -1 : 1; this.dasT = 0; } else this.lastDir = 0;
  }
  tick(ms) {
    if (this.over) return;
    this.time += ms;
    const lim = MODES[this.mode].time;
    if (lim && this.time >= lim) { this.time = lim; this.end(true, 'tempo'); return; }
    // auto-shift
    if (this.lastDir && (this.lastDir < 0 ? this.held.left : this.held.right)) {
      this.dasT += ms;
      if (this.dasT >= this.das) { this.arrT += ms; const step = Math.max(1, this.arr); while (this.arrT >= step) { this.arrT -= step; if (!this.shift(this.lastDir)) { this.arrT = 0; break; } } }
    }
    // gravity
    const g = this.mode === 'sprint' ? gravityMs(1) : gravityMs(this.level), soft = this.soft ? Math.min(g, 35) : g;
    if (this.onGround()) {
      this.fall = 0; this.lockT += ms;
      if (this.lockT >= this.lockDelay) this.lock();
    } else {
      this.fall += ms; this.lockT = 0;
      let guard = 0;
      while (this.fall >= soft && guard++ < 22) {
        this.fall -= soft;
        if (!this.fits({ ...this.cur, y: this.cur.y + 1 })) { this.fall = 0; break; }
        this.cur = { ...this.cur, y: this.cur.y + 1 }; this.lastRot = false;
        if (this.soft) this.score += 1;
        if (this.cur.y > this.lowest) { this.lowest = this.cur.y; this.resets = 0; }
      }
    }
  }
  drain() { const e = this.events; this.events = []; return e; }
}
