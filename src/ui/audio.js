// =============================================================================
// Apex Dynasty — audio engine (Web Audio, 100% procedural: no samples)
//
//   master ─ limiter ─ destination
//     ├─ music  (generative soundtrack: themes with sections, drums, bass, pads,
//     │          arps and hand-written lead melodies; crossfades between moods)
//     ├─ sfx    (premium UI sounds + race events)
//     ├─ eng    (engine synthesis per category, pass-bys, tyre squeal, wind)
//     └─ amb    (crowd, rain, paddock / pit-lane ambience)
//   + a shared convolution reverb and a tempo-synced ping-pong delay.
//
// Public API (kept stable for the rest of the game):
//   sfx.<name>(), music.setMood(m) / music.stop(), engineStart(cat),
//   engineSet(speed01, opts), engineStop(), passBy(intensity, cat),
//   applyVolumes()
// Additions: setAudioScene(screenId), crowdCheer(amount), audioUnlocked(),
//   AUDIO_BUSES (mixer metadata), audioDebug() (levels for tests).
//   engineSet opts: { rain, crowd, rpm (0..1, overrides the gearbox),
//                     throttle (0..1), slip (0..1 tyre squeal) }
// Settings used: sound (effects/engines/ambience), music, engineSound,
//   volume (master), musicVol, sfxVol, engineVol, ambVol.
// =============================================================================
import { getSettings } from '../engine/state.js';

let ctx = null;
const B = {};              // buses and shared fx
let noiseBuf = null, pinkBuf = null, brownBuf = null;
let scene = null;          // current screen id (set by the app router)
const WAVES = {};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Context + routing
// ---------------------------------------------------------------------------
function makeNoise(c, kind) {
  const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return b;
}
// Synthetic hall impulse response: filtered noise with an exponential tail
function makeIR(c, secs = 2.6, decay = 3.2) {
  const len = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.18 + 0.7 * (1 - t));          // the tail gets darker
      const early = i < c.sampleRate * 0.06 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2 : 0;
      d[i] = (lp + early) * Math.pow(1 - t, decay);
    }
  }
  return b;
}
function ac() {
  if (!unlocked) return null;   // never create the context before a user gesture
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      // safety limiter: keeps sums of many voices from clipping
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -9; lim.knee.value = 8; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.22;
      lim.connect(ctx.destination);
      // make-up gain: voices are mixed with headroom, this brings the sum to a healthy level
      const makeup = ctx.createGain(); makeup.gain.value = 4; makeup.connect(lim);
      B.master = ctx.createGain(); B.master.connect(makeup);
      B.analyser = ctx.createAnalyser(); B.analyser.fftSize = 2048; lim.connect(B.analyser);
      // reverb (pre-delay → convolver → return)
      B.rev = ctx.createDelay(0.2); B.rev.delayTime.value = 0.022;
      const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx);
      const ret = ctx.createGain(); ret.gain.value = 0.85;
      B.rev.connect(conv); conv.connect(ret); ret.connect(B.master);
      for (const k of ['music', 'sfx', 'eng', 'amb']) { B[k] = ctx.createGain(); B[k].gain.value = 0; B[k].connect(B.master); }
      // post-fader reverb sends (their gain follows the bus volume)
      B.musicRev = ctx.createGain(); B.musicRev.connect(B.rev);
      B.sfxRev = ctx.createGain(); B.sfxRev.connect(B.rev);
      B.musicRev.gain.value = 0; B.sfxRev.gain.value = 0;
      // ping-pong delay for the music (dotted eighths, set per theme)
      B.delay = ctx.createGain();
      const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = ctx.createGain(), tone = ctx.createBiquadFilter();
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -0.7; pr.pan.value = 0.7;
      tone.type = 'lowpass'; tone.frequency.value = 3200; fb.gain.value = 0.38;
      B.delay.connect(dl); dl.connect(tone); tone.connect(pl); pl.connect(B.music); tone.connect(dr); dr.connect(pr); pr.connect(B.music); dr.connect(fb); fb.connect(dl);
      B.delayL = dl; B.delayR = dr;
      noiseBuf = makeNoise(ctx, 'white'); pinkBuf = makeNoise(ctx, 'pink'); brownBuf = makeNoise(ctx, 'brown');
      applyVolumes();
    } catch (e) { console.warn('audio init failed', e); ctx = null; return null; }
  }
  if (ctx.state === 'suspended' && !document.hidden && unlocked) ctx.resume().catch(() => {});
  return ctx;
}
function setG(node, v, tc = 0.06) { if (node) node.gain.setTargetAtTime(v, ctx.currentTime, tc); }
export function applyVolumes() {
  if (!ctx) return;
  const s = getSettings();
  const fx = s.sound !== false;
  setG(B.master, clamp(s.volume ?? 0.5, 0, 1));
  const mv = s.music === false ? 0 : clamp(s.musicVol ?? 0.55, 0, 1) * 0.9;
  setG(B.music, mv); setG(B.musicRev, mv);
  const sv = fx ? clamp(s.sfxVol ?? 0.8, 0, 1) : 0;
  setG(B.sfx, sv); setG(B.sfxRev, sv);
  setG(B.eng, fx && s.engineSound !== false ? clamp(s.engineVol ?? 0.85, 0, 1) : 0);
  setG(B.amb, fx ? clamp(s.ambVol ?? 0.7, 0, 1) : 0);
  if (engine && (s.engineSound === false || !fx)) engineStop();
}
// Mixer metadata for settings UIs
export const AUDIO_BUSES = [
  { key: 'volume', label: 'Volume generale', def: 0.5 },
  { key: 'musicVol', label: 'Musica', def: 0.55 },
  { key: 'sfxVol', label: 'Effetti e interfaccia', def: 0.8 },
  { key: 'engineVol', label: 'Motori', def: 0.85 },
  { key: 'ambVol', label: 'Ambiente e pubblico', def: 0.7 },
];

// Browsers only allow audio after a user gesture: unlock on the first one
let unlocked = false;
export function audioUnlocked() { return unlocked; }
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    const c = ac(); if (c && c.state === 'suspended') c.resume().catch(() => {});
    music.kick(); ambience.update();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock, true);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, true);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (unlocked) ctx.resume().then(() => music.resync()).catch(() => {});
  });
}
export function setAudioScene(id) {
  scene = id;
  if (ctx) ambience.update();
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function src(buf, loop = true) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
function panNode(p, dest) { if (!p) return dest; const n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); n.connect(dest); return n; }
function sendTo(node, dest, amt) { if (!amt || !dest) return; const g = ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(dest); }

