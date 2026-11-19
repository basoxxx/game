// Minigolf Baso — headless solver: proves every built-in hole can be holed within par on the real
// physics (src/minigolf/physics.js), with a beam search over shots (angle × power × timing for holes
// with windmills and gates). Also runs the physics self-tests (no tunnelling at full power, replays
// are bit-exact, share codes round-trip).
//   node tools/minigolf-check.mjs            all holes (4 workers)
//   node tools/minigolf-check.mjs spazio-3   one hole (or a course id)
// Exit code 1 when a hole is not solvable within par or a self-test fails.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/minigolf/physics.js';
import { COURSES, ALL_HOLES } from '../src/minigolf/courses.js';
import { tileDist } from '../src/minigolf/holes.js';
import { canMirror, mirrorHole } from '../src/minigolf/meta.js';
// the daily hole may be a mirrored copy: those are checked too
const VARIANTS = [...ALL_HOLES, ...ALL_HOLES.filter(canMirror).map((h) => ({ ...mirrorHole(h), id: h.id + '-m', name: h.name + ' (specchiata)' }))];

const ANG = 72, POW = [0.06, 0.1, 0.14, 0.19, 0.25, 0.31, 0.38, 0.45, 0.52, 0.6, 0.68, 0.77, 0.86, 0.94, 1];

export function solve(spec, { maxStrokes = spec.par + 1, beam = 6 } = {}) {
  const sim = new Sim(spec);
  const hole = sim.hole;
  const D = tileDist(hole, hole.cup);
  const kin = sim.w.kin.length > 0;
  const waits = kin ? [0, 0.4, 0.8, 1.2, 1.6, 2.0] : [0];
  const score = (p) => {
    const c = hole.at(Math.floor(p[0]), Math.floor(p[2]));
    const d = c ? D.get(c.r * hole.W + c.c) : undefined;
    return (d ?? 99) + Math.hypot(p[0] - sim.cup.x, p[2] - sim.cup.z) * 0.5;
  };
  let frontier = [{ p: sim.teePos, t: 0, shots: [] }];
  let sims = 0;
  for (let n = 1; n <= maxStrokes; n++) {
    const next = new Map();
    for (const node of frontier) {
      const toCup = Math.atan2(sim.cup.x - node.p[0], -(sim.cup.z - node.p[2]));
      const angs = [];
      for (let i = 0; i < ANG; i++) angs.push((i / ANG) * Math.PI * 2);
      for (let i = -6; i <= 6; i++) angs.push(toCup + i * 0.012);
      for (const w of waits) for (const a of angs) for (const pw of POW) {
        sim.t = node.t + w; sim.reset(node.p); sim.shoot(a, pw); sim.run(); sims++;
        const shot = { a, p: pw, w };
        if (sim.state === 'holed') return { strokes: n, shots: [...node.shots, shot], sims };
        if (sim.state !== 'rest') continue;
        const k = `${Math.round(sim.p[0] * 3)},${Math.round(sim.p[1] * 8)},${Math.round(sim.p[2] * 3)}`;
        const sc = score(sim.p);
        const o = next.get(k);
        if (!o || o.sc > sc) next.set(k, { p: [...sim.p], t: sim.t, shots: [...node.shots, shot], sc });
      }
    }
    frontier = [...next.values()].sort((a, b) => a.sc - b.sc).slice(0, beam);
    if (!frontier.length) break;
  }
  return { strokes: null, sims, best: frontier[0]?.sc };
}

// replay a solution and check it holes again (determinism)
export function replay(spec, shots) {
  const sim = new Sim(spec);
  let p = sim.teePos, t = 0;
  for (const s of shots) { sim.t = t + s.w; sim.reset(p); sim.shoot(s.a, s.p); sim.run(); p = [...sim.p]; t = sim.t; }
  return sim.state;
}

function selfTests() {
  const fails = [];
  // 1) a full-power shot straight into a rail never passes through it, from every angle
  const box = new Sim({ rows: ['_____', '_____', '__S__', '_____', '_____'] });
  for (let i = 0; i < 64; i++) {
    box.reset(box.teePos); box.shoot((i / 64) * Math.PI * 2, 1); box.run(8);
    const p = box.p;
    if (p[0] < 0 || p[0] > 5 || p[2] < 0 || p[2] > 5 || box.state === 'penalty') fails.push(`tunnelling a=${i}: ${p.map((x) => x.toFixed(2))}`);
  }
  // 2) same shot, same result (bit-exact)
  const h = ALL_HOLES.find((x) => x.id === 'lunapark-5');
  const r = [];
  for (let k = 0; k < 2; k++) { const s = new Sim(h); s.t = 1.234; s.reset(s.teePos); s.shoot(0.05, 0.7); s.run(); r.push(s.p.join(',') + s.state + s.t); }
  if (r[0] !== r[1]) fails.push('non deterministic');
  return fails;
}

const MAIN = isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1]);
if (MAIN) {
  const only = process.argv[2] || '';
  const list = VARIANTS.filter((h) => !only || h.id === only || h.id === only + '-m' || h.course === only);
  const t0 = Date.now();
  const st = selfTests();
  for (const f of st) console.log('SELFTEST FAIL', f);
  if (!st.length) console.log('self-tests ok (no tunnelling, deterministic)');
  const { decode, encode } = await import('../src/minigolf/code.js').catch(() => ({}));
  if (encode) for (const h of ALL_HOLES) { const c = encode(h); const d = decode(c); if (!d || d.rows.join('/') !== h.rows.map((r) => r.padEnd(Math.max(...h.rows.map((x) => x.length)), '.')).join('/')) { st.push('code ' + h.id); console.log('CODE FAIL', h.id); } }
  const N = Math.min(cpus().length, 4, list.length);
  const queue = [...list];
  const res = [];
  await Promise.all(Array.from({ length: N }, () => new Promise((done) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { solver: 1 } });
    const feed = () => { const h = queue.shift(); if (!h) { w.terminate(); done(); return; } w.postMessage(h.id); };
    w.on('message', (m) => {
      res.push(m);
      const h = VARIANTS.find((x) => x.id === m.id);
      console.log(`${m.ok ? 'ok  ' : 'FAIL'} ${m.id.padEnd(13)} ${h.name.padEnd(22)} par ${h.par}  risolta in ${m.strokes ?? '—'}${m.replay ? '' : ' (replay KO)'}  ${m.sims} tiri simulati ${m.ms} ms ${m.shots ? JSON.stringify(m.shots) : ''}`);
      feed();
    });
    w.on('error', (e) => { console.error(e); done(); });
    feed();
  })));
  const bad = res.filter((r) => !r.ok);
  console.log(`\n${res.length - bad.length}/${res.length} buche (e varianti specchiate della buca del giorno) risolvibili entro il par · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(bad.length || st.length ? 1 : 0);
} else if (!isMainThread && workerData?.solver) {
  parentPort.on('message', (id) => {
    const h = VARIANTS.find((x) => x.id === id);
    const t = Date.now();
    const r = solve(h);
    const rp = r.strokes ? replay(h, r.shots) === 'holed' : false;
    parentPort.postMessage({ id, ok: !!r.strokes && r.strokes <= h.par && rp, strokes: r.strokes, sims: r.sims, ms: Date.now() - t, shots: r.shots, replay: rp || !r.strokes });
  });
}
