// Orda balance check: plays the campaign headlessly with the autopilot, the way a player would
// (levels in order, coins spent on the cheapest upgrade after each level, champions as they unlock).
//   node tools/orda-balance.mjs            → the campaign table
//   node tools/orda-balance.mjs bare       → every level with no upgrades at all (how hard is it raw)
//   node tools/orda-balance.mjs max        → every level fully upgraded (should be easy)
import { LEVELS } from '../src/orda/levels.js';
import { Sim, autopilot } from '../src/orda/sim.js';
import { UPGRADES, upCost, CHAMPIONS, champCost, CHAMP_MAX, starsFor, coinsFor } from '../src/orda/meta.js';

const MODE = process.argv[2] || 'campaign';
// raw throughput: no reds, an unbreakable base, 40 s of firing → base damage per second
function probe(level, up) {
  const L = { ...level, base: { ...level.base, hp: 1e9, spawners: [], waves: null, towers: [], phases: [] } };
  const s = new Sim(L, { up, champ: 'colosso', seed: 3, countdown: 0 }); s.state = 'play';
  for (let f = 0; f < 30 * 40; f++) { Object.assign(s.input, autopilot(s, { champ: false })); s.step(1 / 30); }
  return s.stats.baseDmg / 30; // the first ~10 s are travel time
}
function play(level, up, champ, champLvl, seed = 1) {
  const s = new Sim(level, { up, champ, champLvl, seed, countdown: 0 });
  s.state = 'play';
  let frames = 0;
  while (s.state === 'play' && frames < 60 * 400) { Object.assign(s.input, autopilot(s)); s.step(1 / 30); frames++; }
  const r = s.result();
  return { ...r, stars: starsFor(level, r), peakBodies: s.stats.peak };
}
const fmtUp = (up) => UPGRADES.map((u) => `${u.id[0]}${up[u.id] || 0}`).join(' ');
const row = (l, r, extra = '') => console.log(`${String(l.id).padStart(2)} P=${String(probe(l, r.up || {}).toFixed(1)).padStart(5)} R=${(r.reds / Math.max(1, r.time)).toFixed(1).padStart(4)} ${l.name.padEnd(24)} ${r.win ? 'WIN ' : 'lose'} ${'★'.repeat(r.stars).padEnd(3)} t=${String(r.time.toFixed(0)).padStart(3)}/${l.stars.par} left=${String(r.left).padStart(4)}/${l.stars.crowd} base=${String(r.baseHp).padStart(4)}/${r.baseMax} can=${r.cannonHp}/${r.cannonMax} peak=${r.peakBodies} ch=${r.champs} ${r.why} ${extra}`);

if (MODE === 'bare' || MODE === 'max') {
  const up = MODE === 'max' ? Object.fromEntries(UPGRADES.map((u) => [u.id, u.max])) : {};
  for (const l of LEVELS) { const ch = MODE === 'max' ? CHAMPIONS.filter((c) => c.unlock < l.id).pop().id : 'colosso'; row(l, play(l, up, ch, MODE === 'max' ? CHAMP_MAX : 0), ch); }
} else {
  // campaign: retry a lost level after buying more (like a player would)
  let coins = 0; const up = {}; const clv = {}; let total = 0, tries = 0;
  const champsFor = (id) => CHAMPIONS.filter((c) => c.unlock < id);
  for (const l of LEVELS) {
    let r, prev = 0, attempt = 0;
    for (;;) {
      attempt++; tries++;
      // best champion for the job: the last unlocked one, the giant on pit-free levels with towers
      const owned = champsFor(l.id); const ch = owned[owned.length - 1].id;
      r = play(l, up, ch, clv[ch] || 0, attempt); r.up = { ...up };
      const c = coinsFor(l, r.stars, prev, r.win); coins += c;
      if (r.win) { prev = r.stars; row(l, r, `try${attempt} coins+${c} [${fmtUp(up)}] ${ch}${clv[ch] || 0}`); break; }
      if (attempt >= 4) { row(l, r, `GAVE UP after ${attempt} [${fmtUp(up)}]`); break; }
      // spend
      spend();
    }
    total += r.stars;
    spend();
    function spend() {
      for (;;) {
        const opts = UPGRADES.filter((u) => (up[u.id] || 0) < u.max).map((u) => ({ k: 'u', u, c: upCost(u, up[u.id] || 0) }));
        const owned = champsFor(l.id + 1); const ch = owned[owned.length - 1];
        if ((clv[ch.id] || 0) < CHAMP_MAX) opts.push({ k: 'c', id: ch.id, c: champCost(clv[ch.id] || 0) * 1.5 });
        opts.sort((a, b) => a.c - b.c);
        const o = opts[0]; if (!o || o.c > coins) return;
        coins -= Math.round(o.k === 'c' ? o.c / 1.5 : o.c);
        if (o.k === 'u') up[o.u.id] = (up[o.u.id] || 0) + 1; else clv[o.id] = (clv[o.id] || 0) + 1;
      }
    }
  }
  console.log(`stars ${total}/90 · tries ${tries} · coins left ${coins} · [${fmtUp(up)}]`);
}
