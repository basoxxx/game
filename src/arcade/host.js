// Arcade Baso — the live game host shared by the four games: DOM (canvas, HUD, touch buttons), unified
// input (keyboard, up to two controllers, mouse, touch drag / swipe / tap, virtual buttons), the loop
// with a deterministic step(dt) for tests, pause, countdown, banners, score pop-ups, sounds and the
// two-player flow (co-op inside the game, or alternating turns on the same seed).
import { Stage } from './stage.js';
import { osfx, vsfx, sfx as uisfx, music } from '../ui/audio.js';
import { GAMES } from './meta.js';

const VIEWS = { astro: () => import('./astro-view.js'), rimbalzo: () => import('./rimbalzo-view.js'), corri: () => import('./corri-view.js'), labirinto: () => import('./labirinto-view.js') };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- input
const KEYMAP = {
  // [player-in-coop, action]; single player and alternating turns accept both sides
  KeyW: [0, 'up'], KeyS: [0, 'down'], KeyA: [0, 'left'], KeyD: [0, 'right'], Space: [0, 'a'], ShiftLeft: [0, 'b'], KeyF: [0, 'a'], KeyG: [0, 'b'], KeyB: [0, 'b'], KeyX: [0, 'b'], KeyZ: [0, 'a'],
  ArrowUp: [1, 'up'], ArrowDown: [1, 'down'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], Enter: [1, 'a'], NumpadEnter: [1, 'a'], ShiftRight: [1, 'b'], Numpad0: [1, 'b'], Slash: [1, 'b'], Period: [1, 'a'], KeyL: [1, 'a'], KeyK: [1, 'b'],
};
export class Input {
  constructor() {
    this.keys = new Set(); this.kdown = []; this.pads = []; this.padPrev = {}; this.swipes = []; this.taps = 0; this.drag = [0, 0];
    this.ptrs = new Map(); this.mouse = { x: 0, y: 0, down: false, on: false, moved: false, click: 0 }; this.touch = null; this.vb = new Set(); this.vdown = [];
    this.coop = false; this.lastDir = [null, null];
  }
  // held state of an action for a player (coop: each side; otherwise any)
  side(code, p) { const m = KEYMAP[code]; return m && (!this.coop || m[0] === p) ? m[1] : null; }
  held(p, act) {
    for (const k of this.keys) if (this.side(k, p) === act) return true;
    if (this.vb.has(act) && (!this.coop || p === 0)) return true;
    const pad = this.padFor(p);
    if (pad) {
      const b = (i) => !!pad.buttons[i]?.pressed, ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (act === 'up' && (b(12) || ay < -0.5)) return true; if (act === 'down' && (b(13) || ay > 0.5)) return true;
      if (act === 'left' && (b(14) || ax < -0.5)) return true; if (act === 'right' && (b(15) || ax > 0.5)) return true;
      if (act === 'a' && (b(0) || b(7) || b(5))) return true; if (act === 'b' && (b(1) || b(2) || b(6) || b(4))) return true;
    }
    return false;
  }
  hit(p, act) {
    if (this.kdown.some((k) => this.side(k, p) === act)) return true;
    if (this.vdown.includes(act) && (!this.coop || p === 0)) return true;
    const pe = this.padEdges[this.coop ? p : 'any'];
    return !!pe && pe.has(act);
  }
  axis(p) {
    let x = 0, y = 0;
    if (this.held(p, 'left')) x--; if (this.held(p, 'right')) x++; if (this.held(p, 'up')) y++; if (this.held(p, 'down')) y--;
    const pad = this.padFor(p);
    if (pad) { const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0; if (Math.hypot(ax, ay) > 0.22) { x = ax; y = -ay; } }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }
  padFor(p) { return this.coop ? this.pads[p] : this.pads.find((q) => q.buttons.some((b) => b.pressed) || Math.hypot(q.axes[0] || 0, q.axes[1] || 0) > 0.3) || this.pads[0]; }
  poll() {
    this.pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
    this.padEdges = { any: new Set(), 0: new Set(), 1: new Set() };
    this.pads.forEach((pad, i) => {
      const prev = this.padPrev[pad.index] || {}, now = {};
      const b = (k) => !!pad.buttons[k]?.pressed, ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      now.up = b(12) || ay < -0.6; now.down = b(13) || ay > 0.6; now.left = b(14) || ax < -0.6; now.right = b(15) || ax > 0.6;
      now.a = b(0) || b(7) || b(5); now.b = b(1) || b(2) || b(6) || b(4); now.start = b(9);
      for (const k in now) if (now[k] && !prev[k]) { this.padEdges.any.add(k); if (i < 2) this.padEdges[i].add(k); }
      this.padPrev[pad.index] = now;
    });
  }
  endFrame() { this.kdown.length = 0; this.vdown.length = 0; this.swipes.length = 0; this.taps = 0; this.drag[0] = this.drag[1] = 0; this.mouse.click = 0; this.mouse.moved = false; }
}

