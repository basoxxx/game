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
//                     throttle (0..1), slip (0..1 tyre squeal),
//                     view ('onboard'|'cockpit'|'chase'|'tv'|'heli'), surface ('gravel'|'tarmac') }
//   engineStart(cat): formula | junior | endurance (hypercar) | gt | rally
//   engineView(mode): camera mix for the engine (same values as opts.view)
//   passBy(intensity, cat, { speed km/h, dist m, cls: 'gt', side }) — doppler pass-by
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
      // bus → duck (sidechain-style ducking under important sounds) → master
      for (const k of ['music', 'sfx', 'eng', 'amb']) {
        B[k] = ctx.createGain(); B[k].gain.value = 0;
        if (k === 'sfx') { B[k].connect(B.master); continue; }
        B[k + 'Duck'] = ctx.createGain(); B[k].connect(B[k + 'Duck']); B[k + 'Duck'].connect(B.master);
      }
      // post-fader reverb sends (their gain follows the bus volume)
      B.musicRev = ctx.createGain(); B.musicRev.connect(B.rev);
      B.sfxRev = ctx.createGain(); B.sfxRev.connect(B.rev);
      B.engRev = ctx.createGain(); B.engRev.connect(B.rev);
      B.musicRev.gain.value = 0; B.sfxRev.gain.value = 0; B.engRev.gain.value = 0;
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
  const ev = fx && s.engineSound !== false ? clamp(s.engineVol ?? 0.85, 0, 1) : 0;
  setG(B.eng, ev); setG(B.engRev, ev);
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
    const t = now(); duck(0.25, 0.6);
    [880, 1108.7, 1318.5].forEach((f, i) => { bell(f, t + i * 0.07, 0.45, 0.04, { ratio: 4, index: 0.9, rev: 0.3, pan: (i - 1) * 0.3 }); osc('sine', f / 2, t + i * 0.07, 0.2, 0.015); });
  },
  // start lights: clean "dash" beeps
  beep: () => { const t = now(); osc('square', 880, t, 0.24, 0.035, { cut: 2600 }); osc('sine', 880, t, 0.28, 0.06); },
  go: () => { const t = now(); duck(0.35, 0.8); osc('square', 1320, t, 0.5, 0.04, { cut: 3200 }); osc('sine', 1320, t, 0.6, 0.07); crowdCheer(0.8); },
  win: () => {
    const t = now(); duck(0.5, 2.2);
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
    duck(0.45, 1.6, ['music', 'amb', 'eng']);
    osc('square', 1650, t + 0.015, 0.03, 0.014, { cut: 2600 });
    osc('sine', 120, t, 0.03, 0.03);
    radioChatter(t, 1.3, 0, B.sfx);
  },
  // pit stop: four wheel guns off, wheels swapped, guns on, jack drop
  pit: () => {
    const c = ac(); if (!c) return; const t = c.currentTime;
    duck(0.3, 2, ['music']);
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
    duck(0.45, 0.7, ['music', 'amb']);
    osc('sine', 95, t, 0.4, 0.22, { slide: 0.4 });
    nz(0.55, 0.22, { type: 'lowpass', f: 1800, q: 0.8, sweep: 250, a: 0.002 });
    nz(0.3, 0.12, { f: 900, q: 1.5, sweep: 400 });
    [523, 1307, 2210, 3180].forEach((f, i) => osc('sine', f * rnd(0.97, 1.03), t + 0.01, 0.25 + i * 0.05, 0.025, { pan: rnd(-0.5, 0.5) }));
    for (let i = 0; i < 9; i++) nz(0.03, rnd(0.01, 0.03), { t: t + 0.12 + Math.random() * 0.7, f: rnd(2500, 6000), q: 6, pan: rnd(-0.8, 0.8) });
    crowdCheer(0.5);
  },
  coin: () => { const t = now(); bell(987.8, t, 0.25, 0.04, { ratio: 3, index: 1.5 }); bell(1318.5, t + 0.08, 0.6, 0.045, { ratio: 3, index: 1.5, rev: 0.3 }); nz(0.05, 0.02, { type: 'highpass', f: 7000 }); },
  levelup: () => {
    const t = now(); duck(0.35, 1);
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { pluck(f, t + i * 0.065, 0.4, 0.035, (i - 2.5) * 0.15, B.sfx); });
    bell(2093, t + 0.4, 1.2, 0.03, { ratio: 2, rev: 0.5 });
    nz(0.9, 0.018, { t: t + 0.35, type: 'highpass', f: 8000, a: 0.2, rev: 0.4 });
  },
  cheer: () => crowdCheer(1),
  // stadium PA: chime + announcer-like voice (for race start / finish / safety car moments)
  announce: () => { const t = now(); duck(0.3, 2.4, ['music']); paTones(t, 1.6); announcer(t + 0.85, rnd(1.6, 2.6), B.sfx, 0.02, true); },
  // title-screen hit: sub drop + crash + wide A-minor brass chord
  sting: () => {
    const t = now(); duck(0.5, 1.4);
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
// pre-rendered textures (built once): applause (many hand claps) and rain drops hitting bodywork
function makeApplause(c, secs = 3) {
  const len = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate), L = b.getChannelData(0), R = b.getChannelData(1);
  const n = Math.floor(secs * 140), cl = Math.floor(c.sampleRate * 0.012);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * (len - cl)), pan = Math.random(), amp = 0.25 + Math.random() * 0.75, lpK = 0.3 + Math.random() * 0.6;
    let lp = 0;
    for (let i = 0; i < cl; i++) { lp += ((Math.random() * 2 - 1) - lp) * lpK; const v = lp * amp * Math.exp(-i / (cl * 0.22)); L[at + i] += v * (1 - pan); R[at + i] += v * pan; }
  }
  return b;
}
function makeDrops(c, secs = 2) {
  const len = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), n = Math.floor(secs * 90), dl = Math.floor(c.sampleRate * 0.02);
    for (let k = 0; k < n; k++) {
      const at = Math.floor(Math.random() * (len - dl)), f = 1400 + Math.random() * 4200, amp = 0.15 + Math.random() * 0.85, w = (2 * Math.PI * f) / c.sampleRate;
      for (let i = 0; i < dl; i++) d[at + i] += Math.sin(w * i * (1 + i / dl * 0.4)) * amp * Math.exp(-i / (c.sampleRate * 0.0025)) + (i < 30 ? (Math.random() * 2 - 1) * amp * 0.5 : 0);
    }
  }
  return b;
}
let applauseBuf = null, dropsBuf = null;
// Ducking: important sounds push music / ambience / engines down for a moment
export function duck(depth = 0.5, hold = 0.6, which = ['music', 'amb']) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const k of which) {
    const g = B[k + 'Duck']?.gain; if (!g) continue;
    const lvl = k === 'music' ? 1 - depth : 1 - depth * 0.6;
    g.cancelScheduledValues(t); g.setTargetAtTime(Math.max(0.05, lvl), t, 0.03); g.setTargetAtTime(1, t + hold, 0.35);
  }
}
const ambience = {
  crowd: null, rain: null, paddock: null, crowdLvl: 0, rainLvl: 0, windLvl: 0, timer: null, lastThunder: 0,
  ensure() {
    if (this.crowd || !ac()) return;
    const c = ctx;
    applauseBuf = applauseBuf || makeApplause(c); dropsBuf = dropsBuf || makeDrops(c);
    // crowd murmur: three bands of pink noise with slow, independent swells
    const mk = (f, q, base) => {
      const s = src(pinkBuf), fl = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      lfo.frequency.value = rnd(0.07, 0.2); lg.gain.value = base * 0.35; lfo.connect(lg);
      const amp = c.createGain(); amp.gain.value = 1; lg.connect(amp.gain);
      s.connect(fl); fl.connect(amp); amp.connect(g); g.connect(B.amb); s.start(0, Math.random()); lfo.start();
      return { g, base };
    };
    this.crowd = [mk(700, 0.7, 1), mk(1900, 1.6, 0.6), mk(350, 0.8, 0.5)];
    // cheer layers: a vowel-shaped roar ("ohhh → aaah") and applause, silent until a swell
    const rs0 = src(pinkBuf), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), roar = c.createGain();
    f1.type = 'bandpass'; f1.frequency.value = 500; f1.Q.value = 2.2; f2.type = 'bandpass'; f2.frequency.value = 1100; f2.Q.value = 3;
    roar.gain.value = 0; rs0.connect(f1); rs0.connect(f2); f1.connect(roar); f2.connect(roar); roar.connect(B.amb); sendTo(roar, B.rev, 0.25); rs0.start(0, Math.random());
    const ap = src(applauseBuf), apf = c.createBiquadFilter(), apg = c.createGain();
    apf.type = 'highpass'; apf.frequency.value = 700; apg.gain.value = 0; ap.connect(apf); apf.connect(apg); apg.connect(B.amb); sendTo(apg, B.rev, 0.2); ap.start();
    this.cheer = { f1, f2, roar, apg };
    // rain: hiss on the ground, drops on the bodywork, a low wash for heavy rain
    const rs = src(noiseBuf), rf = c.createBiquadFilter(), rf2 = c.createBiquadFilter(), rg = c.createGain();
    rf.type = 'highpass'; rf.frequency.value = 1800; rf2.type = 'lowpass'; rf2.frequency.value = 9000; rg.gain.value = 0;
    rs.connect(rf); rf.connect(rf2); rf2.connect(rg); rg.connect(B.amb); rs.start();
    const dr = src(dropsBuf), drg = c.createGain(), drf = c.createBiquadFilter(); drf.type = 'highpass'; drf.frequency.value = 900; drg.gain.value = 0;
    dr.playbackRate.value = 1.15; dr.connect(drf); drf.connect(drg); drg.connect(B.amb); dr.start();
    const rw = src(brownBuf), rwf = c.createBiquadFilter(), rwg = c.createGain(); rwf.type = 'lowpass'; rwf.frequency.value = 380; rwg.gain.value = 0;
    rw.connect(rwf); rwf.connect(rwg); rwg.connect(B.amb); rw.start(0, Math.random());
    this.rain = { rg, drg, rwg };
    // wind: pink noise with slow gusts (a moving band-pass and level)
    const ws = src(pinkBuf), wf = c.createBiquadFilter(), wg = c.createGain(), gust = c.createOscillator(), gg = c.createGain(), gf = c.createGain(), wamp = c.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.8; wg.gain.value = 0; wamp.gain.value = 0.7;
    gust.frequency.value = 0.09; gg.gain.value = 0.3; gf.gain.value = 160; gust.connect(gg); gg.connect(wamp.gain); gust.connect(gf); gf.connect(wf.frequency);
    ws.connect(wf); wf.connect(wamp); wamp.connect(wg); wg.connect(B.amb); ws.start(0, Math.random()); gust.start();
    this.wind = wg;
  },
  setCrowd(v) { if (this.crowd && Math.abs(v - this.crowdLvl) < 0.01) return; this.ensure(); if (!this.crowd) return; this.crowdLvl = v; for (const L of this.crowd) L.g.gain.setTargetAtTime(v * 0.05 * L.base, ctx.currentTime, 0.8); },
  setWind(v) { if (this.wind && Math.abs(v - this.windLvl) < 0.02) return; this.ensure(); if (!this.wind) return; this.windLvl = v; this.wind.gain.setTargetAtTime(v * 0.014, ctx.currentTime, 1.2); },
  setRain(v) {
    if (this.rain && Math.abs(v - this.rainLvl) < 0.01) return; this.ensure(); if (!this.rain) return;
    this.rainLvl = v; const t = ctx.currentTime, onCar = engine ? engine.V.rain : 0.3;
    this.rain.rg.gain.setTargetAtTime(v * 0.05, t, 0.8);
    this.rain.drg.gain.setTargetAtTime(v * 0.05 * onCar, t, 0.8);
    this.rain.rwg.gain.setTargetAtTime(Math.max(0, v - 0.4) * 0.06, t, 1);
    if (v > 0.75 && t - this.lastThunder > 40 && Math.random() < 0.5) { this.lastThunder = t; thunder(t + rnd(2, 8)); }
  },
  // paddock bed: distant generators + random pit-lane events (wheel guns, revs, PA, radio, tools)
  update() {
    if (!ctx || !unlocked) return;
    const want = PADDOCK_SCENES.has(scene) && !engine;
    if (want && !this.paddock) {
      const c = ctx, s = src(brownBuf), fl = c.createBiquadFilter(), g = c.createGain();
      fl.type = 'lowpass'; fl.frequency.value = 220; g.gain.value = 0; g.gain.setTargetAtTime(0.06, c.currentTime, 1.5);
      s.connect(fl); fl.connect(g); g.connect(B.amb); s.start();
      const hum = c.createOscillator(), hg = c.createGain(); hum.frequency.value = 100; hg.gain.value = 0; hg.gain.setTargetAtTime(0.0035, c.currentTime, 1.5); hum.connect(hg); hg.connect(B.amb); hum.start();
      this.paddock = { s, g, hum, hg, fl };
      this.setWind(0.25); this.setCrowd(0.12);
      const loop = () => { if (!this.paddock) return; this.paddockEvent(); this.timer = setTimeout(loop, rnd(2000, 6000)); };
      this.timer = setTimeout(loop, 1200);
    } else if (!want && this.paddock) {
      const p = this.paddock; this.paddock = null; clearTimeout(this.timer);
      const t = ctx.currentTime;
      p.g.gain.setTargetAtTime(0, t, 0.5); p.hg.gain.setTargetAtTime(0, t, 0.5);
      p.s.stop(t + 3); p.hum.stop(t + 3); releaseOnEnd(p.s, [p.s, p.fl, p.g, p.hum, p.hg]);
      if (!engine) { this.setWind(0); this.setCrowd(0); }
    }
  },
  paddockEvent() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, r = Math.random(), far = { dest: B.amb };
    if (r < 0.28) { // distant wheel gun rattle
      const p = rnd(-0.8, 0.8), n = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) nz(rnd(0.12, 0.3), 0.012, { ...far, t: t + i * rnd(0.15, 0.4), f: rnd(2400, 3400), q: 3, pan: p, voice: 'amb' });
    } else if (r < 0.48) { // an engine blipping in a garage down the lane
      const c = ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(), pn = c.createStereoPanner();
      o.type = 'sawtooth'; const f0 = rnd(90, 140); o.frequency.setValueAtTime(f0, t);
      const blips = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < blips; i++) { const tb = t + i * 0.55; o.frequency.setTargetAtTime(f0 * rnd(2.4, 3.6), tb, 0.06); o.frequency.setTargetAtTime(f0, tb + 0.22, 0.12); }
      fl.type = 'lowpass'; fl.frequency.value = 700; pn.pan.value = rnd(-0.9, 0.9);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.1); g.gain.setTargetAtTime(0.0001, t + blips * 0.55, 0.2);
      o.connect(fl); fl.connect(g); g.connect(pn); pn.connect(B.amb); o.start(t); o.stop(t + blips * 0.55 + 1.2); releaseOnEnd(o, [o, fl, g, pn]);
    } else if (r < 0.66) { // PA announcer: chime, then formant "speech" with a big stadium echo
      paTones(t, 0.8);
      announcer(t + 0.9, rnd(1.4, 3), B.amb, 0.011, true);
    } else if (r < 0.86) { // team radio chatter from a neighbouring garage
      radioChatter(t, 0.5, rnd(-0.8, 0.8), B.amb);
    } else { // tools / spanner clink
      bell(rnd(2200, 3400), t, 0.25, 0.006, { ratio: 2.7, index: 1, dest: B.amb, pan: rnd(-0.7, 0.7) });
      if (Math.random() < 0.5) bell(rnd(2200, 3400), t + rnd(0.15, 0.4), 0.2, 0.004, { ratio: 2.7, index: 1, dest: B.amb, pan: rnd(-0.7, 0.7) });
    }
  },
};
// formant-filtered noise with a syllable rhythm: reads as speech without words
function announcer(t, dur, dest, lvl, big = false) {
  const c = ctx, s = src(pinkBuf), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain(), pn = c.createStereoPanner();
  f1.type = 'bandpass'; f1.Q.value = 5; f2.type = 'bandpass'; f2.Q.value = 7; pn.pan.value = rnd(-0.4, 0.4);
  g.gain.setValueAtTime(0, t);
  for (let x = 0; x < dur; x += rnd(0.08, 0.2)) {
    const v = Math.random(); // vowel: low/high formant pairs
    f1.frequency.setValueAtTime(350 + v * 500, t + x); f2.frequency.setValueAtTime(900 + (1 - v) * 1400, t + x);
    if (Math.random() < 0.12) { x += rnd(0.12, 0.3); continue; }   // word gaps
    g.gain.setValueAtTime(lvl * rnd(0.4, 1), t + x); g.gain.setTargetAtTime(lvl * 0.04, t + x + 0.05, 0.03);
  }
  g.gain.setValueAtTime(0, t + dur);
  s.connect(f1); s.connect(f2); f1.connect(g); f2.connect(g); g.connect(pn); pn.connect(dest);
  if (big) sendTo(g, B.rev, 0.9);
  s.start(t, Math.random()); s.stop(t + dur + 0.1); releaseOnEnd(s, [s, f1, f2, g, pn]);
}
// two-tone stadium chime that precedes an announcement
function paTones(t, k = 1) {
  [[659.25, 0], [523.25, 0.32]].forEach(([f, d]) => bell(f, t + d, 1.1, 0.012 * k, { ratio: 2, index: 0.6, dest: B.amb, rev: 0.6 }));
}
// band-limited radio: squelch, chatter, release click
function radioChatter(t, k = 1, pan = 0, dest = B.sfx) {
  nz(0.06, 0.04 * k, { t, f: 2300, q: 3.5, dest, pan, voice: 'amb' });
  const c = ctx, s = src(noiseBuf), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), fm = c.createBiquadFilter(), g = c.createGain(), dist = c.createWaveShaper(), pn = c.createStereoPanner();
  hp.type = 'highpass'; hp.frequency.value = 450; lp.type = 'lowpass'; lp.frequency.value = 2800; fm.type = 'bandpass'; fm.Q.value = 4;
  dist.curve = distCurve || (distCurve = curve(6)); pn.pan.value = pan;
  const dur = rnd(0.8, 1.8);
  g.gain.setValueAtTime(0, t + 0.06);
  for (let x = 0.06; x < dur; x += rnd(0.07, 0.16)) { fm.frequency.setValueAtTime(rnd(600, 1800), t + x); g.gain.setValueAtTime(0.02 * k * rnd(0.4, 1), t + x); g.gain.setTargetAtTime(0.002 * k, t + x + 0.04, 0.03); }
  g.gain.setValueAtTime(0, t + dur);
  s.connect(fm); fm.connect(dist); dist.connect(hp); hp.connect(lp); lp.connect(g); g.connect(pn); pn.connect(dest);
  s.start(t, Math.random()); s.stop(t + dur + 0.05); releaseOnEnd(s, [s, fm, dist, hp, lp, g, pn]);
  nz(0.05, 0.03 * k, { t: t + dur, f: 2600, q: 3, dest, pan, voice: 'amb' });
}
// distant thunder roll in heavy rain
function thunder(t) {
  nz(rnd(3, 5), 0.05, { t, type: 'lowpass', f: 260, q: 0.5, a: 0.6, buf: brownBuf, dest: B.amb, pan: rnd(-0.5, 0.5), voice: 'amb' });
  nz(0.6, 0.02, { t: t + 0.2, type: 'lowpass', f: 900, sweep: 200, a: 0.05, dest: B.amb, voice: 'amb' });
}
// crowd swell: roar opens from "ohh" to "aah", applause, whistles, an air horn on big moments
export function crowdCheer(amount = 1) {
  if (!ctx || !unlocked) return;
  ambience.ensure(); if (!ambience.crowd) return;
  const t = ctx.currentTime, base = Math.max(ambience.crowdLvl, 0.15), hold = 0.9 + amount * 1.6;
  for (const L of ambience.crowd) {
    const g = L.g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(Math.min(1.5, base + amount) * 0.07 * L.base, t, 0.25); g.setTargetAtTime(ambience.crowdLvl * 0.05 * L.base, t + hold, 0.9);
  }
  const C = ambience.cheer;
  C.roar.gain.cancelScheduledValues(t); C.roar.gain.setTargetAtTime(0.05 * amount, t, 0.3); C.roar.gain.setTargetAtTime(0, t + hold * 0.8, 0.8);
  C.f1.frequency.cancelScheduledValues(t); C.f1.frequency.setValueAtTime(420, t); C.f1.frequency.linearRampToValueAtTime(720, t + 0.8);
  C.f2.frequency.cancelScheduledValues(t); C.f2.frequency.setValueAtTime(850, t); C.f2.frequency.linearRampToValueAtTime(1250, t + 0.8);
  C.apg.gain.cancelScheduledValues(t); C.apg.gain.setTargetAtTime(0.09 * amount, t + 0.25, 0.4); C.apg.gain.setTargetAtTime(0, t + hold + 0.4, 1);
  for (let i = 0; i < Math.round(4 * amount); i++) { // whistles in the stands
    const tt = t + rnd(0.1, 1.5), f = rnd(1800, 2800);
    osc('sine', f, tt, rnd(0.2, 0.45), 0.005 * amount, { slide: rnd(1.1, 1.4), dest: B.amb, pan: rnd(-0.8, 0.8), voice: 'amb' });
  }
  if (amount >= 0.8) { // air horn
    const tt = t + rnd(0.3, 1), p = rnd(-0.7, 0.7);
    for (const f of [415, 523]) osc('sawtooth', f * rnd(0.99, 1.01), tt, rnd(0.6, 1.1), 0.004, { cut: 1600, dest: B.amb, pan: p, a: 0.03, voice: 'amb' });
  }
}

