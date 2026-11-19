// Officina — headless economy simulation. A bot plays like an attentive (not perfect) player: opens crates,
// merges every pair, installs parts on the cars on track, buys the best-value car, races every event it can
// win, researches, spends tokens on boosts, claims missions and starts a new season when progress slows.
//   node tools/officina-econ.mjs [hours=12] [--away] [--quiet] [--json '{"costG":2.9}']
// --away plays in sessions (45 min on, 3 h away) to exercise offline earnings.
// Prints the milestones and the longest waits without progress; exit code 1 when progress stalls
// (a gap > STALL minutes with no new tier, trophy, garage, research or season) or the first hours are too slow.
import { K, newState, tick, derived, carCost, partCost, buyCar, buyPart, move, mergeResult, findPair, openCrate, sell, trackCars, incomeRate, baseIncome,
  raceReward, eventsOf, eventGrade, researchState, doResearch, prestigeGain, prestige, buyPerk, ensureMissions, claimMission, useBoost, activateAdrenaline,
  applyOffline, fmtN, fmtTime, itemIncome, sellValue } from '../src/officina/core.js';
import { RESEARCH, PERKS, REGIONS, CAR_MAX, PART_IDS, rivalOf } from '../src/officina/data.js';
import { simulateRace, carPerf, rng } from '../src/officina/race.js';

const args = process.argv.slice(2);
const HOURS = +(args.find((a) => /^\d+(\.\d+)?$/.test(a)) || 12);
const AWAY = args.includes('--away'), QUIET = args.includes('--quiet');
const ji = args.indexOf('--json'); if (ji >= 0) Object.assign(K, JSON.parse(args[ji + 1]));
const STALL = +(process.env.STALL_MIN || 20);

const rnd = rng(12345);
let now = Date.UTC(2026, 10, 2, 8, 0, 0);
const s = newState(now);
const log = [], marks = [];
let lastProgress = 0, simT = 0, gaps = [];
const mark = (what) => { const gap = simT - lastProgress; gaps.push({ gap, at: simT, what }); lastProgress = simT; marks.push({ t: simT, what }); if (!QUIET) log.push(`${fmtTime(simT).padStart(8)}  ${what}`); };

function stepTime(dt) {
  const ev = tick(s, dt, now, rnd); now += dt * 1000; simT += dt;
  for (const e of ev) if (e.type === 'region') mark(`garage ${e.region + 1}: ${REGIONS[e.region].name}`);
  return ev;
}
function bestCarIdx() { let b = -1, bp = 0; s.grid.forEach((it, i) => { if (it?.k === 'car') { const p = carPerf(it).pi; if (p > bp) { bp = p; b = i; } } }); return b; }
function act() {
  const D = derived(s);
  for (let i = 0; i < s.grid.length; i++) if (s.grid[i]?.k === 'crate') openCrate(s, i, rnd);
  // merges (an attentive player merges everything)
  for (let k = 0; k < 40; k++) { const p = findPair(s); if (!p) break; const r = move(s, p.from, p.to); if (r.newBest) mark(`livello ${r.item.t}`); }
  // parts onto the cars on track (highest income first)
  const tc = trackCars(s, D);
  for (let i = 0; i < s.grid.length; i++) {
    const it = s.grid[i]; if (it?.k !== 'part') continue;
    const tgt = tc.find((j) => { const r = mergeResult(it, s.grid[j]); return r && r.type === 'install'; });
    if (tgt !== undefined) move(s, i, tgt);
  }
  // shop: best value per coin among the top 3 tiers
  for (let k = 0; k < 30; k++) {
    if (s.grid.every(Boolean)) break;
    const D2 = derived(s); let pick = null;
    for (let t = D2.shopMax; t >= Math.max(1, D2.shopMax - 2); t--) { const c = carCost(s, t, D2), v = Math.pow(2, t) / c; if (!pick || v > pick.v) pick = { t, c, v }; }
    if (!pick || s.coins < pick.c) break;
    buyCar(s, pick.t);
  }
  // a parts crate now and then
  if (s.grid.filter((x) => !x).length >= 3 && s.coins > partCost(s) * 2 && s.grid.filter((x) => x?.k === 'part').length < 6) buyPart(s, rnd);
  // grid jammed: scrap the weakest thing that is not on track
  if (s.grid.every(Boolean) && !findPair(s)) {
    const on = new Set(trackCars(s)); let w = -1, wv = Infinity;
    s.grid.forEach((it, i) => { if (on.has(i) || it.k === 'crate') return; const v = it.k === 'car' ? itemIncome(it) : 1e-9 * it.t; if (v < wv) { wv = v; w = i; } });
    if (w >= 0) sell(s, w);
  }
  // research: cheapest available first
  for (let k = 0; k < 5; k++) {
    const opts = RESEARCH.map((r) => researchState(s, r.id)).filter((x) => !x.max && !x.locked).sort((a, b) => a.cost - b.cost);
    if (!opts.length || s.rp < opts[0].cost) break;
    doResearch(s, opts[0].r.id); mark(`ricerca ${opts[0].r.name} ${opts[0].lvl + 1}`);
  }
  // missions, boosts, adrenaline
  ensureMissions(s, now);
  s.missions.list.forEach((m, i) => { if (m.done && !m.claimed) claimMission(s, i); });
  if (s.tokens >= 8) useBoost(s, 'turbo', now, rnd);
  if (s.charge >= 1) activateAdrenaline(s, now);
}
let lastRaceT = -999, lastRacePi = {};
function races() {
  if (simT - lastRaceT < 90) return;
  lastRaceT = simT;
  const bi = bestCarIdx(); if (bi < 0) return;
  const c = s.grid[bi], D = derived(s), pi = carPerf(c, D.raceBonus).pi;
  for (let r = 0; r <= s.region; r++) for (const ev of eventsOf(r)) {
    const g = eventGrade(s, ev.id) + 1; if (g > 3) continue;
    const key = ev.id + ':' + g; if (lastRacePi[key] >= pi) continue; // already lost with this car
    lastRacePi[key] = pi;
    const res = simulateRace({ ev, grade: g, car: c, bonus: D.raceBonus, ers: D.ers, ersDur: D.ersDur, seed: Math.floor(rnd() * 1e9), skill: 'good' });
    stepTime(Math.max(12, Math.min(40, res.me || 30)) + 8); // the race itself + menus
    const out = raceReward(s, ev, g, res.win, now);
    if (out.trophy) mark(`trofeo ${ev.name} ${['', 'bronzo', 'argento', 'oro'][g]} (${s.trophies})`);
    if (out.region !== undefined) mark(`garage ${out.region + 1}: ${REGIONS[out.region].name}`);
  }
}
let lastBestT = 0, lastBest = 0, lastRegionT = 0, lastRegion = 0;
function maybePrestige() {
  if (s.best > lastBest) { lastBest = s.best; lastBestT = simT; }
  if (s.region !== lastRegion) { lastRegion = s.region; lastRegionT = simT; }
  const g = prestigeGain(s); if (!g) return;
  // the garage cannot build anything better this season (the next garage opens in a later season): the
  // screen says so and points to the new season, a player does not wait long there
  const nx = REGIONS[s.region + 1], capped = s.best >= REGIONS[s.region].cap && nx && (nx.season || 1) > s.season;
  const stalled = simT - Math.max(lastBestT, lastRegionT) > (capped ? 4 : 20) * 60;
  if ((stalled && g >= 3) || (s.best >= CAR_MAX && simT - lastBestT > 10 * 60)) {
    const got = prestige(s, now); lastRacePi = {}; mark(`NUOVA STAGIONE ${s.season} (+${got} punti dinastia, totale ${s.dpEarned})`); lastBest = 0; lastBestT = simT;
    for (let k = 0; k < 10; k++) { const opt = PERKS.filter((p) => (s.perks[p.id] || 0) < p.max).map((p) => ({ p, c: p.cost[s.perks[p.id] || 0] })).sort((a, b) => a.c - b.c)[0]; if (!opt || s.dp < opt.c) break; buyPerk(s, opt.p.id); }
  }
}

