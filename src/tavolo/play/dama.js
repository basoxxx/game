// Tavolo Baso · Dama italiana — a game on screen (vs the computer in the worker, or two players on one device).
// Tap a man then its landing square (or drag it); capture sequences hop square by square; when a capture is
// possible only the men that must capture can be picked.
import { esc } from '../../ui/dom.js';
import { initial, legalMoves, play as playMove, status, moveName, sqName, DAMA_LEVELS } from '../dama/core.js';
import { think, cancelThinking } from '../ai-client.js';
import { Shell, snd } from './shell.js';
import { makeView, award, resultCard, pauseCard } from './common.js';
import { CellOverlay } from '../view/overlay.js';
import { damaIcon } from './icons.js';

const WHY = { pezzi: 'Tutti i pezzi catturati', bloccato: 'Nessuna mossa possibile', mosse: '40 mosse senza prese né mosse di pedina', ripetizione: 'Triplice ripetizione', abbandono: 'Abbandono', accordo: 'Patta d’accordo' };
const sqOf = (id) => { const [x, y] = id.split(',').map(Number); return y * 8 + x; };
const fr = (s) => [s & 7, s >> 3];
const colOf = (p) => (p > 0 ? 0 : 1);
const sideOf = (c) => (c ? -1 : 1);

export class DamaGame {
  constructor(root, cfg, { onExit }) {
    this.cfg = cfg; this.onExit = onExit;
    this.st = initial(); this.hist = [];
    this.me = cfg.color === 'b' ? 1 : 0;
    this.humans = cfg.mode === '2p' ? [true, true] : [this.me === 0, this.me === 1];
    this.level = cfg.level ?? 1; this.sel = -1; this.over = null; this.busy = false; this.hint = null;
    this.shell = new Shell(root, {
      game: 'dama', accent: '#c0583a', flat: !!cfg.flat && cfg.mode === '2p',
      tools: [{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'undo', ic: 'left', label: 'Annulla', key: 'u' }, { id: 'hint', ic: 'bulb', label: 'Suggerimento', key: 'h' }, { id: 'view', ic: 'eye', label: 'Vista', key: 'v' }],
      side: '<div class="tv-side-h">Mosse</div><ol class="tv-moves"></ol><div class="tv-side-f"></div>',
      onTool: (id) => this.tool(id), onPause: () => this.pause(),
    });
    this.movesEl = this.shell.sideEl.querySelector('.tv-moves'); this.sideF = this.shell.sideEl.querySelector('.tv-side-f');
    window.__tavolo = this;
  }
  async start() {
    const S = this.shell;
    const side = this.cfg.mode === '2p' ? 0 : this.me;
    const opts = { kind: 'dama', theme: S.theme, set: S.set, coords: true, side, flat: S.flat };
    this.view = await makeView(S, 'dama', async (stage) => { const { Board3D } = await import('../view/board3d.js'); return new Board3D(stage, opts); }, async (c) => { const { Board2D } = await import('../view/board2d.js'); return new Board2D(c, opts); });
    if (!this.shell) return;
    this.overlay = new CellOverlay(S.stageEl, {
      onActivate: (id) => this.tap(id), onFocus: (id) => { this.cursor = id; this.marks(); },
      canDrag: (id) => this.movable().has(sqOf(id)), pick: (x, y) => { const s = this.view.pick?.(x, y); return s ? `${s[0]},${s[1]}` : null; },
      onDragStart: (id) => { const s = sqOf(id); this.select(s); this.view.lift(this.ids[s]); },
      onDragMove: (id, x, y, over) => { this.view.dragTo(x, y); if (over !== this.cursor) { this.cursor = over; this.marks(); } },
      onDrop: (id, to) => { if (to && to !== id && this.tryMove(sqOf(id), sqOf(to))) return; this.view.drop(); },
      label: (id) => { const s = sqOf(id), p = this.st.b[s]; return `${sqName(s)}${p ? `, ${Math.abs(p) === 2 ? 'dama' : 'pedina'} ${p > 0 ? 'bianca' : 'nera'}` : ''}`; },
    });
    this.view.onLayout = () => this.overlay.update(this.view.quads().filter((q) => ((q.f + q.r) & 1) === 1).map((q) => ({ id: `${q.f},${q.r}`, pts: q.pts })));
    this.view.onLayout();
    this.initIds(); this.sync(true); this.refresh();
    requestAnimationFrame(() => this.overlay?.focus(this.me ? '2,5' : '1,2'));
    this.maybeCPU();
  }
  initIds() { this.ids = new Int16Array(64); let n = 1; for (let s = 0; s < 64; s++) if (this.st.b[s]) this.ids[s] = n++; }
  moveIds(m) { for (const c of m.caps) this.ids[c] = 0; const id = this.ids[m.from]; this.ids[m.from] = 0; this.ids[m.to] = id; }
  pieceList() { const out = []; for (let s = 0; s < 64; s++) { const p = this.st.b[s]; if (p) out.push({ id: this.ids[s], t: Math.abs(p) === 2 ? 'k' : 'm', c: colOf(p), s: fr(s) }); } return out; }
  sync(instant, paths) { return this.view.setPieces(this.pieceList(), { instant, paths }); }
  get color() { return this.st.side > 0 ? 0 : 1; }
  moves() { return legalMoves(this.st); }
  movable() { if (!this.turnHuman()) return new Set(); return new Set(this.moves().map((m) => m.from)); }
  turnHuman() { return !this.over && !this.busy && this.humans[this.color]; }
  marks() {
    if (!this.view) return;
    const m = {}, last = this.hist[this.hist.length - 1];
    if (last) m.last = [fr(last.m.from), fr(last.m.to)];
    const ms = this.turnHuman() ? this.moves() : [];
    if (this.sel >= 0) {
      m.sel = fr(this.sel); m.moves = []; m.caps = [];
      for (const x of ms.filter((q) => q.from === this.sel)) { m.moves.push(fr(x.to)); for (const c of x.caps) m.caps.push(fr(c)); }
    } else if (ms.length && ms[0].caps.length) m.from = [...new Set(ms.map((q) => q.from))].map(fr);
    if (this.hint) m.hint = this.hint;
    if (this.cursor) m.cursor = this.cursor.split(',').map(Number);
    this.view.setMarks(m);
  }
  select(s) { this.sel = s; this.hint = null; this.marks(); }
  tap(id) {
    const s = sqOf(id);
    if (!this.turnHuman()) { if (this.busy) this.shell.msg('Aspetta: il computer sta pensando'); return; }
    if (this.sel >= 0 && s !== this.sel && this.tryMove(this.sel, s)) return;
    const p = this.st.b[s];
    if (p && colOf(p) === this.color) {
      if (!this.movable().has(s)) { snd('bad'); const ms = this.moves(); this.shell.msg(ms[0]?.caps.length ? 'Presa obbligatoria: devi mangiare con un altro pezzo' : 'Questo pezzo non può muovere', 'bad'); this.marks(); return; }
      if (this.sel === s) { this.select(-1); return; }
      snd('hover'); this.select(s); return;
    }
    if (this.sel >= 0) { snd('bad'); this.select(-1); }
  }
  tryMove(f, t) {
    const c = this.moves().filter((m) => m.from === f && m.to === t);
    if (!c.length) return false;
    if (c.length > 1) {
      const acts = {}; c.forEach((m, i) => { acts['p' + i] = () => { this.shell.closeDialog(); this.play(m); }; });
      this.shell.dialog(`<h2>Quale presa?</h2><p class="tv-note">Più percorsi arrivano sulla stessa casa: scegli i pezzi da catturare.</p><div class="tv-dbtns col">${c.map((m, i) => `<button class="btn" data-tv="p${i}">${esc(moveName(m))}</button>`).join('')}</div>`, acts, { cancel: () => { this.shell.closeDialog(); this.view.drop(); } });
      return true;
    }
    this.play(c[0]); return true;
  }
  async play(m, cpu = false) {
    const mover = this.color;
    this.view.drop?.();
    this.hist.push({ m, name: moveName(m), mover });
    this.moveIds(m); playMove(this.st, m);
    this.sel = -1; this.hint = null; this.busy = true;
    this.marks(); this.refresh();
    const paths = { [this.ids[m.to]]: m.path.map(fr) };
    const anim = this.sync(false, paths);
    snd('click');
    if (m.caps.length) setTimeout(() => snd('tick'), 260);
    await anim; if (!this.shell) return;
    if (m.crown) snd('ok');
    this.busy = false;
    const st = status(this.st);
    if (st.over) { this.finish(st); return; }
    if (this.cfg.mode === '2p' && this.cfg.rotate !== false && !this.shell.flat) this.view.setSide(this.color, 0.9);
    this.marks(); this.refresh(); this.overlay.relabel();
    void cpu;
    this.maybeCPU();
  }
  async maybeCPU() {
    if (this.over || this.humans[this.color] || this.busy) return;
    this.busy = true; this.shell.thinking(true); this.refresh();
    const gen = this.gen = (this.gen || 0) + 1;
    let r; try { r = await think({ kind: 'dama', b: Array.from(this.st.b), side: this.st.side, level: this.level }, 500); } catch (e) { console.error(e); }
    if (gen !== this.gen || !this.shell) return;
    this.shell.thinking(false); this.busy = false;
    const ms = this.moves(), key = (m) => m.path.join('-') + ':' + m.caps.join('.');
    const m = (r && ms.find((x) => key(x) === key(r))) || ms[0];
    if (m) this.play(m, true);
  }
  async tool(id) {
    if (id === 'pause') return this.pause();
    if (id === 'view') { this.view.setFlat?.(!this.view.flat); return; }
    if (id === 'undo') return this.undo();
    if (id === 'hint') {
      if (!this.turnHuman()) return;
      this.busy = true; this.shell.thinking(true);
      const gen = this.gen = (this.gen || 0) + 1;
      let r; try { r = await think({ kind: 'dama', b: Array.from(this.st.b), side: this.st.side, hint: true }, 200); } catch {}
      if (gen !== this.gen || !this.shell) return;
      this.busy = false; this.shell.thinking(false);
      if (r) { this.hint = [fr(r.from), fr(r.to)]; this.marks(); this.shell.msg(`Suggerimento: ${moveName(r)}`); }
    }
  }
  undo() {
    if (!this.hist.length) return;
    cancelThinking(); this.gen = (this.gen || 0) + 1; this.busy = false; this.shell.thinking(false);
    let n = 1;
    if (this.cfg.mode !== '2p') { n = 0; let i = this.hist.length - 1; while (i >= 0 && !this.humans[this.hist[i].mover]) { n++; i--; } if (i >= 0) n++; }
    if (!n) return;
    const keep = this.hist.slice(0, this.hist.length - n);
    this.st = initial(); this.initIds();
    for (const h of keep) { this.moveIds(h.m); playMove(this.st, h.m); }
    this.hist = keep; this.over = null; this.sel = -1; this.hint = null;
    this.shell.closeDialog(); this.view.reset(); this.sync(true); this.marks(); this.refresh(); snd('back');
    if (this.cfg.mode === '2p' && this.cfg.rotate !== false && !this.shell.flat) this.view.setSide(this.color, 0.6);
    this.maybeCPU();
  }
  viewSeat(color) { const bottom = this.cfg.mode === '2p' ? 0 : this.me; return color === bottom ? 0 : 1; }
  refresh() {
    const S = this.shell, b = this.st.b;
    for (const c of [0, 1]) {
      let men = 0, kings = 0; for (const p of b) if (p && colOf(p) === c) { if (Math.abs(p) === 2) kings++; else men++; }
      const human = this.humans[c], turn = !this.over && this.color === c;
      const name = this.cfg.mode === '2p' ? (c ? 'Nero' : 'Bianco') : human ? 'Tu' : `Computer · ${DAMA_LEVELS[this.level].name}`;
      const ms = turn ? this.moves() : [];
      const sub = turn ? (this.busy && !human ? 'sta pensando…' : ms[0]?.caps.length ? '<b class="tv-chk">presa obbligatoria</b>' : human ? 'tocca a te' : 'tocca al computer') : c ? 'Neri' : 'Bianchi';
      S.seat(this.viewSeat(c), { name, sub, color: c ? '#26201c' : '#efe3c8', active: turn, extra: `${damaIcon(false, c, S.set, 'tv-cap')}<em>${men}</em>${kings ? `${damaIcon(true, c, S.set, 'tv-cap')}<em>${kings}</em>` : ''}` });
    }
    let h = '';
    for (let i = 0; i < this.hist.length; i++) { if (i % 2 === 0) h += `<li><span>${i / 2 + 1}.</span>`; h += `<b class="${i === this.hist.length - 1 ? 'cur' : ''}">${esc(this.hist[i].name)}</b>`; if (i % 2) h += '</li>'; }
    this.movesEl.innerHTML = h || '<li class="tv-empty">Muove per primo il Bianco.</li>';
    this.movesEl.scrollTop = 1e6; this.movesEl.scrollLeft = 1e6;
    this.sideF.innerHTML = `<p class="tv-note">${this.cfg.mode === '2p' ? 'Due giocatori' : `Contro il computer · ${DAMA_LEVELS[this.level].name}`} · regole italiane</p>`;
    S.enableTool('undo', !!this.hist.length);
  }
  finish(st) {
    this.over = st; this.gen = (this.gen || 0) + 1; cancelThinking(); this.busy = false; this.shell.thinking(false);
    this.marks(); this.refresh();
    const w = st.winner === 0 ? -1 : st.winner > 0 ? 0 : 1;
    let title, outcome;
    if (this.cfg.mode === '2p') { title = w < 0 ? 'Patta' : `Vince il ${w ? 'Nero' : 'Bianco'}`; outcome = '2p'; }
    else { outcome = w < 0 ? 'draw' : w === this.me ? 'win' : 'loss'; title = outcome === 'win' ? 'Hai vinto!' : outcome === 'loss' ? 'Ha vinto il computer' : 'Patta'; }
    const r = award('dama', outcome, { level: this.level, mode: this.cfg.mode === '2p' ? '2p' : 'cpu' });
    snd(outcome === 'win' ? 'win' : outcome === 'loss' ? 'bad' : 'ok');
    setTimeout(() => {
      if (!this.shell) return;
      this.shell.dialog(resultCard({ title, sub: `${WHY[st.why] || ''} · ${this.hist.length} mosse`, coins: r.coins, record: r.record,
        buttons: [{ id: 'again', label: 'Rivincita', ic: 'replay', primary: true }, { id: 'look', label: 'Guarda la damiera', ic: 'eye' }, { id: 'menu', label: 'Menu Tavolo', ic: 'left', ghost: true }] }),
      { again: () => this.onExit('again'), look: () => this.shell.closeDialog(), menu: () => this.onExit('menu') }, { cancel: () => this.shell.closeDialog() });
    }, 600);
  }
  pause() {
    const can = !this.over;
    this.shell.dialog(pauseCard({ lines: [`${this.cfg.mode === '2p' ? 'Partita a due' : `Contro il computer · ${DAMA_LEVELS[this.level].name}`} · ${this.hist.length} mosse`, 'Regole: presa obbligatoria; si deve mangiare il maggior numero di pezzi, poi con la dama, poi più dame, poi la dama incontrata per prima. Le pedine non mangiano le dame.'],
      buttons: [{ id: 'resume', label: 'Riprendi', ic: 'play', primary: true }, ...(can ? [{ id: 'resign', label: 'Abbandona', ic: 'flag' }, { id: 'drawo', label: 'Patta d’accordo', ic: 'scales' }] : []), { id: 'restart', label: 'Ricomincia', ic: 'replay' }, { id: 'menu', label: 'Esci al menu', ic: 'left', ghost: true }] }), {
      resume: () => this.shell.closeDialog(),
      resign: () => { this.shell.closeDialog(); const loser = this.cfg.mode === '2p' ? this.color : this.me; this.finish({ over: true, winner: loser ? 1 : -1, why: 'abbandono' }); },
      drawo: () => { this.shell.closeDialog(); this.finish({ over: true, winner: 0, why: 'accordo' }); },
      restart: () => this.onExit('again'), menu: () => this.onExit('menu'),
    }, { cancel: () => this.shell.closeDialog() });
  }
  state() { return { b: Array.from(this.st.b), side: this.st.side, moves: this.hist.length, over: this.over, busy: this.busy, legal: this.turnHuman() ? this.moves().map((m) => ({ from: m.from, to: m.to })) : [] }; }
  dispose() {
    this.gen = (this.gen || 0) + 1; cancelThinking();
    this.overlay?.dispose(); this.view?.stage?.dispose ? this.view.stage.dispose() : this.view?.dispose?.();
    this.shell?.dispose(); this.shell = null;
    if (window.__tavolo === this) window.__tavolo = null;
  }
}
void sideOf;