// One-shot oscillator with envelope (UI + race sfx)
function osc(type, f, t, dur, peak, o = {}) {
  const c = ac(); if (!c) return null;
  const a = o.a ?? 0.004, dest = o.dest || B.sfx;
  const n = c.createOscillator(); n.type = type; n.frequency.setValueAtTime(f, t);
  if (o.slide) n.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + (o.slideT ?? dur));
  if (o.detune) n.detune.value = o.detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  let head = n;
  if (o.cut) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.cut; f2.Q.value = o.q ?? 0.7; n.connect(f2); head = f2; }
  head.connect(g);
  g.connect(panNode(o.pan, dest));
  if (o.rev) sendTo(g, dest === B.music ? B.musicRev : B.sfxRev, o.rev);
  n.start(t); n.stop(t + a + dur + 0.05);
  return n;
}
// Filtered noise burst
function nz(dur, peak, o = {}) {
  const c = ac(); if (!c) return;
  const t = o.t ?? c.currentTime, a = o.a ?? 0.003, dest = o.dest || B.sfx;
  const s = src(o.buf || noiseBuf);
  const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f ?? 1000, t); f.Q.value = o.q ?? 1;
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.sweep), t + (o.sweepT ?? dur));
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  s.connect(f); f.connect(g);
  let out = dest;
  if (o.pan != null || o.panTo != null) { const p = c.createStereoPanner(); p.pan.setValueAtTime(o.pan || 0, t); if (o.panTo != null) p.pan.linearRampToValueAtTime(o.panTo, t + dur); p.connect(dest); out = p; }
  g.connect(out);
  if (o.rev) sendTo(g, dest === B.music ? B.musicRev : B.sfxRev, o.rev);
  s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
}
// FM bell / glassy chime
function bell(f, t, dur, peak, o = {}) {
  const c = ac(); if (!c) return;
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.value = f; mod.frequency.value = f * (o.ratio ?? 3.5);
  mg.gain.setValueAtTime(f * (o.index ?? 2.2), t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const dest = o.dest || B.sfx;
  g.connect(panNode(o.pan, dest));
  if (o.rev) sendTo(g, dest === B.music ? B.musicRev : B.sfxRev, o.rev);
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------
// SFX — UI and race events
// ---------------------------------------------------------------------------
let lastHover = 0, lastClick = 0;
const now = () => ac()?.currentTime ?? 0;
export const sfx = {
  // UI: a soft mechanical tick with a little tonal body
  click: () => {
    const c = ac(); if (!c) return; const t = c.currentTime;
    if (t - lastClick < 0.03) return; lastClick = t;
    nz(0.012, 0.045, { type: 'highpass', f: 4200, q: 0.8 });
    osc('sine', 1250, t, 0.035, 0.03, { slide: 0.6 });
    osc('sine', 190, t, 0.07, 0.05, { slide: 0.5 });
  },
  hover: () => {
    const c = ac(); if (!c) return; const t = c.currentTime;
    if (t - lastHover < 0.045) return; lastHover = t;
    nz(0.014, 0.014, { type: 'bandpass', f: 6800, q: 5 });
    osc('sine', 2600, t, 0.025, 0.006, { slide: 1.08 });
  },
  whoosh: () => { const t = now(); nz(0.32, 0.04, { f: 380, q: 1.2, sweep: 3200, pan: -0.6, panTo: 0.6, a: 0.12 }); osc('sine', 110, t + 0.05, 0.16, 0.02, { slide: 0.6 }); },
  back: () => { const t = now(); osc('triangle', 880, t, 0.06, 0.035, { cut: 3000 }); osc('triangle', 587, t + 0.045, 0.08, 0.035, { cut: 3000 }); },
  open: () => { const t = now(); nz(0.16, 0.02, { f: 900, q: 1, sweep: 4200, a: 0.06 }); bell(1318.5, t + 0.03, 0.35, 0.018, { ratio: 2, index: 0.8, rev: 0.25 }); },
  close: () => { nz(0.14, 0.018, { f: 3600, q: 1, sweep: 700, a: 0.02 }); },
  select: () => { const t = now(); osc('triangle', 784, t, 0.05, 0.04, { cut: 4000 }); osc('triangle', 1175, t + 0.04, 0.09, 0.035, { cut: 4000, rev: 0.15 }); },
  tick: () => { const t = now(); osc('square', 1500, t, 0.018, 0.02, { cut: 3000 }); },
  ok: () => {
    const t = now();
    bell(1046.5, t, 0.5, 0.05, { ratio: 2, index: 1.2, rev: 0.3, pan: -0.1 });
    bell(1568, t + 0.075, 0.7, 0.045, { ratio: 2, index: 1.1, rev: 0.35, pan: 0.1 });
    osc('sine', 523, t, 0.25, 0.03);
  },
  bad: () => { const t = now(); osc('square', 233, t, 0.09, 0.04, { cut: 900 }); osc('square', 196, t + 0.11, 0.16, 0.045, { cut: 800 }); },
  notify: () => {
    const t = now();
    [880, 1108.7, 1318.5].forEach((f, i) => { bell(f, t + i * 0.07, 0.45, 0.04, { ratio: 4, index: 0.9, rev: 0.3, pan: (i - 1) * 0.3 }); osc('sine', f / 2, t + i * 0.07, 0.2, 0.015); });
  },
  // start lights: clean "dash" beeps
  beep: () => { const t = now(); osc('square', 880, t, 0.24, 0.035, { cut: 2600 }); osc('sine', 880, t, 0.28, 0.06); },
  go: () => { const t = now(); osc('square', 1320, t, 0.5, 0.04, { cut: 3200 }); osc('sine', 1320, t, 0.6, 0.07); crowdCheer(0.8); },
  win: () => {
    const t = now();
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => { brass(f, t + i * 0.1, 0.5, 0.05, i * 0.1 - 0.2); bell(f * 2, t + i * 0.1, 0.8, 0.02, { ratio: 3.5, rev: 0.4 }); });
    brass(523.25, t + 0.55, 1.4, 0.05, -0.3); brass(659.25, t + 0.55, 1.4, 0.045, 0); brass(783.99, t + 0.55, 1.4, 0.045, 0.3);
    nz(1.6, 0.03, { t: t + 0.55, type: 'highpass', f: 6000, q: 0.5, a: 0.005, rev: 0.4 });
    crowdCheer(1);
  },
  overtake: () => { const t = now(); nz(0.45, 0.05, { f: 500, q: 2, sweep: 2600, pan: -0.5, panTo: 0.5, a: 0.08 }); osc('triangle', 660, t + 0.12, 0.12, 0.025, { cut: 3000 }); osc('triangle', 990, t + 0.2, 0.18, 0.025, { cut: 3000, rev: 0.2 }); crowdCheer(0.35); },
  // team radio: squelch + mic click, band-limited like a real radio
  radio: () => {
    const t = now();
    nz(0.07, 0.05, { f: 2300, q: 3.5 });
    osc('square', 1650, t + 0.015, 0.03, 0.014, { cut: 2600 });
    nz(0.2, 0.012, { t: t + 0.05, f: 1800, q: 1.8 });
    osc('sine', 120, t, 0.03, 0.03);
  },
  // pit stop: four wheel guns off, wheels swapped, guns on, jack drop
  pit: () => {
    const c = ac(); if (!c) return; const t = c.currentTime;
    const gun = (t0, p) => {
      const s = src(noiseBuf), f = c.createBiquadFilter(), g = c.createGain(), am = c.createOscillator(), amg = c.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(3200, t0); f.frequency.exponentialRampToValueAtTime(2400, t0 + 0.28); f.Q.value = 2.5;
      am.type = 'square'; am.frequency.value = rnd(55, 75); amg.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.028, t0 + 0.01); g.gain.setValueAtTime(0.028, t0 + 0.2); g.gain.linearRampToValueAtTime(0.0001, t0 + 0.3);
      s.connect(f); f.connect(g); g.connect(panNode(p, B.sfx)); s.start(t0, Math.random()); s.stop(t0 + 0.35); am.start(t0); am.stop(t0 + 0.35);
    };
    [-0.7, 0.7, -0.4, 0.4].forEach((p, i) => gun(t + 0.05 + i * 0.03 + Math.random() * 0.03, p));
    [-0.7, 0.7, -0.4, 0.4].forEach((p, i) => gun(t + 1.0 + i * 0.05 + Math.random() * 0.06, p));
    osc('sine', 85, t + 1.75, 0.18, 0.12, { slide: 0.5 }); nz(0.08, 0.05, { t: t + 1.75, type: 'lowpass', f: 600 });
    nz(0.5, 0.015, { t: t + 0.4, type: 'highpass', f: 5000, a: 0.05 });
  },
  crash: () => {
    const c = ac(); if (!c) return; const t = c.currentTime;
    osc('sine', 95, t, 0.4, 0.22, { slide: 0.4 });
    nz(0.55, 0.22, { type: 'lowpass', f: 1800, q: 0.8, sweep: 250, a: 0.002 });
    nz(0.3, 0.12, { f: 900, q: 1.5, sweep: 400 });
    [523, 1307, 2210, 3180].forEach((f, i) => osc('sine', f * rnd(0.97, 1.03), t + 0.01, 0.25 + i * 0.05, 0.025, { pan: rnd(-0.5, 0.5) }));
    for (let i = 0; i < 9; i++) nz(0.03, rnd(0.01, 0.03), { t: t + 0.12 + Math.random() * 0.7, f: rnd(2500, 6000), q: 6, pan: rnd(-0.8, 0.8) });
    crowdCheer(0.5);
  },
  coin: () => { const t = now(); bell(987.8, t, 0.25, 0.04, { ratio: 3, index: 1.5 }); bell(1318.5, t + 0.08, 0.6, 0.045, { ratio: 3, index: 1.5, rev: 0.3 }); nz(0.05, 0.02, { type: 'highpass', f: 7000 }); },
  levelup: () => {
    const t = now();
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { pluck(f, t + i * 0.065, 0.4, 0.035, (i - 2.5) * 0.15, B.sfx); });
    bell(2093, t + 0.4, 1.2, 0.03, { ratio: 2, rev: 0.5 });
    nz(0.9, 0.018, { t: t + 0.35, type: 'highpass', f: 8000, a: 0.2, rev: 0.4 });
  },
  cheer: () => crowdCheer(1),
  // title-screen hit: sub drop + crash + wide A-minor brass chord
  sting: () => {
    const t = now();
    osc('sine', 110, t, 1.2, 0.3, { slide: 0.32, slideT: 0.5 });
    nz(2.2, 0.06, { t, type: 'highpass', f: 3500, q: 0.4, a: 0.002, rev: 0.6 });
    nz(0.5, 0.08, { t, type: 'lowpass', f: 900, sweep: 120, a: 0.002 });
    [57, 64, 69, 72, 76].forEach((n, i) => brass(mtof(n), t + 0.02, 1.6, 0.03, (i - 2) * 0.3));
    bell(mtof(88), t + 0.05, 2.2, 0.02, { ratio: 3.5, index: 1, rev: 0.6 });
  },
};
// every sound is a no-op until audio is unlocked, and can never throw into game code
for (const k of Object.keys(sfx)) { const f = sfx[k]; sfx[k] = (...a) => { if (!ac()) return; try { f(...a); } catch (e) { console.warn('sfx', k, e); } }; }
// brass-like stab (saw + filter envelope)
function brass(f, t, dur, peak, pan = 0, dest = null) {
  const c = ac(); if (!c) return;
  const g = c.createGain(), fl = c.createBiquadFilter();
  fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(3800, t + 0.06); fl.frequency.setTargetAtTime(1500, t + 0.08, 0.2);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.03); g.gain.setTargetAtTime(peak * 0.6, t + 0.05, 0.2); g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
  for (const d of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(fl); o.start(t); o.stop(t + dur + 0.6); }
  fl.connect(g); const out = dest || B.sfx; g.connect(panNode(pan, out)); sendTo(g, out === B.music ? B.musicRev : B.sfxRev, 0.25);
}
function pluck(f, t, dur, peak, pan, dest, cut = 4500) {
  const c = ctx; const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
  o.type = 'square'; o.frequency.value = f;
  fl.type = 'lowpass'; fl.Q.value = 3; fl.frequency.setValueAtTime(cut, t); fl.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + 0.18);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(panNode(pan, dest));
  o.start(t); o.stop(t + dur + 0.05);
  return g;
}