const END = HOURS * 3600;
let session = 0;
const samples = [];
while (simT < END) {
  if (AWAY && session >= 45 * 60) {
    // away for 3 hours: offline earnings are applied on return
    s.lastSeen = now; now += 3 * 3600e3; const o = applyOffline(s, now); session = 0;
    if (!QUIET) log.push(`${fmtTime(simT).padStart(8)}  (via 3h: +${fmtN(o.coins)} monete, ${fmtTime(o.secs)} contati)`);
    continue;
  }
  stepTime(1); session++;
  if (Math.floor(simT) % 2 === 0) act();
  races(); maybePrestige();
  if (Math.floor(simT) % 1800 === 0) samples.push({ t: simT, best: s.best, region: s.region, inc: incomeRate(s, now), coins: s.coins, season: s.season, trophies: s.trophies, rp: s.rp, research: Object.values(s.research).reduce((a, b) => a + b, 0) });
}
if (!QUIET) console.log(log.join('\n'));
console.log('\n── campioni ogni 30 minuti');
for (const x of samples) console.log(`${fmtTime(x.t).padStart(8)}  stagione ${x.season}  liv ${String(x.best).padStart(2)}  garage ${x.region + 1}  trofei ${String(x.trophies).padStart(3)}  ricerche ${String(x.research).padStart(3)}  incasso ${fmtN(x.inc)}/s  monete ${fmtN(x.coins)}`);
const top = gaps.slice().sort((a, b) => b.gap - a.gap).slice(0, 5);
console.log('\n── attese più lunghe senza progressi');
for (const g of top) console.log(`${fmtTime(g.gap).padStart(8)}  prima di «${g.what}» (a ${fmtTime(g.at)})`);
const firstHourTiers = marks.filter((m) => m.t < 3600 && /^livello/.test(m.what)).length;
const res = { hours: HOURS, bestEver: s.bestEver, seasons: s.season, dp: s.dpEarned, trophiesAll: s.trophiesAll, longestGapMin: +(top[0]?.gap / 60 || 0).toFixed(1), firstHourTiers };
console.log('\n', JSON.stringify(res));
const fail = [];
if (res.longestGapMin > STALL) fail.push(`stallo di ${res.longestGapMin} minuti`);
if (firstHourTiers < 6) fail.push(`prima ora lenta (${firstHourTiers} livelli)`);
if (HOURS >= 10 && s.bestEver < CAR_MAX - 2) fail.push(`dopo ${HOURS} ore il livello massimo è ${s.bestEver}`);
if (HOURS >= 10 && s.bestEver >= CAR_MAX && marks.find((m) => /livello 30/.test(m.what))?.t < 6 * 3600) fail.push('il livello 30 arriva troppo presto');
if (fail.length) { console.log('PROBLEMI:', fail.join('; ')); process.exitCode = 1; } else console.log('OK: progressione senza stalli');
