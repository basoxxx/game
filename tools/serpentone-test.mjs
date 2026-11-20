// Serpentone simulation tests (no browser): node tools/serpentone-test.mjs
// Growth, boost cost, path following, body / head / wall collisions, food spill, power-ups, AI survival,
// every mode's end rule and determinism.
import { Sim, radiusOf, lengthOf, START_MASS, HS } from '../src/serpentone/sim.js';
import { dailySpec, MODES, ARENAS } from '../src/serpentone/meta.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.error('FAIL', msg); } else if (process.env.V) console.log('ok  ', msg); };
const run = (sim, sec, dt = 1 / 30) => { for (let t = 0; t < sec && !sim.over; t += dt) sim.step(dt); };
const quiet = (o = {}) => new Sim({ seed: 7, rivals: 0, ...o });

// --- growth: eating food grows mass, radius and length
{
  const s = quiet(); const p = s.players[0];
  for (let i = 0; i < s.fa.length; i++) if (s.fa[i]) s.killFood(i);
  p.input.ta = p.a;
  const m0 = p.m, L0 = p.L;
  for (let k = 1; k <= 12; k++) s.spawnFood(p.x + Math.cos(p.a) * k * 1.5, p.z + Math.sin(p.a) * k * 1.5, 2, 0xffffff);
  run(s, 2);
  ok(p.m >= m0 + 23.9, `eating 12 pellets x2 grows mass (${m0} -> ${p.m.toFixed(1)})`);
  ok(p.eaten >= 12, `eaten counter >= 12 (${p.eaten})`);
  ok(p.L > L0 && p.r >= radiusOf(m0), 'length and radius grow');
  ok(radiusOf(4000) <= 3.4 && lengthOf(1e6) < 4096 * HS, 'size caps');
}
// --- path following: the body sample at arc s lies on the recorded path and at ~s from the head along a straight run
{
  const s = quiet(); const p = s.players[0];
  p.input.ta = p.a; run(s, 1.5);
  const q = [0, 0]; p.sample(5, q);
  ok(Math.abs(Math.hypot(q[0] - p.x, q[1] - p.z) - 5) < 0.05, 'straight body: sample(5) is 5 units behind');
  // circle: body stays on the circle the head drew
  p.input.ta = null; p.input.turn = 1; run(s, 3);
  const cx = [], cz = [];
  for (let d = 1; d < 6; d += 1) { p.sample(d, q); cx.push(q[0]); cz.push(q[1]); }
  ok(cx.every((x, i) => Number.isFinite(x) && Number.isFinite(cz[i])), 'samples are finite while turning');
}
// --- boost spends length and drops food
{
  const s = quiet(); const p = s.players[0]; p.m = 100; p.input.ta = p.a; p.input.boost = true;
  const f0 = s.nFood; const x0 = p.x, z0 = p.z;
  for (let i = 0; i < s.fa.length; i++) if (s.fa[i]) s.killFood(i);
  p.x = 0; p.z = 0; p.a = 0; p.input.ta = 0;
  run(s, 1.5);
  ok(p.m < 100, `boost costs mass (${p.m.toFixed(1)})`);
  ok(s.nFood > 0, 'boost drops food behind');
  ok(p.boostT > 1.2, 'boost time tracked');
  void f0; void x0; void z0;
}
// --- head into a body: the head's owner dies, the other gets the kill, the body becomes food
{
  const s = new Sim({ seed: 3, rivals: 1 }); const p = s.players[0], r = s.snakes[1];
  for (let i = 0; i < s.fa.length; i++) if (s.fa[i]) s.killFood(i);
  r.ai = false; r.spawn(0, 0, 0, 200); r.input.ta = 0; // long rival heading +x along z=0
  run(s, 1);
  p.spawn(r.x - 8, -12, Math.PI / 2, 20); p.input.ta = Math.PI / 2; p.spawnT = 0; r.spawnT = 0; // player crosses its body
  const before = s.nFood;
  run(s, 2.5);
  ok(!p.alive || p.deaths > 0, 'player hitting a body dies');
  ok(r.kills === 1, `rival credited with the kill (${r.kills})`);
  ok(s.events.some((e) => e.t === 'die' && e.s === p.id && e.by === r.id && e.why === 'body'), 'die event names killer');
  ok(s.nFood > before, 'dead snake spills food');
}
// --- head to head: the smaller one dies
{
  const s = new Sim({ seed: 4, rivals: 1 }); const p = s.players[0], r = s.snakes[1];
  r.ai = false; p.spawn(-10, 0, 0, 80); r.spawn(10, 0, Math.PI, 30); p.input.ta = 0; r.input.ta = Math.PI; p.spawnT = r.spawnT = 0;
  run(s, 1.5);
  ok(p.alive && r.deaths === 1, 'head-on: smaller dies, bigger lives');
}
// --- wall kills
{
  const s = quiet(); const p = s.players[0]; p.spawn(s.R - 5, 0, 0, 20); p.input.ta = 0; p.spawnT = 0;
  run(s, 1.5);
  ok(p.deaths === 1 && s.events.some((e) => e.t === 'die' && e.why === 'wall'), 'the arena wall kills');
}
// --- ghost passes through bodies
{
  const s = new Sim({ seed: 3, rivals: 1 }); const p = s.players[0], r = s.snakes[1];
  r.ai = false; r.spawn(0, 0, 0, 200); r.input.ta = 0; run(s, 1);
  p.spawn(r.x - 8, -12, Math.PI / 2, 20); p.input.ta = Math.PI / 2; p.spawnT = r.spawnT = 0;
  p.power = { type: 'ghost', t: 5, dur: 5 };
  run(s, 2.5);
  ok(p.alive && p.deaths === 0, 'ghost crosses bodies unharmed');
}
// --- power-up pickup
{
  const s = quiet(); const p = s.players[0]; p.input.ta = p.a;
  s.items.push({ x: p.x + Math.cos(p.a) * 4, z: p.z + Math.sin(p.a) * 4, type: 'double', t: 0, id: 99 });
  run(s, 1);
  ok(p.power?.type === 'double' && p.powers === 1, 'power-up picked up');
  const m0 = p.m; s.spawnFood(p.x + Math.cos(p.a) * 2, p.z + Math.sin(p.a) * 2, 1, 0); run(s, 0.5);
  ok(p.m - m0 >= 1.9, 'x2 doubles food value');
}
// --- respawn in Classica; one life in Sopravvivenza; battle ring shrinks and ends with one survivor
{
  const s = quiet(); const p = s.players[0]; s.kill(p, null, 'test'); run(s, 3);
  ok(p.alive && p.deaths === 1 && p.m < START_MASS + 15, `classica: player respawns small (${p.m.toFixed(1)})`);
  const v = new Sim({ seed: 5, mode: 'sopravvivenza' }); v.kill(v.players[0], null, 'test'); run(v, 0.2);
  ok(v.over && v.result.why === 'dead', 'sopravvivenza ends on death');
  const b = new Sim({ seed: 6, mode: 'battaglia', diff: 'difficile' }); b.autopilot(b.players[0]);
  run(b, 60);
  ok(b.ring < b.R, `battaglia: the ring closes (${b.ring.toFixed(0)}/${b.R})`);
  run(b, 400);
  ok(b.over, `battaglia ends (${b.result?.why}, t=${b.time.toFixed(0)}s, alive ${b.snakes.filter((x) => x.alive).length})`);
}
// --- classica ends on time with a ranking; AI survive reasonably and grow
{
  const s = new Sim({ seed: 11, mode: 'classica', diff: 'normale' }); s.autopilot(s.players[0]);
  const t0 = performance.now();
  run(s, 200, 1 / 30);
  const ms = performance.now() - t0;
  ok(s.over && s.result.why === 'time' && s.result.ranking.length === 12, 'classica ends on time with 12 ranked');
  const deaths = s.snakes.reduce((a, x) => a + x.deaths, 0);
  ok(deaths < 60, `AI deaths in 3 min reasonable (${deaths})`);
  ok(Math.max(...s.snakes.map((x) => x.best)) > 150, `someone grows big (${Math.max(...s.snakes.map((x) => x.best)).toFixed(0)})`);
  ok(ms < 15000, `3 simulated minutes in ${ms.toFixed(0)} ms`);
  console.log(`  classica 3 min: ${ms.toFixed(0)} ms, deaths ${deaths}, kills ${s.snakes.reduce((a, x) => a + x.kills, 0)}, best ${Math.max(...s.snakes.map((x) => x.best)).toFixed(0)}, player pos ${s.result.players[0].pos}`);
  // difficulty: an obstacle course of big scripted circling snakes; nobody crashes into them, harder rivals eat more
  const course = (d) => {
    let crashes = 0, eaten = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const q = new Sim({ seed, diff: d, rivals: 10, missions: false });
      q.kill(q.players[0], null, 'x'); q.players[0].respawnT = 1e9;
      const S = q.snakes.slice(1);
      S.slice(0, 6).forEach((s, i) => { s.ai = false; s.spawn(Math.cos(i) * 70, Math.sin(i) * 70, i, 400); s.input.turn = i & 1 ? 0.35 : -0.35; });
      for (let t = 0; t < 60; t += 1 / 30) { q.step(1 / 30); for (const e of q.events) if (e.t === 'die' && q.snakes[e.s].ai && (e.by < 0 || !q.snakes[e.by].ai)) crashes++; q.events.length = 0; for (const s of S.slice(0, 6)) if (!s.alive) s.respawnT = 1e9; }
      eaten += S.slice(6).reduce((a, s) => a + s.eaten, 0);
    }
    return { crashes, eaten };
  };
  const E = course('facile'), H = course('difficile');
  ok(H.crashes <= 3 && E.crashes <= 4, `rivals dodge big bodies and the wall (crashes: hard ${H.crashes}, easy ${E.crashes})`);
  ok(H.eaten > E.eaten, `hard rivals eat more (${H.eaten} vs ${E.eaten})`);
  // a free-for-all of rivals only: a sharper pack must not die more often than the normal one (hunting each other)
  const pack = (d) => { let n = 0; for (const seed of [1, 2, 3, 4]) { const q = new Sim({ seed, mode: 'classica', diff: d, missions: false }); q.kill(q.players[0], null, 'x'); q.players[0].respawnT = 1e9; for (let t = 0; t < 90; t += 1 / 30) { q.step(1 / 30); for (const e of q.events) if (e.t === 'die' && q.snakes[e.s].ai) n++; q.events.length = 0; } } return n; };
  const dn = pack('normale'), dh = pack('difficile');
  ok(dh <= dn * 1.1 + 2, `hard rivals do not die more than normal ones (${dh} vs ${dn})`);
}
// --- duo: two players, both respawn
{
  const s = new Sim({ seed: 8, mode: 'duo' });
  ok(s.players.length === 2 && s.snakes.length === 2 + MODES.duo.rivals, 'duo has two players');
  run(s, 5);
  ok(s.players.every((p) => p.alive || p.respawnT > 0), 'duo players alive or respawning');
}
// --- determinism: same seed, same story
{
  const a = new Sim({ seed: 42 }), b = new Sim({ seed: 42 });
  a.autopilot(a.players[0]); b.autopilot(b.players[0]);
  run(a, 30); run(b, 30);
  ok(a.snakes.every((s, i) => s.x === b.snakes[i].x && s.m === b.snakes[i].m), 'deterministic for a seed');
}
// --- daily spec and every arena / mode boots
{
  const d1 = dailySpec(new Date(2026, 10, 19)), d2 = dailySpec(new Date(2026, 10, 19)), d3 = dailySpec(new Date(2026, 10, 20));
  ok(JSON.stringify(d1) === JSON.stringify(d2) && d1.key !== d3.key, 'daily spec stable per day');
  for (const ar of Object.keys(ARENAS)) for (const m of Object.keys(MODES)) { const s = new Sim({ seed: 2, arena: ar, mode: m, twist: d1.twist }); run(s, 2); ok(!s.over && s.nFood > 100, `${m} @ ${ar} runs`); }
  ok(new Sim({ seed: 1 }).missions.length === 3, 'three missions');
}
console.log(`${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