// ---------------------------------------------------------------------------
// MUSIC — generative but composed: each theme has chords per bar, a section
// arrangement (intro / verse / chorus / break) with instrument layers, drum
// patterns, bass lines, arps and hand-written lead melodies. Switching mood
// crossfades the outgoing song into the new one.
// ---------------------------------------------------------------------------
// Pattern helpers: 16-step strings, x = hit, X = accent, - = soft
const P16 = (s) => [...s].map((ch) => (ch === 'X' ? 1 : ch === 'x' ? 0.75 : ch === '-' ? 0.4 : 0));
const THEMES = {
  // MENU — "Apex": cinematic synthwave in A minor
  menu: {
    bpm: 100, swing: 0, level: 0.95, cut: 1700,
    chords: [
      { b: 45, n: [57, 60, 64, 71] }, { b: 41, n: [53, 57, 60, 64] }, { b: 48, n: [55, 60, 64, 67] }, { b: 43, n: [55, 59, 62, 67] },
      { b: 45, n: [57, 60, 64, 71] }, { b: 41, n: [53, 57, 60, 65] }, { b: 50, n: [53, 57, 62, 65] }, { b: 40, n: [56, 59, 64, 68] },
    ],
    sections: [
      { name: 'intro', bars: 4, L: { pad: 1, arp: 0.5, riser: 1 } },
      { name: 'verse', bars: 8, L: { pad: 1, arp: 1, bass: 1, drums: 'lite' } },
      { name: 'chorus', bars: 8, L: { pad: 1, arp: 1, bass: 1, drums: 'full', lead: 1 } },
      { name: 'verse', bars: 8, L: { pad: 1, arp: 1, bass: 1, drums: 'lite', counter: 1 } },
      { name: 'chorus', bars: 8, L: { pad: 1, arp: 1, bass: 1, drums: 'full', lead: 1 } },
      { name: 'break', bars: 4, L: { pad: 1, lead: 0.6, riser: 1 } },
    ],
    loopFrom: 1,
    drums: {
      lite: { kick: P16('X.........x.....'), snare: P16('........X.......'), hat: P16('..x...x...x...x.') },
      full: { kick: P16('X...x...X...x...'), snare: P16('....X.......X...'), hat: P16('x-x-x-x-x-x-x-xx'), ohat: P16('..............x.') },
    },
    bass: P16('X.x.x.xX.x.x.x.x'), bassOct: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12],
    arp: { order: [0, 1, 2, 3, 2, 1, 2, 3], rate: 2, oct: 12, wave: 'square', vol: 0.022 },
    leadWave: 'saw',
    lead: [
      [[0, 76, 4], [4, 74, 2], [6, 72, 2], [8, 71, 4], [12, 72, 4]],
      [[0, 69, 6], [6, 72, 2], [8, 76, 4], [12, 77, 4]],
      [[0, 79, 6], [6, 77, 2], [8, 76, 4], [12, 72, 4]],
      [[0, 74, 8], [8, 71, 4], [12, 74, 4]],
      [[0, 76, 4], [4, 74, 2], [6, 72, 2], [8, 71, 4], [12, 72, 4]],
      [[0, 69, 4], [4, 72, 4], [8, 77, 4], [12, 81, 4]],
      [[0, 81, 4], [4, 79, 2], [6, 77, 2], [8, 77, 4], [12, 76, 4]],
      [[0, 76, 8], [8, 80, 4], [12, 83, 4]],
    ],
    counter: [[[8, 64, 8]], [[8, 65, 8]], [[8, 67, 8]], [[8, 62, 8]], [[8, 64, 8]], [[8, 65, 8]], [[8, 62, 8]], [[8, 59, 8]]],
  },
  // MANAGEMENT — "Paddock": warm lo-fi house, electric piano, swing
  manage: {
    bpm: 90, swing: 0.16, level: 1.1, cut: 1300,
    chords: [
      { b: 38, n: [53, 57, 60, 64] }, { b: 43, n: [53, 59, 64, 69] }, { b: 36, n: [52, 55, 59, 62] }, { b: 45, n: [55, 61, 64, 70] },
    ],
    sections: [
      { name: 'intro', bars: 2, L: { keys: 1, vinyl: 1, pad: 0.5 } },
      { name: 'verse', bars: 8, L: { keys: 1, bass: 1, drums: 'lofi', vinyl: 1 } },
      { name: 'chorus', bars: 8, L: { keys: 1, bass: 1, drums: 'lofi2', lead: 1, pad: 0.6, vinyl: 1 } },
      { name: 'verse', bars: 8, L: { keys: 1, bass: 1, drums: 'lofi2', vinyl: 1, counter: 1 } },
      { name: 'break', bars: 4, L: { keys: 1, pad: 0.8, vinyl: 1 } },
    ],
    loopFrom: 1,
    drums: {
      lofi: { kick: P16('X......x..x.....'), snare: P16('....X.......X...'), hat: P16('x.-.x.-.x.-.x.-.') },
      lofi2: { kick: P16('X......x..x...-.'), snare: P16('....X.......X..-'), hat: P16('x-x-x-x-x-x-x-x-'), shaker: P16('-x-x-x-x-x-x-x-x') },
    },
    bassLine: [[0, 0, 6], [7, 7, 2], [10, 12, 3], [14, 10, 2]],   // [step, semis above root, len]
    keysHits: [[0, 7, 0.9], [6, 2, 0.5], [10, 4, 0.6]],             // [step, len, vel]
    leadWave: 'bell',
    lead: [
      [[2, 69, 2], [4, 72, 2], [7, 76, 5], [14, 74, 2]],
      [[0, 71, 6], [8, 69, 2], [10, 71, 2], [12, 74, 4]],
      [[2, 76, 2], [4, 79, 4], [10, 76, 2], [12, 74, 4]],
      [[0, 73, 6], [6, 76, 2], [8, 79, 4], [12, 77, 4]],
    ],
    counter: [[[12, 72, 4]], [[12, 71, 4]], [[12, 67, 4]], [[12, 69, 4]]],
  },
  // RACE — "Lights Out": tense driving electronica in E minor (sits under the engines)
  race: {
    bpm: 128, swing: 0, level: 0.55, cut: 2000,
    chords: [{ b: 40, n: [52, 55, 59, 64] }, { b: 36, n: [52, 55, 60, 64] }, { b: 38, n: [50, 54, 57, 62] }, { b: 35, n: [51, 54, 59, 63] }],
    sections: [
      { name: 'verse', bars: 8, L: { bass: 1, arp: 1, drums: 'drive' } },
      { name: 'chorus', bars: 8, L: { bass: 1, arp: 1, drums: 'full', stabs: 1, pad: 0.6 } },
      { name: 'break', bars: 4, L: { pad: 1, arp: 0.7, riser: 1 } },
    ],
    loopFrom: 0,
    drums: {
      drive: { kick: P16('X...X...X...X...'), hat: P16('..x...x...x...x.'), snare: P16('................') },
      full: { kick: P16('X...X...X...X...'), clap: P16('....X.......X...'), hat: P16('-.x--.x--.x--.x-'), ohat: P16('..x...x...x...x.') },
    },
    bass: P16('-xx-xx-xx-xx-xxx'), bassOct: [0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12],
    arp: { order: [0, 2, 1, 3, 2, 1, 3, 2], rate: 1, oct: 12, wave: 'square', vol: 0.014 },
    stabs: P16('X..x..x...x..x..'),
  },
  // VICTORY — "Podio": bright anthem in C major with brass and bells
  win: {
    bpm: 116, swing: 0, level: 0.72, cut: 2400,
    chords: [
      { b: 36, n: [60, 64, 67, 72] }, { b: 35, n: [59, 62, 67, 71] }, { b: 33, n: [57, 60, 64, 69] }, { b: 41, n: [57, 60, 65, 69] },
      { b: 40, n: [55, 60, 64, 67] }, { b: 41, n: [57, 60, 65, 69] }, { b: 43, n: [55, 59, 62, 67] }, { b: 36, n: [55, 60, 64, 72] },
    ],
    sections: [
      { name: 'stinger', bars: 1, L: { stinger: 1, pad: 1 } },
      { name: 'chorus', bars: 8, L: { pad: 1, bass: 1, drums: 'full', lead: 1, brass: 1 } },
      { name: 'verse', bars: 8, L: { pad: 1, arp: 1, bass: 1, drums: 'lite' } },
      { name: 'chorus', bars: 8, L: { pad: 1, arp: 0.6, bass: 1, drums: 'full', lead: 1, brass: 1 } },
    ],
    loopFrom: 1,
    drums: {
      lite: { kick: P16('X.......X.......'), snare: P16('....X.......X...'), hat: P16('x.x.x.x.x.x.x.x.') },
      full: { kick: P16('X...X...X...X..x'), snare: P16('....X.......X...'), clap: P16('....X.......X...'), hat: P16('x-x-x-x-x-x-x-x-'), ohat: P16('..x...x...x...x.') },
    },
    bass: P16('X.x.X.x.X.x.X.xx'), bassOct: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 7],
    arp: { order: [0, 1, 2, 3, 2, 1, 2, 3], rate: 2, oct: 12, wave: 'square', vol: 0.02 },
    leadWave: 'saw',
    lead: [
      [[0, 67, 2], [2, 72, 2], [4, 76, 4], [8, 79, 6], [14, 76, 2]],
      [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 8]],
      [[0, 81, 4], [4, 79, 2], [6, 76, 2], [8, 72, 4], [12, 76, 4]],
      [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 8]],
      [[0, 79, 4], [4, 81, 2], [6, 79, 2], [8, 76, 4], [12, 72, 4]],
      [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 4], [12, 69, 4]],
      [[0, 71, 4], [4, 72, 2], [6, 74, 2], [8, 79, 8]],
      [[0, 84, 12]],
    ],
    brassHits: P16('X.....x.....x...'),
  },
  // DERBY — "Scontro": garage punk-rock in E, distorted power chords
  derby: {
    bpm: 152, swing: 0, level: 1.05, cut: 2600,
    chords: [
      { b: 40, n: [40, 47, 52] }, { b: 40, n: [40, 47, 52] }, { b: 43, n: [43, 50, 55] }, { b: 45, n: [45, 52, 57] },
      { b: 40, n: [40, 47, 52] }, { b: 40, n: [40, 47, 52] }, { b: 48, n: [48, 55, 60] }, { b: 38, n: [38, 45, 50] },
    ],
    sections: [
      { name: 'intro', bars: 4, L: { guitar: 'mute', drums: 'rock' } },
      { name: 'verse', bars: 8, L: { guitar: 'mute', bass: 1, drums: 'rock' } },
      { name: 'chorus', bars: 8, L: { guitar: 'open', bass: 1, drums: 'rock2', lead: 1 } },
      { name: 'break', bars: 4, L: { guitar: 'open', drums: 'half' } },
    ],
    loopFrom: 1,
    drums: {
      rock: { kick: P16('X.....x.X.......'), snare: P16('....X.......X...'), hat: P16('x.x.x.x.x.x.x.x.') },
      rock2: { kick: P16('X.x...x.X.x.....'), snare: P16('....X.......X..x'), ohat: P16('x.x.x.x.x.x.x.x.') },
      half: { kick: P16('X.......x.......'), snare: P16('........X.......'), ohat: P16('x...x...x...x...') },
    },
    bass: P16('x.x.x.x.x.x.x.x.'), bassOct: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    guitarPat: P16('X.x.x.x.X.x.x.xx'),
    leadWave: 'dist',
    lead: [
      [[0, 64, 2], [2, 67, 2], [4, 69, 2], [6, 67, 2], [8, 64, 4], [12, 62, 2], [14, 64, 2]],
      [[0, 64, 8], [8, 71, 4], [12, 69, 4]],
      [[0, 67, 4], [4, 69, 2], [6, 71, 2], [8, 74, 4], [12, 71, 4]],
      [[0, 69, 6], [6, 67, 2], [8, 69, 8]],
      [[0, 64, 2], [2, 67, 2], [4, 69, 2], [6, 67, 2], [8, 64, 4], [12, 62, 2], [14, 64, 2]],
      [[0, 64, 8], [8, 76, 4], [12, 74, 4]],
      [[0, 72, 4], [4, 71, 2], [6, 67, 2], [8, 64, 8]],
      [[0, 62, 4], [4, 64, 2], [6, 66, 2], [8, 67, 4], [12, 66, 4]],
    ],
  },
};
THEMES.intro = THEMES.menu;

