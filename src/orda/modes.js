// Orda — extra modes: seeded level generator (+ headless solvability check), "Sfida del giorno",
// "Infinita" (endless roguelite waves with perks) and missions/achievements. Pure data + logic, no
// three.js and no DOM: the menu, the launcher and the node tests import it directly.
//
// Level JSON (the format OrdaGame consumes):
//   { id, name, seed, difficulty, arena: { w, h, theme }, cannon: { rate, burst, speed },
//     gates: [{ x, y, w, type: 'mul'|'add'|'sub'|'div', value, move: null | { amp, speed, phase } }],
//     obstacles: [{ type: 'rock'|'saw', x, y, r, move }],
//     base: { y, hp, spawners: [{ x, rate, start }], towers: [{ x, y, rate, range }], walls: [{ x, y, w, hp }],
//             phases: [{ at, spawnMul, msg }] },
//     line: { hp }, timer, stars: { t2, t3 } }
// x is across the arena (−w/2 … w/2), y runs from the player's cannon (0) to the enemy base (h).

// ---------------------------------------------------------------- seeded randomness
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (r, arr) => arr[(r() * arr.length) | 0];
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- gates
export const GATE_TYPES = {
  mul: { good: true, label: (v) => `×${v}` },
  add: { good: true, label: (v) => `+${v}` },
  sub: { good: false, label: (v) => `−${v}` },
  div: { good: false, label: (v) => `÷${v}` },
};
export const GROUP_CAP = 5000; // figures one shot can turn into (keeps the scene sane)
export function applyGate(n, g, bonus = 0) {
  if (n <= 0) return 0;
  switch (g.type) {
    case 'mul': return Math.min(GROUP_CAP, Math.round(n * (g.value + (bonus ? 0.5 * bonus : 0))));
    case 'add': return Math.min(GROUP_CAP, n + g.value + bonus * 2);
    case 'sub': return Math.max(0, n - g.value);
    case 'div': return Math.max(n > 0 ? 1 : 0, Math.floor(n / g.value));
    default: return n;
  }
}
export const gateLabel = (g) => GATE_TYPES[g.type]?.label(g.value) ?? '';
// x of a moving gate / obstacle at time t
export function posAt(o, t) { return o.move ? o.x + Math.sin(t * o.move.speed + (o.move.phase || 0)) * o.move.amp : o.x; }

// ---------------------------------------------------------------- the generator
export const THEMES = ['prato', 'deserto', 'neve', 'spiaggia', 'lava'];
const ADJ = ['Verde', 'Rossa', 'Dorata', 'Tonante', 'Ventosa', 'Furiosa', 'Allegra', 'Ruggente', 'Lunga', 'Storta', 'Gelata', 'Rovente'];
const NOUN = ['Collina', 'Valle', 'Piana', 'Gola', 'Fortezza', 'Radura', 'Duna', 'Baia', 'Rocca', 'Pianura', 'Spiaggia', 'Cresta'];

// difficulty d: 0 (tutorial-easy) … 1 (hard); > 1 keeps scaling (Infinita)
export function knobs(d) {
  const e = clamp(d, 0, 1), x = Math.max(0, d - 1);
  return {
    rows: Math.round(lerp(3, 5, e)) + (x > 0.6 ? 1 : 0),
    badShare: lerp(0.18, 0.45, e),          // share of gates that hurt
    moveChance: lerp(0, 0.45, e) + x * 0.1, // share of moving gates
    obstacles: Math.round(lerp(0, 3, e) + x * 2),
    saws: e > 0.45 ? Math.round(lerp(0, 2, (e - 0.45) / 0.55) + x) : 0,
    spawners: 1 + (e > 0.35 ? 1 : 0) + (e > 0.75 ? 1 : 0) + (x > 0.8 ? 1 : 0),
    enemyFrac: lerp(0.12, 0.34, e) + x * 0.06,  // red figures per second, as a share of a decent player's flow
    towers: Math.round(lerp(0, 2, e) + x * 1.5),
    walls: e > 0.25 ? Math.round(lerp(0, 2, e)) + (x > 0.5 ? 1 : 0) : 0,
    targetRatio: lerp(0.34, 0.7, e) + Math.min(0.12, x * 0.05), // time a decent player needs, / timer
    timer: Math.round(lerp(90, 120, e) / 5) * 5,
    lineHp: Math.round(lerp(40, 25, e)),
  };
}

const ARENA_W = 14, ARENA_H = 44, BASE_Y = 41, GATE_Y0 = 8, GATE_Y1 = 30;

