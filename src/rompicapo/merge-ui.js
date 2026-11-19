// Rompicapo · Unisci — the live board: animated slides and merges, swipe / keys / gamepad, one-step
// undo, best score, goal tile, game over. Logic in src/rompicapo/merge.js.
import { newBoard, move as doMove, clone, VARIANTS, canMove } from './merge.js';
import { Shell } from './shell.js';
import { snd } from './sound.js';
import { swipe, padPoll } from './fx.js';
import { THEME } from './meta.js';
import { fmt } from './util.js';
import { ico } from './sudoku-ui.js';

const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

export class MergeGame {
  constructor(root, o) {
    this.o = o; const P = o.params;
    this.n = P.size || 4; this.V = VARIANTS.find((v) => v.id === this.n) || VARIANTS[0];
    this.goal = P.goal || this.V.goal; this.daily = P.kind === 'daily';
    this.theme = THEME[o.theme] || THEME.notte;
    this.sh = new Shell(root, { game: 'unisci', title: P.title || `Unisci · ${this.V.name}`, sub: P.sub || `Obiettivo: ${fmt(this.goal)}`, theme: o.theme, onPause: (on) => { this.o.onPause?.(on); } });
    this.b = P.resume ? P.resume.b : newBoard(this.n, P.seed || ((Math.random() * 2 ** 31) | 0));
    this.reached = P.resume ? !!P.resume.reached : false; this.prev = null; this.undos = P.resume?.undos || 0;
    this.best = P.best || 0; this.els = new Map(); this.done = false; this.combo = 0;
    this.build();
  }
  build() {
    const sh = this.sh, n = this.n;
    sh.wrap.innerHTML = `<div class="mg-board" style="--n:${n}"><div class="mg-grid">${'<i></i>'.repeat(n * n)}</div><div class="mg-tiles"></div></div>`;
    sh.side.innerHTML = `<div class="mg-tools"><button type="button" class="rp-tool" data-t="undo" aria-label="Annulla una mossa (Z)">${ico('undo')}<span>Annulla</span><em>1</em></button>
      <button type="button" class="rp-tool" data-t="new" aria-label="Nuova partita">${ico('shuffle')}<span>${this.daily ? 'Riprova' : 'Nuova'}</span></button></div>
      <p class="mg-how">Scorri sulla tavola o usa le frecce: le tessere uguali che si toccano si uniscono.</p>`;
    this.board = sh.wrap.querySelector('.mg-board'); this.layer = sh.wrap.querySelector('.mg-tiles');
    sh.side.addEventListener('click', (e) => { const t = e.target.closest('.rp-tool'); if (!t) return; if (t.dataset.t === 'undo') this.undo(); else this.o.onRestart?.(); });
    this.unswipe = swipe(sh.stage, { onSwipe: (d) => this.play(d), min: 18 });
    sh.stage.style.touchAction = 'none';
    sh.onResize = () => this.fit();
    this.fit(); this.sync(true); this.hud();
  }
  fit() {
    const r = this.sh.wrap.getBoundingClientRect(), s = Math.max(200, Math.floor(Math.min(r.width, r.height)));
    this.board.style.setProperty('--sz', `${s}px`); this.cell = s / this.n;
  }
  start() { this.unpad = padPoll((b, down) => { if (!down) return; if (b === 'start') this.sh.pause(!this.sh.paused); else if (['left', 'right', 'up', 'down'].includes(b)) this.play(b); else if (b === 'b' || b === 'sel') this.undo(); }); window.__rompicapo = this; }
  color(v) { const lv = Math.round(Math.log2(v)), t = this.theme.tiles; return t[Math.min(t.length - 1, lv - 1)]; }
  tileEl(c) {
    let el = this.els.get(c.id);
    if (!el) { el = document.createElement('div'); el.className = 'mg-t'; el.innerHTML = '<b></b><i></i>'; this.layer.appendChild(el); this.els.set(c.id, el); }
    return el;
  }
  paint(el, v) {
    const col = this.color(v), lv = Math.round(Math.log2(v));
    el.style.setProperty('--c', col); el.style.color = lum(col) > 0.62 ? '#2a2233' : '#fff';
    el.dataset.v = v; el.dataset.lv = Math.min(lv, 13);
    el.firstChild.textContent = v >= 100000 ? `${Math.round(v / 1000)}k` : v; el.classList.toggle('d4', String(v).length >= 4); el.classList.toggle('d5', String(v).length >= 5);
    el.lastChild.style.setProperty('--p', Math.min(lv, 11));
  }
  place(el, i) { el.style.setProperty('--x', i % this.n); el.style.setProperty('--y', Math.floor(i / this.n)); }
  sync(fresh = false) {
    const seen = new Set();
    this.b.cells.forEach((c, i) => { if (!c) return; const el = this.tileEl(c); seen.add(c.id); this.place(el, i); this.paint(el, c.v); if (fresh) { el.classList.add('new'); } });
    for (const [id, el] of this.els) if (!seen.has(id)) { el.remove(); this.els.delete(id); }
    if (fresh) setTimeout(() => this.els.forEach((el) => el.classList.remove('new')), 300);
  }
  hud() {
    const sh = this.sh;
    sh.chip('s', 'Punti', fmt(this.b.score));
    if (this.daily) sh.chip('m', 'Mosse', this.b.moves); else sh.chip('b', 'Record', fmt(Math.max(this.best, this.b.score)));
    sh.chip('x', 'Massimo', fmt(this.b.max));
    const u = this.sh.side.querySelector('[data-t="undo"]'); u.disabled = !this.prev; u.querySelector('em').textContent = this.prev ? '1' : '0';
  }
  play(dir) {
    if (this.done || this.sh.paused) return;
    this.flush();
    const before = clone(this.b), r = doMove(this.b, dir);
    if (!r.moved) { this.board.classList.remove('nud-left', 'nud-right', 'nud-up', 'nud-down'); void this.board.offsetWidth; this.board.classList.add(`nud-${dir}`); return; }
    this.prev = before;
    // slides
    for (const s of r.slides) { const el = this.els.get(s.id); if (el) this.place(el, s.to); }
    const merged = new Set();
    for (const m of r.merges) {
      const el = this.els.get(m.id); if (el) { this.place(el, m.to); el.classList.add('gone'); this.els.delete(m.id); setTimeout(() => el.remove(), 130); }
      merged.add(m.into);
    }
    snd.slide();
    const top = r.merges.reduce((a, m) => Math.max(a, m.v), 0);
    this.pending = () => {
      for (const m of r.merges) {
        const el = this.els.get(m.into); if (!el) continue;
        this.paint(el, m.v); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        if (m.v >= 64) { const bb = el.getBoundingClientRect(); this.sh.fx.burst(bb.left + bb.width / 2, bb.top + bb.height / 2, [this.color(m.v), '#fff'], m.v >= 512 ? 26 : 12, { speed: 200 + Math.log2(m.v) * 14 }); }
      }
      if (r.spawn) { const el = this.tileEl({ id: r.spawn.id }); this.place(el, r.spawn.i); this.paint(el, r.spawn.v); el.classList.add('new'); setTimeout(() => el.classList.remove('new'), 260); snd.spawn(); }
      if (top) {
        snd.pop(Math.round(Math.log2(top)) - 1);
        const el = this.els.get(r.merges.find((m) => m.v === top).into), bb = el?.getBoundingClientRect();
        if (bb && r.gained) this.sh.fx.float(bb.left + bb.width / 2, bb.top, `+${fmt(r.gained)}`, r.merges.length > 1 ? 'big' : '');
        if (r.merges.length >= 3) this.sh.fx.shake(this.board, 0.3);
      }
      this.sync(); this.hud();
      if (!this.reached && this.b.max >= this.goal) { this.reached = true; this.win(); return; }
      if (this.b.over) this.lose();
    };
    this.pt = setTimeout(() => this.flush(), 110);
    this.hud(); this.save();
  }
  flush() { if (!this.pending) return; clearTimeout(this.pt); const f = this.pending; this.pending = null; f(); }
  undo() {
    this.flush();
    if (!this.prev || this.done) { snd.nope(); return; }
    this.b = this.prev; this.prev = null; this.undos++; snd.erase();
    this.els.forEach((el) => el.remove()); this.els.clear(); this.sync(); this.hud(); this.save();
  }
  win() {
    try { this.o.sfx?.win(); } catch {}
    this.sh.fx.confetti(150);
    const el = [...this.els.values()].find((e) => +e.dataset.v === this.goal); el?.classList.add('goal');
    if (this.daily) { this.finish(true); return; }
    this.sh.msg(`Hai fatto ${fmt(this.goal)}! Continua pure: il punteggio sale ancora.`, 'good', 5000);
    this.o.onGoal?.(this.result(true));
    this.save();
  }
  lose() { this.finish(this.reached); }
  finish(win) {
    if (this.done) return;
    this.done = true; this.sh.end(); this.o.onSave?.(null);
    this.board.classList.add(win ? 'won' : 'over');
    setTimeout(() => this.o.onEnd(this.result(win)), win ? 900 : 1300);
  }
  result(win) { return { win, score: this.b.score, max: this.b.max, moves: this.b.moves, size: this.n, undos: this.undos, goal: this.goal, reached: this.reached }; }
  save() { if (this.done || this.daily) return; this.o.onSave?.({ b: clone(this.b), reached: this.reached, undos: this.undos, size: this.n }); }
  onKey(e) {
    if (this.done) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); this.sh.pause(!this.sh.paused); return; }
    if (this.sh.paused) return;
    const d = KEYS[e.key]; if (d) { e.preventDefault(); if (!e.repeat) this.play(d); return; }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'Backspace') { e.preventDefault(); this.undo(); }
  }
  togglePause(on) { this.sh.pause(on); }
  // test hook: a stuck position check
  stuck() { return !canMove(this.b); }
  destroy() { clearTimeout(this.pt); this.pending = null; this.unswipe?.(); this.unpad?.(); this.sh.destroy(); if (window.__rompicapo === this) window.__rompicapo = null; }
}