function curve(k) { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * k) / Math.tanh(k); } return cv; }
let distCurve = null;

class Song {
  constructor(name, start, fadeIn) {
    this.name = name; this.T = THEMES[name];
    this.out = ctx.createGain(); this.out.gain.value = 0.0001;
    this.out.connect(B.music);
    this.out.gain.setTargetAtTime(this.T.level, start, fadeIn / 3);
    this.rev = ctx.createGain(); this.rev.gain.value = 0.6; this.out.connect(this.rev); this.rev.connect(B.musicRev);
    this.step = 0; this.next = start; this.alive = true; this.endAt = Infinity;
    this.sec = 0; this.secBar = 0; this.bar = 0; this.loops = 0;
    const spb = 60 / this.T.bpm;
    B.delayL.delayTime.setTargetAtTime(spb * 0.75, start, 0.1); B.delayR.delayTime.setTargetAtTime(spb * 0.75, start, 0.1);
    this.dly = ctx.createGain(); this.dly.gain.value = 0.9; this.dly.connect(B.delay);
  }
  fadeOut(t, dur) { this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0.0001, t, dur / 4); this.endAt = t + dur; }
  get section() { return this.T.sections[this.sec]; }
  // advance the arrangement one bar
  nextBar() {
    this.bar++; this.secBar++;
    if (this.secBar >= this.section.bars) {
      this.secBar = 0; this.sec++;
      if (this.sec >= this.T.sections.length) { this.sec = this.T.loopFrom; this.loops++; }
    }
  }
  schedule(until) {
    const spb16 = 60 / this.T.bpm / 4;
    while (this.next < until) {
      const s16 = this.step % 16;
      const swing = s16 % 2 === 1 ? this.T.swing * spb16 : 0;
      try { this.play(s16, this.next + swing, spb16); } catch (e) { console.warn(e); }
      this.step++; this.next += spb16;
      if (this.step % 16 === 0) this.nextBar();
    }
  }
  play(s16, t, d16) {
    const T = this.T, sec = this.section, L = sec.L;
    const ch = T.chords[this.secBar % T.chords.length];
    const lastBar = this.secBar === sec.bars - 1;
    const nextSec = T.sections[this.sec + 1 >= T.sections.length ? T.loopFrom : this.sec + 1];
    const out = this.out;
    // ---- harmony
    if (L.pad && s16 === 0) padChord(ch.n.map((n) => n + 12 * (ch.n[0] < 50 ? 1 : 0)), t, d16 * 16, out, L.pad * 0.036, T.cut);
    if (L.keys) for (const [st, len, vel] of T.keysHits) if (s16 === st) for (const n of ch.n) epiano(mtof(n), t, d16 * len, out, 0.07 * vel * L.keys, (n - 60) / 30);
    if (L.stabs && T.stabs[s16]) for (const n of ch.n.slice(0, 3)) stab(mtof(n + 12), t, d16 * 1.4, out, 0.018 * T.stabs[s16]);
    if (L.brass && T.brassHits[s16]) ch.n.slice(0, 3).forEach((n, i) => brass(mtof(n), t, d16 * (s16 === 0 ? 5 : 2), 0.016, (i - 1) * 0.35, out));
    if (L.guitar && T.guitarPat[s16]) guitar(ch.n, t, d16 * (L.guitar === 'open' && s16 % 8 === 0 ? 7 : 1.6), out, L.guitar === 'mute' ? 0.6 : 1, T.guitarPat[s16]);
    // ---- arp
    if (L.arp && T.arp && s16 % T.arp.rate === 0) {
      const A = T.arp, k = (s16 / A.rate) % A.order.length, n = ch.n[A.order[k] % ch.n.length] + A.oct;
      const g = pluck(mtof(n), t, d16 * 1.8, A.vol * L.arp, k % 2 ? 0.35 : -0.35, out, 1800 + (L.lead ? 0 : 1600));
      g.connect(this.dly);
    }
    // ---- bass
    if (L.bass) {
      if (T.bassLine) { for (const [st, semi, len] of T.bassLine) if (s16 === st) bassNote(mtof(ch.b + semi), t, d16 * len, out, 0.11); }
      else if (T.bass[s16]) bassNote(mtof(ch.b + (T.bassOct?.[s16] || 0)), t, d16 * 1.7, out, 0.1 * (0.7 + T.bass[s16] * 0.3), this.name === 'derby');
    }
    // ---- melody
    if (L.lead && T.lead) {
      const ph = T.lead[this.secBar % T.lead.length];
      for (const [st, n, len] of ph) if (st === s16) leadNote(mtof(n), t, d16 * len, out, this.dly, 0.03 * L.lead, T.leadWave);
    }
    if (L.counter && T.counter) {
      const ph = T.counter[this.secBar % T.counter.length];
      for (const [st, n, len] of ph) if (st === s16) leadNote(mtof(n), t, d16 * len, out, this.dly, 0.016, 'soft');
    }
    if (L.stinger && s16 === 0) { crash(t, out, 0.07); for (const n of ch.n) brass(mtof(n), t, d16 * 14, 0.02, (n - 64) / 12, out); }
    // ---- drums
    const D = typeof L.drums === 'string' ? T.drums[L.drums] : null;
    if (D) {
      const fill = lastBar && s16 >= 12 && nextSec && nextSec.name !== sec.name && nextSec.L.drums;
      if (D.kick?.[s16]) kick(t, out, 0.32 * D.kick[s16]);
      if (fill) snare(t, out, 0.05 + (s16 - 12) * 0.025, 0.6);
      else if (D.snare?.[s16]) snare(t, out, 0.13 * D.snare[s16]);
      if (D.clap?.[s16]) clap(t, out, 0.07 * D.clap[s16]);
      if (D.hat?.[s16]) hat(t, out, 0.03 * D.hat[s16], 0.045, (s16 % 4 - 1.5) * 0.15);
      if (D.ohat?.[s16]) hat(t, out, 0.022 * D.ohat[s16], 0.22, 0.25);
      if (D.shaker?.[s16]) hat(t, out, 0.012 * D.shaker[s16], 0.03, -0.3, 9500);
      if (s16 === 0 && this.secBar === 0 && (sec.name === 'chorus' || (this.name === 'derby' && sec.name !== 'break'))) crash(t, out, 0.05);
    }
    if (L.vinyl && Math.random() < 0.18) nz(0.004, rnd(0.004, 0.012), { t: t + Math.random() * d16, type: 'highpass', f: 3000, dest: out });
    // riser into the next section
    if (L.riser && lastBar && s16 === 0) nz(d16 * 16, 0.03, { t, f: 400, q: 2, sweep: 6000, a: d16 * 15, dest: out });
  }
}
function padChord(notes, t, dur, out, vol, cut) {
  const c = ctx, fl = c.createBiquadFilter(), g = c.createGain();
  fl.type = 'lowpass'; fl.Q.value = 0.6; fl.frequency.setValueAtTime(cut * 0.5, t); fl.frequency.linearRampToValueAtTime(cut, t + dur * 0.5); fl.frequency.linearRampToValueAtTime(cut * 0.6, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.9, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
  fl.connect(g); g.connect(out);
  notes.forEach((n, i) => {
    for (const det of [-9, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det + (i - 1.5) * 1.5;
      const p = c.createStereoPanner(); p.pan.value = det < 0 ? -0.45 : 0.45;
      o.connect(p); p.connect(fl); o.start(t); o.stop(t + dur + 0.7);
    }
  });
}
function epiano(f, t, dur, out, vol, pan = 0) {
  const c = ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.5);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  const tine = c.createOscillator(); tine.frequency.value = f * 4.02; const tg = c.createGain(); tg.gain.setValueAtTime(vol * 0.25, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); tine.connect(tg); tg.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.setTargetAtTime(vol * 0.45, t + 0.01, 0.35); g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
  g.connect(panNode(pan, out));
  car.start(t); mod.start(t); tine.start(t); const end = t + dur + 0.8; car.stop(end); mod.stop(end); tine.stop(t + 0.15);
}
function stab(f, t, dur, out, vol) {
  const c = ctx, fl = c.createBiquadFilter(), g = c.createGain();
  fl.type = 'lowpass'; fl.Q.value = 5; fl.frequency.setValueAtTime(3500, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const d of [-12, 12]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(fl); o.start(t); o.stop(t + dur + 0.05); }
  fl.connect(g); g.connect(out);
}
function bassNote(f, t, dur, out, vol, dirty = false) {
  const c = ctx, o = c.createOscillator(), sub = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
  o.type = 'sawtooth'; o.frequency.value = f; sub.type = 'sine'; sub.frequency.value = f;
  fl.type = 'lowpass'; fl.Q.value = dirty ? 2 : 7; fl.frequency.setValueAtTime(dirty ? 1400 : 1100, t); fl.frequency.exponentialRampToValueAtTime(dirty ? 500 : 220, t + Math.min(0.25, dur));
  const sg = c.createGain(); sg.gain.value = 0.9; sub.connect(sg); sg.connect(g);
  o.connect(fl); fl.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.setTargetAtTime(vol * 0.7, t + 0.02, 0.1); g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.03);
  g.connect(out);
  o.start(t); sub.start(t); o.stop(t + dur + 0.2); sub.stop(t + dur + 0.2);
}
function leadNote(f, t, dur, out, dly, vol, wave = 'saw') {
  const c = ctx;
  if (wave === 'bell') { bell(f, t, Math.max(0.6, dur * 1.4), vol * 0.9, { ratio: 3.5, index: 1.3, dest: out }); return; }
  const g = c.createGain(), fl = c.createBiquadFilter();
  fl.type = 'lowpass'; fl.Q.value = wave === 'soft' ? 0.5 : 2.5; fl.frequency.setValueAtTime(wave === 'soft' ? 1600 : 1200, t); fl.frequency.linearRampToValueAtTime(wave === 'soft' ? 1800 : 3400, t + 0.05); fl.frequency.setTargetAtTime(wave === 'soft' ? 1400 : 2200, t + 0.06, 0.25);
  const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.4; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur)); vib.connect(vg);
  const types = wave === 'soft' ? ['triangle', 'sine'] : wave === 'dist' ? ['sawtooth', 'square'] : ['sawtooth', 'square'];
  types.forEach((ty, i) => { const o = c.createOscillator(); o.type = ty; o.frequency.setValueAtTime(f * (i ? 0.5 : 1) * (wave === 'dist' && i ? 2 : 1), t); o.detune.value = i ? -6 : 5; vg.connect(o.frequency); o.connect(fl); o.start(t); o.stop(t + dur + 0.4); });
  let head = fl;
  if (wave === 'dist') { const sh = c.createWaveShaper(); sh.curve = distCurve || (distCurve = curve(6)); const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 3000; fl.connect(sh); sh.connect(pf); head = pf; vol *= 0.6; }
  head.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setTargetAtTime(vol * 0.75, t + 0.03, 0.2); g.gain.setTargetAtTime(0.0001, t + dur * 0.95, 0.06);
  g.connect(out); g.connect(dly);
  vib.start(t); vib.stop(t + dur + 0.4);
}
function guitar(notes, t, dur, out, mute, vel) {
  const c = ctx, fl = c.createBiquadFilter(), sh = c.createWaveShaper(), cab = c.createBiquadFilter(), g = c.createGain(), pre = c.createGain();
  pre.gain.value = 0.35;
  sh.curve = distCurve || (distCurve = curve(6));
  fl.type = 'lowpass'; fl.frequency.value = mute < 1 ? 900 : 2600; fl.Q.value = 0.8;
  cab.type = 'peaking'; cab.frequency.value = 1600; cab.Q.value = 1; cab.gain.value = 4;
  notes.forEach((n, i) => { for (const d of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n + 12); o.detune.value = d + i; o.connect(pre); o.start(t); o.stop(t + dur + 0.1); } });
  pre.connect(sh); sh.connect(fl); fl.connect(cab); cab.connect(g);
  const v = 0.045 * vel;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(v * (mute < 1 ? 0.2 : 0.7), t + 0.01, mute < 1 ? 0.04 : 0.3); g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
  g.connect(out);
}
function kick(t, out, vol) {
  const c = ctx, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
  nz(0.006, vol * 0.25, { t, type: 'highpass', f: 3000, dest: out });
}
function snare(t, out, vol, tone = 1) {
  nz(0.16, vol, { t, type: 'bandpass', f: 1900, q: 0.9, dest: out });
  nz(0.08, vol * 0.4, { t, type: 'highpass', f: 6000, dest: out });
  const c = ctx, o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  g.gain.setValueAtTime(vol * 0.7 * tone, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
}
function clap(t, out, vol) { for (let i = 0; i < 3; i++) nz(0.012, vol, { t: t + i * 0.011, f: 1400, q: 1.2, dest: out }); nz(0.18, vol * 0.8, { t: t + 0.033, f: 1300, q: 1, dest: out }); }
function hat(t, out, vol, dur, pan = 0, f = 8000) { nz(dur, vol, { t, type: 'highpass', f, q: 0.7, dest: out, pan }); }
function crash(t, out, vol) { nz(1.8, vol, { t, type: 'highpass', f: 4500, q: 0.4, dest: out, a: 0.002 }); }

export const music = {
  mood: null, songs: [], timer: null, cur: null,
  setMood(m) {
    if (m === 'race' && scene === 'derby') m = 'derby';
    if (m && !THEMES[m]) m = 'manage';
    if (m === this.mood && this.cur?.alive) return;
    this.mood = m;
    if (!ctx || !unlocked) return;
    this.start();
  },
  kick() { if (this.mood && (!this.cur || !this.cur.alive || this.cur.name !== this.mood)) this.start(); },
  start() {
    const c = ac(); if (!c || !this.mood) return;
    const t = c.currentTime;
    const prev = this.cur;
    const xf = this.mood === 'win' ? 0.6 : prev ? 2.2 : 1.2;
    if (prev) prev.fadeOut(t, xf);
    // align the new song to the beat of the old one when crossfading
    this.cur = new Song(this.mood, t + 0.08, xf);
    this.songs.push(this.cur);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },
  resync() { const t = ctx.currentTime; for (const s of this.songs) if (s.next < t) s.next = t + 0.05; },
  tick() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const s of this.songs) {
      if (s.next < t - 0.25) s.next = t + 0.02; // tab was throttled: skip ahead instead of bursting
      if (t < s.endAt) s.schedule(t + 0.14);
      else if (s.alive) { s.alive = false; setTimeout(() => { try { s.out.disconnect(); s.dly.disconnect(); } catch {} }, 3000); }
    }
    this.songs = this.songs.filter((s) => s.alive);
    if (!this.songs.length) { clearInterval(this.timer); this.timer = null; }
  },
  stop() {
    this.mood = null;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const s of this.songs) if (s.endAt === Infinity) s.fadeOut(t, 1.2);
    this.cur = null;
  },
};

