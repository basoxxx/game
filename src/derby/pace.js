// "Scontro Totale" pace table (no imports: tracks.js, game.js and ai.js all read it).
// v6 pace: the whole field runs ~25% quicker than v5. Read by DerbyGame.drive() and by the AI
// racing-line profile (PACE.line: lateral grip, braking, acceleration and top speed of the AI speed profile).
//   vmax       base top speed (m/s, x spec.top): 58 = 209 km/h for a stock saloon (v5: 46)
//   engine     peak drive force (N, x spec.power, x gear multiplier)
//   nitro      extra shove while the bottle is open; nitroTop raises the top speed under boost
//   kick       the one-off kick in the back when the bottle opens
//   extraG     extra weight on the wheels (x m*g) while on the ground: more traction at high speed
//              without making props and debris heavier (world gravity is unchanged)
//   down       aerodynamic downforce (N per (m/s)^2), drag (N per (m/s)^2)
//   grip       tyre friction multiplier (all cars, all surfaces)
//   stunt      long-jump medal distances scale with the faster run-up (v5 targets x 1.3)
//   brake      multiplier on the presets' service brake deceleration
export const PACE = { vmax: 58, engine: 10600, nitro: 8600, nitroTop: 1.2, kick: 7800, nitroDrain: 19, extraG: 0.32, down: 1.7, drag: 0.36, brake: 1.22, grip: 1.25, stunt: 1.3,
  line: { aLat: 18.5, aBrk: 11.5, aAcc: 9.2, vMax: 64, jump: 38 } };