function makeRow(r, y, k, rowIdx, rows) {
  // 2 or 3 gates across the row, sometimes leaving a neutral gap
  const n = r() < 0.35 ? 3 : 2;
  const gap = n === 2 && r() < 0.35;
  const span = ARENA_W - 1.2;
  const slots = gap ? 3 : n;
  const sw = span / slots;
  const gapAt = gap ? (r() * 3) | 0 : -1;
  const out = [];
  let goods = 0;
  for (let i = 0, s = 0; s < slots; s++) {
    if (s === gapAt) continue;
    const late = rowIdx / Math.max(1, rows - 1);
    let bad = r() < k.badShare;
    if (i === n - 1 && goods === 0) bad = false; // at least one good gate per row
    let type, value;
    if (bad) {
      if (r() < 0.55) { type = 'sub'; value = pick(r, late > 0.66 ? [5, 8, 10, 15] : late > 0.33 ? [3, 4, 6, 8] : [1, 2, 3]); }
      else { type = 'div'; value = pick(r, [2, 2, 3]); }
    } else {
      goods++;
      if (r() < 0.55 + late * 0.2) { type = 'mul'; value = pick(r, late > 0.5 ? [2, 3, 3, 4, 5] : [2, 2, 3]); }
      else { type = 'add'; value = pick(r, late > 0.5 ? [10, 15, 20, 25] : [3, 5, 8, 10]); }
    }
    const x = -span / 2 + sw * (s + 0.5);
    let w = r2(sw * (0.82 + r() * 0.12));
    const g = { x: r2(x), y: r2(y), w, type, value, move: null };
    if (r() < k.moveChance) {
      // a moving gate is narrower and sways only inside its own slot (never into a neighbour or a wall)
      g.w = w = r2(sw * 0.58);
      const slack = Math.min(ARENA_W / 2 - 0.1 - (Math.abs(x) + w / 2), (sw - w) / 2 - sw * 0.06);
      if (slack > 0.35) g.move = { amp: r2(Math.min(slack, 0.6 + r() * 1.4)), speed: r2(0.6 + r() * 1.1), phase: r2(r() * 6.28) };
      else g.w = r2(sw * 0.85);
    }
    out.push(g); i++;
  }
  return out;
}

// raw layout; the strength of the base is tuned afterwards against the headless estimate
function layout(seed, d) {
  const r = rng(seed), k = knobs(d);
  const gates = [], obstacles = [];
  for (let i = 0; i < k.rows; i++) {
    const y = lerp(GATE_Y0, GATE_Y1, k.rows === 1 ? 0.5 : i / (k.rows - 1)) + (r() - 0.5) * 1.2;
    gates.push(...makeRow(r, y, k, i, k.rows));
  }
  // rocks sit between rows and swallow figures that walk into them; saws sweep sideways
  const rowYs = [...new Set(gates.map((g) => g.y))].sort((a, b) => a - b);
  for (let i = 0; i < k.obstacles; i++) {
    const j = (r() * (rowYs.length + 1)) | 0;
    const ya = j === 0 ? 4 : rowYs[j - 1] + 1.5, yb = j >= rowYs.length ? 36 : rowYs[j] - 1.5;
    obstacles.push({ type: 'rock', x: r2((r() - 0.5) * (ARENA_W - 3)), y: r2(lerp(ya, Math.max(ya, yb), r())), r: r2(0.5 + r() * 0.4), move: null });
  }
  for (let i = 0; i < k.saws; i++) {
    const y = r2(lerp(GATE_Y0 + 2, 36, r()));
    obstacles.push({ type: 'saw', x: 0, y, r: 0.8, move: { amp: r2(ARENA_W / 2 - 1.5), speed: r2(0.7 + r() * 0.8), phase: r2(r() * 6.28) } });
  }
  const spawners = [];
  for (let i = 0; i < k.spawners; i++) spawners.push({ x: r2(k.spawners === 1 ? 0 : lerp(-4, 4, i / (k.spawners - 1))), rate: 1, start: r2(2 + i * 1.5) });
  const towers = [];
  for (let i = 0; i < k.towers; i++) towers.push({ x: r2(i % 2 ? 4.5 : -4.5), y: r2(BASE_Y - 3 - (i >> 1) * 4), rate: r2(1.2 + d * 1.5), range: 6 });
  const walls = [];
  for (let i = 0; i < k.walls; i++) walls.push({ x: r2((r() - 0.5) * 6), y: r2(36 - i * 2.2), w: r2(4 + r() * 3), hp: 0 });
  const theme = THEMES[(seed >>> 3) % THEMES.length];
  return {
    id: `gen-${seed}-${Math.round(d * 100)}`, name: `${pick(r, NOUN)} ${pick(r, ADJ)}`, seed, difficulty: r2(d),
    arena: { w: ARENA_W, h: ARENA_H, theme },
    cannon: { rate: 4, burst: 1, speed: 6 },
    gates, obstacles,
    base: { y: BASE_Y, hp: 0, spawners, towers, walls, phases: [{ at: 0.66, spawnMul: 1.35, msg: 'La base si arrabbia!' }, { at: 0.33, spawnMul: 1.8, msg: 'Ultima difesa!' }] },
    line: { hp: k.lineHp }, timer: k.timer, stars: { t2: 0, t3: 0 },
  };
}

