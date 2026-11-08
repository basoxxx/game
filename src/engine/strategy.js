// Strategy maths shared by the pre-race planner and the live race strategist.
// Tyre ageing follows the race simulation exactly: a sim lap ages the tyre by
// scale * trackWear * wearMult "real laps", and the life is m.life / (trackWear * wearMult).
import { COMPOUNDS } from '../data/categories.js';
import { tyreModel, degPenalty, weatherFactor } from './tyres.js';

const DRY = ['soft', 'medium', 'hard'];
export const FUEL_SAVE = { cost: 0.4, cons: 0.88 }; // lift & coast: s/lap (90s scale) and consumption factor

// ctx: { cat, track, scale, wm (wear mult), pitLoss, comps }
export function stintCostArr(ctx, c, n, age0 = 0, fresh = true) {
  const m = tyreModel(ctx.cat, c); const tw = ctx.track.wear; const ls = ctx.track.lap / 90;
  const life = m.life / (tw * ctx.wm);
  const dA = ctx.scale * tw * ctx.wm;
  const arr = [0];
  for (let i = 1; i <= n; i++) {
    const age = age0 + (i - 0.5) * dA;
    // beyond the end of the tyre life: puncture / crash risk priced in, so plans stop before it
    const wear = (age + 0.5 * dA) / life;
    const risk = wear > 1 ? (wear - 1) * 60 : 0;
    arr.push(arr[i - 1] + (m.pace + degPenalty(m, age, life) + risk + (fresh && i === 1 ? 0.6 : 0)) * ls);
  }
  return arr;
}

// Best stint lengths for a fixed compound sequence covering L laps (first stint may start used)
function bestSplit(ctx, seq, L, first, costs, minStint) {
  const k = seq.length;
  if (k * minStint > L + (first ? minStint : 0)) return null;
  // dp[j][l]: min cost of covering l laps with the first j stints
  let prev = new Array(L + 1).fill(Infinity); prev[0] = 0;
  const choice = [];
  for (let j = 0; j < k; j++) {
    const cur = new Array(L + 1).fill(Infinity); const ch = new Array(L + 1).fill(-1);
    const arr = costs(j);
    const last = j === k - 1;
    const lo = j === 0 && first ? 1 : (last ? 1 : minStint);
    for (let l = 0; l <= L; l++) {
      if (prev[l] === Infinity) continue;
      if (last) { const n = L - l; if (n >= lo && prev[l] + arr[n] < cur[L]) { cur[L] = prev[l] + arr[n]; ch[L] = n; } continue; }
      for (let n = lo; l + n <= L - 1; n++) { const v = prev[l] + arr[n]; if (v < cur[l + n]) { cur[l + n] = v; ch[l + n] = n; } }
    }
    choice.push(ch); prev = cur;
  }
  if (prev[L] === Infinity) return null;
  const laps = []; let l = L;
  for (let j = k - 1; j >= 0; j--) { const n = choice[j][l]; laps.unshift(n); l -= n; }
  return { laps, time: prev[L] + (k - 1) * ctx.pitLoss };
}

// Enumerate plans. opts: { L, first: {c, age}|null, stops: number|null (exact), maxStops, usedDry: Set, mustTwo }
export function optimise(ctx, opts) {
  const comps = (ctx.comps || DRY).filter((c) => DRY.includes(c));
  const L = opts.L;
  const maxStops = opts.stops ?? opts.maxStops ?? 3;
  const minStops = opts.stops ?? 0;
  const minStint = Math.max(2, Math.round(3 / ctx.scale));
  const cache = {};
  const costFor = (c, fresh, age) => { const k = c + fresh + age; return (cache[k] ||= stintCostArr(ctx, c, L, age, fresh)); };
  const out = [];
  const rec = (seq) => {
    const stops = seq.length - 1;
    if (stops >= minStops) {
      const used = new Set([...(opts.usedDry || []), ...seq]);
      if (!(opts.mustTwo && [...used].filter((x) => DRY.includes(x)).length < 2)) {
        const r = bestSplit(ctx, seq, L, opts.first, (j) => (j === 0 && opts.first ? costFor(seq[0], false, opts.first.age) : costFor(seq[j], true, 0)), minStint);
        if (r) out.push({ stints: seq.map((c, j) => ({ c, laps: r.laps[j] })), time: r.time, stops });
      }
    }
    if (stops < maxStops) for (const c of comps) rec([...seq, c]);
  };
  if (opts.first) rec([opts.first.c]); else for (const c of comps) rec([c]);
  out.sort((a, b) => a.time - b.time);
  return out;
}

// Relative cost of a given plan (stints of the remaining race; first stint may be a used tyre)
export function planCost(ctx, stints, first = null) {
  let t = 0;
  stints.forEach((s, j) => {
    const used = j === 0 && first;
    const arr = stintCostArr(ctx, s.c, s.laps, used ? first.age : 0, !used);
    t += arr[s.laps];
  });
  return t + (stints.length - 1) * ctx.pitLoss;
}

