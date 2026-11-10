// Builds stand-alone race worlds for the game modes (same recipe as the quick race: a short
// createWorld() with state.quick = true, so no finances / R&D / market ever run).
import { createWorld, buildCalendar } from '../world.js';
import { setState } from '../state.js';
import { TRACKS } from '../../data/tracks.js';
import { CATEGORIES } from '../../data/categories.js';

export function weatherValue(w) { return w === 'auto' || w == null ? undefined : w === 'mixed' ? 'mixed' : w === 'rain'; }

export function eventFor(cat, trackId, i = 0) {
  const all = buildCalendar(cat, 'full');
  const ev = JSON.parse(JSON.stringify(all.find((e) => e.trackId === trackId) || all[0]));
  ev.round = i + 1; ev.done = false; ev.results = null;
  return ev;
}

// one event: quick race, scenario, daily challenge
export function makeEventWorld({ cat, team, track, diff = 'normal', len = 'short', weather = 'auto', skip = true, grid = 'quali', modeRun = null, player = 'Ospite' }) {
  const st = createWorld({ playerName: player, category: cat, teamId: team, difficulty: diff, seasonLength: 'short', raceLength: len });
  st.quick = true; st.slot = null; st.tutorialSeen = true;
  st.forceRain = weatherValue(weather);
  st.quickGrid = cat === 'rally' ? 'quali' : grid;
  const ev = eventFor(cat, track);
  const keep = modeRun?.setup?.rally?.stagesKeep;
  if (cat === 'rally' && keep && ev.stages?.length > keep) {
    ev.stages = ev.stages.slice(-keep);
    ev.stages.forEach((s, i) => { s.power = i === ev.stages.length - 1; });
  }
  st.calendar = [ev];
  st.quickSkip = skip;
  if (modeRun) st.modeRun = modeRun;
  setState(st);
  return st;
}

export function launchScreen(cat) { return cat === 'rally' ? 'rally' : 'weekend'; }
export function trackList(cat) { return TRACKS[cat] || []; }
export function catColor(cat) { return CATEGORIES[cat]?.color || '#e5141b'; }
