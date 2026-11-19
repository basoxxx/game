// Orda — seeded procedural level generator. Produces plain level JSON in the campaign's shape
// (see levels.js) and sizes the enemy base by playing the level headlessly with the core's own
// deterministic Sim + autopilot (injected with useCore(), so this file stays free of imports and the
// node tests can point it at any build of the core).
//
// Pipeline per attempt (sub-seed): layout → "is there a real lane choice?" → throughput probe
// (no reds) → red pressure / towers / base hp from the probe → calibration matches until a decent
// player (autopilot, no champion) needs `targetRatio` of the clock → acceptance checks (a second
// decent seed wins, a sharp player wins comfortably) → stars from the measured run.
// 40 sub-seeds are tried; the last resort softens the layout, so an unbeatable level never ships.

let CORE = null;
// core = { Sim, autopilot } from src/orda/sim.js
export function useCore(core) { CORE = core; }
export const coreReady = () => !!CORE;

// ---------------------------------------------------------------- seeded randomness
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, arr) => arr[(r() * arr.length) | 0];
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

export const GOOD = { mul: true, add: true, sub: false, div: false, split: true, rec: true };
export const gateText = (g) => (g.type === 'mul' ? `×${g.value}` : g.type === 'add' ? `+${g.value}` : g.type === 'sub' ? `−${g.value}` : g.type === 'split' ? `⇆×${g.value}` : g.type === 'rec' ? `♻+${g.value}` : `÷${g.value}`);

// ---------------------------------------------------------------- difficulty knobs
// d: 0 (gentle) … 1 (hard); d > 1 keeps scaling (Infinita)
export function knobs(d) {
  const e = clamp(d, 0, 1), x = Math.max(0, d - 1);
  return {
    e, x,
    len: Math.round(lerp(52, 62, e) + Math.min(6, x * 4)),
    rows: Math.round(lerp(2, 4, e)) + (x > 0.5 ? 1 : 0),
    badShare: lerp(0.15, 0.42, e) + Math.min(0.1, x * 0.05),
    moveChance: e < 0.25 ? 0 : lerp(0.08, 0.35, e),
    toggleChance: e < 0.45 ? 0 : lerp(0, 0.25, e),
    obstacles: Math.round(lerp(0, 3, e) + Math.min(2, x * 1.5)),
    kinds: e < 0.25 ? ['wall'] : e < 0.5 ? ['wall', 'pit', 'barrier'] : e < 0.75 ? ['wall', 'pit', 'barrier', 'saw', 'spin'] : ['pit', 'barrier', 'saw', 'spin', 'spin', 'saw'],
    spawners: 1 + (e > 0.3 ? 1 : 0) + (e > 0.8 || x > 0.3 ? 1 : 0),
    redFrac: lerp(0.1, 0.22, e) + Math.min(0.1, x * 0.05),   // reds per second, share of the blue throughput
    waves: e > 0.35,
    towers: e < 0.3 ? 0 : Math.round(lerp(0, 2.4, e)) + (x > 0.6 ? 1 : 0),
    phases: e < 0.5 ? 0 : e < 0.8 ? 1 : 2,
    targetRatio: lerp(0.4, 0.68, e) + Math.min(0.1, x * 0.05), // clock share a decent player needs
    time: Math.round(lerp(50, 75, e) / 5) * 5,
    rainbow: lerp(0.15, 0.35, e), giants: e > 0.6,
    cannonHp: Math.round(lerp(26, 44, e) + Math.min(10, x * 8)),
  };
}

export const WORLD_COUNT = 6;
const ADJ = ['Verde', 'Rossa', 'Dorata', 'Tonante', 'Ventosa', 'Furiosa', 'Allegra', 'Ruggente', 'Storta', 'Gelata', 'Rovente', 'Frizzante'];
const NOUN = ['Collina', 'Valle', 'Piana', 'Gola', 'Fortezza', 'Radura', 'Duna', 'Baia', 'Rocca', 'Pianura', 'Cresta', 'Conca'];
const W = 16;

