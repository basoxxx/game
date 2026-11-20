// Festa Baso — a live party session: one Stage (WebGL renderer) for the board, every minigame and the podium,
// the shared input (keyboard zones, controllers, touch zones), HUD and the cards between phases.
//   const s = new FestaSession(root, cfg, { onExit, onSave }); await s.start(); … s.dispose();
//   cfg = { mode: 'board' | 'torneo' | 'train', n, seats: [{ char, hat, dev }], rounds, target, minis, diff, flat, tier, mini }
// Tests: window.__festa = session; session.hold = true stops the rAF loop; session.step(dt) advances it
// (render = false skips WebGL); session.press(i) taps player i's action button; session.next() continues.
import { Stage, disposeScene, Labels } from './stage.js';
import { VIEWS, boardView, podiumView } from './views/index.js';
import { MINI, cpuSkill } from './mini/index.js';
import { SLOT_COLORS } from './mini/base.js';
import { PartyInput, TouchZones, devById } from './input.js';
import { newBoard, boardRoll, boardMove, boardAfterMini, boardFinal, MINI_COINS, newTourney, tourneyAfter, boardSnapshot, boardRestore } from './party.js';
import { blankInput } from './util.js';
import { charById } from './roster.js';
import { feLoad, feSave, noteMini, feSaveBoard, feClearBoard } from './store.js';
import { disposeModelCaches } from '../kart/models.js';
import { disposeMats } from '../bastione/models.js';
import { sfx } from '../ui/audio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = (f) => { try { f(); } catch {} };
const DT = 1 / 60;
const ord = (n) => `${n}°`;

