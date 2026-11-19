// Kart Baso — a live race / battle: simulation + 3D view + HUD + input + sound, the frame loop with a
// fixed 60 Hz step, split-screen viewports, pause, time-trial ghost recording and playback.
// window.__kart (set by the screen) exposes step(n) for deterministic headless tests.
import { Sim } from './sim.js';
import { KartView } from './view.js';
import { Hud } from './hud.js';
import { Inputs, TouchControls, wantsTouch } from './input.js';
import { KartSound } from './sound.js';
import { CHARACTERS, BODIES, WHEELS, PAINTS, ITEMS } from './data.js';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { rng, hashStr } from './track.js';

const STEP = 1 / 60;

// field: humans first, then AI rivals (other characters, random parts)
export function buildField({ players, n, seed = 1, battle = false }) {
  const R = rng(seed);
  const used = new Set(players.map((p) => p.char));
  const pool = CHARACTERS.filter((c) => !used.has(c.id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const karts = players.map((p, i) => ({ char: p.char, body: p.body, wheels: p.wheels, paint: p.paint, human: i, name: players.length > 1 ? `G${i + 1} · ${CHARACTERS.find((c) => c.id === p.char)?.name}` : CHARACTERS.find((c) => c.id === p.char)?.name }));
  for (let i = karts.length; i < n; i++) {
    const c = pool[(i - players.length) % pool.length] || CHARACTERS[i % CHARACTERS.length];
    karts.push({ char: c.id, body: BODIES[Math.floor(R() * BODIES.length)].id, wheels: WHEELS[Math.floor(R() * WHEELS.length)].id, paint: 'auto', human: -1 });
  }
  // humans start at the back of the grid in a race (Grand Prix tradition), mixed in battle
  if (!battle) return [...karts.slice(players.length), ...karts.slice(0, players.length)];
  return karts;
}

export class KartGame {
  // o: { mode, track, laps, cls, players: [{ char, body, wheels, paint, input: { kb, pad, touch } }], field (optional karts), n, seed, tier, ghost, volume, onEnd, onPause, autoGas }
  constructor(root, o) { this.root = root; this.o = o; this.paused = false; this.over = false; this.acc = 0; this.frames = 0; this.trace = []; }
  async start() {
    const o = this.o, root = this.root;
    const battle = o.mode === 'battle';
    const field = o.field || buildField({ players: o.players, n: o.n ?? (o.mode === 'tt' ? 1 : battle ? Math.max(4, o.players.length + 2) : 8), seed: o.seed, battle });
    const sim = this.sim = new Sim({ mode: o.mode, track: o.track, laps: o.laps || 3, cls: o.cls, karts: field, seed: o.seed ?? hashStr(String(o.track)), timeLimit: o.timeLimit });
    this.players = o.players.map((p, i) => ({ ...p, kart: sim.karts.findIndex((k) => k.human === i) }));
    root.innerHTML = '<canvas class="kt-cv"></canvas>';
    this.cv = root.querySelector('canvas');
    const tier = this.tier = o.tier || 'high';
    this.view = new KartView(this.cv, sim, { tier, views: Math.max(1, this.players.length), preserve: o.preserve });
    const r = this.view.renderer;
    this.basePR = pixelRatio(this.players.length > 1 ? 1.25 : 1.6);
    r.setPixelRatio(this.basePR);
    const setPR = (pr) => { if (Math.abs(r.getPixelRatio() - pr) < 0.01) return false; r.setPixelRatio(pr); this.resize(); };
    this.guard = new FrameGuard([
      { fps: 45, run: () => setPR(Math.min(1, this.basePR)) },
      { fps: 36, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.view.shadows = false; this.view.built.sun.castShadow = false; this.view.scene.traverse((x) => { if (x.material) x.material.needsUpdate = true; }); } },
      { fps: 30, run: () => setPR(0.8) },
      { fps: 24, run: () => setPR(0.65) },
    ]);
    this.hud = new Hud(root, sim, this.players, { compact: o.compact });
    this.inputs = new Inputs(this.players.map((p) => p.input || { kb: 'all', pad: 0 }), { onPause: () => this.togglePause() });
    if (this.players.length === 1 && (o.touch ?? wantsTouch())) {
      this.players[0].input = { ...(this.players[0].input || {}), touch: true };
      this.inputs.players[0].touch = true;
      this.touch = this.inputs.touch = new TouchControls(root, { auto: o.autoGas !== false });
      const pb = document.createElement('button'); pb.className = 'kt-pausebtn'; pb.setAttribute('aria-label', 'Pausa'); pb.textContent = 'II';
      pb.addEventListener('pointerdown', (e) => { e.preventDefault(); this.togglePause(); }); root.appendChild(pb);
    } else {
      const pb = document.createElement('button'); pb.className = 'kt-pausebtn desk'; pb.setAttribute('aria-label', 'Pausa'); pb.textContent = 'II';
      pb.addEventListener('click', () => this.togglePause()); root.appendChild(pb);
    }
    this.sound = new KartSound((o.volume ?? 1) > 0);
    if (o.ghost && o.mode === 'tt') this.view.setGhost(true);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.onVis = () => { if (document.hidden && !this.paused && !this.over && sim.state !== 'done') this.togglePause(true); };
    document.addEventListener('visibilitychange', this.onVis);
    this.last = performance.now();
    // first frame: snap the cameras behind the karts
    this.view.update(0, this.players.map((p) => p.kart));
    this.players.forEach((p, i) => this.view.updateCamera(i, sim.karts[p.kart], 0.016, { snap: true }));
    if (!this.players.length) this.view.updateCamera(0, sim.karts[0], 0.016, { snap: true });
    this.loop = this.loop.bind(this);
    if (!o.manual) this.raf = requestAnimationFrame(this.loop);
    document.activeElement?.blur?.();
  }
  layout(W, H) {
    const n = Math.max(1, this.players.length);
    if (n === 1) return [{ x: 0, y: 0, w: W, h: H }];
    if (n === 2) {
      const tb = Math.abs(Math.log((W / (H / 2)) / 1.6)), sbs = Math.abs(Math.log((W / 2 / H) / 1.6));
      if (tb <= sbs) return [{ x: 0, y: 0, w: W, h: Math.floor(H / 2) - 1 }, { x: 0, y: Math.ceil(H / 2) + 1, w: W, h: Math.floor(H / 2) - 1 }];
      return [{ x: 0, y: 0, w: Math.floor(W / 2) - 1, h: H }, { x: Math.ceil(W / 2) + 1, y: 0, w: Math.floor(W / 2) - 1, h: H }];
    }
    const w = Math.floor(W / 2) - 1, h = Math.floor(H / 2) - 1;
    return [{ x: 0, y: 0, w, h }, { x: W - w, y: 0, w, h }, { x: 0, y: H - h, w, h }, { x: W - w, y: H - h, w, h }].slice(0, n);
  }
  resize() {
    const W = this.root.clientWidth || innerWidth, H = this.root.clientHeight || innerHeight;
    const r = this.view.renderer, pr = r.getPixelRatio();
    r.setSize(W, H, false);
    const vps = this.layout(W, H);
    this.view.setViewports(vps.map((v) => ({ x: Math.round(v.x * pr), y: Math.round(v.y * pr), w: Math.round(v.w * pr), h: Math.round(v.h * pr) })), Math.round(W * pr), Math.round(H * pr), pr);
    // field of view per viewport: keep ~96° horizontally on wide views, more vertical room on tall ones
    vps.forEach((v, i) => { const a = v.w / v.h; const vf = (2 * Math.atan(Math.tan((48 * Math.PI) / 180) / a) * 180) / Math.PI; this.view.cams[i].fovBase = Math.max(46, Math.min(92, vf)); this.view.cams[i].portrait = a < 0.9; });
    this.hud.layout(vps, W, H);
    this.root.classList.toggle('kt-portrait', H > W);
  }
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.frame(dt);
    if (!this.paused) this.guard.tick();
  }
  // one rendered frame: fixed steps, then view / HUD / sound
  frame(dt) {
    if (this.paused) { this.render(0); return; }
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 6) { this.tick(); this.acc -= STEP; n++; }
    if (n === 6) this.acc = 0;
    this.render(dt);
  }
  tick() {
    const S = this.sim;
    this.players.forEach((p, i) => { const k = S.karts[p.kart]; if (!k.auto || S.state === 'count') this.inputs.read(i, k.input); });
    S.step(STEP);
    this.frames++;
    // time trial: record a ghost at 10 Hz
    if (S.mode === 'tt' && S.state === 'race' && this.frames % 6 === 0) { const k = S.karts[0]; this.trace.push(+S.t.toFixed(2), +k.x.toFixed(2), +k.y.toFixed(2), +k.z.toFixed(2), +k.h.toFixed(3)); }
    for (const e of S.popEvents()) this.onEvent(e);
  }
  onEvent(e) {
    const S = this.sim;
    this.view.onEvent(e);
    const pi = e.k != null ? this.players.findIndex((p) => p.kart === e.k) : -1;
    const k = e.k != null ? S.karts[e.k] : null;
    const p1 = S.karts[this.players[0]?.kart ?? 0];
    const near = (e.x != null ? Math.hypot(e.x - p1.x, e.z - p1.z) : k ? Math.hypot(k.x - p1.x, k.z - p1.z) : 999) < 45;
    this.sound.event(e, pi >= 0 || (e.by != null && this.players.some((p) => p.kart === e.by)), near);
    const H = this.hud;
    if (e.t === 'explode') this.players.forEach((p, i) => { const q = S.karts[p.kart]; const d = Math.hypot(q.x - e.x, q.z - e.z); if (d < 25) this.view.kick(i, (1 - d / 25) * 1.1); });
    if (pi < 0) {
      if (e.t === 'hit' && e.by != null) { const j = this.players.findIndex((p) => p.kart === e.by); if (j >= 0) H.msg(j, S.battle ? 'Colpito!' : 'Preso!', 'good', 0.9); }
      if (e.t === 'balloon' && e.by != null) { const j = this.players.findIndex((p) => p.kart === e.by); if (j >= 0) H.msg(j, 'Palloncino!', 'good', 0.9); }
      return;
    }
    switch (e.t) {
      case 'go': break;
      case 'boost': if (e.start) H.msg(pi, 'Partenza a razzo!', 'good', 1.2); else if (e.tier) H.msg(pi, ['', 'Mini-turbo!', 'Super turbo!', 'Ultra turbo!'][e.tier], 't' + e.tier, 0.8); else if (e.trick) H.msg(pi, 'Acrobazia!', 'good', 0.8); this.view.kick(pi, 0.15); break;
      case 'stall': H.msg(pi, 'Motore ingolfato!', 'bad', 1.2); break;
      case 'hit': H.flash(pi, 'rgba(255,60,60,.45)'); this.view.kick(pi, e.kind === 'blast' ? 0.9 : 0.5); if (e.kind !== 'bump') H.msg(pi, e.kind === 'blast' ? 'Kaboom!' : 'Che botta!', 'bad', 0.9); try { navigator.vibrate?.(60); } catch {} break;
      case 'shield': H.msg(pi, 'Scudo!', 'good', 0.8); H.flash(pi, 'rgba(74,214,255,.4)'); break;
      case 'wall': this.view.kick(pi, e.pow * 0.5); break;
      case 'land': this.view.kick(pi, e.pow * 0.3); break;
      case 'lap': H.msg(pi, e.final ? 'Ultimo giro!' : `Giro ${e.lap}`, e.final ? 'final' : '', 1.6); break;
      case 'finish': H.msg(pi, `Arrivo! ${k.place}°`, k.place <= 3 ? 'good big' : 'big', 3); break;
      case 'respawn': H.msg(pi, 'Ti riporto in pista', '', 1); break;
      case 'steal': H.msg(pi, e.balloon ? 'Palloncino rubato!' : e.none ? 'Calamita!' : 'Oggetto rubato!', 'good', 1); break;
      case 'balloon': H.msg(pi, e.left ? `Restano ${e.left} palloncini` : 'Eliminato!', 'bad', 1.2); break;
      case 'got': break;
      case 'pass': break;
    }
    if (e.t === 'done') this.end();
  }
  render(dt) {
    const S = this.sim, v = this.view;
    v.update(dt, this.players.map((p) => p.kart));
    if (this.o.ghost && v.ghost) this.placeGhost();
    if (this.camOverride) this.camOverride(v);
    else if (!this.players.length) v.updateCamera(0, S.order?.[0] || S.karts[0], dt);
    else this.players.forEach((p, i) => { const k = S.karts[p.kart]; v.updateCamera(i, k.out && S.t - (k.outT || 0) > 1.5 ? (S.order || S.karts).find((x) => !x.out) || k : k, dt); }); // knocked out: watch the leader
    v.render();
    this.hud.update(dt);
    this.touch?.update(S.state !== 'done' && !this.paused);
    const p1 = this.players[0] && S.karts[this.players[0].kart];
    if (p1 && !this.paused && !p1.finished) this.sound.engine(p1, S.state); else this.sound.stopEngine();
    if (S.state === 'done' && !this.over) this.end();
  }
  placeGhost() {
    const G = this.o.ghost, t = this.sim.t; const n = G.length / 5; if (n < 2 || this.sim.state === 'count') { this.view.ghost.visible = false; return; }
    let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (G[m * 5] <= t) lo = m; else hi = m - 1; }
    const a = lo * 5, b = Math.min(n - 1, lo + 1) * 5, f = G[b] > G[a] ? Math.min(1, (t - G[a]) / (G[b] - G[a])) : 0;
    let dh = G[b + 4] - G[a + 4]; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.view.ghost.visible = t < G[(n - 1) * 5] + 1;
    this.view.placeGhost(G[a + 1] + (G[b + 1] - G[a + 1]) * f, G[a + 2] + (G[b + 2] - G[a + 2]) * f, G[a + 3] + (G[b + 3] - G[a + 3]) * f, G[a + 4] + dh * f);
  }
  togglePause(force) {
    if (this.over || this.sim.state === 'done') return;
    this.paused = force ?? !this.paused;
    if (this.paused) { this.sound.stopEngine(); this.inputs.keys.clear(); }
    this.root.classList.toggle('dz-root', !this.paused); // hands the controller back to the menus while paused
    this.o.onPause?.(this.paused);
    this.last = performance.now();
  }
  // test hook: n fixed steps without rendering
  step(n = 1) { for (let i = 0; i < n && !this.over; i++) { this.tick(); if (this.sim.state === 'done') { this.end(); break; } } return this.sim.summary(); }
  end() {
    if (this.over) return;
    this.over = true;
    this.sound.stopEngine();
    this.root.classList.remove('dz-root');
    const S = this.sim;
    const order = (S.order || S.karts).map((k) => ({ i: k.i, name: k.name, char: k.char, human: k.human, place: k.place, time: k.finishT, est: !!k.estimated, best: k.lapTimes.length ? Math.min(...k.lapTimes) : 0, laps: k.lapTimes.slice(), coins: k.coinsGot, balloons: k.balloons, hits: k.hits, out: k.out, stats: k.stats }));
    const res = { mode: S.mode, track: this.o.track, cls: this.o.cls, laps: S.laps, order, players: this.players.map((p) => order.find((x) => x.i === p.kart)), trace: S.mode === 'tt' ? this.trace : null, t: S.t };
    setTimeout(() => this.o.onEnd?.(res), this.o.endDelay ?? 1800);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); document.removeEventListener('visibilitychange', this.onVis);
    this.inputs?.destroy(); this.hud?.destroy(); this.sound?.destroy();
    this.view?.dispose();
    this.root.innerHTML = ''; this.root.classList.remove('dz-root');
  }
}
export { ITEMS, PAINTS };
