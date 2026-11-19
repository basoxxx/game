// AI level duels for the rummy plug-ins (balance tuning): single rounds, seats swapped every game.
//   node tools/carte-burraco-duel.mjs [burraco|scala40] [levelA] [levelB] [rounds] [n]
import { newMatch, play, endRound } from '../src/carte/core/match.js';
import { clone, rng } from '../src/carte/core/cards.js';
const [id = 'burraco', a = 'difficile', b = 'normale', N = 60, n = 2] = process.argv.slice(2);
const G = (await import(`../src/carte/games/${id}.js`)).default;
let wa = 0, wb = 0, diff = 0;
for (let i = 0; i < +N; i++) {
  const lv = Array.from({ length: +n }, (_, p) => ((p % 2 === 0) !== !!(i % 2) ? a : b));
  const variant = id === 'burraco' ? (+n === 4 ? 'coppie' : 'due') : undefined;
  const M = newMatch(G, { variant, n: +n, seed: 5000 + i, target: id === 'burraco' ? 1 : 101, options: {}, seats: lv.map((l) => ({ kind: 'cpu', level: l })) });
  while (!G.isOver(M.state)) { const p = M.state.turn; play(G, M, G.ai(clone(M.state), p, lv[p], rng(M.moves + i * 13))); }
  const r = endRound(G, M), A = lv[0] === a ? 0 : 1;
  // burraco: higher is better; scala40: penalties, lower is better
  const d = id === 'burraco' ? r.points[A] - r.points[1 - A] : r.points[1 - A] - r.points[A];
  diff += d; if (d > 0) wa++; else if (d < 0) wb++;
}
console.log(`${id} ${a} vs ${b}: ${wa}-${wb}, differenza media ${(diff / N).toFixed(1)} punti a smazzata`);