// ---------------------------------------------------------------- headless evaluation
// Yield of one shot fired from lane x at time t0 (walks straight up, figures travel at `speed`).
export function laneYield(level, x, t0 = 0, mods = {}) {
  const sp = (level.cannon?.speed || 6) * (mods.speed || 1);
  const hits = [];
  for (const g of level.gates) hits.push({ y: g.y, g });
  for (const o of level.obstacles || []) hits.push({ y: o.y, o });
  hits.sort((a, b) => a.y - b.y);
  let n = (level.cannon?.burst || 1) + (mods.burst || 0), bad = 0;
  for (const h of hits) {
    const t = t0 + h.y / sp;
    if (h.g) {
      const gx = posAt(h.g, t);
      if (Math.abs(x - gx) <= h.g.w / 2) {
        const good = GATE_TYPES[h.g.type].good;
        if (!good) bad++;
        n = applyGate(n, good ? h.g : { ...h.g, value: mods.badCut ? Math.max(1, Math.round(h.g.value * (h.g.type === 'div' ? 0.75 : 0.5))) : h.g.value }, good ? mods.gateBonus || 0 : 0);
      }
    } else if (Math.abs(x - posAt(h.o, t)) <= h.o.r + 0.25) {
      // a rock breaks the group up (half get lost around it); a saw shreds most of it
      n = Math.floor(n * (h.o.type === 'rock' ? 0.5 : 0.3));
    }
    if (n <= 0) return { n: 0, bad };
  }
  return { n, bad };
}
const LANES = 57;
const laneXs = (w) => Array.from({ length: LANES }, (_, i) => -w / 2 + 0.4 + (i / (LANES - 1)) * (w - 0.8));
// per-time lane yields sorted; skill s picks the lane at quantile s (1 = always the best lane)
export function yieldProfile(level, mods = {}, samples = 12) {
  const xs = laneXs(level.arena.w);
  const moving = level.gates.some((g) => g.move) || (level.obstacles || []).some((o) => o.move);
  const ts = moving ? Array.from({ length: samples }, (_, i) => i * 0.53) : [0];
  const rows = ts.map((t) => xs.map((x) => laneYield(level, x, t, mods).n).sort((a, b) => a - b));
  const at = (s) => rows.reduce((a, row) => a + row[clamp(Math.round(s * (row.length - 1)), 0, row.length - 1)], 0) / rows.length;
  const best = at(1), median = at(0.5), worst = at(0);
  return { at, best, median, worst, spread: best / Math.max(1, median) };
}
// skill → the mean figures per shot such a player gets
export const SKILL = { novice: 0.55, decent: 0.8, expert: 0.95 };

// Discrete headless match (dt 0.1 s): blue packets go up, red packets come down and cancel 1:1,
// towers pick off blue packets, walls soak hits, the base loses 1 hp per figure that reaches it.
// Champions are left out on purpose (they are a bonus on top of a solvable level).
export function simulate(level, { skill = SKILL.decent, mods = {}, seed = 1, maxTime } = {}) {
  const r = rng(seed);
  const dt = 0.1, sp = (level.cannon?.speed || 6) * (mods.speed || 1), redSp = 3.2;
  const rate = (level.cannon?.rate || 4) * (mods.rate || 1);
  const xs = laneXs(level.arena.w);
  const B = level.base, T = maxTime ?? (level.timer || 600);
  let hp = B.hp, line = level.line?.hp ?? 30, t = 0, shotAcc = 0, figures = 0, maxShot = 0, killed = 0, lineDmg = 0, bad = 0;
  const walls = B.walls.map((w) => ({ ...w })), blue = [], red = [];
  const spawnAcc = B.spawners.map(() => 0);
  const moving = level.gates.some((g) => g.move) || (level.obstacles || []).some((o) => o.move);
  const staticYs = moving ? null : xs.map((x) => laneYield(level, x, 0, mods)).sort((a, b) => a.n - b.n);
  while (t < T) {
    t += dt;
    // fire: the player re-aims at a lane of the quality their skill allows (re-evaluated live for movers)
    shotAcc += rate * dt;
    while (shotAcc >= 1) {
      shotAcc--;
      const ys = staticYs || xs.map((x) => laneYield(level, x, t, mods)).sort((a, b) => a.n - b.n);
      const q = clamp(skill + (r() - 0.5) * 0.25, 0, 1);
      const y = ys[clamp(Math.round(q * (ys.length - 1)), 0, ys.length - 1)];
      if (y.n > 0) { blue.push({ y: GATE_Y1 + 1, n: y.n, t: t + (GATE_Y1 + 1) / sp }); figures += y.n; maxShot = Math.max(maxShot, y.n); }
      bad += y.bad;
    }
    // enemy spawns, faster as the base loses hp
    const lost = 1 - hp / B.hp;
    const mul = B.phases.reduce((m, p) => (1 - lost <= p.at ? p.spawnMul : m), 1) * (level.timer ? 1 : 1 + t / 90);
    B.spawners.forEach((s, i) => { if (t < s.start) return; spawnAcc[i] += s.rate * mul * dt * (mods.redSlow ? 0.85 : 1); if (spawnAcc[i] >= 1) { const k = Math.floor(spawnAcc[i]); spawnAcc[i] -= k; red.push({ y: B.y - 1, n: k }); } });
    // movement (blue packets only start walking past the gate block when they reach it)
    for (const p of blue) if (p.t <= t) p.y += sp * dt;
    for (const p of red) p.y -= redSp * dt * (mods.redSlow ? 0.85 : 1);
    // clash: the lowest red packet meets the highest-reaching blue packets
    red.sort((a, b) => a.y - b.y); blue.sort((a, b) => b.y - a.y);
    for (const rp of red) for (const bp of blue) {
      if (rp.n <= 0) break;
      if (bp.n <= 0 || bp.t > t || bp.y < rp.y) continue;
      const k = Math.min(bp.n, rp.n); bp.n -= k; rp.n -= k; killed += k;
    }
    // towers
    for (const tw of B.towers) { let k = tw.rate * dt * 3; for (const bp of blue) { if (k <= 0) break; if (bp.n > 0 && bp.t <= t && Math.abs(bp.y - tw.y) < tw.range) { const c = Math.min(bp.n, k); bp.n -= c; k -= c; } } }
    // walls and base
    for (const bp of blue) {
      if (bp.n <= 0) continue;
      for (const w of walls) if (w.hp > 0 && bp.y >= w.y) { const c = Math.min(w.hp, bp.n); w.hp -= c; bp.n -= c; bp.y = Math.min(bp.y, w.y - 0.01); }
      if (bp.n > 0 && bp.y >= B.y) { hp -= bp.n; bp.n = 0; }
    }
    for (const rp of red) if (rp.n > 0 && rp.y <= 0) { line -= rp.n; lineDmg += rp.n; rp.n = 0; }
    for (let i = blue.length - 1; i >= 0; i--) if (blue[i].n <= 0) blue.splice(i, 1);
    for (let i = red.length - 1; i >= 0; i--) if (red[i].n <= 0) red.splice(i, 1);
    if (hp <= 0) return { won: true, time: t, figures, maxShot, killed, lineDmg, bad, hpLeft: 0 };
    if (line <= 0) return { won: false, why: 'overrun', time: t, figures, maxShot, killed, lineDmg, bad, hpLeft: hp };
  }
  return { won: false, why: 'time', time: t, figures, maxShot, killed, lineDmg, bad, hpLeft: hp };
}

