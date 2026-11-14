// Race highlights: the TV-style reel shown after a race or a rally (results screen, calendar, rally
// final), and the clip player shared with the in-race replay (weekend.js). Uses the 3D race view
// through its public API (update(), camMode, focusKey, the [highlights] hooks) and falls back to the
// 2D track map when 3D is off or the graphics tier is low.
import '../styles/highlights.css';
import { App } from '../app.js';
import { icon } from '../ui/icons.js';
import { esc } from '../ui/dom.js';
import { getSettings, setSettings } from '../engine/state.js';
import { HL_TYPES, clipU, clipF, kfAt, incidentPose, loadReel } from '../engine/highlights.js';
import { circuitPath, arcFrac, speedAtTimeFrac, TrackView, genStage, STAGE_STYLE } from '../ui/trackview.js';
import { trackGeometry } from '../engine/trackphys.js';
import { gfxTier } from '../ui/quality.js';
import { sfx, engineStart, engineSet, engineStop, music, crowdCheer } from '../ui/audio.js';

let R3D = null; // lazily loaded 3D module (keeps three.js out of the results screen chunk)
async function load3D() { if (!R3D) { const [a, b] = await Promise.all([import('../ui/race3d.js'), import('../ui/race3d-incidents.js')]); R3D = { ...a, IncidentFx: b.IncidentFx }; } return R3D; }

const short3 = (n) => { const p = String(n || '').split(' '); return (p[p.length - 1] || n).replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 3).toUpperCase(); };
const INCIDENT = new Set(['crash', 'multi', 'spin', 'contact', 'off', 'damage', 'puncture', 'issue', 'red']);
const IMPACT = { crash: 0.9, roll: 0.7, contact: 0.05, spin: 0.35, off: 0.6 }; // seconds after t0 when the car hits something
const W_HALF = (r, rally) => (r?.TW ? r.TW / 2 : rally ? 3.6 : 6.5);

// ---------------- states: recorded clip -> car states for the renderers ----------------
export function clipStates(reel, clip, t, ctx) {
  const rally = reel.kind === 'rally';
  const W = ctx.W;
  const out = [];
  const order = [];
  reel.cars.forEach((car, i) => {
    let u, f = 0, moving = true;
    const uAt = rally ? (x) => kfAt(clip.kf?.[car.key], x)?.p ?? null : (x) => clipU(clip, i, x);
    if (rally) {
      const a = kfAt(clip.kf?.[car.key], t);
      if (!a || (a.w && car.key !== clip.focus) || (a.end && a.p >= 0.999 && t - a.tEnd > 5)) { out.push({ key: car.key, hidden: true }); return; }
      u = a.p; moving = a.moving;
    } else {
      u = clipU(clip, i, t); if (u == null) { out.push({ key: car.key, hidden: true }); return; }
      f = clipF(clip, i, t);
    }
    // incident pose: the most recent incident of this car that still shapes its motion
    let fx = null, pose = null, inc = null;
    for (const x of clip.inc || []) {
      if (x.key !== car.key || x.t0 > t + 3.5) continue;
      const memo = ctx.memo.get(x) || {}; ctx.memo.set(x, memo);
      const p = incidentPose(x, t, uAt, W, memo);
      if (p) { pose = p; inc = x; }
    }
    if (pose) { u = pose.u; fx = { lat: pose.lat, yaw: pose.yaw, roll: pose.roll, lift: pose.lift }; }
    if ((f & 4) && !fx) { out.push({ key: car.key, hidden: true }); return; }
    // speed from the displayed motion (incidents slow the car down to a stop)
    const dtk = 0.12;
    let u2;
    if (pose) { const memo = ctx.memo.get(inc); const p2 = incidentPose(inc, t + dtk, uAt, W, memo); u2 = p2 ? p2.u : uAt(t + dtk); } else u2 = uAt(t + dtk);
    const du = Math.max(0, ((u2 ?? u) - u) / dtk);
    let s, speed;
    if (rally) {
      const geo = ctx.geo; s = R3D.stageSampleAt(geo, u);
      speed = du > 0 ? geo.profile.v[Math.floor(s)] * geo.profile.lap * du : 0;
      if (!pose && !moving) speed = 0;
    } else {
      s = arcFrac(reel.cat, reel.cid, u, reel.lapRef) * ctx.N;
      speed = car.gt ? speedAtTimeFrac(reel.cat, reel.cid, u, reel.lapRef * 1.12, reel.lapRef) / 3.6 : du > 1e-5 ? speedAtTimeFrac(reel.cat, reel.cid, u, 1 / du, reel.lapRef) / 3.6 : 0;
      if (f & 1) speed = 0;
    }
    if (!car.gt && !(f & 4)) order.push({ key: car.key, u });
    out.push({ key: car.key, s, u, speed, inPit: !!(f & 1), pitting: !!(f & 2), fx, tyreColor: undefined, me: !!car.me });
  });
  // running order from the recorded positions (labels + mini tower)
  order.sort((a, b) => b.u - a.u);
  const pos = new Map(order.map((o, i) => [o.key, i + 1]));
  for (const st of out) {
    if (st.hidden) continue;
    const car = reel.cars.find((c) => c.key === st.key);
    if (car.gt) { st.label = ''; continue; }
    st.pos = rally ? undefined : pos.get(st.key);
    const show = car.me || st.key === ctx.focus || (st.pos && st.pos <= 3) || clip.keys?.includes(st.key);
    st.label = rally || !st.pos ? (show ? short3(car.name) : '') : show ? `P${st.pos} ${short3(car.name)}` : `${st.pos}`;
    // a close fight: let the renderer split the cars across the track
    st.close = false;
  }
  return { states: out, order };
}

