// Orda campaign tuner: plays every hand-made layout (src/orda/levels.js, RAW_LEVELS) in campaign order
// with the autopilot and the upgrades a player would own by then, and sizes the numbers that set the
// pace: base hit points (the level lasts about `target` seconds), red pressure (`press` × the blue
// flow), hit points of towers / brutes / giants, the clock and the star goals. Writes
// src/orda/levels-tune.js.
//   node tools/orda-tune.mjs            → tune all levels and write the file
//   node tools/orda-tune.mjs 7 12       → only levels 7 and 12 (the others keep their numbers)
import { writeFileSync } from 'node:fs';
import { RAW_LEVELS, applyTune } from '../src/orda/levels.js';
import { TUNE as OLD } from '../src/orda/levels-tune.js';
import { Sim, autopilot } from '../src/orda/sim.js';
import { UPGRADES, upCost, upEffects, CHAMPIONS, starsFor, coinsFor } from '../src/orda/meta.js';

const only = process.argv.slice(2).map(Number).filter(Boolean);
const round5 = (v) => Math.round(v / 5) * 5;
function run(L, up, champ, seed, maxT = 400) {
  const s = new Sim(L, { up, champ, seed, countdown: 0 }); s.state = 'play';
  let f = 0;
  while (s.state === 'play' && f < 30 * maxT) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); f++; }
  return { ...s.result(), stars: 0 };
}
function probe(L, up, champ) {
  const P = { ...L, time: 999, base: { ...L.base, hp: 1e9, spawners: [], waves: null, towers: [], phases: [], giants: null } };
  const s = new Sim(P, { up, champ, seed: 3, countdown: 0 }); s.state = 'play';
  let d0 = 0;
  for (let f = 0; f < 30 * 30; f++) { Object.assign(s.input, autopilot(s, { champ: false })); s.step(1 / 30); if (f === 30 * 10) d0 = s.stats.baseDmg; }
  return (s.stats.baseDmg - d0) / 20;
}
const redRate = (b) => b.spawners.reduce((a, s) => a + s.rate * s.count, 0) + (b.waves ? b.waves.count / b.waves.every : 0) + b.towers.reduce((a, t) => a + t.rate * t.count, 0);

const TUNE = { ...OLD };
const up = {}; let coins = 0;
for (const R of RAW_LEVELS) {
  const owned = CHAMPIONS.filter((c) => c.unlock < R.id); const champ = owned[owned.length - 1].id;
  if (!only.length || only.includes(R.id)) {
    const target = R.target || 30, travel = R.len / upEffects(up).speed + 1;
    const P = probe(applyTune(R, { k: 1, hp: 1e9, time: 999, par: 1, crowd: 1 }), up, champ);
    let k = ((R.press ?? 0.22) * P) / Math.max(0.1, redRate(R.base)), kh = P / 40;
    let hp = Math.max(50, Math.round(P * (target - travel) * 0.75));
    let res = [];
    const weakUp = Object.fromEntries(Object.entries(up).map(([k2, v]) => [k2, Math.floor(v / 2)]));
    const go = () => { const L = applyTune(R, { k, kh, hp, time: 999, par: 1, crowd: 1 }); res = [1, 2].map((seed) => run(L, up, champ, seed, target * 4)); return res.reduce((a, r) => a + (r.win ? r.time : target * 3), 0) / res.length; };
    // 1) red pressure: the reds may slow the assault down, not stall it (≤ 1.3× the time without them)
    for (let it = 0; it < 12; it++) {
      const t = go(), free = travel + hp / (P * 0.85);
      // and a weaker player (half the upgrades) must still win before the clock runs out
      const weak = run(applyTune(R, { k, kh, hp, time: Math.max(target * 2.2, target + 30), par: 1, crowd: 1 }), weakUp, champ, 7);
      if (res.some((r) => !r.win && r.why === 'overrun') || t > free * 1.25 || !weak.win) { k *= 0.8; kh *= 0.92; } else break;
    }
    // 2) base hit points for the target duration
    for (let it = 0; it < 10; it++) {
      const t = go();
      if (res.every((r) => r.win) && Math.abs(t - target) < Math.max(1.2, target * 0.04)) break;
      if (res.some((r) => !r.win && r.why === 'overrun')) { k *= 0.85; continue; }
      hp = Math.max(30, Math.round(hp * Math.max(0.35, Math.min(2.5, (target - travel) / Math.max(1, t - travel)))));
    }
    const ts = res.map((r) => r.time), tAvg = ts.reduce((a, b) => a + b, 0) / ts.length;
    TUNE[R.id] = {
      hp: round5(hp), k: +k.toFixed(3), kh: +kh.toFixed(3),
      time: round5(Math.max(target * 2.2, target + 30)), par: Math.round(tAvg * 1.15 + 1),
      crowd: Math.max(10, round5(Math.min(...res.map((r) => r.left)) * 0.7)),
    };
    console.log(`${String(R.id).padStart(2)} ${R.name.padEnd(24)} P=${P.toFixed(0).padStart(5)} k=${k.toFixed(2).padStart(5)} hp=${String(TUNE[R.id].hp).padStart(6)} t=${ts.map((x) => x.toFixed(1)).join('/')} (target ${target}) left=${res.map((r) => r.left).join('/')} ${res.map((r) => (r.win ? 'W' : r.why)).join('')} [${UPGRADES.map((u) => `${u.id[0]}${up[u.id] || 0}`).join(' ')}] ${champ}`);
  }
  // play it as the campaign would, collect the coins, spend them on the cheapest upgrade
  const L = applyTune(R, TUNE[R.id]);
  const r = run(L, up, champ, 1); coins += coinsFor(L, starsFor(L, r), 0, r.win);
  for (;;) { const o = UPGRADES.filter((u) => (up[u.id] || 0) < u.max).map((u) => ({ u, c: upCost(u, up[u.id] || 0) })).sort((a, b) => a.c - b.c)[0]; if (!o || o.c > coins) break; coins -= o.c; up[o.u.id] = (up[o.u.id] || 0) + 1; }
}
const out = `// generated by tools/orda-tune.mjs — do not edit by hand (re-run the tool after changing a layout)\n// id: { hp: base hit points, k: red pressure ×, kh: towers/brutes/giants hp ×, time, par, crowd }\nexport const TUNE = {\n${Object.entries(TUNE).map(([id, t]) => `  ${id}: ${JSON.stringify(t).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')},`).join('\n')}\n};\n`;
writeFileSync(new URL('../src/orda/levels-tune.js', import.meta.url), out);
console.log('wrote src/orda/levels-tune.js');
