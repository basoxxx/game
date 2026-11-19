// Kart Baso — headless simulation checks (Node, no browser): every track forwards and backwards with
// 8 AI karts must finish 3 laps in a sane time, items must get used, battle must end.
//   node tools/kart-sim.mjs [trackKey]
import { Sim } from '../src/kart/sim.js';
import { TRACKS, CHARACTERS, ARENAS } from '../src/kart/data.js';

const only = process.argv[2];
let fail = 0;
const karts = (n, human = -1) => CHARACTERS.slice(0, n).map((c, i) => ({ char: c.id, human: i === 0 ? human : -1 }));
for (const t of TRACKS) for (const key of [t.id, t.id + ':r']) {
  if (only && !key.startsWith(only)) continue;
  const sim = new Sim({ mode: 'race', track: key, laps: 3, cls: 'normale', karts: karts(8), seed: 7 });
  const ev = {}; let steps = 0; const t0 = Date.now();
  while (sim.state !== 'done' && steps < 60 * 400) { sim.step(1 / 60); steps++; for (const e of sim.popEvents()) ev[e.t] = (ev[e.t] || 0) + 1; }
  const ms = Date.now() - t0;
  const fin = sim.karts.filter((k) => k.finished && !k.estimated).length;
  const times = sim.order.map((k) => k.finishT.toFixed(1));
  const ok = fin >= 7 && sim.state === 'done' && +times[0] > 60 && +times[0] < 200;
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} ${key.padEnd(12)} finished ${fin}/8 first ${times[0]}s last ${times[7]}s  (${(steps / 60).toFixed(0)}s sim, ${ms} ms)  resp ${ev.respawn || 0} hits ${ev.hit || 0} use ${ev.use || 0} boost ${ev.boost || 0} wall ${ev.wall || 0} jump ${ev.jump || 0} box ${ev.box || 0} coin ${ev.coin || 0}`);
}
for (const a of ARENAS) {
  if (only && !a.id.startsWith(only)) continue;
  const sim = new Sim({ mode: 'battle', track: a.id, cls: 'normale', karts: karts(6), seed: 3 });
  const ev = {}; let steps = 0;
  while (sim.state !== 'done' && steps < 60 * 200) { sim.step(1 / 60); steps++; for (const e of sim.popEvents()) ev[e.t] = (ev[e.t] || 0) + 1; }
  const ok = sim.state === 'done';
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} battle ${a.id} ended at ${sim.t.toFixed(0)}s  winner ${sim.order[0].name} (${sim.order[0].balloons})  balloons popped ${ev.balloon || 0} use ${ev.use || 0} box ${ev.box || 0} out ${ev.out || 0}`);
}
// a human kart with no input must not move; full throttle must cross the line
{
  const sim = new Sim({ mode: 'tt', track: 'prato', laps: 3, cls: 'normale', karts: [{ char: 'baso', human: 0 }], seed: 1 });
  for (let i = 0; i < 400; i++) sim.step(1 / 60);
  const k = sim.karts[0]; const still = Math.abs(k.fwd) < 0.01;
  k.input.thr = 1; for (let i = 0; i < 300; i++) sim.step(1 / 60);
  const moving = k.fwd > 15;
  k.input.item = 1; sim.step(1 / 60); k.input.item = 0; sim.step(1 / 60);
  const ok = still && moving && k.uses === 2 && k.boostT > 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} human: still ${still} moving ${moving} (${k.fwd.toFixed(1)} m/s) turbo used ${k.uses === 2}`);
}
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exitCode = fail ? 1 : 0;