// ---------------------------------------------------------------------------
// AMBIENCE — crowd, rain, wind, paddock / pit lane
// ---------------------------------------------------------------------------
const PADDOCK_SCENES = new Set(['weekend', 'rally']);
const ambience = {
  crowd: null, rain: null, paddock: null, crowdLvl: 0, rainLvl: 0, timer: null,
  ensure() {
    if (this.crowd || !ac()) return;
    const c = ctx;
    // crowd: two bands of pink noise with slow, independent swells (murmur)
    const mk = (f, q, base) => {
      const s = src(pinkBuf), fl = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      lfo.frequency.value = rnd(0.07, 0.2); lg.gain.value = base * 0.35; lfo.connect(lg);
      const amp = c.createGain(); amp.gain.value = 1; lg.connect(amp.gain);
      s.connect(fl); fl.connect(amp); amp.connect(g); g.connect(B.amb); s.start(0, Math.random()); lfo.start();
      return { g, base };
    };
    this.crowd = [mk(700, 0.7, 1), mk(1900, 1.6, 0.6), mk(350, 0.8, 0.5)];
    const rs = src(noiseBuf), rf = c.createBiquadFilter(), rf2 = c.createBiquadFilter(), rg = c.createGain();
    rf.type = 'highpass'; rf.frequency.value = 1800; rf2.type = 'lowpass'; rf2.frequency.value = 9000; rg.gain.value = 0;
    rs.connect(rf); rf.connect(rf2); rf2.connect(rg); rg.connect(B.amb); rs.start();
    this.rain = rg;
  },
  setCrowd(v) { if (this.crowd && Math.abs(v - this.crowdLvl) < 0.01) return; this.ensure(); if (!this.crowd) return; this.crowdLvl = v; for (const L of this.crowd) L.g.gain.setTargetAtTime(v * 0.05 * L.base, ctx.currentTime, 0.8); },
  setRain(v) { if (this.rain && Math.abs(v - this.rainLvl) < 0.01) return; this.ensure(); if (!this.rain) return; this.rainLvl = v; this.rain.gain.setTargetAtTime(v * 0.05, ctx.currentTime, 0.8); },
  // paddock bed: distant generators + random pit-lane events (wheel guns, revs, PA, tools)
  update() {
    if (!ctx || !unlocked) return;
    const want = PADDOCK_SCENES.has(scene) && !engine;
    if (want && !this.paddock) {
      const c = ctx, s = src(brownBuf), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'lowpass'; fl.frequency.value = 220; g.gain.value = 0; g.gain.setTargetAtTime(0.06, c.currentTime, 1.5);
      s.connect(fl); fl.connect(g); g.connect(B.amb); s.start();
      const hum = c.createOscillator(), hg = c.createGain(); hum.frequency.value = 100; hg.gain.value = 0; hg.gain.setTargetAtTime(0.0035, c.currentTime, 1.5); hum.connect(hg); hg.connect(B.amb); hum.start();
      this.paddock = { s, g, hum, hg };
      const loop = () => { if (!this.paddock) return; this.paddockEvent(); this.timer = setTimeout(loop, rnd(2500, 7000)); };
      this.timer = setTimeout(loop, 1500);
    } else if (!want && this.paddock) {
      const p = this.paddock; this.paddock = null; clearTimeout(this.timer);
      p.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5); p.hg.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => { try { p.s.stop(); p.hum.stop(); } catch {} }, 3000);
    }
  },
  paddockEvent() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, r = Math.random(), far = { dest: B.amb };
    if (r < 0.35) { // distant wheel gun rattle
      const p = rnd(-0.8, 0.8), n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) nz(rnd(0.12, 0.3), 0.012, { ...far, t: t + i * rnd(0.15, 0.4), f: rnd(2400, 3400), q: 3, pan: p });
    } else if (r < 0.6) { // an engine blipping in a garage down the lane
      const c = ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(), pn = c.createStereoPanner();
      o.type = 'sawtooth'; const f0 = rnd(90, 140); o.frequency.setValueAtTime(f0, t);
      const blips = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < blips; i++) { const tb = t + i * 0.55; o.frequency.setTargetAtTime(f0 * rnd(2.4, 3.6), tb, 0.06); o.frequency.setTargetAtTime(f0, tb + 0.22, 0.12); }
      fl.type = 'lowpass'; fl.frequency.value = 700; pn.pan.value = rnd(-0.9, 0.9);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.1); g.gain.setTargetAtTime(0.0001, t + blips * 0.55, 0.2);
      o.connect(fl); fl.connect(g); g.connect(pn); pn.connect(B.amb); o.start(t); o.stop(t + blips * 0.55 + 1.2);
    } else if (r < 0.8) { // PA announcer: formant-filtered noise with syllable rhythm
      const c = ctx, s = src(pinkBuf), f1 = c.createBiquadFilter(), g = c.createGain();
      f1.type = 'bandpass'; f1.Q.value = 4; const dur = rnd(1.4, 3);
      g.gain.setValueAtTime(0, t);
      for (let x = 0; x < dur; x += rnd(0.08, 0.18)) { f1.frequency.setValueAtTime(rnd(500, 1400), t + x); g.gain.setValueAtTime(rnd(0.004, 0.012), t + x); g.gain.setTargetAtTime(0.0005, t + x + 0.05, 0.03); }
      g.gain.setValueAtTime(0, t + dur);
      s.connect(f1); f1.connect(g); g.connect(panNode(rnd(-0.5, 0.5), B.amb)); sendTo(g, B.rev, 0.6); s.start(t, Math.random()); s.stop(t + dur + 0.1);
    } else { // tools / spanner clink
      bell(rnd(2200, 3400), t, 0.25, 0.006, { ratio: 2.7, index: 1, dest: B.amb, pan: rnd(-0.7, 0.7) });
    }
  },
};
export function crowdCheer(amount = 1) {
  if (!ctx || !unlocked) return;
  ambience.ensure(); if (!ambience.crowd) return;
  const t = ctx.currentTime, base = Math.max(ambience.crowdLvl, 0.15);
  for (const L of ambience.crowd) {
    const g = L.g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(Math.min(1.5, base + amount) * 0.07 * L.base, t, 0.25); g.setTargetAtTime(ambience.crowdLvl * 0.05 * L.base, t + 0.9 + amount, 0.9);
  }
  for (let i = 0; i < Math.round(3 * amount); i++) { // whistles in the stands
    const tt = t + rnd(0.1, 1.2), f = rnd(1800, 2800);
    osc('sine', f, tt, rnd(0.2, 0.45), 0.004 * amount, { slide: rnd(1.1, 1.4), dest: B.amb, pan: rnd(-0.8, 0.8) });
  }
}

