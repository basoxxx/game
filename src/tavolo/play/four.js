// Tavolo Baso · Quattro in fila — vs the computer (negamax in the worker), two players, or the puzzle of the
// day (win in three moves whatever the defence). Tap/click a column, or move with arrows / 1-7 / controller.
import { newFour, drop, undoDrop, status, canPlay, cloneFour, winIn, fourPuzzle, searchFour, FOUR_LEVELS, COLS } from '../four/core.js';
import { think, cancelThinking } from '../ai-client.js';
import { Shell, snd } from './shell.js';
import { makeView, award, resultCard, pauseCard, wait } from './common.js';
import { CellOverlay } from '../view/overlay.js';
import { tvLoad, tvSave, addCoins, daily, dayNumber, notePuzzleDay } from '../store.js';

export class FourGame {
  constructor(root, cfg, { onExit }) {
    this.cfg = cfg; this.onExit = onExit;
    this.s = newFour(); this.over = null; this.busy = false; this.hint = -1;
    this.level = cfg.level ?? 1;
    if (cfg.mode === 'puzzle') {
      const pz = fourPuzzle(dayNumber() * 7919 + 17, 3) || fourPuzzle(12345, 3);
      this.pz = { ...pz, left: 3 }; for (const c of pz.moves) drop(this.s, c);
      this.start0 = pz.moves.slice();
      this.me = this.s.turn; this.humans = { [this.me]: true, [3 - this.me]: false };
    } else {
      const first = cfg.first === 0 ? (Math.random() < 0.5 ? 1 : 2) : cfg.first || 1;
      // player 1 always drops first; the human takes colour 1 when starting
      this.me = cfg.mode === '2p' ? 1 : first === 1 ? 1 : 2;
      this.humans = cfg.mode === '2p' ? { 1: true, 2: true } : { [this.me]: true, [3 - this.me]: false };
      this.start0 = [];
    }
    const tools = this.pz ? [{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'retry', ic: 'replay', label: 'Riprova', key: 'r' }, { id: 'hint', ic: 'bulb', label: 'Aiuto', key: 'h' }]
      : [{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'undo', ic: 'left', label: 'Annulla', key: 'u' }, { id: 'hint', ic: 'bulb', label: 'Suggerimento', key: 'h' }];
    this.shell = new Shell(root, { game: 'four', accent: '#3d7fd9', flat: !!cfg.flat && cfg.mode === '2p', tools, side: '<div class="tv-side-h">Partita</div><ol class="tv-moves"></ol><div class="tv-side-f"></div>', onTool: (id) => this.tool(id), onPause: () => this.pause(), onKey: (e) => { const n = +e.key; if (n >= 1 && n <= 7) { e.preventDefault(); this.overlay?.focus(String(n - 1)); this.dropIn(n - 1); } } });
    this.movesEl = this.shell.sideEl.querySelector('.tv-moves'); this.sideF = this.shell.sideEl.querySelector('.tv-side-f');
    window.__tavolo = this;
  }
  async start() {
    const S = this.shell, opts = { theme: S.theme, set: S.set };
    this.view = await makeView(S, 'four', async (stage) => { const { Four3D } = await import('../view/four3d.js'); return new Four3D(stage, opts); }, async (c) => { const { Four2D } = await import('../view/four2d.js'); return new Four2D(c, opts); });
    if (!this.shell) return;
    this.overlay = new CellOverlay(S.stageEl, {
      onActivate: (id) => this.dropIn(+id), onFocus: (id) => { this.col = id == null ? -1 : +id; this.ghost(); },
      label: (id) => `Colonna ${+id + 1}${canPlay(this.s, +id) ? '' : ', piena'}`, cls: 'cols',
    });
    S.stageEl.addEventListener('pointermove', (e) => { const b = e.target.closest?.('.tv-cell'); const c = b ? +b.dataset.id : -1; if (c !== this.col) { this.col = c; this.ghost(); } });
    S.stageEl.addEventListener('pointerleave', () => { this.col = -1; this.ghost(); });
    this.view.onLayout = () => this.overlay.update(this.view.quads().map((q) => ({ id: String(q.c), pts: q.pts })));
    this.view.onLayout();
    this.sync(true); this.refresh();
    if (this.pz) this.shell.msg(`Vinci in ${this.pz.left} mosse, qualunque cosa faccia l’avversario`, 'big', 3500);
    requestAnimationFrame(() => this.overlay?.focus('3'));
    this.maybeCPU();
  }
  list() { const out = []; this.s.moves.forEach((c, i) => { const r = this.s.moves.slice(0, i).filter((x) => x === c).length; out.push({ id: `${i}:${c},${r}`, p: (i % 2) + 1, c, r }); }); return out; }
  sync(instant) { return this.view.setDiscs(this.list(), { instant }); }
  ghost() { this.view?.setGhost(this.turnHuman() && this.col >= 0 && canPlay(this.s, this.col) ? this.col : -1, this.s.turn); }
  turnHuman() { return !this.over && !this.busy && this.humans[this.s.turn]; }
  async dropIn(c) {
    if (!this.turnHuman()) { if (this.busy) this.shell.msg('Aspetta il tuo turno'); return; }
    if (!canPlay(this.s, c)) { snd('bad'); this.shell.msg('Colonna piena', 'bad'); return; }
    await this.play(c);
  }
  async play(c, cpu = false) {
    drop(this.s, c); this.hint = -1; this.busy = true; this.ghost(); this.refresh();
    snd('whoosh');
    await this.sync(false); if (!this.shell) return;
    snd('click');
    this.busy = false;
    const st = status(this.s);
    if (st.over) { this.finish(st); return; }
    if (this.pz && !cpu) { await this.puzzleStep(); return; }
    this.refresh(); this.ghost(); this.overlay.relabel();
    this.maybeCPU();
  }
  async maybeCPU() {
    if (this.over || this.humans[this.s.turn] || this.busy) return;
    this.busy = true; this.shell.thinking(true); this.refresh();
    const gen = this.gen = (this.gen || 0) + 1;
    let col = -1;
    if (this.pz) { col = searchFour(this.s, { depth: 10, ms: 600 }).col; await wait(500); }
    else { try { col = await think({ kind: 'four', cells: Array.from(this.s.cells), h: Array.from(this.s.h), turn: this.s.turn, moves: this.s.moves, level: this.level }, 450); } catch (e) { console.error(e); } }
    if (gen !== this.gen || !this.shell) return;
    this.shell.thinking(false); this.busy = false;
    if (col < 0 || !canPlay(this.s, col)) col = [3, 2, 4, 1, 5, 0, 6].find((x) => canPlay(this.s, x));
    await this.play(col, true);
  }
  async puzzleStep() {
    this.pz.left--;
    // still winning? every defence must lose within the moves left
    let still = false;
    if (this.pz.left > 0) {
      still = true;
      for (let d = 0; d < COLS && still; d++) { if (!canPlay(this.s, d)) continue; drop(this.s, d); const st = status(this.s); if (st.over || winIn(this.s, this.pz.left) < 0) still = false; undoDrop(this.s); }
    }
    if (!still) {
      snd('bad'); this.shell.msg('Così l’avversario si salva: riprova!', 'bad', 2400);
      this.pz.failed = true; this.busy = true; await wait(1200); if (!this.shell) return; this.busy = false; this.restart(); return;
    }
    this.shell.msg(`Bene! Ancora ${this.pz.left} ${this.pz.left === 1 ? 'mossa' : 'mosse'}`, 'good');
    this.refresh(); this.maybeCPU();
  }
  restart() {
    cancelThinking(); this.gen = (this.gen || 0) + 1; this.busy = false; this.over = null; this.shell.closeDialog();
    this.s = newFour(); for (const c of this.start0) drop(this.s, c); if (this.pz) this.pz.left = this.pz.n;
    this.view.setWin(null); this.sync(true); this.refresh(); this.ghost();
  }
  async tool(id) {
    if (id === 'pause') return this.pause();
    if (id === 'retry') return this.restart();
    if (id === 'undo') return this.undo();
    if (id === 'hint') {
      if (!this.turnHuman()) return;
      let c = -1;
      if (this.pz) { c = winIn(cloneFour(this.s), this.pz.left); this.usedHint = true; }
      else { this.busy = true; this.shell.thinking(true); const gen = this.gen = (this.gen || 0) + 1; try { c = await think({ kind: 'four', cells: Array.from(this.s.cells), h: Array.from(this.s.h), turn: this.s.turn, moves: this.s.moves, hint: true }, 200); } catch {} if (gen !== this.gen || !this.shell) return; this.busy = false; this.shell.thinking(false); }
      if (c >= 0) { this.hint = c; this.overlay.focus(String(c)); this.shell.msg(`Suggerimento: colonna ${c + 1}`); this.refresh(); }
    }
  }
  undo() {
    if (this.s.moves.length <= this.start0.length) return;
    cancelThinking(); this.gen = (this.gen || 0) + 1; this.busy = false; this.shell.thinking(false); this.shell.closeDialog();
    if (this.cfg.mode === '2p') undoDrop(this.s);
    else while (this.s.moves.length > this.start0.length) { const mover = 3 - this.s.turn; undoDrop(this.s); if (this.humans[mover]) break; }
    this.over = null; this.view.setWin(null); this.sync(true); this.refresh(); this.ghost(); snd('back');
    this.maybeCPU();
  }
  refresh() {
    const S = this.shell, names = { 1: 'Giocatore 1', 2: 'Giocatore 2' };
    for (const p of [1, 2]) {
      const human = this.humans[p], turn = !this.over && this.s.turn === p;
      const name = this.cfg.mode === '2p' ? names[p] : human ? 'Tu' : `Computer · ${FOUR_LEVELS[this.level].name}`;
      const sub = turn ? (this.busy && !human ? 'sta pensando…' : human ? (this.pz ? `vinci in ${this.pz.left}` : 'tocca a te') : 'tocca al computer') : (p === 1 ? 'inizia' : 'secondo');
      const seat = this.cfg.mode === '2p' ? (p === 1 ? 0 : 1) : (p === this.me ? 0 : 1);
      S.seat(seat, { name, sub, color: S.set.discs[p - 1], active: turn, extra: `<em>${this.s.moves.filter((_, i) => i % 2 === p - 1).length} dischi</em>` });
    }
    const ms = this.s.moves.slice(this.start0.length);
    this.movesEl.innerHTML = ms.length ? ms.map((c, i) => `<li><span>${i + 1}.</span><b class="${i === ms.length - 1 ? 'cur' : ''}">colonna ${c + 1}</b></li>`).join('') : `<li class="tv-empty">${this.pz ? 'Trova la sequenza vincente.' : 'Lascia cadere il primo disco.'}</li>`;
    this.movesEl.scrollTop = 1e6; this.movesEl.scrollLeft = 1e6;
    this.sideF.innerHTML = `<p class="tv-note">${this.pz ? 'Puzzle del giorno · vinci in 3' : this.cfg.mode === '2p' ? 'Due giocatori' : `Contro il computer · ${FOUR_LEVELS[this.level].name}`} · tasti <kbd>1</kbd>–<kbd>7</kbd></p>`;
    S.enableTool('undo', this.s.moves.length > this.start0.length);
  }
  finish(st) {
    this.over = st; this.gen = (this.gen || 0) + 1; cancelThinking(); this.busy = false; this.shell.thinking(false);
    this.view.setWin(st.line || null); this.ghost(); this.refresh();
    if (this.pz) {
      if (st.winner === this.me) return this.puzzleSolved();
      this.shell.msg('Hai perso il filo: riprova!', 'bad'); setTimeout(() => this.restart(), 1400); return;
    }
    let title, outcome;
    if (this.cfg.mode === '2p') { outcome = '2p'; title = st.winner ? `Vince il giocatore ${st.winner}` : 'Pareggio: griglia piena'; }
    else { outcome = !st.winner ? 'draw' : st.winner === this.me ? 'win' : 'loss'; title = outcome === 'win' ? 'Quattro in fila!' : outcome === 'loss' ? 'Ha vinto il computer' : 'Pareggio'; }
    const r = award('four', outcome, { level: this.level, mode: this.cfg.mode === '2p' ? '2p' : 'cpu' });
    snd(outcome === 'win' || outcome === '2p' ? 'win' : outcome === 'loss' ? 'bad' : 'ok');
    setTimeout(() => {
      if (!this.shell) return;
      this.shell.dialog(resultCard({ title, sub: `${this.s.moves.length} dischi`, coins: r.coins, record: r.record, buttons: [{ id: 'again', label: 'Rivincita', ic: 'replay', primary: true }, { id: 'look', label: 'Guarda la griglia', ic: 'eye' }, { id: 'menu', label: 'Menu Tavolo', ic: 'left', ghost: true }] }),
        { again: () => this.onExit('again'), look: () => this.shell.closeDialog(), menu: () => this.onExit('menu') }, { cancel: () => this.shell.closeDialog() });
    }, 900);
  }
  puzzleSolved() {
    const d = tvLoad(), dl = daily(d); let coins = 0;
    if (!dl.four?.done) { coins = addCoins(d, this.pz.failed || this.usedHint ? 25 : 40); d.stats.puzzles++; notePuzzleDay(d); }
    dl.four = { done: true }; tvSave(d); snd('win');
    setTimeout(() => this.shell?.dialog(resultCard({ title: 'Quattro in fila!', sub: 'Puzzle del giorno · risolto', coins, extra: `<p class="tv-note">Serie di giorni: <b>${d.stats.streak}</b>.</p>`, buttons: [{ id: 'menu2', label: 'Altri puzzle', ic: 'calendar', primary: true }, { id: 'menu', label: 'Menu Tavolo', ic: 'left' }] }), { menu2: () => this.onExit('next-puzzle'), menu: () => this.onExit('menu') }), 900);
  }
  pause() {
    this.shell.dialog(pauseCard({ lines: [this.pz ? 'Puzzle del giorno: vinci entro 3 mosse.' : `${this.cfg.mode === '2p' ? 'Partita a due' : `Contro il computer · ${FOUR_LEVELS[this.level].name}`} · ${this.s.moves.length} dischi`],
      buttons: [{ id: 'resume', label: 'Riprendi', ic: 'play', primary: true }, { id: 'restart', label: 'Ricomincia', ic: 'replay' }, { id: 'menu', label: 'Esci al menu', ic: 'left', ghost: true }] }), {
      resume: () => this.shell.closeDialog(), restart: () => { if (this.pz) this.restart(); else this.onExit('again'); }, menu: () => this.onExit(this.pz ? 'next-puzzle' : 'menu'),
    }, { cancel: () => this.shell.closeDialog() });
  }
  state() { return { moves: this.s.moves.slice(), turn: this.s.turn, over: this.over, busy: this.busy, me: this.me, left: this.pz?.left }; }
  dispose() {
    this.gen = (this.gen || 0) + 1; cancelThinking();
    this.overlay?.dispose(); this.view?.stage?.dispose ? this.view.stage.dispose() : this.view?.dispose?.();
    this.shell?.dispose(); this.shell = null;
    if (window.__tavolo === this) window.__tavolo = null;
  }
}