// gate rows: x positions and widths across the 16 m arena
const ROWS = [
  { xs: [-4, 4], w: [4.4, 5.4] },
  { xs: [-4, 4], w: [4.4, 5.4] },
  { xs: [-5.2, 0, 5.2], w: [3.4, 4.0] },
  { xs: [0], w: [5.5, 7], single: true },
  { xs: [-4.6, 4.6], w: [3.4, 4.2] }, // a gap in the middle
];

function makeRow(r, y, k, late) {
  const P = k.e < 0.2 && r() < 0.5 ? ROWS[0] : pick(r, ROWS);
  const out = [];
  let goods = 0;
  P.xs.forEach((x, i) => {
    let bad = !P.single && r() < k.badShare;
    if (i === P.xs.length - 1 && goods === 0) bad = false; // every row offers at least one good gate
    let type, value;
    if (bad) {
      if (r() < 0.6) { type = 'sub'; value = pick(r, late > 0.5 ? [60, 80, 100, 120] : [20, 30, 40, 50]); }
      else { type = 'div'; value = 2; }
    } else {
      goods++;
      if (r() < 0.62) { type = 'mul'; value = pick(r, late > 0.5 ? [2, 3, 3, 4, 4] : [2, 3, 3, 4]); }
      else if (late > 0.5 && r() < 0.15) { type = 'rec'; value = pick(r, [60, 100, 150]); }
      else { type = 'add'; value = pick(r, late > 0.5 ? [5, 10, 15, 20] : [5, 8, 10]); }
    }
    let w = r1(lerp(P.w[0], P.w[1], r()));
    const g = { x, y: r1(y), w, type, value };
    // a single gate across the lane may be the quick rainbow ×5, or a split into two lanes
    if (P.single && r() < k.rainbow) { g.type = 'mul'; g.value = 5; g.rainbow = true; g.w = w = 3.2; g.move = { amp: r1(4 + r() * 1.8), speed: r2(0.45 + r() * 0.25), phase: r2(r() * 6.28) }; out.push(g); return; }
    if (P.single && r() < 0.2) { g.type = 'split'; g.value = 2; g.w = w = 5; g.to = 4; out.push(g); return; }
    if (r() < k.moveChance) {
      // sway inside its own slot (never into a neighbour or the wall)
      const slot = P.single ? W - 2 : P.xs.length === 3 ? 5.2 : 8;
      w = g.w = r1(Math.min(w, slot * 0.6));
      const amp = P.single ? (W - 1) / 2 - w / 2 : Math.min(W / 2 - 0.2 - Math.abs(x) - w / 2, (slot - w) / 2 - 0.2);
      if (amp > 0.6) g.move = { amp: r1(Math.min(amp, 1 + r() * 3.5)), speed: r2(0.15 + r() * 0.15), phase: r2(r() * 6.28) };
    } else if (k.toggleChance && GOOD[type] && r() < k.toggleChance) {
      g.toggle = { every: pick(r, [2.5, 3, 3.5, 4]), type: r() < 0.6 ? 'sub' : 'div', value: 0 };
      g.toggle.value = g.toggle.type === 'sub' ? pick(r, [10, 20, 30]) : 2;
    }
    out.push(g);
  });
  return out;
}

function makeObstacle(r, kind, y) {
  switch (kind) {
    case 'wall': return { type: 'wall', x: r1(pick(r, [0, 0, -4, 4]) + (r() - 0.5) * 2), y: r1(y), w: r1(2.5 + r() * 2.5), d: r1(1 + r() * 0.3) };
    case 'pit': return { type: 'pit', x: r1((r() - 0.5) * 8), y: r1(y), w: r1(3 + r() * 2.5), d: r1(2 + r() * 1) };
    case 'barrier': return { type: 'barrier', x: 0, y: r1(y), w: r1(4 + r() * 2), d: 1, amp: r1(2.5 + r() * 2), speed: r2(0.2 + r() * 0.15), phase: r2(r() * 6.28) };
    case 'saw': return { type: 'saw', x: 0, y: r1(y), r: r1(1 + r() * 0.2), amp: 6, speed: r2(0.3 + r() * 0.15), phase: r2(r() * 6.28) };
    case 'spin': return { type: 'spin', x: r1(pick(r, [0, 0, -4, 4])), y: r1(y), len: r1(2.6 + r() * 1.2), speed: r2((r() < 0.5 ? -1 : 1) * (1.3 + r() * 0.5)) };
  }
  return null;
}

