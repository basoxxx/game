// quick AI-vs-AI timing run for the rummy plug-ins:  node tools/carte-scala-smoke.mjs [scala40|burraco] [n] [matches]
import { simulate } from '../src/carte/core/match.js';
const id = process.argv[2] || 'scala40', n = +process.argv[3] || 2, N = +process.argv[4] || 5;
const G0 = (await import(`../src/carte/games/${id}.js`)).default;
const T = {}; const wrap = (f, k) => (...a) => { const t = performance.now(); try { return f(...a); } finally { T[k] = (T[k] || 0) + performance.now() - t; } };
const G = { ...G0, legalMoves: wrap(G0.legalMoves, 'legal'), ai: wrap(G0.ai, 'ai'), apply: wrap(G0.apply, 'apply') };
const t0 = Date.now(); let rounds = 0, steps = 0;
for (let i = 0; i < N; i++) {
  const lv = Array.from({ length: n }, (_, p) => ['facile', 'normale', 'difficile'][(i + p) % 3]);
  const variant = id === 'burraco' ? (n === 4 ? 'coppie' : 'due') : undefined;
  const { M, steps: st } = simulate(G, { n, variant, seed: i + 1, target: G.defaultTarget, seats: lv.map((l) => ({ kind: 'cpu', level: l })) }, lv);
  if (!M.over) console.log('non finita', i);
  rounds += M.rounds.length; steps += st;
  if (i < 4) console.log(lv.join('/'), 'totali', M.totals, 'vince', M.winner, 'smazzate', M.rounds.length, 'mosse', st);
}
console.log({ rounds, steps, ms: Date.now() - t0, msPerMove: +((Date.now() - t0) / steps).toFixed(2) }, Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])));