// ---------------------------------------------------------------------------
// ENGINES — firing-order synthesis per category
// fire frequency = rpm/60 × cylinders/2 (4-stroke). Two detuned "banks", a
// half-order sub (V8 burble), cycle-rate amplitude roughness, drive, a
// throttle-tracking filter, intake noise, turbo whistle + blow-off, hybrid
// whine, overrun crackle / anti-lag bangs, gear shift cuts, tyre squeal, wind.
// ---------------------------------------------------------------------------
const ENG = {
  formula:   { cyl: 6, idle: 4200, red: 12400, gears: 8, top: 345, gain: 0.17, wave: 'v6', sub: 0.12, rough: 0.07, cyc: 1, cut: [1100, 7000], drive: 1.6, turbo: 0.2, hybrid: 0.7, intake: 0.25, pops: 0.25, antilag: 0, scream: 5 },
  junior:    { cyl: 6, idle: 3800, red: 9800, gears: 6, top: 290, gain: 0.17, wave: 'v6', sub: 0.16, rough: 0.09, cyc: 1, cut: [900, 5600], drive: 1.8, turbo: 0.1, hybrid: 0, intake: 0.3, pops: 0.3, antilag: 0, scream: 3 },
  endurance: { cyl: 8, idle: 3000, red: 9600, gears: 7, top: 340, gain: 0.18, wave: 'v8', sub: 0.32, rough: 0.14, cyc: 1, cut: [800, 5200], drive: 2, turbo: 0.15, hybrid: 0.45, intake: 0.25, pops: 0.45, antilag: 0, scream: 1 },
  rally:     { cyl: 4, idle: 2500, red: 7800, gears: 6, top: 200, gain: 0.19, wave: 'i4', sub: 0.26, rough: 0.2, cyc: 1, cut: [650, 4300], drive: 2.4, turbo: 1, hybrid: 0, intake: 0.35, pops: 1, antilag: 1, scream: -1 },
  banger:    { cyl: 8, idle: 850, red: 6000, gears: 7, top: 200, gain: 0.18, wave: 'v8x', sub: 0.6, rough: 0.38, cyc: 0.5, cut: [380, 3000], drive: 2.8, turbo: 0, hybrid: 0, intake: 0.3, pops: 0.7, antilag: 0, scream: -3 },
  hatch:     { cyl: 4, idle: 900, red: 7000, gears: 6, top: 180, gain: 0.19, wave: 'i4', sub: 0.22, rough: 0.22, cyc: 1, cut: [500, 3800], drive: 2.2, turbo: 0.3, hybrid: 0, intake: 0.4, pops: 0.45, antilag: 0, scream: -2 },
};
// harmonic spectra of each engine "voice"
const SPECTRA = {
  v6: [0, 1, 0.75, 0.6, 0.55, 0.42, 0.38, 0.3, 0.26, 0.22, 0.2, 0.16, 0.14, 0.12, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04],
  v8: [0, 1, 0.85, 0.55, 0.42, 0.35, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04],
  i4: [0, 1, 0.55, 0.65, 0.3, 0.38, 0.2, 0.24, 0.12, 0.15, 0.08, 0.1, 0.05, 0.06],
  v8x: [0, 1, 0.95, 0.6, 0.45, 0.28, 0.2, 0.12, 0.08, 0.05, 0.03],
};
function periodic(name) {
  if (WAVES[name]) return WAVES[name];
  const amp = SPECTRA[name] || SPECTRA.v6, re = new Float32Array(amp.length), im = new Float32Array(amp.length);
  for (let i = 1; i < amp.length; i++) { const ph = (i * 2.399) % (Math.PI * 2); re[i] = amp[i] * Math.cos(ph); im[i] = amp[i] * Math.sin(ph); }
  return (WAVES[name] = ctx.createPeriodicWave(re, im));
}
let engine = null;
export function engineStart(cat = 'formula') {
  const st = getSettings();
  if (st.sound === false || st.engineSound === false) return;
  const c = ac(); if (!c || engine) return;
  const key = scene === 'derby' ? (cat === 'rally' ? 'hatch' : 'banger') : cat;
  const P = ENG[key] || ENG.formula;
  const t = c.currentTime;
  const out = c.createGain(); out.gain.value = 0.0001; out.gain.setTargetAtTime(P.gain * 0.5, t, 0.4); out.connect(B.eng);
  const wave = periodic(P.wave);
  // engine core
  const amp = c.createGain(); amp.gain.value = 1 - P.rough;
  const o1 = c.createOscillator(); o1.setPeriodicWave(wave);
  const o2 = c.createOscillator(); o2.setPeriodicWave(wave); o2.detune.value = 11;
  const g2 = c.createGain(); g2.gain.value = 0.55; o2.connect(g2); g2.connect(amp); o1.connect(amp);
  const sub = c.createOscillator(); sub.type = 'triangle'; const subG = c.createGain(); subG.gain.value = P.sub; sub.connect(subG); subG.connect(amp);
  const lfo = c.createOscillator(); lfo.type = 'triangle'; const lfoG = c.createGain(); lfoG.gain.value = P.rough; lfo.connect(lfoG); lfoG.connect(amp.gain);
  const drive = c.createGain(); drive.gain.value = P.drive;
  const sh = c.createWaveShaper(); sh.curve = curve(1.8); sh.oversample = '2x';
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = P.cut[0];
  const body = c.createBiquadFilter(); body.type = 'peaking'; body.Q.value = 1.4; body.gain.value = 5;
  const hs = c.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 2600; hs.gain.value = P.scream;
  const post = c.createGain(); post.gain.value = 0.55;
  amp.connect(drive); drive.connect(sh); sh.connect(lp); lp.connect(body); body.connect(hs); hs.connect(post); post.connect(out);
  // intake / mechanical noise
  const ns = src(noiseBuf), nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'bandpass'; nf.Q.value = 1.6; nf.frequency.value = 900; ng.gain.value = 0;
  ns.connect(nf); nf.connect(ng); ng.connect(lp);
  // turbo whistle (sine + airy band) and hybrid whine
  const tb = c.createOscillator(); tb.type = 'sine'; const tbg = c.createGain(); tbg.gain.value = 0; tb.connect(tbg); tbg.connect(out);
  const ta = src(noiseBuf), taf = c.createBiquadFilter(), tag = c.createGain(); taf.type = 'bandpass'; taf.Q.value = 6; taf.frequency.value = 4000; tag.gain.value = 0; ta.connect(taf); taf.connect(tag); tag.connect(out);
  const hy = c.createOscillator(); hy.type = 'sine'; const hyg = c.createGain(); hyg.gain.value = 0; hy.connect(hyg); hyg.connect(out);
  const hy2 = c.createOscillator(); hy2.type = 'triangle'; hy2.connect(hyg);
  // tyre squeal (two resonant bands with a wobble) and wind
  const sq = src(noiseBuf), sqf = c.createBiquadFilter(), sqf2 = c.createBiquadFilter(), sqg = c.createGain(), wob = c.createOscillator(), wobg = c.createGain();
  sqf.type = 'bandpass'; sqf.frequency.value = 1750; sqf.Q.value = 14; sqf2.type = 'bandpass'; sqf2.frequency.value = 2450; sqf2.Q.value = 10;
  wob.frequency.value = 7; wobg.gain.value = 90; wob.connect(wobg); wobg.connect(sqf.frequency); sqg.gain.value = 0;
  sq.connect(sqf); sq.connect(sqf2); sqf.connect(sqg); sqf2.connect(sqg); sqg.connect(B.eng);
  const wd = src(pinkBuf), wdf = c.createBiquadFilter(), wdg = c.createGain(); wdf.type = 'bandpass'; wdf.frequency.value = 500; wdf.Q.value = 0.5; wdg.gain.value = 0; wd.connect(wdf); wdf.connect(wdg); wdg.connect(B.eng);
  const oscs = [o1, o2, sub, lfo, tb, hy, hy2, wob];
  oscs.forEach((o) => o.start(t)); [ns, ta, sq, wd].forEach((s) => s.start(t, Math.random()));
  engine = { P, key, out, o1, o2, sub, lfo, drive, lp, body, nf, ng, tb, tbg, taf, tag, hy, hy2, hyg, sqg, wdg, oscs, srcs: [ns, ta, sq, wd], gear: 1, kmh: 0, rpm: P.idle, thr: 0.3, boost: 0, lastT: t, lastPop: 0, lastShift: 0 };
  setEngineFreq(engine, P.idle, t);
  ambience.update();
}
function setEngineFreq(e, rpm, t, tc = 0.035) {
  const P = e.P, f = (rpm / 60) * (P.cyl / 2);
  e.o1.frequency.setTargetAtTime(f, t, tc); e.o2.frequency.setTargetAtTime(f, t, tc);
  e.sub.frequency.setTargetAtTime(f / 2, t, tc);
  e.lfo.frequency.setTargetAtTime((rpm / 120) * P.cyc * 2, t, tc);
  e.body.frequency.setTargetAtTime(Math.min(4000, f * 2.2), t, 0.05);
  e.nf.frequency.setTargetAtTime(Math.min(6000, f * 3.2), t, 0.05);
  e.hy.frequency.setTargetAtTime((rpm / 60) * 7.5, t, 0.05); e.hy2.frequency.setTargetAtTime((rpm / 60) * 11.2, t, 0.05);
}
// speed01: 0..1 of the category top speed. opts: { rain, crowd, rpm, throttle, slip }
export function engineSet(speed01, opts = {}) {
  if (!engine || !ctx) return;
  const e = engine, P = e.P, t = ctx.currentTime;
  const dt = Math.max(0.001, t - e.lastT); e.lastT = t;
  const kmh = Math.max(0, speed01) * P.top;
  // gearbox: equal speed bands per gear with overlap
  const band = P.top / P.gears;
  const gear = Math.min(P.gears, Math.max(1, Math.floor(kmh / band) + 1));
  const lo = (gear - 1) * band * 0.82, hi = gear * band;
  const frac = opts.rpm != null ? clamp(opts.rpm, 0, 1) : clamp((kmh - lo) / (hi - lo), 0, 1);
  const stopped = opts.rpm == null && speed01 <= 0.01;
  let rpm = stopped ? P.idle * 0.85 : P.idle + (P.red - P.idle) * frac;
  if (stopped) rpm *= 1 + Math.sin(t * 9) * 0.015;            // idle hunting
  // throttle estimate from acceleration (unless given)
  const acc = (kmh - e.kmh) / dt; e.kmh = kmh;
  const thrRaw = opts.throttle != null ? opts.throttle : stopped ? 0.08 : clamp(0.6 + acc / 45, 0, 1);
  const prevThr = e.thr;
  e.thr += (thrRaw - e.thr) * Math.min(1, dt * 7);
  const thr = e.thr;
  // gear change: short torque cut + bark, pop on rally / banger
  if (gear !== e.gear && !stopped) {
    const up = gear > e.gear; e.gear = gear;
    if (up && t - e.lastShift > 0.15) {
      e.lastShift = t;
      e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(P.gain * 0.25, t, 0.012); e.out.gain.setTargetAtTime(P.gain * (0.55 + 0.45 * thr), t + 0.05, 0.03);
      setEngineFreq(e, rpm * 1.06, t, 0.01);
      if (P.pops > 0.3 || P.antilag) pop(e, t + 0.02, P.antilag ? 1.2 : 0.7);
    }
  } else e.gear = gear;
  // lift-off: overrun crackle / anti-lag bangs / turbo blow-off
  if (prevThr > 0.55 && thr < 0.45 && rpm > P.idle * 1.5) {
    const n = Math.round(P.pops * 5 * Math.random()) + (P.antilag ? 2 : 0);
    for (let i = 0; i < n; i++) pop(e, t + 0.04 + i * rnd(0.05, 0.13), P.antilag ? 1 : 0.6);
    if (P.turbo > 0.25 && e.boost > 0.45) nz(0.35, 0.03 * P.turbo, { t, f: 3000, q: 1.2, sweep: 900, dest: B.eng, a: 0.01 });
  }
  setEngineFreq(e, rpm, t);
  const load = stopped ? 0.35 : 0.45 + 0.55 * thr;
  e.lp.frequency.setTargetAtTime(P.cut[0] + (P.cut[1] - P.cut[0]) * (0.2 + 0.8 * thr) * (0.35 + 0.65 * frac), t, 0.06);
  e.drive.gain.setTargetAtTime(P.drive * (0.6 + thr * 0.8), t, 0.06);
  e.ng.gain.setTargetAtTime(P.intake * (0.15 + thr * frac) * 0.6, t, 0.08);
  if (t - e.lastShift > 0.06) e.out.gain.setTargetAtTime(P.gain * load, t, 0.08);
  // turbo spools with lag
  e.boost += ((stopped ? 0 : thr * (0.3 + 0.7 * frac)) - e.boost) * Math.min(1, dt * (thr > e.boost ? 1.8 : 4));
  e.tb.frequency.setTargetAtTime(2600 + e.boost * 5200, t, 0.08);
  e.tbg.gain.setTargetAtTime(P.turbo * e.boost * e.boost * 0.012, t, 0.08);
  e.taf.frequency.setTargetAtTime(3000 + e.boost * 3000, t, 0.1); e.tag.gain.setTargetAtTime(P.turbo * e.boost * 0.01, t, 0.1);
  // hybrid: whine strongest while harvesting (off throttle) and at low speed
  e.hyg.gain.setTargetAtTime(P.hybrid * (stopped ? 0.002 : 0.004 + (1 - thr) * 0.008), t, 0.1);
  // tyres + wind
  const slip = opts.slip != null ? clamp(opts.slip, 0, 1) : clamp((-acc - 70) / 180, 0, 0.6);
  e.sqg.gain.setTargetAtTime(slip * 0.05, t, 0.05);
  e.wdg.gain.setTargetAtTime(Math.pow(clamp(kmh / P.top, 0, 1), 2) * 0.03, t, 0.2);
  ambience.setCrowd(opts.crowd || 0);
  ambience.setRain(opts.rain || 0);
  return gear;
}
// backfire / anti-lag bang
function pop(e, t, k) {
  if (t - e.lastPop < 0.035) return; e.lastPop = t;
  nz(rnd(0.008, 0.03), rnd(0.05, 0.12) * k * e.P.gain * 10, { t, f: rnd(350, 1300), q: 1.2, dest: B.eng, a: 0.001 });
  if (k > 0.9) osc('sine', rnd(70, 110), t, 0.08, 0.06 * k, { slide: 0.5, dest: B.eng });
}
export function engineStop() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  const t = ctx.currentTime;
  e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(0.0001, t, 0.25);
  e.sqg.gain.setTargetAtTime(0, t, 0.1); e.wdg.gain.setTargetAtTime(0, t, 0.2);
  ambience.setCrowd(0); ambience.setRain(0);
  setTimeout(() => { try { e.oscs.forEach((o) => o.stop()); e.srcs.forEach((s) => s.stop()); e.out.disconnect(); } catch {} }, 1500);
  ambience.update();
}