// raw layout; the base strength is sized afterwards on the Sim
function layout(seed, d) {
  const r = rng(seed), k = knobs(d);
  const len = k.len, y0 = 15, y1 = len - 16;
  const gates = [], obstacles = [], rowYs = [];
  for (let i = 0; i < k.rows; i++) {
    const y = k.rows === 1 ? (y0 + y1) / 2 : lerp(y0, y1, i / (k.rows - 1)) + (r() - 0.5) * 1.5;
    rowYs.push(y);
    gates.push(...makeRow(r, y, k, k.rows === 1 ? 0.5 : i / (k.rows - 1)));
  }
  // obstacles sit between rows (and before the base), never on a gate line
  const slots = [];
  for (let i = 0; i <= rowYs.length; i++) {
    const a = i === 0 ? 8 : rowYs[i - 1] + 3.5, b = i === rowYs.length ? len - 11 : rowYs[i] - 3.5;
    if (b - a > 1) slots.push([a, b]);
  }
  for (let i = 0; i < k.obstacles && slots.length; i++) {
    const s = slots.splice((r() * slots.length) | 0, 1)[0];
    const o = makeObstacle(r, pick(r, k.kinds), lerp(s[0], s[1], 0.3 + r() * 0.4));
    if (o) obstacles.push(o);
    if (o?.type === 'pit' && o.y - 3.4 > s[0] && r() < 0.5) obstacles.push({ type: 'jump', x: o.x, y: r1(o.y - 3.4), w: r1(Math.min(5, o.w)), d: 1.4, air: 1 });
  }
  const spawners = [];
  for (let i = 0; i < k.spawners; i++) spawners.push({ x: k.spawners === 1 ? 0 : r1(lerp(-3.5, 3.5, i / (k.spawners - 1))), rate: r2(1 + r() * 0.6), count: 1 });
  const towers = [];
  for (let i = 0; i < k.towers; i++) towers.push({ x: k.towers === 1 ? 0 : i % 3 === 2 ? 0 : i % 2 ? 5.5 : -5.5, y: r1(len - 7 - (i % 3 === 2 ? 2 : 0) - r() * 3), hp: 0, rate: r2(0.35 + k.e * 0.15), count: 2 });
  const phases = [];
  if (k.phases >= 1) phases.push({ at: 0.66, wave: 0, shield: 2 });
  if (k.phases >= 2) phases.push({ at: 0.33, wave: 0, brute: 1 + (r() < k.e - 0.5 ? 1 : 0), bruteHp: Math.round(14 + k.e * 10), rate: 1.2 });
  const world = (seed >>> 5) % WORLD_COUNT;
  return {
    id: `gen-${seed}`, name: `${pick(r, NOUN)} ${pick(r, ADJ)}`, world, gen: { seed, d: r2(d) },
    w: W, len, time: k.time, stars: { par: 0, crowd: 0 }, charge: Math.round(30 + k.e * 30),
    cannon: { hp: k.cannonHp }, gates, obstacles,
    base: { hp: 100, w: 9 + (k.phases ? 1 : 0), boss: k.phases >= 2, name: k.phases >= 2 ? 'Cittadella' : '', spawners, waves: k.waves ? { every: Math.round(lerp(10, 7, k.e)), count: 0 } : null, towers, phases, ...(k.giants ? { giants: { every: Math.round(lerp(16, 11, k.e)), hp: 0, first: 8 } } : {}) },
  };
}