// Fast analytic estimate: time to kill for a player of skill s. Used to size the base, then
// confirmed by `simulate`.
export function estimate(level, s = SKILL.decent, mods = {}, prof = yieldProfile(level, mods)) {
  const rate = (level.cannon?.rate || 4) * (mods.rate || 1);
  const flow = rate * prof.at(s) * 0.97;
  const red = level.base.spawners.reduce((a, x) => a + x.rate, 0) * 1.25;
  const tow = level.base.towers.reduce((a, x) => a + x.rate * 3, 0) * 0.7;
  const walls = level.base.walls.reduce((a, w) => a + w.hp, 0);
  const net = flow - red - tow;
  return { flow, net, ttk: net > 0 ? (level.base.hp + walls) / net + 6 : Infinity };
}

// Validity: geometry inside the arena, gates don't overlap within a row, numbers sane.
export function validate(level) {
  const e = [];
  const W = level.arena?.w, H = level.arena?.h;
  if (!(W > 0 && H > 0)) e.push('arena');
  if (!Array.isArray(level.gates) || level.gates.length < 2) e.push('gates');
  for (const g of level.gates || []) {
    if (!GATE_TYPES[g.type]) e.push(`gate type ${g.type}`);
    if (!(g.value >= 1) || !Number.isFinite(g.value)) e.push(`gate value ${g.value}`);
    if (Math.abs(g.x) + g.w / 2 + (g.move?.amp || 0) > W / 2 + 0.01) e.push(`gate out ${g.x}`);
    if (g.y <= 2 || g.y >= level.base.y - 4) e.push(`gate y ${g.y}`);
  }
  const rows = {};
  for (const g of level.gates || []) (rows[g.y] ||= []).push(g);
  for (const row of Object.values(rows)) {
    const st = row.slice().sort((a, b) => a.x - b.x), ext = (g) => g.w / 2 + (g.move?.amp || 0);
    for (let i = 1; i < st.length; i++) if (st[i].x - ext(st[i]) < st[i - 1].x + ext(st[i - 1]) - 0.01) e.push('gate overlap');
    if (!row.some((g) => GATE_TYPES[g.type].good)) e.push('row with no good gate');
  }
  if (!(level.base?.hp > 0)) e.push('base hp');
  if (!level.base?.spawners?.length) e.push('spawners');
  if (!(level.line?.hp > 0)) e.push('line hp');
  if (level.timer && !(level.stars?.t2 > 0 && level.stars.t3 > level.stars.t2 && level.stars.t3 < level.timer)) e.push('stars');
  return { ok: e.length === 0, errors: e };
}

