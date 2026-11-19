// Rompicapo · Mattoncini — the live well on a canvas: bricks, ghost, hold and next queue, line-clear
// collapse, hard-drop streaks, shakes and callouts. Input: keyboard (with key-up for auto-shift),
// touch gestures on the well (drag, flick, tap), on-screen buttons and gamepad.
import { Blocks, W, H, HIDDEN, TYPES, SHAPES, MODES } from './blocks.js';
import { Shell } from './shell.js';
import { snd } from './sound.js';
import { padPoll, rm } from './fx.js';
import { THEME } from './meta.js';
import { fmt, fmtMs } from './util.js';
import { ico } from './sudoku-ui.js';

const VIS = H - HIDDEN;
const ease = (t) => 1 - (1 - t) ** 3;
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

export class BlocksGame {
  constructor(root, o) {
    this.o = o; const P = o.params;
    this.mode = P.mode || 'maratona'; this.theme = THEME[o.theme] || THEME.notte;
    this.e = new Blocks({ seed: P.seed || ((Math.random() * 2 ** 31) | 0), mode: this.mode, startLevel: P.level || 1 });
    this.sh = new Shell(root, { game: 'mattoncini', title: P.title || `Mattoncini · ${MODES[this.mode].name}`, sub: P.sub || MODES[this.mode].desc, theme: o.theme, onPause: (on) => this.onPause(on) });
    this.best = P.best || 0; this.anims = []; this.shakeT = 0; this.count = 1.2; this.done = false; this.callouts = [];
    this.build();
  }
  build() {
    const sh = this.sh;
    sh.wrap.innerHTML = '<canvas class="bk-cv" aria-label="Campo di gioco dei Mattoncini"></canvas>';
    const B = (id, ic, label, cls = '') => `<button type="button" class="bk-b ${cls}" data-k="${id}" aria-label="${label}">${ico(ic)}<span>${label}</span></button>`;
    sh.side.innerHTML = `<div class="bk-pad">
        ${B('hold', 'hold', 'Tieni', 'hold')}${B('ccw', 'rotl', 'Ruota ⟲', 'ccw')}${B('cw', 'rotr', 'Ruota ⟳', 'cw')}
        ${B('left', 'left', 'Sinistra', 'lt')}${B('soft', 'down', 'Giù', 'dn')}${B('right', 'right', 'Destra', 'rt')}
        ${B('hard', 'drop', 'Caduta', 'hd')}
      </div>
      <div class="bk-keys"><b>Tastiera</b><span><kbd>←</kbd><kbd>→</kbd> muovi · <kbd>↓</kbd> giù · <kbd>Spazio</kbd> caduta</span><span><kbd>↑</kbd><kbd>X</kbd> ruota ⟳ · <kbd>Z</kbd> ruota ⟲ · <kbd>C</kbd> tieni</span><span>Tocco: trascina, tocca per ruotare, scatto in giù per la caduta, su per tenere.</span></div>`;
    this.cv = sh.wrap.querySelector('canvas'); this.g = this.cv.getContext('2d');
    // on-screen buttons: press / release (auto-shift and soft drop keep going while held)
    sh.side.querySelectorAll('.bk-b').forEach((b) => {
      const k = b.dataset.k;
      const down = (ev) => { ev.preventDefault(); b.setPointerCapture?.(ev.pointerId); b.classList.add('on'); this.act(k, true); };
      const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); this.act(k, false); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('click', (ev) => { if (ev.detail === 0) { this.act(k, true); this.act(k, false); } }); // keyboard activation
    });
    this.touch();
    this.keyup = (ev) => { const m = this.keymap(ev); if (m && (m === 'left' || m === 'right' || m === 'soft')) this.act(m, false); };
    window.addEventListener('keyup', this.keyup);
    this.blur = () => { this.e.release('left'); this.e.release('right'); this.e.release('soft'); };
    window.addEventListener('blur', this.blur);
    sh.onResize = () => this.fit();
    this.fit();
  }
  fit() {
    const r = this.sh.wrap.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    // narrow frames (phones held upright): hold and next share one column on the right
    this.compact = r.width / Math.max(1, r.height) < 0.8;
    const cols = this.compact ? 14.6 : 19.6;
    const cell = Math.max(8, Math.floor(Math.min(r.width / cols, r.height / (VIS + 0.6))));
    this.cs = cell; this.dpr = d;
    const w = Math.round(cell * cols), h = Math.round(cell * (VIS + 0.6));
    this.cv.width = w * d; this.cv.height = h * d; this.cv.style.width = `${w}px`; this.cv.style.height = `${h}px`;
    this.ox = cell * (this.compact ? 0.2 : 4.8); this.oy = cell * 0.3; this.draw();
  }
  start() {
    this.unpad = padPoll((b, down) => this.pad(b, down));
    this.t0 = performance.now(); this.raf = requestAnimationFrame((t) => this.loop(t));
    window.__rompicapo = this;
    snd.select();
  }
  // ---------------------------------------------------------------- input
  act(k, down) {
    if (this.done || this.sh.paused) return;
    if (this.count > 0) { if (k === 'left' || k === 'right' || k === 'soft') { if (down) this.e.held[k] = true; else this.e.held[k] = false; } return; }
    if (k === 'left' || k === 'right' || k === 'soft') { if (down) this.e.press(k); else this.e.release(k); return; }
    if (!down) return;
    if (k === 'cw') this.e.rotate(1); else if (k === 'ccw') this.e.rotate(-1); else if (k === 'hard') this.e.hardDrop(); else if (k === 'hold') this.e.doHold();
  }
  keymap(ev) {
    const k = ev.key, c = ev.code;
    if (k === 'ArrowLeft') return 'left';
    if (k === 'ArrowRight') return 'right';
    if (k === 'ArrowDown') return 'soft';
    if (k === 'ArrowUp' || c === 'KeyX') return 'cw';
    if (c === 'KeyZ' || k === 'Control') return 'ccw';
    if (k === ' ' || c === 'Space') return 'hard';
    if (c === 'KeyC' || k === 'Shift') return 'hold';
    return null;
  }
  onKey(ev) {
    if (this.done) return;
    if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P' || ev.key === 'F1') { ev.preventDefault(); this.sh.pause(!this.sh.paused); return; }
    const m = this.keymap(ev); if (!m) return;
    ev.preventDefault(); if (ev.repeat) return;
    this.act(m, true);
  }
  pad(b, down) {
    if (b === 'start' && down) { if (!this.done) this.sh.pause(!this.sh.paused); return; }
    const map = { left: 'left', right: 'right', down: 'soft', up: 'hard', a: 'cw', b: 'ccw', x: 'hold', y: 'hold', lb: 'hold', rb: 'hold', rt: 'hard', lt: 'hold' };
    const k = map[b]; if (!k) return;
    if (k === 'left' || k === 'right' || k === 'soft') this.act(k, down); else if (down) this.act(k, true);
  }
  touch() {
    const el = this.sh.stage; el.style.touchAction = 'none';
    let s = null;
    el.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse' && ev.button) return; if (ev.target.closest('button')) return; s = { x: ev.clientX, y: ev.clientY, t: performance.now(), sx: 0, sy: 0, moved: false, id: ev.pointerId, hist: [[ev.clientY, performance.now()]] }; });
    el.addEventListener('pointermove', (ev) => {
      if (!s || ev.pointerId !== s.id || this.done || this.sh.paused || this.count > 0) return;
      const c = this.cs * 1.05, dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      s.hist.push([ev.clientY, performance.now()]); if (s.hist.length > 6) s.hist.shift();
      const tx = Math.trunc(dx / c);
      while (s.sx < tx) { if (this.e.shift(1)) s.moved = true; s.sx++; }
      while (s.sx > tx) { if (this.e.shift(-1)) s.moved = true; s.sx--; }
      const ty = Math.trunc(dy / c);
      if (Math.abs(dx) < Math.abs(dy) * 1.2) while (s.sy < ty) { const p = this.e.cur; if (this.e.fits({ ...p, y: p.y + 1 })) { this.e.cur = { ...p, y: p.y + 1 }; this.e.score += 1; } s.sy++; s.moved = true; }
    });
    const up = (ev) => {
      if (!s || ev.pointerId !== s.id) return; const st = s; s = null;
      if (this.done || this.sh.paused || this.count > 0) return;
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y, dt = performance.now() - st.t;
      const h0 = st.hist[0], vy = (ev.clientY - h0[0]) / Math.max(1, performance.now() - h0[1]); // px/ms
      if (dy > this.cs * 1.6 && vy > 0.9 && Math.abs(dy) > Math.abs(dx) * 1.5) { this.e.hardDrop(); return; }
      if (-dy > this.cs * 2 && Math.abs(dy) > Math.abs(dx) * 1.5 && dt < 450) { this.e.doHold(); return; }
      if (!st.moved && Math.hypot(dx, dy) < 14 && dt < 350) { const r = this.cv.getBoundingClientRect(); this.e.rotate(ev.clientX < r.left + r.width * 0.3 ? -1 : 1); }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { s = null; });
  }
  // ---------------------------------------------------------------- loop
  loop(t) {
    const dt = Math.min(50, t - this.t0); this.t0 = t;
    if (!this.sh.paused && !this.done) {
      if (this.count > 0) { const before = Math.ceil(this.count / 0.4); this.count -= dt / 1000; const after = Math.ceil(this.count / 0.4); if (after !== before && this.count > 0) snd.select(); if (this.count <= 0) { this.callout('Via!', 'go'); snd.level(); for (const k of ['left', 'right', 'soft']) if (this.e.held[k]) { this.e.held[k] = false; this.e.press(k); } } }
      else this.e.tick(dt);
      this.events();
    }
    this.anims = this.anims.filter((a) => (a.t += dt / 1000) < a.max);
    this.callouts = this.callouts.filter((c) => (c.t += dt / 1000) < 1.3);
    this.shakeT = Math.max(0, this.shakeT - dt / 1000);
    this.draw();
    if (this.e.over && !this.done) this.finish();
    this.raf = requestAnimationFrame((x) => this.loop(x));
  }
  events() {
    for (const ev of this.e.drain()) {
      if (ev.e === 'move') snd.move();
      else if (ev.e === 'rotate') snd.rotate();
      else if (ev.e === 'hold') snd.hold();
      else if (ev.e === 'hard') { snd.hard(); if (ev.d > 0) { this.anims.push({ k: 'streak', cells: ev.cells, d: ev.d, t: 0, max: 0.22 }); this.shakeT = Math.max(this.shakeT, 0.12); this.pt(ev.cells, 6, 0.5); } }
      else if (ev.e === 'lock') {
        if (!ev.n) { snd.lock(); this.anims.push({ k: 'land', cells: ev.cells, t: 0, max: 0.18 }); }
        else {
          snd.clear(ev.n); this.anims.push({ k: 'clear', rows: ev.rows, t: 0, max: 0.32 });
          for (const y of ev.rows) this.sweepRow(y);
          if (ev.n >= 4 || ev.ts) { this.shakeT = 0.35; try { this.o.sfx?.ok(); } catch {} }
        }
        if (ev.kind) this.callout(ev.kind.toUpperCase(), ev.n >= 4 || ev.ts ? 'big' : '', ev.pts, ev.combo > 0 ? `Combo ×${ev.combo + 1}` : '');
        if (ev.perfect) this.sh.fx.confetti(80);
        this.hud();
      } else if (ev.e === 'level') { snd.level(); this.callout(`Livello ${ev.level}`, 'lvl'); this.hud(); }
    }
    if (this.mode === 'ultra' || this.mode === 'sprint') this.hud(true);
  }
  // one line for clears (the newest replaces the last), one for level-ups and the start
  callout(text, cls = '', pts = 0, sub = '') { const slot = cls === 'lvl' || cls === 'go' ? 1 : 0; this.callouts = this.callouts.filter((c) => c.slot !== slot); this.callouts.push({ text, cls, pts, sub, t: 0, slot }); }
  hud(timeOnly = false) {
    const e = this.e, sh = this.sh;
    if (this.mode === 'sprint') sh.chip('t', 'Tempo', fmtMs(e.time));
    else if (this.mode === 'ultra') sh.chip('t', 'Restano', fmtMs(Math.max(0, MODES.ultra.time - e.time)), MODES.ultra.time - e.time < 15000 ? 'warn' : '');
    if (timeOnly) return;
    sh.chip('s', 'Punti', fmt(e.score));
    sh.chip('l', 'Linee', this.mode === 'sprint' ? `${e.lines}/40` : this.mode === 'maratona' ? `${e.lines}/150` : e.lines);
    if (this.mode !== 'sprint') sh.chip('v', 'Livello', e.level);
  }
  pt(cells, n, sp) {
    const r = this.cv.getBoundingClientRect(), col = this.theme.blocks[TYPES.indexOf(this.e.cur?.t || 'T')];
    for (const [x, y] of cells.slice(0, 4)) { if (y < HIDDEN) continue; this.sh.fx.burst(r.left + this.ox + (x + 0.5) * this.cs, r.top + this.oy + (y - HIDDEN + 1) * this.cs, ['#fff', col], n, { speed: 160 * sp + 60, up: 80, size: 2.5 }); }
  }
  sweepRow(y) { const r = this.cv.getBoundingClientRect(); this.sh.fx.sweep({ left: r.left + this.ox, top: r.top + this.oy + (y - HIDDEN) * this.cs, width: W * this.cs, height: this.cs }, '#fff', rm() ? 6 : 22); }
  // ---------------------------------------------------------------- drawing
  brick(x, y, s, col, a = 1, ghost = false) {
    const g = this.g, r = Math.max(2, s * 0.18);
    g.globalAlpha = a;
    if (ghost) { g.strokeStyle = col; g.lineWidth = Math.max(1.5, s * 0.08); rr(g, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, r); g.stroke(); g.globalAlpha = a * 0.18; g.fillStyle = col; g.fill(); g.globalAlpha = 1; return; }
    const gr = g.createLinearGradient(x, y, x, y + s); gr.addColorStop(0, shade(col, 0.28)); gr.addColorStop(1, shade(col, -0.18));
    g.fillStyle = shade(col, -0.38); rr(g, x + 0.5, y + 0.5, s - 1, s - 1, r); g.fill();
    g.fillStyle = gr; rr(g, x + 0.5, y + 0.5, s - 1, s - s * 0.12, r); g.fill();
    // stud
    g.fillStyle = shade(col, 0.42); g.beginPath(); g.arc(x + s * 0.5, y + s * 0.44, s * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = shade(col, -0.06); g.beginPath(); g.arc(x + s * 0.5, y + s * 0.48, s * 0.15, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  mini(t, cx, cy, s, dim = false) {
    if (!t) return;
    const cells = SHAPES[t][0], xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    for (const [x, y] of cells) this.brick(cx + (x - Math.min(...xs) - w / 2) * s, cy + (y - Math.min(...ys) - h / 2) * s, s, this.theme.blocks[TYPES.indexOf(t)], dim ? 0.35 : 1);
  }
  draw() {
    const g = this.g, s = this.cs, d = this.dpr, e = this.e, v = this.theme.v;
    if (!s) return;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
    let sx = 0, sy = 0; if (this.shakeT > 0 && !rm()) { sx = (Math.random() - 0.5) * 10 * this.shakeT; sy = (Math.random() - 0.5) * 12 * this.shakeT; }
    g.translate(sx, sy);
    const ox = this.ox, oy = this.oy, ww = W * s, hh = VIS * s;
    // panels
    const panel = (x, y, w, h, title) => { g.fillStyle = v.panel; rr(g, x, y, w, h, s * 0.4); g.fill(); g.strokeStyle = v.line; g.lineWidth = 1.5; g.stroke(); g.fillStyle = v.ink2; g.font = `700 ${Math.max(9, s * 0.52)}px ${getComputedStyle(this.cv).fontFamily}`; g.textAlign = 'center'; g.fillText(title, x + w / 2, y + s * 0.8); };
    if (this.compact) {
      const px = ox + ww + s * 0.3;
      panel(px, oy, s * 3.9, s * 3.4, 'TIENI');
      this.mini(e.hold, px + s * 1.95, oy + s * 2.05, s * 0.7, e.holdUsed);
      panel(px, oy + s * 3.8, s * 3.9, s * 11.2, 'PROSSIMI');
      e.queue.slice(0, 5).forEach((t, i) => this.mini(t, px + s * 1.95, oy + s * (5.9 + i * 2), i ? s * 0.55 : s * 0.7));
    } else {
      panel(s * 0.2, oy, s * 4.2, s * 3.6, 'TIENI');
      this.mini(e.hold, s * 2.3, oy + s * 2.1, s * 0.82, e.holdUsed);
      panel(ox + ww + s * 0.4, oy, s * 4.2, s * 12.2, 'PROSSIMI');
      e.queue.slice(0, 5).forEach((t, i) => this.mini(t, ox + ww + s * 2.5, oy + s * (2.1 + i * 2.15), i ? s * 0.62 : s * 0.82));
    }
    // well
    g.fillStyle = v.cell; rr(g, ox - 3, oy - 3, ww + 6, hh + 6, s * 0.3); g.fill(); g.strokeStyle = v.line; g.lineWidth = 2; g.stroke();
    g.strokeStyle = v.line; g.globalAlpha = 0.35; g.lineWidth = 1; g.beginPath();
    for (let x = 1; x < W; x++) { g.moveTo(ox + x * s, oy); g.lineTo(ox + x * s, oy + hh); }
    for (let y = 1; y < VIS; y++) { g.moveTo(ox, oy + y * s); g.lineTo(ox + ww, oy + y * s); }
    g.stroke(); g.globalAlpha = 1;
    g.save(); g.beginPath(); g.rect(ox, oy, ww, hh); g.clip();
    // collapse offsets after a clear
    const clr = this.anims.find((a) => a.k === 'clear');
    let shiftOf = null;
    if (clr) {
      const rows = clr.rows, n = rows.length, keep = []; for (let y = 0; y < H; y++) if (!rows.includes(y)) keep.push(y);
      const k = 1 - ease(Math.min(1, clr.t / 0.2));
      shiftOf = (y) => (y < n ? 0 : rows.filter((c) => c > keep[y - n]).length * k);
    }
    for (let y = HIDDEN; y < H; y++) for (let x = 0; x < W; x++) { const c = e.board[y][x]; if (c) this.brick(ox + x * s, oy + (y - HIDDEN - (shiftOf ? shiftOf(y) : 0)) * s, s, this.theme.blocks[c - 1], e.over && !e.won ? 0.45 : 1); }
    if (clr) { const a = 1 - clr.t / clr.max; g.fillStyle = '#fff'; for (const y of clr.rows) { const yy = y - HIDDEN; g.globalAlpha = a * 0.85; g.fillRect(ox, oy + yy * s + (1 - a) * s * 0.5, ww, s * a); } g.globalAlpha = 1; }
    // current piece + ghost
    if (e.cur && !e.over) {
      const col = this.theme.blocks[TYPES.indexOf(e.cur.t)], gy = e.ghostY();
      for (const [x, y] of SHAPES[e.cur.t][e.cur.r]) { const yy = gy + y - HIDDEN; if (yy >= 0) this.brick(ox + (e.cur.x + x) * s, oy + yy * s, s, col, 0.55, true); }
      const lockA = e.onGround() ? 1 - 0.35 * Math.min(1, e.lockT / e.lockDelay) : 1;
      for (const [x, y] of this.e.cells()) if (y >= HIDDEN - 1) this.brick(ox + x * s, oy + (y - HIDDEN) * s, s, col, lockA);
    }
    for (const a of this.anims) {
      if (a.k === 'streak') { const p = 1 - a.t / a.max; g.fillStyle = '#fff'; for (const [x, y] of a.cells) { const top = Math.max(HIDDEN, y - a.d) - HIDDEN; const gr = g.createLinearGradient(0, oy + top * s, 0, oy + (y - HIDDEN) * s); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(255,255,255,${0.35 * p})`); g.fillStyle = gr; g.fillRect(ox + x * s + s * 0.15, oy + top * s, s * 0.7, (y - HIDDEN - top) * s); } }
      if (a.k === 'land') { const p = 1 - a.t / a.max; g.fillStyle = `rgba(255,255,255,${0.35 * p})`; for (const [x, y] of a.cells) if (y >= HIDDEN) { rr(g, ox + x * s + 1, oy + (y - HIDDEN) * s + 1, s - 2, s - 2, s * 0.18); g.fill(); } }
    }
    g.restore();
    // countdown + callouts
    g.textAlign = 'center'; const font = getComputedStyle(this.cv).fontFamily;
    if (this.count > 0) { const n = Math.ceil(this.count / 0.4), f = (this.count % 0.4) / 0.4; g.font = `900 ${s * (2.6 + f)}px ${font}`; g.fillStyle = v.ink; g.globalAlpha = 0.4 + f * 0.6; g.fillText(String(n), ox + ww / 2, oy + hh * 0.42); g.globalAlpha = 1; }
    this.callouts.forEach((c) => {
      const p = c.t / 1.3, pop = Math.min(1, c.t / 0.12), y = oy + hh * (c.slot ? 0.22 : 0.4) - p * s * 1.5, sc = (c.cls === 'big' ? 1.25 : c.cls === 'go' ? 1.6 : c.cls === 'lvl' ? 1 : 0.9) * (0.6 + 0.4 * pop);
      g.globalAlpha = p < 0.8 ? 1 : (1 - p) / 0.2; g.font = `900 italic ${s * sc}px ${font}`;
      g.lineWidth = Math.max(3, s * 0.18); g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(c.text, ox + ww / 2, y); g.fillStyle = c.cls === 'combo' ? v.acc2 : c.cls === 'lvl' ? v.acc : '#fff'; g.fillText(c.text, ox + ww / 2, y);
      const sub = [c.pts ? `+${fmt(c.pts)}` : '', c.sub].filter(Boolean).join(' · ');
      if (sub) { g.font = `800 ${s * 0.7}px ${font}`; g.strokeText(sub, ox + ww / 2, y + s * 0.95); g.fillStyle = v.acc2; g.fillText(sub, ox + ww / 2, y + s * 0.95); }
      g.globalAlpha = 1;
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  // ---------------------------------------------------------------- end / pause
  finish() {
    this.done = true; this.sh.end(); this.hud();
    const e = this.e;
    if (e.won) this.sh.fx.confetti(140); else this.sh.fx.shake(this.sh.wrap, 1);
    const res = { mode: this.mode, score: e.score, lines: e.lines, level: e.level, time: e.time, won: e.won, why: e.why, quad: e.stats.tetris, tspin: e.stats.tspin, combo: e.stats.maxCombo, pieces: e.pieces };
    setTimeout(() => this.o.onEnd(res), e.won ? 1000 : 1200);
  }
  onPause(on) { if (on) this.blur(); this.o.onPause?.(on); }
  togglePause(on) { this.sh.pause(on); }
  destroy() { cancelAnimationFrame(this.raf); this.unpad?.(); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); this.sh.destroy(); if (window.__rompicapo === this) window.__rompicapo = null; }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
