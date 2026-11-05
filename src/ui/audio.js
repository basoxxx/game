import { getSettings } from '../engine/state.js';
let ctx = null, master = null, engine = null;
function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = getSettings().volume;
  return ctx;
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (!getSettings().sound) return;
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  click: () => tone(1400, 0.05, 'square', 0.03),
  hover: () => tone(2200, 0.03, 'sine', 0.012),
  ok: () => { tone(660, 0.1, 'triangle', 0.12); tone(990, 0.16, 'triangle', 0.1, 0, 0.08); },
  bad: () => { tone(300, 0.18, 'sawtooth', 0.06, -120); },
  notify: () => { tone(880, 0.08, 'sine', 0.1); tone(1320, 0.12, 'sine', 0.08, 0, 0.07); },
  beep: () => tone(880, 0.25, 'square', 0.07),
  go: () => tone(1320, 0.5, 'square', 0.08),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 0, i * 0.12)); },
  overtake: () => tone(500, 0.25, 'sawtooth', 0.025, 500),
  crash: () => { const c = ac(); if (!c || !getSettings().sound) return; const len = 0.5; const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = 0.25; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; s.connect(f); f.connect(g); g.connect(master); s.start(); },
};
export function engineStart() {
  const st = getSettings();
  if (!st.sound || !st.engineSound) return;
  const c = ac(); if (!c || engine) return;
  const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 110; o2.frequency.value = 55.5;
  f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 3;
  g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.018, c.currentTime + 1.2);
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
  engine = { o1, o2, g, f };
}
export function engineSet(rpm) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  engine.o1.frequency.setTargetAtTime(90 + rpm * 160, t, 0.15);
  engine.o2.frequency.setTargetAtTime(45 + rpm * 80, t, 0.15);
  engine.f.frequency.setTargetAtTime(500 + rpm * 1200, t, 0.2);
}
export function engineStop() {
  if (!engine || !ctx) return;
  const e = engine; engine = null;
  e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch {} }, 800);
}