export class FestaSession {
  constructor(root, cfg, hooks = {}) {
    this.root = root; this.cfg = cfg; this.hooks = hooks;
    this.n = cfg.n; this.mode = cfg.mode; this.t = 0; this.hold = false; this.paused = false; this.renderOn = true;
    this.ph = 'boot'; this.wait = null; this.timers = []; this.earned = 0; this.seed = cfg.seed ?? ((Date.now() & 0xffffff) + 7);
  }
  get humans() { return this.players.filter((p) => !p.cpu).map((p) => p.i); }
  async start() {
    const c = this.cfg, root = this.root;
    this.players = c.seats.slice(0, this.n).map((s, i) => {
      const ch = charById(s.char), dev = s.dev || 'cpu';
      return { i, name: dev === 'cpu' ? `${ch.name.split(' ')[0]} (CPU)` : `G${i + 1} · ${ch.name.split(' ')[0]}`, short: `G${i + 1}`, sc: SLOT_COLORS[i], color: ch.color, accent: ch.accent, hat: s.hat, kart: ch.kart, cpu: dev === 'cpu', dev, char: ch };
    });
    root.innerHTML = `<canvas class="fz-cv"></canvas><div class="fz-layer" id="fz-layer"><div class="fz-labs"></div><div class="fz-hud" id="fz-hud"></div></div><div class="fz-ui" id="fz-ui"></div><button class="fz-pause" data-fz="pause" aria-label="Pausa">II</button>`;
    this.layer = root.querySelector('#fz-layer'); this.ui = root.querySelector('#fz-ui'); this.hud = root.querySelector('#fz-hud');
    this.stage = new Stage(root.querySelector('.fz-cv'), c.tier || 'high');
    this.labels = new Labels(root.querySelector('.fz-labs'), this.stage);
    this.input = new PartyInput(this.players.map((p) => p.dev), { onPause: () => this.togglePause() });
    const touch = this.players.filter((p) => p.dev === 'touch');
    if (touch.length) this.touch = new TouchZones(root, touch.map((p) => ({ i: p.i, color: p.sc, label: p.short })), this.input, { flat: !!c.flat });
    this.inp = this.players.map(() => blankInput());
    this.onClick = (e) => { const b = e.target.closest('[data-fz]'); if (!b) return; e.preventDefault(); const a = b.dataset.fz; S(() => sfx.click()); this.action(a, b); };
    root.addEventListener('click', this.onClick);
    window.__festa = this;
    root.classList.add('dz-root'); // the controllers belong to the party, not to the menu focus bridge (src/ui/gamepad.js)
    if (this.mode === 'board') {
      const R = c.resume && boardRestore(c.resume.B);
      if (R && R.n === this.n) { this.B = R; this.seed = c.resume.seed ?? this.seed; this.miniCount = c.resume.miniCount || 0; this.earned = c.resume.earned || 0; }
      else this.B = newBoard({ n: this.n, rounds: c.rounds, seed: this.seed, names: this.players.map((p) => p.name), minis: c.minis });
      this.enterBoard();
    }
    else if (this.mode === 'torneo') { this.T = newTourney({ n: this.n, target: c.target, seed: this.seed, minis: c.minis }); this.announce(this.T.next, () => this.startMini(this.T.next)); }
    else this.startMini(c.mini);
    this.last = performance.now();
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.hold) return;
    this.step(dt);
  }
  // advance everything by dt seconds
  step(dt, render = this.renderOn) {
    if (this.paused) { if (render) this.stage.render(0); return; }
    this.t += dt;
    for (const tm of this.timers.slice()) { tm.t -= dt; if (tm.t <= 0) { this.timers.splice(this.timers.indexOf(tm), 1); tm.f(); } }
    if (this.ph === 'mini') this.miniStep(dt);
    else {
      // menus between minigames: any human action button continues / rolls
      for (const i of this.humans) { this.input.read(i, this.inp[i]); if (this.inp[i].ap) this.onA(i); }
    }
    if (this.view) { this.view.update(dt); this.tags(); }
    if (render) this.stage.render(dt); else this.stage.uTime.value += dt;
  }
  run(sec, render = false) { const k = Math.round(sec / DT); for (let i = 0; i < k; i++) this.step(DT, false); if (render) this.step(0, true); }
  after(t, f) { this.timers.push({ t, f }); }
  press(i) { this.input.virt[i].a = true; this.step(DT, false); this.input.virt[i].a = false; this.step(DT, false); }
  next() { const w = this.wait; if (w) { this.wait = null; w(); } }
  onA(i) {
    if (this.ph === 'board' && this.B.phase === 'roll' && this.B.turn === i && !this.rolling) { this.doRoll(); return; }
    if (this.wait) { S(() => sfx.select()); this.next(); }
  }
  action(a) {
    if (a === 'pause') this.togglePause();
    else if (a === 'resume') this.togglePause(false);
    else if (a === 'quit') this.hooks.onExit?.('menu');
    else if (a === 'hub') this.hooks.onExit?.('hub');
    else if (a === 'next') this.next();
    else if (a === 'again') this.hooks.onExit?.('again');
    else if (a === 'roll') { if (this.ph === 'board' && this.B.phase === 'roll' && !this.players[this.B.turn].cpu) this.doRoll(); }
  }
  togglePause(on = !this.paused) {
    if (this.ph === 'end') return;
    this.paused = on; this.root.classList.toggle('dz-root', !on);
    let el = this.root.querySelector('.fz-pausecard');
    if (on && !el) { el = document.createElement('div'); el.className = 'fz-card fz-pausecard'; el.innerHTML = `<h2>Pausa</h2><p>${this.mode === 'board' ? 'La festa ti aspetta. Se esci resta salvata: la riprendi dal menu della festa.' : 'La festa ti aspetta.'}</p><div class="fz-btns"><button class="btn primary" data-fz="resume">Riprendi</button><button class="btn" data-fz="quit">Esci dalla festa</button></div>`; this.root.appendChild(el); requestAnimationFrame(() => el.querySelector('.btn')?.focus()); }
    if (!on) el?.remove();
  }
  setView(v) {
    if (this.view && this.view !== v) { this.view.dispose?.(); if (this.view !== this.bview) disposeScene(this.view.scene); }
    this.labels.clear(); this.view = v; this.stage.scene = v?.scene || null;
  }
  tags() {
    const v = this.view; if (!v?.tags) return;
    const T = v.tags();
    T.forEach((p, i) => { if (!p) return; const pl = this.players[i]; this.labels.set(i, `<b style="background:${pl.sc}">${pl.short}</b>${v.tagText ? v.tagText(i) : ''}`, p[0], p[1], p[2]); });
  }
  card(html, cls = '') { this.ui.innerHTML = html ? `<div class="fz-card ${cls}">${html}</div>` : ''; }
  continueBtn(label = 'Continua') {
    const who = this.humans.length ? `<small>${this.humans.map((i) => `<i style="background:${this.players[i].sc}">${this.players[i].short}</i>`).join('')} premi il tasto azione</small>` : '';
    return `<div class="fz-btns"><button class="btn primary big" data-fz="next">${label}</button></div>${who}`;
  }
  waitFor(f, auto = this.humans.length ? 25 : 2.5) {
    let done = false; const go = () => { if (done) return; done = true; this.wait = null; f(); };
    this.wait = go; this.after(auto, go);
    // a short guard against the press that ended the minigame
    const w = this.wait; this.wait = null; this.after(0.5, () => { if (!done) this.wait = w; });
  }

  // ───────────────────────── board
  enterBoard() {
    if (!this.bview) { this.bview = boardView(this.stage, this.B, { players: this.players }); }
    this.setView(this.bview); this.ph = 'board';
    this.boardHud(); this.boardTurn();
  }
  boardHud() {
    const B = this.B;
    this.hud.innerHTML = `<div class="fz-btop"><b>Turno ${Math.min(B.round, B.rounds)} / ${B.rounds}</b><span>${B.round >= B.rounds ? 'Ultimo turno!' : 'Stella: 20 monete'}</span></div>
      <div class="fz-bcards n${this.n}">${B.players.map((p, i) => `<div class="fz-bc ${B.turn === i && B.phase !== 'mini' ? 'on' : ''}" style="--c:${this.players[i].sc}"><b>${esc(this.players[i].name)}</b><span><i class="st">★</i> ${p.stars}</span><span><i class="co">●</i> ${p.coins}</span></div>`).join('')}</div>
      <div class="fz-msg" id="fz-msg">${esc(B.last?.text || 'Si parte! Chi arriva alla stella con 20 monete la compra.')}</div>`;
  }
  // the board is saved at every quiet point (a turn about to roll, a minigame about to start): «Esci» keeps it
  saveBoard() {
    const c = this.cfg, B = this.B; if (!B || !['roll', 'mini'].includes(B.phase)) return;
    feSaveBoard({ cfg: { mode: 'board', n: this.n, seats: c.seats.slice(0, this.n), rounds: c.rounds, diff: c.diff, flat: c.flat, minis: c.minis }, B: boardSnapshot(B), seed: this.seed, miniCount: this.miniCount || 0, earned: this.earned });
  }
  boardTurn() {
    const B = this.B;
    this.saveBoard();
    if (B.phase === 'roll') {
      const p = this.players[B.turn]; this.bview.focus = B.turn; this.boardHud();
      if (p.cpu) { this.card(`<div class="fz-dice">?</div><p><b style="color:${p.sc}">${esc(p.name)}</b> tira il dado…</p>`, 'mini'); this.after(0.9, () => this.doRoll()); }
      else this.card(`<div class="fz-dice">?</div><p><b style="color:${p.sc}">${esc(p.name)}</b>, tocca a te!</p><div class="fz-btns"><button class="btn primary big" data-fz="roll">Tira il dado</button></div><small>${esc(devById(p.dev).act)} · tasto azione</small>`, 'mini');
    } else if (B.phase === 'mini') { this.bview.focus = -1; this.boardHud(); this.announce(B.mini, () => this.startMini(B.mini)); }
    else if (B.phase === 'final') { boardFinal(B); this.finale(); }
  }
  doRoll() {
    if (this.rolling) return; this.rolling = true;
    const el = this.ui.querySelector('.fz-dice'); let k = 0;
    const spin = () => { if (el) el.textContent = String(1 + ((k++ * 7 + 3) % 10)); };
    for (let q = 0; q < 8; q++) this.after(q * 0.07, spin);
    this.after(0.6, () => {
      const v = boardRoll(this.B); if (el) el.textContent = String(v); S(() => sfx.ok());
      this.boardHud(); this.after(0.5, () => { this.card(''); this.hop(); });
    });
  }
  hop() {
    const B = this.B, i = B.turn, r = boardMove(B);
    if (!r) { this.rolling = false; return; }
    S(() => sfx.tick());
    if (r.star) { this.bview.burst(i, '#ffd23f'); S(() => sfx.win()); }
    const msg = document.getElementById('fz-msg'); if (msg) msg.textContent = B.last?.text || '';
    const left = B.phase === 'move' ? B.steps : 0;
    const el = this.ui; if (left) el.innerHTML = `<div class="fz-steps">${left}</div>`;
    if (B.phase === 'move') this.after(r.star || r.noStar ? 1.1 : 0.3, () => this.hop());
    else {
      this.ui.innerHTML = '';
      if (r.landed) { this.bview.burst(i, r.landed.coins > 0 ? '#ffd23f' : r.landed.coins < 0 ? '#ff4d4d' : '#2fd36b'); S(() => (r.landed.coins < 0 ? sfx.bad() : sfx.coin())); }
      this.boardHud();
      this.after(1.2, () => { this.rolling = false; this.boardTurn(); });
    }
  }
  announce(id, then) {
    const M = MINI[id];
    this.card(`<div class="fz-k">Minigioco</div><h2 style="--c:${M.color}">${esc(M.name)}</h2><p>${esc(M.desc)}</p><div class="fz-from">dal mondo di ${esc(M.from)}</div>`, 'ann');
    S(() => sfx.open?.());
    this.after(2.2, () => { this.card(''); then(); });
  }

  // ───────────────────────── minigames
  startMini(id) {
    const M = MINI[id], n = this.n;
    this.mini = M;
    const sim = this.sim = new M.Sim({ n, seed: (this.seed + (this.miniCount = (this.miniCount || 0) + 1) * 977) >>> 0, skill: this.players.map((p, i) => cpuSkill(this.cfg.diff, i)), cpu: this.players.map((p) => p.cpu) });
    const view = VIEWS[id](this.stage, sim, { players: this.players, layer: this.layer });
    this.setView(view);
    this.ph = 'mini'; this.mph = 'intro'; this.mt = 0; this.acc = 0; this.ended = false;
    this.hud.innerHTML = `<div class="fz-top"><b id="fz-time"></b><span>${esc(M.name)}</span></div>${this.players.map((p, i) => `<div class="fz-pc p${i} n${n}" style="--c:${p.sc}"><b>${esc(p.name)}</b><span id="fz-ph${i}"></span></div>`).join('')}`;
    this.introCard();
    view.update(0);
  }
  introCard() {
    const M = this.mini, h = M.how;
    const rows = this.players.map((p) => {
      const d = devById(p.dev);
      if (p.cpu) return `<li style="--c:${p.sc}"><b>${p.short}</b><span>CPU</span></li>`;
      const mv = h.move ? `<span><kbd>${esc(p.dev === 'touch' ? 'Levetta' : p.dev.startsWith('pad') ? 'Stick' : d.keys)}</kbd> ${esc(h.move)}</span>` : '';
      const a = h.a ? `<span><kbd>${esc(p.dev === 'touch' ? 'Tasto' : d.act)}</kbd> ${esc(h.a)}</span>` : '';
      return `<li style="--c:${p.sc}"><b>${p.short}</b><em>${esc(d.name)}</em>${mv}${a}</li>`;
    }).join('');
    this.card(`<div class="fz-k">${M.kind === 'team' ? 'A squadre' : M.kind === 'coop' ? 'Tutti insieme' : 'Tutti contro tutti'} · dal mondo di ${esc(M.from)}</div><h2 style="--c:${M.color}">${esc(M.name)}</h2><p>${esc(M.desc)}</p><ul class="fz-ctl">${rows}</ul><div class="fz-count" id="fz-count">3</div>`, 'intro');
  }
  miniStep(dt) {
    const sim = this.sim; this.mt += dt;
    if (this.mph === 'intro') {
      const left = 3.2 - this.mt, el = document.getElementById('fz-count');
      const txt = left > 2.2 ? '3' : left > 1.2 ? '2' : left > 0.2 ? '1' : 'Via!';
      if (el && el.textContent !== txt) { el.textContent = txt; S(() => (txt === 'Via!' ? sfx.go() : sfx.beep?.())); }
      if (left <= 0) { this.mph = 'play'; this.card(''); }
      for (const i of this.humans) this.input.read(i, this.inp[i]); // keep edges fresh
      this.miniHud(); return;
    }
    if (this.mph === 'play') {
      this.acc += dt; let k = 0;
      while (this.acc >= DT && k++ < 6 && !sim.done) {
        this.acc -= DT;
        for (const p of this.players) {
          const inp = this.inp[p.i];
          if (p.cpu) { inp.x = inp.y = 0; inp.a = inp.ap = false; inp.m = null; sim.ai(p.i, inp, DT); }
          else { this.input.read(p.i, inp); inp.m = null; }
        }
        sim.step(DT, this.inp);
      }
      if (this.acc > DT * 6) this.acc = 0;
      this.miniHud();
      if (sim.done && !this.ended) { this.ended = true; this.mph = 'end'; S(() => sfx.win()); this.card('<div class="fz-big">Fine!</div>', 'mini'); this.after(1.3, () => this.miniResult(sim.result())); }
      return;
    }
  }
  miniHud() {
    const sim = this.sim, v = this.view;
    const tm = document.getElementById('fz-time');
    if (tm) tm.textContent = v.top ? v.top() : sim.dur ? `${Math.ceil(sim.left())}` : '';
    for (let i = 0; i < this.n; i++) { const el = document.getElementById(`fz-ph${i}`); if (el) { const t = sim.hud(i); if (el._t !== t) { el._t = t; el.textContent = t; } } }
  }
  fmtScore(res, i) {
    const s = res.scores[i];
    if (s == null) return '—';
    if (res.fmt === 'time') return `${s.toFixed(1)} s`;
    if (res.unit === 'cm') return `${s} cm`;
    return `${Math.round(s)} ${res.unit}`;
  }
  miniResult(res) {
    this.ph = 'result'; this.lastRes = res;
    const M = this.mini, order = this.players.map((p, i) => i).sort((a, b) => res.places[a] - res.places[b] || a - b);
    // profile: coins and stats for the human seats
    const d = feLoad(), hum = this.humans; let gain = 0;
    if (hum.length) { const best = Math.min(...hum.map((i) => res.places[i])); gain = this.mode === 'train' ? 2 + (best === 1 ? 3 : 0) : 3 + (best === 1 ? 5 : 0); for (const i of hum) noteMini(d, M.id, res.places[i]); }
    d.coins += gain; d.stats.coinsEarned += gain; this.earned += gain; feSave(d);
    let reward = (i) => '';
    if (this.mode === 'board') reward = (i) => { const c = res.coop ? (res.teamWin ? 6 : 1) + (res.places[i] === 1 ? 4 : 0) : MINI_COINS[res.places[i] - 1] ?? 0; return `<em class="co">+${c} ●</em>`; };
    const head = res.coop ? (res.teamWin ? 'Castello salvo!' : 'Il castello è caduto…') : res.teams ? (res.winTeam === -2 ? 'Pareggio!' : `Vince la squadra ${res.winTeam ? 'B' : 'A'}!`) : `Vince ${esc(this.players[order[0]].name)}!`;
    this.card(`<div class="fz-k">${esc(M.name)} · risultati</div><h2>${head}</h2><ol class="fz-rank">${order.map((i) => `<li style="--c:${this.players[i].sc}"><span>${ord(res.places[i])}</span><b>${esc(this.players[i].name)}</b><i>${this.fmtScore(res, i)}</i>${reward(i)}</li>`).join('')}</ol>${gain ? `<div class="fz-gain">+${gain} monete festa</div>` : ''}${this.mode === 'train' ? `<div class="fz-btns"><button class="btn primary big" data-fz="again">Rigioca</button><button class="btn" data-fz="quit">Altro minigioco</button></div>` : this.continueBtn()}`, 'res');
    for (const i of order) if (res.places[i] === 1) this.view?.burst?.(i, '#ffd23f');
    if (this.mode === 'board') this.waitFor(() => { boardAfterMini(this.B, res); this.enterBoard(); });
    else if (this.mode === 'torneo') this.waitFor(() => this.tourneyCard(res));
    else this.waitFor(() => this.hooks.onExit?.('again'), 1e9);
  }

  // ───────────────────────── tournament
  tourneyCard(res) {
    const T = this.T; tourneyAfter(T, res);
    this.ph = 'tourney';
    const rows = this.players.map((p, i) => `<li style="--c:${p.sc}"><b>${esc(p.name)}</b><span class="fz-pips">${Array.from({ length: T.target }, (_, k) => `<i class="${k < T.wins[i] ? 'on' : ''}"></i>`).join('')}</span></li>`).join('');
    if (T.champion != null) { this.card(`<div class="fz-k">Torneo · primo a ${T.target}</div><h2>${esc(this.players[T.champion].name)} vince il torneo!</h2><ol class="fz-tour">${rows}</ol>${this.continueBtn('Premiazione')}`, 'res'); this.waitFor(() => this.finale()); return; }
    this.card(`<div class="fz-k">Torneo · primo a ${T.target} vittorie · ${T.played.length} giocati</div><h2>Classifica</h2><ol class="fz-tour">${rows}</ol><p>Prossimo: <b>${esc(MINI[T.next].name)}</b></p>${this.continueBtn('Avanti')}`, 'res');
    this.waitFor(() => this.startMini(T.next));
  }

  // ───────────────────────── final: awards + podium
  finale() {
    this.ph = 'end'; this.paused = false; this.root.classList.add('end'); this.root.classList.remove('dz-root');
    let podium, title, awards = [];
    if (this.mode === 'board') { podium = this.B.podium; awards = this.B.awards; title = 'Re della festa'; feClearBoard(); }
    else { const T = this.T, pl = this.players.map((p, i) => 1 + T.wins.filter((w) => w > T.wins[i]).length); podium = this.players.map((p, i) => ({ i, place: pl[i], wins: T.wins[i] })).sort((a, b) => a.place - b.place); title = 'Campione del torneo'; }
    const king = podium[0].i;
    const d = feLoad(), hum = this.humans, humanKing = hum.includes(king);
    const bonus = hum.length ? 10 + (humanKing ? 15 : 0) : 0;
    d.coins += bonus; d.stats.coinsEarned += bonus; this.earned += bonus;
    if (this.mode === 'board') { d.stats.boards++; if (humanKing) d.stats.kings++; d.stats.stars += hum.reduce((a, i) => a + this.B.players[i].stars, 0); }
    else { d.stats.tourneys++; if (humanKing) d.stats.champs++; }
    feSave(d);
    this.hooks.onSave?.();
    this.setView(podiumView(this.stage, podium, { players: this.players }));
    this.hud.innerHTML = '';
    const line = (p) => this.mode === 'board' ? `<i>★ ${p.stars} · ● ${p.coins}</i>` : `<i>${p.wins} vittorie</i>`;
    this.card(`<div class="fz-k">${title}</div><h2 class="crown">${esc(this.players[king].name)}</h2>
      ${awards.length ? `<ul class="fz-awards">${awards.map((a) => `<li><b>${esc(a.title)}</b><span>${esc(a.desc)}: ${a.who.map((i) => esc(this.players[i].short)).join(', ')} <em>+1 ★</em></span></li>`).join('')}</ul>` : ''}
      <ol class="fz-rank">${podium.map((p) => `<li style="--c:${this.players[p.i].sc}"><span>${ord(p.place)}</span><b>${esc(this.players[p.i].name)}</b>${line(p)}</li>`).join('')}</ol>
      ${this.earned ? `<div class="fz-gain">Monete festa guadagnate: +${this.earned}</div>` : ''}
      <div class="fz-btns"><button class="btn primary big" data-fz="again">Un’altra festa!</button><button class="btn" data-fz="quit">Menu della festa</button></div>`, 'final');
    S(() => sfx.win());
    requestAnimationFrame(() => this.ui.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }

  state() {
    return { ph: this.ph, mph: this.mph, mode: this.mode, mini: this.mini?.id, done: this.sim?.done, board: this.B ? { phase: this.B.phase, round: this.B.round, turn: this.B.turn } : null, tourney: this.T ? { wins: this.T.wins, champion: this.T.champion, next: this.T.next } : null, waiting: !!this.wait };
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.root.removeEventListener('click', this.onClick);
    this.setView(null); if (this.bview) disposeScene(this.bview.scene); this.bview = null;
    this.input.destroy(); this.touch?.destroy();
    S(() => disposeModelCaches()); S(() => disposeMats());
    this.stage.dispose();
    if (window.__festa === this) window.__festa = null;
  }
}
