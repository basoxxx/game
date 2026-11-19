// Bastione balance check: plays every level headlessly with the autopilot.
//   node tools/bastione-balance.mjs            → campaign: levels in order, coins spent on the upgrade tree
//   node tools/bastione-balance.mjs bare       → every level with no permanent upgrades (good autopilot)
//   node tools/bastione-balance.mjs casual     → the campaign played by the "casual" autopilot
//   node tools/bastione-balance.mjs check      → asserts: maps valid, every level winnable, stars sensible (exit 1 on failure)
//   node tools/bastione-balance.mjs endless    → how far the autopilot gets in endless on a few maps
//   node tools/bastione-balance.mjs level 12   → one level, verbose
import { LEVELS, buildLevel, segDist, endlessLevel, dailyLevel, MAP_W, MAP_H } from '../src/bastione/levels.js';
import { Sim } from '../src/bastione/sim.js';
import { autoplay } from '../src/bastione/autopilot.js';
import { TREE, treeCost, DIFFS, heroCost, HERO_MAX } from '../src/bastione/data.js';
import { coinsFor } from '../src/bastione/store.js';

const MODE = process.argv[2] || 'campaign';
const fmt = (l, r, extra = '') => `${String(l.id).padStart(2)} ${l.name.padEnd(24)} ${r.win ? 'WIN ' : 'lose'} ${'★'.repeat(r.stars).padEnd(3)} lives=${String(r.lives).padStart(2)} wave=${r.wave}/${r.waves} t=${String(Math.round(r.time)).padStart(4)}s kills=${String(r.kills).padStart(4)} peak=${String(r.peak).padStart(3)} ${extra}`;

// map sanity: paths in bounds, non-adjacent segments of a path not too close, enough build spots
function checkMap(L) {
  const errs = [];
  buildLevel(L);
  for (const [pi, p] of L.paths.entries()) {
    for (let i = 1; i < p.length; i++) { const [x, z] = p[i]; if (Math.abs(x) > MAP_W / 2 + 2 || Math.abs(z) > MAP_H / 2 + 2) errs.push(`path ${pi} point ${i} out of the map`); }
    for (let i = 0; i < p.length - 1; i++) for (let j = i + 2; j < p.length - 1; j++) {
      const m = Math.min(segDist(p[j][0], p[j][1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]), segDist(p[j + 1][0], p[j + 1][1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]), segDist(p[i][0], p[i][1], p[j][0], p[j][1], p[j + 1][0], p[j + 1][1]));
      if (m < 4.5) errs.push(`path ${pi} segments ${i}/${j} only ${m.toFixed(1)} m apart`);
    }
  }
  if (L.slotsXY.length < L.slots) errs.push(`only ${L.slotsXY.length}/${L.slots} build spots`);
  return errs;
}

// a player's meta progress: coins go to the cheapest of (tree node, captain level)
function progress() {
  const P = { coins: 0, tree: {}, heroLvl: 0, hero: 'capitano' };
  P.spend = () => { for (;;) {
    const opts = TREE.filter((n) => (P.tree[n.id] || 0) < n.max && (!n.req || P.tree[n.req])).map((n) => [treeCost(n, P.tree[n.id] || 0), () => { P.tree[n.id] = (P.tree[n.id] || 0) + 1; }]);
    if (P.heroLvl < HERO_MAX) opts.push([heroCost(P.heroLvl), () => { P.heroLvl++; }]);
    const c = opts.sort((a, b) => a[0] - b[0])[0]; if (!c || c[0] > P.coins) break; P.coins -= c[0]; c[1]();
  } };
  P.n = () => Object.values(P.tree).reduce((a, b) => a + b, 0);
  return P;
}
function campaign(skill = 'good', verbose = true, diff = 'normale') {
  const P = progress(), out = [];
  for (const l of LEVELS) {
    const { tree, hero, heroLvl } = P;
    let r, tries = 0;
    for (;;) {
      tries++;
      ({ r } = autoplay(Sim, l, { tree, hero, heroLvl, seed: tries, diff }, { skill, seed: tries }));
      P.coins += coinsFor(l, r, tries === 1 ? 0 : 3, diff);
      if (r.win || tries >= 3) break;
    }
    P.spend();
    if (verbose) console.log(fmt(l, r, `tries=${tries} heroLvl=${P.heroLvl} tree=${P.n()}`));
    out.push({ l, r, tries });
  }
  return out;
}