// ---------------------------------------------------------------- headless players on the core Sim
// decent: the core autopilot, no champion · sharp: autopilot with champion · novice: wobbly aim,
// lets go of the trigger now and then, no defending
export const PLAYERS = ['novice', 'decent', 'sharp'];
export function play(level, { player = 'decent', seed = 1, up = {}, champ = 'colosso', champLvl = 0, maxTime, probe = false, onStep } = {}) {
  const { Sim, autopilot } = CORE;
  const s = new Sim(level, { up, champ, champLvl, seed, countdown: 0, cap: 150, redCap: 120 }); // small pool: same maths (clones fold into units), much faster
  s.state = 'play';
  const r = rng(seed * 31 + 7), dt = 1 / 30, T = maxTime ?? level.time + 1;
  let off = 0, hold = true, frames = 0, maxCrowd = 0;
  while (s.state === 'play' && frames * dt < T) {
    const a = autopilot(s, { champ: player === 'sharp', defend: player !== 'novice' });
    if (player === 'novice') {
      if (frames % 36 === 0) { off = (r() + r() + r() - 1.5) * 3.2; hold = r() < 0.85; }
      a.x = clamp(a.x + off, -W / 2 + 1, W / 2 - 1); a.fire = hold; a.champ = s.ready() && r() < 0.02;
    }
    Object.assign(s.input, a);
    s.step(dt); frames++;
    if (frames % 6 === 0) { const u = s.blueUnits(); if (u > maxCrowd) maxCrowd = u; }
    onStep?.(s);
  }
  if (probe) return s;
  const res = s.result();
  return { ...res, maxCrowd, won: res.win };
}
// steady blue throughput (base damage per second) with no reds and an unbreakable base
export function probe(level, o = {}) {
  const L = { ...level, time: 999, base: { ...level.base, hp: 1e9, spawners: [], waves: null, towers: [], phases: [] } };
  let d0 = 0;
  const s = play(L, { ...o, probe: true, maxTime: 22, onStep: (x) => { if (Math.abs(x.t - 8) < 1e-3 || (!d0 && x.t >= 8)) d0 = x.stats.baseDmg; } });
  return (s.stats.baseDmg - d0) / 14;
}

// lane choice: the autopilot's own scoring of every lane (no Sim needed) → best vs median
export function laneSpread(level) {
  const xs = []; for (let x = -W / 2 + 1; x <= W / 2 - 1 + 1e-6; x += 0.5) xs.push(x);
  const sc = xs.map((x) => {
    let u = 10;
    for (const g of [...level.gates].sort((a, b) => a.y - b.y)) {
      if (Math.abs(x - g.x) > (g.w || 4.5) / 2 - 0.3) continue;
      u = g.type === 'mul' || g.type === 'split' ? u * g.value : g.type === 'add' ? u + g.value * 10 : g.type === 'rec' ? u + 20 : g.type === 'sub' ? Math.max(0, u - Math.min(g.value, 25)) : u / g.value;
    }
    for (const ob of level.obstacles) {
      if (ob.type === 'jump' || ob.type === 'push') continue;
      const span = ob.type === 'spin' ? ob.len : ob.type === 'saw' ? ob.r + ob.amp : ob.type === 'barrier' ? ob.w / 2 + ob.amp * 0.5 : ob.w / 2;
      const dx = Math.abs(x - ob.x);
      if (ob.type === 'pit') { if (dx < span + 0.4) u *= 0.02; } else if (dx < span + 0.3) u *= ob.type === 'wall' ? 0.85 : ob.type === 'spin' ? 0.6 : ob.type === 'barrier' ? 0.8 : 0.45;
    }
    return u;
  }).sort((a, b) => a - b);
  const med = sc[sc.length >> 1], best = sc[sc.length - 1];
  return { best, median: med, spread: best / Math.max(1, med) };
}