class Snd {
  constructor(on) { this.on = on; this.t = {}; }
  play(name, gap = 0.04, ...a) {
    if (!this.on) return; const now = performance.now() / 1000; if (now - (this.t[name] || 0) < gap) return; this.t[name] = now;
    const f = { shoot: () => osfx.shoot(), pop: () => osfx.pop(), boom: () => osfx.boom(), hit: () => osfx.hit(), crash: () => osfx.crash(), slam: () => osfx.slam(), burst: () => osfx.burst(), alarm: () => osfx.alarm(), wave: () => osfx.wave(), hurt: () => osfx.hurt(), toggle: () => osfx.toggle(), ready: () => osfx.ready(), swat: () => osfx.swat(), fall: () => osfx.fall(), gate: () => osfx.gate(a[0] || 2), saw: () => osfx.saw(), minus: () => osfx.minus(),
      coin: () => uisfx.coin?.(), power: () => uisfx.levelup?.(), whoosh: () => uisfx.whoosh?.(), tick: () => uisfx.tick?.(), select: () => uisfx.select?.(), beep: () => vsfx.beep(false), go: () => vsfx.beep(true), gulp: () => vsfx.gulp(a[0] || 0), level: () => vsfx.level(), lost: () => vsfx.lost(), rival: () => vsfx.rival(), win: () => vsfx.end(true), lose: () => vsfx.end(false) }[name];
    try { f?.(); } catch {}
  }
}

