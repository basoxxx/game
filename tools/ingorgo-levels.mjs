// Ingorgo — picks the 60 campaign levels (6 worlds x 10) from the seeded generator and writes them to
// src/ingorgo/campaign.js as compact strings. For every slot several seeds are generated with a bigger
// search budget than the in-game generator; the one closest to the slot's target length wins, and the
// targets climb inside each world. Re-run only when the generator or the rules change:
//   node tools/ingorgo-levels.mjs
import { writeFileSync } from 'node:fs';
import { generate, hashStr } from '../src/ingorgo/gen.js';
import { encodeLevel, decodeLevel, compile, initState, solve } from '../src/ingorgo/core.js';

// world → mechanic and the target optimal length of its 10 levels
const WORLDS = [
  { mech: 'classico', d: [0, 0.75], opt: [3, 4, 6, 8, 10, 12, 14, 17, 20, 24] },
  { mech: 'tutti', d: [0, 0.8], opt: null },
  { mech: 'sensi', d: [0.1, 0.85], opt: [5, 6, 8, 10, 11, 13, 15, 17, 20, 23] },
  { mech: 'semafori', d: [0.1, 0.9], opt: [5, 6, 8, 9, 11, 12, 14, 16, 18, 21] },
  { mech: 'porto', d: [0.1, 0.9], opt: [5, 7, 8, 10, 11, 13, 14, 16, 18, 21] },
  { mech: 'punta', d: [0.2, 1], opt: [6, 8, 9, 11, 12, 14, 16, 18, 20, 24] },
];
const SEEDS = +(process.env.SEEDS || 4);
const out = [];
const t0 = Date.now();
for (let w = 0; w < WORLDS.length; w++) {
  const W = WORLDS[w];
  for (let i = 0; i < 10; i++) {
    const d = W.d[0] + (W.d[1] - W.d[0]) * (i / 9);
    let best = null, bestGap = Infinity;
    for (let k = 0; k < SEEDS; k++) {
      const seed = hashStr(`ingorgo-campaign:${w}:${i}:${k}`);
      const extra = { tries: 24, climb: W.mech === 'tutti' ? 3000 : 80 };
      if (W.opt) extra.target = [Math.max(2, W.opt[i] - 1), W.opt[i] + 1];
      const L = generate(seed, W.mech, d, extra);
      // tutti: more extra moves as the world goes on (the generator's own ramp)
      const gap = W.opt ? Math.abs(L.opt - W.opt[i]) : 0;
      if (gap < bestGap || (gap === bestGap && L.cars.length > best.cars.length)) { best = L; bestGap = gap; }
      if (gap === 0) break;
    }
    // first level of each world: keep the cast small
    const s = encodeLevel(best);
    // round-trip and re-solve: the stored string must give the same optimal length
    const L2 = decodeLevel(s), B = compile(L2), sol = solve(B, initState(B, L2), 400000);
    if (!sol || sol.n !== best.opt) throw new Error(`level ${w + 1}-${i + 1}: stored ${best.opt}, solver ${sol?.n}`);
    out.push(s);
    console.log(`${w + 1}-${i + 1}`, W.mech, 'opt', best.opt, 'cars', best.cars.length, best.time ? `time ${best.time}s` : '', `${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
const js = `// Ingorgo — campaign levels (6 worlds x 10), picked by tools/ingorgo-levels.mjs from the seeded
// generator and checked by the solver. Format: encodeLevel() in core.js. Do not edit by hand.
export const CAMPAIGN = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n  "').replace('["', '[\n  "').replace('"]', '",\n]')};
`;
writeFileSync(new URL('../src/ingorgo/campaign.js', import.meta.url), js);
console.log('written', out.length, 'levels');
