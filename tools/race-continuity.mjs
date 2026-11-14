// Race continuity regression: node tools/race-continuity.mjs [races] [--dt=0.1] [--cats=formula,junior,endurance] [--verbose] [--seed=N]
// Drives CircuitSim like the weekend screen (fixed step) and follows the position every car is SHOWN at
// (incident pose of the highlights recorder, else the sim distance), converted to metres along the circuit.
// Fails when a car moves backwards, faster than any car can, or its speed changes more than physically possible
// between two frames (teleports), and prints overtake statistics (count, share in braking zones / mid-corner).
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const RACES = +(args.find((a) => /^\d+$/.test(a)) || 2);
const DT = +opt('dt', 0.1);
const CATS = opt('cats', 'formula,junior,endurance').split(',');
const VERBOSE = args.includes('--verbose');
const { mulberry32 } = await import(ROOT + '/src/engine/rng.js');
if (opt('seed')) Math.random = mulberry32(+opt('seed'));
const { createWorld, getTrack } = await import(ROOT + '/src/engine/world.js');
const { setState } = await import(ROOT + '/src/engine/state.js');
const { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } = await import(ROOT + '/src/engine/race.js');
const { TEAMS } = await import(ROOT + '/src/data/teams.js');
const { trackGeometry, referenceProfile, sampleAtTimeFrac } = await import(ROOT + '/src/engine/trackphys.js');

