// Headless pit-wall emulation: CircuitSim + DecisionHub driven like the weekend screen loop.
// node tools/race-decisions.mjs [cats]   (env SPEEDS=1,8,32 MODES=pause,slow BOTS=ignore,answer,enter,unpause,cards,pit)
// Forces safety car, red flag, rain, drying track, mechanical issue and VSC in every race; checks pause/slow and speed
// restore, engineer default on timeout, >= MIN_REAL real seconds per call, no duplicate / stale / lost cards, keyboard
// answers (1-3, Enter, Z/X/C), and box calls this lap / next lap / after the pit entry served on the promised lap.
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.document ??= { documentElement: { classList: { contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 0);
const { createWorld, getTrack } = await import(ROOT + '/src/engine/world.js');
const { setState, setSettings } = await import(ROOT + '/src/engine/state.js');
const { runQualifying, makeWeatherPlan, CircuitSim } = await import(ROOT + '/src/engine/race.js');
const { TEAMS } = await import(ROOT + '/src/data/teams.js');
const { DecisionHub, MIN_REAL } = await import(ROOT + '/src/screens/decisions.js');
const bad = []; const stat = {};
const ev = (e) => ({ code: e, key: e === 'Enter' ? 'Enter' : e.replace('Digit', ''), preventDefault() {}, target: null });
function run(cat, speed, mode, bot, seedRound = 0, laps = 10) {
  setSettings({ decMode: mode, decMinorAuto: false });
  const st = createWorld({ playerName: 'T', category: cat, teamId: TEAMS[cat][4].id, difficulty: 'normal', seasonLength: 'short', raceLength: 'normal' });
  setState(st); st.round = seedRound;
  const tr = getTrack(cat, st.calendar[seedRound].trackId);
  const q = runQualifying(st, tr, {}, 0);
  const sim = new CircuitSim(st, tr, { grid: q.grid, setups: {}, weather: makeWeatherPlan(tr, laps, false), laps });
  sim.cars.forEach((c) => (c.auto = !c.isPlayer));
  const R = { speed, paused: false };
  const notes = []; const offered = new Set(); const tag = `${cat}/${speed}x/${mode}/${bot}`;
  const hub = new DecisionHub({ host: () => null, stack: () => null, unit: 'di gara', clock: { get speed() { return R.speed; }, set speed(v) { R.speed = v; }, get paused() { return R.paused; }, set paused(v) { R.paused = v; }, now: () => sim.time }, note: (t, x) => notes.push(t + ': ' + x) });
  sim.minReal = MIN_REAL; sim.decMode = mode === 'engineer' ? 'engineer' : 'ask';
  const sync = () => { for (const m of sim.moments) { m.seen = true; if (hub.has('m' + m.id)) continue; if (offered.has(m.id)) bad.push(`${tag}: momento ${m.id} offerto due volte`); offered.add(m.id); hub.offer({ id: 'm' + m.id, engine: true, prio: m.prio, type: m.type, title: m.title, text: m.text, options: m.options, def: m.def, ttl: m.ttl, get until() { return m.until; }, set until(v) { m.until = v; }, valid: () => (sim.moments.includes(m) ? null : 'chiusa'), resolve: (i, by) => sim.resolveMoment(m.id, i, by) }); } };
  const forced = bot === 'pit' ? {} : { nurse: 0.12, sc: 0.22, red: 0.45, rain: 0.55, dry: 0.75, issue: 0.33, vsc: 0.66 }; const done = {};
  const dt = 1 / 30; let real = 0; let guard = 0; let prevCur = null; let saved = null; const shownReal = {}; let realWait = 0;
  const me = sim.cars.find((c) => c.isPlayer); const pits = [];
  if (bot === 'pit') sim.pushMoment = () => {}; // pure pit-entry check: no other calls interfere
  while (!sim.finished && guard++ < 3e6) {
    real += dt;
    for (const [k, p] of Object.entries(forced)) if (!done[k] && sim.progress >= p) { done[k] = true; if (k === 'nurse') { me.team.car.parts.reliability = 30; me.eng = 'high'; me._nurseAsked = false; continue; } sim.forceEvent(k, { key: me.key, issue: 'brakes', level: 0.85, laps: 2 }); }
    if (!R.paused) { sim.uiSpeed = R.speed; let rem = dt * R.speed; const id0 = sim.radioId; while (rem > 0 && !sim.finished) { const d = Math.min(0.5, rem); sim.step(d); rem -= d; if (sim.radioId !== id0 && sim.moments.some((m) => !m.seen && m.prio >= 2)) break; } }
    sync(); hub.tick();
    // modal open / close bookkeeping
    if (hub.cur && !prevCur) { saved = { speed: hub.saved?.speed, paused: hub.saved?.paused }; if (mode === 'pause' && !R.paused) bad.push(`${tag}: modale aperto senza pausa`); if (mode === 'slow' && R.speed !== 1) bad.push(`${tag}: modale aperto senza rallentare (${R.speed}x)`); }
    if (!hub.cur && prevCur && saved && !hub.items.some((x) => hub.blocking(x))) { if (R.speed !== saved.speed || (R.paused !== saved.paused && bot !== 'unpause')) bad.push(`${tag}: velocità non ripristinata (${R.speed}/${R.paused} invece di ${saved.speed}/${saved.paused})`); }
    prevCur = hub.cur;
    for (const it of hub.items) if (it.shown) { shownReal[it.id] = (shownReal[it.id] || 0) + (R.paused ? 0 : dt); }
    if (R.paused) realWait += dt;
    // the player bot
    const cur = hub.cur;
    if (bot === 'answer' && cur && (cur._w = (cur._w || 0) + dt) > 1.5) { const k = cur.options.length > 1 ? (cur.id.length % cur.options.length) : 0; hub.key(ev('Digit' + (k + 1))); }
    if ((bot === 'enter' || bot === 'pit') && cur && (cur._w = (cur._w || 0) + dt) > 0.7) hub.key(ev('Enter'));
    if ((bot === 'ignore' || bot === 'cards') && cur && R.paused && (cur._w = (cur._w || 0) + dt) > 12) R.paused = false; // pause mode: the player walks away, then resumes with Space without answering
    if (bot === 'unpause' && cur && R.paused && (cur._w = (cur._w || 0) + dt) > 0.5) R.paused = false; // space while the card is open: game resumes, countdown runs
    if (bot === 'cards') { const top = hub.cards()[0]; if (top && (top._w = (top._w || 0) + dt) > 0.8) hub.key({ ...ev('KeyX'), code: 'KeyX' }); }
    // pit requests: "this lap" just after the pit entry (slips to the next lap) and "next lap" mid-lap
    if (bot === 'pit' && me.status === 'running' && me.inPit <= 0) {
      const f = me.dist - Math.floor(me.dist);
      const ask = (when, exp) => { const r = sim.requestPit(me.key, { compound: me.tyre === 'hard' ? 'medium' : 'hard', fuel: true }, when); pits.push({ exp: r.lap, n0: sim.stopsLog.length, when, want: exp }); };
      if (!me._a && me.lap === 2 && f > 0.95) { me._a = 1; ask('this', 4); }
      if (!me._b && me.lap === sim.laps - 6 && f > 0.4 && f < 0.6) { me._b = 1; ask('next', sim.laps - 4); }
      if (!me._c && me.lap === sim.laps - 3 && f > 0.3 && f < 0.5) { me._c = 1; ask('this', sim.laps - 2); }
    }
    if (realWait > 900) { bad.push(`${tag}: bloccato in pausa`); break; }
  }
  if (!sim.finished) bad.push(`${tag}: gara non finita`);
  if (sim.moments.length) bad.push(`${tag}: ${sim.moments.length} momenti aperti a fine gara`);
  if (hub.items.length) { sync(); hub.tick(); if (hub.items.length) bad.push(`${tag}: ${hub.items.length} card rimaste nel hub`); }
  const types = {};
  for (const d of sim.decisions) {
    types[d.type] = (types[d.type] || 0) + 1;
    if (d.by === 'engineer' && d.choice !== d.def && mode !== 'engineer') bad.push(`${tag}: timeout ${d.type} non ha scelto il consiglio (${d.choice} vs ${d.def})`);
    const sr = shownReal['m' + d.id];
    if (d.by === 'engineer' && mode !== 'engineer' && bot === 'ignore' && sr != null && sr < MIN_REAL * 0.9 && !d.why) bad.push(`${tag}: ${d.type} scaduta dopo ${sr.toFixed(1)}s reali`);
  }
  if (me.status === 'dnf') pits.length = 0;
  const asked = pits.length;
  // a lapped car takes the flag before the lap it was promised: that stop simply never comes
  for (let i = pits.length - 1; i >= 0; i--) if (me.lap <= pits[i].exp && !sim.stopsLog.slice(pits[i].n0).some((x) => x.key === me.key)) pits.splice(i, 1);
  for (const p of pits) { const stp = sim.stopsLog.slice(p.n0).find((x) => x.key === me.key); if (p.exp !== p.want) bad.push(`${tag}: requestPit(${p.when}) promette il giro ${p.exp} invece di ${p.want}`); if (!stp) { bad.push(`${tag}: box (${p.when}) mai eseguito`); if (process.env.DBG) console.log(me.key, sim.stopsLog.length, JSON.stringify(sim.stopsLog.slice(-5)), JSON.stringify(pits), JSON.stringify(sim.stopsLog.filter((x) => x.key === me.key)), sim.laps, sim.events.filter((e) => e.key === me.key).map((e) => e.lap + ' ' + e.text).join('\n')); } else if (stp.lap !== p.exp && !(stp.lap < p.exp && sim.events.some((e) => e.key === me.key && /anticipiamo/.test(e.text)))) { bad.push(`${tag}: box (${p.when}) al giro ${stp.lap} invece di ${p.exp}`); if (process.env.DBG) console.log(sim.events.filter((e) => e.key === me.key).map((e) => e.lap + ' ' + e.text).join('\n'), JSON.stringify(sim.decisions.map((d) => [d.lap, d.type, d.choice, d.by]))); } }
  if (bot === 'pit' && asked < 3 && me.status !== 'dnf') bad.push(`${tag}: test box incompleto (${pits.length})`);
  if (bot !== 'pit' && me.status === 'running' && !sim.decisions.some((d) => d.type === 'nurse') && mode !== 'engineer') bad.push(`${tag}: chiamata affidabilità mai arrivata`);
  for (const k of Object.keys(forced)) if (!done[k]) bad.push(`${tag}: evento ${k} non forzato`);
  stat[tag] = { dec: sim.decisions.length, types, real: Math.round(real), by: sim.decisions.reduce((a, d) => ((a[d.by] = (a[d.by] || 0) + 1), a), {}) };
}
const cats = (process.argv[2] || 'formula,endurance,junior').split(',');
for (const cat of cats) for (const speed of (process.env.SPEEDS || '1,2,4,8,16,32').split(',').map(Number)) for (const mode of (process.env.MODES || 'pause,slow').split(',')) for (const bot of (process.env.BOTS || 'ignore,answer,enter,unpause,cards,pit').split(',')) {
  if (speed < 8 && bot !== 'ignore' && bot !== 'answer' && bot !== 'pit') continue;
  try { run(cat, speed, mode, bot, speed % 3, cat === 'endurance' ? 8 : 10); } catch (e) { bad.push(`${cat}/${speed}/${mode}/${bot}: ECCEZIONE ${e.stack}`); }
}
if (cats.includes('formula')) try { run('formula', 8, 'engineer', 'ignore'); } catch (e) { bad.push('engineer: ' + e.stack); }
for (const [k, v] of Object.entries(stat)) console.log(k.padEnd(28), JSON.stringify(v));
console.log(bad.length ? 'FAIL\n  ' + [...new Set(bad)].join('\n  ') : 'decisions: ok');
if (bad.length) process.exitCode = 1;
