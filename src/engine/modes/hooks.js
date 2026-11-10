// Game-mode hooks into the race engines.
// The race/rally engines are not modified: a scenario's start state is applied to the live
// simulation objects right after they are created, through their documented fields:
//   CircuitSim: cars[].{isPlayer,tyre,wear,age,damage,plan,compoundsUsed,pos,grid}, weather.plan, laps,
//               fitTyre(), addDamage(), deploySC(), progress, isSprint, log()
//   RallyEvent: crews[].{isPlayer,penalty,total,spares,damage}, stages[].{night,wet}, setRoadOrder()
// Everything is gated on state.modeRun (set only by the game modes) and wrapped in try/catch, so
// careers and the plain quick race never see a difference.
import { CircuitSim } from '../race.js';
import { RallyEvent } from '../rally.js';
import { S } from '../state.js';
import { COMPOUNDS } from '../../data/categories.js';
import { mulberry32, clamp } from '../rng.js';

let installed = false;
const run = () => S()?.modeRun || null;

export function installSimHooks() {
  if (installed) return; installed = true;
  const step0 = CircuitSim.prototype.step;
  CircuitSim.prototype.step = function (dt) {
    const m = this.state === S() ? run() : null;
    if (m?.setup && !this.isSprint) {
      if (!this._modeInit) { this._modeInit = true; try { applyCircuitStart(this, m.setup); } catch (e) { console.warn('mode start', e); } }
      try { scripted(this, m.setup); } catch (e) { console.warn('mode script', e); }
    }
    return step0.call(this, dt);
  };
  const road0 = RallyEvent.prototype.setRoadOrder;
  RallyEvent.prototype.setRoadOrder = function (...a) {
    const m = this.state === S() ? run() : null;
    if (m && !this._modeInit && this.crews) { this._modeInit = true; try { applyRallyStart(this, m); } catch (e) { console.warn('mode rally', e); } }
    return road0.apply(this, a);
  };
}

function applyCircuitStart(sim, s) {
  const mine = sim.cars.filter((c) => c.isPlayer);
  if (s.rainFrom != null || s.dryFrom != null) {
    const plan = sim.weather.plan.slice();
    for (let i = 0; i < plan.length; i++) {
      if (s.rainFrom != null && i >= s.rainFrom) plan[i] = Math.max(plan[i], s.rainLevel ?? 0.7);
      if (s.dryFrom != null && i >= s.dryFrom) plan[i] = Math.min(plan[i], 0.04);
    }
    sim.weather = { ...sim.weather, plan, isRain: plan.some((x) => x > 0.2) };
  }
  for (const c of mine) {
    if (s.myTyre && COMPOUNDS[s.myTyre] && sim.C.compounds.includes(s.myTyre)) {
      c.tyre = s.myTyre; c.compoundsUsed = new Set([s.myTyre]); c.plan = null; c.planIdx = 0;
    }
    if (s.myWear != null) { c.wear = clamp(s.myWear, 0, 0.95); c.age = Math.round(c.wear * 30); }
    if (s.myDamage) { c.damage = (c.damage || 0) + s.myDamage; }
    if (s.myFuelLow && sim.endurance) c.fuel = Math.max(1, c.fuel * 0.75);
    c.lapTarget = sim.computeLap(c);
  }
  if (s.rivalsWear != null) for (const c of sim.cars) if (!c.isPlayer) { c.wear = clamp(s.rivalsWear, 0, 0.9); c.lapTarget = sim.computeLap(c); }
  if (s.note) sim.log(`🎬 ${s.note}`, 'start', null, true);
}

function scripted(sim, s) {
  if (s.scLap != null && !sim._modeSC && !sim.sc && !sim.finished) {
    const lap = Math.floor(sim.progress * sim.laps);
    if (lap >= s.scLap) { sim._modeSC = true; sim.deploySC(); }
  }
}

function applyRallyStart(ev, m) {
  const s = m.setup?.rally || {};
  if (m.nightRally) {
    const n = ev.stages.length;
    ev.stages.forEach((st, i) => { if (i >= Math.floor(n / 2)) st.night = true; });
  }
  if (s.rallyGap != null) {
    // the rally so far: the leader 0, the player s.rallyGap seconds behind, the others spread out
    const r = mulberry32(m.setup?.seed || 7);
    const me = ev.crews.filter((c) => c.isPlayer);
    const ai = ev.crews.filter((c) => !c.isPlayer).sort((a, b) => (b.team.car.parts.engine || 70) - (a.team.car.parts.engine || 70));
    const base = s.rallyBase || 3600;
    ai.forEach((c, i) => { c.penalty = base + (i === 0 ? 0 : s.rallyGap + 2 + i * (4 + r() * 9)); });
    me.forEach((c, i) => { c.penalty = base + s.rallyGap + i * 25; });
    for (const c of ev.crews) c.total = c.penalty;
  }
  if (s.spares != null) for (const c of ev.crews) if (c.isPlayer) c.spares = s.spares;
  if (s.rallyDamage) for (const c of ev.crews) if (c.isPlayer) for (const [k, v] of Object.entries(s.rallyDamage)) c.damage[k] = clamp((c.damage[k] || 0) + v, 0, 1);
}
