// Festa Baso headless tests: every minigame starts, ends and ranks 2/3/4 players driven by the AI (also with
// idle "humans"), deterministic replays, plus a full board game and a tournament on the pure logic.
//   node tools/festa-test.mjs
import { MINIGAMES, cpuSkill } from '../src/festa/mini/index.js';
import { blankInput } from '../src/festa/util.js';
import { newBoard, boardRoll, boardMove, boardAfterMini, boardFinal, BOARD } from '../src/festa/party.js';
import { newTourney, tourneyAfter } from '../src/festa/party.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };
const DT = 1 / 60;

function play(M, n, seed, cpu) {
  const sim = new M.Sim({ n, seed, skill: Array.from({ length: n }, (_, i) => cpuSkill(1, i)), cpu });
  const inp = Array.from({ length: n }, blankInput);
  let frames = 0;
  while (!sim.done && frames < 60 * 120) {
    for (let i = 0; i < n; i++) { const p = inp[i]; p.x = p.y = 0; p.a = p.ap = false; p.m = null; if (cpu[i]) sim.ai(i, p, DT); }
    sim.step(DT, inp); frames++;
  }
  return { sim, frames };
}

for (const M of MINIGAMES) {
  const t0 = Date.now(); const line = [];
  for (const n of [2, 3, 4]) {
    for (const mode of ['cpu', 'idle']) {
      const cpu = Array.from({ length: n }, (_, i) => mode === 'cpu' || i > 0);
      const { sim, frames } = play(M, n, 1234 + n, cpu);
      ok(sim.done, `${M.id} n=${n} ${mode}: not finished after ${frames} frames`);
      const r = sim.result();
      ok(r.places.length === n && r.places.every((p) => p >= 1 && p <= n), `${M.id} n=${n}: bad places ${r.places}`);
      ok(r.places.includes(1), `${M.id} n=${n}: nobody first`);
      for (let i = 0; i < n; i++) ok(typeof sim.hud(i) === 'string', `${M.id}: hud`);
      if (mode === 'cpu') line.push(`${n}p ${(frames / 60).toFixed(0)}s [${r.places.join(',')}]`);
      // the idle human should not win solo races against CPUs (sanity of the AI) — informative only
    }
  }
  // determinism
  const a = play(M, 3, 77, [true, true, true]).sim.result(), b = play(M, 3, 77, [true, true, true]).sim.result();
  ok(JSON.stringify(a) === JSON.stringify(b), `${M.id}: not deterministic`);
  console.log(`${M.id.padEnd(12)} ${line.join(' · ')}  (${Date.now() - t0} ms)`);
}

// ---- board game, all CPUs, short
for (const n of [2, 4]) {
  const B = newBoard({ n, rounds: 4, seed: 99 + n, names: Array.from({ length: n }, (_, i) => `G${i + 1}`), minis: MINIGAMES.map((m) => m.id) });
  let guard = 0;
  while (B.phase !== 'end' && guard++ < 500) {
    if (B.phase === 'roll') { boardRoll(B); while (B.phase === 'move') boardMove(B); }
    else if (B.phase === 'mini') {
      const M = MINIGAMES.find((m) => m.id === B.mini);
      const { sim } = play(M, n, B.seed + B.round, Array(n).fill(true));
      boardAfterMini(B, sim.result());
    } else if (B.phase === 'final') boardFinal(B);
    else break;
  }
  ok(B.phase === 'end', `board n=${n}: ended in phase ${B.phase}`);
  ok(B.podium?.length === n, `board n=${n}: podium`);
  console.log(`board ${n}p: ${B.podium.map((p) => `${p.name} ★${p.stars} ${p.coins}m`).join(' · ')} · premi ${B.awards.map((a) => a.title).join(', ')}`);
}
ok(BOARD.length >= 20, 'board spaces');

// ---- tournament first to 3
{
  const T = newTourney({ n: 3, target: 3, seed: 5, minis: ['riflessi', 'memoria', 'golf', 'porte'] });
  let k = 0;
  while (!T.champion && k++ < 40) {
    const M = MINIGAMES.find((m) => m.id === T.next);
    const { sim } = play(M, 3, 500 + k, [true, true, true]);
    tourneyAfter(T, sim.result());
  }
  ok(T.champion != null, 'tournament has a champion');
  console.log(`torneo: campione G${T.champion + 1} in ${T.played.length} minigiochi, vittorie ${T.wins.join('-')}`);
}

console.log(fails ? `\n${fails} FAIL` : '\nOK');
process.exit(fails ? 1 : 0);
