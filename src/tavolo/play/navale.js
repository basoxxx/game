// Tavolo Baso · Battaglia navale — place the fleet (drag a ship, tap it to select and tap a square to move it,
// tap it again or press R to rotate, "Casuale" for a new layout), then fire at the enemy sea. Vs the computer
// admiral (4 levels), two players passing the device with the screen hidden between turns, or the hidden
// fleet of the day (sink it in as few shots as possible).
import { esc } from '../../ui/dom.js';
import { FLEET, NAV_LEVELS, randomFleet, canPlace, newSea, fire, allSunk, viewOf, aiShot, shipCells, shipAt, cellName, rng } from '../navale/core.js';
import { Shell, snd } from './shell.js';
import { makeView, award, resultCard, pauseCard, wait } from './common.js';
import { CellOverlay } from '../view/overlay.js';
import { tvLoad, tvSave, addCoins, daily, dayNumber, notePuzzleDay } from '../store.js';

const parse = (id) => { const [g, xy] = id.split(':'); const [x, y] = xy.split(',').map(Number); return { g: +g, x, y }; };
const RES = { miss: 'Acqua', hit: 'Colpito!', sunk: 'Colpito e affondato' };

export class NavaleGame {
  constructor(root, cfg, { onExit }) {
    this.cfg = cfg; this.onExit = onExit; this.noTouch = cfg.noTouch !== false;
    this.level = cfg.level ?? 2; this.solo = cfg.mode === 'daily';
    this.two = cfg.mode === '2p';
    this.players = [0, 1].map((i) => ({ ships: null, sea: null, human: this.two || i === 0, shots: 0, hits: 0 }));
    this.turn = 0; this.viewer = 0; this.sel = null; this.ghost = null; this.over = false; this.busy = false; this.log = [];
    this.shell = new Shell(root, { game: 'navale', accent: '#2aa6a1', tools: [], side: '<div class="tv-side-h">Flotte</div><div class="tv-fleets"></div><ol class="tv-moves tv-log"></ol>', onTool: (id) => this.tool(id), onPause: () => this.pause() });
    this.fleetsEl = this.shell.sideEl.querySelector('.tv-fleets'); this.logEl = this.shell.sideEl.querySelector('.tv-log');
    window.__tavolo = this;
  }
  async start() {
    const S = this.shell, opts = { theme: S.theme };
    this.view = await makeView(S, 'navale', async (stage) => { const { Sea3D } = await import('../view/sea3d.js'); return new Sea3D(stage, opts); }, async (c) => { const { Sea2D } = await import('../view/sea2d.js'); return new Sea2D(c, opts); });
    if (!this.shell) return;
    this.overlay = new CellOverlay(S.stageEl, {
      onActivate: (id) => this.tap(id), onFocus: (id) => { this.cursor = id; if (this.phase === 'place' && this.sel && id) this.preview(id); this.marks(); },
      canDrag: (id) => this.phase === 'place' && parse(id).g === 0 && !!this.shipAtCell(parse(id)),
      onDragStart: (id) => this.dragStart(id), onDragMove: (id, x, y, over) => this.dragMove(over), onDrop: (id, to) => this.dragEnd(to),
      label: (id) => this.label(id),
    });
    this.view.onLayout = () => this.overlay.update(this.view.quads());
    if (this.solo) {
      const ships = randomFleet(rng(dayNumber() * 2654435761 + 99), true);
      this.players[1].ships = ships; this.players[1].sea = newSea(ships);
      this.phase = 'battle'; this.view.setLayout('solo', 0); this.setBattleTools();
      this.render(); this.shell.msg('Trova e affonda la flotta nascosta', 'big', 3000);
      requestAnimationFrame(() => this.overlay.focus('1:4,4'));
      return;
    }
    this.players[1].ships = this.two ? null : randomFleet(Math.random, this.noTouch);
    this.beginPlacement(0);
  }
  // ───────── placement
  beginPlacement(pi) {
    this.phase = 'place'; this.placing = pi; this.sel = null; this.ghost = null;
    const p = this.players[pi]; if (!p.ships) p.ships = randomFleet(Math.random, this.noTouch);
    this.view.setLayout('place', 0);
    this.shell.setTools([{ id: 'pause', ic: 'pause', label: 'Menu' }, { id: 'rotate', ic: 'replay', label: 'Ruota', key: 'r' }, { id: 'random', ic: 'swap', label: 'Casuale', key: 'c' }, { id: 'ready', ic: 'check', label: 'Pronto!', key: 'g', cls: 'hot' }]);
    this.render();
    this.shell.msg(this.two ? `Giocatore ${pi + 1}: schiera la tua flotta` : 'Schiera la flotta: trascina le navi, tocca per ruotare', 'big', 3200);
    requestAnimationFrame(() => this.overlay.focus('0:0,0'));
  }
  shipAtCell({ g, x, y }) { if (g !== 0 || this.phase !== 'place') return null; return this.players[this.placing].ships.find((s) => shipCells(s).some(([a, b]) => a === x && b === y)) || null; }
  ships() { return this.players[this.placing].ships; }
  fits(s) { return canPlace(this.ships(), s, this.noTouch); }
  preview(id) {
    const c = parse(id); if (c.g !== 0 || !this.sel) { this.ghost = null; return; }
    const s = this.ships().find((q) => q.id === this.sel);
    if (shipCells(s).some(([a, b]) => a === c.x && b === c.y)) { this.ghost = null; this.render(); return; }
    const off = this.grab ?? 0;
    const g = { ...s, x: c.x - (s.dir ? 0 : off), y: c.y - (s.dir ? off : 0) };
    this.ghost = { ...g, ok: this.fits(g) }; this.render();
  }
  dragStart(id) { const c = parse(id), s = this.shipAtCell(c); if (!s) return; this.sel = s.id; this.grab = s.dir ? c.y - s.y : c.x - s.x; snd('hover'); this.render(); }
  dragMove(over) { if (!over) { this.ghost = null; this.render(); return; } this.preview(over); }
  dragEnd(to) {
    const g = this.ghost; this.ghost = null; this.grab = 0;
    if (to && g && g.ok) { this.moveSel(g); snd('click'); } else if (to && g) { snd('bad'); this.shell.msg(this.noTouch ? 'Lì non entra: le navi non possono toccarsi' : 'Lì non entra', 'bad'); }
    this.render();
  }
  moveSel(g) { const s = this.ships().find((q) => q.id === this.sel); Object.assign(s, { x: g.x, y: g.y, dir: g.dir }); }
  rotateSel() {
    const s = this.ships().find((q) => q.id === this.sel); if (!s) { this.shell.msg('Seleziona prima una nave'); return; }
    const dir = 1 - s.dir;
    for (let k = 0; k < s.len; k++) for (const sg of [-1, 1]) {
      const t = { ...s, dir, x: s.x - (dir ? 0 : k * sg * 0) + (dir ? 0 : 0), y: s.y };
      // pivot on the selected cell first, then slide along the new axis to find room
      if (dir) { t.x = s.x; t.y = s.y - k * sg; } else { t.x = s.x - k * sg; t.y = s.y; }
      if (this.fits(t)) { Object.assign(s, t); snd('click'); this.render(); return; }
    }
    snd('bad'); this.shell.msg('Non c’è spazio per ruotarla qui', 'bad');
  }
  tapPlace(c) {
    if (c.g !== 0) return;
    const s = this.shipAtCell(c);
    if (s) { if (this.sel === s.id) this.rotateSel(); else { this.sel = s.id; this.grab = s.dir ? c.y - s.y : c.x - s.x; snd('hover'); this.render(); this.shell.msg('Tocca una casella per spostarla, tocca di nuovo la nave (o R) per ruotarla', '', 2600); } return; }
    if (!this.sel) return;
    const cur = this.ships().find((q) => q.id === this.sel), off = this.grab ?? 0;
    const g = { ...cur, x: c.x - (cur.dir ? 0 : off), y: c.y - (cur.dir ? off : 0) };
    if (this.fits(g)) { this.moveSel(g); this.ghost = null; snd('click'); this.render(); }
    else { snd('bad'); this.shell.msg(this.noTouch ? 'Lì non entra: le navi non possono toccarsi' : 'Lì non entra', 'bad'); }
  }
  ready() {
    this.sel = null; this.ghost = null;
    const p = this.players[this.placing]; p.sea = newSea(p.ships);
    snd('ok');
    if (this.two && this.placing === 0) { this.handover(1, () => this.beginPlacement(1), 'Ora schiera la flotta del Giocatore 2. Il Giocatore 1 non guarda!'); return; }
    if (!this.players[1].sea) this.players[1].sea = newSea(this.players[1].ships);
    this.phase = 'battle'; this.turn = 0; this.viewer = 0;
    this.view.setLayout('battle', 0.8); this.setBattleTools();
    if (this.two) { this.handover(0, () => { this.render(); this.shell.msg('Fuoco! Tocca una casella del mare nemico', 'big'); }, 'Si comincia: spara per primo il Giocatore 1.'); return; }
    this.render(); this.shell.msg('Fuoco! Tocca una casella del mare nemico', 'big');
    requestAnimationFrame(() => this.overlay.focus('1:4,4'));
  }
  setBattleTools() { this.shell.setTools([{ id: 'pause', ic: 'pause', label: 'Menu' }]); }
  // the screen goes dark while the device changes hands
  handover(next, then, text) {
    this.viewer = next; this.busy = true;
    this.shell.el.classList.add('hide-all');
    this.shell.dialog(`<div class="tv-res-k">Passa il dispositivo</div><h2>Tocca al Giocatore ${next + 1}</h2><p class="tv-note">${esc(text)}</p><div class="tv-dbtns"><button class="btn primary big" data-tv="go">Sono il Giocatore ${next + 1}: via!</button></div>`, {
      go: () => { this.shell.closeDialog(); this.shell.el.classList.remove('hide-all'); this.busy = false; then(); },
    }, { cls: 'cover' });
  }
  // ───────── battle
  tap(id) {
    const c = parse(id);
    if (this.phase === 'place') return this.tapPlace(c);
    if (this.phase !== 'battle' || this.over) return;
    if (c.g !== 1) { this.shell.msg('Spara nel mare nemico'); return; }
    if (this.busy || !this.players[this.turn].human || this.turn !== this.viewer) return;
    const target = this.players[this.solo ? 1 : 1 - this.turn].sea;
    if (target.shots[c.x + c.y * 10]) { snd('bad'); this.shell.msg('Lì hai già sparato'); return; }
    this.shoot(this.turn, c.x, c.y);
  }
  async shoot(shooter, x, y) {
    const tgtIdx = this.solo ? 1 : 1 - shooter, sea = this.players[tgtIdx].sea;
    const r = fire(sea, x, y); if (r.result === 'again') return;
    const P = this.players[shooter]; P.shots++; if (r.result !== 'miss') P.hits++;
    this.busy = true;
    // which grid shows it: the target sea is grid 1 for the viewer, grid 0 when the viewer is the target
    const gi = tgtIdx === this.viewer && !this.solo ? 0 : 1;
    this.render(x + y * 10, gi);
    this.view.fx(gi, x, y, r.result === 'miss' ? 'miss' : 'hit');
    snd(r.result === 'miss' ? 'whoosh' : r.result === 'sunk' ? 'crash' : 'tick');
    const who = this.solo ? '' : this.two ? `G${shooter + 1}` : shooter === 0 ? 'Tu' : 'Computer';
    const text = `${cellName(x, y)}: ${RES[r.result]}${r.result === 'sunk' ? ` · ${FLEET.find((f) => f.id === r.ship.id).name}` : ''}`;
    this.log.push(`${who ? who + ' · ' : ''}${text}`);
    this.shell.msg(text, r.result === 'miss' ? '' : 'good', 1600);
    this.render(-1);
    await wait(r.result === 'miss' ? 650 : 900); if (!this.shell) return;
    if (allSunk(sea)) { this.busy = false; this.finish(shooter); return; }
    const again = this.solo || (r.result !== 'miss' && this.cfg.again);
    this.busy = false;
    if (again) { if (!P.human) this.cpuTurn(); return; }
    this.turn = 1 - shooter;
    if (this.two) { await wait(500); this.handover(this.turn, () => { this.render(); const last = this.log[this.log.length - 1]; this.shell.msg(`Ultimo colpo · ${last}`, '', 2600); }, `Il Giocatore ${shooter + 1} ha sparato: ${text}.`); return; }
    this.render();
    if (!this.players[this.turn].human) this.cpuTurn();
  }
  async cpuTurn() {
    this.busy = true; this.shell.thinking(true); this.render();
    await wait(700); if (!this.shell || this.over) return;
    this.shell.thinking(false);
    const [x, y] = aiShot(viewOf(this.players[0].sea), this.level, Math.random, this.noTouch);
    this.busy = false;
    await this.shoot(1, x, y);
  }
  finish(winner) {
    this.over = true; this.phase = 'over';
    const S = this.shell;
    this.render();
    if (this.solo) {
      const shots = this.players[1 - 1].shots || this.players[0].shots, d = tvLoad(), dl = daily(d);
      const n = this.players[0].shots;
      let coins = 0; const first = !dl.navale?.done;
      if (first) { coins = addCoins(d, Math.max(15, Math.round(60 - Math.max(0, n - 30) * 1.2))); d.stats.puzzles++; notePuzzleDay(d); }
      const best = Math.min(dl.navale?.best || 999, n); dl.navale = { done: true, best };
      tvSave(d); snd('win'); void shots;
      return setTimeout(() => this.shell?.dialog(resultCard({ title: 'Flotta affondata!', sub: 'La flotta del giorno', coins, extra: `<p class="tv-note">Colpi: <b>${n}</b> (miglior risultato di oggi: ${best}). Precisione ${Math.round((17 / n) * 100)}%.</p>`, buttons: [{ id: 'daily', label: 'Altri puzzle', ic: 'calendar', primary: true }, { id: 'menu', label: 'Menu Tavolo', ic: 'left' }] }), { daily: () => this.onExit('next-puzzle'), menu: () => this.onExit('menu') }), 500);
    }
    // reveal everything
    const outcome = this.two ? '2p' : winner === 0 ? 'win' : 'loss';
    const r = award('navale', outcome, { level: this.level, mode: this.two ? '2p' : 'cpu' });
    const st = tvLoad(); if (outcome === 'win') { const sh = this.players[0].shots; if (!st.stats.navale.bestShots || sh < st.stats.navale.bestShots) { st.stats.navale.bestShots = sh; tvSave(st); } }
    this.reveal = true; this.render();
    snd(outcome === 'loss' ? 'bad' : 'win');
    const title = this.two ? `Vince il Giocatore ${winner + 1}!` : winner === 0 ? 'Vittoria navale!' : 'La tua flotta è affondata';
    const P = this.players[winner];
    setTimeout(() => S && this.shell && this.shell.dialog(resultCard({ title, sub: `${P.shots} colpi · precisione ${Math.round((P.hits / Math.max(1, P.shots)) * 100)}%`, coins: r.coins, record: r.record,
      buttons: [{ id: 'again', label: 'Rivincita', ic: 'replay', primary: true }, { id: 'look', label: 'Guarda i mari', ic: 'eye' }, { id: 'menu', label: 'Menu Tavolo', ic: 'left', ghost: true }] }), { again: () => this.onExit('again'), look: () => this.shell.closeDialog(), menu: () => this.onExit('menu') }, { cancel: () => this.shell.closeDialog() }), 900);
  }
  // ───────── drawing
  marks() { this.view.setMarks({ cursor: this.cursor }); }
  render(anim = -1, animGrid = 1) {
    const V = this.view; if (!V) return;
    if (this.phase === 'place') {
      const list = this.ships().map((s) => ({ ...s, sel: s.id === this.sel }));
      if (this.ghost) list.push({ ...this.ghost, ghost: true, bad: !this.ghost.ok });
      V.setShips(0, list); V.setShots(0, new Int8Array(100)); V.setShips(1, []); V.setShots(1, new Int8Array(100));
    } else if (this.solo) {
      const sea = this.players[1].sea;
      V.setShips(1, sea.ships.filter((s) => s.sunk || this.over)); V.setShots(1, sea.shots, { animate: animGrid === 1 ? anim : null });
    } else {
      const me = this.players[this.viewer], op = this.players[1 - this.viewer];
      V.setShips(0, me.sea.ships.map((s) => ({ ...s }))); V.setShots(0, me.sea.shots, { animate: animGrid === 0 ? anim : null });
      V.setShips(1, op.sea.ships.filter((s) => s.sunk || this.reveal).map((s) => ({ ...s }))); V.setShots(1, op.sea.shots, { animate: animGrid === 1 ? anim : null });
    }
    this.hud(); this.overlay?.relabel();
  }
  label(id) {
    const c = parse(id), n = cellName(c.x, c.y);
    if (this.phase === 'place') { const s = this.shipAtCell(c); return `${n}${s ? `, ${FLEET.find((f) => f.id === s.id).name}` : ''}`; }
    const sea = this.solo ? this.players[1].sea : c.g === 0 ? this.players[this.viewer]?.sea : this.players[1 - this.viewer]?.sea;
    const v = sea?.shots[c.x + c.y * 10];
    return `${c.g === 0 && !this.solo ? 'Tuo mare' : 'Mare nemico'} ${n}${v === 1 ? ', acqua' : v === 2 ? ', colpito' : v === 3 ? ', affondato' : ''}`;
  }
  hud() {
    const S = this.shell;
    const fleet = (sea, mine) => FLEET.map((f) => { const s = sea?.ships.find((q) => q.id === f.id); return `<li class="${s?.sunk ? 'sunk' : ''}"><i style="--n:${f.len}"></i>${esc(f.name)}${mine && s && !s.sunk && s.hits ? ` <em>${s.hits}/${f.len}</em>` : ''}</li>`; }).join('');
    if (this.solo) {
      const sea = this.players[1].sea, n = this.players[0].shots;
      S.seat(0, { name: 'Tu', sub: `${n} colpi · ${sea.ships.filter((s) => s.sunk).length}/5 affondate`, color: '#2aa6a1', active: !this.over });
      S.seat(1, { name: 'La flotta del giorno', sub: 'stessa per tutti', color: '#6b7680' });
      this.fleetsEl.innerHTML = `<h4>Flotta nemica</h4><ul class="tv-fleet">${fleet(sea, false)}</ul>`;
    } else if (this.phase === 'place') {
      const who = this.two ? `Giocatore ${this.placing + 1}` : 'Tu';
      S.seat(0, { name: who, sub: 'schiera la flotta', color: '#2aa6a1', active: true });
      S.seat(1, { name: this.two ? `Giocatore ${2 - this.placing}` : `Computer · ${NAV_LEVELS[this.level].name}`, sub: this.two ? 'non guardare!' : 'pronto', color: '#6b7680' });
      this.fleetsEl.innerHTML = `<p class="tv-note">${this.noTouch ? 'Le navi non possono toccarsi, nemmeno in diagonale.' : 'Le navi possono toccarsi.'} Trascina una nave; tocca per selezionarla e poi tocca una casella per spostarla; tocca di nuovo o premi <kbd>R</kbd> per ruotarla.</p><ul class="tv-fleet">${FLEET.map((f) => `<li class="${this.sel === f.id ? 'on' : ''}"><i style="--n:${f.len}"></i>${esc(f.name)} · ${f.len}</li>`).join('')}</ul>`;
    } else {
      const v = this.viewer, me = this.players[v], op = this.players[1 - v];
      const nm = (i) => (this.two ? `Giocatore ${i + 1}` : i === 0 ? 'Tu' : `Computer · ${NAV_LEVELS[this.level].name}`);
      S.seat(0, { name: nm(v), sub: `${me.shots} colpi · ${me.hits} a segno`, color: '#2aa6a1', active: !this.over && this.turn === v });
      S.seat(1, { name: nm(1 - v), sub: !this.over && this.turn !== v ? (this.two ? 'tocca a lui' : 'sta mirando…') : `${op.shots} colpi`, color: '#c0583a', active: !this.over && this.turn !== v });
      this.fleetsEl.innerHTML = `<h4>La tua flotta</h4><ul class="tv-fleet">${fleet(me.sea, true)}</ul><h4>Flotta nemica</h4><ul class="tv-fleet">${fleet(op.sea, false)}</ul>`;
    }
    this.logEl.innerHTML = this.log.slice(-40).map((l) => `<li class="tv-l">${esc(l)}</li>`).join('');
    this.logEl.scrollTop = 1e6; this.logEl.scrollLeft = 1e6;
  }
  tool(id) {
    if (id === 'pause') return this.pause();
    if (id === 'rotate' && this.phase === 'place') return this.rotateSel();
    if (id === 'random' && this.phase === 'place') { this.players[this.placing].ships = randomFleet(Math.random, this.noTouch); this.sel = null; this.ghost = null; snd('whoosh'); this.render(); return; }
    if (id === 'ready' && this.phase === 'place') return this.ready();
  }
  pause() {
    if (this.shell.el.classList.contains('hide-all')) return;
    this.shell.dialog(pauseCard({ lines: [this.solo ? 'La flotta del giorno: affondala con meno colpi possibile.' : `${this.two ? 'Due giocatori' : `Contro il computer · ${NAV_LEVELS[this.level].name}`} · ${this.noTouch ? 'navi separate' : 'navi a contatto'}${this.cfg.again ? ' · chi colpisce rispara' : ''}`],
      buttons: [{ id: 'resume', label: 'Riprendi', ic: 'play', primary: true }, { id: 'restart', label: 'Ricomincia', ic: 'replay' }, { id: 'menu', label: 'Esci al menu', ic: 'left', ghost: true }] }), {
      resume: () => this.shell.closeDialog(), restart: () => this.onExit('again'), menu: () => this.onExit(this.solo ? 'next-puzzle' : 'menu'),
    }, { cancel: () => this.shell.closeDialog() });
  }
  state() { return { phase: this.phase, turn: this.turn, viewer: this.viewer, over: this.over, busy: this.busy, shots: this.players.map((p) => p.shots), placing: this.placing, hidden: this.shell?.el.classList.contains('hide-all') }; }
  dispose() {
    this.overlay?.dispose(); this.view?.stage?.dispose ? this.view.stage.dispose() : this.view?.dispose?.();
    this.shell?.dispose(); this.shell = null;
    if (window.__tavolo === this) window.__tavolo = null;
  }
}
void shipAt;