// tune: per level, the hp multiplier at which the good autopilot (with the campaign's upgrade tree)
// stops getting 3 stars, divided by a safety margin → prints a new TUNE table for levels.js
if (MODE === 'tune') {
  const M0 = +(process.argv[3] || 1.35), M1 = +(process.argv[4] || 1.12);
  const P = progress(), rows = [];
  for (const l of LEVELS) {
    const { tree, hero, heroLvl } = P;
    const margin = M0 + ((M1 - M0) * (l.id - 1)) / 23;
    const ok = (hp, bossHp) => [1, 2].every((seed) => autoplay(Sim, { ...l, hp, bossHp, _built: false, waveList: null, slotsXY: null }, { tree, hero, heroLvl, seed }, { skill: 'good', seed }).r.stars === 3);
    const search = (f) => { let lo = 0.05, hi = 6; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return lo; };
    const lim = search((m) => ok(m, 0.01));
    const hp = Math.max(0.6, Math.round((lim / margin) * 20) / 20);
    const blim = l.boss ? search((m) => ok(hp, m)) : 1;
    const bossHp = l.boss ? Math.max(0.1, Math.round((blim / margin) * 20) / 20) : 1;
    const { r } = autoplay(Sim, { ...l, hp, bossHp, _built: false, waveList: null, slotsXY: null }, { tree, hero, heroLvl, seed: 3 }, { skill: 'good', seed: 3 });
    P.coins += coinsFor(l, r, 0, 'normale'); P.spend();
    rows.push(`[${l.pow}, ${hp}, ${l.gold}${l.boss ? `, ${bossHp}` : ''}]`);
    console.log(String(l.id).padStart(2), l.name.padEnd(24), 'limit', lim.toFixed(2), '→ hp', hp, l.boss ? `boss ${blim.toFixed(2)} → ${bossHp}` : '', r.win ? `win ★${r.stars} lives ${r.lives}` : 'LOSE');
  }
  console.log('const TUNE = [\n  ' + rows.join(', ') + ',\n];');
} else if (MODE === 'campaign' || MODE === 'casual') campaign(MODE === 'casual' ? 'casual' : 'good', true, process.argv[3] || 'normale');
else if (MODE === 'bare') for (const l of LEVELS) console.log(fmt(l, autoplay(Sim, l, { seed: 1 }, { skill: 'good' }).r));
else if (MODE === 'level') {
  const l = LEVELS[(+process.argv[3] || 1) - 1];
  for (const d of DIFFS) for (const skill of ['good', 'casual']) console.log(d.id.padEnd(9), skill.padEnd(6), fmt(l, autoplay(Sim, l, { seed: 1, diff: d.id }, { skill }).r));
  console.log('waves', JSON.stringify(buildLevel(l).waveList.map((w) => w.map((g) => `${g.n}${g.type}`).join('+'))));
} else if (MODE === 'endless') {
  for (const id of [1, 9, 17, 24]) { const { r } = autoplay(Sim, endlessLevel(id), { seed: 1 }, { skill: 'good' }, 1 / 30, 3600); console.log(`endless map ${id}: wave ${r.wave} t=${Math.round(r.time)}s kills=${r.kills}`); }
  const d = dailyLevel(); const { r } = autoplay(Sim, d, { seed: 1 }, { skill: 'good' }); console.log(`daily ${d.id} (${d.rule.name}, map ${d.mapId}): ${r.win ? 'WIN' : 'lose'} ★${r.stars} lives ${r.lives}`);
} else if (MODE === 'check') {
  let bad = 0;
  for (const l of LEVELS) { const e = checkMap(l); if (e.length) { bad++; console.log(`map ${l.id}: ${e.join('; ')}`); } }
  const good = campaign('good', false), casual = campaign('casual', false), easy = campaign('casual', false, 'facile');
  const lost = good.filter((x) => !x.r.win);
  if (lost.length) { bad++; console.log('NOT WON by the campaign autopilot:', lost.map((x) => x.l.id).join(', ')); }
  const n = good.length, three = good.filter((x) => x.r.stars === 3).length, cw = casual.filter((x) => x.r.win).length, c3 = casual.filter((x) => x.r.stars === 3).length, ew = easy.filter((x) => x.r.win).length;
  console.log(`good autopilot (Normale): ${n - lost.length}/${n} won, ${three} with 3 stars`);
  console.log(`casual autopilot: Normale ${cw}/${n} won (${c3} with 3 stars) · Facile ${ew}/${n} won`);
  if (three < n * 0.75) { bad++; console.log('too few 3-star levels for the good autopilot'); }
  if (c3 > n * 0.5) { bad++; console.log('3 stars too easy: the casual autopilot gets them on most levels'); }
  if (cw < n * 0.3) { bad++; console.log('Normale too hard for a casual player'); }
  if (ew < n * 0.85) { bad++; console.log('Facile is not easy enough'); }
  console.log(bad ? 'FAIL' : 'OK');
  process.exit(bad ? 1 : 0);
}