// ---------------- shots: a TV director for every kind of moment ----------------
export function planShots(clip, rally = false) {
  const t0 = clip.t0, t1 = clip.t1, tc = Math.min(t1 - 0.5, Math.max(t0 + 0.5, clip.tc));
  const k0 = clip.focus || clip.keys?.[0], k1 = clip.keys?.[1] || k0;
  const S = [];
  const add = (a, b, cam, focus = k0, rate = 1, replay = false) => { a = Math.max(t0, a); b = Math.min(t1, b); if (b - a > 0.3) S.push({ a, b, cam, focus, rate, replay }); };
  const ty = clip.type;
  if (ty === 'start' || (ty === 'restart' && /fermo/.test(clip.title || ''))) {
    if (rally) { add(t0, tc + 3, 'tv'); add(tc + 3, t1, 'chase'); return S; }
    add(t0, t0 + 6.5, 'heli', k0); add(t0 + 6.5, t1 - 4, 'tv', k0); add(t1 - 4, t1, 'chase', clip.keys?.find((k, i) => i > 0) || k0);
    return S;
  }
  if (ty === 'finish' || ty === 'stage') {
    add(t0, tc - 2.2, rally ? 'chase' : 'tv', k0); add(tc - 2.2, tc + 1.6, 'tv', k0);
    add(tc - 2.4, tc + 1.2, 'chase', k0, 0.38, true);
    add(tc + 1.2, t1, rally ? 'tv' : 'heli', k0);
    return S;
  }
  if (INCIDENT.has(ty)) {
    add(t0, tc - 2.6, 'chase', k0); add(tc - 2.6, tc + 3.2, 'tv', k0);
    add(tc - 3, tc + 2.6, 'heli', k0, 0.4, true);
    if (ty === 'crash' || ty === 'multi' || ty === 'contact' || ty === 'spin') add(tc - 2.2, tc + 2.2, k1 !== k0 ? 'onboard' : 'chase', k1 !== k0 ? k1 : k0, 0.3, true);
    add(tc + 3.2, t1, 'tv', k0);
    return S;
  }
  if (ty === 'pass' || ty === 'lead' || ty === 'restart') {
    add(t0, tc - 2.6, 'chase', k0); add(tc - 2.6, tc + 2.2, 'tv', k0);
    add(tc - 2.4, tc + 1.4, 'onboard', k0, 0.45, true);
    add(tc + 1.4, t1, 'chase', k0);
    return S;
  }
  if (ty === 'pit') { add(t0, t1, rally ? 'chase' : 'garage', k0); return S; }
  if (ty === 'fastest') { add(t0, (t0 + t1) / 2, 'onboard', k0); add((t0 + t1) / 2, t1, 'chase', k0); return S; }
  if (ty === 'sc') { add(t0, t1, 'heli', k0); return S; }
  add(t0, (t0 + t1) / 2, 'tv', k0); add((t0 + t1) / 2, t1, 'chase', k0);
  return S;
}