// Pass-by: the car's own engine voice with doppler shift, stereo sweep and air absorption
let lastPass = 0;
export function passBy(intensity = 1, cat = 'formula') {
  const st = getSettings(); if (st.sound === false || st.engineSound === false) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime; if (t - lastPass < 0.35) return; lastPass = t;
  const P = ENG[cat] || ENG.formula;
  const f0 = (P.red * rnd(0.78, 0.92) / 60) * (P.cyl / 2);
  const dur = 1.1, mid = t + dur * 0.4;
  const o = c.createOscillator(); o.setPeriodicWave(periodic(P.wave));
  o.frequency.setValueAtTime(f0 * 1.14, t); o.frequency.setValueAtTime(f0 * 1.12, mid - 0.06); o.frequency.exponentialRampToValueAtTime(f0 * 0.84, mid + 0.12); o.frequency.linearRampToValueAtTime(f0 * 0.82, t + dur);
  const sh = c.createWaveShaper(); sh.curve = curve(1.8);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.linearRampToValueAtTime(5200, mid); f.frequency.exponentialRampToValueAtTime(900, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * intensity, mid); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = c.createStereoPanner(); const side = Math.random() < 0.5 ? -1 : 1; p.pan.setValueAtTime(-0.85 * side, t); p.pan.linearRampToValueAtTime(0.85 * side, t + dur * 0.75);
  o.connect(sh); sh.connect(f); f.connect(g); g.connect(p); p.connect(B.eng);
  o.start(t); o.stop(t + dur + 0.05);
  nz(0.7, 0.025 * intensity, { t: t + 0.1, f: 1400, q: 0.8, sweep: 500, dest: B.eng, pan: -0.6 * side, panTo: 0.6 * side, a: 0.25 });
}

// Test/diagnostic helper: RMS + peak of the master output and bus states
export function audioDebug() {
  if (!ctx) return { ctx: false };
  const a = B.analyser, d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
  let rms = 0, peak = 0; for (const v of d) { rms += v * v; peak = Math.max(peak, Math.abs(v)); }
  const fd = new Float32Array(a.frequencyBinCount); a.getFloatFrequencyData(fd);
  let bi = 0; for (let i = 3; i < fd.length; i++) if (fd[i] > fd[bi]) bi = i;
  return { state: ctx.state, rms: Math.sqrt(rms / d.length), peak, peakHz: (bi * ctx.sampleRate) / a.fftSize, mood: music.mood, song: music.cur?.name, section: music.cur?.section?.name, songs: music.songs.length, engine: engine ? { key: engine.key, gear: engine.gear, thr: +engine.thr.toFixed(2), boost: +engine.boost.toFixed(2) } : null, paddock: !!ambience.paddock, scene };
}
export function audioSpectrum(out) { if (!ctx) return null; const a = B.analyser; const fd = out || new Uint8Array(a.frequencyBinCount); a.getByteFrequencyData(fd); return fd; }
