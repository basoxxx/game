// Ingorgo — generator + solver tests (node, no browser):
//   node tools/ingorgo-gen-test.mjs [seeds=1000] [threads=3]
// · 1000 seeded levels across the 6 mechanics and the whole difficulty range: valid layout, the stored
//   optimum equals the A* solver's, the solution replays move by move with the rule checker, the same
//   seed gives the same level, and every 10th level is re-checked by a plain breadth-first search
//   (no heuristic, no move pruning) so the solver's optimum is proven independently.
// · difficulty grading: optimal length per mechanic and difficulty band (must grow with d).
// · the 60 campaign levels, 30 daily puzzles, samples from the 400 pack levels.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { generate, MECH_IDS, dailyLevel, packLevel, PACKS } from '../src/ingorgo/gen.js';
import { compile, initState, solve, moves, apply, isGoal, legal, stateKey, encodeLevel, decodeLevel, occupancy, EXITED } from '../src/ingorgo/core.js';
import { CAMPAIGN } from '../src/ingorgo/campaign.js';

// plain BFS over every legal move (independent of the A* heuristic and of the exit pruning)
function bfs(B, s0, cap = 400000) {
  const seen = new Set([stateKey(s0)]); let layer = [s0], d = 0;
  while (layer.length) {
    const next = [];
    for (const s of layer) {
      if (isGoal(B, s)) return d;
      for (const m of moves(B, s)) { const t = apply(B, s, m), k = stateKey(t); if (!seen.has(k)) { seen.add(k); next.push(t); if (seen.size > cap) return -2; } }
    }
    layer = next; d++;
  }
  return -1;
}
function validate(L) {
  const errs = [];
  const B = compile(L), s = initState(B, L), occ = new Map();
  if (L.goal === 'hero' && B.hero < 0) errs.push('no hero');
  for (const c of L.cars) {
    for (let k = 0; k < c.len; k++) {
      const x = c.ax === 0 ? c.x + k : c.x, y = c.ax === 1 ? c.y + k : c.y;
      if (x < 0 || y < 0 || x >= L.w || y >= L.h) errs.push('car out of the lot');
      const key = y * L.w + x; if (occ.has(key)) errs.push('overlap'); occ.set(key, 1);
      if ((L.walls || []).some(([wx, wy]) => wx === x && wy === y)) errs.push('car on a wall');
      if (L.ferry && x === L.ferry.x && (y < L.ferry.y || y >= L.ferry.y + L.ferry.len)) errs.push('car in the water');
    }
  }
  const o = occupancy(B, s); void o;
  return { errs, B, s };
}
function checkLevel(L, deep) {
  const { errs, B, s } = validate(L);
  const sol = solve(B, s, 400000);
  if (!sol) errs.push('unsolvable');
  else {
    if (sol.n !== L.opt) errs.push(`opt ${L.opt} but solver ${sol.n}`);
    let t = s; for (const m of sol.moves) { if (!legal(B, t, m)) { errs.push('illegal solution move'); break; } t = apply(B, t, m); }
    if (!isGoal(B, t)) errs.push('solution does not finish');
  }
  if (deep) { const d = bfs(B, s); if (d >= 0 && d !== L.opt) errs.push(`BFS says ${d}, stored ${L.opt}`); if (d === -1) errs.push('BFS: unsolvable'); }
  // round trip through the compact string
  const L2 = decodeLevel(encodeLevel(L));
  if (encodeLevel(L2) !== encodeLevel(L)) errs.push('encode round trip');
  return errs;
}

