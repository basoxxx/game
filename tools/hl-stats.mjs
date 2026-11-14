// Incident / highlight statistics over many AI races: node tools/hl-stats.mjs [race module, default race.js]
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const mod = process.argv[2] || 'race.js';
const { createWorld, getTrack } = await import(ROOT + '/src/engine/world.js');
const { setState } = await import(ROOT + '/src/engine/state.js');
const { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } = await import(ROOT + '/src/engine/' + mod);
const { TEAMS } = await import(ROOT + '/src/data/teams.js');
const { encodeReel } = await import(ROOT + '/src/engine/highlights.js');
for (const cat of ['formula', 'junior', 'endurance']) {
  let races = 0, sc = 0, vsc = 0, red = 0, dnf = 0, crash = 0, clips = 0, bytes = 0, inc = 0; const types = {};
  for (let rep = 0; rep < (cat === 'endurance' ? 2 : 4); rep++) {
    const st = createWorld({ playerName: 'T', category: cat, teamId: TEAMS[cat][3].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
    setState(st);
    for (let r = 0; r < Math.min(8, st.calendar.length); r++) {
      st.round = r; const tr = getTrack(cat, st.calendar[r].trackId);
      const q = runQualifying(st, tr, {}, 0); const laps = raceLaps(st, tr);
      const sim = new CircuitSim(st, tr, { grid: q.grid, setups: {}, weather: makeWeatherPlan(tr, laps, false), laps });
      sim.cars.forEach((c) => (c.auto = true));
      sim.runToEnd(); races++;
      sc += sim.tv.filter((x) => x.kind === 'sc' && !/rossa/i.test(x.title)).length; vsc += sim.tv.filter((x) => x.kind === 'vsc').length; red += sim.redCount || 0;
      dnf += sim.results().classification.filter((x) => x.status === 'dnf').length;
      crash += sim.events.filter((e) => e.type === 'crash' || /RITIRO.*💥|💥 RITIRO/u.test(e.text)).length;
      inc += (sim.incidents || []).length; for (const x of sim.results().classification) if (x.status === "dnf") types["R:" + x.reason] = (types["R:" + x.reason] || 0) + 1;
      if (sim.hl) { const reel = sim.hl.finalize(); clips += reel.clips.length; bytes += JSON.stringify(encodeReel(reel)).length; for (const c of reel.clips) types[c.type] = (types[c.type] || 0) + 1; }
    }
  }
  const f = (x) => (x / races).toFixed(2);
  console.log(cat.padEnd(10), 'races', races, 'dnf', f(dnf), 'crash', f(crash), 'sc', f(sc), 'vsc', f(vsc), 'red', f(red), 'inc', f(inc), 'clips', f(clips), 'KB', (bytes / races / 1024).toFixed(1), JSON.stringify(types));
}
