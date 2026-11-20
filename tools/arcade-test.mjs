// Arcade Baso — node logic tests: collisions, scoring, combo, the four simulations end to end with
// their autopilots, Rimbalzo levels solvable and clearable, Corri rows always passable, Labirinto mazes
// connected / symmetric / braided and completable.   node tools/arcade-test.mjs
import { hitCC, hitCB, rng } from '../src/arcade/rng.js';
import { AstroSim, SECTORS } from '../src/arcade/astro.js';
import { RimbalzoSim, levelDef, genLevel, validate, reachable, parseRows, LEVEL_COUNT, breakable } from '../src/arcade/rimbalzo.js';
import { CorriSim, rowGen, passable, newMission, missionText } from '../src/arcade/corri.js';
import { LabirintoSim, genMaze, mazeInfo, MW, MH } from '../src/arcade/labirinto.js';
import { dailySpec, GAMES, GAME_IDS } from '../src/arcade/meta.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const t0 = Date.now();

// ---------- geometry
ok(hitCC(0, 0, 1, 1.5, 0, 0.6), 'circles touching overlap');
ok(!hitCC(0, 0, 1, 2.1, 0, 1), 'circles apart');
ok(hitCB(0, 0, 1, 1.5, 0, 0.6, 0.6), 'circle vs box side');
ok(!hitCB(0, 0, 1, 1.5, 1.5, 0.6, 0.6), 'circle misses box corner');
ok(hitCB(5, 5, 0.1, 5, 5, 1, 1), 'circle inside box');
{ const a = rng(42), b = rng(42); ok(a() === b() && a.int(1, 6) === b.int(1, 6), 'rng deterministic'); }

// ---------- daily
{ const d1 = dailySpec(new Date(2026, 10, 19)), d2 = dailySpec(new Date(2026, 10, 19)), d3 = dailySpec(new Date(2026, 10, 20));
  ok(d1.seed === d2.seed && d1.game === d2.game, 'daily stable for a date'); ok(d1.game !== d3.game, 'daily game rotates');
  ok(GAME_IDS.every((g) => GAMES[g].coins(10000) > 0), 'coin payouts'); }

// ---------- Astro Baso
{
  const s = new AstroSim({ seed: 3 });
  // combo multiplier: kills in a row raise it, a hit resets it
  for (let i = 0; i < 13; i++) { const e = s.spawn({ type: 'dardo', x: 40, y: 100, p: { vy: 0, turnY: -1, side: 1 } }); s.damage(e, 99); }
  ok(s.mult === 3 && s.chain === 13, `combo x3 after 13 kills (x${s.mult})`);
  const sc = s.score; const e = s.spawn({ type: 'dardo', x: 40, y: 100, p: { vy: 0, turnY: -1, side: 1 } }); s.damage(e, 99);
  ok(s.score - sc === 100 * 3, `kill scored with multiplier (${s.score - sc})`);
  s.ships[0].inv = 0; s.ebullets.push({ x: s.ships[0].x, y: s.ships[0].y, vx: 0, vy: 0, r: 1.2 }); s.collide();
  ok(!s.ships[0].alive && s.ships[0].lives === 2 && s.mult === 1, 'bullet kills ship, resets combo');
  // shield absorbs
  const s2 = new AstroSim({ seed: 4 }); const sh = s2.ships[0]; sh.inv = 0; s2.pick(sh, 'S'); s2.ebullets.push({ x: sh.x, y: sh.y, vx: 0, vy: 0, r: 1 }); s2.collide();
  ok(sh.alive && sh.shield === 0, 'shield absorbs one hit');
  s2.pick(sh, 'P'); s2.pick(sh, 'P'); ok(sh.weapon === 2, 'weapon power-up');
  // bomb clears bullets
  for (let i = 0; i < 30; i++) s2.ebullets.push({ x: 10 + i, y: 80, vx: 0, vy: -10, r: 1 });
  sh.bombs = 1; s2.bomb(sh); ok(!s2.ebullets.length && sh.bombs === 0, 'bomb clears the screen');
  // full run with an invulnerable pilot: three sectors and three bosses
  const g = new AstroSim({ seed: 11, god: true, weapon: 4 }); g.ships[0].auto = true;
  let bossesSeen = new Set();
  for (let i = 0; i < 60 * 900 && !g.over; i++) { g.step(1 / 60); if (g.boss) bossesSeen.add(g.boss.kind); if (g.events.length > 500) g.events.length = 0; }
  ok(g.over && g.win && g.bossKills === 3, `astro completes 3 sectors (over=${g.over} win=${g.win} bosses=${g.bossKills} sector=${g.sector} wave=${g.wave} t=${Math.round(g.time)})`);
  ok(bossesSeen.size === SECTORS.length, 'all three bosses appear');
  // a real (mortal) autopilot game ends
  const m = new AstroSim({ seed: 5 }); m.ships[0].auto = true;
  for (let i = 0; i < 60 * 900 && !m.over; i++) { m.step(1 / 60); m.events.length = 0; }
  ok(m.over && m.result.score > 0, `astro mortal run ends with a score (${m.result?.score}, sector ${m.sector + 1} wave ${m.wave})`);
  // co-op: two ships, game over only when both are out
  const c = new AstroSim({ seed: 6, players: 2 }); c.ships[0].lives = 1; c.ships[0].inv = 0; c.hurt(c.ships[0]); c.step(0.1);
  ok(!c.over && c.ships[1].alive, 'co-op continues with one ship');
}

