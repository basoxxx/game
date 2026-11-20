// Upgrades saves from older versions
import { getTrack, buildCalendar } from './world.js';
import { ensureProgress } from './progress.js';
import { ensureLegacy } from './legacy.js';
import { ensureDynasty } from './dynasty.js';
import { TRACKS, RALLY_STAGES } from '../data/tracks.js';

export function migrateSave(st) {
  if (!st) return st;
  const cat = st.category;
  if (cat !== 'rally') {
    const valid = new Set(TRACKS[cat].map((t) => t.id));
    const used = new Set(st.calendar.map((e) => e.trackId).filter((id) => valid.has(id)));
    const spare = TRACKS[cat].map((t) => t.id).filter((id) => !used.has(id));
    for (const ev of st.calendar) {
      if (!valid.has(ev.trackId)) { ev.trackId = spare.shift() || TRACKS[cat][0].id; if (!ev.done) ev.results = ev.results || null; }
    }
    if (st.weekend && !getTrack(cat, st.weekend.trackId)) st.weekend = null;
    if (st.weekend && !st.weekend.weather?.trackTemp) st.weekend = null;
  }
  // older calendars drew rally stage names from one shared pool ("Sardinia Coast" in Monte Carlo): rename the stages still to run
  if (cat === 'rally') for (const ev of st.calendar || []) {
    const own = RALLY_STAGES[ev.trackId]; if (!own || ev.done || !ev.stages || ev.stages.every((x) => own.includes(x.name))) continue;
    if (st.weekend && st.weekend.trackId === ev.trackId) continue; // a rally in progress keeps the names it was started with
    ev.stages.forEach((x, i) => { x.name = own[i % own.length]; });
  }
  ensureProgress(st);
  if (st.career) ensureLegacy(st);
  if (!st.quick && st.teams?.[st.playerTeam]) { try { ensureDynasty(st); } catch (e) { console.warn('dynasty migrate', e); } }
  st.version = 2;
  return st;
}
