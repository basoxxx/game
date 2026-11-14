// "Scontro Totale" pace table (no imports: tracks.js, game.js and ai.js all read it).
// v6 pace: the whole field runs ~25% quicker than v5; v7 adds ~10% more (see below). Read by DerbyGame.drive() and by the AI
// racing-line profile (PACE.line: lateral grip, braking, acceleration and top speed of the AI speed profile).
//   vmax       base top speed (m/s, x spec.top): 58 = 209 km/h for a stock saloon (v5: 46)
//   engine     peak drive force (N, x spec.power, x gear multiplier)
//   nitro      extra shove while the bottle is open; nitroTop raises the top speed under boost
//   kick       the one-off kick in the back when the bottle opens
//   extraG     extra weight on the wheels (x m*g) while on the ground: more traction at high speed
//              without making props and debris heavier (world gravity is unchanged)
//   down       aerodynamic downforce (N per (m/s)^2), drag (N per (m/s)^2)
//   grip       tyre friction multiplier (all cars, all surfaces)
//   stunt      long-jump medal distances scale with the faster run-up (v5 targets x 1.5 in v7, then x the
//              car's jump class: see career.js JUMP_CLASS)
//   brake      multiplier on the presets' service brake deceleration
// v7 pace: another ~10% on the straights (vmax 58 -> 64 = 230 km/h for a stock saloon, more shove),
// with a touch more grip, downforce and braking so the corners stay catchable at the higher entry speeds.
// Physics stays at <= 1/118 s substeps with CCD on the cars (75 m/s = 0.64 m per step).
export const PACE = { vmax: 64, engine: 11800, nitro: 9400, nitroTop: 1.2, kick: 8400, nitroDrain: 19, extraG: 0.36, down: 1.9, drag: 0.34, brake: 1.3, grip: 1.3, stunt: 1.5,
  line: { aLat: 19.2, aBrk: 12.2, aAcc: 10, vMax: 70, jump: 40 } };