// ---------------- clip player: one clip on a 3D view or a 2D map ----------------
export class ClipPlayer {
  constructor({ reel, clip, r3d = null, view = null, fx = null, shots = null, geo = null, onShot = null }) {
    this.reel = reel; this.clip = clip; this.r3d = r3d; this.view = view; this.fx = fx; this.geo = geo;
    this.rally = reel.kind === 'rally';
    this.shots = shots || planShots(clip, this.rally);
    if (!this.shots.length) this.shots = [{ a: clip.t0, b: clip.t1, cam: 'tv', focus: clip.focus, rate: 1 }];
    this.si = -1; this.t = this.shots[0].a; this.onShot = onShot;
    this.memo = new Map(); this.done = false; this.smokeT = 0;
    this.N = this.rally ? geo?.N : trackGeometry(reel.cid)?.N;
    this.next();
  }
  get shot() { return this.shots[this.si]; }
  next() {
    this.si++;
    if (this.si >= this.shots.length) { this.done = true; return; }
    const s = this.shot; const jump = Math.abs(s.a - this.t) > 0.6;
    this.t = s.a; this.lastT = s.a;
    const r = this.r3d;
    if (r) {
      if (jump || this.si === 0) { r.resetMotion?.(); this.fx?.clear(); this.flagged = false; }
      r.director = false; r.camMode = s.cam; r.focusKey = s.focus; r.dirFocus = null; r._cut = true; r.introT = 0;
    }
    this.onShot?.(s, this.si);
  }
  jumpShot(i) { this.si = Math.max(-1, Math.min(this.shots.length - 1, i) - 1); this.t = -1e9; this.next(); }
  // advance by dt real seconds (speed: user multiplier). Returns false when the clip is over
  tick(dt, speed = 1) {
    if (this.done) return false;
    const s = this.shot;
    const step = dt * s.rate * speed;
    this.t = Math.min(s.b, this.t + step);
    this.render(step);
    if (this.t >= s.b - 1e-6) this.next();
    return !this.done;
  }
  render(dtSim) {
    const ctx = { W: W_HALF(this.r3d, this.rally), memo: this.memo, N: this.N, geo: this.geo, focus: this.shot?.focus };
    const { states, order } = clipStates(this.reel, this.clip, this.t, ctx);
    this.order = order; this.states = states;
    if (this.r3d) {
      this.r3d.focusKey = this.shot?.focus;
      this.r3d.update(states, Math.max(0.0001, dtSim));
      this.effects(states, dtSim);
    } else if (this.view) this.draw2D(states);
    this.lastT = this.t;
  }
  // debris on impact, tyre smoke / dust while sliding, a marshal with the yellow flag after a crash
  effects(states, dt) {
    const fx = this.fx, r = this.r3d; if (!fx || !r) return;
    const dust = this.rally ? ({ gravel: '#b59a72', rough: '#a58a62', snow: '#f4f7ff', tarmac: '#cfcfcf' }[this.clip.stage?.surface] || '#bba27a') : null;
    for (const inc of this.clip.inc || []) {
      const ti = inc.t0 + (IMPACT[inc.kind] ?? 99);
      const car = this.reel.cars.find((c) => c.key === inc.key);
      const p = r.carWorld?.(inc.key);
      if (!p) continue;
      if (this.lastT < ti && this.t >= ti && (inc.kind in IMPACT)) {
        const big = inc.kind === 'crash' || inc.kind === 'roll';
        fx.burst(p, { color: car?.c1 || '#e10600', n: big ? 26 : inc.kind === 'contact' ? 10 : 4, speed: big ? 16 : 8, dust });
        if (big || inc.kind === 'contact') { try { sfx.crash(); } catch {} }
        if (big && !this.flagged && !this.rally) { this.flagged = true; const st = states.find((x) => x.key === inc.key); if (st && r.pose) { const q = r.pose(((st.s + 18) % this.N + this.N) % this.N, (inc.side || 1) * (ctx0(r) + 5)); fx.yellowFlag({ x: q.x, y: q.y, z: q.z }, q.h); } }
      }
      // sliding: smoke (or dust) puffs around the car
      if (this.t > inc.t0 - 0.3 && this.t < inc.t0 + 2.2 && inc.kind !== 'park' && inc.kind !== 'limp') {
        this.smokeT -= dt; if (this.smokeT <= 0) { this.smokeT = 0.06; fx.smoke(p, { n: 1, col: dust || '#e8e8e8', size: dust ? 3 : 2.2, op: dust ? 0.6 : 0.45 }); }
      }
    }
    fx.update(dt);
  }
  draw2D(states) {
    const v = this.view; if (!v) return;
    const reel = this.reel, rally = this.rally;
    if (!v._ppm) { const sc = v.screen || []; let L = 0; for (let i = 1; i < sc.length; i++) L += Math.hypot(sc[i][0] - sc[i - 1][0], sc[i][1] - sc[i - 1][1]); const len = rally ? this.geo.len : trackGeometry(reel.cid)?.len || 5000; v._ppm = L / len; }
    v.frame(() => {
      const c = v.ctx;
      const list = states.filter((s) => !s.hidden).sort((a, b) => (a.key === this.shot?.focus ? 1 : 0) - (b.key === this.shot?.focus ? 1 : 0));
      let pitIdx = 0;
      for (const st of list) {
        const car = reel.cars.find((x) => x.key === st.key); if (!car) continue;
        let q;
        if (st.inPit && v.pitPos) q = v.pitPos(pitIdx++);
        else q = v.pointAt(rally ? st.s / this.geo.N : st.s / this.N);
        let { x, y, ang } = q;
        if (st.fx) { const off = st.fx.lat * v._ppm * 1.6; x += -Math.sin(ang) * off; y += Math.cos(ang) * off; ang -= st.fx.yaw || 0; }
        const focus = st.key === this.shot?.focus;
        if (focus || this.clip.keys?.includes(st.key)) { c.beginPath(); c.arc(x, y, 13 + Math.sin(performance.now() / 160) * 2, 0, 7); c.strokeStyle = focus ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.stroke(); }
        if (st.fx && Math.abs(st.fx.lat) > 3) { c.beginPath(); c.arc(x, y, 22, 0, 7); c.strokeStyle = 'rgba(255,210,58,.7)'; c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]); }
        v.drawCar(x, y, ang, car.c1 || '#e10600', car.c2 || '#fff', { style: rally ? 'rally' : reel.endurance ? 'endurance' : 'formula', len: rally ? 16 : car.gt ? 9 : undefined, glow: focus ? car.c1 : null, outline: !!car.me, label: st.label && (focus || car.me || (st.pos && st.pos <= 3) || rally) ? st.label : null, num: rally ? null : st.pos, dot: !rally && !(focus || car.me || (st.pos && st.pos <= 3)), labelBg: focus || car.me ? car.c1 : 'rgba(0,0,0,0.75)' });
      }
    }, { rain: this.clip.rain || (this.clip.stage?.wet ? 0.6 : 0) });
  }
}
function ctx0(r) { return r?.TW ? r.TW / 2 : 6; }

