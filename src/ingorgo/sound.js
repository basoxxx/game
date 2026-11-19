// Ingorgo — car sounds (horns, engines, tyre squeaks, bumps) synthesised with WebAudio. The shared
// kit in src/ui/audio.js has no horns, so this small one runs its own context, created on the first
// gesture and following the volume setting (0 = silent). UI jingles still come from the shared sfx.
let ctx = null, master = null, vol = 0.6;
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
export function closeAudio() { try { ctx?.close(); } catch {} ctx = null; master = null; }

function tone(type, f, t, dur, peak, o = {}) {
  const c = ctx, n = c.createOscillator(), g = c.createGain();
  n.type = type; n.frequency.setValueAtTime(f, t);
  if (o.to) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.03; l.connect(lg); lg.connect(n.frequency); l.start(t); l.stop(t + dur + 0.05); }
  let head = n;
  if (o.cut) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.cut; fl.Q.value = o.q || 1; n.connect(fl); head = fl; }
  const a = o.a ?? 0.01;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + Math.max(a, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; head.connect(g); g.connect(p); p.connect(master); } else { head.connect(g); g.connect(master); }
  n.start(t); n.stop(t + dur + 0.05);
}
let noise = null;
function nz(t, dur, peak, f, q = 1, to = 0) {
  const c = ctx;
  if (!noise) { noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(); s.buffer = noise;
  const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// horn voices (the hero's horn is a cosmetic; the other cars honk by size)
export const HORNS = {
  classico: (t, k) => { tone('sawtooth', 392 * k, t, 0.32, 0.05, { cut: 1800, q: 2 }); tone('sawtooth', 494 * k, t, 0.32, 0.045, { cut: 1800, q: 2 }); },
  doppio: (t, k) => { for (const d of [0, 0.2]) { tone('square', 440 * k, t + d, 0.14, 0.035, { cut: 2200 }); tone('square', 554 * k, t + d, 0.14, 0.03, { cut: 2200 }); } },
  trombetta: (t, k) => { tone('square', 620 * k, t, 0.09, 0.04, { to: 700 * k, cut: 3000 }); tone('square', 620 * k, t + 0.13, 0.2, 0.04, { to: 540 * k, cut: 3000 }); },
  paperella: (t, k) => { for (const d of [0, 0.16]) tone('sawtooth', 900 * k, t + d, 0.12, 0.035, { to: 520 * k, cut: 2600, q: 6 }); },
  melodia: (t, k) => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f * k, t + i * 0.09, 0.12, 0.05, { cut: 4000 })); },
  camion: (t, k) => { tone('sawtooth', 165 * k, t, 0.6, 0.06, { cut: 900, q: 1.5 }); tone('sawtooth', 208 * k, t, 0.6, 0.05, { cut: 900, q: 1.5 }); },
  bici: (t) => { for (const d of [0, 0.12]) { tone('sine', 2600, t + d, 0.25, 0.03); tone('sine', 3900, t + d, 0.18, 0.012); } },
};
const SIZE_HORN = { 2: 'classico', 3: 'camion' };
const safe = (f) => (...a) => { if (!ac()) return; try { f(...a); } catch (e) { console.warn('ingorgo audio', e); } };
export const snd = {
  honk: safe((kind = 'classico', pitch = 1) => { (HORNS[kind] || HORNS.classico)(ctx.currentTime, pitch); }),
  carHonk: safe((len = 2, pitch = 1) => { HORNS[SIZE_HORN[len] || 'classico'](ctx.currentTime, pitch); }),
  // a slide: rolling tyres + a little engine blip, longer for longer slides
  slide: safe((cells = 1, heavy = false) => {
    const t = ctx.currentTime, d = Math.min(0.5, 0.12 + cells * 0.06);
    nz(t, d, 0.03, heavy ? 500 : 900, 0.8, heavy ? 300 : 600);
    tone('sawtooth', heavy ? 70 : 95, t, d, 0.025, { to: heavy ? 110 : 160, cut: 600 });
  }),
  bump: safe(() => { const t = ctx.currentTime; tone('sine', 140, t, 0.12, 0.09, { to: 70 }); nz(t, 0.08, 0.04, 700, 1.5); }),
  squeak: safe(() => { const t = ctx.currentTime; tone('sine', 1800, t, 0.12, 0.012, { to: 1400 }); }),
  // drive off: engine rev up and away
  vroom: safe((heavy = false) => {
    const t = ctx.currentTime;
    tone('sawtooth', heavy ? 60 : 85, t, 0.7, 0.05, { to: heavy ? 150 : 260, cut: 900, a: 0.03 });
    tone('square', heavy ? 120 : 170, t, 0.6, 0.012, { to: heavy ? 300 : 520, cut: 1500 });
    nz(t, 0.5, 0.025, 1200, 0.7, 3000);
  }),
  ferry: safe(() => { const t = ctx.currentTime; tone('sawtooth', 110, t, 0.8, 0.05, { cut: 500, vib: 5 }); tone('sawtooth', 138, t + 0.05, 0.75, 0.04, { cut: 500, vib: 5 }); nz(t, 0.9, 0.02, 400, 0.6); }),
  light: safe(() => { const t = ctx.currentTime; tone('sine', 1320, t, 0.05, 0.015); }),
  pick: safe(() => { const t = ctx.currentTime; tone('triangle', 660, t, 0.05, 0.03, { cut: 3000 }); }),
  undo: safe(() => { const t = ctx.currentTime; tone('triangle', 520, t, 0.08, 0.03, { to: 360 }); }),
  hint: safe(() => { const t = ctx.currentTime; [880, 1175, 1568].forEach((f, i) => tone('sine', f, t + i * 0.07, 0.25, 0.025)); }),
  coin: safe(() => { const t = ctx.currentTime; tone('square', 988, t, 0.08, 0.02, { cut: 5000 }); tone('square', 1319, t + 0.07, 0.25, 0.02, { cut: 5000 }); }),
  tick: safe(() => { const t = ctx.currentTime; tone('square', 1500, t, 0.03, 0.02, { cut: 3000 }); }),
  fanfare: safe(() => {
    const t = ctx.currentTime;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone('square', f, t + i * 0.1, i === 5 ? 0.5 : 0.12, 0.025, { cut: 3500 }));
    HORNS.doppio(t + 0.7, 1);
  }),
};