// Predicted lap times for a full race plan (absolute, for the planner chart)
// o: { base, laps, fuelLoad, fuelSaveLaps }
export function predictLaps(ctx, stints, o) {
  const ls = ctx.track.lap / 90;
  const out = []; let lap = 0; const pits = [];
  stints.forEach((s, j) => {
    const arr = stintCostArr(ctx, s.c, s.laps, 0, true);
    for (let i = 1; i <= s.laps; i++) {
      lap++;
      const prog = (lap - 0.5) / o.laps;
      const fuel = Math.max(0, (o.fuelLoad ?? 1) - prog) * 3.1 * ls * (o.fuelScale ?? 1);
      const evo = -Math.min(1, prog * 2.5) * 0.45 * ls;
      const save = o.fuelSaveLaps && lap > o.laps - o.fuelSaveLaps ? FUEL_SAVE.cost * ls : 0;
      out.push({ lap, t: o.base + arr[i] - arr[i - 1] + fuel + evo + save, c: s.c, pit: i === s.laps && j < stints.length - 1 });
    }
    if (j < stints.length - 1) pits.push(lap);
  });
  const total = out.reduce((a, x) => a + x.t, 0) + pits.length * ctx.pitLoss;
  return { laps: out, pits, total };
}

// Laps that must be run in lift & coast for a starting fuel load (fraction of the race need)
export function fuelSaveLaps(load, laps) {
  const deficit = Math.max(0, 1 - load) * laps; // laps of fuel missing
  return deficit / (1 - FUEL_SAVE.cons);
}

export function normalizePlan(plan, total) {
  if (!plan?.length) return plan;
  const head = plan.slice(0, -1).reduce((a, s) => a + s.laps, 0);
  plan[plan.length - 1].laps = Math.max(1, total - head);
  return plan;
}
export const pitLaps = (plan) => { const out = []; let l = 0; for (let i = 0; i < plan.length - 1; i++) { l += plan[i].laps; out.push(l); } return out; };
export const planKey = (plan) => (plan || []).map((s) => s.c).join('-');
export const compName = (c) => COMPOUNDS[c]?.name || c;

// ---------------- WEATHER (CROSSOVER) STRATEGY ----------------
// Relative lap-time cost (s) of a tyre family in a given rain level. 'dry' = slicks (medium pace).
// Slicks on a wet track also carry an aquaplaning / crash risk, priced in.
export function wxLapCost(fam, r, base) {
  const comp = fam === 'dry' ? 'medium' : fam;
  return base * (weatherFactor(comp, r) - 1) + (fam === 'dry' && r > 0.25 ? base * (r - 0.25) * 0.15 : 0);
}
// Best tyre family lap by lap for a forecast (array of rain levels), with a pit loss for every change
// (Viterbi). Dry phases are then split with the dry optimiser. Returns { stints, phases, crossovers, wet }.
export function crossoverPlan(ctx, rain, { base, hasInter = true, mustTwo = false, start = null }) {
  const L = rain.length;
  const fams = hasInter ? ['dry', 'inter', 'wet'] : ['dry', 'wet'];
  let cost = fams.map((f) => (start && f !== start ? 1e6 : 0) + wxLapCost(f, rain[0] || 0, base));
  const back = [];
  for (let i = 1; i < L; i++) {
    const nc = [], bk = [];
    fams.forEach((f, k) => {
      let best = Infinity, bj = 0;
      fams.forEach((g, j) => { const v = cost[j] + (j === k ? 0 : ctx.pitLoss); if (v < best) { best = v; bj = j; } });
      nc.push(best + wxLapCost(f, rain[i] || 0, base)); bk.push(bj);
    });
    cost = nc; back.push(bk);
  }
  let k = cost.indexOf(Math.min(...cost));
  const seq = new Array(L); seq[L - 1] = k;
  for (let i = L - 1; i > 0; i--) { k = back[i - 1][k]; seq[i - 1] = k; }
  const phases = [];
  seq.forEach((k2, i) => { const f = fams[k2]; const last = phases[phases.length - 1]; if (last && last.f === f) last.laps++; else phases.push({ f, from: i + 1, laps: 1 }); });
  const wet = phases.some((p) => p.f !== 'dry');
  const stints = [];
  for (const p of phases) {
    if (p.f !== 'dry') { stints.push({ c: p.f, laps: p.laps, wx: true }); continue; }
    const o = optimise(ctx, { L: p.laps, maxStops: 2, mustTwo: mustTwo && !wet })[0];
    if (o) stints.push(...o.stints.map((s) => ({ ...s })));
    else stints.push({ c: p.laps * ctx.scale * ctx.track.wear * ctx.wm < 14 ? 'soft' : 'medium', laps: p.laps });
  }
  const crossovers = phases.slice(1).map((p, i) => ({ lap: p.from, from: phases[i].f, to: p.f }));
  return { stints, phases, crossovers, wet };
}
