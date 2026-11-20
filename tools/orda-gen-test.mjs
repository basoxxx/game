// Orda level generator — node test. Many seeds × difficulties must give valid, deterministic,
// solvable levels (checked on fresh Sim seeds the generator never saw), with a difficulty curve that
// rises monotonically; plus daily / endless / perk / streak checks.
//   node tools/orda-gen-test.mjs [seeds=500]
import { Sim, autopilot } from '../src/orda/sim.js';
import { useCore, generateLevel, validate, play, hardness, laneSpread } from '../src/orda/gen.js';
import { dailySpec, dailyInfo, endlessWave, newRun, rollPerks, perkById, perkUps, splitUps, endlessLine, shareText, dayNumber, recordDaily, omLoad, addDays, liveStreak, waveDifficulty, GEN_VERSION, DAILY_LOADOUT } from '../src/orda/modes.js';

globalThis.localStorage ??= { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
useCore({ Sim, autopilot });
const N = +(process.argv[2] || 500);
const DIFFS = [0.1, 0.3, 0.5, 0.7, 0.9];
let fail = 0;
const bad = (msg) => { fail++; if (fail < 40) console.log('FAIL', msg); };
const t0 = Date.now();
const stat = DIFFS.map(() => ({ n: 0, hard: 0, decT: 0, decWin: 0, sharpWin: 0, novWin: 0, spread: 0, crowd: 0, hp: 0, fallback: 0, ms: 0, gates: 0, obs: 0 }));
for (let i = 1; i <= N; i++) {
  const di = i % DIFFS.length, d = DIFFS[di], seed = i * 7919;
  const ta = Date.now();
  const L = generateLevel(seed, d);
  const st = stat[di]; st.ms += Date.now() - ta;
  const v = validate(L);
  if (!v.ok) bad(`seed ${seed} d${d}: invalid ${v.errors.join(', ')}`);
  JSON.parse(JSON.stringify(L));
  if (i % 10 === 0 && JSON.stringify(generateLevel(seed, d)) !== JSON.stringify(L)) bad(`seed ${seed}: not deterministic`);
  // fresh Sim seeds: the generator calibrated on other ones
  const dec = play(L, { player: 'decent', seed: 9000 + i });
  const sharp = play(L, { player: 'sharp', seed: 19000 + i });
  const nov = play(L, { player: 'novice', seed: 29000 + i });
  if (!dec.won && !sharp.won) bad(`seed ${seed} d${d}: unsolved (decent ${dec.why}, sharp ${sharp.why}, base ${sharp.baseHp}/${sharp.baseMax})`);
  st.n++; st.hard += hardness(L); st.decT += (dec.won ? dec.time : L.time * 1.2) / L.time; st.decWin += dec.won; st.sharpWin += sharp.won; st.novWin += nov.won;
  st.spread += Math.min(20, laneSpread(L).spread); st.crowd += Math.max(dec.maxCrowd, sharp.maxCrowd); st.hp += L.base.hp; st.fallback += L.check?.fallback ? 1 : 0; st.gates += L.gates.length; st.obs += L.obstacles.length;
  if (i % 50 === 0) process.stdout.write(`  ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}
const pc = (x, n) => `${Math.round((x / n) * 100)}%`.padStart(5);
console.log('\n diff  hardness  decT/time  decent  sharp  novice  spread  crowd  base-hp  gates  obst  fallback  ms/level');
let prev = null;
stat.forEach((st, i) => {
  const n = st.n, h = st.hard / n, dt = st.decT / n, nw = st.novWin / n;
  console.log(` ${DIFFS[i].toFixed(1)}   ${h.toFixed(3)}     ${dt.toFixed(3)}    ${pc(st.decWin, n)}  ${pc(st.sharpWin, n)}  ${pc(st.novWin, n)}   ${(st.spread / n).toFixed(2).padStart(5)}  ${String(Math.round(st.crowd / n)).padStart(5)}  ${String(Math.round(st.hp / n)).padStart(7)}  ${(st.gates / n).toFixed(1).padStart(5)}  ${(st.obs / n).toFixed(1).padStart(4)}  ${String(st.fallback).padStart(8)}  ${String(Math.round(st.ms / n)).padStart(8)}`);
  if (prev) {
    if (h <= prev.h) bad(`difficulty curve not monotonic at ${DIFFS[i]} (hardness ${h.toFixed(3)} <= ${prev.h.toFixed(3)})`);
    if (dt <= prev.dt) bad(`decent clear-time not monotonic at ${DIFFS[i]}`);
    // multipliers amplify aim a lot since the fast redesign: the novice model is noisier (±20%)
    if (nw > prev.nw + 0.2) bad(`novice win-rate rises at ${DIFFS[i]}`);
    else if (nw > prev.nw + 0.05) console.log(`  note: novice win-rate up at ${DIFFS[i]} (noisy model, within tolerance)`);
  }
  if (st.fallback / n > 0.05) bad(`too many fallback levels at ${DIFFS[i]}`);
  prev = { h, dt, nw };
});

// ---- daily: same day → same level (also through the cache), different days differ, numbering
const a = dailySpec(new Date(2026, 10, 19, 8)), b = dailySpec(new Date(2026, 10, 19, 23, 59)), c = dailySpec(new Date(2026, 10, 20));
if (JSON.stringify(a.level) !== JSON.stringify(b.level)) bad('daily not stable within a day');
const fresh = generateLevel(dailyInfo(new Date(2026, 10, 19)).seed, dailyInfo(new Date(2026, 10, 19)).difficulty, { lo: DAILY_LOADOUT });
if (JSON.stringify(fresh.gates) !== JSON.stringify(a.level.gates) || fresh.base.hp !== a.level.base.hp) bad('daily differs from a fresh generation');
if (JSON.stringify(a.level.gates) === JSON.stringify(c.level.gates)) bad('daily identical on two days');
if (a.num !== 19 || dayNumber(new Date(2026, 10, 1)) !== 1 || GEN_VERSION < 1) bad(`daily numbering ${a.num}`);
let dailyOk = 0;
for (let i = 0; i < 28; i++) { const sp = dailySpec(new Date(2026, 10, 1 + i)); const v = validate(sp.level); if (!v.ok) bad(`daily ${sp.key} invalid: ${v.errors}`); else dailyOk++; }
console.log(`\ndaily: ${dailyOk}/28 valid · #${a.num} «${a.level.name}» d=${a.difficulty} base ${a.level.base.hp}`);
console.log(shareText(a, { won: true, stars: 3, figures: 1234, maxCrowd: 420, time: 61, streak: 4 }));
console.log(shareText(a, { won: false, figures: 812, baseHpPct: 0.35, maxCrowd: 120 }));

// ---- streaks and practice
const s = omLoad();
recordDaily(s, { key: '2026-11-17', reward: 80, num: 17 }, { won: true, stars: 2, figures: 10 });
recordDaily(s, { key: '2026-11-18', reward: 80, num: 18 }, { won: true, stars: 2, figures: 10 });
const second = recordDaily(s, { key: '2026-11-18', reward: 80, num: 18 }, { won: true, stars: 3, figures: 99 });
if (s.streak !== 2 || second.official || s.daily['2026-11-18'].stars !== 2) bad(`streak ${s.streak} / practice overwrote the official result`);
if (liveStreak(s, '2026-11-19') !== 2 || liveStreak(s, '2026-11-21') !== 0) bad('live streak');
recordDaily(s, { key: '2026-11-20', reward: 80, num: 20 }, { won: false });
if (s.streak !== 1 || addDays('2026-12-31', 1) !== '2027-01-01') bad('streak reset / addDays');

// ---- endless: every wave valid, a decent player with random perk picks clears the early waves,
// waves get harder, perk offers are 3 distinct legal picks
const ew = [];
const RUNS = 8, WAVES = 12;
for (let k = 1; k <= RUNS; k++) {
  const run = newRun(k * 31);
  for (let w = 1; w <= WAVES; w++) {
    run.wave = w;
    const L = endlessWave(run);
    const v = validate({ ...L, time: 120, stars: { par: 60, crowd: 1 } });
    if (!v.ok) bad(`endless run ${k} wave ${w}: ${v.errors.join(', ')}`);
    ew[w] = (ew[w] || 0) + hardness({ ...L, time: 120 }) / RUNS;
    if (w <= 5) {
      // a decent player clears it on most attempts (the autopilot has the odd unlucky stall)
      const rs = [0, 1, 2].map((j) => play(L, { player: 'decent', seed: k * 100 + w + j * 7777, up: perkUps(run.perks), maxTime: 240 }));
      if (rs.filter((x) => x.won).length < 2) bad(`endless run ${k} wave ${w}: decent player can't clear (${rs.map((x) => x.why).join('/')})`);
    }
    const opts = rollPerks(run.seed, w, run.perks);
    if (new Set(opts).size !== 3 || opts.some((id) => !perkById(id))) bad('perk roll not 3 distinct perks');
    const p = perkById(opts[0]); run.perks.push(p.id); p.now?.(run);
  }
}
console.log(`\nendless hardness by wave (d ${waveDifficulty(1)}…${waveDifficulty(WAVES).toFixed(2)}): ${ew.slice(1).map((h) => h.toFixed(2)).join(' ')}`);
for (let w = 3; w < ew.length; w++) if (ew[w] < ew[w - 2] - 0.03) bad(`endless hardness drops at wave ${w}`);
// ---- endless: the cannon's line survives the armour upgrade unchanged (it used to compound every
// wave: 40 → 88 → 194 with Bastione 6), damage carries over in level units, perks past the caps count
{
  const run = newRun(5, { armor: 6, rate: 10 });
  for (let w = 1; w <= 3; w++) {
    run.wave = w; const L = endlessWave(run);
    const s = new Sim(L, { up: { armor: 6 }, seed: 1, countdown: 0 });
    run.line = endlessLine(run, s.cannon.hp, s.cannon.max); // a wave won without a scratch
  }
  if (run.line !== run.lineMax) bad(`endless line compounds with armour: ${run.line}/${run.lineMax}`);
  run.wave = 4; const s4 = new Sim(endlessWave(run), { up: { armor: 6 }, seed: 1, countdown: 0 });
  if (endlessLine(run, s4.cannon.max / 2, s4.cannon.max) !== Math.round(run.lineMax / 2) || endlessLine(run, 0, s4.cannon.max) !== 0 || endlessLine(run, 0.3, s4.cannon.max) !== 1) bad('endless line from the cannon hp');
  run.line = 15; const s5 = new Sim(endlessWave(run), { up: { armor: 6 }, seed: 1, countdown: 0 });
  if (s5.cannon.hp !== Math.round(15 * 2.2) || s5.cannon.max !== Math.round(run.lineMax * 2.2)) bad(`damaged cannon carried: ${s5.cannon.hp}/${s5.cannon.max}`);
  const sp = splitUps(perkUps(['cadenza', 'cadenza', 'tempra'], { rate: 10, hp: 3 }));
  if (sp.up.rate !== 10 || sp.upBonus.rate !== 4 || sp.up.hp !== 5 || sp.upBonus.hp) bad(`splitUps ${JSON.stringify(sp)}`);
  const offer = rollPerks(9, 3, [], { rate: 10, shot: 6, hp: 8, speed: 8 });
  if (!offer.some((id) => perkById(id).up)) console.log('  note: no upgrade perk in this roll');
  if (rollPerks(9, 3, ['cadenza', 'cadenza', 'cadenza'], { rate: 10 }).includes('cadenza')) bad('perk past its max offered');
  console.log('endless line / perks past the caps: ok');
}
console.log(`\n${N} seeds in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${fail ? `${fail} FAILURES` : 'all OK'}`);
process.exit(fail ? 1 : 0);
