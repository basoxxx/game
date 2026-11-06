// Tyre, fuel and strategy model. Ages are expressed in "real laps" so behaviour is
// consistent whatever the race length: a sim lap advances the tyre by `scale` real laps.

// pace: s/lap vs medium at a 90s lap (scaled with lap length)
// life: real laps before the cliff at wear factor 1.0
// deg: linear degradation s/lap per real lap of age (scaled)
// win: optimal temperature window centre (°C)
export const TYRE_MODEL = {
  formula: {
    soft: { pace: -0.72, life: 19, deg: 0.065, win: 95 },
    medium: { pace: 0, life: 31, deg: 0.042, win: 103 },
    hard: { pace: 0.52, life: 46, deg: 0.028, win: 111 },
    inter: { pace: 0, life: 34, deg: 0.05, win: 75, wet: true },
    wet: { pace: 0, life: 40, deg: 0.045, win: 65, wet: true },
  },
  endurance: {
    soft: { pace: -0.55, life: 34, deg: 0.03, win: 92 },
    medium: { pace: 0, life: 52, deg: 0.02, win: 100 },
    hard: { pace: 0.45, life: 72, deg: 0.014, win: 108 },
    wet: { pace: 0, life: 60, deg: 0.025, win: 65, wet: true },
  },
};

export function tyreModel(catId, compound) {
  return (TYRE_MODEL[catId] || TYRE_MODEL.formula)[compound];
}

// Degradation penalty (s, at 90s-lap scale) for a tyre of given age (real laps) and life
export function degPenalty(m, age, life) {
  const lin = m.deg * age * (1 + (age / life) * 0.6);
  const cliffStart = life * 0.86;
  const cliff = age > cliffStart ? (age - cliffStart) ** 2 * 0.055 : 0;
  return lin + cliff;
}

// Temperature penalty: grip loss outside the window (each 10°C ~ 0.25s)
export function tempPenalty(m, temp) {
  const d = Math.abs(temp - m.win);
  return d < 6 ? 0 : ((d - 6) / 10) * 0.28;
}

// wet/dry mismatch multiplier on lap time
export function weatherFactor(compound, rain) {
  if (compound === 'wet') return 1 + 0.085 + Math.max(0, 0.55 - rain) * 0.12 + rain * 0.03;
  if (compound === 'inter') return 1 + 0.05 + (rain > 0.7 ? (rain - 0.7) * 0.22 : 0) + (rain < 0.15 ? (0.15 - rain) * 0.35 : 0) + rain * 0.03;
  // slicks
  return 1 + rain * 0.07 + (rain > 0.18 ? (rain - 0.18) * 0.32 : 0);
}

// Strategy optimiser for a dry race: returns sorted options [{stints:[{c,laps}], time}]
export function strategyOptions(catId, track, simLaps, scale, wearMult = 1, pitLoss = 21, compounds = ['soft', 'medium', 'hard']) {
  const ls = track.lap / 90;
  const cost = {};
  for (const c of compounds) {
    const m = tyreModel(catId, c);
    const life = m.life / (track.wear * wearMult);
    const arr = [0];
    for (let n = 1; n <= simLaps; n++) {
      const age = (n - 0.5) * scale;
      // warm-up lap penalty on first lap of a stint
      const lap = (m.pace + degPenalty(m, age, life) + (n === 1 ? 0.6 : 0)) * ls;
      arr.push(arr[n - 1] + lap);
    }
    cost[c] = arr;
  }
  const opts = [];
  const L = simLaps;
  const minStint = Math.max(1, Math.round(3 / scale));
  // one stop
  for (const a of compounds) for (const b of compounds) {
    if (a === b) continue;
    let best = null;
    for (let s = minStint; s <= L - minStint; s++) { const t = cost[a][s] + cost[b][L - s]; if (!best || t < best.t) best = { t, s }; }
    if (best) opts.push({ stints: [{ c: a, laps: best.s }, { c: b, laps: L - best.s }], time: best.t + pitLoss });
  }
  // two stops
  for (const a of compounds) for (const b of compounds) for (const c of compounds) {
    if (a === b && b === c) continue;
    let best = null;
    for (let s1 = minStint; s1 <= L - 2 * minStint; s1++) for (let s2 = minStint; s1 + s2 <= L - minStint; s2++) {
      const t = cost[a][s1] + cost[b][s2] + cost[c][L - s1 - s2];
      if (!best || t < best.t) best = { t, s1, s2 };
    }
    if (best) opts.push({ stints: [{ c: a, laps: best.s1 }, { c: b, laps: best.s2 }, { c, laps: L - best.s1 - best.s2 }], time: best.t + 2 * pitLoss });
  }
  // three stops only for very high degradation
  opts.sort((x, y) => x.time - y.time);
  // dedupe by compound sequence
  const seen = new Set();
  return opts.filter((o) => { const k = o.stints.map((s) => s.c).join('-'); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function estimateWearMult(team, driver, trackTemp = 32) {
  const tp = team.car.parts.tyre ?? 75;
  return (1.18 - tp / 420 - driver.attrs.tyre / 520) * (1 + (trackTemp - 32) * 0.008);
}
