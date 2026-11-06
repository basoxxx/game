// Audio engine: procedural soundtrack, engine synthesis and sound effects (Web Audio)
import { getSettings } from '../engine/state.js';

let ctx = null, master = null, musicBus = null, sfxBus = null, engBus = null, ambBus = null, delay = null, noiseBuf = null;

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = ctx.createGain(); master.connect(comp);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      engBus = ctx.createGain(); engBus.connect(master);
      ambBus = ctx.createGain(); ambBus.connect(master);
      delay = ctx.createDelay(1); delay.delayTime.value = 0.36;
      const fb = ctx.createGain(); fb.gain.value = 0.32; const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
      delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  applyVolumes();
  return ctx;
}
export function applyVolumes() {
  if (!ctx) return;
  const s = getSettings();
  master.gain.value = s.sound ? s.volume : 0;
  musicBus.gain.value = s.music === false ? 0 : (s.musicVol ?? 0.55) * 0.5;
  sfxBus.gain.value = 1;
}
// unlock audio on first interaction (browser autoplay policy)
if (typeof window !== 'undefined') {
  const unlock = () => { ac(); music.kick(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
}

function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delayS = 0, bus = null) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delayS;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  env(g, t, 0.008, vol, dur);
  o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, type = 'bandpass', freq = 1000, q = 1, t0 = 0, bus = null, sweep = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + t0;
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  const g = c.createGain(); env(g, t, 0.005, vol, dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => tone(1500, 0.04, 'square', 0.025),
  hover: () => tone(2400, 0.025, 'sine', 0.01),
  ok: () => { tone(660, 0.1, 'triangle', 0.12); tone(990, 0.18, 'triangle', 0.1, 0, 0.08); },
  bad: () => { tone(300, 0.22, 'sawtooth', 0.06, -120); },
  notify: () => { tone(880, 0.08, 'sine', 0.1); tone(1320, 0.14, 'sine', 0.08, 0, 0.07); },
  beep: () => tone(880, 0.3, 'square', 0.06),
  go: () => tone(1320, 0.6, 'square', 0.07),
  win: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => { tone(f, 0.4, 'triangle', 0.1, 0, i * 0.11); tone(f / 2, 0.5, 'sawtooth', 0.03, 0, i * 0.11); }); },
  overtake: () => noise(0.5, 0.06, 'bandpass', 500, 2, 0, null, 2500),
  radio: () => { noise(0.08, 0.05, 'bandpass', 2500, 4); tone(1800, 0.05, 'square', 0.02, 0, 0.02); },
  pit: () => { for (let i = 0; i < 4; i++) noise(0.09, 0.1, 'highpass', 2500, 1, i * 0.1); },
  crash: () => { noise(0.7, 0.3, 'lowpass', 1200, 0.7, 0, null, -900); noise(0.25, 0.15, 'bandpass', 3000, 2, 0.05); },
  coin: () => { tone(988, 0.08, 'square', 0.05); tone(1318, 0.25, 'square', 0.05, 0, 0.08); },
  levelup: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.05, 0, i * 0.07)); },
};

