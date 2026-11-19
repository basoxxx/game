// Unit tests for the Territorio logic (capture, fill, eliminations, power-ups, determinism).
//   node tools/territorio-test.mjs
import assert from 'node:assert/strict';
import { Sim, OBST, TEAM0 } from '../src/territorio/sim.js';
import { buildObstacles, MAPS, dailySpec, pickMissions } from '../src/territorio/meta.js';
import { rng } from '../src/territorio/sim.js';

let n = 0;
const test = (name, f) => { f(); n++; console.log('ok', name); };
const human = (name, extra = {}) => ({ name, human: true, ...extra });
// a sim where every player is human-steered (no AI), no power-ups, players at given spots
const make = (spots, o = {}) => new Sim({ w: 40, h: 40, seed: 3, players: spots.map((_, i) => human('P' + i, o.team ? { team: o.team[i] } : {})), spawns: spots, powers: false, respawn: {}, ...o });
const drive = (s, p, ang, secs) => { p.want = p.ang = ang; for (let t = 0; t < secs; t += 1 / 60) s.step(1 / 60); };
const R = 0, D = Math.PI / 2, L = Math.PI, U = -Math.PI / 2;
const countOwn = (s, land) => s.own.reduce((a, o) => a + (o === land), 0);
const recount = (s) => { const c = new Int32Array(256); for (const o of s.own) c[o]++; for (let i = 0; i < 256; i++) assert.equal(c[i], s.count[i], `count of ${i}`); };

test('starting land is a disc of the player id', () => {
  const s = make([[10.5, 10.5]]);
  const p = s.players[0];
  assert.ok(countOwn(s, 1) >= 25 && countOwn(s, 1) <= 45, `start area ${countOwn(s, 1)}`);
  assert.equal(s.own[s.idx(10, 10)], 1);
  assert.ok(p.alive && !p.out);
  recount(s);
});

test('leaving the land leaves a 4-connected trail; closing the loop captures the enclosed area', () => {
  const s = make([[10.5, 10.5]]);
  const p = s.players[0], before = s.count[1];
  drive(s, p, R, 1.4); // out to the right
  assert.ok(p.out && p.trail.length >= 5, 'trail grows outside');
  for (const c of p.trail) assert.equal(s.trail[c], 1);
  drive(s, p, D, 1.4);
  drive(s, p, L, 1.4);
  assert.ok(p.out);
  drive(s, p, U, 1.6); // back into the land
  assert.ok(!p.out && p.trail.length === 0, 'trail closed');
  const gained = s.count[1] - before;
  assert.ok(gained > 60, `captured ${gained}`);
  // no trail cell remains anywhere
  assert.equal(s.trail.reduce((a, t) => a + (t ? 1 : 0), 0), 0);
  // the inside of the loop is ours
  assert.equal(s.own[s.idx(16, 16)], 1);
  recount(s);
});

test('diagonal movement still makes a 4-connected trail (no corner leaks)', () => {
  const s = make([[8.5, 8.5]]);
  const p = s.players[0];
  drive(s, p, Math.PI / 4, 1.2);
  const cells = p.trail.map((c) => [c % s.W, (c / s.W) | 0]);
  for (let i = 1; i < cells.length; i++) {
    const d = Math.abs(cells[i][0] - cells[i - 1][0]) + Math.abs(cells[i][1] - cells[i - 1][1]);
    assert.equal(d, 1, `step ${i} is 4-connected`);
  }
});