// ---------------------------------------------------------------- validity
export function validate(L) {
  const e = [];
  if (!(L.w > 0 && L.len >= 40 && L.time > 0)) e.push('arena');
  if (!Array.isArray(L.gates) || !L.gates.length || L.gates.length > 32) e.push('gates');
  const half = L.w / 2;
  for (const g of L.gates || []) {
    if (!(g.type in GOOD)) e.push(`gate type ${g.type}`);
    if (!(g.value >= 1) || !Number.isFinite(g.value)) e.push(`gate value ${g.value}`);
    if (Math.abs(g.x) + g.w / 2 + (g.move?.amp || 0) > half + 0.01) e.push(`gate out ${g.x}`);
    if (g.y < 8 || g.y > L.len - 10) e.push(`gate y ${g.y}`);
    if (g.toggle && !(g.toggle.every > 0 && g.toggle.type in GOOD && g.toggle.value >= 1)) e.push('toggle');
  }
  const rows = {};
  for (const g of L.gates || []) (rows[g.y] ||= []).push(g);
  for (const row of Object.values(rows)) {
    const st = row.slice().sort((a, b) => a.x - b.x), ext = (g) => g.w / 2 + (g.move?.amp || 0);
    for (let i = 1; i < st.length; i++) if (st[i].x - ext(st[i]) < st[i - 1].x + ext(st[i - 1]) - 0.01) e.push('gate overlap');
    if (!row.some((g) => GOOD[g.type])) e.push('row without a good gate');
  }
  for (const o of L.obstacles || []) {
    if (!['wall', 'barrier', 'pit', 'spin', 'saw', 'jump', 'push'].includes(o.type)) e.push(`obstacle ${o.type}`);
    if (L.gates.some((g) => Math.abs(g.y - o.y) < (o.type === 'jump' ? 1.2 : 2.5))) e.push('obstacle on a gate line');
    if (o.y < 6 || o.y > L.len - 9) e.push(`obstacle y ${o.y}`);
  }
  const b = L.base || {};
  if (!(b.hp > 0)) e.push('base hp');
  if (!b.spawners?.length || b.spawners.some((s) => !(s.rate > 0 && s.count >= 1))) e.push('spawners');
  for (const t of b.towers || []) if (!(t.hp > 0) || t.y > L.len - 2 || t.y < L.len - 14) e.push('tower');
  if (!(L.cannon?.hp > 0)) e.push('cannon');
  if (!(L.stars?.par > 0 && L.stars.par < L.time)) e.push('stars');
  return { ok: e.length === 0, errors: e };
}