// ---------------- ENGINE ----------------
let engine = null;
const ENG = {
  formula: { cyl: 6, idle: 4500, red: 12500, gears: 8, top: 345, gain: 0.05, cut: 2400, color: 'sawtooth' },
  endurance: { cyl: 8, idle: 3500, red: 9500, gears: 7, top: 340, gain: 0.055, cut: 1700, color: 'sawtooth' },
  rally: { cyl: 4, idle: 2500, red: 7800, gears: 6, top: 200, gain: 0.06, cut: 1500, color: 'square', turbo: true },
};
export function engineStart(cat = 'formula') {
  const st = getSettings();
  if (!st.sound || !st.engineSound) return;
  const c = ac(); if (!c || engine) return;
  const P = ENG[cat] || ENG.formula;
  const out = c.createGain(); out.gain.value = 0.0001; out.gain.exponentialRampToValueAtTime(P.gain, c.currentTime + 1);
  const shaper = c.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4); } shaper.curve = curve;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.cut; lp.Q.value = 1.4;
  const oscs = [1, 2, 0.5, 3].map((h, i) => { const o = c.createOscillator(); o.type = i === 0 ? P.color : i === 3 ? 'triangle' : 'sawtooth'; const g = c.createGain(); g.gain.value = [0.6, 0.3, 0.35, 0.12][i]; o.connect(g); g.connect(shaper); o.start(); return { o, h }; });
  const ns = c.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8; const ng = c.createGain(); ng.gain.value = 0.12; ns.connect(nf); nf.connect(ng); ng.connect(lp); ns.start();
  shaper.connect(lp); lp.connect(out); out.connect(engBus);
  let turbo = null;
  if (P.turbo) { const o = c.createOscillator(); o.type = 'sine'; const g = c.createGain(); g.gain.value = 0.0; o.connect(g); g.connect(out); o.start(); turbo = { o, g }; }
  // ambience: crowd + wind
  const cs = c.createBufferSource(); cs.buffer = noiseBuf; cs.loop = true; const cf = c.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 700; const cg = c.createGain(); cg.gain.value = 0.012; cs.connect(cf); cf.connect(cg); cg.connect(ambBus); cs.start();
  const rs = c.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true; const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 3000; const rg = c.createGain(); rg.gain.value = 0; rs.connect(rf); rf.connect(rg); rg.connect(ambBus); rs.start();
  engine = { P, out, oscs, lp, nf, ng, turbo, cg, rg, srcs: [ns, cs, rs], gear: 1, lastShift: 0 };
}
// speed01: 0..1 of top speed (or explicit kmh)
export function engineSet(speed01, opts = {}) {
  if (!engine || !ctx) return;
  const P = engine.P, t = ctx.currentTime;
  const kmh = Math.max(0, speed01) * P.top;
  // gearbox: equal speed bands per gear with overlap
  const band = P.top / P.gears;
  let gear = Math.min(P.gears, Math.max(1, Math.floor(kmh / band) + 1));
  const lo = (gear - 1) * band * 0.82, hi = gear * band;
  let frac = Math.min(1, Math.max(0, (kmh - lo) / (hi - lo)));
  const rpm = speed01 <= 0.01 ? P.idle * 0.6 : P.idle + (P.red - P.idle) * frac;
  if (gear !== engine.gear) { engine.gear = gear; engine.lastShift = t; }
  const f0 = (rpm / 60) * (P.cyl / 2) / 2;
  for (const { o, h } of engine.oscs) o.frequency.setTargetAtTime(f0 * h, t, 0.04);
  engine.lp.frequency.setTargetAtTime(P.cut * (0.5 + frac * 0.9), t, 0.08);
  engine.nf.frequency.setTargetAtTime(400 + frac * 1800, t, 0.1);
  const load = speed01 <= 0.01 ? 0.25 : 0.6 + frac * 0.4;
  engine.out.gain.setTargetAtTime(P.gain * load, t, 0.1);
  if (engine.turbo) { engine.turbo.o.frequency.setTargetAtTime(2500 + frac * 3500, t, 0.1); engine.turbo.g.gain.setTargetAtTime(frac * 0.04, t, 0.1); }
  engine.cg.gain.setTargetAtTime(0.01 + (opts.crowd || 0) * 0.02, t, 0.5);
  engine.rg.gain.setTargetAtTime((opts.rain || 0) * 0.05, t, 0.5);
  return gear;
}
export function engineStop() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  e.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); e.cg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); e.rg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  setTimeout(() => { try { e.oscs.forEach(({ o }) => o.stop()); e.srcs.forEach((s) => s.stop()); e.turbo?.o.stop(); } catch {} }, 900);
}

