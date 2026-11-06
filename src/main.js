import './styles/main.css';
import { App } from './app.js';
import './screens/menu.js';
import './screens/newgame.js';
import './screens/hub.js';
import './screens/info.js';
import './screens/car.js';
import './screens/team.js';
import './screens/weekend.js';
import './screens/rallyweekend.js';
import './screens/results.js';
import './screens/seasonend.js';
import './screens/quickrace.js';
import { S, saveGame } from './engine/state.js';

App.init();
App.go('menu');
window.addEventListener('beforeunload', () => { if (S()) saveGame(); });
window.__apex = { App, S };

// Debug helper (used by automated tests): simulate the current round with AI strategy
import { getTrack } from './engine/world.js';
import { runQualifying, makeWeatherPlan, raceLaps, CircuitSim } from './engine/race.js';
import { RallyEvent } from './engine/rally.js';
import { applyRoundResults } from './engine/season.js';
window.__apex.simRound = () => {
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
    sim.cars.forEach((c) => (c.auto = true)); sim.runToEnd(); res = sim.results();
    const pk = q.grid[0]; res.pole = sim.cars.find((c) => c.key === pk)?.driverIds[0];
  }
  st.weekend = null; applyRoundResults(st, res); saveGame(); return true;
};
