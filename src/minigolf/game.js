// Minigolf Baso — the live game: a round of one or more holes for 1-4 players (hot seat, alternate
// strokes), slingshot aiming (drag back from the ball) or keys / controller, power meter, short exact
// trajectory preview, orbit / overview camera, penalties, hole cards and instant replays.
// Everything runs on the fixed physics clock, so tests can drive it with window.__minigolf.step(dt).
import * as THREE from 'three';
import { Sim, DT } from './physics.js';
import { HoleView } from './render.js';
import { tileDist, DIRS, BALL_R } from './holes.js';
import { THEMES } from './courses.js';
import { scoreName, MAX_STROKES } from './meta.js';
import { pixelRatio } from '../ui/quality.js';
import { FrameGuard } from '../ui/perfguard.js';
import { sfx, osfx, vsfx } from '../ui/audio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtPar = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`);

export class MinigolfGame {
  constructor(root, opts) {
    this.root = root; this.o = opts;
    this.holes = opts.holes; this.hi = opts.startHole || 0;
    this.players = opts.players.map((p, i) => ({ ...p, i, card: [], total: 0 }));
    this.sound = opts.sound !== false;
    this.manual = false; this.paused = false; this.queue = []; this.time = 0;
    this.cam = { yaw: 0, pitch: 0.62, dist: 2.6, mode: 'follow', pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.keys = new Set();
  }
  snd(f) { if (this.sound) try { f(); } catch {} }
  async start() {
    const root = this.root;
    root.innerHTML = `<canvas class="mg-canvas"></canvas><div class="mg-hud"></div><div class="mg-msg" aria-live="polite"></div><div class="mg-over"></div>`;
    this.canvas = root.querySelector('canvas'); this.hud = root.querySelector('.mg-hud'); this.msgEl = root.querySelector('.mg-msg'); this.over = root.querySelector('.mg-over');
    const tier = this.o.tier || 'high';
    this.tier = tier;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: tier !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(pixelRatio(tier === 'high' ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.guard = new FrameGuard([
      { fps: 45, run: () => { const pr = r.getPixelRatio(); if (pr <= 1) return false; r.setPixelRatio(1); this.resize(); } },
      { fps: 35, run: () => { if (!r.shadowMap.enabled) return false; r.shadowMap.enabled = false; this.view?.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); } },
      { fps: 26, run: () => { r.setPixelRatio(0.75); this.resize(); } },
    ]);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(root);
    this.loadHole(this.hi);
    this.resize();
    this.last = performance.now();
    const loop = (now) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
      if (!this.manual) { if (!this.paused) this.advance(dt); this.pollPad(dt); this.render(dt); this.guard.tick(); }
    };
    this.raf = requestAnimationFrame(loop);
    window.__minigolf = this.api();
  }
  api() {
    const g = this;
    return {
      game: g,
      get sim() { return g.sim; },
      set manual(v) { g.manual = !!v; },
      get manual() { return g.manual; },
      step(sec = 1 / 60) { const n = Math.max(1, Math.round(sec / (1 / 60))); for (let i = 0; i < n; i++) g.advance(1 / 60); g.render(1 / 60); return g.state(); },
      shoot(a, p) { return g.shoot(a, p); },
      aim(a, p) { g.aimA = a; g.power = p; g.cam.yaw = a; g.updateAim(); g.drawPower(); g.render(0); },
      state: () => g.state(),
      overview: (on) => g.setOverview(on),
      render: () => g.render(0),
    };
  }
  state() {
    const P = this.cur;
    return { hole: this.hi, holeId: this.spec?.id, phase: this.phase, player: P?.i, strokes: P?.strokes, ball: this.sim ? [...this.sim.p] : null, simState: this.sim?.state, t: this.sim?.t, players: this.players.map((p) => ({ name: p.name, strokes: p.strokes, done: p.done, total: p.total })), over: this.over.innerHTML.length > 0 };
  }
  // ---------- holes
  loadHole(i) {
    this.view?.dispose();
    this.hi = i;
    const spec = this.spec = this.holes[i];
    this.sim = new Sim(spec); this.psim = new Sim(spec);
    this.toCup = tileDist(this.sim.hole, this.sim.hole.cup);
    const view = this.view = new HoleView(this.renderer, this.sim, { theme: spec.theme || 'giardino', tier: this.tier });
    for (const p of this.players) {
      p.p = [...this.sim.teePos]; p.strokes = 0; p.done = false; p.shots = []; p.power = p.power ?? 0.45; p.pen = 0;
      p.ball = view.addBall({ skin: p.skin, color: p.color, hat: p.hat, trail: p.trail });
    }
    this.queue = []; this.over.innerHTML = ''; this.phase = 'intro';
    this.ci = 0; this.cur = this.players[0];
    this.introT = 1.6;
    const ov = this.overviewPose();
    this.cam.pos.copy(ov.pos); this.cam.look.copy(ov.look);
    this.beginTurn(true);
    this.banner(`<small>${esc(this.o.label ? this.o.label(i) : `Buca ${i + 1}`)}</small><b>${esc(spec.name)}</b><span>Par ${spec.par}</span>`, 1.8);
    this.drawHud();
  }
  beginTurn(first) {
    const P = this.cur;
    this.sim.reset(P.p);
    this.aimA = this.defaultAim(P.p);
    this.power = P.power;
    this.cam.yaw = this.aimA;
    this.phase = first ? 'intro' : 'aim';
    for (const q of this.players) this.view.placeBall(q.ball, q.p, { roll: false, ghost: q !== P, visible: !q.done });
    this.view.clearTrail(P.ball);
    this.updateAim(); this.drawHud();
    if (!first && this.players.length > 1) this.banner(`<b style="color:${P.color}">Tocca a ${esc(P.name)}</b><span>Colpo ${P.strokes + 1}</span>`, 1.1);
  }
  defaultAim(p) {
    const h = this.sim.hole, cup = this.sim.cup;
    let c = h.at(Math.floor(p[0]), Math.floor(p[2]));
    const key = (x) => x.r * h.W + x.c;
    if (!c || c === h.cup) return Math.atan2(cup.x - p[0], -(cup.z - p[2]));
    let target = null, dir = null;
    for (let k = 0; k < 6; k++) {
      let best = null, bd = this.toCup.get(key(c)) ?? 99, bs = -1;
      for (let s = 0; s < 4; s++) { const n = h.at(c.c + DIRS[s][0], c.r + DIRS[s][1]); const d = n ? this.toCup.get(key(n)) : undefined; if (d !== undefined && d < bd && n.t !== 'X') { bd = d; best = n; bs = s; } }
      if (!best || (dir !== null && bs !== dir)) break;
      dir = bs; c = best; target = best;
      if (best === h.cup) break;
    }
    if (target === h.cup || !target) return Math.atan2(cup.x - p[0], -(cup.z - p[2]));
    return Math.atan2(target.c + 0.5 - p[0], -(target.r + 0.5 - p[2]));
  }
  shoot(a = this.aimA, power = this.power) {
    if (this.phase !== 'aim' || this.paused) return false;
    const P = this.cur;
    power = clamp(power, 0.02, 1);
    P.shots.push({ p: [...P.p], t: this.sim.t, a, pw: power });
    P.power = power; P.strokes++;
    this.sim.shoot(a, power);
    this.phase = 'moving'; this.aimA = a; this.power = power;
    this.view.setAim(false);
    this.snd(() => osfx.pop());
    this.wallT = 0;
    this.drawHud();
    return true;
  }
  // ---------- simulation clock
  advance(dt) {
    this.time += dt;
    if (this.introT > 0) { this.introT -= dt; if (this.introT <= 0 && this.phase === 'intro') { this.phase = 'aim'; this.updateAim(); this.drawHud(); } }
    for (const q of [...this.queue]) { q.t -= dt; if (q.t <= 0) { this.queue.splice(this.queue.indexOf(q), 1); q.f(); } }
    if (this.replay) { this.stepReplay(dt); return; }
    this.acc = (this.acc || 0) + dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.sim.step();
      if (this.sim.events.length) this.handleEvents();
    }
    const P = this.cur;
    if (this.phase === 'moving' || this.phase === 'aim' || this.phase === 'intro') { P.p = [...this.sim.p]; this.view.placeBall(P.ball, P.p); }
    // keyboard aiming
    if (this.phase === 'aim' && !this.paused) {
      const k = this.keys, fine = k.has('ShiftLeft') || k.has('ShiftRight') ? 0.25 : 1;
      let ch = false;
      if (k.has('ArrowLeft') || k.has('KeyA')) { this.aimA -= 1.4 * dt * fine; ch = true; }
      if (k.has('ArrowRight') || k.has('KeyD')) { this.aimA += 1.4 * dt * fine; ch = true; }
      if (k.has('ArrowUp') || k.has('KeyW')) { this.power = clamp(this.power + 0.6 * dt * fine, 0.02, 1); ch = true; }
      if (k.has('ArrowDown') || k.has('KeyS')) { this.power = clamp(this.power - 0.6 * dt * fine, 0.02, 1); ch = true; }
      if (ch) { this.cam.yaw = this.aimA; this.updateAim(); this.drawPower(); }
    }
    if (k2(this.keys, 'KeyQ')) this.cam.yaw -= 1.6 * dt;
    if (k2(this.keys, 'KeyE')) this.cam.yaw += 1.6 * dt;
    this.view.update(this.time, dt);
  }
  handleEvents() {
    const sim = this.sim, P = this.cur;
    while (sim.events.length) {
      const e = sim.events.shift();
      if (e.type === 'wall') { if (this.time - (this.wallT || 0) > 0.08) { this.wallT = this.time; this.snd(() => sfx.tick()); } }
      else if (e.type === 'bump') { this.view.bump(e.b); this.snd(() => osfx.gate(2)); }
      else if (e.type === 'blade') this.snd(() => osfx.swat());
      else if (e.type === 'tele') { this.snd(() => sfx.whoosh()); this.view.clearTrail(P.ball); P.ball.last = null; }
      else if (e.type === 'land') this.snd(() => osfx.hit());
      else if (e.type === 'penalty') {
        P.strokes++; P.pen++;
        const t = { water: ['Splash!', 'In acqua: +1 colpo'], lava: ['Bruciata!', 'Nella lava: +1 colpo'], out: ['Fuori!', 'Pallina fuori dal percorso: +1 colpo'] }[e.why];
        this.snd(() => (e.why === 'lava' ? osfx.hit() : osfx.fall()));
        this.flash(`<b>${t[0]}</b><span>${t[1]}</span>`, 'bad');
        this.phase = 'wait';
        this.later(1.2, () => { sim.respot(); P.p = [...sim.p]; this.view.clearTrail(P.ball); P.ball.last = null; this.view.placeBall(P.ball, P.p, { roll: false }); this.afterShot(); });
      } else if (e.type === 'holed') {
        P.done = true; P.p = [...sim.p];
        this.view.placeBall(P.ball, P.p, { roll: false });
        this.snd(() => vsfx.gulp(0.25));
        const nm = scoreName(P.strokes, this.spec.par);
        this.flash(`<b>${esc(nm)}</b><span>${this.players.length > 1 ? esc(P.name) + ' · ' : ''}${P.strokes} ${P.strokes === 1 ? 'colpo' : 'colpi'}</span>`, P.strokes <= this.spec.par ? 'good' : '');
        if (P.strokes === 1) this.snd(() => { sfx.win(); setTimeout(() => sfx.levelup?.(), 500); });
        else if (P.strokes <= this.spec.par) this.snd(() => sfx.ok());
        this.confetti(P.p, P.strokes <= this.spec.par);
        this.phase = 'wait';
        this.later(1.5, () => { P.ball.g.visible = false; this.afterShot(); });
      } else if (e.type === 'rest') { this.phase = 'wait'; this.later(0.35, () => this.afterShot()); }
    }
  }
  later(t, f) { this.queue.push({ t, f }); }
  afterShot() {
    const P = this.cur;
    if (!P.done && P.strokes >= MAX_STROKES) { P.done = true; P.strokes = MAX_STROKES; P.ball.g.visible = false; this.flash(`<b>Massimo colpi</b><span>${esc(P.name)}: ${MAX_STROKES} colpi</span>`, ''); }
    this.drawHud();
    if (this.players.every((p) => p.done)) { this.later(P.done && P.strokes < MAX_STROKES ? 0.2 : 1.0, () => this.holeDone()); return; }
    // next player still playing (alternate strokes)
    let n = this.ci;
    for (let k = 1; k <= this.players.length; k++) { const j = (this.ci + k) % this.players.length; if (!this.players[j].done) { n = j; break; } }
    this.ci = n; this.cur = this.players[n];
    this.beginTurn(false);
  }
  holeDone() {
    this.phase = 'card';
    const res = this.players.map((p) => ({ i: p.i, name: p.name, strokes: p.strokes, shots: p.shots, pen: p.pen }));
    for (const p of this.players) { p.card[this.hi] = p.strokes; p.total = p.card.reduce((a, b) => a + (b || 0), 0); }
    const extra = this.o.onHole?.(this.spec, res, this.hi) || {};
    this.drawHud();
    const last = this.hi >= this.holes.length - 1;
    const parTot = this.holes.slice(0, this.hi + 1).reduce((a, h) => a + h.par, 0);
    const rows = this.players.map((p) => `<li style="--c:${p.color}"><i></i><b>${esc(p.name)}</b><em>${p.strokes}</em><span>${esc(scoreName(p.strokes, this.spec.par))}</span><small>${fmtPar(p.total - parTot)}</small></li>`).join('');
    this.over.innerHTML = `<div class="mg-card" role="dialog" aria-label="Fine buca">
      <div class="mg-card-k">${esc(this.o.label ? this.o.label(this.hi) : `Buca ${this.hi + 1}`)} · Par ${this.spec.par}</div>
      <h2>${esc(this.players.length === 1 ? scoreName(this.players[0].strokes, this.spec.par) : this.spec.name)}</h2>
      ${this.players.length === 1 && extra.stars != null ? `<div class="mg-stars">${[1, 2, 3].map((s) => `<i class="${s <= extra.stars ? 'on' : ''}">★</i>`).join('')}</div>` : ''}
      <ol class="mg-card-list">${rows}</ol>
      ${extra.coins ? `<div class="mg-card-coins">+${extra.coins} monete${extra.record ? ' · <b>nuovo record</b>' : ''}</div>` : extra.record ? '<div class="mg-card-coins"><b>Nuovo record!</b></div>' : ''}
      <div class="mg-card-btns"><button class="btn" data-mg="replay">Rivedi</button><button class="btn primary" data-mg="next">${last ? 'Risultati' : 'Prossima buca'}</button></div>
    </div>`;
    requestAnimationFrame(() => this.over.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }
  next() {
    if (this.replay) this.stopReplay();
    if (this.hi >= this.holes.length - 1) { this.finish(); return; }
    this.loadHole(this.hi + 1);
  }
  finish() {
    this.phase = 'end'; this.over.innerHTML = ''; this.hud.innerHTML = '';
    const parTot = this.holes.reduce((a, h) => a + h.par, 0);
    const players = this.players.map((p) => ({ name: p.name, color: p.color, card: p.card, total: p.total, vs: p.total - parTot }));
    this.o.onEnd?.({ players, par: parTot, holes: this.holes });
  }
  restartHole() { if (this.replay) this.stopReplay(); for (const p of this.players) p.card[this.hi] = undefined; this.loadHole(this.hi); }
  // ---------- replay of the hole just played (bit-exact: same states, same shots)
  startReplay() {
    const best = [...this.players].sort((a, b) => a.strokes - b.strokes)[0];
    if (!best?.shots.length) return;
    this.over.classList.add('hide');
    const rs = new Sim(this.spec);
    this.replay = { sim: rs, shots: best.shots, k: -1, wait: 0.4, acc: 0, P: best, saved: this.view.sim };
    this.view.sim = rs;
    for (const p of this.players) p.ball.g.visible = false;
    best.ball.g.visible = true; this.view.clearTrail(best.ball); best.ball.last = null;
    this.flash('<b>Replay</b>', '');
  }
  stepReplay(dt) {
    const R = this.replay, s = R.sim;
    if (R.wait > 0) {
      R.wait -= dt;
      if (R.wait <= 0) {
        R.k++;
        if (R.k >= R.shots.length) { this.stopReplay(); return; }
        const sh = R.shots[R.k]; s.t = sh.t; s.reset(sh.p); s.shoot(sh.a, sh.pw); this.snd(() => osfx.pop());
        R.P.ball.last = null;
      }
    } else {
      R.acc += dt;
      while (R.acc >= DT) { R.acc -= DT; s.step(); for (const e of s.events.splice(0)) { if (e.type === 'bump') this.view.bump(e.b); if (e.type === 'holed') this.snd(() => vsfx.gulp(0.25)); if (e.type === 'tele') R.P.ball.last = null; } }
      if (s.state !== 'moving') R.wait = 0.7;
    }
    this.view.placeBall(R.P.ball, s.p);
    this.view.update(this.time, dt);
  }
  stopReplay() {
    const R = this.replay; if (!R) return;
    this.view.sim = R.saved; this.replay = null;
    for (const p of this.players) p.ball.g.visible = false;
    this.over.classList.remove('hide');
    requestAnimationFrame(() => this.over.querySelector('.btn.primary')?.focus({ preventScroll: true }));
  }
  // ---------- aim helpers
  updateAim() {
    if (this.phase !== 'aim') { this.view.setAim(false); return; }
    const P = this.cur;
    const ps = this.psim; ps.t = this.sim.t; ps.reset(P.p); ps.shoot(this.aimA, this.power);
    const pts = []; let len = 0, last = [...P.p], walls = 0;
    for (let i = 0; i < 240 && ps.state === 'moving'; i++) {
      ps.step();
      for (const e of ps.events.splice(0)) if (e.type === 'wall' || e.type === 'bump') walls++;
      len += Math.hypot(ps.p[0] - last[0], ps.p[2] - last[2]); last = [...ps.p];
      if (i % 4 === 0) pts.push([ps.p[0], ps.p[1] - BALL_R + 0.02, ps.p[2]]);
      if (len > 0.6 + this.power * 1.4 || walls > 1 || pts.length >= 26) break;
    }
    this.view.setAim(true, P.p, this.aimA, this.power, pts);
  }
  // ---------- camera
  overviewPose() {
    const h = this.sim.hole, asp = this.aspect || 1.6;
    const cx = h.W / 2, cz = h.H / 2, fov = (this.camera?.fov || 50) * Math.PI / 180;
    const needV = h.H * 0.62 + 1, needH = (h.W + 1.5) / asp;
    const d = Math.max(needV, needH) / Math.tan(fov / 2) * 0.82 + 1.5;
    return { pos: new THREE.Vector3(cx, d * 0.92, cz + d * 0.42), look: new THREE.Vector3(cx, 0, cz + 0.1) };
  }
  setOverview(on = this.cam.mode !== 'overview') { this.cam.mode = on ? 'overview' : 'follow'; this.drawHud(); }
  updateCamera(dt) {
    const cam = this.camera, C = this.cam;
    if (this.camOverride) { this.camOverride(cam); return; }
    let pos, look;
    const ballP = this.replay ? this.replay.sim.p : this.cur.p;
    if (C.mode === 'overview' || (this.introT > 0.4 && this.phase === 'intro')) { const o = this.overviewPose(); pos = o.pos; look = o.look; }
    else {
      const b = new THREE.Vector3(ballP[0], ballP[1], ballP[2]);
      const moving = this.phase === 'moving' || this.replay;
      const port = this.aspect < 1;
      const dist = C.dist * (moving ? 1.25 : 1) * (port ? 1.3 : 1);
      const pitch = port ? Math.min(1.4, C.pitch + 0.18) : C.pitch;
      const cp = Math.cos(pitch), sp = Math.sin(pitch), ahead = port ? 1.5 : 0.6;
      pos = new THREE.Vector3(b.x - Math.sin(C.yaw) * cp * dist, b.y + sp * dist, b.z + Math.cos(C.yaw) * cp * dist);
      look = new THREE.Vector3(b.x + Math.sin(C.yaw) * ahead, b.y, b.z - Math.cos(C.yaw) * ahead);
      // keep the camera above the course pieces it would sink into
      pos.y = Math.max(pos.y, b.y + 0.35);
    }
    const k = dt <= 0 ? 1 : 1 - Math.exp(-dt * (this.introT > 0 ? 2.2 : 5));
    C.pos.lerp(pos, k); C.look.lerp(look, k);
    cam.position.copy(C.pos); cam.lookAt(C.look);
  }
  render(dt) {
    if (!this.view) return;
    if (!this.camera) this.camera = this.view.camera;
    this.camera = this.view.camera;
    this.camera.aspect = this.aspect || 1.6; this.camera.fov = (this.aspect || 1.6) < 1 ? 64 : 50; this.camera.updateProjectionMatrix();
    this.updateCamera(dt);
    const P = this.cur;
    if (P && !this.replay) { const r = this.view.ring; r.visible = this.phase === 'aim'; r.position.set(P.p[0], P.p[1] - BALL_R + 0.004, P.p[2]); r.material.opacity = 0.5 + 0.3 * Math.sin(this.time * 5); }
    this.renderer.render(this.view.scene, this.camera);
  }
  resize() {
    const w = this.root.clientWidth || 1, h = this.root.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.aspect = w / h; this.W = w; this.H = h;
    this.root.classList.toggle('mg-portrait', w < h);
    if (this.manual) this.render(0);
  }
  // ---------- input
  ballScreen() {
    const p = this.cur.p, v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.W, (-v.y * 0.5 + 0.5) * this.H, v.z < 1];
  }
  screenToWorldDir(dx, dy) {
    // inverse of the local XZ → screen map at the ball (works from any camera angle)
    const p = this.cur.p, pr = (x, z) => { const v = new THREE.Vector3(x, p[1], z).project(this.camera); return [(v.x * 0.5 + 0.5) * this.W, (-v.y * 0.5 + 0.5) * this.H]; };
    const o = pr(p[0], p[2]), ex = pr(p[0] + 0.1, p[2]), ez = pr(p[0], p[2] + 0.1);
    const a = ex[0] - o[0], c = ex[1] - o[1], b = ez[0] - o[0], d = ez[1] - o[1];
    const det = a * d - b * c; if (Math.abs(det) < 1e-9) return null;
    const wx = (d * dx - b * dy) / det, wz = (-c * dx + a * dy) / det;
    return Math.atan2(wx, -wz);
  }
  bindInput() {
    const cv = this.canvas, ptrs = new Map();
    let drag = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this.onDown = (e) => {
      if (this.paused || this.replay) return;
      cv.setPointerCapture?.(e.pointerId);
      const p = pos(e); ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) { drag = { type: 'pinch', d0: dist2(...ptrs.values()), dist: this.cam.dist }; this.view.setAim(this.phase === 'aim', this.cur.p, this.aimA, this.power); return; }
      const [bx, by, vis] = this.ballScreen();
      const near = Math.hypot(p[0] - bx, p[1] - by) < (e.pointerType === 'touch' ? 80 : 56);
      if (this.phase === 'aim' && vis && (near || e.button === 0 && e.shiftKey)) { drag = { type: 'aim', bx, by, a0: this.aimA, p0: this.power }; this.root.classList.add('mg-aiming'); }
      else drag = { type: 'orbit', x: p[0], y: p[1], moved: 0 };
    };
    this.onMove = (e) => {
      if (!ptrs.has(e.pointerId) || !drag) return;
      const p = pos(e); const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
      if (drag.type === 'pinch' && ptrs.size >= 2) { const d = dist2(...ptrs.values()); this.cam.dist = clamp(drag.dist * drag.d0 / Math.max(10, d), 0.9, 7); return; }
      if (drag.type === 'aim') {
        const [bx, by] = this.ballScreen();
        const dx = p[0] - bx, dy = p[1] - by, L = Math.hypot(dx, dy);
        if (L < 10) { this.power = 0.02; this.view.setAim(false); this.drawPower(); return; }
        const a = this.screenToWorldDir(-dx, -dy);
        if (a !== null) this.aimA = a;
        this.power = clamp((L - 10) / (Math.min(this.W, this.H) * 0.3), 0.02, 1);
        this.updateAim(); this.drawPower();
      } else if (drag.type === 'orbit') {
        const dx = p[0] - prev[0], dy = p[1] - prev[1]; drag.moved += Math.abs(dx) + Math.abs(dy);
        this.cam.yaw += dx * 0.007; this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.18, 1.4);
      }
    };
    this.onUp = (e) => {
      ptrs.delete(e.pointerId);
      if (!drag) return;
      if (drag.type === 'aim') {
        this.root.classList.remove('mg-aiming');
        if (this.power > 0.03 && this.phase === 'aim' && e.type !== 'pointercancel') this.shoot();
        else { this.aimA = drag.a0; this.power = drag.p0; this.updateAim(); this.drawPower(); }
      }
      if (ptrs.size === 0) drag = null;
    };
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.onWheel = (e) => { e.preventDefault(); this.cam.dist = clamp(this.cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 0.9, 7); };
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    this.onKey = (e) => {
      if (e.target?.closest?.('input, textarea')) return;
      if (e.type === 'keyup') { this.keys.delete(e.code); return; }
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.replay) this.stopReplay(); else this.togglePause(); return; }
      if (this.paused) return;
      this.keys.add(e.code);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(e.code) && !e.target?.closest?.('button')) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && this.phase === 'aim' && !e.target?.closest?.('button')) { e.preventDefault(); this.shoot(); }
      if ((e.code === 'Tab' || e.code === 'KeyV') && !e.repeat) { e.preventDefault(); this.setOverview(); }
      if (e.code === 'KeyR' && !e.repeat && this.phase === 'aim') { this.aimA = this.defaultAim(this.cur.p); this.cam.yaw = this.aimA; this.updateAim(); }
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    this.onBlur = () => this.keys.clear();
    window.addEventListener('blur', this.onBlur);
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mg]'); if (!b) return;
      const a = b.dataset.mg;
      try { sfx.click(); } catch {}
      if (a === 'pause') this.togglePause(true);
      else if (a === 'resume') this.togglePause(false);
      else if (a === 'overview') this.setOverview();
      else if (a === 'next') this.next();
      else if (a === 'replay') this.startReplay();
      else if (a === 'restart') { this.togglePause(false); this.restartHole(); }
      else if (a === 'quit') this.o.onQuit?.();
      else if (a === 'shoot') this.shoot();
    });
  }
  pollPad(dt) {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!pad) return;
    const ax = (i) => (Math.abs(pad.axes[i] || 0) > 0.15 ? pad.axes[i] : 0);
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const prev = this.padPrev || [];
    const edge = (i) => btn(i) && !prev[i];
    if (edge(9)) this.togglePause();
    if (this.paused) { this.padPrev = pad.buttons.map((b) => b.pressed); return; }
    if (this.phase === 'aim') {
      let ch = false;
      if (ax(0)) { this.aimA += ax(0) * 1.6 * dt; this.cam.yaw = this.aimA; ch = true; }
      const pw = (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0) - ax(1);
      if (Math.abs(pw) > 0.1) { this.power = clamp(this.power + pw * 0.6 * dt, 0.02, 1); ch = true; }
      if (ch) { this.updateAim(); this.drawPower(); }
      if (edge(0)) this.shoot();
    }
    if (this.phase === 'card' && edge(0)) this.next();
    if (edge(3)) this.setOverview();
    if (ax(2)) this.cam.yaw += ax(2) * 2 * dt;
    if (ax(3)) this.cam.pitch = clamp(this.cam.pitch + ax(3) * dt, 0.18, 1.4);
    this.padPrev = pad.buttons.map((b) => b.pressed);
  }
  togglePause(on = !this.paused) {
    if (this.phase === 'card' || this.phase === 'end') return;
    this.paused = on;
    if (on) {
      this.keys.clear();
      this.over.innerHTML = `<div class="mg-card mg-pause" role="dialog" aria-label="Pausa"><h2>Pausa</h2>
        <ul class="mg-help"><li><b>Mouse / dito</b> trascina indietro dalla pallina, rilascia per tirare</li><li><b>Trascina altrove</b> ruota la visuale · rotella / pizzico per lo zoom</li><li><b>← →</b> mira (Maiusc: fine) · <b>↑ ↓</b> potenza · <b>Spazio</b> tira</li><li><b>Q E</b> ruota · <b>Tab</b> panoramica · <b>R</b> mira verso la buca</li><li><b>Controller</b> levetta mira, grilletti potenza, A tira, Y panoramica</li></ul>
        <div class="mg-card-btns"><button class="btn primary" data-mg="resume">Riprendi</button><button class="btn" data-mg="restart">Ricomincia buca</button><button class="btn ghost" data-mg="quit">Esci</button></div></div>`;
      requestAnimationFrame(() => this.over.querySelector('.btn.primary')?.focus({ preventScroll: true }));
    } else this.over.innerHTML = '';
  }
  // ---------- HUD
  drawHud() {
    const P = this.cur, spec = this.spec;
    if (!P || !spec) return;
    const parTot = this.holes.slice(0, this.hi).reduce((a, h) => a + h.par, 0);
    const chips = this.players.length > 1 ? `<div class="mg-players">${this.players.map((p) => `<span class="${p === P ? 'on' : ''} ${p.done ? 'done' : ''}" style="--c:${p.color}"><i></i>${esc(p.name)}<b>${p.strokes}</b><em>${fmtPar(p.total - parTot)}</em></span>`).join('')}</div>` : '';
    this.hud.innerHTML = `<div class="mg-top">
        <div class="mg-hole"><small>${esc(this.o.label ? this.o.label(this.hi) : `Buca ${this.hi + 1}`)}</small><b>${esc(spec.name)}</b><span>Par ${spec.par} · Colpi <em>${P.strokes}</em></span></div>
        ${chips}
        <div class="mg-btns"><button class="mg-ib ${this.cam.mode === 'overview' ? 'on' : ''}" data-mg="overview" aria-label="Panoramica (Tab)" title="Panoramica (Tab)"><svg viewBox="0 0 24 24"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button class="mg-ib" data-mg="pause" aria-label="Pausa (Esc)" title="Pausa (Esc)"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/></svg></button></div>
      </div>
      <div class="mg-bottom ${this.phase === 'aim' ? '' : 'idle'}"><div class="mg-pow"><i></i><span></span></div><div class="mg-hint">${this.hint()}</div><button class="mg-shoot" data-mg="shoot" aria-label="Tira (Spazio)">Tira</button></div>`;
    this.drawPower();
  }
  hint() {
    if (this.phase !== 'aim') return this.phase === 'moving' ? '' : '';
    return matchMedia('(pointer: coarse)').matches ? 'Trascina indietro dalla pallina e rilascia' : 'Trascina indietro dalla pallina · ← → mira, ↑ ↓ potenza, Spazio tira';
  }
  drawPower() {
    const b = this.hud.querySelector('.mg-pow i'), s = this.hud.querySelector('.mg-pow span');
    if (!b) return;
    b.style.width = `${Math.round(this.power * 100)}%`; b.style.background = `hsl(${120 - this.power * 120},90%,55%)`;
    s.textContent = `Potenza ${Math.round(this.power * 100)}%`;
  }
  banner(html, t = 1.5) {
    const el = this.msgEl; el.innerHTML = `<div class="mg-banner">${html}</div>`;
    clearTimeout(this._bt); this._bt = setTimeout(() => { if (el.firstChild) el.firstChild.classList.add('out'); }, t * 1000);
  }
  flash(html, cls) { this.msgEl.innerHTML = `<div class="mg-flash ${cls}">${html}</div>`; clearTimeout(this._bt); this._bt = setTimeout(() => this.msgEl.firstChild?.classList.add('out'), 1400); }
  confetti(p, big) {
    const N = big ? 90 : 40, pos = new Float32Array(N * 3), vel = [], colr = new Float32Array(N * 3), c = new THREE.Color();
    for (let i = 0; i < N; i++) { pos.set([p[0], p[1] + 0.1, p[2]], i * 3); const a = Math.random() * 6.28, s = 0.6 + Math.random() * 1.2; vel.push([Math.cos(a) * s * 0.5, 1.5 + Math.random() * 1.5, Math.sin(a) * s * 0.5]); c.setHSL(Math.random(), 0.9, 0.6); colr.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.04, vertexColors: true })); pts.frustumCulled = false;
    this.view.scene.add(pts);
    let life = 1.6;
    this.view.anim.push((t) => {
      if (life <= 0) return; life -= 1 / 60;
      const a = g.attributes.position;
      for (let i = 0; i < N; i++) { vel[i][1] -= 9.8 / 60 * 0.5; a.setXYZ(i, a.getX(i) + vel[i][0] / 60, a.getY(i) + vel[i][1] / 60, a.getZ(i) + vel[i][2] / 60); }
      a.needsUpdate = true; if (life <= 0) pts.visible = false;
    });
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('keydown', this.onKey, true); window.removeEventListener('keyup', this.onKey, true); window.removeEventListener('blur', this.onBlur);
    clearTimeout(this._bt);
    this.view?.dispose();
    try { this.renderer.dispose(); this.renderer.forceContextLoss?.(); } catch {}
    if (window.__minigolf?.game === this) window.__minigolf = null;
  }
}
const k2 = (s, c) => s.has(c);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export { THEMES };
