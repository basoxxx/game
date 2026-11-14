// Impact sound design for "Scontro Totale" (procedural Web Audio, no samples): metal crunch with
// inharmonic clangs, glass shatter, explosions, landings, prop hits, a horn, and continuous layers
// driven by the player's car: tyre squeal on hard surfaces, gravel roll on dirt, body scraping,
// nitro roar, wind, and a crowd that swells on big moments. Uses its own AudioContext so the main
// audio engine (engine synth, music) stays untouched; respects the global sound settings.
import { getSettings } from '../engine/state.js';

let AC = null, NOISE = null;
function ctx() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = NOISE.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.7 + b * 2.2; }
  }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}

export class DerbySound {
  constructor(game) {
    this.g = game; this.on = false;
    const st = getSettings(); if (st.sound === false) return;
    const c = ctx(); if (!c) return;
    this.c = c; this.on = true;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2; comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.0001; this.master.connect(comp);
    this.master.gain.setTargetAtTime(Math.max(0.0001, (st.volume ?? 0.8) * 0.9), c.currentTime, 0.4);
    this.fx = c.createGain(); this.fx.gain.value = 1; this.fx.connect(this.master);
    // a short room/stadium reverb for the one-shots
    const conv = c.createConvolver(); const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2; }
    conv.buffer = ir; const wet = c.createGain(); wet.gain.value = game.track?.arena || game.venue?.stadium ? 0.32 : 0.16; this.fx.connect(conv); conv.connect(wet); wet.connect(this.master);
    // continuous layers
    const loop = (type, freq, q, gain = 0) => { const s = c.createBufferSource(); s.buffer = NOISE; s.loop = true; s.loopStart = Math.random(); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(this.master); s.start(0, Math.random() * 1.5); return { s, f, g }; };
    this.roll = loop('lowpass', 380, 0.7);
    this.scrapeL = loop('bandpass', 2300, 3.5);
    this.wind = loop('highpass', 1800, 0.5);
    this.nitroL = loop('bandpass', 700, 0.9);
    this.crowdL = loop('bandpass', 850, 0.6, 0.0001);
    this.crowdHi = loop('bandpass', 2100, 1.2, 0.0001);
    // tyre squeal: two detuned saws through a resonant band-pass, with a slow wobble
    const sq = c.createGain(); sq.gain.value = 0; const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1100; sf.Q.value = 6; sf.connect(sq); sq.connect(this.master);
    this.sqO = [0, 1].map((k) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 720 + k * 23; o.connect(sf); o.start(); return o; });
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 30; lfo.connect(lg); for (const o of this.sqO) lg.connect(o.frequency); lfo.start();
    this.sq = sq; this.sqF = sf; this.lfo = lfo;
    this.scrapeV = 0; this.crowdV = 0.25;
  }
  stop() {
    if (!this.on) return; this.on = false; const c = this.c, t = c.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.15);
    setTimeout(() => { try { for (const l of [this.roll, this.scrapeL, this.wind, this.nitroL, this.crowdL, this.crowdHi]) l.s.stop(); for (const o of this.sqO) o.stop(); this.lfo.stop(); this.master.disconnect(); } catch {} }, 600);
  }
  // distance attenuation from the camera
  att(pos) { const cam = this.g.camera?.position; if (!cam || !pos) return 1; const d = Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z); return 1 / (1 + Math.max(0, d - 6) / 14); }
  // ---------------------------------------------------------------- building blocks
  noise(t, dur, vol, type, f0, f1, q = 1) { const c = this.c, s = c.createBufferSource(); s.buffer = NOISE; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.fx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); }
  tone(t, dur, vol, f0, f1 = 0, type = 'sine') { const c = this.c, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + dur + 0.05); }
  // ---------------------------------------------------------------- one-shots
  impact(car, dmg, by) {
    if (!this.on || dmg < 1.5) return; const now = this.c.currentTime;
    if (now - (this._impT || 0) < 0.05) return; this._impT = now;
    const pl = car.isPlayer || by?.isPlayer, a = this.att(car.mesh.position) * (pl ? 1 : 0.8), k = Math.min(1, dmg / 30) * a; if (k < 0.02) return;
    const t = now + 0.005;
    this.tone(t, 0.35 + k * 0.3, 0.55 * k, 95 + Math.random() * 20, 38);                       // body thump
    this.noise(t, 0.28 + k * 0.4, 0.5 * k, 'lowpass', 2600, 300, 0.8);                       // crunch
    const base = 260 + Math.random() * 140;                                                      // inharmonic sheet-metal clang
    for (const m of [1, 1.59, 2.31, 3.17, 4.43]) this.tone(t + Math.random() * 0.01, 0.18 + k * 0.5 / m, 0.09 * k / Math.sqrt(m), base * m, base * m * 0.97, 'triangle');
    const n = 3 + Math.floor(k * 6); for (let i = 0; i < n; i++) this.noise(t + 0.02 + Math.random() * 0.16, 0.035, 0.16 * k, 'bandpass', 1800 + Math.random() * 2600, 0, 2.5); // crumple ticks
    if (dmg > 12) this.crowd(Math.min(1, dmg / 30) * (pl ? 1 : 0.4));
  }
  glass(pos) {
    if (!this.on) return; const t = this.c.currentTime + 0.01, a = this.att(pos);
    this.noise(t, 0.25, 0.25 * a, 'highpass', 4500, 0, 0.7);
    for (let i = 0; i < 16; i++) this.tone(t + Math.random() * 0.45, 0.06 + Math.random() * 0.1, 0.05 * a, 3000 + Math.random() * 5000, 0, 'sine');
  }
  explode(car) {
    if (!this.on) return; const t = this.c.currentTime + 0.01, a = this.att(car.mesh.position);
    this.tone(t, 1.6, 0.8 * a, 70, 26);
    this.noise(t, 1.8, 0.7 * a, 'lowpass', 900, 60, 0.7);
    for (let i = 0; i < 14; i++) this.noise(t + 0.1 + Math.random() * 1.2, 0.05, 0.12 * a, 'bandpass', 1500 + Math.random() * 3000, 0, 3); // crackle
    this.crowd(car.isPlayer || car.lastHit?.by?.isPlayer ? 1 : 0.5);
  }
  land(car, airT) {
    if (!this.on) return; const t = this.c.currentTime + 0.01, a = this.att(car.mesh.position), k = Math.min(1, airT / 1.6) * a;
    this.tone(t, 0.4, 0.5 * k, 70, 32); this.noise(t, 0.3, 0.3 * k, 'lowpass', 900, 120);
    this.tone(t + 0.04, 0.12, 0.08 * k, 520, 480, 'triangle'); this.tone(t + 0.09, 0.1, 0.05 * k, 780, 700, 'triangle'); // suspension clank
    if (airT > 1.1) this.crowd(car.isPlayer ? 0.8 : 0.3);
  }
  wheelOff(car) { if (!this.on) return; const t = this.c.currentTime + 0.01, a = this.att(car.mesh.position); this.tone(t, 0.25, 0.3 * a, 180, 120, 'triangle'); this.tone(t + 0.3, 0.15, 0.15 * a, 160, 110, 'triangle'); this.tone(t + 0.52, 0.1, 0.08 * a, 150, 100, 'triangle'); this.noise(t, 0.2, 0.2 * a, 'bandpass', 1200, 400, 1.5); }
  prop(type, pos) {
    if (!this.on) return; const now = this.c.currentTime; if (now - (this._propT || 0) < 0.04) return; this._propT = now;
    const t = now + 0.005, a = this.att(pos) * 0.8; if (a < 0.05) return;
    if (type === 'barrel') { const f = 140 + Math.random() * 40; this.tone(t, 0.6, 0.22 * a, f, f * 0.96, 'triangle'); this.tone(t, 0.4, 0.1 * a, f * 2.7, 0, 'sine'); }
    else if (type === 'crate' || type === 'fence') { this.noise(t, 0.12, 0.35 * a, 'bandpass', 900, 500, 1.2); for (let i = 0; i < 3; i++) this.noise(t + 0.02 + i * 0.03, 0.04, 0.2 * a, 'bandpass', 2400, 0, 3); }
    else if (type === 'cone') this.tone(t, 0.1, 0.1 * a, 420, 300, 'triangle');
    else { this.tone(t, 0.25, 0.3 * a, 90, 55); this.noise(t, 0.15, 0.15 * a, 'lowpass', 500, 150); }
  }
  // the nitro bottle opening: a low thump in the chest and a rising whoosh
  boostOpen() { if (!this.on) return; const t = this.c.currentTime + 0.005; this.tone(t, 0.32, 0.22, 95, 42); this.noise(t, 0.55, 0.16, 'bandpass', 380, 2600, 1.2); this.noise(t + 0.05, 0.4, 0.07, 'highpass', 2500, 6000, 0.6); }
  // slow motion kicks in: a deep sub drop and a muffled whoosh (deeper for the heaviest hits)
  slowHit(big) { if (!this.on) return; const t = this.c.currentTime + 0.005; this.tone(t, big ? 1.1 : 0.7, big ? 0.3 : 0.2, big ? 70 : 85, 28); this.noise(t, big ? 1.0 : 0.6, 0.12, 'lowpass', 1600, 180, 0.8); }
  // exhaust pop / backfire (a double crack when lifting off at high revs)
  backfire(car, pos, n = 1) {
    if (!this.on) return; const a = this.att(pos); if (a < 0.12) return; const t = this.c.currentTime + 0.003;
    for (let k = 0; k < n; k++) { const tt = t + k * (0.06 + Math.random() * 0.05); this.noise(tt, 0.09, 0.32 * a, 'bandpass', 900 + Math.random() * 500, 300, 1.4); this.tone(tt, 0.08, 0.2 * a, 140 + Math.random() * 40, 60, 'square'); }
  }
  horn() { if (!this.on) return; const t = this.c.currentTime + 0.01; for (const [f, d] of [[311, 0], [233, 0.42]]) { this.tone(t + d, 0.38, 0.12, f, 0, 'square'); this.tone(t + d, 0.38, 0.06, f * 1.5, 0, 'sawtooth'); } }
  crowd(x) { this.crowdV = Math.min(1.3, this.crowdV + x * 0.8); }
  scrape(x) { this.scrapeV = Math.min(1, this.scrapeV + x); }
  // ---------------------------------------------------------------- continuous layers
  update(dt) {
    if (!this.on) return; const g = this.g, c = this.c, t = c.currentTime, P = g.player;
    const live = g.state === 'race' || g.state === 'countdown' || g.state === 'finished';
    const sp = live ? P.dyn?.speed || 0 : 0, slide = Math.abs(P.dyn?.vLat || 0), grounded = P.dyn?.grounded || 0;
    const hard = g.venue.surface === 'asphalt', onTrack = g.terrain.trackAt(P.mesh.position.x, P.mesh.position.z) > 0.3;
    const hb = g.keys?.Space || P.lastInp?.hb;
    let sq = 0; if (grounded >= 2 && sp > 4) sq = Math.min(1, Math.max(0, slide - 2.5) / 7 + (hb ? 0.25 : 0) + (P.brakeF > 0.6 && sp > 12 ? 0.25 : 0));
    this.sq.gain.setTargetAtTime(hard && onTrack ? sq * 0.05 : 0, t, 0.05);
    this.sqF.frequency.setTargetAtTime(900 + sp * 12, t, 0.1);
    const rollV = grounded >= 2 ? Math.min(1, sp / 30) * (hard && onTrack ? 0.05 : 0.16) * (1 + sq) : 0;
    this.roll.g.gain.setTargetAtTime(rollV, t, 0.08); this.roll.f.frequency.setTargetAtTime(hard && onTrack ? 600 : 300 + sp * 6, t, 0.2);
    // wind roar: grows with the square of the speed up to ~240 km/h and brightens as it grows (the speed you hear)
    this.wind.g.gain.setTargetAtTime(Math.min(0.095, (sp / 55) ** 2 * 0.07) + (grounded === 0 && sp > 8 ? 0.02 : 0) + (P.boost && live ? 0.015 : 0), t, 0.2); this.wind.f.frequency.setTargetAtTime(900 + Math.min(70, sp) * 32, t, 0.25);
    this.nitroL.g.gain.setTargetAtTime(P.boost && live ? 0.22 : 0, t, P.boost ? 0.04 : 0.15); this.nitroL.f.frequency.setTargetAtTime(P.boost ? 1300 : 500, t, 0.3);
    this.scrapeV = Math.max(0, this.scrapeV - dt * 3.5);
    this.scrapeL.g.gain.setTargetAtTime(this.scrapeV * 0.22 * Math.min(1, sp / 8), t, 0.04);
    // the crowd: a murmur that swells on big moments (louder in the stadiums)
    const base = g.track.arena || g.venue.stadium ? 0.06 : 0.03;
    this.crowdV += (0.25 - this.crowdV) * Math.min(1, dt * 0.6);
    this.crowdL.g.gain.setTargetAtTime(live ? base * this.crowdV * 1.6 : 0.0001, t, 0.25);
    this.crowdHi.g.gain.setTargetAtTime(live ? base * Math.max(0, this.crowdV - 0.3) * 1.2 : 0.0001, t, 0.2);
  }
  pause(on) { if (!this.on) return; this.master.gain.setTargetAtTime(on ? 0.0001 : Math.max(0.0001, (getSettings().volume ?? 0.8) * 0.9), this.c.currentTime, 0.08); }
}
