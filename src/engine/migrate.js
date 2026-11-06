// Upgrades saves from older versions
import { getTrack, buildCalendar } from './world.js';
import { ensureProgress } from './progress.js';
import { TRACKS } from '../data/tracks.js';

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
  ensureProgress(st);
  st.version = 2;
  return st;
}
