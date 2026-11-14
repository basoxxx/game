// Headless sanity check for the race engines: node tools/race-selftest.mjs [runs] [--decisions]
// --decisions also runs tools/race-decisions.mjs (pit wall / decision hub emulation at 1x-32x, slower)
// Runs AI races / rallies in every category and prints lap-time calibration and event counts.
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const { createWorld } = await import('../src/engine/world.js');
const { setState } = await import('../src/engine/state.js');
const { getTrack } = await import('../src/engine/world.js');
const { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } = await import('../src/engine/race.js');
const { TEAMS } = await import('../src/data/teams.js');
const { RallyEvent } = await import('../src/engine/rally.js');

const runs = +(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 3);
const bad = [];
for (const cat of ['formula', 'junior', 'endurance']) {
  const st = createWorld({ playerName: 'Test', category: cat, teamId: TEAMS[cat][3].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
  setState(st);
  let stats = { races: 0, issues: 0, sc: 0, restarts: 0, dnf: 0, tv: 0 };
  const rows = [];
  for (let r = 0; r < Math.min(runs, st.calendar.length); r++) {
    st.round = r;
    const ev = st.calendar[r]; const tr = getTrack(cat, ev.trackId);
    const q = runQualifying(st, tr, {}, 0); const laps = raceLaps(st, tr);
    const sim = new CircuitSim(st, tr, { grid: q.grid, setups: {}, weather: makeWeatherPlan(tr, laps, false), laps });
    // odd rounds: the player's cars stay on manual, every call times out to the engineer (no silent misses)
    sim.cars.forEach((c) => (c.auto = r % 2 === 0 || !c.isPlayer));
    sim.runToEnd();
    const res = sim.results();
    stats.issues += sim.tv.filter((x) => x.kind === 'issue').length;
    stats.races++; stats.sc += sim.scCount; stats.dnf += res.classification.filter((x) => x.status === 'dnf').length;
    stats.err = (stats.err || 0) + sim.events.filter((e) => /sotto pressione/.test(e.text)).length; stats.passes = (stats.passes || 0) + sim.tv.filter((x) => x.kind === 'pass').length;
    stats.tv += sim.tv.length; stats.restarts += sim.tv.filter((x) => x.kind === 'restart').length;
    const best = Math.min(...Object.values(sim.history).flat().filter((h) => !h.sc).map((h) => h.time));
    // ---- sanity checks ----
    const fin = res.classification.filter((x) => x.status !== 'dnf');
    const greens = Object.values(sim.history).flat().filter((h) => !h.sc).map((h) => h.time);
    if (best < tr.lap * 0.93) bad.push(`${cat}/${tr.id}: giro assurdo ${best.toFixed(2)} (reale ${tr.lap})`);
    const slowShare = greens.filter((t) => t > tr.lap * 1.6).length / Math.max(1, greens.length);
    if (cat !== 'endurance' && !sim.weather.isRain && slowShare > 0.08) bad.push(`${cat}/${tr.id}: ${(slowShare * 100).toFixed(0)}% di giri lentissimi a bandiera verde`);
    const stops = fin.map((x) => x.pitStops); const avgStops = stops.reduce((a2, b2) => a2 + b2, 0) / Math.max(1, stops.length);
    stats.stops = (stats.stops || 0) + avgStops;
    if (cat !== 'endurance' && !sim.weather.isRain && !sim.redCount && (avgStops < 0.9 || avgStops > 3.6)) bad.push(`${cat}/${tr.id}: soste medie ${avgStops.toFixed(2)}`);
    if (cat === 'endurance' && (avgStops < 2 || avgStops > laps)) bad.push(`${cat}/${tr.id}: soste medie ${avgStops.toFixed(2)}`);
    if (res.classification.length - fin.length > res.classification.length * 0.45) bad.push(`${cat}/${tr.id}: troppi ritiri (${res.classification.length - fin.length})`);
    const seqs = new Set(sim.cars.filter((c) => c.status !== 'dnf').map((c) => [...sim.stopsLog.filter((x) => x.key === c.key).map((x) => x.from), c.tyre].join('-')));
    stats.strats = (stats.strats || 0) + seqs.size;
    if (cat !== 'endurance' && seqs.size < 2) bad.push(`${cat}/${tr.id}: tutte le strategie identiche`);
    if (sim.moments.length) bad.push(`${cat}/${tr.id}: ${sim.moments.length} decisioni rimaste aperte a fine gara`);
    if (sim.decisions.some((x) => !x.out)) bad.push(`${cat}/${tr.id}: decisioni senza esito`);
    if (sim.cars.some((c) => !isFinite(c.dist) || !isFinite(c.lapTarget))) bad.push(`${cat}/${tr.id}: NaN nello stato auto`);
    stats.red = (stats.red || 0) + (sim.redCount || 0); stats.pens = (stats.pens || 0) + res.penalties.length; stats.dec = (stats.dec || 0) + sim.decisions.length;
    stats.blist = (stats.blist || 0) + sim.cars.reduce((a2, c) => a2 + (c.blisters || 0), 0); stats.stack = (stats.stack || 0) + sim.events.filter((e) => /Doppia sosta/.test(e.text)).length;
    rows.push(`${tr.id.padEnd(5)} real ${tr.lap.toFixed(1)}  pole ${Math.min(...Object.values(q.times)).toFixed(2)}  bestRace ${best.toFixed(2)}  winner ${res.classification[0].key}`);
  }
  stats.stops = +(stats.stops / stats.races).toFixed(2); stats.strats = +(stats.strats / stats.races).toFixed(1);
  console.log(`== ${cat}`); rows.forEach((r) => console.log('  ' + r)); console.log('  ', JSON.stringify(stats));
}
{
  const st = createWorld({ playerName: 'Test', category: 'rally', teamId: TEAMS.rally[2].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
  setState(st);
  for (let r = 0; r < st.calendar.length; r++) {
    st.round = r; const ev = st.calendar[r]; const tr = getTrack('rally', ev.trackId);
    const R = new RallyEvent(st, ev, tr, {});
    while (!R.finished()) { R.planStage({}); let g = 0; while (!R.allDone() && g++ < 1e5) { const q = R.advance(2); if (q) R.resolveDecision(q, 'b'); } R.completeStage(); if (R.isServiceAfter(R.stageIdx - 1)) R.service({}); }
    const res = R.results();
    // ---- rally sanity: stage speeds by surface, totals, classification order, power stage points ----
    const SPD = { gravel: [85, 135], rough: [72, 112], tarmac: [85, 130], snow: [95, 135], mixed: [78, 118] };
    for (const s of R.stages) {
      const v = s.km / s.best * 3600, [lo, hi] = SPD[s.surface] || [70, 140];
      if (!(v >= lo && v <= hi)) bad.push(`rally/${tr.id}: PS${s.idx + 1} ${s.surface} media vincitore ${v.toFixed(0)} km/h fuori scala`);
      const rk = s.results || [];
      for (let i = 1; i < rk.length; i++) if (rk[i].time < rk[i - 1].time) bad.push(`rally/${tr.id}: PS${s.idx + 1} tempi non ordinati`);
      if (s.power) { const pts = rk.slice(0, 5).map((x) => R.crews.find((c) => c.key === x.key).psPoints); if (pts.join() !== [5, 4, 3, 2, 1].slice(0, pts.length).join()) bad.push(`rally/${tr.id}: punti power stage errati ${pts}`); }
    }
    for (const c of R.crews) {
      const sum = c.stageTimes.reduce((a2, x) => a2 + (x || 0), 0) + c.penalty;
      if (!isFinite(c.total) || Math.abs(sum - c.total) > 1e-6) bad.push(`rally/${tr.id}: totale incoerente per ${c.key}`);
      if (c.stageTimes.length !== R.stages.length) bad.push(`rally/${tr.id}: ${c.key} ha ${c.stageTimes.length} tempi su ${R.stages.length} prove`);
    }
    const fin = res.classification.filter((x) => x.status !== 'dnf');
    for (let i = 1; i < fin.length; i++) if (fin[i].time < fin[i - 1].time) bad.push(`rally/${tr.id}: classifica assoluta non ordinata`);
    if (res.classification.length - fin.length > res.classification.length * 0.4) bad.push(`rally/${tr.id}: troppi ritiri`);
    if (fin[0] && fin[0].pts < 25) bad.push(`rally/${tr.id}: il vincitore ha ${fin[0].pts} punti`);
    console.log(`rally ${tr.id} stages ${res.stages.length} winner ${res.classification[0].key} time ${res.classification[0].time.toFixed(1)} out ${res.classification.filter((x) => x.status === 'dnf').length} avg ${R.stages.map((s) => (s.km / s.best * 3600).toFixed(0)).join('/')}`);
  }
}
console.log(bad.length ? 'SANITY FAILURES:\n  ' + bad.join('\n  ') : 'sanity: ok');
if (bad.length) process.exitCode = 1;
if (process.argv.includes('--decisions')) { process.env.SPEEDS ||= '1,8,32'; process.env.BOTS ||= 'ignore,answer,enter,pit'; process.argv[2] = process.env.DEC_CATS || "formula,endurance"; await import('./race-decisions.mjs'); }
