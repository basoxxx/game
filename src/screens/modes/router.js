// Routing glue for the game modes. The weekend / rally / results screens send a finished quick
// event back to 'quickrace' (or 'challenges'): when the world belongs to a game mode we send the
// player to that mode's own screen instead, and we apply the mode's rules on the way
// (championship points, realism profile, sprint weekends, scenario grid, medal recording).
import { App } from '../../app.js';
import { S, getSettings, setSettings } from '../../engine/state.js';
import { installSimHooks } from '../../engine/modes/hooks.js';
import { applyPoints, saveChamp, REALISM } from '../../engine/modes/champ.js';
import { evalTiers, load, store } from '../../engine/modes/objectives.js';
import { recordDaily } from '../../engine/modes/daily.js';

export const SCN_KEY = 'apexdynasty_mode_scenarios';
const REAL_BAK = 'apexdynasty_mode_realism_bak';
const RACE = new Set(['weekend', 'rally']);
const ROUTE = { champ: 'mode-champ', tp: 'mode-tp', scenario: 'mode-debrief', daily: 'mode-debrief' };

export function scenarioProgress() { return load(SCN_KEY, {}) || {}; }
export function recordScenario(id, out) {
  const p = scenarioProgress();
  const e = p[id] ||= { medal: -1, best: 99, tries: 0 };
  e.tries++;
  const improved = out.medal > e.medal || (out.medal === e.medal && out.best < e.best);
  if (out.medal > e.medal) e.medal = out.medal;
  if (out.best < e.best) e.best = out.best;
  store(SCN_KEY, p);
  return { entry: e, improved };
}
export function totalStars() { return Object.values(scenarioProgress()).reduce((a, e) => a + Math.max(0, (e.medal ?? -1) + 1), 0); }

// realism profile of a championship: swapped into the settings only while a race runs
function realismOn(m) {
  const prof = REALISM[m?.cfg?.realism];
  if (!prof || m.cfg.realism === 'normal') return;
  const s = getSettings();
  try { if (!localStorage.getItem(REAL_BAK)) localStorage.setItem(REAL_BAK, JSON.stringify({ failures: s.failures ?? 1, damage: s.damage ?? 1, aiAggr: s.aiAggr ?? 1 })); } catch {}
  setSettings({ failures: prof.failures, damage: prof.damage, aiAggr: prof.aiAggr });
}
export function realismOff() {
  try { const b = localStorage.getItem(REAL_BAK); if (b) { setSettings(JSON.parse(b)); localStorage.removeItem(REAL_BAK); } } catch {}
}

function onResults(st, params) {
  const m = st.modeRun;
  const ev = st.calendar[params?.idx ?? st.round - 1];
  if (!ev?.results) return;
  if (m.kind === 'champ' || m.kind === 'tp') { applyPoints(st, ev); saveChamp(st); return; }
  if ((m.kind === 'scenario' || m.kind === 'daily') && !m.outcome) {
    const o = evalTiers(m.tiers, ev.results, st.playerTeam);
    m.outcome = { medal: o.medal, met: o.met, best: o.best, gain: o.gain, worst: o.worst };
    if (m.kind === 'scenario') { m.outcome.starsBefore = totalStars(); m.outcome.improved = recordScenario(m.id, o).improved; }
    else { const r = recordDaily(m.day, o); m.outcome.first = r.first; m.outcome.entry = r.entry; }
  }
}

// after the weekend screen has rendered: sprint flag, race length, scenario grid
function afterWeekend(st) {
  const m = st.modeRun; const w = st.weekend; if (!w) return;
  let changed = false;
  if (!w._modeInit) {
    w._modeInit = true;
    if ((m.kind === 'champ' || m.kind === 'tp') && m.sprintRound && !w.sprint && w.phase !== 'race') { w.sprint = true; changed = true; }
    if (m.setup?.laps && w.laps > m.setup.laps) { w.laps = m.setup.laps; w.sprintLaps = Math.max(4, Math.round(w.laps * 0.36)); changed = true; }
  }
  const gp = m.setup?.gridPos;
  if (w.quali?.grid && gp != null && gp !== 'last' && !w._modeGrid) {
    w._modeGrid = true;
    const g = w.quali.grid; const mine = g.filter((k) => isMine(st, k));
    const rest = g.filter((k) => !mine.includes(k));
    const at = Math.max(0, Math.min(rest.length, gp - 1));
    // first car at the scenario's slot, the team-mate right behind it
    w.quali.grid = [...rest.slice(0, at), mine[0], ...rest.slice(at, at + 1), ...mine.slice(1), ...rest.slice(at + 1)].filter(Boolean);
    changed = true;
  }
  if (changed) App.refresh();
}
function isMine(st, key) {
  // grid keys are "<teamId>#<carIdx>" (see engine buildEntries)
  return String(key).split('#')[0] === st.playerTeam;
}

let installed = false;
export function installRouter() {
  if (installed) return; installed = true;
  installSimHooks();
  realismOff(); // a crashed session never leaves the championship realism in the settings
  const go0 = App.go;
  App.go = function (id, params = {}) {
    const st = S(); const m = st?.quick ? st.modeRun : null;
    const from = this.cur;
    if (m) {
      if (RACE.has(id) && (m.kind === 'champ' || m.kind === 'tp')) realismOn(m);
      if (id === 'results') { realismOff(); try { onResults(st, params); } catch (e) { console.warn('mode results', e); } }
      if ((id === 'quickrace' || id === 'challenges') && (RACE.has(from) || from === 'results') && ROUTE[m.kind]) {
        realismOff();
        if (m.kind === 'champ' || m.kind === 'tp') saveChamp(st);
        id = ROUTE[m.kind]; params = { from };
      }
    } else if (!RACE.has(id)) realismOff();
    const r = go0.call(this, id, params);
    if (m && id === 'weekend') { try { afterWeekend(st); } catch (e) { console.warn('mode weekend', e); } }
    if (m && id === 'results' && ROUTE[m.kind]) {
      const b = document.querySelector('.ph-right [data-a="done"]');
      if (b) b.firstChild.textContent = m.kind === 'champ' || m.kind === 'tp' ? 'Classifica ' : 'Esito della sfida ';
    }
    return r;
  };
}
