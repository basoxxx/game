// Orda simulation self-test (no browser): gate maths, one pass per gate, pool folding, champions,
// win / lose, determinism, and every campaign level winnable by the autopilot with mid upgrades.
//   node tools/orda-selftest.mjs
import { Sim, autopilot, CANNON_Z } from '../src/orda/sim.js';
import { LEVELS } from '../src/orda/levels.js';
import { starsFor, coinsFor, upEffects, UPGRADES, catchUp } from '../src/orda/meta.js';
import { dsin, dcos, dexp, dlog2 } from '../src/orda/dmath.js';
import { createHash } from 'node:crypto';

const SIM_FP = 'b786cad007e6';
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const lvl = (gates, extra = {}) => ({ id: 1, name: 't', world: 0, len: 60, time: 60, stars: { par: 30, crowd: 10 }, cannon: { hp: 20 }, gates, obstacles: [], base: { hp: 1e6, spawners: [], towers: [] }, ...extra });
const mk = (L, o = {}) => { const s = new Sim(L, { countdown: 0, seed: 5, ...o }); s.state = 'play'; return s; };
// fire exactly n single figures straight up the middle, run until they all reached the base
function shoot(s, n, x = 0) {
  for (let i = 0; i < n; i++) s.blue.add(x, CANNON_Z + 1 + i * 0.05, s.hpB, 0, 0.5);
  for (let f = 0; f < 60 * 20 && s.blue.n; f++) s.step(1 / 60);
  return s.stats.baseDmg;
}
ok(shoot(mk(lvl([{ x: 0, y: 20, w: 6, type: 'mul', value: 3 }])), 10) === 30, '×3: 10 figures → 30 hits');
ok(shoot(mk(lvl([{ x: 0, y: 20, w: 6, type: 'add', value: 4 }])), 10) === 50, '+4: 10 figures → 50 hits');
ok(shoot(mk(lvl([{ x: 0, y: 20, w: 6, type: 'sub', value: 7 }])), 10) === 3, '−7 budget: 10 figures → 3 hits');
ok(shoot(mk(lvl([{ x: 0, y: 20, w: 6, type: 'div', value: 2 }])), 10) === 5, '÷2: 10 figures → 5 hits');
ok(shoot(mk(lvl([{ x: 0, y: 20, w: 6, type: 'mul', value: 2 }, { x: 0, y: 34, w: 6, type: 'mul', value: 3 }])), 10) === 60, '×2 then ×3: 10 → 60 (clones still meet the second gate)');
ok(shoot(mk(lvl([{ x: 5, y: 20, w: 4, type: 'mul', value: 3 }])), 10) === 10, 'gate off the path does nothing');
{ // a moving gate swept over the same figures repeatedly still counts once per figure
  const s = mk(lvl([{ x: 0, y: 20, w: 16, type: 'mul', value: 2, move: { amp: 0.5, speed: 3 } }]));
  ok(shoot(s, 10) === 20, 'gate counts once per figure (clones inherit the mark)');
}
{ // tiny pool: clones fold into units, the maths is the same
  const s = mk(lvl([{ x: 0, y: 20, w: 6, type: 'mul', value: 3 }, { x: 0, y: 34, w: 6, type: 'mul', value: 3 }]), { cap: 12 });
  ok(shoot(s, 10) === 90 && s.stats.peak <= 12, `pool cap 12: 10 → 90 hits, peak bodies ${s.stats.peak}`);
}
{ // 1:1 clash
  const L = lvl([]); const s = mk(L);
  for (let i = 0; i < 20; i++) s.blue.add(0, 20 + i * 0.4, s.hpB, 0, 0.1);
  for (let i = 0; i < 12; i++) s.addRed(0, 30 + i * 0.4, 1);
  for (let f = 0; f < 60 * 10; f++) s.step(1 / 60);
  ok(Math.round(s.stats.kills) === 12 && s.stats.baseDmg === 8, `clash 20 blue vs 12 red: kills ${s.stats.kills}, base hits ${s.stats.baseDmg}`);
}
{ // champions: launch when charged, reach the base, deal their damage
  for (const id of ['colosso', 'grillo', 'matrioska', 'testuggine']) {
    const s = mk(lvl([{ x: 0, y: 20, w: 6, type: 'mul', value: 2 }], { base: { hp: 1e6, spawners: [], towers: [] } }), { champ: id });
    s.charge = s.chargeNeed; s.input.champ = true; s.step(1 / 60);
    let hit = false; for (let f = 0; f < 60 * 30 && !hit; f++) { s.step(1 / 60); if (s.ev.some((e) => e.t === 'champHit')) hit = true; s.ev.length = 0; }
    for (let f = 0; f < 60 * 3; f++) s.step(1 / 60);
    const exp = { colosso: 45, grillo: 28, matrioska: 10 + 20, testuggine: 18 }[id]; // the splitter doubled in the ×2 gate: 10 → 20 figures
    ok(hit && Math.round(s.stats.baseDmg) === exp, `champion ${id}: hit the base for ${Math.round(s.stats.baseDmg)} (expected ${exp})`);
  }
}
{ // win / lose
  const L = { ...LEVELS[0] }; const s = mk(L);
  for (let f = 0; f < 60 * 120 && s.state === 'play'; f++) { Object.assign(s.input, autopilot(s)); s.step(1 / 60); }
  const r = s.result(); const st = starsFor(L, r);
  ok(r.win && st >= 1, `level 1 won by autopilot in ${r.time}s, ${st} stars, ${coinsFor(L, st, 0, true)} coins`);
  const s2 = mk(L); for (let f = 0; f < 60 * 100 && s2.state === 'play'; f++) s2.step(1 / 60);
  ok(s2.state === 'lost' && (s2.why === 'time' || s2.why === 'overrun'), `idle cannon loses (${s2.why})`);
}
{ // determinism
  const run = () => { const s = mk(LEVELS[8], { up: { rate: 3 } }); for (let f = 0; f < 60 * 25; f++) { Object.assign(s.input, autopilot(s)); s.step(1 / 60); } return JSON.stringify([s.base.hp, s.blue.n, s.red.n, s.stats]); };
  ok(run() === run(), 'same seed + same input → same game');
}
{ // every level winnable with mid-campaign upgrades and the champion the player would have
  const up = (n) => ({ rate: Math.round(n / 6), shot: Math.round(n / 10), hp: Math.round(n / 7), speed: Math.round(n / 6), charge: Math.round(n / 8), armor: Math.round(n / 6) });
  const ch = (n) => (n > 15 ? 'testuggine' : n > 10 ? 'matrioska' : n > 5 ? 'grillo' : 'colosso');
  const lost = [];
  for (const L of LEVELS) {
    let won = false;
    for (const seed of [1, 2, 3]) {
      const s = new Sim(L, { up: up(L.id), champ: ch(L.id), seed, countdown: 0 }); s.state = 'play';
      for (let f = 0; f < 30 * (L.time + 2) && s.state === 'play'; f++) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); }
      if (s.state === 'won') { won = true; break; }
    }
    if (!won) lost.push(L.id);
  }
  ok(!lost.length, `all ${LEVELS.length} levels winnable by the autopilot${lost.length ? ` (not: ${lost.join(', ')})` : ''}`);
}
{ // deterministic maths (bit-identical in every browser): accurate, and the Sim no longer calls Math.sin & co.
  let e = 0; for (let i = 0; i < 20000; i++) { const x = (i - 10000) * 0.0937; e = Math.max(e, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)), Math.abs(dexp(x / 400) / Math.exp(x / 400) - 1), Math.abs(dlog2(1 + i * 3.3) - Math.log2(1 + i * 3.3))); }
  ok(e < 1e-13 && dlog2(8) === 3 && dexp(0) === 1, `dmath matches Math within ${e.toExponential(1)}`);
  // golden trace of a full autopilot match: the same on every engine (a change here = a change of the sim)
  const s = new Sim(LEVELS[12], { up: { rate: 3, shot: 2, hp: 2 }, champ: 'grillo', seed: 77, countdown: 0, cap: 300 }); s.state = 'play';
  const h = createHash('sha1');
  for (let f = 0; f < 30 * 40 && s.state === 'play'; f++) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); if (f % 30 === 0) h.update(new Float64Array([s.base.hp, s.cannon.hp, s.blue.n, s.red.n, s.blue.x[0] || 0, s.red.z[0] || 0])); }
  const fp = h.digest('hex').slice(0, 12);
  ok(fp === SIM_FP, `sim fingerprint ${fp} (expected ${SIM_FP}: update SIM_FP only for a deliberate change of the simulation)`);
  const src = (await import('node:fs')).readFileSync(new URL('../src/orda/sim.js', import.meta.url), 'utf8');
  ok(!/Math\.(sin|cos|tan|exp|log|log2|pow|atan2?|hypot)\(/.test(src) && !/\*\*/.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '')), 'sim.js uses only exact maths (no Math.sin/exp/log2/pow, no **)');
}
{ // level.cannon.max: a cannon that starts damaged; both scale with the armour upgrade
  const s = mk(lvl([], { cannon: { hp: 10, max: 40 } }), { up: { armor: 5 } });
  ok(s.cannon.hp === 20 && s.cannon.max === 80, `cannon {hp 10, max 40} × armour 2 → ${s.cannon.hp}/${s.cannon.max}`);
  const s2 = mk(lvl([], { cannon: { hp: 30 } }));
  ok(s2.cannon.hp === 30 && s2.cannon.max === 30, 'cannon without max: full');
}
{ // maxCrowd in the result; upgrades past the cap (Infinita perks) still count
  const s = mk(lvl([{ x: 0, y: 20, w: 6, type: 'mul', value: 4 }]));
  shoot(s, 30);
  const r = s.result();
  ok(r.maxCrowd >= 100 && r.maxCrowd <= 120, `result.maxCrowd ${r.maxCrowd} (30 figures through ×4)`);
  const maxed = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const E0 = upEffects(maxed), E1 = upEffects(maxed, { rate: 2, shot: 2 }), E2 = upEffects(maxed, { rate: 99 });
  ok(E1.rate > E0.rate && E1.shot > E0.shot && E1.hp === E0.hp && E2.rate === upEffects(maxed, { rate: 6 }).rate, `upBonus past the cap: rate ${E0.rate} → ${E1.rate} (bonus capped at +6)`);
}
{ // raid towers: kind + range
  const tw = (kind, extra = {}) => lvl([], { base: { hp: 1e6, spawners: [], towers: [{ x: 0, y: 40, hp: 1e6, rate: 1, count: 0, kind, range: 5, ...extra }] } });
  const run = (L, x) => { const s = mk(L); for (let i = 0; i < 40; i++) s.blue.add(x, CANNON_Z + 1 + i * 0.3, s.hpB, 0, 0.5); let t = 0; for (let f = 0; f < 60 * 12 && s.blue.n; f++) { s.step(1 / 60); if (!t && s.stats.baseDmg) t = s.t; } return { s, t }; };
  const plain = run(tw(''), 2.6), slowIn = run(tw('slow', { slow: 0.5 }), 2.6), slowOut = run(tw('slow', { slow: 0.5, range: 1.5 }), 2.6);
  ok(slowIn.t > plain.t + 0.3 && Math.abs(slowOut.t - plain.t) < 0.05, `slow tower: first hit ${plain.t.toFixed(2)}s → ${slowIn.t.toFixed(2)}s in range, ${slowOut.t.toFixed(2)}s out of range`);
  const spIn = run(tw('splash', { count: 4 }), 0), spOut = run(tw('splash', { count: 4 }), 6.5);
  ok(spIn.s.stats.lost > 0 && spOut.s.stats.lost === 0, `splash tower: ${spIn.s.stats.lost} lost in range, ${spOut.s.stats.lost} out of range`);
  const snIn = run(tw('sniper', { count: 2 }), 0);
  ok(snIn.s.stats.lost > 0 && snIn.s.stats.lost % 2 === 0, `sniper tower: picked off ${snIn.s.stats.lost}`);
}
{ // catch-up: a player who never bought an upgrade is stuck late; after a loss the "spinta" gets them through
  const res = [24, 30, 35].map((id) => {
    const L = LEVELS.find((l) => l.id === id), go = (up) => { const s = new Sim(L, { up, champ: 'colosso', seed: 4, countdown: 0 }); s.state = 'play'; for (let f = 0; f < 30 * (L.time + 2) && s.state === 'play'; f++) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); } return s.state === 'won'; };
    return { id, bare: go({}), boost: go(catchUp({}, id, 1).up) };
  });
  ok(res.every((r) => r.boost) && catchUp({}, 24, 0) === null && catchUp({ rate: 10, shot: 6, hp: 8, speed: 8, charge: 8, armor: 6 }, 35, 5) === null, `catch-up boost wins levels ${res.map((r) => `${r.id} (${r.bare ? 'won' : 'lost'} without)`).join(', ')}; none on a first try or for an upgraded cannon`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