// ---------- Rimbalzo
{
  let bad = [];
  for (let l = 1; l <= LEVEL_COUNT; l++) { const L = levelDef(l); if (!validate(L.cells)) bad.push(l); }
  ok(LEVEL_COUNT >= 40 && !bad.length, `48 levels all solvable (bad: ${bad.join(',')})`);
  let gbad = 0; for (let s = 1; s <= 300; s++) if (!validate(genLevel(s, (s % 10) / 10).cells)) gbad++;
  ok(!gbad, `generator: 300 seeds solvable (${gbad} bad)`);
  ok(!reachable(parseRows(['MMMMMMMMMMMMM', 'M11111111111M', 'MMMMMMMMMMMMM'])), 'enclosed bricks detected as unsolvable');
  // paddle bounce angle depends on the hit point
  const s = new RimbalzoSim({ seed: 1 }); const b = s.balls[0]; s.launch(b);
  b.x = s.paddle.x + s.paddle.w / 2 - 0.5; b.y = 11.5; b.vx = 0; b.vy = -60; s.moveBall(b, 0.001);
  ok(b.vy > 0 && b.vx > 20, `right edge sends the ball right (${b.vx.toFixed(1)})`);
  // brick hit scores and breaks
  const s2 = new RimbalzoSim({ seed: 2 }); const br = s2.bricks.find((q) => q.v === 1); const sc = s2.score; s2.hitBrick(br, 1);
  ok(!br.alive && s2.score > sc && s2.left === s2.bricks.filter((q) => breakable(q.v)).length - 1, 'brick breaks and scores');
  // explosive takes neighbours
  const s3 = new RimbalzoSim({ seed: 2, level: 8 }); const x = s3.bricks.find((q) => q.v === 9); const before = s3.left; s3.hitBrick(x, 1);
  ok(before - s3.left >= 3, `explosive chain (${before - s3.left})`);
  // every level clears with the autopilot (balls never lost) within 15 minutes of game time
  let slow = [];
  for (let l = 1; l <= LEVEL_COUNT; l++) {
    const g = new RimbalzoSim({ seed: l, level: l, noLose: true, maxLevels: 1 }); g.auto = true;
    let t = 0; while (!g.over && t < 900) { g.step(1 / 60); t += 1 / 60; g.events.length = 0; }
    if (!g.over) slow.push(`${l}(${g.left})`);
  }
  ok(!slow.length, `all 48 levels cleared by the autopilot (stuck: ${slow.join(' ')})`);
  // a mortal game ends
  const m = new RimbalzoSim({ seed: 9 }); let t = 0; // nobody at the paddle: three balls lost
  while (!m.over && t < 300) { m.step(1 / 60); t += 1 / 60; m.events.length = 0; }
  ok(m.over && m.lives === 0, `rimbalzo game ends when the balls are lost (t ${Math.round(t)})`);
  // multiball capsule
  const s4 = new RimbalzoSim({ seed: 3 }); s4.launch(s4.balls[0]); s4.catchCap('multi'); ok(s4.balls.length === 3, 'multiball makes three');
}

