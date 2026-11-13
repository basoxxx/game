// Small, dependency-free helpers shared by the shell (app.js) and the engine.
// Kept apart from season.js / world.js so the first paint does not pull the whole engine in;
// season.js and world.js re-export them, so existing importers keep working.
import { CATEGORIES } from '../data/categories.js';
import { TRACKS } from '../data/tracks.js';
import { mulberry32 } from './rng.js';

export const fmtM = (v) => `${v < 0 ? '-' : ''}€${Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1)}M`;

export function cat(state) { return CATEGORIES[state.category]; }
export function playerTeam(state) { return state.teams[state.playerTeam]; }

function trackLap(t) {
  const r = mulberry32(t.seed)();
  return 76 + r * 26;
}
export function getTrack(cat, id) {
  const t = TRACKS[cat].find((x) => x.id === id);
  return t ? { ...t, lap: t.lap || trackLap(t) } : null;
}
