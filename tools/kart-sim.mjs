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
// drift: hold drift + steer at speed, release → mini-turbo; falling off the sky road / into lava respawns
{
  // open ground (battle arena) so the circle never meets a wall
  const sim = new Sim({ mode: 'battle', track: 'cortile', cls: 'normale', karts: [{ char: 'baso', human: 0 }], seed: 1 });
  const k = sim.karts[0]; let tiers = 0, boosts = 0;
  while (sim.state === 'count') sim.step(1 / 60);
  k.x = -10; k.z = -48; k.h = Math.PI / 2; k.vx = 22; k.vz = 0;
  k.input.thr = 1; k.input.steer = 1; k.input.drift = 1; for (let i = 0; i < 120; i++) { sim.step(1 / 60); for (const e of sim.popEvents()) if (e.t === 'tier') tiers = Math.max(tiers, e.tier); }
  const drifting = k.drift !== 0;
  k.input.drift = 0; k.input.steer = 0; sim.step(1 / 60); for (const e of sim.popEvents()) if (e.t === 'boost') boosts++;
  const ok = drifting && tiers >= 2 && boosts === 1 && k.boostT > 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} drift: held ${drifting}, tier ${tiers}, mini-turbo ${boosts === 1} (${k.boostT.toFixed(2)} s)`);
}
for (const [track, lat] of [['cometa', 14], ['vulcano', 13]]) {
  const sim = new Sim({ mode: 'tt', track, laps: 3, cls: 'normale', karts: [{ char: 'baso', human: 0 }], seed: 1 });
  const k = sim.karts[0];
  while (sim.state === 'count') sim.step(1 / 60);
  const p = sim.world.main.pointAt(120, lat); k.x = p.x; k.z = p.z; k.lastP = 120; k.dist = 120; k.ni = -1;
  let resp = false; for (let i = 0; i < 240 && !resp; i++) { sim.step(1 / 60); for (const e of sim.popEvents()) if (e.t === 'respawn') resp = true; }
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  const back = sim.world.probe(k.x, k.z, -1, {}).excess < 0;
  if (!(resp && back)) fail++;
  console.log(`${resp && back ? 'ok' : '!!'} ${track}: off the edge → respawned on the road (${resp}, ${back})`);
}
// laps: driving backwards over the line never counts
{
  const sim = new Sim({ mode: 'tt', track: 'neve', laps: 3, cls: 'normale', karts: [{ char: 'baso', human: 0 }], seed: 1 });
  const k = sim.karts[0]; while (sim.state === 'count') sim.step(1 / 60);
  k.h += Math.PI; k.input.thr = 1; let wrong = 0; for (let i = 0; i < 600; i++) { sim.step(1 / 60); wrong = Math.max(wrong, k.wrongT); }
  k.wrongT = wrong;
  const ok = k.maxLap === 0 && k.dist < 0 && wrong > 1;
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} wrong way: no lap counted (dist ${k.dist.toFixed(0)}, wrongT ${k.wrongT.toFixed(1)})`);
}
// difficulty: a "decent driver" (the AI driving the human kart at skill 0.85, so no rubber band and
// no rival pace factor) over the 16 Grand Prix races with the real GP field. 100 cc must be winnable,
// 150 cc clearly harder. Rubber band is symmetric (rivals behind get no extra catch-up surge).
if (!only && !process.env.KART_SKIP_GP) {
  const { CUPS, CLASSES, BODIES, WHEELS } = await import('../src/kart/data.js');
  const rivals = CHARACTERS.filter((c) => c.id !== 'baso').slice(0, 7).map((c, i) => ({ char: c.id, body: BODIES[(i * 3) % BODIES.length].id, wheels: WHEELS[(i * 5 + 1) % WHEELS.length].id, human: -1 }));
  const avg = {};
  for (const cls of ['normale', 'esperto']) {
    const pl = [];
    for (const cup of CUPS) cup.races.forEach((tr, ri) => {
      const sim = new Sim({ mode: 'race', track: tr, laps: 3, cls, karts: [...rivals, { char: 'baso', human: 0 }], seed: 1000 + ri * 13 + cup.id.length });
      const h = sim.karts.find((k) => k.human === 0); h.auto = true; h.ai.skill = 0.85;
      let st = 0; while (sim.state !== 'done' && st < 60 * 400) { sim.step(1 / 60); st++; }
      pl.push(h.place);
    });
    avg[cls] = pl.reduce((a, b) => a + b, 0) / pl.length;
    console.log(`   ${cls}: decent driver places ${pl.join('')} (avg ${avg[cls].toFixed(2)}, ${pl.filter((p) => p === 1).length} wins)`);
  }
  const C = (id) => CLASSES.find((c) => c.id === id);
  const ok = avg.normale <= 3.6 && avg.esperto >= 3 && avg.esperto > avg.normale && C('facile').pace < C('normale').pace && C('normale').pace < C('esperto').pace && CLASSES.every((c) => (c.catchup ?? 1.4) <= 1);
  if (!ok) fail++;
  console.log(`${ok ? 'ok' : '!!'} difficulty: 100 cc winnable (avg ${avg.normale.toFixed(2)} ≤ 3.6), 150 cc hard (avg ${avg.esperto.toFixed(2)} ≥ 3), symmetric rubber band`);
}
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exitCode = fail ? 1 : 0;