export class ArcadeHost {
  constructor(root, o) {
    this.root = root;
    this.o = { game: 'astro', players: 1, tier: 'high', touchUI: false, volume: 0.6, skins: ['neon', 'brace'], trail: 'scintille', sim: {}, daily: null, ...o };
    this.game = GAMES[this.o.game];
    this.mode2 = this.o.players > 1 ? this.game.two : null; // 'coop' | 'alt' | null
    this.turn = 0; this.results = []; this.paused = false; this.over = false; this.count = 2.2; this.hold = false; this.clock = 0;
    this.I = new Input(); this.I.coop = this.mode2 === 'coop';
    this.pops = []; this.seed = this.o.sim.seed ?? ((Date.now() & 0xffffff) + 7);
  }
  async start() {
    const root = this.root, o = this.o;
    root.classList.add('dz-root'); // the controllers belong to the game, not to the menu focus bridge
    root.innerHTML = `<canvas class="ar-cv"></canvas><div class="ar-hud ${o.touchUI ? 'touch' : ''}" data-g="${o.game}">
      <div class="ar-top"><div class="ar-l"><div class="ar-score" id="ar-l1"></div><div class="ar-sub" id="ar-l2"></div></div><div class="ar-c" id="ar-c"></div><div class="ar-r"><div class="ar-r1" id="ar-r1"></div><div class="ar-r2" id="ar-r2"></div></div></div>
      <div class="ar-pops" id="ar-pops"></div><div class="ar-banner" id="ar-banner"></div><div class="ar-count" id="ar-count"></div>
      <button class="ar-pausebtn" id="ar-pausebtn" aria-label="Pausa">II</button><div class="ar-touch" id="ar-touch"></div></div>`;
    this.cv = root.querySelector('.ar-cv'); this.$ = (id) => root.querySelector('#' + id);
    const mod = await VIEWS[o.game]();
    this.mod = mod;
    this.sim = mod.createSim(this.simOpts());
    this.stage = new Stage(this.cv, { tier: o.tier, ...(mod.STAGE || {}) });
    this.snd = new Snd(o.volume > 0);
    this.view = new mod.View(this);
    this.view.build();
    this.$('ar-touch').innerHTML = this.view.touchHTML?.() || '';
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.view.sync(0); this.updateHud(true);
    if (this.mode2 === 'alt') this.banner('Giocatore 1', 'Poi tocca al Giocatore 2, stesso percorso', 2.2);
    else if (o.daily) this.banner('Sfida del giorno', `${o.daily.twist.name}: ${o.daily.twist.desc}`, 2.4);
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    try { music.setMood?.('orda'); } catch {}
    document.activeElement?.blur?.();
  }
  simOpts() { return { ...this.o.sim, seed: this.seed, players: this.mode2 === 'coop' ? 2 : 1 }; }
  resize() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    this.stage.resize(w, h);
    const f = this.view.frame(w, h); if (f) this.stage.frame(f);
    this.view.resized?.(w, h);
    const hud = this.root.querySelector('.ar-hud');
    hud.classList.toggle('compact', w < 760 || h < 560); hud.classList.toggle('portrait', h > w);
  }
  bindInput() {
    const I = this.I;
    this.onKD = (e) => {
      if (this.over) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); e.stopPropagation(); this.togglePause(); return; }
      if (KEYMAP[e.code]) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) I.kdown.push(e.code); I.keys.add(e.code); }
    };
    this.onKU = (e) => I.keys.delete(e.code);
    window.addEventListener('keydown', this.onKD, true); window.addEventListener('keyup', this.onKU, true);
    const cv = this.cv;
    this.onPD = (e) => {
      if (e.pointerType === 'mouse') { I.mouse.down = e.button === 0; I.mouse.on = true; I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.click++; return; }
      I.ptrs.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), sw: false });
      if (!I.touch) I.touch = e.pointerId;
      try { cv.setPointerCapture?.(e.pointerId); } catch {}
    };
    this.onPM = (e) => {
      if (e.pointerType === 'mouse') { I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.on = true; I.mouse.moved = true; return; }
      const t = I.ptrs.get(e.pointerId); if (!t) return;
      if (e.pointerId === I.touch) { I.drag[0] += e.clientX - t.lx; I.drag[1] += e.clientY - t.ly; }
      t.lx = t.x = e.clientX; t.ly = t.y = e.clientY;
      // swipes fire as soon as the finger has travelled far enough (no need to lift it)
      const dx = t.x - t.x0, dy = t.y - t.y0;
      if (Math.hypot(dx, dy) > 34) { I.swipes.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); t.x0 = t.x; t.y0 = t.y; t.sw = true; }
    };
    this.onPU = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) I.mouse.down = false; return; }
      const t = I.ptrs.get(e.pointerId); if (!t) return;
      if (!t.sw && performance.now() - t.t0 < 300 && Math.hypot(t.x - t.x0, t.y - t.y0) < 14) I.taps++;
      I.ptrs.delete(e.pointerId); if (I.touch === e.pointerId) I.touch = I.ptrs.keys().next().value ?? null;
    };
    this.onCtx = (e) => e.preventDefault();
    cv.addEventListener('pointerdown', this.onPD); cv.addEventListener('pointermove', this.onPM); cv.addEventListener('contextmenu', this.onCtx);
    window.addEventListener('pointerup', this.onPU); window.addEventListener('pointercancel', this.onPU);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over) this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.$('ar-pausebtn').addEventListener('click', () => this.togglePause());
    for (const b of this.root.querySelectorAll('.ar-touch [data-vb]')) {
      const act = b.dataset.vb;
      const on = (e) => { e.preventDefault(); e.stopPropagation(); I.vb.add(act); I.vdown.push(act); b.classList.add('on'); };
      const off = () => { I.vb.delete(act); b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
  }
  togglePause(force) {
    if (this.over) return;
    this.paused = force ?? !this.paused;
    this.I.keys.clear(); this.I.vb.clear();
    this.root.classList.toggle('dz-root', !this.paused); // paused: the controller drives the menu focus again
    this.o.onPause?.(this.paused);
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = Math.max(this.last, now);
    if (this.hold) return; // tests drive step() / render() themselves
    if (!this.paused) this.step(dt);
    else { this.I.poll(); if (this.I.padEdges.any.has('start')) this.togglePause(false); this.I.endFrame(); }
    this.render();
  }
  // one deterministic step of everything but drawing (tests drive this directly)
  step(dt) {
    this.clock += dt;
    const I = this.I; I.poll();
    if (I.padEdges.any.has('start') && !this.over) { this.togglePause(true); I.endFrame(); return; }
    if (this.count > 0) {
      const a = Math.ceil(this.count); this.count -= dt; const b = Math.ceil(this.count);
      const el = this.$('ar-count');
      if (a !== b || !el.textContent) { el.textContent = b > 0 ? b : 'Via!'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.snd.play(b > 0 ? 'beep' : 'go'); }
      if (this.count <= 0) setTimeout(() => { if (this.$('ar-count')) this.$('ar-count').textContent = ''; }, 500);
    } else if (!this.swapT) {
      this.view.control(I, dt);
      this.sim.step(dt);
    } else {
      this.swapT -= dt; if (this.swapT <= 0) this.nextTurn();
    }
    for (const e of this.sim.events) this.view.onEvent(e);
    this.sim.events.length = 0;
    this.view.sync(dt);
    this.stage.update(dt);
    this.updatePops(dt);
    this.updateHud();
    if (this.sim.over && !this.over && !this.swapT) this.simOver();
    I.endFrame();
  }
  render() { this.view.render ? this.view.render() : this.stage.render(); }
  simOver() {
    const r = { ...this.sim.result, player: this.turn };
    this.results.push(r);
    if (this.mode2 === 'alt' && this.turn === 0) {
      this.swapT = 3.2;
      this.banner(`${r.score.toLocaleString('it-IT')} punti`, 'Giocatore 2, tocca a te!', 3);
      return;
    }
    this.over = true;
    this.root.classList.remove('dz-root');
    this.snd.play(r.win ? 'win' : 'lose');
    const res = { game: this.o.game, daily: this.o.daily?.key || null, players: this.o.players, mode2: this.mode2, results: this.results, score: Math.max(...this.results.map((q) => q.score)), win: this.results.some((q) => q.win), main: this.results[0] };
    this.o.onEnd?.(res);
  }
  nextTurn() {
    this.swapT = 0; this.turn = 1;
    this.sim = this.mod.createSim(this.simOpts());
    this.view.reset?.();
    this.count = 2.2; this.banner('Giocatore 2', 'Stesso percorso: batti il punteggio!', 2);
    this.updateHud(true);
  }
  // ---------- HUD helpers
  updateHud(force) {
    const h = this.view.hud(); if (!h) return;
    if (this.mode2 === 'alt') h.c = `<span class="ar-ptag p${this.turn}">G${this.turn + 1}</span>${h.c || ''}`;
    for (const k of ['l1', 'l2', 'c', 'r1', 'r2']) { const v = h[k] ?? ''; if (force || this['_' + k] !== v) { this['_' + k] = v; const el = this.$('ar-' + k); if (el) el.innerHTML = v; } }
  }
  banner(title, sub = '', dur = 1.8, cls = '') {
    const el = this.$('ar-banner'); if (!el) return;
    el.className = `ar-banner on ${cls}`; el.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => { if (el.isConnected) el.className = 'ar-banner'; }, dur * 1000);
  }
  pop(x, y, z, text, cls = '') {
    if (this.pops.length > 14) { const old = this.pops.shift(); old.el.remove(); }
    const el = document.createElement('div'); el.className = 'ar-pop ' + cls; el.textContent = text;
    this.$('ar-pops').appendChild(el);
    this.pops.push({ el, x, y, z, t: 0 });
  }
  updatePops(dt) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt;
      if (p.t > 0.9) { p.el.remove(); this.pops.splice(i, 1); continue; }
      const [sx, sy] = this.stage.toScreen(p.x, p.y, p.z);
      p.el.style.transform = `translate(${sx.toFixed(1)}px, ${(sy - p.t * 46).toFixed(1)}px) translate(-50%, -50%) scale(${(1 + Math.max(0, 0.25 - p.t) * 2).toFixed(2)})`;
      p.el.style.opacity = String(Math.min(1, (0.9 - p.t) * 4));
    }
  }
  destroy() {
    cancelAnimationFrame(this.raf); clearTimeout(this.bannerT);
    window.removeEventListener('keydown', this.onKD, true); window.removeEventListener('keyup', this.onKU, true);
    window.removeEventListener('pointerup', this.onPU); window.removeEventListener('pointercancel', this.onPU);
    document.removeEventListener('visibilitychange', this.onVis);
    this.ro?.disconnect();
    try { this.view?.dispose?.(); } catch {}
    this.stage?.dispose();
    this.root.classList.remove('dz-root');
    this.root.innerHTML = '';
  }
}