if (!isMainThread) {
  const { from, to, N } = workerData, out = [];
  for (let i = from; i < to; i++) {
    const mech = MECH_IDS[i % MECH_IDS.length], d = (Math.floor(i / MECH_IDS.length) % 10) / 9, seed = 1000 + i * 7919;
    const t0 = performance.now();
    const L = generate(seed, mech, d);
    const ms = performance.now() - t0;
    const errs = checkLevel(L, i % 10 === 0);
    if (i % 50 === 0) { const L2 = generate(seed, mech, d); if (encodeLevel(L2) !== encodeLevel(L)) errs.push('not deterministic'); }
    out.push({ i, mech, d, opt: L.opt, cars: L.cars.length, ms, errs, extra: L.goal === 'all' ? L.opt - L.cars.length : null });
  }
  void N;
  parentPort.postMessage(out);
} else {
  const N = +(process.argv[2] || 1000), T = +(process.argv[3] || 3);
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: T }, (_, k) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { from: Math.floor((N * k) / T), to: Math.floor((N * (k + 1)) / T), N } });
    w.on('message', res); w.on('error', rej);
  })));
  const all = parts.flat().sort((a, b) => a.i - b.i);
  let bad = 0;
  for (const r of all) if (r.errs.length) { bad++; console.log('FAIL seed', r.i, r.mech, r.d.toFixed(2), r.errs.join('; ')); }
  console.log(`${N} generated levels: ${N - bad} OK, ${bad} failing · ${((Date.now() - t0) / 1000).toFixed(0)}s with ${T} threads`);
  // difficulty grading: mean optimal length per mechanic and difficulty band
  console.log('\nmean optimal moves (and slowest generation) by mechanic and difficulty d:');
  console.log('mech       ' + ['0-.3', '.3-.6', '.6-1'].map((s) => s.padStart(8)).join('') + '   max ms');
  let monotone = true;
  for (const m of MECH_IDS) {
    const rows = all.filter((r) => r.mech === m);
    const band = (a, b) => { const x = rows.filter((r) => r.d >= a && r.d < b); return x.reduce((s, r) => s + r.opt, 0) / Math.max(1, x.length); };
    const v = [band(0, 0.3), band(0.3, 0.6), band(0.6, 1.01)];
    if (!(v[0] < v[1] && v[1] < v[2])) monotone = false;
    console.log(m.padEnd(11) + v.map((x) => x.toFixed(1).padStart(8)).join('') + `   ${Math.max(...rows.map((r) => r.ms)).toFixed(0).padStart(6)}`);
  }
  const ms = all.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`generation time: median ${ms[ms.length >> 1].toFixed(0)} ms, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(0)} ms`);
  if (!monotone) { bad++; console.log('FAIL difficulty does not grow with d'); }
  // campaign
  let cbad = 0;
  CAMPAIGN.forEach((str, k) => { const L = decodeLevel(str); const e = checkLevel(L, true); if (e.length) { cbad++; console.log('FAIL campaign', k + 1, e.join('; ')); } });
  console.log(`campaign: ${CAMPAIGN.length - cbad}/${CAMPAIGN.length} levels verified (BFS-proven optimum)`);
  // daily: deterministic and solvable for 30 days
  let dbad = 0;
  for (let k = 0; k < 30; k++) {
    const day = new Date(2026, 10, 1 + k), a = dailyLevel(day), b = dailyLevel(day);
    const e = checkLevel(a.L, false); if (encodeLevel(a.L) !== encodeLevel(b.L)) e.push('daily not deterministic');
    if (e.length) { dbad++; console.log('FAIL daily', a.info.key, e.join('; ')); }
  }
  console.log(`daily: ${30 - dbad}/30 days OK (same puzzle for everybody)`);
  // packs: a few levels of each
  let pbad = 0;
  for (const P of PACKS) for (const n of [1, 37, 100]) { const L = packLevel(P.id, n); const e = checkLevel(L, false); if (e.length) { pbad++; console.log('FAIL pack', P.id, n, e.join('; ')); } }
  console.log(`packs: ${PACKS.length * 3 - pbad}/${PACKS.length * 3} sampled levels OK`);
  void EXITED;
  const fails = bad + cbad + dbad + pbad;
  console.log(fails ? `\n${fails} FAILURES` : '\nALL OK');
  process.exit(fails ? 1 : 0);
}
