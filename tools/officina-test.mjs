// Officina — node tests for the rules: merges, parts, shop, income, deliveries, offline earnings, garages,
// races, research, missions, new season and save repair.   node tools/officina-test.mjs
import * as C from '../src/officina/core.js';
import { CAR_MAX, PART_MAX, REGIONS, EVENTS, PERKS, rivalOf } from '../src/officina/data.js';
import { simulateRace, carPerf, makeTrack } from '../src/officina/race.js';

let fails = 0, n = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FAIL', name, '\n     ', e.message); } };
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} atteso ${JSON.stringify(b)}, ottenuto ${JSON.stringify(a)}`); };
const yes = (v, m) => { if (!v) throw new Error(m || 'falso'); };
const T0 = Date.UTC(2026, 10, 19, 10, 0, 0);
const fresh = () => C.newState(T0);

t('a new game: two karts, coins for the first purchase', () => {
  const s = fresh();
  eq(s.grid.length, 12); eq(s.grid[0].t, 1); eq(s.grid[1].t, 1); yes(s.coins >= 20);
  yes(C.canMerge(s.grid[0], s.grid[1]));
});
t('car + identical car = next tier, keeps the best parts of both', () => {
  const r = C.mergeResult(C.car(4, { motore: 3, aero: 1 }), C.car(4, { motore: 1, gomme: 2 }));
  eq(r.type, 'merge'); eq(r.item.t, 5); eq(r.item.parts, { motore: 3, aero: 1, gomme: 2, telaio: 0 });
});
t('different tiers or kinds do not merge (they swap)', () => {
  eq(C.mergeResult(C.car(3), C.car(4)), null);
  eq(C.mergeResult(C.part('motore', 2), C.part('aero', 2)), null);
  eq(C.mergeResult(C.part('motore', 2), C.part('motore', 3)), null);
  eq(C.mergeResult(C.crate('car', 1), C.crate('car', 1)), null);
  const s = fresh(); s.grid[2] = C.car(3);
  eq(C.move(s, 0, 2).type, 'swap'); eq(s.grid[0].t, 3); eq(s.grid[2].t, 1);
});
t('the top tier and the garage cap stop merges', () => {
  eq(C.mergeResult(C.car(CAR_MAX), C.car(CAR_MAX)), null);
  eq(C.mergeResult(C.car(7), C.car(7), REGIONS[0].cap).type, 'reject');
  const s = fresh(); s.grid[0] = C.car(7); s.grid[1] = C.car(7);
  const r = C.move(s, 1, 0); eq(r.type, 'reject'); eq(r.why, 'cap'); eq(s.grid[0].t, 7); eq(s.grid[1].t, 7);
  eq(C.findPair(s), null);
});
t('parts merge up to the maximum level', () => {
  eq(C.mergeResult(C.part('gomme', 3), C.part('gomme', 3)).item, C.part('gomme', 4));
  eq(C.mergeResult(C.part('gomme', PART_MAX), C.part('gomme', PART_MAX)), null);
});
t('a part dropped on a car is installed; the old one comes back; equal levels fuse; worse is refused', () => {
  const s = fresh(); s.grid[0] = C.car(5, { motore: 2 }); s.grid[1] = C.part('motore', 4); s.grid[2] = C.part('aero', 1);
  let r = C.move(s, 1, 0); eq(r.type, 'install'); eq(s.grid[0].parts.motore, 4); eq(s.grid[1], C.part('motore', 2));
  r = C.move(s, 2, 0); eq(r.type, 'install'); eq(s.grid[2], null); eq(s.grid[0].parts.aero, 1);
  s.grid[3] = C.part('aero', 1); r = C.move(s, 3, 0); eq(r.fused, true); eq(s.grid[0].parts.aero, 2);
  r = C.move(s, 1, 0); eq(r.type, 'reject'); eq(s.grid[1], C.part('motore', 2));
  eq(s.stats.installs, 3);
});
t('move onto an empty slot moves; merge counts, fills the Adrenalina gauge, discovers models', () => {
  const s = fresh(); const tok = s.tokens;
  eq(C.move(s, 1, 5).type, 'move'); eq(s.grid[1], null);
  const r = C.move(s, 5, 0); eq(r.type, 'merge'); yes(r.newBest && r.newModel); eq(s.best, 2); eq(s.tokens, tok + 1); yes(s.charge > 0); eq(s.stats.merges, 1);
});
t('shop: price grows with every purchase of the same tier, a full garage refuses', () => {
  const s = fresh(); s.coins = 1e9;
  const c0 = C.carCost(s, 1); C.buyCar(s, 1); const c1 = C.carCost(s, 1);
  yes(c1 > c0, 'prezzo in crescita');
  s.grid.fill(C.car(1)); eq(C.buyCar(s, 1).why, 'full');
  const p = fresh(); p.coins = 0; eq(C.buyCar(p).why, 'coins');
  eq(C.buyCar(fresh(), 9).why, 'tier');
});
t('the shop sells four tiers below the best car (never closer than two)', () => {
  const s = fresh(); s.best = 12; eq(C.derived(s).shopMax, 8);
  s.research.fornitori = 2; eq(C.derived(s).shopMax, 10);
});
t('income: only the best `lanes` cars run on the track, parts add a little', () => {
  const s = fresh(); s.grid.fill(null);
  for (let i = 0; i < 5; i++) s.grid[i] = C.car(i + 1);
  const D = C.derived(s); eq(D.lanes, 3);
  eq(C.trackCars(s).sort(), [2, 3, 4]);
  const base = C.baseIncome(s);
  yes(Math.abs(base - (C.carIncome(5) + C.carIncome(4) + C.carIncome(3))) < 1e-6);
  s.grid[4] = C.car(5, { motore: 2, gomme: 1 });
  yes(C.baseIncome(s) > base);
});
t('tick: coins and telemetry accrue, crates are delivered into free slots', () => {
  const s = fresh(); const c = s.coins;
  const ev = C.tick(s, 10, T0);
  yes(s.coins > c && s.rp > 0);
  yes(ev.some((e) => e.type === 'delivery'), 'consegna');
  const i = s.grid.findIndex((x) => x?.k === 'crate'); yes(i >= 0);
  const o = C.openCrate(s, i, () => 0.99); eq(o.item.k, 'car');
});
t('offline earnings: capped hours, reduced rate, no boosts', () => {
  const s = fresh(); s.boostUntil = T0 + 9e9; s.adrUntil = T0 + 9e9;
  s.lastSeen = T0; const inc = C.baseIncome(s), D = C.derived(s);
  const short = C.offlineEarnings(s, T0 + 3600e3);
  eq(short.capped, false); yes(Math.abs(short.coins - Math.floor(inc * 3600 * D.offEff)) <= 1);
  const long = C.offlineEarnings(s, T0 + 48 * 3600e3);
  eq(long.capped, true); eq(long.secs, D.offCap); yes(long.coins < inc * D.offCap);
  s.research.offcap = 3; s.research.offeff = 2;
  const better = C.offlineEarnings(s, T0 + 48 * 3600e3); yes(better.coins > long.coins);
  const c = s.coins; C.applyOffline(s, T0 + 48 * 3600e3); yes(s.coins > c); eq(s.lastSeen, T0 + 48 * 3600e3);
  eq(C.applyOffline(s, T0 + 48 * 3600e3 + 30e3), null, 'meno di un minuto: niente');
});
t('trophies open the next garage (bigger grid), the top garages wait for later seasons', () => {
  const s = fresh(); s.trophies = REGIONS[1].need; const r = C.checkRegion(s);
  eq(r.region, 1); eq(s.grid.length, 16);
  s.trophies = 999; while (C.checkRegion(s)); eq(s.region, 4, 'il garage 6 apre dalla stagione 2');
  s.season = 3; while (C.checkRegion(s)); eq(s.region, REGIONS.length - 1); eq(s.grid.length, 30);
});
t('races: a much better car wins, a much worse one loses, same seed same result', () => {
  const ev = EVENTS.find((e) => e.id === 'lago-3'), rv = rivalOf(ev, 1);
  eq(simulateRace({ ev, grade: 1, car: { t: rv.t + 3, parts: rv.parts }, seed: 3, skill: 'auto' }).win, true);
  eq(simulateRace({ ev, grade: 1, car: { t: Math.max(1, rv.t - 3), parts: {} }, seed: 3, skill: 'good' }).win, false);
  const a = simulateRace({ ev, grade: 2, car: { t: rv.t, parts: rv.parts }, seed: 9 }), b = simulateRace({ ev, grade: 2, car: { t: rv.t, parts: rv.parts }, seed: 9 });
  eq(a, b);
  yes(carPerf({ t: 10, parts: { motore: 5 } }).pi > carPerf({ t: 10 }).pi, 'i ricambi contano');
  for (const e of EVENTS) yes(makeTrack(e.track).n > 100, e.track);
});
t('perfect shifts beat automatic ones in the drag race', () => {
  const ev = EVENTS.find((e) => e.id === 'costa-4'), car = rivalOf(ev, 1);
  const auto = simulateRace({ ev, grade: 1, car, seed: 1, skill: 'auto' }).me, perf = simulateRace({ ev, grade: 1, car, seed: 1, skill: 'perfect' }).me;
  yes(perf < auto, `${perf} < ${auto}`);
});
t('race rewards: a medal once per grade, repeats pay less', () => {
  const s = fresh(); const ev = EVENTS[0];
  const w1 = C.raceReward(s, ev, 1, true, T0); yes(w1.trophy); eq(s.trophies, 1);
  const w2 = C.raceReward(s, ev, 1, true, T0); yes(!w2.trophy && w2.coins < w1.coins); eq(s.trophies, 1);
  const g3 = C.raceReward(s, ev, 3, true, T0); eq(g3.tokens, 2);
  const l = C.raceReward(s, ev, 2, false, T0); yes(!l.trophy); eq(s.stats.races, 4); eq(s.stats.wins, 3);
});
t('research: costs telemetry, needs its prerequisite, has a maximum', () => {
  const s = fresh(); s.rp = 1e6;
  eq(C.doResearch(s, 'offcap'), false, 'serve Sponsor 1');
  yes(C.doResearch(s, 'sponsor')); yes(C.doResearch(s, 'offcap'));
  for (let i = 0; i < 20; i++) C.doResearch(s, 'sponsor');
  eq(s.research.sponsor, 10);
  yes(C.derived(s).mult > 2.9);
});
t('new season: Dynasty points, reset of the season, permanent bonus and perks kept', () => {
  const s = fresh(); eq(C.prestigeGain(s), 0, 'non prima del 3° garage');
  s.region = 2; s.grid = Array(20).fill(null); s.grid[0] = C.car(14); s.seasonEarned = 1e12; s.trophies = 20; s.research.sponsor = 4; s.tokens = 7;
  const g = C.prestigeGain(s); yes(g >= 5, `punti ${g}`);
  C.prestige(s, T0); eq(s.season, 2); eq(s.dp, g); eq(s.region, 0); eq(s.trophies, 0); eq(s.research, {}); eq(s.tokens, 7); eq(s.grid.length, 12);
  yes(C.derived(s).mult > 1);
  const cost = PERKS.find((p) => p.id === 'lancio').cost[0];
  yes(C.buyPerk(s, 'lancio')); eq(s.dp, g - cost); eq(C.derived(s).shopMax, 3);
});
t('daily missions: same three for the same day, progress and claim, bonus for all three', () => {
  const a = fresh(), b = fresh();
  C.ensureMissions(a, T0); C.ensureMissions(b, T0 + 3600e3);
  eq(a.missions.list.map((m) => m.id), b.missions.list.map((m) => m.id));
  const tok = a.tokens;
  for (const m of a.missions.list) C.progress(a, m.id, 1e6);
  a.missions.list.forEach((m, i) => C.claimMission(a, i));
  yes(a.missions.bonus); yes(a.tokens > tok + 6);
  eq(C.claimMission(a, 0), null, 'una volta sola');
  C.ensureMissions(a, T0 + 86400e3); yes(!a.missions.bonus, 'nuovo giorno');
});
t('boosts spend tokens; Adrenalina needs a full gauge', () => {
  const s = fresh(); s.tokens = 10;
  yes(C.useBoost(s, 'turbo', T0)); eq(s.tokens, 5); eq(C.boostMult(s, T0 + 1000), 2);
  eq(C.useBoost(s, 'straordinario', T0), null, 'gettoni insufficienti');
  eq(C.activateAdrenaline(s, T0), false); s.charge = 1; yes(C.activateAdrenaline(s, T0)); eq(C.boostMult(s, T0 + 1000), 4);
});
t('scrapping gives coins; save data is repaired whatever it contains', () => {
  const s = fresh(); const c = s.coins; const r = C.sell(s, 0); yes(r.ok && s.coins > c);
  for (const junk of [null, 42, 'x', { grid: 'no', coins: -5, region: 99 }, { grid: [{ k: 'car', t: 999 }, { k: 'part', p: 'boh', t: 2 }, { k: 'crate', c: 'car', t: 3 }], best: 'a' }]) {
    const n = C.normalize(junk, T0);
    yes(Array.isArray(n.grid) && n.grid.length === C.gridSize(n.region)); yes(n.coins >= 0);
    for (const it of n.grid) if (it?.k === 'car') yes(it.t >= 1 && it.t <= CAR_MAX);
  }
  const back = C.normalize(JSON.parse(JSON.stringify(s)), T0); eq(back.grid, s.grid);
});
t('number formatting', () => {
  eq(C.fmtN(950), '950'); eq(C.fmtN(12345), '12,3 K'); eq(C.fmtN(2.5e9), '2,50 Mld'); eq(C.fmtTime(3725), '1h 02m');
});

console.log(`\n${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