// ---------------- the highlights reel (full-screen TV overlay) ----------------
let HV = null;
export function openHighlights(reel, opts = {}) {
  if (!reel?.clips?.length) { App.toast('Highlights non disponibili', 'Non ci sono momenti salvati per questa gara.', ''); return; }
  closeHighlights(true);
  HV = new HighlightsViewer(reel, opts);
  return HV;
}
export function openSavedHighlights(st, round, opts = {}) {
  const reel = loadReel(st, round);
  if (!reel) { App.toast('Highlights non disponibili', 'Gli highlights vengono salvati per le ultime gare della carriera.', ''); return null; }
  return openHighlights(reel, opts);
}
export function closeHighlights(silent) { if (HV) { HV.destroy(silent); HV = null; } }
export function highlightsOpen() { return !!HV; }
if (typeof window !== 'undefined') window.__hl = { open: openHighlights, close: closeHighlights, get cur() { return HV; } };

function want3D() { try { return getSettings().view3d !== false && gfxTier() !== 'low' && getSettings().hl3d !== false; } catch { return false; } }
function canWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

class HighlightsViewer {
  constructor(reel, opts) {
    this.reel = reel; this.opts = opts; this.idx = Math.max(0, Math.min(reel.clips.length - 1, opts.start || 0));
    this.speed = 1; this.paused = false; this.mode3d = (opts.force3d ?? want3D()) && canWebGL();
    this.prevMood = music.mood;
    this.el = document.createElement('div'); this.el.className = 'hl-wrap'; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', 'Highlights');
    this.el.innerHTML = this.frameHTML();
    document.body.appendChild(this.el);
    this.stage = this.el.querySelector('.hl-stage');
    this.bind();
    try { sfx.sting(); } catch {}
    try { music.setMood('race'); } catch {}
    try { engineStart(reel.cat === 'rally' ? 'rally' : reel.cat); } catch {}
    this.last = performance.now();
    this.loopFn = (t) => this.loop(t);
    this.startClip(this.idx, true);
    this.raf = requestAnimationFrame(this.loopFn);
  }
  frameHTML() {
    const r = this.reel;
    const segs = r.clips.map((c, i) => { const T = HL_TYPES[c.type] || HL_TYPES.pass; return `<button class="hl-seg" data-hl="seg" data-i="${i}" style="--sc:${T.col};flex:${Math.max(4, c.t1 - c.t0)}" aria-label="${esc(T.tag)}: ${esc(c.title)}"><i></i><span>${icon(T.ic)}</span></button>`; }).join('');
    return `<div class="hl-stage"></div>
      <div class="hl-letter top"></div><div class="hl-letter bot"></div>
      <div class="hl-vign"></div>
      <div class="hl-bug"><span class="hl-logo">APEX<b>TV</b></span><span class="hl-bug-t">Highlights</span><span class="hl-bug-ev">${esc(r.title || '')}</span></div>
      <div class="hl-top-r"><span class="hl-count" id="hl-count"></span>
        <button class="hl-btn" data-hl="view" data-tip="Vista 3D / mappa 2D" aria-label="Cambia vista">${this.mode3d ? '2D' : '3D'}</button>
        <button class="hl-btn" data-hl="close" aria-label="Chiudi gli highlights (Esc)">${icon('x')}</button></div>
      <div class="hl-tower" id="hl-tower"></div>
      <div class="hl-replay" id="hl-replay"><i></i>Replay<span id="hl-rate"></span></div>
      <div class="hl-lower" id="hl-lower"></div>
      <div class="hl-wipe" id="hl-wipe"><div class="hl-wipe-a"></div><div class="hl-wipe-b"></div><div class="hl-wipe-logo">APEX<b>TV</b></div></div>
      <div class="hl-end" id="hl-end"></div>
      <div class="hl-ctrl" id="hl-ctrl">
        <div class="hl-segs">${segs}</div>
        <div class="hl-btns">
          <button class="hl-btn" data-hl="prev" aria-label="Momento precedente">${icon('left')}</button>
          <button class="hl-btn big" data-hl="play" id="hl-play" aria-label="Pausa / riprendi">${icon('pause')}</button>
          <button class="hl-btn" data-hl="next" aria-label="Momento successivo">${icon('right')}</button>
          <button class="hl-btn" data-hl="speed" id="hl-speed" aria-label="Velocità">1x</button>
          <div class="hl-now" id="hl-now"></div>
        </div>
      </div>`;
  }
  bind() {
    this.onClick = (e) => {
      const b = e.target.closest('[data-hl]');
      if (!b) { if (e.target.closest('.hl-stage, .hl-vign') && e.pointerType !== 'mouse') this.el.classList.toggle('ctrl-off'); return; }
      e.preventDefault(); e.stopPropagation();
      const a = b.dataset.hl;
      if (a === 'close') this.close();
      else if (a === 'prev') this.go(this.idx - 1);
      else if (a === 'next') this.go(this.idx + 1);
      else if (a === 'seg') this.go(+b.dataset.i);
      else if (a === 'play') this.toggle();
      else if (a === 'speed') { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 0.5 : 1; this.el.querySelector('#hl-speed').textContent = this.speed === 0.5 ? '½x' : this.speed + 'x'; }
      else if (a === 'view') this.switchView();
      else if (a === 'again') this.go(0);
    };
    this.el.addEventListener('click', this.onClick);
    this.onKey = (e) => {
      if (!this.el.isConnected) return;
      const k = e.code;
      if (k === 'Escape') this.close();
      else if (k === 'Space' || k === 'KeyK') this.toggle();
      else if (k === 'ArrowRight' || k === 'KeyL') this.go(this.idx + 1);
      else if (k === 'ArrowLeft' || k === 'KeyJ') this.go(this.idx - 1);
      else { if (k !== 'Tab' && k !== 'F11') e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
    };
    window.addEventListener('keydown', this.onKey, true);
    // touch: swipe left / right between moments
    let sx = null, sy = null;
    this.el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    this.el.addEventListener('touchend', (e) => { if (sx == null) return; const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy; sx = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && !e.target.closest('.hl-ctrl')) this.go(this.idx + (dx < 0 ? 1 : -1)); }, { passive: true });
  }
  toggle() { if (this.ended) { this.go(0); return; } this.paused = !this.paused; this.el.querySelector('#hl-play').innerHTML = icon(this.paused ? 'play' : 'pause'); this.el.classList.toggle('paused', this.paused); }
  close() { closeHighlights(); }
  go(i) {
    if (i >= this.reel.clips.length) { this.showEnd(); return; }
    i = Math.max(0, i);
    this.ended = false; this.el.querySelector('#hl-end').classList.remove('on');
    this.startClip(i);
  }
  switchView() {
    this.mode3d = !this.mode3d && canWebGL();
    try { setSettings({ hl3d: this.mode3d }); } catch {}
    this.el.querySelector('[data-hl="view"]').textContent = this.mode3d ? '2D' : '3D';
    this.teardownView(); this.startClip(this.idx, true);
  }
  teardownView() {
    this.fx?.destroy(); this.fx = null;
    this.r3d?.destroy(); this.r3d = null; this.viewKey = null;
    this.view?.destroy(); this.view = null;
    this.stage.innerHTML = '';
  }
  // the renderer for this clip: one 3D scene per circuit (per stage for rallies), else the 2D map
  async ensureView(clip) {
    const reel = this.reel, rally = reel.kind === 'rally';
    const key = (this.mode3d ? '3d:' : '2d:') + (rally ? `${clip.stage.seed}:${clip.stage.km}` : reel.cid);
    if (this.viewKey === key && (this.r3d || this.view)) return;
    this.teardownView(); this.viewKey = key;
    let geo = null;
    if (rally) { const M = await load3D(); geo = M.stageGeometry(clip.stage.seed, clip.stage.km, STAGE_STYLE[clip.stage.trackId] || 'rough'); }
    this.geo = geo;
    if (this.mode3d) {
      try {
        const M = await load3D();
        if (this.viewKey !== key || !this.el.isConnected) return;
        const div = document.createElement('div'); div.className = 'hl-r3d'; this.stage.appendChild(div);
        const cars = reel.cars.map((c) => c.gt ? { key: c.key, livery: { primary: c.c1, secondary: c.c2, accent: '#111111' }, tyreColor: '#ffd400', number: c.num, sponsor: 'LMGT3', category: 'rally' } : { key: c.key, livery: { primary: c.c1, secondary: c.c2, accent: c.c3 || '#111111' }, helmet: c.helmet, tyreColor: '#d9d9d9', isPlayer: !!c.me, number: c.num, sponsor: c.sponsor });
        this.r3d = rally ? new M.Race3D(div, { geo, category: 'rally', surface: clip.stage.surface, wet: clip.stage.wet, cars }) : new M.Race3D(div, { cid: reel.cid, street: reel.street || 0, night: !!reel.night, category: reel.cat, cars });
        this.r3d.director = false;
        this.fx = new M.IncidentFx(this.r3d);
        return;
      } catch (e) { console.warn('3D highlights non disponibili', e); this.teardownView(); this.mode3d = false; this.viewKey = '2d:' + key.slice(3); }
    }
    const cv = document.createElement('canvas'); cv.className = 'hl-cv'; this.stage.appendChild(cv);
    const path = rally ? genStage(clip.stage.seed, STAGE_STYLE[clip.stage.trackId] || 'rough') : circuitPath(reel.cid);
    this.view = new TrackView(cv, path, rally ? { pad: 70, rally: true, surface: clip.stage.surface } : { pad: 60, padTop: 80, padBottom: 150, glow: 'rgba(255,255,255,0.12)' });
    if (!this.geo && rally) { const M = await load3D(); this.geo = M.stageGeometry(clip.stage.seed, clip.stage.km, STAGE_STYLE[clip.stage.trackId] || 'rough'); }
  }
  async startClip(i, first = false) {
    const tok = this.tok = (this.tok || 0) + 1;
    this.idx = i; this.player = null;
    const clip = this.reel.clips[i];
    this.wipe(first);
    this.el.querySelector('#hl-lower').classList.remove('on');
    await this.ensureView(clip);
    if (tok !== this.tok || !this.el.isConnected) return;
    if (this.r3d?.setRain) { this.r3d.setRain(this.reel.kind === 'rally' ? (clip.stage.wet ? 0.6 : 0) : clip.rain || 0); }
    this.player = new ClipPlayer({ reel: this.reel, clip, r3d: this.r3d, view: this.view, fx: this.fx, geo: this.geo, onShot: (s, si) => this.onShot(s, si) });
    this.clipT = 0; this.capShown = false;
    this.el.querySelectorAll('.hl-seg').forEach((b, j) => { b.classList.toggle('cur', j === i); b.classList.toggle('done', j < i); });
    this.el.querySelector('#hl-count').textContent = `${i + 1} / ${this.reel.clips.length}`;
    const T = HL_TYPES[clip.type] || HL_TYPES.pass;
    this.el.querySelector('#hl-now').innerHTML = `<i style="background:${T.col}"></i>${esc(T.tag)} · ${esc(clip.title || '')}`;
    this.el.style.setProperty('--hc', T.col);
    this.soundFor(clip, 'start');
  }
  wipe(first) {
    const w = this.el.querySelector('#hl-wipe');
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    if (!first) try { sfx.whoosh(); } catch {}
  }
  onShot(s) {
    const rp = this.el.querySelector('#hl-replay');
    rp.classList.toggle('on', !!s.replay);
    this.el.classList.toggle('slowmo', !!s.replay && s.rate < 0.9);
    const rate = this.el.querySelector('#hl-rate'); if (rate) rate.textContent = s.rate < 0.9 ? ` · ${Math.round(s.rate * 100)}%` : '';
    if (s.replay) try { sfx.whoosh(); } catch {}
  }
  caption(clip) {
    const T = HL_TYPES[clip.type] || HL_TYPES.pass;
    const rally = this.reel.kind === 'rally';
    const where = rally ? `PS${clip.stage.idx + 1} · ${esc(clip.stage.name || '')}` : clip.lap ? `Giro ${clip.lap}${this.reel.laps ? '/' + this.reel.laps : ''}` : '';
    const cars = (clip.keys || []).slice(0, 3).map((k) => this.reel.cars.find((c) => c.key === k)).filter((c) => c && !c.gt);
    return `<div class="hl-l3" style="--gc:${T.col}"><div class="hl-l3-tag">${icon(T.ic)}<span>${esc(T.tag)}</span></div>
      <div class="hl-l3-body"><div class="hl-l3-title">${esc(clip.title || T.tag)}</div><div class="hl-l3-sub">${esc(clip.text || '')}</div></div>
      <div class="hl-l3-side">${where ? `<span class="hl-l3-lap">${where}</span>` : ''}<span class="hl-l3-cars">${cars.map((c) => `<span style="--tc:${c.c1}"><i></i>${esc(short3(c.name))}</span>`).join('')}</span></div></div>`;
  }
  tower() {
    const el = this.el.querySelector('#hl-tower'); if (!el) return;
    if (this.reel.kind === 'rally' || !this.player?.order) { el.innerHTML = ''; return; }
    const now = performance.now(); if (now - (this._twT || 0) < 300) return; this._twT = now;
    const keys = this.player.clip.keys || [];
    el.innerHTML = this.player.order.slice(0, 10).map((o, i) => { const c = this.reel.cars.find((x) => x.key === o.key); return `<div class="hl-tw ${c?.me ? 'me' : ''} ${keys.includes(o.key) ? 'hot' : ''}"><b>${i + 1}</b><i style="background:${c?.c1}"></i><span>${esc(short3(c?.name))}</span></div>`; }).join('');
  }
  soundFor(clip, phase) {
    try {
      if (phase === 'start' && clip.type === 'start') sfx.go();
      if (phase === 'peak') {
        if (clip.type === 'pass' || clip.type === 'lead') sfx.overtake();
        if (clip.type === 'finish' || clip.type === 'stage') { crowdCheer(clip.type === 'finish' ? 1 : 0.5); if (clip.type === 'finish') sfx.win(); }
      }
    } catch {}
  }
  showEnd() {
    this.ended = true; this.player = null;
    const r = this.reel; const win = r.clips.find((c) => c.type === 'finish');
    const e = this.el.querySelector('#hl-end');
    e.innerHTML = `<div class="hl-end-card"><div class="hl-logo big">APEX<b>TV</b></div><div class="hl-end-t">Fine highlights</div><div class="hl-end-s">${esc(r.title || '')}${r.sub ? ' · ' + esc(r.sub) : ''}</div>${win ? `<div class="hl-end-w">${icon('trophy')} ${esc(win.title)}</div>` : ''}
      <div class="hl-end-b"><button class="hl-btn wide" data-hl="again">${icon('replay')} Rivedi</button><button class="hl-btn wide primary" data-hl="close">Chiudi ${icon('right')}</button></div></div>`;
    e.classList.add('on');
    this.el.querySelector('#hl-lower').classList.remove('on');
    this.el.querySelector('#hl-replay').classList.remove('on');
    this.el.classList.remove('slowmo');
    this.el.querySelectorAll('.hl-seg').forEach((b) => { b.classList.remove('cur'); b.classList.add('done'); });
    try { engineSet(0); } catch {}
  }
  loop(t) {
    if (!this.el.isConnected) return;
    const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    const p = this.player;
    if (p && !this.paused) {
      const was = p.t;
      const alive = p.tick(dt, this.speed);
      this.clipT += dt;
      const c = p.clip;
      if (!this.capShown && this.clipT > 0.7) { this.capShown = true; const lw = this.el.querySelector('#hl-lower'); lw.innerHTML = this.caption(c); lw.classList.add('on'); }
      if (was < c.tc && p.t >= c.tc && !p.shot?.replay) this.soundFor(c, 'peak');
      if (p.shot && p.shot.b - p.t < 0.6 && p.si === p.shots.length - 1) this.el.querySelector('#hl-lower').classList.remove('on');
      const fs = p.states?.find((s) => s.key === p.shot?.focus);
      try { engineSet(Math.min(1, (fs?.speed || 0) * 3.6 / 330) * (p.shot?.rate < 0.9 ? 0.55 : 1), { rain: c.rain || 0, crowd: 0.5 }); } catch {}
      this.tower();
      if (!alive) this.go(this.idx + 1);
    } else if (p && this.r3d) p.render(0); // paused: keep the frame (and the resize) alive
    else if (p && this.view) p.render(0);
    // the chapter bar fills with the playback position
    if (p) { const seg = this.el.querySelectorAll('.hl-seg')[this.idx]; const k = (p.t - p.clip.t0) / Math.max(0.1, p.clip.t1 - p.clip.t0); seg?.style.setProperty('--k', Math.max(0, Math.min(1, p.si >= 0 && p.shot?.replay ? 1 : k)).toFixed(3)); }
    this.raf = requestAnimationFrame(this.loopFn);
  }
  destroy(silent) {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.teardownView();
    this.el.remove();
    try { engineStop(); } catch {}
    try { if (this.prevMood && this.prevMood !== 'race') music.setMood(this.prevMood); } catch {}
    if (!silent) try { sfx.close(); } catch {}
    this.opts.onClose?.();
  }
}
