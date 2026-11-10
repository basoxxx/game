// "Scontro Totale" driving options: handling presets (Arcade / Normale / Simulazione), steering
// sensitivity and deadzone, keyboard smoothing, drift assist, rumble and AI rubber band. They live
// in the derby save (localStorage apexdynasty_derby, field `opts`), so old saves load unchanged.
// Also: per-wheel surface grip (tarmac / dirt / gravel / mud / grass, wet and water) used by the
// vehicle model in game.js.
import { prog, saveProg } from './career.js';

// Every number here is a multiplier or a gain read by DerbyGame.drive():
//   assistKb / assistPad  counter-steer assist (front wheels follow the slide), keyboard / analog
//   latGrip   arcade lateral grip (velocity follows the nose while sliding), x mass
//   yawMax    yaw-rate clamp (rad/s) outside handbrake turns
//   antiRoll  roll-stiffening torque against tipping over
//   airCtl    steering / pitching in the air, self-levelling strength
//   land      how much of the tumble a landing soaks up (0 = none, 1 = all)
//   hbYaw     handbrake rotation help
//   stab      high-speed stabiliser (damps roll and pitch rates above ~70 km/h)
//   brake     service brake deceleration (m/s^2 at full pedal on dirt)
export const PRESETS = {
  arcade: { name: 'Arcade', desc: 'Aiuti al massimo: l’auto perdona tutto, derapate facili e atterraggi sempre in piedi.', assistKb: 0.85, assistPad: 0.62, latGrip: 1.45, yawMax: 2.2, antiRoll: 1.25, airCtl: 1.2, land: 0.75, hbYaw: 1.15, stab: 1.3, brake: 9.4, drift: 0.8 },
  normale: { name: 'Normale', desc: 'Il giusto mezzo: controsterzo assistito, peso e trazione si sentono.', assistKb: 0.7, assistPad: 0.45, latGrip: 1.1, yawMax: 2.4, antiRoll: 1.0, airCtl: 1.0, land: 0.6, hbYaw: 1.0, stab: 1.0, brake: 8.6, drift: 0.55 },
  simulazione: { name: 'Simulazione', desc: 'Aiuti ridotti: trasferimenti di carico, sovrasterzo di potenza e fondo contano davvero.', assistKb: 0.25, assistPad: 0.08, latGrip: 0.45, yawMax: 3.4, antiRoll: 0.62, airCtl: 0.45, land: 0.3, hbYaw: 0.75, stab: 0.55, brake: 7.8, drift: 0.2 },
};
export const DEF_OPTS = { preset: 'normale', sens: 1, dead: 0.08, kbSmooth: true, drift: null, rumble: true, rubber: true, pit: true };

export function driveOpts(p = prog()) { return { ...DEF_OPTS, ...(p.opts || {}) }; }
export function setDriveOpts(patch) { const p = prog(); p.opts = { ...driveOpts(p), ...patch }; saveProg(p); return p.opts; }
// the effective handling table: the preset, with the drift-assist slider (if set) scaling the assists
export function handlingOf(o = driveOpts()) {
  const P = { ...(PRESETS[o.preset] || PRESETS.normale) };
  if (o.drift != null) { const k = o.drift / Math.max(0.05, P.drift); P.assistKb = Math.min(0.95, P.assistKb * k); P.assistPad = Math.min(0.9, P.assistPad * k); P.latGrip *= 0.7 + 0.3 * Math.min(1.6, k); P.drift = o.drift; }
  return P;
}

// ---------------------------------------------------------------- surfaces under each tyre
// grip: friction-slip multiplier; side: lateral stiffness (loose surfaces slide progressively);
// drag: rolling resistance (x mass, per m/s); name for the HUD/telemetry
export const GRIP = {
  asphalt: { grip: 1.35, side: 1.0, drag: 0, name: 'asfalto' },
  dirt: { grip: 1.05, side: 0.86, drag: 0.002, name: 'sterrato' },
  gravel: { grip: 0.96, side: 0.8, drag: 0.004, name: 'ghiaia' },
  mud: { grip: 0.86, side: 0.72, drag: 0.012, name: 'fango' },
  grass: { grip: 0.82, side: 0.78, drag: 0.006, name: 'erba' },
};
// surface of a wheel contact: the venue surface on the racing surface, the venue's verge off it;
// rain and puddles make tarmac slippery (dirt turns to mud), water fords are the worst
export function surfaceAt(game, x, z) {
  const v = game.venue, T = game.terrain, base = game.surfKind || v.surface || 'dirt';
  const on = game.track.arena || game.track.stunt || T.trackAt(x, z) > 0.4;
  const k = on ? base : (v.ground === 'rock' || v.quarry || v.port ? 'gravel' : 'grass');
  const S = GRIP[k] || GRIP.dirt; let g = S.grip, side = S.side, drag = S.drag;
  const w = T.waterAt(x, z);
  if (game.wet) { if (k === 'asphalt') g *= 1 - 0.2 * game.wet; else if (k === 'dirt' || k === 'gravel') { g *= 1 - 0.1 * game.wet; side *= 0.94; } }
  if (w > 0.3) { g *= k === 'asphalt' ? 0.72 : 0.8; drag += 0.01; }
  return { k, g, side, drag, wet: w > 0.3 };
}

// keyboard smoothing: digital keys ramp towards full lock (faster back to centre), so a tap is a
// small correction and holding is full lock; analog sticks get the deadzone and a response curve
export function shapeSteer(game, raw, analog, dt) {
  const o = game.dopts, sens = o.sens || 1;
  if (analog) {
    const a = Math.abs(raw), dz = o.dead ?? 0.08; if (a <= dz) return 0;
    const v = Math.min(1, ((a - dz) / (1 - dz)) ** (1.15 + (1 - Math.min(1.5, sens)) * 0.6) * Math.min(1.25, sens));
    return Math.sign(raw) * v;
  }
  if (!o.kbSmooth) return raw * Math.min(1, sens);
  const cur = game._kbSt || 0, back = raw === 0 || Math.sign(raw) !== Math.sign(cur);
  const rate = (back ? 7.5 : 3.2 + 2.2 * sens) * dt;
  game._kbSt = cur + Math.max(-rate, Math.min(rate, raw * Math.min(1, 0.55 + 0.45 * sens) - cur));
  return game._kbSt;
}
