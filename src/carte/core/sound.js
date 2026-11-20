// Carte Baso — card sounds (deal swish, slap on the felt, collect sweep, shuffle riffle, chimes),
// synthesised with WebAudio on a small context of its own, created on the first gesture and following
// the volume setting (0 = silent). Big UI jingles still come from the shared sfx in src/ui/audio.js.
let ctx = null, master = null, vol = 0.6, noise = null, lastDeal = 0;
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
export function closeAudio() { try { ctx?.close(); } catch {} ctx = null; master = null; noise = null; }
function nz(t, dur, peak, f, q = 1, to = 0, type = 'bandpass') {
  const c = ctx;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(); s.buffer = noise;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(f, t, dur, peak, type = 'sine') {
  const c = ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export const snd = {
  deal() { const c = ac(); if (!c) return; const t = c.currentTime; if (t - lastDeal < 0.03) return; lastDeal = t; nz(t, 0.09, 0.16, 2400, 0.9, 5200); },
  play() { const c = ac(); if (!c) return; const t = c.currentTime; nz(t, 0.07, 0.22, 1800, 0.8, 4200); nz(t + 0.05, 0.08, 0.3, 380, 1.2, 0, 'lowpass'); tone(150, t + 0.05, 0.08, 0.05); },
  collect() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 4; i++) nz(t + i * 0.035, 0.12, 0.1, 1200 + i * 500, 0.7, 4800); },
  shuffle() { const c = ac(); if (!c) return; const t = c.currentTime; for (let i = 0; i < 22; i++) nz(t + i * 0.022 + Math.random() * 0.01, 0.03, 0.08, 3000 + Math.random() * 2000, 1.5); },
  flip() { const c = ac(); if (!c) return; const t = c.currentTime; nz(t, 0.06, 0.12, 3200, 1, 1600); },
  chime() { const c = ac(); if (!c) return; const t = c.currentTime; [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.07, 0.5, 0.06, 'triangle')); },
  bad() { const c = ac(); if (!c) return; const t = c.currentTime; tone(220, t, 0.12, 0.06, 'square'); tone(180, t + 0.1, 0.16, 0.05, 'square'); },
  tick() { const c = ac(); if (!c) return; tone(1800, c.currentTime, 0.03, 0.03, 'square'); },
};
