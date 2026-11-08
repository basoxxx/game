// Headless sanity check for the race engines: node tools/race-selftest.mjs [runs]
// Runs AI races / rallies in every category and prints lap-time calibration and event counts.
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const { createWorld } = await import('../src/engine/world.js');
const { setState } = await import('../src/engine/state.js');
const { getTrack } = await import('../src/engine/world.js');
const { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } = await import('../src/engine/race.js');
const { TEAMS } = await import('../src/data/teams.js');
const { RallyEvent } = await import('../src/engine/rally.js');

const runs = +(process.argv[2] || 3);
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
    sim.cars.forEach((c) => (c.auto = true));
    sim.runToEnd();
    const res = sim.results();
    stats.issues += sim.tv.filter((x) => x.kind === 'issue').length;
    stats.races++; stats.sc += sim.scCount; stats.dnf += res.classification.filter((x) => x.status === 'dnf').length;
    stats.tv += sim.tv.length; stats.restarts += sim.tv.filter((x) => x.kind === 'restart').length;
    const best = Math.min(...Object.values(sim.history).flat().filter((h) => !h.sc).map((h) => h.time));
    rows.push(`${tr.id.padEnd(5)} real ${tr.lap.toFixed(1)}  pole ${Math.min(...Object.values(q.times)).toFixed(2)}  bestRace ${best.toFixed(2)}  winner ${res.classification[0].key}`);
  }
  console.log(`== ${cat}`); rows.forEach((r) => console.log('  ' + r)); console.log('  ', JSON.stringify(stats));
}
{
  const st = createWorld({ playerName: 'Test', category: 'rally', teamId: TEAMS.rally[2].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
  setState(st);
  for (let r = 0; r < Math.min(runs, st.calendar.length); r++) {
    st.round = r; const ev = st.calendar[r]; const tr = getTrack('rally', ev.trackId);
    const R = new RallyEvent(st, ev, tr, {});
    while (!R.finished()) { R.planStage({}); let g = 0; while (!R.allDone() && g++ < 1e5) { const q = R.advance(2); if (q) R.resolveDecision(q, 'b'); } R.completeStage(); if (R.isServiceAfter(R.stageIdx - 1)) R.service({}); }
    const res = R.results();
    console.log(`rally ${tr.id} stages ${res.stages.length} winner ${res.classification[0].key} time ${res.classification[0].time.toFixed(1)} out ${res.classification.filter((x) => x.status === 'dnf').length}`);
  }
}
