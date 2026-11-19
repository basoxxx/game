// Tavolo Baso · Scacchi — a game on screen: vs the computer (engine in the worker), two players on one device
// (board turning to the side to move, or a tablet laid flat), the mate-in-two puzzles. Tap/click a piece then
// a square, or drag it; keyboard and controller move a cursor over the squares. Undo, hints, clocks,
// promotion choice, PGN / FEN export.
import { icon } from '../../ui/icons.js';
import { esc } from '../../ui/dom.js';
import { Position, START_FEN, mFrom, mTo, mPromo, mFlag, FLAG_EP, FLAG_CASTLE, WHITE, toPGN, sqName } from '../chess/core.js';
import { LEVELS, isMateAfter, mateIn } from '../chess/ai.js';
import { think, cancelThinking } from '../ai-client.js';
import { Shell, snd, download, copyText, fmtClock } from './shell.js';
import { makeView, award, resultCard, pauseCard, wait } from './common.js';
import { CellOverlay } from '../view/overlay.js';
import { tvLoad, tvSave, addCoins, daily, notePuzzleDay } from '../store.js';
import { pieceIcon } from './icons.js';

const TL = ' PNBRQK';
const NAMES = ['', 'pedone', 'cavallo', 'alfiere', 'torre', 'donna', 're'];
export const CLOCKS = [{ id: 0, name: 'Senza orologio' }, { id: 1, name: '3 + 2', base: 3, inc: 2 }, { id: 2, name: '5 minuti', base: 5, inc: 0 }, { id: 3, name: '10 minuti', base: 10, inc: 0 }, { id: 4, name: '15 + 10', base: 15, inc: 10 }];
const WHY = { mate: 'Scacco matto', stallo: 'Stallo', materiale: 'Materiale insufficiente', '50mosse': 'Regola delle 50 mosse', ripetizione: 'Triplice ripetizione', tempo: 'Tempo scaduto', abbandono: 'Abbandono' };
const sqOf = (id) => { const [f, r] = id.split(',').map(Number); return r * 16 + f; };
const idOf = (s) => `${s & 7},${s >> 4}`;
const fr = (s) => [s & 7, s >> 4];