// ---------- Corri Baso
{
  // every row has a passable lane reachable from the previous row's (BFS over lanes)
  for (const seed of [1, 2, 3, 77, 1234]) {
    const g = rowGen(seed, 1.3); let reach = new Set([0]), okRows = true;
    for (let i = 0; i < 3000; i++) {
      const row = g.next().value, nx = new Set();
      for (const l of reach) for (const d of [-1, 0, 1]) { const t = l + d; if (t >= -1 && t <= 1 && passable(row.cells[t + 1])) nx.add(t); }
      if (!nx.size) { okRows = false; break; }
      reach = nx;
    }
    ok(okRows, `corri rows always passable (seed ${seed})`);
  }
  // crash on a block, jump over a barrier, slide under a bar
  const s = new CorriSim({ seed: 1 }); s.obst = [{ type: 'low', lane: 0, z0: s.dist + 3, z1: s.dist + 3.8 }]; s.genTo = () => {};
  s.act('up'); for (let i = 0; i < 60; i++) s.step(1 / 60);
  ok(!s.over && s.jumps === 1, 'jump clears a barrier');
  const s2 = new CorriSim({ seed: 1 }); s2.genTo = () => {}; s2.obst = [{ type: 'high', lane: 0, z0: s2.dist + 3, z1: s2.dist + 3.7 }]; s2.act('down'); for (let i = 0; i < 40; i++) s2.step(1 / 60);
  ok(!s2.over && s2.slides === 1, 'slide passes under a bar');
  const s3 = new CorriSim({ seed: 1 }); s3.genTo = () => {}; s3.obst = [{ type: 'block', lane: 0, z0: s3.dist + 3, z1: s3.dist + 6 }]; for (let i = 0; i < 40; i++) s3.step(1 / 60);
  ok(s3.over, 'block crashes the runner');
  const s4 = new CorriSim({ seed: 1 }); s4.genTo = () => {}; s4.obst = [{ type: 'block', lane: 0, z0: s4.dist + 3, z1: s4.dist + 6 }]; s4.power('scudo'); for (let i = 0; i < 40; i++) s4.step(1 / 60);
  ok(!s4.over && !s4.p.shield, 'shield saves one crash');
  // the autopilot runs far, the speed rises, coins are collected
  const a = new CorriSim({ seed: 21 }); a.auto = true; const v0 = a.v;
  for (let i = 0; i < 60 * 240 && !a.over; i++) { a.step(1 / 60); a.events.length = 0; }
  ok(a.dist > 2500 && a.v > v0 + 8 && a.coins > 50, `corri autopilot ${Math.round(a.dist)} m, v ${a.v.toFixed(1)}, ${a.coins} coins${a.over ? ' (crashed)' : ''}`);
  const r = rng(5), ms = [newMission(r)]; ms.push(newMission(r, ms.map((m) => m.id))); ok(ms[0].id !== ms[1].id && missionText(ms[0]).length > 5, 'missions differ');
}

// ---------- Labirinto Goloso
{
  let bad = [];
  for (let seed = 1; seed <= 400; seed++) {
    const info = mazeInfo(genMaze(seed));
    if (info.unreachable.length || info.deadEnds.length || !info.sym || info.open < 150) bad.push(`${seed}:u${info.unreachable.length}/d${info.deadEnds.length}/s${info.sym}/o${info.open}`);
  }
  ok(!bad.length, `400 mazes connected, symmetric, braided (${bad.slice(0, 6).join(' ')})`);
  // power pellet: wasps scared, eating one scores 200 then 400
  const s = new LabirintoSim({ seed: 1 }); s.state = 'play';
  const e = s.enemies[0]; s.eat(1, 1); ok(e.state === 'scared' && s.hero.fire > 0, 'chili scares the wasps');
  e.x = s.hero.x; e.y = s.hero.y; s.collide(); ok(e.state === 'eyes' && s.score >= 250, 'toasting a wasp scores');
  const f = s.enemies[1]; f.state = 'scared'; f.x = s.hero.x; f.y = s.hero.y; const sc = s.score; s.collide(); ok(s.score - sc === 400, 'second wasp scores double');
  // a hunting wasp catches Gnam
  const d = new LabirintoSim({ seed: 2 }); d.state = 'play'; d.enemies[0].x = d.hero.x; d.enemies[0].y = d.hero.y; d.collide(); ok(d.state === 'dying' && d.lives === 2, 'wasp catches Gnam');
  // levels are completable: an invulnerable pilot eats every almond on 5 levels
  for (let lv = 1; lv <= 5; lv++) {
    const g = new LabirintoSim({ seed: 3, level: lv, god: true }); g.auto = true; let t = 0;
    while (g.state !== 'clear' && t < 400) { g.step(1 / 60); t += 1 / 60; g.events.length = 0; }
    ok(g.state === 'clear', `labirinto level ${lv} cleared by the pilot (${g.dotsLeft} left, ${Math.round(t)} s)`);
  }
  // wasps leave the nest and move around
  const w = new LabirintoSim({ seed: 4, god: true }); for (let i = 0; i < 60 * 20; i++) w.step(1 / 60);
  ok(w.enemies.filter((q) => q.state === 'hunt' || q.state === 'scared').length >= 3, 'wasps leave the nest');
  // a mortal game ends
  const m = new LabirintoSim({ seed: 8 }); m.auto = true; let t = 0;
  while (!m.over && t < 2400) { m.step(1 / 60); t += 1 / 60; m.events.length = 0; }
  ok(m.over && m.score > 500, `labirinto game ends (level ${m.level}, score ${m.score})`);
  ok(MW === 19 && MH === 21, 'maze size');
}

console.log(`${n - fails}/${n} ok · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