test('capture by flood fill: obstacles stay, enclosed rival land is taken, board edge is not a wall', () => {
  const s = make([[10.5, 10.5], [30.5, 30.5]]);
  const own = s.own, W = s.W, p = s.players[0];
  // hand-made trail from the land boundary around a box 14..22 x 8..14, with an obstacle and rival land inside
  own[s.idx(18, 11)] = OBST; s.count[0]--; s.count[OBST]++;
  s.setOwn(s.idx(19, 12), 2);
  const path = [];
  for (let i = 14; i <= 22; i++) path.push(s.idx(i, 8));
  for (let j = 9; j <= 14; j++) path.push(s.idx(22, j));
  for (let i = 21; i >= 14; i--) path.push(s.idx(i, 14));
  for (const c of path) { s.trail[c] = 1; }
  p.trail = path; p.out = true;
  // the last cell of the land the trail starts and ends next to: column 13 is land (x 13, rows 8..14)
  for (let j = 8; j <= 14; j++) s.setOwn(s.idx(13, j), 1);
  s.capture(p);
  assert.equal(own[s.idx(18, 11)], OBST, 'obstacle untouched');
  assert.equal(own[s.idx(19, 12)], 1, 'rival land inside taken');
  assert.equal(own[s.idx(17, 10)], 1, 'inside filled');
  assert.equal(own[s.idx(23, 11)], 0, 'outside untouched');
  recount(s);
  // a loop along the board edge: the strip between the trail and the edge is NOT enclosed
  const t = make([[3.5, 20.5]]), q = t.players[0];
  const strip = []; for (let j = 15; j >= 1; j--) strip.push(t.idx(4, j)); // up along x = 4 to near the edge
  for (const c of strip) t.trail[c] = 1;
  q.trail = strip; q.out = true;
  for (let i = 0; i <= 4; i++) t.setOwn(t.idx(i, 0), 1); // a land row on the top edge
  for (let j = 0; j <= 16; j++) t.setOwn(t.idx(0, j), 1); // a thin land column at the left edge
  for (let i = 0; i <= 4; i++) t.setOwn(t.idx(i, 16), 1); // and a row closing the bottom
  t.capture(q);
  // cells between x=1..3 rows 1..15 are enclosed by own land and trail on all sides → captured
  assert.equal(t.own[t.idx(2, 8)], 1);
  // cells right of the trail are open to the rest of the board
  assert.equal(t.own[t.idx(10, 8)], 0);
  recount(t);
});

test('crossing a rival trail eliminates the rival and its land becomes neutral', () => {
  const s = make([[8.5, 10.5], [20.5, 30.5]]);
  const [a, b] = s.players;
  drive(s, b, U, 1.8); // b goes up out of its land, leaving a vertical trail at x = 20
  assert.ok(b.out && b.trail.length > 4);
  const bLand = s.count[2];
  assert.ok(bLand > 0);
  // a drives right across b's trail
  for (let t = 0; t < 2.5 && b.alive; t += 1 / 60) { a.want = a.ang = R; b.want = b.ang = U; s.step(1 / 60); if (b.y < 6) b.want = b.ang = D; }
  assert.ok(!b.alive, 'b eliminated');
  assert.equal(a.kills, 1);
  assert.equal(s.count[2], 0, 'b land cleared');
  assert.ok(!s.trail.some((t) => t === 2), 'b trail cleared');
  recount(s);
});

test('self cut eliminates, a shield prevents it', () => {
  const s = make([[8.5, 8.5]]);
  const p = s.players[0];
  p.shield = 0;
  drive(s, p, R, 1.2); drive(s, p, D, 0.6); drive(s, p, L, 0.5); drive(s, p, U, 0.8);
  assert.ok(!p.alive, 'cut own trail');
  const t = make([[8.5, 8.5]]), q = t.players[0];
  q.shield = 99;
  drive(t, q, R, 1.2); drive(t, q, D, 0.6); drive(t, q, L, 0.5); drive(t, q, U, 0.8);
  assert.ok(q.alive, 'shielded');
});

test('head-on: the one outside its land loses', () => {
  const s = make([[8.5, 20.5], [30.5, 20.5]]);
  const [a, b] = s.players;
  a.shield = b.shield = 0;
  // b waits at home; a runs into b's land
  for (let t = 0; t < 5 && a.alive && b.alive; t += 1 / 60) { a.want = a.ang = R; b.want = b.ang = L; b.frozen = 1; s.step(1 / 60); }
  assert.ok(!a.alive && b.alive, 'a (outside) lost the head-on');
});