export class ChessGame {
  constructor(root, cfg, { onExit }) {
    this.cfg = cfg; this.onExit = onExit;
    this.puzzle = cfg.mode === 'puzzle' ? cfg.puzzle : null;
    const startFen = this.puzzle ? this.puzzle.fen : cfg.fen || START_FEN;
    this.pos = new Position(startFen); this.startFen = startFen;
    let me = cfg.color === 'b' ? 1 : cfg.color === 'r' ? (Math.random() < 0.5 ? 0 : 1) : 0;
    if (this.puzzle) me = this.pos.side;
    this.me = me;
    this.humans = cfg.mode === '2p' ? [true, true] : [me === 0, me === 1];
    this.level = cfg.level ?? 2;
    this.moves = []; this.sel = -1; this.over = null; this.busy = false; this.hint = null; this.tries = 0;
    const ck = CLOCKS[cfg.clock || 0];
    this.clock = ck.base && !this.puzzle ? { left: [ck.base * 60e3, ck.base * 60e3], inc: ck.inc * 1000, running: false, last: 0 } : null;
    const tools = this.puzzle
      ? [{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'retry', ic: 'replay', label: 'Riprova', key: 'r' }, { id: 'hint', ic: 'bulb', label: 'Aiuto', key: 'h' }, { id: 'view', ic: 'eye', label: 'Vista', key: 'v' }]
      : [{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'undo', ic: 'left', label: 'Annulla', key: 'u' }, ...(cfg.hints !== false ? [{ id: 'hint', ic: 'bulb', label: 'Suggerimento', key: 'h' }] : []), { id: 'view', ic: 'eye', label: 'Vista', key: 'v' }, { id: 'export', ic: 'download', label: 'PGN / FEN', key: 'e' }];
    this.shell = new Shell(root, {
      game: 'chess', accent: '#d9a441', flat: !!cfg.flat && cfg.mode === '2p', tools,
      side: `<div class="tv-side-h">${this.puzzle ? 'Puzzle' : 'Mosse'}</div><ol class="tv-moves"></ol><div class="tv-side-f"></div>`,
      onTool: (id) => this.tool(id), onPause: () => this.pause(),
    });
    this.movesEl = this.shell.sideEl.querySelector('.tv-moves'); this.sideF = this.shell.sideEl.querySelector('.tv-side-f');
    window.__tavolo = this;
  }
  async start() {
    const S = this.shell, flatTop = S.flat;
    const side = this.cfg.mode === '2p' ? (flatTop ? 0 : this.pos.side && this.cfg.rotate !== false ? 1 : 0) : this.me;
    const opts = { kind: 'chess', theme: S.theme, set: S.set, coords: this.cfg.coords !== false, side, flat: flatTop };
    this.view = await makeView(S, 'chess', async (stage) => { const { Board3D } = await import('../view/board3d.js'); return new Board3D(stage, opts); }, async (c) => { const { Board2D } = await import('../view/board2d.js'); return new Board2D(c, opts); });
    if (!this.shell) return; // closed while loading
    this.overlay = new CellOverlay(S.stageEl, {
      onActivate: (id) => this.tap(id), onFocus: (id) => { this.cursor = id; this.marks(); },
      canDrag: (id) => this.canMoveFrom(sqOf(id)), pick: (x, y) => { const s = this.view.pick?.(x, y); return s ? `${s[0]},${s[1]}` : null; },
      onDragStart: (id) => { const s = sqOf(id); this.select(s); this.view.lift(this.ids[s]); }, onDragMove: (id, x, y, over) => { this.view.dragTo(x, y); if (over !== this.cursor) { this.cursor = over; this.marks(); } },
      onDrop: (id, to) => { const f = sqOf(id); if (to && to !== id && this.tryMove(f, sqOf(to), true)) return; this.view.drop(); },
      label: (id) => this.label(id),
    });
    this.view.onLayout = () => this.overlay.update(this.view.quads().map((q) => ({ id: `${q.f},${q.r}`, pts: q.pts })));
    this.view.onLayout();
    this.initIds(); this.sync(true); this.marks(); this.hud();
    if (this.clock) this.tickT = setInterval(() => this.tickClock(), 100);
    if (this.puzzle) this.shell.msg(`${this.pos.side === WHITE ? 'Il Bianco' : 'Il Nero'} muove e dà matto in 2`, 'big', 3500);
    requestAnimationFrame(() => this.overlay?.focus(idOf(this.pos.kings[this.me])));
    this.maybeCPU();
  }
  initIds() { this.ids = new Int16Array(128); let n = 1; for (let s = 0; s < 120; s++) if (!(s & 0x88) && this.pos.board[s]) this.ids[s] = n++; }
  moveIds(m) {
    const ids = this.ids, f = mFrom(m), t = mTo(m), fl = mFlag(m);
    if (fl & FLAG_EP) ids[t + (this.pos.side === WHITE ? -16 : 16)] = 0; // side = mover here (called before make)
    ids[t] = ids[f]; ids[f] = 0;
    if (fl & FLAG_CASTLE) { const [rf, rt] = t === 6 ? [7, 5] : t === 2 ? [0, 3] : t === 118 ? [119, 117] : [112, 115]; ids[rt] = ids[rf]; ids[rf] = 0; }
  }
  pieceList() {
    const out = [], b = this.pos.board;
    for (let s = 0; s < 120; s++) { if (s & 0x88) { s += 7; continue; } if (b[s]) out.push({ id: this.ids[s], t: TL[b[s] & 7], c: b[s] >> 3, s: fr(s) }); }
    return out;
  }
  sync(instant = false, paths) { return this.view.setPieces(this.pieceList(), { instant, paths }); }
  label(id) {
    const s = sqOf(id), p = this.pos.board[s];
    return `${sqName(s)}${p ? `, ${NAMES[p & 7]} ${p >> 3 ? 'nero' : 'bianco'}` : ''}${this.sel === s ? ', selezionato' : ''}`;
  }
  legalFrom(s) { return this.pos.legal().filter((m) => mFrom(m) === s); }
  turnHuman() { return !this.over && this.humans[this.pos.side] && !this.busy; }
  canMoveFrom(s) { const p = this.pos.board[s]; return this.turnHuman() && p && p >> 3 === this.pos.side; }
  marks() {
    if (!this.view) return;
    const m = {}, last = this.moves[this.moves.length - 1];
    if (last) m.last = [fr(mFrom(last.m)), fr(mTo(last.m))];
    if (this.sel >= 0) {
      m.sel = fr(this.sel); m.moves = []; m.caps = [];
      for (const x of this.legalFrom(this.sel)) { const t = mTo(x); (this.pos.board[t] || mFlag(x) & FLAG_EP ? m.caps : m.moves).push(fr(t)); }
    }
    if (this.pos.inCheck()) m.check = fr(this.pos.kings[this.pos.side]);
    if (this.hint) m.hint = this.hint;
    if (this.cursor) m.cursor = this.cursor.split(',').map(Number);
    this.view.setMarks(m);
  }
  select(s) { this.sel = s; this.hint = null; this.marks(); this.overlay?.relabel(); }
  tap(id) {
    const s = sqOf(id);
    if (!this.turnHuman()) { if (this.over) return; if (this.busy) this.shell.msg('Aspetta: il computer sta pensando'); return; }
    const p = this.pos.board[s];
    if (this.sel >= 0 && s !== this.sel && this.tryMove(this.sel, s)) return;
    if (p && p >> 3 === this.pos.side) { if (this.sel === s) { this.select(-1); return; } snd('hover'); this.select(s); return; }
    if (this.sel >= 0) { snd('bad'); this.select(-1); }
  }
  tryMove(f, t, dragged = false) {
    const cands = this.legalFrom(f).filter((m) => mTo(m) === t);
    if (!cands.length) return false;
    if (cands.length > 1 && mPromo(cands[0])) { this.askPromotion(cands, dragged); return true; }
    this.play(cands[0], { dragged });
    return true;
  }
  askPromotion(cands, dragged) {
    const side = this.pos.side;
    const opts = [5, 4, 3, 2].map((t) => `<button class="tv-promo" data-tv="pr${t}" aria-label="${NAMES[t]}">${pieceIcon(TL[t], side, this.shell.set)}<span>${NAMES[t]}</span></button>`).join('');
    const acts = {}; for (const t of [5, 4, 3, 2]) acts['pr' + t] = () => { this.shell.closeDialog(); this.play(cands.find((m) => mPromo(m) === t), { dragged }); };
    this.shell.dialog(`<h2>Promozione</h2><p class="tv-note">Scegli il pezzo che prende il posto del pedone.</p><div class="tv-promos">${opts}</div>`, acts, { cancel: () => { this.shell.closeDialog(); this.view.drop(); this.select(-1); }, rot: this.shell.flat && side === 1 });
  }
  async play(m, { dragged = false, cpu = false } = {}) {
    const pos = this.pos, san = pos.san(m), sanIt = pos.san(m, true), cap = pos.board[mTo(m)] || mFlag(m) & FLAG_EP, mover = pos.side;
    if (!cpu) this.view.drop?.();
    this.moveIds(m); pos.make(m); pos.stack.length = 0;
    this.moves.push({ m, uci: pos.uci(m), san, sanIt });
    if (this.clock) { if (this.clock.running) this.clock.left[mover] += this.clock.inc; this.clock.running = true; this.clock.last = performance.now(); }
    this.sel = -1; this.hint = null;
    const st = pos.status();
    this.busy = true;
    this.marks(); this.hud();
    const anim = this.sync(false);
    snd(cap ? 'tick' : 'click'); if (!dragged) { /* the slide is the feedback */ }
    await anim; if (!this.shell) return;
    if (cap) snd('click');
    if (pos.inCheck() && !st.over) snd('notify');
    this.busy = false;
    if (this.puzzle && !cpu) { this.puzzleStep(st); return; }
    if (st.over) { this.finish(st); return; }
    if (this.cfg.mode === '2p' && this.cfg.rotate !== false && !this.shell.flat) this.view.setSide(pos.side, 0.9);
    this.marks(); this.hud(); this.overlay.relabel();
    this.maybeCPU();
  }
  async maybeCPU() {
    if (this.over || this.humans[this.pos.side] || this.busy) return;
    this.busy = true; this.shell.thinking(true); this.hud();
    const job = { kind: 'chess', startFen: this.startFen, history: this.moves.map((x) => x.uci), level: this.level };
    const gen = this.gen = (this.gen || 0) + 1;
    let r;
    try { r = await think(job, 450); } catch (e) { console.error(e); }
    if (gen !== this.gen || !this.shell) return;
    this.shell.thinking(false); this.busy = false;
    const m = r && this.pos.parse(r.uci) || this.pos.legal()[0];
    if (m) this.play(m, { cpu: true });
  }
  // ── puzzle flow: key move → the computer defends → mate
  async puzzleStep(st) {
    const P = this.puzzle;
    if (st.over && st.why === 'mate') { this.solved(); return; }
    const plies = this.moves.length;
    if (plies === 1 && isMateAfter(this.pos, 2)) {
      this.shell.msg('Ottima mossa! Ora il Nero si difende…'.replace('Nero', this.pos.side ? 'Nero' : 'Bianco'), 'good');
      this.busy = true; await wait(650); if (!this.shell) return;
      // the hardest defence: the reply that leaves the fewest mates
      let best = null, bn = 1e9;
      for (const d of this.pos.legal()) { this.pos.make(d); let n = 0; for (const a of this.pos.legal()) { this.pos.make(a); if (!this.pos.hasLegal() && this.pos.inCheck()) n++; this.pos.unmake(); } this.pos.unmake(); if (n < bn) { bn = n; best = d; } }
      this.busy = false;
      if (best) await this.play(best, { cpu: true });
      this.shell.msg('Adesso il matto!', 'good');
      return;
    }
    this.tries++;
    snd('bad'); this.shell.msg(plies === 1 ? 'Non è la mossa giusta: il matto in 2 sfugge. Riprova!' : 'Non è matto. Riprova dall’inizio!', 'bad', 2600);
    P.failed = true;
    this.busy = true; await wait(1100); if (!this.shell) return; this.busy = false;
    this.restartPuzzle();
  }
  restartPuzzle() {
    cancelThinking(); this.gen = (this.gen || 0) + 1;
    this.pos = new Position(this.startFen); this.moves = []; this.sel = -1; this.hint = null; this.over = null; this.busy = false;
    this.view.clearTrays?.(); this.initIds(); this.view.reset(); this.sync(true); this.marks(); this.hud(); this.shell.closeDialog();
  }
  solved() {
    const P = this.puzzle, d = tvLoad();
    let coins = 0, first = false;
    if (P.daily) {
      const dl = daily(d);
      if (!dl.chess?.done) { first = true; coins = addCoins(d, P.failed || this.usedHint ? 35 : 60); d.stats.puzzles++; notePuzzleDay(d); }
      dl.chess = { done: true, tries: (dl.chess?.tries || 0) + this.tries + 1 };
    } else { coins = addCoins(d, this.usedHint ? 3 : 10); d.stats.puzzles++; }
    tvSave(d);
    this.over = { result: 'puzzle' }; snd('win');
    this.hud();
    this.shell.dialog(resultCard({ title: 'Scacco matto!', sub: P.daily ? 'Puzzle del giorno · risolto' : `Puzzle n. ${P.n + 1} · risolto`, coins, extra: `<p class="tv-note">${first ? `Serie di giorni: <b>${d.stats.streak}</b>. ` : ''}Soluzione: <b>${esc(this.moves.map((x) => x.sanIt).join(' '))}</b>${this.tries ? ` · tentativi falliti: ${this.tries}` : ''}</p>`,
      buttons: [{ id: 'next', label: 'Altro puzzle', ic: 'play', primary: true }, { id: 'menu', label: 'Menu Tavolo', ic: 'left' }] }), { next: () => this.onExit('next-puzzle'), menu: () => this.onExit('menu') });
  }
  async tool(id) {
    if (id === 'pause') return this.pause();
    if (id === 'view') { this.view.setFlat?.(!this.view.flat); return; }
    if (id === 'undo') return this.undo();
    if (id === 'retry') return this.restartPuzzle();
    if (id === 'hint') return this.hintMove();
    if (id === 'export') return this.exportDlg();
  }
  async hintMove() {
    if (!this.turnHuman()) return;
    if (this.puzzle) {
      this.usedHint = true;
      const m = this.moves.length === 0 ? this.pos.parse(this.puzzle.key) : mateIn(this.pos, 1);
      if (m) { this.hint = [fr(mFrom(m)), fr(mTo(m))]; this.marks(); this.shell.msg('Suggerimento: la mossa evidenziata in verde'); }
      return;
    }
    this.busy = true; this.shell.thinking(true);
    const gen = this.gen = (this.gen || 0) + 1;
    let r; try { r = await think({ kind: 'chess-hint', startFen: this.startFen, history: this.moves.map((x) => x.uci), ms: 700 }, 200); } catch {}
    if (gen !== this.gen || !this.shell) return;
    this.busy = false; this.shell.thinking(false);
    const m = r && this.pos.parse(r.uci);
    if (m) { this.hint = [fr(mFrom(m)), fr(mTo(m))]; this.marks(); this.shell.msg(`Suggerimento: ${this.pos.san(m, true)}`); }
  }
  undo() {
    if (this.puzzle) return this.restartPuzzle();
    if (!this.moves.length) return;
    cancelThinking(); this.gen = (this.gen || 0) + 1; this.busy = false; this.shell.thinking(false);
    let n = 1;
    if (this.cfg.mode !== '2p') { n = this.humans[this.pos.side] ? 2 : 1; if (this.over) n = this.humans[this.pos.side] ? 2 : 1; }
    n = Math.min(n, this.moves.length);
    const keep = this.moves.slice(0, this.moves.length - n);
    if (!keep.length && !this.humans[new Position(this.startFen).side]) { if (this.moves.length <= 1) return; }
    this.pos = new Position(this.startFen); this.initIds();
    for (const x of keep) { this.moveIds(x.m); this.pos.make(x.m); this.pos.stack.length = 0; }
    this.moves = keep; this.over = null; this.sel = -1; this.hint = null;
    this.shell.closeDialog();
    this.view.clearTrays?.(); this.view.reset(); this.sync(true);
    // pieces already captured go straight back to the tray
    this.marks(); this.hud(); this.overlay.relabel(); snd('back');
    if (this.cfg.mode === '2p' && this.cfg.rotate !== false && !this.shell.flat) this.view.setSide(this.pos.side, 0.6);
    this.maybeCPU();
  }
  tickClock() {
    const c = this.clock; if (!c || !c.running || this.over || this.shell.dlg.hidden === false) { if (c) c.last = performance.now(); return; }
    const now = performance.now(), s = this.pos.side; c.left[s] -= now - c.last; c.last = now;
    if (c.left[s] <= 0) {
      c.left[s] = 0;
      // the other side wins on time unless it cannot mate at all
      const p = this.pos.clone(); p.side ^= 1;
      const draw = (() => { const b = p.board; let n = 0, other = false; for (let q = 0; q < 120; q++) { if (q & 0x88) { q += 7; continue; } const x = b[q]; if (x && x >> 3 === (s ^ 1) && (x & 7) !== 6) { n++; if ((x & 7) !== 2 && (x & 7) !== 3) other = true; } } return !other && n <= 1; })();
      this.finish({ over: true, result: draw ? '1/2-1/2' : s ? '1-0' : '0-1', why: 'tempo' });
    }
    this.clockHud();
  }
  clockHud() {
    if (!this.clock) return;
    for (const i of [0, 1]) { const el = (this.viewSeat(i) ? this.shell.top : this.shell.bot).querySelector('.tv-clock'); if (el) { el.textContent = fmtClock(this.clock.left[i]); el.classList.toggle('low', this.clock.left[i] < 20000); } }
  }
  viewSeat(color) { const bottom = this.shell.flat || this.cfg.mode === '2p' ? 0 : this.me; return color === bottom ? 0 : 1; }
  material(color) {
    // pieces of the other colour this side has taken, and the material balance
    const start = new Position(this.startFen).board, now = this.pos.board, cnt = (b, c) => { const a = [0, 0, 0, 0, 0, 0, 0]; for (let s = 0; s < 120; s++) { if (s & 0x88) { s += 7; continue; } if (b[s] && b[s] >> 3 === c) a[b[s] & 7]++; } return a; };
    const a0 = cnt(start, color ^ 1), a1 = cnt(now, color ^ 1), mine = cnt(now, color);
    let html = ''; for (const t of [5, 4, 3, 2, 1]) for (let k = 0; k < Math.max(0, a0[t] - a1[t]); k++) html += pieceIcon(TL[t], color ^ 1, this.shell.set, 'tv-cap');
    const v = [0, 1, 3, 3, 5, 9, 0], diff = mine.reduce((s, n, t) => s + n * v[t], 0) - a1.reduce((s, n, t) => s + n * v[t], 0);
    return html + (diff > 0 ? `<em>+${diff}</em>` : '');
  }
  hud() {
    const S = this.shell, pos = this.pos, cpuName = `Computer · ${LEVELS[this.level].name}`;
    for (const color of [0, 1]) {
      const human = this.humans[color], turn = !this.over && pos.side === color;
      const name = this.cfg.mode === '2p' ? (color ? 'Nero' : 'Bianco') : human ? 'Tu' : cpuName;
      let sub = color ? 'Neri' : 'Bianchi';
      if (turn) sub = this.busy && !human ? 'sta pensando…' : pos.inCheck() ? '<b class="tv-chk">Scacco!</b> tocca a ' + (human && this.cfg.mode !== '2p' ? 'te' : 'lui') : human ? (this.cfg.mode === '2p' ? 'tocca a te' : 'tocca a te') : 'tocca al computer';
      if (this.puzzle) sub = color === this.me ? `matto in 2 · ${turn ? 'tocca a te' : ''}` : 'si difende';
      S.seat(this.viewSeat(color), { name, sub, color: color ? '#26201c' : '#efe3c8', active: turn, clock: this.clock ? fmtClock(this.clock.left[color]) : null, extra: this.puzzle ? '' : this.material(color) });
    }
    // move list
    const ms = this.moves; let h = '';
    const black0 = new Position(this.startFen).side === 1;
    for (let i = 0; i < ms.length; i += 1) {
      const k = i + (black0 ? 1 : 0);
      if (k % 2 === 0) h += `<li><span>${Math.floor(k / 2) + 1}.</span>`;
      else if (i === 0) h += `<li><span>${1}…</span>`;
      h += `<b class="${i === ms.length - 1 ? 'cur' : ''}">${esc(ms[i].sanIt)}</b>`;
      if (k % 2 === 1) h += '</li>';
    }
    this.movesEl.innerHTML = h || `<li class="tv-empty">${this.puzzle ? 'Trova il matto in due mosse.' : 'Nessuna mossa'}</li>`;
    this.movesEl.scrollTop = 1e6; this.movesEl.scrollLeft = 1e6;
    this.sideF.innerHTML = this.puzzle ? `<p class="tv-note">${this.puzzle.daily ? 'Puzzle del giorno' : `Puzzle n. ${this.puzzle.n + 1}`} · ${pos.side === WHITE ? 'muove il Bianco' : 'muove il Nero'}</p>` : `<p class="tv-note">${this.cfg.mode === '2p' ? 'Due giocatori' : `Contro il computer · ${LEVELS[this.level].name} (${LEVELS[this.level].elo})`}${this.clock ? ` · ${CLOCKS[this.cfg.clock].name}` : ''}</p>`;
    S.enableTool('undo', !!this.moves.length && !this.busy);
    S.enableTool('hint', !this.over);
  }
  finish(st) {
    this.over = st; this.gen = (this.gen || 0) + 1; cancelThinking(); this.busy = false; this.shell.thinking(false);
    if (this.clock) this.clock.running = false;
    this.marks(); this.hud();
    const res = st.result, winner = res === '1-0' ? 0 : res === '0-1' ? 1 : -1;
    let title, outcome;
    if (this.cfg.mode === '2p') { title = winner < 0 ? 'Patta' : `Vince il ${winner ? 'Nero' : 'Bianco'}`; outcome = '2p'; }
    else { outcome = winner < 0 ? 'draw' : winner === this.me ? 'win' : 'loss'; title = outcome === 'win' ? 'Hai vinto!' : outcome === 'loss' ? 'Ha vinto il computer' : 'Patta'; }
    const r = award('chess', outcome, { level: this.level, mode: this.cfg.mode === '2p' ? '2p' : 'cpu' });
    snd(outcome === 'win' ? 'win' : outcome === 'loss' ? 'bad' : 'ok');
    if (outcome === 'win' || outcome === '2p') setTimeout(() => snd('coin'), 900);
    setTimeout(() => {
      if (!this.shell) return;
      this.shell.dialog(resultCard({ title, sub: `${WHY[st.why] || ''} · ${res.replace('1/2', '½').replace('1/2', '½')} · ${this.moves.length} semimosse`, coins: r.coins, record: r.record,
        buttons: [{ id: 'again', label: 'Rivincita', ic: 'replay', primary: true }, { id: 'export', label: 'PGN / FEN', ic: 'download' }, { id: 'look', label: 'Guarda la scacchiera', ic: 'eye', ghost: true }, { id: 'menu', label: 'Menu Tavolo', ic: 'left', ghost: true }] }),
      { again: () => this.onExit('again'), export: () => this.exportDlg(), look: () => this.shell.closeDialog(), menu: () => this.onExit('menu') }, { cancel: () => this.shell.closeDialog() });
    }, 700);
  }
  pgn() {
    const res = this.over?.result && this.over.result !== 'puzzle' ? this.over.result : '*';
    const cpu = `Computer (${LEVELS[this.level].name})`;
    return toPGN({ moves: this.moves.map((x) => x.san), result: res, startFen: this.startFen, white: this.cfg.mode === '2p' ? 'Bianco' : this.me === 0 ? 'Giocatore' : cpu, black: this.cfg.mode === '2p' ? 'Nero' : this.me === 1 ? 'Giocatore' : cpu });
  }
  exportDlg() {
    const pgn = this.pgn(), fen = this.pos.fen();
    const back = this.over ? () => this.finish(this.over) : () => this.shell.closeDialog();
    this.shell.dialog(`<h2>Esporta la partita</h2><label class="tv-lab">PGN</label><textarea class="tv-ta" readonly rows="6">${esc(pgn)}</textarea><label class="tv-lab">FEN (posizione attuale)</label><input class="tv-ta" readonly value="${esc(fen)}">
      <div class="tv-dbtns"><button class="btn primary" data-tv="dl">${icon('download')} Scarica PGN</button><button class="btn" data-tv="cp">Copia PGN</button><button class="btn" data-tv="cf">Copia FEN</button><button class="btn ghost" data-tv="close">Chiudi</button></div>`, {
      dl: () => { download(`tavolo-scacchi-${new Date().toISOString().slice(0, 10)}.pgn`, pgn); this.shell.msg('PGN scaricato'); },
      cp: async () => this.shell.msg((await copyText(pgn)) ? 'PGN copiato' : 'Copia non riuscita'),
      cf: async () => this.shell.msg((await copyText(fen)) ? 'FEN copiata' : 'Copia non riuscita'),
      close: () => { this.shell.closeDialog(); },
    }, { cancel: () => this.shell.closeDialog() });
    void back;
  }
  pause() {
    const can = !this.over && !this.puzzle;
    this.shell.dialog(pauseCard({ title: 'Pausa', lines: [this.puzzle ? 'Puzzle: trova il matto in due.' : `${this.cfg.mode === '2p' ? 'Partita a due' : `Contro il computer · ${LEVELS[this.level].name}`} · ${this.moves.length} semimosse`],
      buttons: [{ id: 'resume', label: 'Riprendi', ic: 'play', primary: true }, ...(can ? [{ id: 'resign', label: 'Abbandona', ic: 'flag' }, { id: 'drawo', label: 'Patta d’accordo', ic: 'scales' }] : []), { id: 'restart', label: 'Ricomincia', ic: 'replay' }, { id: 'menu', label: 'Esci al menu', ic: 'left', ghost: true }] }), {
      resume: () => this.shell.closeDialog(),
      resign: () => { this.shell.closeDialog(); const loser = this.cfg.mode === '2p' ? this.pos.side : this.me; this.finish({ over: true, result: loser ? '1-0' : '0-1', why: 'abbandono' }); },
      drawo: () => { this.shell.closeDialog(); this.finish({ over: true, result: '1/2-1/2', why: 'accordo' }); },
      restart: () => { this.shell.closeDialog(); if (this.puzzle) this.restartPuzzle(); else this.onExit('again'); },
      menu: () => this.onExit('menu'),
    }, { cancel: () => this.shell.closeDialog() });
  }
  // test hooks
  state() { return { fen: this.pos.fen(), moves: this.moves.map((x) => x.uci), over: this.over, busy: this.busy, turn: this.pos.side, sel: this.sel }; }
  dispose() {
    this.gen = (this.gen || 0) + 1; cancelThinking(); clearInterval(this.tickT);
    this.overlay?.dispose(); this.view?.stage?.dispose ? this.view.stage.dispose() : this.view?.dispose?.();
    this.shell?.dispose(); this.shell = null;
    if (window.__tavolo === this) window.__tavolo = null;
  }
}
WHY.accordo = 'Patta d’accordo';