// Generate a level; tries successive sub-seeds until the layout is interesting (real lane choice)
// and the tuned base is beaten by a decent player but not by a careless one in the headless sim.
export function generateLevel(seed, difficulty = 0.5, { endless = false, check = true, why = null } = {}) {
  let last = null;
  const no = (k) => { if (why) why[k] = (why[k] || 0) + 1; };
  const e = clamp(difficulty, 0, 1), k = knobs(difficulty);
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = (hashStr(`${seed}:${attempt}`) % 2147483647) + 1;
    const L = layout(s, difficulty);
    L.seed = seed; L.variant = attempt;
    if (endless) L.timer = 75; // nominal clock to size the wave; removed below
    const prof = yieldProfile(L);
    // there must be a real choice: the best lane clearly beats the median one, and a novice still scores
    // … but not a lottery: a so-so aim keeps a fair share of the best lane (band narrows with difficulty)
    const nd = prof.at(SKILL.novice) / Math.max(1, prof.at(SKILL.decent));
    if (prof.spread < 1.6 || prof.spread > 4 + 22 * e || prof.at(SKILL.novice) < 3 || nd < lerp(0.5, 0.18, e) || nd > lerp(0.85, 0.6, e)) { no(prof.spread < 1.6 ? 'spread-low' : prof.spread > 4 + 22 * e ? 'spread-high' : prof.at(SKILL.novice) < 3 ? 'novice-zero' : nd < lerp(0.5, 0.18, e) ? 'nd-low' : 'nd-high'); last = L; continue; }
    tune(L, difficulty, prof);
    if (!validate(L).ok) { no('invalid'); last = L; continue; }
    if (check) {
      // calibrate the base on the headless match: a decent player should need targetRatio of the clock
      const target = L.timer * k.targetRatio;
      let dec = null;
      for (let i = 0; i < 3; i++) {
        dec = simulate(L, { skill: SKILL.decent, seed: s, maxTime: L.timer * 2 });
        const rate = dec.won ? L.base.hp / Math.max(1, dec.time - 5) : (L.base.hp - dec.hpLeft) / dec.time;
        if (dec.won && Math.abs(dec.time - target) < L.timer * 0.04) break;
        if (rate <= 0) break;
        const f = clamp(((target - 5) * rate) / L.base.hp, 0.3, 3);
        L.base.hp = Math.max(30, Math.round((L.base.hp * f) / 10) * 10);
        L.base.walls.forEach((w) => { w.hp = Math.max(5, Math.round(w.hp * f)); });
      }
      dec = simulate(L, { skill: SKILL.decent, seed: s });
      const exp = simulate(L, { skill: SKILL.expert, seed: s + 1 });
      if (!dec.won || !exp.won || exp.time > L.timer * 0.85) { no(!dec.won ? `dec-${dec.why}` : !exp.won ? 'exp-lost' : 'exp-slow'); last = L; continue; }
      if (!endless) {
        const need2 = clamp(dec.time * 1.12, 10, L.timer - 10), need3 = clamp(Math.max(exp.time * 1.12, need2 * 0.6), 8, need2 - 4);
        L.stars = { t2: Math.round(L.timer - need2), t3: Math.round(L.timer - need3) };
      }
      L.check = { decent: r2(dec.time), expert: r2(exp.time), maxShot: exp.maxShot };
    }
    if (endless) { L.timer = 0; L.stars = { t2: 0, t3: 0 }; }
    return L;
  }
  // fallback: soften the last layout until it passes (never hands out an unbeatable level)
  const L = last; L.gates.forEach((g) => { if (!GATE_TYPES[g.type].good) { g.type = 'add'; g.value = 5; } });
  tune(L, Math.max(0, difficulty - 0.2), yieldProfile(L));
  if (endless) { L.timer = 0; L.stars = { t2: 0, t3: 0 }; }
  return L;
}

function tune(L, d, prof) {
  const k = knobs(d);
  const rate = L.cannon.rate;
  const flowDecent = rate * prof.at(SKILL.decent);
  const flowNovice = rate * prof.at(SKILL.novice);
  // enemy pressure is a share of a decent player's flow, but never more than a novice can hold back
  const redTotal = Math.max(0.6, Math.min(flowDecent * k.enemyFrac, flowNovice * 0.7));
  const nS = L.base.spawners.length;
  L.base.spawners.forEach((s) => { s.rate = r2(redTotal / nS); });
  // towers can't eat more than ~a quarter of the flow
  const twCap = (flowDecent * 0.25) / Math.max(1, L.base.towers.length) / 3;
  L.base.towers.forEach((t) => { t.rate = r2(Math.min(t.rate, twCap)); });
  const timer = L.timer || 75; // endless: waves sized for ~75 s of decent play
  // first guess for the base: a decent player needs ~targetRatio of the clock (refined by simulation)
  const net = estimate({ ...L, base: { ...L.base, hp: 1 } }, SKILL.decent, {}, prof).net;
  const budget = Math.max(20, net * (timer * k.targetRatio - 6));
  const wallShare = L.base.walls.length ? 0.18 : 0;
  L.base.walls.forEach((w) => { w.hp = Math.round((budget * wallShare) / L.base.walls.length); });
  L.base.hp = Math.max(30, Math.round(budget * (1 - wallShare) / 10) * 10);
  // stars = seconds LEFT on the clock at the win: 2★ for what a decent player manages, 3★ for a sharp one
  const tExp = estimate(L, SKILL.expert, {}, prof).ttk, tDec = estimate(L, SKILL.decent, {}, prof).ttk;
  if (L.timer) {
    const need2 = clamp(Math.max(tDec * 1.15, tExp * 1.35), 10, L.timer - 10);
    const need3 = clamp(Math.max(tExp * 1.1, need2 * 0.6), 8, need2 - 4);
    L.stars = { t2: Math.round(L.timer - need2), t3: Math.round(L.timer - need3) };
  }
  L.line.hp = k.lineHp + Math.round(redTotal * 4);
}
// stars from a finished match (seconds left on the clock)
export function starsFor(level, won, timeLeft) {
  if (!won) return 0;
  if (!level.timer) return 3;
  return timeLeft >= level.stars.t3 ? 3 : timeLeft >= level.stars.t2 ? 2 : 1;
}
// A single "how hard is it" number: time a decent player needs vs the timer, plus how much a novice struggles.
export function hardness(L) {
  const prof = yieldProfile(L);
  const T = L.timer || 75;
  const dec = L.check?.decent ?? estimate(L, SKILL.decent, {}, prof).ttk, nov = estimate(L, SKILL.novice, {}, prof).ttk;
  return Math.min(2, dec / T) * 0.7 + Math.min(2, nov / T) * 0.3;
}

