// Orda level generator — node unit test: many seeds × difficulties must give valid, solvable,
// interesting levels, with a difficulty curve that rises monotonically; plus daily/endless/perk checks.
//   node tools/orda-gen-test.mjs [seeds=500]
import { generateLevel, validate, simulate, yieldProfile, hardness, SKILL, dailySpec, endlessWave, newRun, rollPerks, PERKS, shareText, dayNumber, recordDaily, omLoad, addDays, liveStreak, starsFor } from '../src/orda/modes.js';

globalThis.localStorage ??= { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } };
const N = +(process.argv[2] || 500);
const DIFFS = [0.1, 0.3, 0.5, 0.7, 0.9];
let fail = 0;
const bad = (msg) => { fail++; if (fail < 30) console.log('FAIL', msg); };
const t0 = Date.now();
const stat = DIFFS.map(() => ({ hard: 0, decT: 0, novWin: 0, expWin: 0, decWin: 0, spread: 0, shot: 0, hp: 0, n: 0, fallback: 0 }));
for (let s = 1; s <= N; s++) {
  const di = s % DIFFS.length, d = DIFFS[di];
  const L = generateLevel(s * 7919, d);
  const v = validate(L);
  if (!v.ok) bad(`seed ${s} d${d}: invalid ${v.errors.join(', ')}`);
  if (JSON.stringify(generateLevel(s * 7919, d)) !== JSON.stringify(L)) bad(`seed ${s}: not deterministic`);
  JSON.parse(JSON.stringify(L)); // plain JSON
  const dec = simulate(L, { skill: SKILL.decent, seed: s });
  const exp = simulate(L, { skill: SKILL.expert, seed: s + 1 });
  const nov = simulate(L, { skill: SKILL.novice, seed: s + 2 });
  if (!exp.won) bad(`seed ${s} d${d}: expert loses (${exp.why})`);
  if (!dec.won) bad(`seed ${s} d${d}: decent loses (${dec.why}, hp left ${dec.hpLeft}/${L.base.hp})`);
  if (exp.won && L.timer - exp.time < L.stars.t2 - 25) bad(`seed ${s} d${d}: 2 stars out of reach even for experts`);
  const p = yieldProfile(L);
  if (p.spread < 1.5) bad(`seed ${s}: no real lane choice (spread ${p.spread.toFixed(2)})`);
  const st = stat[di];
  st.n++; st.hard += hardness(L); st.decT += dec.time / L.timer; st.novWin += nov.won; st.expWin += exp.won; st.decWin += dec.won; st.spread += p.spread; st.shot += exp.maxShot; st.hp += L.base.hp; st.fallback += L.check ? 0 : 1;
}
console.log('\ndiff  hardness  decentT/timer  novice-win  decent-win  expert-win  lane-spread  max-shot  base-hp  fallback');
let prev = -1;
stat.forEach((st, i) => {
  const h = st.hard / st.n;
  console.log(`${DIFFS[i].toFixed(1)}   ${h.toFixed(3)}     ${(st.decT / st.n).toFixed(3)}          ${(st.novWin / st.n * 100).toFixed(0).padStart(3)}%       ${(st.decWin / st.n * 100).toFixed(0).padStart(3)}%       ${(st.expWin / st.n * 100).toFixed(0).padStart(3)}%       ${(st.spread / st.n).toFixed(2)}        ${Math.round(st.shot / st.n)}       ${Math.round(st.hp / st.n)}     ${st.fallback}`);
  if (h <= prev) bad(`difficulty curve not monotonic at ${DIFFS[i]} (${h.toFixed(3)} <= ${prev.toFixed(3)})`);
  if (i && st.decT / st.n <= stat[i - 1].decT / stat[i - 1].n) bad(`decent clear-time ratio not monotonic at ${DIFFS[i]}`);
  if (i && st.novWin / st.n > stat[i - 1].novWin / stat[i - 1].n + 0.05) bad(`novice win-rate rises at ${DIFFS[i]}`);
  prev = h;
});

// daily: same day → same level; different days differ; numbering
const a = dailySpec(new Date(2026, 10, 19)), b = dailySpec(new Date(2026, 10, 19, 23, 59)), c = dailySpec(new Date(2026, 10, 20));
if (JSON.stringify(a.level) !== JSON.stringify(b.level)) bad('daily not stable within a day');
if (JSON.stringify(a.level.gates) === JSON.stringify(c.level.gates)) bad('daily same on two days');
if (a.num !== 19 || dayNumber(new Date(2026, 10, 1)) !== 1) bad(`daily numbering ${a.num}`);
for (let i = 0; i < 60; i++) { const sp = dailySpec(new Date(2026, 10, 1 + i)); if (!validate(sp.level).ok) bad(`daily ${sp.key} invalid`); }
console.log('\n' + shareText(a, { won: true, stars: 3, figures: 1234, maxShot: 420, time: 61, streak: 4 }));
console.log(shareText(a, { won: false, figures: 812, baseHpPct: 0.35, maxShot: 120 }));
// streaks
const s = omLoad();
recordDaily(s, { key: '2026-11-17', reward: 80, num: 17 }, { won: true, stars: 2, figures: 10 });
recordDaily(s, { key: '2026-11-18', reward: 80, num: 18 }, { won: true, stars: 2, figures: 10 });
const second = recordDaily(s, { key: '2026-11-18', reward: 80, num: 18 }, { won: true, stars: 3, figures: 99 });
if (s.streak !== 2 || second.official) bad(`streak ${s.streak} / practice`);
if (liveStreak(s, '2026-11-19') !== 2 || liveStreak(s, '2026-11-21') !== 0) bad('live streak');
recordDaily(s, { key: '2026-11-20', reward: 80, num: 20 }, { won: false });
if (s.streak !== 1 || addDays('2026-12-31', 1) !== '2027-01-01') bad('streak reset / addDays');
if (starsFor({ timer: 100, stars: { t2: 20, t3: 50 } }, true, 60) !== 3 || starsFor({ timer: 100, stars: { t2: 20, t3: 50 } }, true, 10) !== 1) bad('starsFor');

// endless: waves valid, beatable by a decent player with a few perks, base grows, perks distinct
const ew = [];
for (let seed = 1; seed <= 20; seed++) {
  const run = newRun(seed * 31);
  for (let w = 1; w <= 12; w++) {
    run.wave = w;
    const L = endlessWave(run);
    const v = validate(L);
    if (!v.ok) bad(`endless ${seed} w${w}: ${v.errors.join(', ')}`);
    ew[w] = (ew[w] || 0) + hardness(L) / 20;
    const r = simulate(L, { skill: SKILL.decent, seed, maxTime: 240 });
    if (w <= 6 && !r.won) bad(`endless ${seed} w${w}: decent player can't clear (${r.why})`);
    const opts = rollPerks(run.seed, w, run.perks);
    if (new Set(opts).size !== 3) bad('perk roll not 3 distinct');
    run.perks.push(opts[0]);
  }
}
console.log('\nendless hardness by wave:', ew.slice(1).map((h) => h.toFixed(2)).join(' '));
for (let w = 3; w < ew.length; w++) if (ew[w] < ew[w - 2] - 0.02) bad(`endless hardness drops at wave ${w}`);
if (PERKS.length < 6) bad('few perks');
console.log(`\n${N} seeds in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${fail ? `${fail} FAILURES` : 'all OK'}`);
process.exit(fail ? 1 : 0);
