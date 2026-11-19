// Rompicapo · Sudoku — the live puzzle: board, notes, highlights, undo, hints, mistakes, timer.
// Input: tap/click, keyboard (arrows, 1-9, Canc, N, Z, H), gamepad (croce, A metti, LB/RB cifra,
// X note, Y aiuto, B cancella). The menu and results live in src/screens/rompicapo.js.
import { generate, hint as findHint, PEERS, ROW, COL, BOX, UNITS, DIFF, decode, encode } from './sudoku.js';
import { Shell, Clock } from './shell.js';
import { snd } from './sound.js';
import { padPoll } from './fx.js';
import { fmtT } from './util.js';

const MAXMIST = 3;
export class SudokuGame {
  constructor(root, o) {
    this.o = o; const P = o.params;
    this.diff = DIFF[P.diff] || DIFF.medio;
    this.sh = new Shell(root, { game: 'sudoku', title: P.title || `Sudoku · ${this.diff.name}`, sub: P.sub || '', theme: o.theme, onPause: (on) => this.onPause(on) });
    this.limit = P.limit !== false; this.auto = P.auto !== false; this.hl = P.hl !== false;
    if (P.resume) {
      const s = P.resume; this.seed = s.seed; this.puzzle = decode(s.puzzle); this.solution = decode(s.solution);
      this.v = decode(s.v); this.notes = s.notes.slice(); this.mistakes = s.mistakes; this.hints = s.hints; this.clock = new Clock(s.time || 0); this.limitHit = !!s.limitHit;
    } else {
      const g = generate(P.seed, this.diff.id); this.seed = P.seed;
      this.puzzle = g.puzzle; this.solution = g.solution; this.v = g.puzzle.slice(); this.notes = new Array(81).fill(0);
      this.mistakes = 0; this.hints = 0; this.clock = new Clock(0); this.limitHit = false;
    }
    this.sel = this.puzzle.findIndex((x) => !x); if (this.sel < 0) this.sel = 40;
    this.noteMode = false; this.undoStack = []; this.wrong = new Set(); this.padDigit = 1; this.done = false;
    for (let i = 0; i < 81; i++) if (this.v[i] && this.v[i] !== this.solution[i]) this.wrong.add(i);
    this.build();
  }
  build() {
    const sh = this.sh;
    sh.wrap.innerHTML = `<div class="sd-board" role="grid" aria-label="Griglia del sudoku">${Array.from({ length: 81 }, (_, i) => `<div class="sd-c r${ROW(i)} c${COL(i)} ${this.puzzle[i] ? 'giv' : ''}" data-i="${i}" role="gridcell"><b></b><span class="sd-n">${'<i></i>'.repeat(9)}</span></div>`).join('')}</div>`;
    sh.side.innerHTML = `<div class="sd-tools">
        <button type="button" class="rp-tool" data-t="undo" aria-label="Annulla (Z)">${ico('undo')}<span>Annulla</span></button>
        <button type="button" class="rp-tool" data-t="erase" aria-label="Cancella (Canc)">${ico('erase')}<span>Cancella</span></button>
        <button type="button" class="rp-tool" data-t="notes" aria-pressed="false" aria-label="Note (N)">${ico('pencil')}<span>Note</span><em>OFF</em></button>
        <button type="button" class="rp-tool" data-t="hint" aria-label="Aiuto (H)">${ico('bulb')}<span>Aiuto</span></button>
      </div>
      <div class="sd-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" class="sd-k" data-d="${d}" aria-label="${d}"><b>${d}</b><small></small></button>`).join('')}</div>`;
    this.cells = [...sh.wrap.querySelectorAll('.sd-c')]; this.board = sh.wrap.querySelector('.sd-board');
    this.board.addEventListener('pointerdown', (e) => { const c = e.target.closest('.sd-c'); if (!c) return; this.select(+c.dataset.i); snd.select(); });
    sh.side.addEventListener('click', (e) => {
      const k = e.target.closest('.sd-k'); if (k) { this.input(+k.dataset.d); return; }
      const t = e.target.closest('.rp-tool'); if (!t) return;
      ({ undo: () => this.undo(), erase: () => this.erase(), notes: () => this.toggleNotes(), hint: () => this.hint() })[t.dataset.t]?.();
    });
    sh.onResize = () => this.fit();
    this.fit(); this.render(); this.hudUpdate();
  }
  fit() {
    const r = this.sh.wrap.getBoundingClientRect(), s = Math.max(180, Math.floor(Math.min(r.width, r.height) / 9) * 9);
    this.board.style.setProperty('--sz', `${s}px`);
  }
  start() {
    this.clock.start();
    this.tick = setInterval(() => this.hudUpdate(), 500);
    this.unpad = padPoll((b, down) => this.pad(b, down));
    if (!this.o.params.resume) this.intro();
    window.__rompicapo = this;
  }
  intro() { this.cells.forEach((c, i) => { c.style.setProperty('--d', `${(ROW(i) + COL(i)) * 18}ms`); c.classList.add('in'); }); setTimeout(() => this.cells.forEach((c) => c.classList.remove('in')), 900); }
  hudUpdate() {
    const sh = this.sh;
    sh.chip('t', 'Tempo', fmtT(this.clock.sec));
    sh.chip('m', 'Errori', this.limit && !this.limitHit ? `${this.mistakes}/${MAXMIST}` : this.mistakes, this.mistakes ? 'warn' : '');
    sh.chip('h', 'Aiuti', this.hints);
  }
  // ---------------------------------------------------------------- rendering
  render() {
    const sv = this.v[this.sel], counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (this.v[i] && !this.wrong.has(i)) counts[this.v[i]]++;
    for (let i = 0; i < 81; i++) {
      const c = this.cells[i], v = this.v[i];
      c.firstChild.textContent = v || '';
      const ns = c.lastChild.children, m = v ? 0 : this.notes[i];
      for (let d = 0; d < 9; d++) { ns[d].textContent = m & (1 << d) ? d + 1 : ''; ns[d].className = sv && sv === d + 1 && (m & (1 << d)) && this.hl ? 'on' : ''; }
      const peer = this.hl && (ROW(i) === ROW(this.sel) || COL(i) === COL(this.sel) || BOX(i) === BOX(this.sel));
      c.classList.toggle('sel', i === this.sel);
      c.classList.toggle('peer', peer && i !== this.sel);
      c.classList.toggle('same', this.hl && !!sv && v === sv && i !== this.sel);
      c.classList.toggle('bad', this.wrong.has(i));
      c.classList.toggle('usr', !!v && !this.puzzle[i]);
      c.setAttribute('aria-label', `Riga ${ROW(i) + 1}, colonna ${COL(i) + 1}: ${v || (m ? 'note ' + [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & (1 << (d - 1))).join(' ') : 'vuota')}`);
    }
    this.sh.side.querySelectorAll('.sd-k').forEach((k) => { const d = +k.dataset.d, left = 9 - counts[d]; k.classList.toggle('full', left <= 0); k.classList.toggle('pd', d === this.padDigit && document.documentElement.classList.contains('has-pad')); k.lastChild.textContent = left > 0 ? left : '✓'; k.classList.toggle('cur', !!sv && sv === d); });
    const nb = this.sh.side.querySelector('[data-t="notes"]'); nb.setAttribute('aria-pressed', String(this.noteMode)); nb.classList.toggle('on', this.noteMode); nb.querySelector('em').textContent = this.noteMode ? 'ON' : 'OFF';
  }
  select(i) { if (i < 0 || i > 80) return; this.sel = i; this.render(); }
  snapshot() { this.undoStack.push({ v: this.v.slice(), notes: this.notes.slice(), wrong: [...this.wrong], sel: this.sel }); if (this.undoStack.length > 300) this.undoStack.shift(); }
  // ---------------------------------------------------------------- actions
  input(d) {
    if (this.done || this.sh.paused) return;
    const i = this.sel; if (this.puzzle[i]) { snd.nope(); this.bump(i); return; }
    if (this.noteMode) {
      if (this.v[i]) return;
      this.snapshot(); this.notes[i] ^= 1 << (d - 1); snd.note(); this.render(); this.save(); return;
    }
    if (this.v[i] === d) return;
    this.snapshot(); this.v[i] = d;
    if (d !== this.solution[i]) {
      this.wrong.add(i); this.mistakes++; snd.nope(); this.bump(i, 'shake');
      try { this.o.sfx?.bad(); } catch {}
      this.render(); this.hudUpdate(); this.save();
      if (this.limit && !this.limitHit && this.mistakes >= MAXMIST) { this.limitHit = true; this.save(); setTimeout(() => { this.limitPending = true; this.sh.pause(true); }, 450); }
      return;
    }
    this.wrong.delete(i);
    if (this.auto) for (const j of PEERS[i]) this.notes[j] &= ~(1 << (d - 1));
    snd.knock(1 + (d - 5) * 0.03); this.bump(i, 'pop');
    this.render(); this.checkUnits(i); this.save(); this.checkWin();
  }
  erase() {
    if (this.done) return; const i = this.sel; if (this.puzzle[i]) return;
    if (!this.v[i] && !this.notes[i]) return;
    this.snapshot(); this.v[i] = 0; this.notes[i] = 0; this.wrong.delete(i); snd.erase(); this.render(); this.save();
  }
  undo() {
    if (this.done) return; const s = this.undoStack.pop(); if (!s) { snd.nope(); return; }
    this.v = s.v; this.notes = s.notes; this.wrong = new Set(s.wrong); this.sel = s.sel; snd.erase(); this.render(); this.save();
  }
  toggleNotes() { this.noteMode = !this.noteMode; snd.select(); this.render(); this.sh.msg(this.noteMode ? 'Note attive: le cifre diventano appunti.' : 'Note spente.', '', 1400); }
  hint() {
    if (this.done) return;
    const h = findHint(this.v, this.solution); if (!h) return;
    if (h.kind === 'wrong') { h.cells.forEach((i) => this.bump(i, 'shake')); this.select(h.cells[0]); this.sh.msg(h.text, 'bad'); snd.nope(); return; }
    this.snapshot(); this.hints++;
    const i = h.cell; this.sel = i; this.v[i] = h.digit; this.wrong.delete(i);
    if (this.auto) for (const j of PEERS[i]) this.notes[j] &= ~(1 << (h.digit - 1));
    this.render(); this.bump(i, 'hint'); this.sh.msg(h.text, 'tip', 4200); snd.sparkle(2);
    this.hudUpdate(); this.checkUnits(i); this.save(); this.checkWin();
  }
  bump(i, cls = 'shake') { const c = this.cells[i]; c.classList.remove('shake', 'pop', 'hint'); void c.offsetWidth; c.classList.add(cls); }
  checkUnits(i) {
    const us = [UNITS[ROW(i)], UNITS[9 + COL(i)], UNITS[18 + BOX(i)]].filter((u) => u.every((j) => this.v[j] === this.solution[j]));
    us.forEach((u, k) => setTimeout(() => {
      u.forEach((j, n) => { const c = this.cells[j]; c.style.setProperty('--d', `${n * 35}ms`); c.classList.remove('wave'); void c.offsetWidth; c.classList.add('wave'); });
      const a = this.cells[u[0]].getBoundingClientRect(), b = this.cells[u[8]].getBoundingClientRect();
      this.sh.fx.sweep({ left: a.left, top: a.top, width: b.right - a.left, height: b.bottom - a.top }, getComputedStyle(this.sh.el).getPropertyValue('--rp-acc2').trim() || '#ffd23f', 18);
      snd.sparkle(k);
    }, k * 160));
  }
  checkWin() {
    if (!this.v.every((x, i) => x === this.solution[i])) return;
    this.done = true; this.clock.stop(); clearInterval(this.tick); this.sh.end(); this.o.onSave?.(null);
    this.cells.forEach((c, i) => { c.style.setProperty('--d', `${(Math.abs(ROW(i) - 4) + Math.abs(COL(i) - 4)) * 45}ms`); c.classList.remove('wave'); void c.offsetWidth; c.classList.add('wave', 'win'); });
    setTimeout(() => this.sh.fx.confetti(140), 250);
    const stars = this.limitHit ? 1 : this.mistakes === 0 && this.hints === 0 ? 3 : this.mistakes + this.hints <= 2 ? 2 : 1;
    setTimeout(() => this.o.onEnd({ win: true, time: this.clock.sec, mistakes: this.mistakes, hints: this.hints, stars, limitHit: this.limitHit }), 1100);
  }
  save() {
    if (this.done) return;
    this.o.onSave?.({ seed: this.seed, diff: this.diff.id, puzzle: encode(this.puzzle), solution: encode(this.solution), v: encode(this.v), notes: this.notes.slice(), mistakes: this.mistakes, hints: this.hints, time: Math.round(this.clock.sec), limitHit: this.limitHit, kind: this.o.params.kind, n: this.o.params.n, key: this.o.params.key });
  }
  continueNoLimit() { this.limitHit = true; this.limitPending = false; this.sh.pause(false); this.hudUpdate(); this.save(); }
  // ---------------------------------------------------------------- input
  move(dx, dy) { const r = (ROW(this.sel) + dy + 9) % 9, c = (COL(this.sel) + dx + 9) % 9; this.select(r * 9 + c); snd.select(); }
  onKey(e) {
    if (this.done) return;
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); this.sh.pause(!this.sh.paused); return; }
    if (this.sh.paused) return;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) { e.preventDefault(); this.move(...arrows[k]); return; }
    if (/^[1-9]$/.test(k)) { e.preventDefault(); this.input(+k); return; }
    if (/^Numpad[1-9]$/.test(e.code)) { e.preventDefault(); this.input(+e.code.slice(6)); return; }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); this.erase(); return; }
    if (k === 'n' || k === 'N' || k === ' ') { e.preventDefault(); this.toggleNotes(); return; }
    if (k === 'z' || k === 'Z' || k === 'u') { e.preventDefault(); this.undo(); return; }
    if (k === 'h' || k === 'H') { e.preventDefault(); this.hint(); }
  }
  pad(b, down) {
    if (!down || this.done) return;
    if (b === 'start') { this.sh.pause(!this.sh.paused); return; }
    if (this.sh.paused) return;
    const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    if (dirs[b]) { this.move(...dirs[b]); this.rep(b); return; }
    if (b === 'lb' || b === 'rb') { this.padDigit = ((this.padDigit - 1 + (b === 'rb' ? 1 : 8)) % 9) + 1; snd.select(); this.render(); return; }
    if (b === 'a') this.input(this.padDigit);
    else if (b === 'b') this.erase();
    else if (b === 'x') this.toggleNotes();
    else if (b === 'y') this.hint();
    else if (b === 'sel') this.undo();
  }
  rep() {} // the d-pad steps one cell per press (repeat would overshoot on a 9×9 grid)
  onPause(on) { if (on) this.clock.stop(); else { this.clock.start(); this.limitPending = false; } this.o.onPause?.(on, on && this.limitPending ? 'limit' : ''); this.save(); }
  togglePause(on) { this.sh.pause(on); }
  destroy() { clearInterval(this.tick); this.unpad?.(); this.sh.destroy(); if (window.__rompicapo === this) window.__rompicapo = null; }
}
// tiny inline icons for the tool buttons (the shared set has no pencil/eraser)
export function ico(n) {
  const p = {
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    erase: '<path d="M16 3l5 5-11 11H5l-2-2L14 5z"/><path d="M9 19h12"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    hold: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/>',
    rotl: '<path d="M4 4v6h6"/><path d="M20 14a8 8 0 0 1-15.5 2.5M4.5 10A8 8 0 0 1 20 12"/>',
    rotr: '<path d="M20 4v6h-6"/><path d="M4 14a8 8 0 0 0 15.5 2.5M19.5 10A8 8 0 0 0 4 12"/>',
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', down: '<path d="M5 9l7 7 7-7"/>', drop: '<path d="M5 6l7 7 7-7M5 13l7 7 7-7"/>',
  }[n] || '';
  return `<svg class="rp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