// ---------------------------------------------------------------- Sfida del giorno
export const ORDA_EPOCH = new Date(2026, 10, 1); // daily #1 = 1 November 2026
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseDay(key) { const [y, m, dd] = key.split('-').map(Number); return new Date(y, m - 1, dd); }
export const dayNumber = (d = new Date()) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - ORDA_EPOCH) / 86400000) + 1;
export function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
// weekday ramp: Monday gentle, Sunday spicy
const WEEK_D = [0.85, 0.35, 0.45, 0.5, 0.6, 0.65, 0.75]; // Sun … Sat
const _dailyCache = new Map();
export function dailySpec(d = new Date()) {
  const key = dayKey(d);
  if (_dailyCache.has(key)) return _dailyCache.get(key);
  const seed = hashStr(`orda-daily:${key}`) % 1000000 + 1;
  const date = parseDay(key);
  const difficulty = WEEK_D[date.getDay()];
  const level = generateLevel(seed, difficulty);
  level.id = `daily-${key}`; level.name = `Sfida #${dayNumber(date)} · ${level.name}`;
  const spec = { key, num: dayNumber(date), seed, difficulty, level, reward: 60 + Math.round(difficulty * 60) };
  _dailyCache.set(key, spec);
  return spec;
}
export const streakBonus = (streak) => Math.min(100, Math.max(0, streak - 1) * 10);
const fmtIt = (n) => Math.round(n).toLocaleString('it-IT');
export function shareText(spec, r) {
  const st = r.won ? '⭐'.repeat(r.stars || 1) + '☆'.repeat(3 - (r.stars || 1)) : '💀';
  const lines = [`Orda #${spec.num} ${st} ${fmtIt(r.figures || 0)} omini`];
  const row = [];
  const pct = clamp(r.won ? 1 : 1 - (r.baseHpPct ?? 1), 0, 1);
  for (let i = 0; i < 10; i++) row.push(i < Math.round(pct * 10) ? '🟥' : '⬜');
  lines.push(`${row.join('')} ${r.won ? `${Math.round(r.time || 0)}s` : `${Math.round(pct * 100)}%`}`);
  if (r.maxShot) lines.push(`💥 colpo max ${fmtIt(r.maxShot)}${r.streak > 1 ? ` · 🔥 ${r.streak} giorni` : ''}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- Infinita
export const PERKS = [
  { id: 'porte', name: 'Porte d’oro', desc: 'Le porte buone valgono di più (+0,5 ai ×, +2 ai +).', icon: 'star', max: 4, mod: (m) => { m.gateBonus = (m.gateBonus || 0) + 1; } },
  { id: 'cadenza', name: 'Cannone rapido', desc: 'Il cannone spara il 20% più in fretta.', icon: 'speed', max: 5, mod: (m) => { m.rate = (m.rate || 1) * 1.2; } },
  { id: 'raffica', name: 'Raffica doppia', desc: 'Ogni colpo lancia un omino in più.', icon: 'burst', max: 3, mod: (m) => { m.burst = (m.burst || 0) + 1; } },
  { id: 'campione', name: 'Carica campione', desc: 'Una carica campione extra a ogni ondata.', icon: 'medal', max: 5, mod: (m) => { m.champions = (m.champions || 0) + 1; } },
  { id: 'scudo', name: 'Barricata', desc: 'La tua linea recupera 15 punti e ne guadagna 5 massimi.', icon: 'shield', max: 99, mod: (m) => { m.lineMax = (m.lineMax || 0) + 5; }, now: (run) => { run.lineMax += 5; run.line = Math.min(run.lineMax, run.line + 15); } },
  { id: 'scarpe', name: 'Scarpe veloci', desc: 'I tuoi omini corrono il 15% più veloci.', icon: 'flag', max: 3, mod: (m) => { m.speed = (m.speed || 1) * 1.15; } },
  { id: 'fango', name: 'Fango', desc: 'Gli omini rossi arrivano più piano e più radi (−15%).', icon: 'rain', max: 2, mod: (m) => { m.redSlow = (m.redSlow || 0) + 1; } },
  { id: 'scudi', name: 'Porte smussate', desc: 'Le porte cattive tolgono la metà.', icon: 'scales', max: 1, mod: (m) => { m.badCut = true; } },
  { id: 'bottino', name: 'Bottino', desc: '+25% monete alla fine della corsa.', icon: 'coin', max: 4, mod: (m) => { m.coinMul = (m.coinMul || 1) + 0.25; } },
];
export const perkById = (id) => PERKS.find((p) => p.id === id);
export function perkMods(perks = []) { const m = {}; for (const id of perks) perkById(id)?.mod(m); return m; }
// three different perks, never one already at its cap
export function rollPerks(runSeed, wave, owned = []) {
  const r = rng(hashStr(`perk:${runSeed}:${wave}`));
  const cnt = (id) => owned.filter((x) => x === id).length;
  const pool = PERKS.filter((p) => cnt(p.id) < p.max);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice((r() * pool.length) | 0, 1)[0].id);
  return out;
}
export const ENDLESS_LINE = 40;
export function newRun(seed = (Math.random() * 1e9) | 0) { return { seed, wave: 1, perks: [], line: ENDLESS_LINE, lineMax: ENDLESS_LINE, figures: 0, maxShot: 0, startedAt: Date.now(), cleared: 0 }; }
export const waveDifficulty = (w) => 0.22 + (w - 1) * 0.085;
// level for wave w of a run: new seed (gates reshuffle), stronger base, bonus gates from perks baked in
export function endlessWave(run) {
  const d = waveDifficulty(run.wave);
  const L = generateLevel(hashStr(`orda-endless:${run.seed}:${run.wave}`), d, { endless: true });
  // past the generator's ceiling, the base keeps growing
  const over = Math.max(0, d - 1);
  const grow = 1 + over * 0.9 + (run.wave - 1) * 0.05;
  L.base.hp = Math.round(L.base.hp * grow / 10) * 10;
  if (L.check) L.check.decent = r2(L.check.decent * grow);
  L.id = `endless-${run.seed}-${run.wave}`; L.name = `Ondata ${run.wave}`;
  L.line = { hp: run.line, max: run.lineMax, carry: true };
  L.timer = 0; L.stars = { t2: 0, t3: 0 };
  L.wave = run.wave;
  const m = perkMods(run.perks);
  L.cannon = { ...L.cannon, rate: r2(L.cannon.rate * (m.rate || 1)), burst: L.cannon.burst + (m.burst || 0), speed: r2(L.cannon.speed * (m.speed || 1)) };
  if (m.gateBonus) for (const g of L.gates) { if (g.type === 'mul') g.value = r2(g.value + 0.5 * m.gateBonus); else if (g.type === 'add') g.value += 2 * m.gateBonus; }
  if (m.badCut) for (const g of L.gates) { if (g.type === 'sub') g.value = Math.max(1, Math.round(g.value / 2)); else if (g.type === 'div') g.value = Math.max(1.5, g.value * 0.75); }
  if (m.redSlow) L.base.spawners.forEach((s) => { s.rate = r2(s.rate * Math.pow(0.85, m.redSlow)); });
  L.perks = run.perks.slice();
  return L;
}
export const runScore = (run) => run.cleared * 1000 + run.figures;
export function upgradesFor(run) { const m = perkMods(run.perks); return { fireRate: m.rate || 1, burst: m.burst || 0, gateBonus: m.gateBonus || 0, speed: m.speed || 1, champions: m.champions || 0, badCut: !!m.badCut, redSlow: m.redSlow || 0 }; }

// ---------------------------------------------------------------- missions & achievements
// check(r, s): r = the match result just finished (may be null), s = the modes store (cumulative)
const A = (id, name, desc, coins, icon, goal, val) => ({ id, name, desc, coins, icon, goal, val });
export const ACHIEVEMENTS = [
  A('colpo100', 'Piccola folla', 'Moltiplica a 100 omini in un colpo', 30, 'users', 100, (s) => s.bestShot),
  A('colpo500', 'Esplosione di omini', 'Moltiplica a 500 omini in un colpo', 120, 'burst', 500, (s) => s.bestShot),
  A('colpo2000', 'Marea umana', 'Moltiplica a 2.000 omini in un colpo', 350, 'burst', 2000, (s) => s.bestShot),
  A('vittoria', 'Prima breccia', 'Distruggi una base nemica', 25, 'flag', 1, (s) => s.wins),
  A('nochamp', 'Solo fanteria', 'Vinci senza usare campioni', 80, 'shield', 1, (s) => s.winsNoChamp),
  A('trestelle', 'Tre stelle', 'Vinci un livello con 3 stelle', 60, 'star', 1, (s) => s.threeStars),
  A('pulita', 'Linea intatta', 'Vinci senza che un rosso tocchi la tua linea', 90, 'shield', 1, (s) => s.cleanWins),
  A('nopecore', 'Strada maestra', 'Vinci senza attraversare porte negative', 80, 'compass', 1, (s) => s.noBadWins),
  A('lampo', 'Lampo', 'Vinci con più di metà del tempo ancora sul timer', 90, 'bolt', 1, (s) => s.fastWins),
  A('giorno1', 'Sfidante', 'Completa una Sfida del giorno', 40, 'calendar', 1, (s) => s.dailyDone),
  A('serie3', 'Abitudine', 'Gioca la Sfida del giorno 3 giorni di fila', 100, 'flame', 3, (s) => s.bestStreak),
  A('serie7', 'Settimana di fuoco', 'Gioca la Sfida del giorno 7 giorni di fila', 300, 'flame', 7, (s) => s.bestStreak),
  A('onde5', 'Resistente', 'Supera 5 ondate in Infinita', 60, 'hourglass', 5, (s) => s.bestWave),
  A('onde10', 'Inarrestabile', 'Supera 10 ondate in Infinita', 160, 'hourglass', 10, (s) => s.bestWave),
  A('onde20', 'Leggenda dell’Orda', 'Supera 20 ondate in Infinita', 450, 'trophy', 20, (s) => s.bestWave),
  A('perk8', 'Collezionista', 'Accumula 8 potenziamenti in una corsa Infinita', 100, 'palette', 8, (s) => s.bestPerks),
  A('esercito', 'Esercito', 'Lancia 10.000 omini in totale', 80, 'users', 10000, (s) => s.figures),
  A('legione', 'Legione', 'Lancia 100.000 omini in totale', 300, 'users', 100000, (s) => s.figures),
];
export function achState(s) {
  return ACHIEVEMENTS.map((a) => { const v = +a.val(s) || 0; return { ...a, have: v, done: v >= a.goal, claimed: !!s.claimed?.[a.id], pct: Math.min(1, v / a.goal) }; });
}

// ---------------------------------------------------------------- persistence (own key, merges with defaults)
const KEY = 'sala_orda_modes_v1';
const DEF = () => ({ daily: {}, streak: 0, bestStreak: 0, lastDaily: '', endless: [], run: null, claimed: {}, bestShot: 0, wins: 0, winsNoChamp: 0, threeStars: 0, cleanWins: 0, noBadWins: 0, fastWins: 0, dailyDone: 0, bestWave: 0, bestPerks: 0, figures: 0, coinsEarned: 0, pendingCoins: 0 });
export function omLoad() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d === 'object') { const x = { ...DEF(), ...d }; x.daily = { ...(d.daily || {}) }; x.claimed = { ...(d.claimed || {}) }; x.endless = Array.isArray(d.endless) ? d.endless : []; return x; } } catch {}
  return DEF();
}
export function omSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return s; }

// fold a finished match into the cumulative stats (every mode feeds missions)
export function recordMatch(s, r, level) {
  s.figures += r.figures || 0;
  s.bestShot = Math.max(s.bestShot, r.maxShot || 0);
  if (r.won) {
    s.wins++;
    if (!r.championsUsed) s.winsNoChamp++;
    if (r.stars >= 3 && level?.timer) s.threeStars++;
    if (!r.lineDamage) s.cleanWins++;
    if (!r.badGates) s.noBadWins++;
    if (level?.timer && r.timeLeft > level.timer / 2) s.fastWins++;
  }
  return s;
}
// daily: the first finished attempt of the day is the official one; later ones are practice
export function recordDaily(s, spec, r) {
  const prev = s.daily[spec.key];
  if (prev?.official) { prev.practice = (prev.practice || 0) + 1; prev.bestPractice = Math.max(prev.bestPractice || 0, r.figures || 0); return { official: false, bonus: 0 }; }
  const yesterday = addDays(spec.key, -1);
  s.streak = s.lastDaily === yesterday ? s.streak + 1 : s.lastDaily === spec.key ? s.streak : 1;
  s.lastDaily = spec.key;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  s.dailyDone++;
  const bonus = r.won ? spec.reward + streakBonus(s.streak) : Math.round(spec.reward / 3);
  s.daily[spec.key] = { official: true, won: !!r.won, stars: r.stars || 0, figures: r.figures || 0, maxShot: r.maxShot || 0, time: Math.round(r.time || 0), baseHpPct: r.baseHpPct ?? (r.won ? 0 : 1), num: spec.num, practice: 0 };
  return { official: true, bonus };
}
// streak is alive if the last official daily was today or yesterday
export function liveStreak(s, today = dayKey()) { return s.lastDaily === today || s.lastDaily === addDays(today, -1) ? s.streak : 0; }
export function recordEndless(s, run) {
  const score = runScore(run);
  s.bestWave = Math.max(s.bestWave, run.cleared);
  s.bestPerks = Math.max(s.bestPerks, run.perks.length);
  s.endless.push({ score, waves: run.cleared, figures: run.figures, maxShot: run.maxShot, perks: run.perks.length, date: dayKey() });
  s.endless.sort((a, b) => b.score - a.score);
  s.endless = s.endless.slice(0, 10);
  const rank = s.endless.findIndex((e) => e.score === score && e.figures === run.figures) + 1;
  const coins = Math.round((run.cleared * 15 + Math.sqrt(run.figures) * 0.6) * (perkMods(run.perks).coinMul || 1));
  return { score, rank, coins };
}
