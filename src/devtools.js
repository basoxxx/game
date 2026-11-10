// Debug helpers for automated tests, loaded on idle after the menu (kept out of the first paint)
import { S, saveGame } from './engine/state.js';
import { getTrack } from './engine/world.js';
import { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } from './engine/race.js';
import { RallyEvent } from './engine/rally.js';
import { applyRoundResults } from './engine/season.js';
import { applyRaceRivalry } from './engine/rivalry.js';

export function install(apex) {
  // simulate the current round with AI strategy
  apex.simRound = () => {
    const st = S(); if (st.round >= st.calendar.length) return false;
    const ev = st.calendar[st.round]; const tr = getTrack(st.category, ev.trackId);
    let res;
    if (st.category === 'rally') {
      const R = new RallyEvent(st, ev, tr, {});
      while (!R.finished()) { R.planStage({}); let g = 0; while (!R.allDone() && g++ < 1e5) { const q = R.advance(2); if (q) R.resolveDecision(q, 'b'); } R.completeStage(); if (R.isServiceAfter(R.stageIdx - 1)) R.service({}); }
      res = R.results();
    } else {
      const q = runQualifying(st, tr, {}, 0); const laps = raceLaps(st, tr);
      const sim = new CircuitSim(st, tr, { grid: q.grid, setups: {}, weather: makeWeatherPlan(tr, laps), laps });
      sim.cars.forEach((c) => (c.auto = true)); sim.runToEnd(); res = sim.results(); applyRaceRivalry(st, sim); apex.lastSim = sim;
      const pk = (q.qualiOrder || q.grid)[0]; res.pole = sim.cars.find((c) => c.key === pk)?.driverIds[0];
    }
    st.weekend = null; applyRoundResults(st, res); saveGame(); return true;
  };
  apex.ready = true;
}