test('team mates do not cut each other; team land is shared', () => {
  const s = make([[8.5, 10.5], [20.5, 30.5]], { teams: true, team: [0, 0] });
  const [a, b] = s.players;
  assert.equal(a.land, TEAM0); assert.equal(b.land, TEAM0);
  drive(s, b, U, 1.8);
  for (let t = 0; t < 2.5; t += 1 / 60) { a.want = a.ang = R; b.want = b.ang = U; s.step(1 / 60); if (b.y < 6) b.want = b.ang = D; }
  assert.ok(b.alive, 'team mate not cut');
  recount(s);
});

test('a rival left without land is out; a capture that swallows a power-up takes it', () => {
  const s = make([[10.5, 10.5], [30.5, 30.5]]);
  const [a, b] = s.players;
  // give all of b's land to a by hand, then a capture runs the check
  for (let c = 0; c < s.own.length; c++) if (s.own[c] === 2) s.setOwn(c, 1);
  a.trail = [s.idx(15, 15)]; s.trail[s.idx(15, 15)] = 1; s.setOwn(s.idx(15, 14), 1);
  s.powers.push({ x: 15.5, y: 15.5, kind: 'turbo', life: 10, id: 1 });
  s.capture(a);
  assert.ok(!b.alive && s.events.some((e) => e.type === 'kill' && e.why === 'land'));
  assert.ok(a.turbo > 0, 'turbo taken by capture');
});

test('power-ups: gelo freezes foes, turbo speeds up', () => {
  const s = make([[10.5, 10.5], [20.5, 10.5]]);
  const [a, b] = s.players;
  s.take(a, { x: 10, y: 10, kind: 'gelo' });
  assert.ok(b.frozen > 0 && a.frozen === 0);
  const x0 = b.x; b.want = b.ang = R; s.step(0.5); assert.equal(b.x, x0, 'frozen does not move');
  s.take(a, { x: 10, y: 10, kind: 'turbo' });
  assert.ok(s.speedOf(a) > 7);
});

test('respawn after an elimination in battle mode', () => {
  const s = make([[8.5, 8.5]], { respawn: { human: true } });
  const p = s.players[0];
  s.kill(p, null, 'test');
  assert.ok(!p.alive && p.respawnT > 0);
  for (let t = 0; t < 3.2; t += 0.1) s.step(0.1);
  assert.ok(p.alive && s.count[1] > 20);
  recount(s);
});

test('timer, target and end of the match', () => {
  const s = new Sim({ w: 40, h: 40, seed: 9, players: [human('A'), { name: 'B' }], time: 2, respawn: { ai: true } });
  for (let t = 0; t < 3; t += 0.1) s.step(0.1);
  assert.ok(s.over && s.why === 'time');
  const u = make([[10.5, 10.5]], { target: 0.02 });
  u.step(0.01);
  assert.ok(u.over && u.why === 'target');
});

test('AI matches are deterministic for a seed and keep the counters consistent', () => {
  const run = () => {
    const obst = buildObstacles('laghi', 80, 80, 42);
    const s = new Sim({ w: 80, h: 80, seed: 42, obstacles: obst, players: Array.from({ length: 6 }, (_, i) => ({ name: 'R' + i, persona: ['prudente', 'avido', 'cacciatore', 'furbo', 'pazzo', 'furbo'][i] })), respawn: { ai: true }, time: 60 });
    let kills = 0, caps = 0;
    while (!s.over) { s.step(1 / 30); for (const e of s.events) { if (e.type === 'kill') kills++; if (e.type === 'capture') caps++; } s.events.length = 0; }
    recount(s);
    return { sig: s.players.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${s.count[p.land]}`).join('|'), kills, caps };
  };
  const a = run(), b = run();
  assert.equal(a.sig, b.sig);
  assert.ok(a.caps > 30, `AI captures (${a.caps})`);
});

test('meta: every arena builds, the daily arena is stable for a day, missions are three', () => {
  for (const m of Object.keys(MAPS)) { const o = buildObstacles(m, 96, 96, 7); assert.equal(o.length, 96 * 96); }
  const d = new Date(2026, 10, 19);
  assert.deepEqual(dailySpec(d), dailySpec(new Date(2026, 10, 19, 22)));
  assert.equal(pickMissions(rng(1), 'battaglia').length, 3);
});

console.log(`\n${n} tests passed`);