// ---------------------------------------------------------------------------
// ENGINES — engine-order synthesis per category
// The oscillators run at the 4-stroke CYCLE rate (rpm/120), so every harmonic k
// is an engine order: firing orders (k = cyl·m) carry the note, half orders give
// the V8 burble / four-pot gargle, small irregular orders the mechanical texture
// (each bank gets its own seed). On top: combustion noise amplitude-modulated at
// the firing rate, induction roar, turbo whistle + flutter, hybrid ERS whine,
// straight-cut gearbox whine, overrun crackle, anti-lag bangs, up/down-shift
// logic with throttle blips, tyre squeal, wind, gravel and spray. A camera mix
// (onboard / chase / tv / heli) rebalances the layers; pass-bys use a physical
// doppler + distance + air-absorption model.
// ---------------------------------------------------------------------------
const ENG = {
  // F1-like 1.6 V6 turbo hybrid: very high revs, smooth even firing, screaming top end, ERS whine, seamless shifts
  formula:   { cyl: 6, idle: 5000, red: 12600, gears: 8, top: 345, gain: 0.15, half: 0.06, irr: 0.04, decay: 0.8, seed: 3, sub: 0.05, rough: 0.03, drive: 1.5, cut: [1500, 9500], body: 1.9, scream: 6, turbo: 0.5, turboF: [5600, 10500], hybrid: 1, intake: 0.2, pops: 0.35, antilag: 0, blip: 1, cutT: 0.018, whine: 0.5 },
  // F2-like 3.4 V6 turbo: lower revs, rawer, bigger shift cuts, more crackle, no hybrid
  junior:    { cyl: 6, idle: 4000, red: 9000, gears: 6, top: 300, gain: 0.16, half: 0.18, irr: 0.12, decay: 0.75, seed: 7, sub: 0.1, rough: 0.08, drive: 2, cut: [1100, 6800], body: 1.7, scream: 3, turbo: 0.75, turboF: [3600, 7600], hybrid: 0, intake: 0.3, pops: 0.6, antilag: 0, blip: 1, cutT: 0.05, whine: 0.7 },
  // LMH/LMDh hypercar: twin-turbo V8 hybrid, deep and smooth, hybrid hum on top
  endurance: { cyl: 8, idle: 3400, red: 9000, gears: 7, top: 340, gain: 0.17, half: 0.3, irr: 0.06, decay: 0.95, seed: 11, sub: 0.2, rough: 0.06, drive: 1.7, cut: [900, 6200], body: 1.6, scream: 1.5, turbo: 0.45, turboF: [4200, 8600], hybrid: 0.55, intake: 0.25, pops: 0.45, antilag: 0, blip: 1, cutT: 0.03, whine: 0.45 },
  // GT3: big naturally aspirated cross-plane V8, lumpy burble, loud overrun
  gt:        { cyl: 8, idle: 1900, red: 7800, gears: 6, top: 290, gain: 0.18, half: 0.85, irr: 0.15, decay: 1.05, seed: 5, sub: 0.38, rough: 0.14, drive: 2.2, cut: [700, 5000], body: 1.4, scream: -1, turbo: 0, turboF: [3000, 6000], hybrid: 0, intake: 0.35, pops: 1, antilag: 0, blip: 1.3, cutT: 0.06, whine: 0.3 },
  // Rally1-like 1.6 turbo four: gravelly, big whistle, anti-lag bangs and wastegate flutter
  rally:     { cyl: 4, idle: 3000, red: 7800, gears: 5, top: 200, gain: 0.18, half: 0.5, irr: 0.2, decay: 0.8, seed: 13, sub: 0.22, rough: 0.16, drive: 2.4, cut: [700, 4800], body: 1.5, scream: -1, turbo: 1.4, turboF: [2600, 6800], hybrid: 0, intake: 0.4, pops: 1, antilag: 1, blip: 1.2, cutT: 0.04, whine: 1, gravel: 1 },
  // Scontro Totale cars
  banger:    { cyl: 8, idle: 850, red: 6000, gears: 7, top: 200, gain: 0.14, half: 0.9, irr: 0.25, decay: 1.2, seed: 17, sub: 0.6, rough: 0.35, drive: 2.8, cut: [380, 3000], body: 1.3, scream: -3, turbo: 0, turboF: [3000, 6000], hybrid: 0, intake: 0.3, pops: 0.7, antilag: 0, blip: 0.6, cutT: 0.07, whine: 0.2 },
  hatch:     { cyl: 4, idle: 900, red: 7000, gears: 6, top: 180, gain: 0.18, half: 0.45, irr: 0.2, decay: 0.9, seed: 19, sub: 0.22, rough: 0.2, drive: 2.2, cut: [500, 3800], body: 1.5, scream: -2, turbo: 0.3, turboF: [3000, 6500], hybrid: 0, intake: 0.4, pops: 0.45, antilag: 0, blip: 0.6, cutT: 0.05, whine: 0.3 },
};
// camera mixes: how much induction / gearbox / wind the microphone hears, distance filter, reverb, level
const VIEWS = {
  onboard: { intake: 1.8, whine: 1.7, wind: 1.6, lp: 15000, rev: 0.02, gain: 1, rain: 1.4 },
  chase:   { intake: 1, whine: 0.8, wind: 1, lp: 12000, rev: 0.06, gain: 1, rain: 1 },
  tv:      { intake: 0.45, whine: 0.15, wind: 0.35, lp: 6500, rev: 0.2, gain: 0.85, rain: 0.6 },
  heli:    { intake: 0.2, whine: 0, wind: 0.2, lp: 2600, rev: 0.32, gain: 0.5, rain: 0.4 },
};
VIEWS.cockpit = VIEWS.onboard; VIEWS.auto = VIEWS.tv;
let engView = 'chase';
// order spectrum for one bank of an engine, as a PeriodicWave on the cycle frequency
function engineWave(P, bank = 0) {
  const id = `eng:${P.cyl}:${P.seed + bank}:${P.half}:${P.irr}:${P.decay}`;
  if (WAVES[id]) return WAVES[id];
  const K = 128, re = new Float32Array(K + 1), im = new Float32Array(K + 1), half = P.cyl / 2;
  let s = (P.seed + bank * 31) * 7919 + 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 1; k <= K; k++) {
    const m = Math.max(0.5, k / P.cyl);
    let a;
    if (k % P.cyl === 0) a = Math.pow(m, -P.decay);
    else if (k % half === 0) a = P.half * Math.pow(m, -P.decay);
    else a = P.irr * (0.3 + 0.7 * r()) * Math.pow(m, -P.decay - 0.2);
    const ph = r() * Math.PI * 2;
    re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph);
  }
  return (WAVES[id] = ctx.createPeriodicWave(re, im));
}
// disconnect a group of nodes once their source has finished (no node leaks)
function releaseOnEnd(srcNode, nodes) {
  srcNode.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* */ } } nodes.length = 0; };
}
let engine = null;
export function engineView(mode) {
  if (!VIEWS[mode]) return;
  engView = mode;
  const e = engine; if (!e || !ctx) return;
  const V = (e.V = VIEWS[mode]), t = ctx.currentTime;
  e.cam.frequency.setTargetAtTime(V.lp, t, 0.12);
  e.revG.gain.setTargetAtTime(V.rev, t, 0.12);
  e.viewG.gain.setTargetAtTime(V.gain, t, 0.12);
  if (ambience.rain) { const v = ambience.rainLvl; ambience.rainLvl = -1; ambience.setRain(v); }   // drops on the car follow the camera
}
export function engineStart(cat = 'formula') {
  const st = getSettings();
  if (st.sound === false || st.engineSound === false) return;
  const c = ac(); if (!c || engine) return;
  const key = scene === 'derby' ? (cat === 'rally' ? 'hatch' : 'banger') : ENG[cat] ? cat : 'formula';
  const P = ENG[key];
  const t = c.currentTime, N = [];
  const G = (v) => { const g = c.createGain(); g.gain.value = v; N.push(g); return g; };
  const F = (type, f, q = 0.7) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; N.push(n); return n; };
  const O = (type) => { const o = c.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); N.push(o); return o; };
  const S = (buf) => { const s = src(buf); N.push(s); return s; };
  // output chain: shift-cut gain → camera distance filter → view level → engine bus (+ reverb send)
  const out = G(0.0001); out.gain.setTargetAtTime(P.gain * 0.5, t, 0.4);
  const cam = F('lowpass', 12000, 0.5), viewG = G(1), revG = G(0.06);
  out.connect(cam); cam.connect(viewG); viewG.connect(B.eng); viewG.connect(revG); revG.connect(B.engRev);
  // engine core: two banks on the cycle frequency + firing-order sub, cycle roughness
  const amp = G(1 - P.rough);
  const o1 = O(engineWave(P, 0)), o2 = O(engineWave(P, 1)); o2.detune.value = 7;
  const g2 = G(0.5); o1.connect(amp); o2.connect(g2); g2.connect(amp);
  const sub = O('sine'), subG = G(P.sub); sub.connect(subG); subG.connect(amp);
  const lfo = O('triangle'), lfoG = G(P.rough); lfo.connect(lfoG); lfoG.connect(amp.gain);
  const drive = G(P.drive), sh = c.createWaveShaper(); sh.curve = curve(1.8); sh.oversample = '2x'; N.push(sh);
  const lp = F('lowpass', P.cut[0], 0.9);
  const body = F('peaking', 1000, 1.4); body.gain.value = 5;
  const hs = F('highshelf', 2600); hs.gain.value = P.scream;
  const post = G(0.55);
  amp.connect(drive); drive.connect(sh); sh.connect(lp); lp.connect(body); body.connect(hs); hs.connect(post); post.connect(out);
  // combustion noise: band-passed noise amplitude-modulated at the firing rate
  const ns = S(noiseBuf), nf = F('bandpass', 900, 1.4), cn = G(0.5), am = O('sine'), amG = G(0.5), ng = G(0);
  am.connect(amG); amG.connect(cn.gain); ns.connect(nf); nf.connect(cn); cn.connect(ng); ng.connect(lp);
  // induction roar (what the onboard camera hears): the shaped core through a boomy band
  const ib = F('bandpass', 600, 0.9), ig = G(0); sh.connect(ib); ib.connect(ig); ig.connect(out);
  // turbo: compressor whistle (blade-pass + harmonic) and airy intake hiss
  const tb = O('sine'), tb2 = O('sine'), tbg = G(0), tb2g = G(0.35); tb.connect(tbg); tb2.connect(tb2g); tb2g.connect(tbg); tbg.connect(out);
  const ta = S(noiseBuf), taf = F('bandpass', 4000, 6), tag = G(0); ta.connect(taf); taf.connect(tag); tag.connect(out);
  // hybrid ERS whine (MGU-K partials) and straight-cut gearbox whine
  const hy = O('sine'), hy2 = O('triangle'), hyg = G(0), hy2g = G(0.4); hy.connect(hyg); hy2.connect(hy2g); hy2g.connect(hyg); hyg.connect(out);
  const gw = O('sine'), gwg = G(0); gw.connect(gwg); gwg.connect(out);
  // layers that do not follow the engine's shift cuts: tyres, wind, gravel, spray
  const sq = S(noiseBuf), sqf = F('bandpass', 1750, 14), sqf2 = F('bandpass', 2450, 10), sqg = G(0), wob = O('sine'), wobg = G(90);
  wob.frequency.value = 7; wob.connect(wobg); wobg.connect(sqf.frequency);
  sq.connect(sqf); sq.connect(sqf2); sqf.connect(sqg); sqf2.connect(sqg); sqg.connect(cam);
  const wd = S(pinkBuf), wdf = F('bandpass', 500, 0.5), wdg = G(0); wd.connect(wdf); wdf.connect(wdg); wdg.connect(B.eng);
  const gv = S(brownBuf), gvf = F('lowpass', 520, 0.7), gvg = G(0); gv.connect(gvf); gvf.connect(gvg); gvg.connect(cam);
  const sp = S(noiseBuf), spf = F('highpass', 2600, 0.5), spg = G(0); sp.connect(spf); spf.connect(spg); spg.connect(cam);
  const oscs = [o1, o2, sub, lfo, am, tb, tb2, hy, hy2, gw, wob], srcs = [ns, ta, sq, wd, gv, sp];
  oscs.forEach((o) => o.start(t)); srcs.forEach((s) => s.start(t, Math.random()));
  engine = {
    P, key, N, out, cam, viewG, revG, o1, o2, sub, lfo, am, drive, lp, body, nf, ng, ib, ig, tb, tb2, tbg, taf, tag, hy, hy2, hyg, gw, gwg, sqg, wdg, gvg, spg,
    oscs, srcs, V: VIEWS[engView], gear: 1, kmh: 0, rpm: P.idle, thr: 0.3, boost: 0, lastT: t, lastPop: 0, lastShift: 0, alUntil: 0, nextAL: 0, blipT: 0, liftT: 0,
  };
  engineView(engView);
  setEngineFreq(engine, P.idle, t);
  ambience.update();
}
function setEngineFreq(e, rpm, t, tc = 0.035) {
  const P = e.P, fc = rpm / 120, f = fc * P.cyl;
  e.o1.frequency.setTargetAtTime(fc, t, tc); e.o2.frequency.setTargetAtTime(fc, t, tc);
  e.sub.frequency.setTargetAtTime(f / 2, t, tc);
  e.lfo.frequency.setTargetAtTime(fc, t, tc);
  e.am.frequency.setTargetAtTime(f, t, tc);
  e.body.frequency.setTargetAtTime(Math.min(4200, f * P.body), t, 0.05);
  e.nf.frequency.setTargetAtTime(Math.min(6500, f * 3.2), t, 0.05);
  e.ib.frequency.setTargetAtTime(Math.min(1800, f * 1.1), t, 0.05);
  e.hy.frequency.setTargetAtTime((rpm / 60) * 7.5, t, 0.05); e.hy2.frequency.setTargetAtTime((rpm / 60) * 11.2, t, 0.05);
  e.gw.frequency.setTargetAtTime((rpm / 60) * (2.1 + e.gear * 0.17), t, tc);
}
// speed01: 0..1 of the category top speed.
// opts: { rain, crowd, rpm (0..1), throttle (0..1), slip (0..1), view ('onboard'|'chase'|'tv'|'heli'), surface ('gravel'|'tarmac') }
export function engineSet(speed01, opts = {}) {
  if (!engine || !ctx) return;
  const e = engine, P = e.P, t = ctx.currentTime;
  if (opts.view && opts.view !== engView) engineView(opts.view);
  const V = e.V;
  const dt = clamp(t - e.lastT, 0.001, 0.25); e.lastT = t;
  const kmh = Math.max(0, speed01) * P.top;
  const stopped = opts.rpm == null && speed01 <= 0.01;
  // gearbox: equal speed bands per gear, upshift at the top of the band, downshift with hysteresis
  const band = P.top / P.gears;
  const ideal = Math.min(P.gears, Math.max(1, Math.floor(kmh / band) + 1));
  let gear = e.gear;
  if (opts.rpm != null || stopped) gear = opts.rpm != null ? ideal : 1;
  else if (ideal > gear) gear = ideal;
  else while (gear > 1 && kmh < (gear - 1) * band - band * 0.12) gear--;
  const lo = (gear - 1) * band * 0.78, hi = gear * band;
  const frac = opts.rpm != null ? clamp(opts.rpm, 0, 1) : clamp((kmh - lo) / (hi - lo), 0, 1);
  let rpm = stopped ? P.idle * 0.85 : P.idle + (P.red - P.idle) * frac;
  if (stopped) rpm *= 1 + Math.sin(t * 9) * 0.015;            // idle hunting
  // throttle estimate from acceleration (unless given)
  const acc = (kmh - e.kmh) / dt; e.kmh = kmh;
  const thrRaw = opts.throttle != null ? opts.throttle : stopped ? 0.08 : clamp(0.6 + acc / 45, 0, 1);
  const braking = opts.throttle != null ? opts.throttle < 0.1 && !stopped : acc < -25;
  const prevThr = e.thr;
  e.thr += (thrRaw - e.thr) * Math.min(1, dt * 7);
  const thr = e.thr;
  let tc = 0.035;
  if (gear !== e.gear && !stopped && opts.rpm == null) {
    if (gear > e.gear && t - e.lastShift > 0.12) {
      // upshift: torque cut (seamless on the hybrids, a proper bark on the others), fast rpm drop
      e.lastShift = t; tc = 0.012;
      e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(P.gain * 0.22, t, 0.008); e.out.gain.setTargetAtTime(P.gain * (0.55 + 0.45 * thr), t + P.cutT, 0.025);
      if (P.antilag) pop(e, t + 0.015, 1.2); else if (P.pops > 0.5 && Math.random() < 0.6) pop(e, t + 0.02, 0.7);
    } else if (gear < e.gear) {
      // downshift: the throttle blip
      e.blipT = t; tc = 0.015;
      e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(P.gain * 0.85 * P.blip, t, 0.01); e.out.gain.setTargetAtTime(P.gain * 0.4, t + 0.07, 0.04);
      setEngineFreq(e, Math.min(P.red * 1.02, rpm * 1.1), t, 0.01);
      if (P.pops > 0.3 && Math.random() < P.pops) for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) pop(e, t + 0.07 + i * rnd(0.03, 0.08), 0.55);
      e.lastShift = t;
    }
  }
  e.gear = gear;
  // lift-off: overrun crackle, turbo blow-off / flutter, anti-lag window
  if (prevThr > 0.55 && thr < 0.45 && rpm > P.idle * 1.4) {
    e.liftT = t;
    const n = Math.round(P.pops * 4 * Math.random()) + (P.antilag ? 2 : 0);
    for (let i = 0; i < n; i++) pop(e, t + 0.05 + i * rnd(0.05, 0.13), P.antilag ? 1 : 0.6);
    if (P.turbo > 0.3 && e.boost > 0.35) blowOff(e, t);
    if (P.antilag) e.alUntil = t + 1.8;
  }
  if (P.antilag && t < e.alUntil && thr < 0.4 && !stopped && t >= e.nextAL) { pop(e, t + 0.01, rnd(0.9, 1.4)); e.nextAL = t + rnd(0.07, 0.26); }
  if (t - e.blipT > 0.07) setEngineFreq(e, rpm, t, tc);
  e.rpm = rpm;
  const load = stopped ? 0.35 : 0.42 + 0.58 * thr;
  e.lp.frequency.setTargetAtTime(P.cut[0] + (P.cut[1] - P.cut[0]) * (0.2 + 0.8 * thr) * (0.35 + 0.65 * frac), t, 0.06);
  e.drive.gain.setTargetAtTime(P.drive * (0.6 + thr * 0.8), t, 0.06);
  e.ng.gain.setTargetAtTime(P.intake * (0.15 + thr * frac) * 0.6, t, 0.08);
  e.ig.gain.setTargetAtTime(P.intake * V.intake * (0.05 + 0.25 * thr * (0.4 + frac)), t, 0.08);
  if (t - e.lastShift > 0.09) e.out.gain.setTargetAtTime(P.gain * load, t, 0.08);
  // turbo spools with lag; anti-lag keeps it lit off throttle
  const boostWant = stopped ? 0 : Math.max(thr * (0.3 + 0.7 * frac), P.antilag && t < e.alUntil ? 0.7 : 0);
  e.boost += (boostWant - e.boost) * Math.min(1, dt * (boostWant > e.boost ? 1.6 : 3.5));
  const [tf0, tf1] = P.turboF;
  e.tb.frequency.setTargetAtTime(tf0 + e.boost * (tf1 - tf0), t, 0.08); e.tb2.frequency.setTargetAtTime((tf0 + e.boost * (tf1 - tf0)) * 1.5, t, 0.08);
  e.tbg.gain.setTargetAtTime(P.turbo * e.boost * e.boost * 0.01, t, 0.08);
  e.taf.frequency.setTargetAtTime(tf0 * 0.9 + e.boost * tf0, t, 0.1); e.tag.gain.setTargetAtTime(P.turbo * e.boost * 0.008, t, 0.1);
  // hybrid: ERS whine on deploy (low gears, full throttle) and loudest when harvesting under braking
  e.hyg.gain.setTargetAtTime(P.hybrid * (stopped ? 0.0015 : 0.003 + (braking ? 0.009 : 0) + thr * (1 - frac) * 0.003), t, 0.1);
  // straight-cut gearbox: whines with load and speed, heard mostly onboard
  e.gwg.gain.setTargetAtTime(stopped ? 0 : P.whine * V.whine * 0.004 * (0.3 + thr) * clamp(kmh / P.top + 0.2, 0, 1), t, 0.08);
  // tyres, wind, gravel, spray
  const sp01 = clamp(kmh / P.top, 0, 1), rain = opts.rain || 0;
  const slip = opts.slip != null ? clamp(opts.slip, 0, 1) : clamp((-acc - 70) / 180, 0, 0.6) * (rain > 0.3 ? 0.4 : 1);
  e.sqg.gain.setTargetAtTime(slip * 0.05, t, 0.05);
  e.wdg.gain.setTargetAtTime(sp01 * sp01 * 0.03 * V.wind, t, 0.2);
  const gravel = opts.surface ? (opts.surface === 'gravel' ? 1 : 0) : P.gravel || 0;
  e.gvg.gain.setTargetAtTime(gravel * Math.pow(sp01, 0.7) * 0.07, t, 0.15);
  if (gravel && sp01 > 0.05 && Math.random() < sp01 * dt * 16) stone(t + Math.random() * 0.02, sp01);
  e.spg.gain.setTargetAtTime(rain * sp01 * 0.03 * V.rain, t, 0.2);
  ambience.setCrowd(opts.crowd || 0);
  ambience.setRain(rain);
  ambience.setWind(0.3 + sp01 * 0.4);
  return gear;
}
// backfire / anti-lag bang: a sharp crack plus (for big ones) a low boom with a bit of space
function pop(e, t, k) {
  if (t - e.lastPop < 0.035) return; e.lastPop = t;
  const lvl = rnd(0.05, 0.12) * k * e.P.gain * 10 * (0.6 + 0.4 * e.V.gain);
  nz(rnd(0.008, 0.03), lvl, { t, f: rnd(350, 1300), q: 1.2, dest: B.eng, a: 0.001, voice: 'eng' });
  if (k > 0.9) {
    osc('sine', rnd(60, 100), t, 0.1, 0.07 * k, { slide: 0.45, dest: B.eng, voice: 'eng' });
    nz(0.12, lvl * 0.5, { t, type: 'lowpass', f: 900, sweep: 200, dest: B.engRev, a: 0.001, voice: 'eng' });
  }
}
// turbo blow-off: a dump-valve "pssh" and, on the rally car, the wastegate flutter
function blowOff(e, t) {
  const P = e.P, k = P.turbo * e.boost;
  nz(0.3, 0.022 * k, { t, f: 3200, q: 1.1, sweep: 1100, dest: B.eng, a: 0.008, voice: 'eng' });
  if (P.turbo > 1) for (let i = 0; i < 6; i++) nz(0.03, 0.03 * k * (1 - i / 7), { t: t + 0.02 + i * rnd(0.035, 0.05), f: rnd(1300, 2100), q: 2.5, dest: B.eng, a: 0.002, voice: 'eng' });
}
// a stone flicked into the wheel arch
function stone(t, sp) { nz(rnd(0.005, 0.014), rnd(0.01, 0.035) * sp, { t, type: 'bandpass', f: rnd(2500, 6500), q: rnd(3, 8), dest: B.eng, pan: rnd(-0.6, 0.6), voice: 'eng' }); }
export function engineStop() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  const t = ctx.currentTime;
  for (const g of [e.out, e.sqg, e.wdg, e.gvg, e.spg]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.2); }
  ambience.setCrowd(0); ambience.setRain(0); ambience.setWind(0);
  const end = t + 1.4;
  e.oscs.forEach((o) => { try { o.stop(end); } catch { /* */ } }); e.srcs.forEach((s) => { try { s.stop(end); } catch { /* */ } });
  releaseOnEnd(e.o1, e.N);
  ambience.update();
}

