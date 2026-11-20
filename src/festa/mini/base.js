// Festa Baso — base class of every minigame simulation. Pure and deterministic: the same seed and the same
// inputs give the same match, so the headless tests (tools/festa-test.mjs) and the browser run the same code.
//
//   const sim = new Mini.Sim({ n: 2..4, seed, skill: [0..1 per player] (AI strength), cpu: [bool per player] });
//   every frame: for each CPU player sim.ai(i, inputs[i]); then sim.step(1/60, inputs)
//   inputs[i] = { x, y (stick, screen axes: +x right, +y down, -1..1), a (action held), ap (pressed this frame) }
//   sim.done -> sim.result() = { places: [1..n per player, ties share], scores, unit, low }
//   sim.hud(i) -> short status string for player i (the view shows it in the player's corner)
// World units: x right, y "down the screen" (the 3D views map y to world z).
import { rng, placesOf } from '../util.js';

export class Base {
  constructor(o = {}, dur = 45) {
    this.n = o.n || 2; this.seed = (o.seed ?? 1) >>> 0; this.r = rng(this.seed); this.ar = rng(this.seed ^ 0x9e3779b9);
    this.skill = o.skill || Array.from({ length: this.n }, () => 0.6); this.cpu = o.cpu || Array.from({ length: this.n }, () => false);
    this.t = 0; this.dur = dur; this.done = false; this.score = new Array(this.n).fill(0); this.events = []; this.low = false; this.unit = 'punti';
  }
  step(dt, inp) {
    if (this.done) return;
    this.t += dt; this.update(dt, inp);
    if (!this.done && this.dur && this.t >= this.dur) this.finish();
  }
  update() {}
  finish() { if (this.done) return; this.done = true; this.ev('end'); }
  ev(type, data = {}) { this.events.push({ type, ...data }); if (this.events.length > 300) this.events.splice(0, 150); }
  left() { return Math.max(0, this.dur - this.t); }
  ai() {}
  // stick / arrows as discrete taps (cursor games): 0 up, 1 right, 2 down, 3 left, -1 none; held = auto-repeat
  tap(i, inp, dt, rep = true) {
    const s = (this._tap ||= Array.from({ length: this.n }, () => ({ d: -1, t: 0 })))[i];
    const ax = Math.abs(inp.x), ay = Math.abs(inp.y);
    const d = Math.max(ax, ay) > 0.55 ? (ax > ay ? (inp.x > 0 ? 1 : 3) : (inp.y > 0 ? 2 : 0)) : -1;
    if (d < 0) { s.d = -1; return -1; }
    if (d !== s.d) { s.d = d; s.t = 0.32; return d; }
    s.t -= dt; if (rep && s.t <= 0) { s.t = 0.13; return d; }
    return -1;
  }
  hud(i) { return `${Math.round(this.score[i])}`; }
  // tie-break key per player (higher is better) for equal scores, so CPU seats that play alike still get an order
  tie() { return null; }
  result() { return { places: placesOf(this.score, this.low, this.tie()), scores: this.score.slice(), unit: this.unit, low: this.low }; }
}
// players' slot colours (rings, HUD corners, touch zones)
export const SLOT_COLORS = ['#ff4d6d', '#2f8cff', '#2fd36b', '#ffc21a'];