// ---------------- MUSIC ----------------
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
const MOODS = {
  menu: { bpm: 100, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], drums: 'half', arp: [0, 1, 2, 1, 2, 3, 2, 1], lead: true },
  manage: { bpm: 86, prog: [[50, 53, 57, 60], [55, 58, 62, 65], [48, 52, 55, 59], [53, 57, 60, 64]], drums: 'lofi', arp: [0, 2, 1, 3, 2, 1, 0, 2], lead: false },
  race: { bpm: 128, prog: [[45, 48, 52], [41, 45, 48], [43, 47, 50], [40, 43, 47]], drums: 'four', arp: [0, 1, 2, 3, 2, 1, 2, 3], lead: false, quiet: true },
  win: { bpm: 112, prog: [[48, 52, 55, 60], [53, 57, 60, 64], [55, 59, 62, 67], [48, 52, 55, 60]], drums: 'four', arp: [0, 2, 3, 2, 1, 2, 3, 2], lead: true },
};
const music = {
  mood: null, step: 0, next: 0, timer: null, gain: null,
  setMood(m) {
    if (m === this.mood) return;
    this.mood = m;
    if (!ctx) return;
    this.start();
  },
  kick() { if (this.mood && !this.timer) this.start(); },
  start() {
    const c = ac(); if (!c) return;
    if (this.gain) { const old = this.gain; old.gain.setTargetAtTime(0.0001, c.currentTime, 0.6); setTimeout(() => old.disconnect(), 3000); }
    this.gain = c.createGain(); this.gain.gain.value = 0.0001; this.gain.gain.setTargetAtTime(MOODS[this.mood]?.quiet ? 0.45 : 1, c.currentTime + 0.1, 0.8); this.gain.connect(musicBus);
    this.step = 0; this.next = c.currentTime + 0.15;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
  },
  tick() {
    if (!ctx || !this.mood) return;
    const M = MOODS[this.mood]; const spb = 60 / M.bpm / 4; // 16th notes
    while (this.next < ctx.currentTime + 0.12) { this.play(M, this.step, this.next, spb); this.step++; this.next += spb; }
  },
  play(M, step, t, spb) {
    const bar = Math.floor(step / 16) % M.prog.length;
    const chord = M.prog[bar];
    const s16 = step % 16;
    const g = this.gain;
    const voice = (freq, dur, type, vol, cut = 3000, out = g, attack = 0.01) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + attack); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(e); e.connect(out); o.start(t); o.stop(t + dur + 0.05);
      return e;
    };
    // pad on bar start
    if (s16 === 0) for (const n of chord) { voice(N(n + 12), spb * 16, 'sawtooth', 0.018, 1400, g, 0.6); voice(N(n + 12) * 1.004, spb * 16, 'sawtooth', 0.014, 1200, g, 0.6); }
    // bass
    const root = chord[0] - 12;
    if (M.drums === 'four' ? s16 % 2 === 0 : s16 % 4 === 0 || s16 === 10) voice(N(root), spb * 1.8, 'square', 0.05, 380 + (s16 % 4 === 0 ? 300 : 0));
    // arpeggio
    if (s16 % 2 === 0) { const n = chord[M.arp[(s16 / 2) % M.arp.length] % chord.length] + 24; const e = voice(N(n), spb * 1.6, 'triangle', 0.03, 4000); e.connect(delay); }
    // lead melody (menu/win)
    if (M.lead && s16 === 8 && bar % 2 === 1) voice(N(chord[2] + 24), spb * 6, 'square', 0.018, 2500).connect(delay);
    // drums
    const kick = () => { const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); const e = ctx.createGain(); e.gain.setValueAtTime(0.25, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(e); e.connect(g); o.start(t); o.stop(t + 0.3); };
    const hat = (v = 0.025) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const e = ctx.createGain(); e.gain.setValueAtTime(v, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); s.connect(f); f.connect(e); e.connect(g); s.start(t, Math.random()); s.stop(t + 0.06); };
    const snare = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const e = ctx.createGain(); e.gain.setValueAtTime(0.09, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); s.connect(f); f.connect(e); e.connect(g); s.start(t, Math.random()); s.stop(t + 0.2); };
    if (M.drums === 'four') { if (s16 % 4 === 0) kick(); if (s16 % 8 === 4) snare(); if (s16 % 2 === 1) hat(); }
    else if (M.drums === 'half') { if (s16 === 0 || s16 === 10) kick(); if (s16 === 8) snare(); if (s16 % 4 === 2) hat(0.018); }
    else if (M.drums === 'lofi') { if (s16 === 0 || s16 === 7) kick(); if (s16 === 8) snare(); if (s16 % 2 === 0) hat(0.012); }
  },
  stop() { if (this.gain && ctx) this.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5); this.mood = null; },
};
export { music };
