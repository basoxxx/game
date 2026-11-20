// Minigolf Baso — par sanity with a human-like player: on every stroke it picks the best-looking shot from a
// coarse grid (one stroke of look-ahead, like a person reading the green), then plays it with human error
// (aim ± ~2°, power ± ~7%, timing ± 0.15 s on holes with moving parts). The exact solver
// (tools/minigolf-check.mjs) proves each hole can be done within par; this checks the other side: that a
// hole is not trivially easy for people (aces most of the time, or well under par on average).
//   node tools/minigolf-human.mjs [holeId|courseId] [rounds=3]
// Exit code 1 when a hole looks trivial (average ≤ par − 1.5, or an ace in more than 2 rounds out of 3).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/minigolf/physics.js';
import { ALL_HOLES } from '../src/minigolf/courses.js';
import { tileDist } from '../src/minigolf/holes.js';

const ANG = 48, POW = [0.08, 0.14, 0.22, 0.3, 0.4, 0.5, 0.62, 0.75, 0.88, 1];
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.22;

export function humanRound(spec, seed, maxStrokes = 8) {
  const sim = new Sim(spec), hole = sim.hole, D = tileDist(hole, hole.cup), r = rng(seed);
  const kin = sim.w.kin.length > 0;
  const score = (p) => { const c = hole.at(Math.floor(p[0]), Math.floor(p[2])); const d = c ? D.get(c.r * hole.W + c.c) : undefined; return (d ?? 99) + Math.hypot(p[0] - sim.cup.x, p[2] - sim.cup.z) * 0.5; };
  let p = sim.teePos, t = 0;
  for (let n = 1; n <= maxStrokes; n++) {
    const toCup = Math.atan2(sim.cup.x - p[0], -(sim.cup.z - p[2]));
    const angs = []; for (let i = 0; i < ANG; i++) angs.push((i / ANG) * Math.PI * 2); for (let i = -4; i <= 4; i++) angs.push(toCup + i * 0.02);
    const wait = kin ? r() * 1.6 : 0; // a person shoots when it looks right, not on a solver's beat
    let best = null;
    for (const a of angs) for (const pw of POW) {
      sim.t = t + wait; sim.reset(p); sim.shoot(a, pw); sim.run();
      const sc = sim.state === 'holed' ? -1 : sim.state === 'rest' ? score(sim.p) : 1e3;
      if (!best || sc < best.sc) best = { a, pw, sc };
    }
    sim.t = t + Math.max(0, wait + (kin ? (r() - 0.5) * 0.3 : 0)); sim.reset(p);
    sim.shoot(best.a + gauss(r) * 0.035, Math.min(1, Math.max(0.03, best.pw * (1 + gauss(r) * 0.07))));
    sim.run();
    if (sim.state === 'holed') return n;
    if (sim.state === 'rest') { p = [...sim.p]; t = sim.t; } else { t = sim.t; } // penalty / stuck: replay from the same spot
  }
  return maxStrokes + 1;
}

if (isMainThread) {
  const want = process.argv[2], rounds = +(process.argv[3] || 3);
  const holes = ALL_HOLES.filter((h) => !want || h.id === want || h.id.startsWith(want + '-'));
  if (!holes.length) { console.log('nessuna buca per', want); process.exit(1); }
  const jobs = holes.map((h, k) => ({ k, id: h.id })), res = new Array(holes.length);
  const nW = Math.min(4, cpus().length, jobs.length); let next = 0, done = 0;
  await new Promise((ok) => {
    for (let w = 0; w < nW; w++) {
      const W = new Worker(fileURLToPath(import.meta.url), { workerData: { rounds } });
      const feed = () => { if (next < jobs.length) W.postMessage(jobs[next++]); else W.terminate(); };
      W.on('message', (m) => { res[m.k] = m; if (++done === jobs.length) ok(); feed(); });
      feed();
    }
  });
  let bad = 0;
  for (let k = 0; k < holes.length; k++) {
    const h = holes[k], s = res[k].strokes, avg = s.reduce((a, b) => a + b, 0) / s.length, aces = s.filter((x) => x === 1).length;
    const trivial = avg <= h.par - 1.5 || aces > (rounds * 2) / 3;
    if (trivial) bad++;
    console.log(`${trivial ? 'TROPPO FACILE' : 'ok'.padEnd(13)} ${h.id.padEnd(14)} par ${h.par} · umano ${s.join(' ')} (media ${avg.toFixed(1)}, ${aces} assi)`);
  }
  console.log(bad ? `\n${bad} buche troppo facili` : '\nnessuna buca banale');
  process.exit(bad ? 1 : 0);
} else {
  parentPort.on('message', ({ k, id }) => {
    const h = ALL_HOLES.find((x) => x.id === id), strokes = [];
    for (let q = 0; q < workerData.rounds; q++) strokes.push(humanRound(h, 1000 + q * 7919 + k));
    parentPort.postMessage({ k, strokes });
  });
}