// Pass-by: the car's own engine voice on a straight line past the microphone.
// Doppler factor c/(c + radial velocity), 1/r level, air absorption (low-pass falls
// with distance), pan from the bearing. intensity 0..1 = how close it passes.
// o: { speed (km/h), dist (m), cls ('gt' | 'hypercar'), side (-1|1), dur }
const MAX_PASSBY = 3;
let lastPass = 0, passLive = 0;
export function passBy(intensity = 1, cat = 'formula', o = {}) {
  const st = getSettings(); if (st.sound === false || st.engineSound === false) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime; if (t - lastPass < 0.12 || passLive >= MAX_PASSBY) return; lastPass = t;
  let key = ENG[cat] ? cat : 'formula';
  if (o.cls === 'gt') key = 'gt'; else if (cat === 'endurance' && o.cls == null && Math.random() < 0.4) key = 'gt'; // mixed-class traffic
  const P = ENG[key];
  const v = (o.speed ?? P.top * rnd(0.7, 0.9)) / 3.6, d = o.dist ?? 2.5 + (1 - clamp(intensity, 0, 1)) * 26;
  const dur = o.dur ?? 2.6, tc = dur * 0.42, side = o.side ?? (Math.random() < 0.5 ? -1 : 1);
  const rpm0 = P.red * rnd(0.74, 0.86), rpm1 = P.red * rnd(0.88, 0.97);   // accelerating past
  const n = 96, fr = new Float32Array(n), gn = new Float32Array(n), cut = new Float32Array(n), pan = new Float32Array(n), air = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tau = (i / (n - 1)) * dur - tc, x = v * tau, r = Math.hypot(x, d), vr = (v * x) / r;
    const dop = 343 / (343 + vr), rpm = rpm0 + (rpm1 - rpm0) * (i / (n - 1));
    fr[i] = (rpm / 120) * dop;
    const lvl = Math.min(1, 3 / r) * (i === 0 || i === n - 1 ? 0.0001 : 1);
    gn[i] = Math.max(0.0001, 0.075 * lvl);
    air[i] = Math.max(0.0001, 0.03 * lvl * clamp(1.2 - r / 40, 0.15, 1));
    cut[i] = clamp(16000 / (1 + r / 7), 500, 15000);
    pan[i] = clamp((x / r) * 0.9 * side, -1, 1);
  }
  const N = [];
  const osc1 = c.createOscillator(); osc1.setPeriodicWave(engineWave(P, 0));
  const osc2 = c.createOscillator(); osc2.setPeriodicWave(engineWave(P, 1)); osc2.detune.value = 8;
  const m = c.createGain(); m.gain.value = 0.6;
  const sh = c.createWaveShaper(); sh.curve = curve(2.2);
  const hs = c.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 2600; hs.gain.value = P.scream;
  const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.Q.value = 0.6;
  const g = c.createGain(), p = c.createStereoPanner();
  const ns = src(noiseBuf), nf = c.createBiquadFilter(), ngn = c.createGain();
  nf.type = 'bandpass'; nf.frequency.value = 1100; nf.Q.value = 0.7;
  osc1.connect(m); osc2.connect(m); m.connect(sh); sh.connect(hs); hs.connect(lpf); lpf.connect(g); g.connect(p);
  ns.connect(nf); nf.connect(ngn); ngn.connect(p); p.connect(B.eng);
  const rv = c.createGain(); rv.gain.value = 0.12; g.connect(rv); rv.connect(B.engRev);
  N.push(osc1, osc2, m, sh, hs, lpf, g, p, ns, nf, ngn, rv);
  osc1.frequency.setValueCurveAtTime(fr, t, dur); osc2.frequency.setValueCurveAtTime(fr, t, dur);
  g.gain.setValueCurveAtTime(gn, t, dur); ngn.gain.setValueCurveAtTime(air, t, dur);
  lpf.frequency.setValueCurveAtTime(cut, t, dur); p.pan.setValueCurveAtTime(pan, t, dur);
  const end = t + dur + 0.02;
  osc1.start(t); osc2.start(t); ns.start(t, Math.random()); osc1.stop(end); osc2.stop(end); ns.stop(end);
  passLive++;
  osc1.onended = () => { passLive = Math.max(0, passLive - 1); for (const x of N) { try { x.disconnect(); } catch { /* */ } } };
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
