// Orda pace metrics: plays the campaign headlessly like tools/orda-balance.mjs (autopilot, coins spent
// on the cheapest upgrade) and reports what the player feels: time to the first win, figures per
// second, gate passes per minute, level durations and coins per minute (overheads included).
//   node tools/orda-metrics.mjs [json]
import { LEVELS } from '../src/orda/levels.js';
import { Sim, autopilot } from '../src/orda/sim.js';
import * as META from '../src/orda/meta.js';
const { UPGRADES, upCost, CHAMPIONS, starsFor, coinsFor } = META;
// seconds of non-play per attempt: countdown + end-of-match delay before the results + a tap
const OVER = META.PACE?.overhead ?? (3 + 1.9 + 1.5);
const COUNT = META.PACE?.countdown ?? 3;
function play(level, up, champ, seed) {
  const s = new Sim(level, { up, champ, seed, countdown: 0 }); s.state = 'play';
  let f = 0, peak = 0;
  while (s.state === 'play' && f < 30 * 400) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); f++; if (f % 15 === 0) peak = Math.max(peak, s.blueUnits()); }
  const r = s.result(); return { ...r, peakUnits: peak, stars: starsFor(level, r) };
}
let coins = 0, playT = 0, wallT = 0, totalCoins = 0, figs = 0, gates = 0, firstWin = null; const up = {}; const rows = [];
const levels = LEVELS.filter((l) => !l.bonus);
for (const l of levels) {
  const owned = CHAMPIONS.filter((c) => c.unlock < l.id); const ch = owned[owned.length - 1].id;
  let r, prev = 0;
  for (let a = 1; a <= 4; a++) {
    r = play(l, up, ch, a);
    const c = coinsFor(l, r.stars, prev, r.win); coins += c; totalCoins += c;
    playT += r.time; wallT += r.time + OVER; figs += r.sent + r.cloned; gates += r.gates;
    if (r.win && firstWin == null) firstWin = wallT - OVER + COUNT;
    for (;;) { const o = UPGRADES.filter((u) => (up[u.id] || 0) < u.max).map((u) => ({ u, c: upCost(u, up[u.id] || 0) })).sort((x, y) => x.c - y.c)[0]; if (!o || o.c > coins) break; coins -= o.c; up[o.u.id] = (up[o.u.id] || 0) + 1; }
    if (r.win) break;
  }
  rows.push({ id: l.id, win: r.win, t: +r.time.toFixed(1), peak: r.peakUnits, figsPs: +((r.sent + r.cloned) / r.time).toFixed(1), gatesPm: Math.round((r.gates / r.time) * 60), stars: r.stars });
}
const firstUp = Math.min(...UPGRADES.map((u) => upCost(u, 0)));
const out = {
  timeToFirstWin: +firstWin.toFixed(1),
  avgLevelSec: +(rows.reduce((a, r) => a + r.t, 0) / rows.length).toFixed(1),
  minLevelSec: Math.min(...rows.map((r) => r.t)), maxLevelSec: Math.max(...rows.map((r) => r.t)),
  figuresPerSec: +(figs / playT).toFixed(1), gatePassesPerMin: Math.round((gates / playT) * 60),
  coinsPerMin: Math.round(totalCoins / (wallT / 60)), cheapestUpgrade: firstUp, coinsLevel1: coinsFor(levels[0], 3, 0, true),
  peakLevel1: rows[0].peak, losses: rows.filter((r) => !r.win).map((r) => r.id),
};
if (process.argv[2] === 'json') console.log(JSON.stringify({ out, rows }));
else { for (const r of rows) console.log(`${String(r.id).padStart(2)} ${r.win ? 'WIN ' : 'lose'} ${'★'.repeat(r.stars).padEnd(3)} t=${String(r.t).padStart(5)}s  peak=${String(r.peak).padStart(5)}  fig/s=${String(r.figsPs).padStart(6)}  gates/min=${r.gatesPm}`); console.log(out); }
