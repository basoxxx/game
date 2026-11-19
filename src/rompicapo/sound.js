// Rompicapo — puzzle sounds synthesised with WebAudio (pitched pops, wooden knocks, tile clacks,
// line-clear sweeps). The shared kit in src/ui/audio.js has the UI jingles (win, coin, ok, bad) and
// is used for those; this small one runs its own context, created on the first gesture, following
// the volume setting (0 = silent).
let ctx = null, master = null, vol = 0.6, noise = null;
const ac = () => {
  if (vol <= 0) return null;
  if (!ctx) {
    const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!C) return null;
    try { ctx = new C(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination); } catch { ctx = null; return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};
export function setVolume(v) { vol = Math.max(0, v); if (master) master.gain.value = vol; }
function tone(type, f, t, dur, peak, o = {}) {
  const c = ctx, n = c.createOscillator(), g = c.createGain();
  n.type = type; n.frequency.setValueAtTime(f, t);
  if (o.to) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.slide || dur));
  let head = n;
  if (o.cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.cut; fl.Q.value = o.q || 0.8; n.connect(fl); head = fl; }
  const a = o.a ?? 0.005;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  head.connect(g);
  if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(master); } else g.connect(master);
  n.start(t); n.stop(t + dur + 0.05);
}
function nz(t, dur, peak, f, q = 1, to = 0, type = 'bandpass') {
  const c = ctx;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(); s.buffer = noise;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const last = {};
const wrap = (name, ms, fn) => (...a) => { const c = ac(); if (!c) return; const n = performance.now(); if (n - (last[name] || 0) < ms) return; last[name] = n; try { fn(c.currentTime, ...a); } catch {} };
export const snd = {
  // wooden knock: placing a digit / a brick landing
  knock: wrap('knock', 25, (t, p = 1) => { tone('triangle', 520 * p, t, 0.09, 0.22, { to: 300 * p, slide: 0.05 }); nz(t, 0.04, 0.12, 1800 * p, 2); }),
  note: wrap('note', 25, (t) => { tone('sine', 1400, t, 0.06, 0.08, { to: 1700 }); }),
  erase: wrap('erase', 25, (t) => { nz(t, 0.12, 0.12, 2400, 1, 900); }),
  select: wrap('select', 20, (t) => { tone('sine', 880, t, 0.04, 0.05); }),
  // merge pop, pitched by the tile value (log2)
  pop: wrap('pop', 18, (t, lv = 1) => { const f = 330 * Math.pow(2, PENT[Math.min(PENT.length - 1, lv - 1)] / 12); tone('sine', f, t, 0.16, 0.2, { to: f * 1.5, slide: 0.06 }); tone('triangle', f * 2, t + 0.01, 0.1, 0.06); }),
  slide: wrap('slide', 40, (t) => { nz(t, 0.08, 0.05, 900, 0.8, 2200); }),
  spawn: wrap('spawn', 30, (t) => { tone('sine', 1200, t, 0.05, 0.035, { to: 1600 }); }),
  // falling blocks
  move: wrap('move', 30, (t) => { tone('square', 220, t, 0.025, 0.025, { cut: 1200 }); }),
  rotate: wrap('rotate', 30, (t) => { tone('triangle', 660, t, 0.05, 0.06, { to: 880 }); }),
  lock: wrap('lock', 30, (t) => { tone('sine', 150, t, 0.12, 0.3, { to: 70 }); nz(t, 0.05, 0.1, 600, 1); }),
  hard: wrap('hard', 30, (t) => { tone('sine', 120, t, 0.2, 0.45, { to: 45 }); nz(t, 0.12, 0.2, 400, 0.8, 120, 'lowpass'); }),
  hold: wrap('hold', 40, (t) => { tone('sine', 520, t, 0.08, 0.08, { to: 780 }); tone('sine', 780, t + 0.06, 0.08, 0.06); }),
  clear: wrap('clear', 60, (t, n = 1) => {
    nz(t, 0.35 + n * 0.08, 0.16 + n * 0.03, 600, 1.2, 6000);
    const base = [523.25, 587.33, 659.25, 783.99][Math.min(3, n - 1)];
    for (let k = 0; k < n + 1; k++) tone('triangle', base * Math.pow(2, (k * 4) / 12), t + k * 0.06, 0.25, 0.09, { pan: (k - n / 2) * 0.2 });
    if (n >= 4) { tone('sawtooth', 130.8, t, 0.6, 0.12, { cut: 1400, to: 261.6, slide: 0.3 }); }
  }),
  level: wrap('level', 200, (t) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('square', f, t + i * 0.07, 0.14, 0.05, { cut: 3000 })); }),
  // mahjong
  clack: wrap('clack', 25, (t) => { nz(t, 0.05, 0.2, 3200, 3); tone('triangle', 1900, t, 0.04, 0.05); }),
  match: wrap('match', 40, (t, combo = 0) => { const f = 660 * Math.pow(2, PENT[Math.min(8, combo)] / 12); tone('sine', f, t, 0.3, 0.12); tone('sine', f * 1.5, t + 0.07, 0.35, 0.09); nz(t, 0.06, 0.12, 2600, 2); }),
  shuffle: wrap('shuffle', 200, (t) => { for (let k = 0; k < 10; k++) nz(t + k * 0.035 + Math.random() * 0.02, 0.04, 0.12, 2000 + Math.random() * 2000, 3); }),
  nope: wrap('nope', 60, (t) => { tone('square', 196, t, 0.12, 0.05, { cut: 900 }); tone('square', 175, t + 0.08, 0.14, 0.05, { cut: 800 }); }),
  // a row / column / box completed in the sudoku: rising sparkle
  sparkle: wrap('sparkle', 60, (t, k = 0) => { for (let i = 0; i < 4; i++) tone('sine', 1046.5 * Math.pow(2, (PENT[i + k] || 0) / 12), t + i * 0.045, 0.18, 0.05); }),
};