// ---------------------------------------------------------------- generate
// lo: the loadout the level is tuned for ({ up, champ, champLvl }); a bare cannon by default, so any
// upgrade the player owns makes it easier
export function generateLevel(seed, difficulty = 0.5, { endless = false, why = null, lo = {} } = {}) {
  const LO = { up: lo.up || {}, champ: lo.champ || 'colosso', champLvl: lo.champLvl || 0 };
  if (!CORE) throw new Error('Orda gen: core Sim not loaded (useCore)');
  const no = (k) => { if (why) why[k] = (why[k] || 0) + 1; };
  const k = knobs(difficulty);
  let last = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = (hashStr(`${seed}:${attempt}`) % 2147483647) + 1;
    const L = layout(s, difficulty);
    L.gen.seed = seed; L.gen.variant = attempt;
    last = L;
    // a real choice, but not a lottery
    const ls = laneSpread(L);
    if (ls.spread < 1.5) { no('no-choice'); continue; }
    if (ls.best < 20) { no('weak-best'); continue; }
    // throughput of a decent player → red pressure, towers, base
    const P = probe(L, { seed: s, ...LO });
    if (!(P > 2)) { no('no-flow'); continue; }
    let redPs = Math.max(0.6, P * k.redFrac);
    const setReds = () => {
      const share = L.base.waves ? 0.7 : 1, perSp = (redPs * share) / L.base.spawners.length;
      L.base.spawners.forEach((sp) => { sp.count = Math.max(1, Math.round(perSp / 1.3)); sp.rate = r2(perSp / sp.count); });
      if (L.base.waves) L.base.waves.count = Math.max(4, Math.round(redPs * (1 - share) * L.base.waves.every));
      L.base.phases.forEach((p) => { if ('wave' in p) p.wave = Math.round(redPs * 6); });
    };
    setReds();
    L.base.towers.forEach((t) => { t.hp = Math.max(20, Math.round(P * lerp(1.5, 3.5, k.e))); });
    if (L.base.giants) L.base.giants.hp = Math.max(20, Math.round(P * 1.0));
    const travel = (L.len / 10) + 1.5;
    L.base.hp = Math.max(60, Math.round(((P - redPs) * 0.8 * (L.time * k.targetRatio - travel)) / 10) * 10);
    // calibrate on full matches: too many reds → thin them out; then size the base to the target time
    const target = L.time * k.targetRatio;
    let dec = null;
    for (let i = 0; i < 6; i++) {
      dec = play(L, { player: 'decent', seed: s, ...LO, maxTime: L.time * 1.6 });
      // overrun, or won with the cannon nearly down: too many reds → thin them out
      if ((!dec.won && dec.why === 'overrun') || (dec.won && dec.cannonHp < dec.cannonMax * 0.35)) { redPs *= dec.won ? 0.85 : 0.72; setReds(); L.base.towers.forEach((t) => { t.rate = r2(t.rate * 0.85); }); continue; }
      if (dec.won && Math.abs(dec.time - target) < L.time * 0.07) break;
      const done = L.base.hp - (dec.won ? 0 : dec.baseHp);
      const rate = done / Math.max(1, dec.time - travel);
      if (!(rate > 0.2)) break;
      const f = clamp(((target - travel) * rate) / L.base.hp, 0.25, 4);
      L.base.hp = Math.max(60, Math.round((L.base.hp * f) / 10) * 10);
      L.base.phases.forEach((p) => { if (p.bruteHp) p.bruteHp = Math.max(8, Math.round(p.bruteHp * Math.sqrt(f))); });
    }
    L.gen.redPs = r2(redPs);
    if (!dec?.won || dec.time > L.time * 0.9) { no(dec?.won ? 'decent-slow' : `decent-${dec?.why}`); continue; }
    const dec2 = play(L, { player: 'decent', seed: s + 101, ...LO });
    if (!dec2.won || dec2.cannonHp < dec2.cannonMax * 0.35) { no(`decent2-${dec2.why || 'close'}`); continue; }
    const sharp = play(L, { player: 'sharp', seed: s + 202, ...LO });
    if (!sharp.won || sharp.time > L.time * 0.85) { no('sharp'); continue; }
    // stars: 2nd for finishing about as fast as a decent player, 3rd for a big crowd left at the win
    const tAvg = (dec.time + dec2.time) / 2;
    L.stars = { par: Math.round(clamp(tAvg * 1.08, 10, L.time - 5)), crowd: Math.max(5, Math.round(Math.min(dec.left, dec2.left, sharp.left) * 0.9 / 5) * 5) };
    L.check = { decent: r1(tAvg), sharp: r1(sharp.time), P: r1(P), maxCrowd: Math.max(dec.maxCrowd, sharp.maxCrowd), left: dec.left };
    if (!validate(L).ok) { no('invalid'); continue; }
    return finish(L, endless);
  }
  // last resort: no bad gates, a small base — never hand out an unbeatable level
  const L = last;
  L.gates.forEach((g) => { if (!GOOD[g.type]) { g.type = 'add'; g.value = 2; } delete g.toggle; });
  L.obstacles = [];
  const P = probe(L, { seed: 1, ...LO });
  L.base.hp = Math.max(60, Math.round((P * 0.5 * L.time * 0.4) / 10) * 10);
  L.stars = { par: Math.round(L.time * 0.6), crowd: 10 };
  L.check = { fallback: true };
  no('fallback');
  return finish(L, endless);
}
function finish(L, endless) {
  if (endless) { L.endless = true; }
  return L;
}

// One "how hard" number: clock share a decent player needs, plus how much red pressure there is
export function hardness(L) {
  return (L.check?.decent ?? L.time) / L.time + 0.25 * (L.obstacles.length / 5) + 0.15 * (L.base.towers.length / 3) + 0.2 * (L.gates.filter((g) => !GOOD[g.type] || g.toggle).length / Math.max(1, L.gates.length));
}