// physical limits of what the viewer may see between two frames
const VMAX = 105; // m/s (378 km/h)
const AMAX = 100; // m/s^2: ~10 g, beyond the hardest braking of the reference speed profile (an impact is a pose: the car stops)
const W = 6;
const bad = [];
const tot = { frames: 0, jumps: 0, back: 0, fast: 0, accel: 0, jump: 0, worstJump: 0, passes: 0, passBrake: 0, passMid: 0, passStraight: 0, races: 0 };
const kinds = {};
for (const cat of CATS) {
  const st = createWorld({ playerName: 'Test', category: cat, teamId: TEAMS[cat][3].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
  setState(st);
  for (let r = 0; r < Math.min(RACES, st.calendar.length); r++) {
    st.round = r;
    const tr = getTrack(cat, st.calendar[r].trackId);
    const q = runQualifying(st, tr, {}, 0); const laps = raceLaps(st, tr);
    const sim = new CircuitSim(st, tr, { grid: q.grid, setups: {}, weather: makeWeatherPlan(tr, laps, false), laps });
    sim.cars.forEach((c) => (c.auto = true));
    const g = trackGeometry(tr.cid), prof = referenceProfile(sim.cat, tr.cid, tr.lap), L = g.len, N = g.N;
    // metres along the race from the engine's position unit (laps of time)
    const M = (u) => { const f = Math.floor(u); return f * L + (sampleAtTimeFrac(prof, u - f) / N) * L; };
    // braking zones: samples where the reference speed falls; corners: |curvature| above 1/200 m
    const braking = (u) => { const i = Math.floor(sampleAtTimeFrac(prof, u - Math.floor(u))) % N; let dv = 0; for (let q2 = 0; q2 < 8; q2++) dv += prof.v[(i + q2) % N] - prof.v[(i + q2 + 1) % N]; return dv > 1.2; };
    const midCorner = (u) => { const i = Math.floor(sampleAtTimeFrac(prof, u - Math.floor(u))) % N; return Math.abs(g.k[i]) > 1 / 120 && !braking(u); };
    const prev = new Map(); const pitT = new Map();
    let prevOrder = null; let racePasses = 0;
    let steps = 0;
    while (!sim.finished && steps++ < 400000) {
      sim.step(DT);
      tot.frames++;
      // what the weekend screen shows (update3D / draw2D)
      const shown = [];
      sim.cars.forEach((c, ci) => {
        const pose = sim.hl?.livePose(ci, W);
        if (c.status === 'dnf' && !pose) { prev.delete(c.key); return; }
        if (c.inPit > 0 || (c.pitReq && (c.dist % 1) > 0.9)) pitT.set(c.key, sim.time);
        let d = c.status === 'finished' ? sim.hl?.carU(c) ?? c.finishLap : c.dist;
        if (pose) d = pose.u;
        const m = M(d);
        const p = prev.get(c.key);
        const inPit = sim.time - (pitT.get(c.key) ?? -99) < 6;
        if (p && !inPit && sim.time > 4) {
          const v = (m - p.m) / DT;
          // an impact (crash pose) may stop a car at any rate; a teleport shows as a position jump anyway
          const jmp = p.v != null ? Math.abs(m - p.m - p.v * DT) : 0;
          const why = v < -0.5 ? 'back' : v > VMAX ? 'fast' : jmp > 4 && !(pose && v <= p.v) ? 'jump' : !pose && p.v != null && Math.abs(v - p.v) / DT > AMAX && jmp > 1.5 ? 'accel' : null;
          if (why) {
            tot.jumps++; tot[why]++;
            const jm = Math.abs(m - p.m - (p.v ?? v) * DT);
            tot.worstJump = Math.max(tot.worstJump, jm);
            const k = `${why}:${p.tag || '-'}`; kinds[k] = (kinds[k] || 0) + 1;
            if (VERBOSE && jm > +opt('jm', 3)) console.log(`  ${cat}/${tr.id} t=${sim.time.toFixed(1)} ${c.key} ${why} v=${v.toFixed(1)} prev=${(p.v ?? 0).toFixed(1)} jump=${jm.toFixed(1)}m pose=${pose ? 'y' : 'n'} st=${c.status} ${p.tag || ''}`);
          }
          prev.set(c.key, { m, v: why ? null : v, tag: pose ? 'pose' : c.status });
        } else prev.set(c.key, { m, v: null, tag: pose ? 'pose' : c.status });
        if (c.status === 'running' && !inPit && !pose) shown.push({ key: c.key, d });
      });
      // on-track overtakes: adjacent cars whose order flips while both are in sight of each other
      shown.sort((a, b) => b.d - a.d);
      const order = new Map(shown.map((x, i) => [x.key, x]));
      if (prevOrder && !sim.sc) {
        for (const [k, x] of order) {
          const o = prevOrder.get(k); if (!o) continue;
          for (const [k2, y] of order) {
            if (k2 === k) continue; const o2 = prevOrder.get(k2); if (!o2) continue;
            // k was behind k2 (within 60 m) and is now ahead
            if (o.d < o2.d && x.d > y.d && M(o2.d) - M(o.d) < 60 && Math.abs(x.d - y.d) < 0.05) {
              racePasses++; const u = (x.d + y.d) / 2;
              if (braking(u)) tot.passBrake++; else if (midCorner(u)) tot.passMid++; else tot.passStraight++;
            }
          }
        }
      }
      prevOrder = order;
    }
    tot.passes += racePasses; tot.races++;
    if (VERBOSE) console.log(`${cat}/${tr.id}: ${racePasses} on-track passes, ${sim.tv.filter((x) => x.kind === 'pass').length} TV passes`);
  }
}
const share = (x) => `${((x / Math.max(1, tot.passes)) * 100).toFixed(0)}%`;
console.log(`frames ${tot.frames}  jumps ${tot.jumps} (back ${tot.back}, too fast ${tot.fast}, jump ${tot.jump}, accel ${tot.accel})  worst ${tot.worstJump.toFixed(1)} m`);
console.log(`passes/race ${(tot.passes / Math.max(1, tot.races)).toFixed(1)}  braking zone ${share(tot.passBrake)}  straight ${share(tot.passStraight)}  mid-corner ${share(tot.passMid)}`);
if (VERBOSE) console.log(kinds);
// a few frames can legitimately be rough (one sample at a lap-line rounding), teleports cannot
const LIMIT = +(opt('limit', 0));
if (tot.jumps > LIMIT) bad.push(`${tot.jumps} discontinuità di posizione (limite ${LIMIT}), peggiore ${tot.worstJump.toFixed(1)} m`);
if (bad.length) { console.log('FAIL'); bad.forEach((b) => console.log('  - ' + b)); process.exit(1); }
console.log('OK');
