// "Campionato Rottami": a short championship across the Scontro Totale venues.
// Stored inside localStorage 'apexdynasty_derby' under the `champ` field (other fields such as
// money/owned/wins/best are preserved untouched).
const KEY = 'apexdynasty_derby';
export const CHAMPIONSHIP = {
  id: 'rottami', name: 'Campionato Rottami',
  events: ['cava', 'otto', 'fattoria', 'pineta', 'stadio', 'arena'],
  points: [10, 8, 6, 5, 4, 3, 2, 1],
  // extra points: 1 for each demolition, 1 for the fastest lap of the event
};
function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
function write(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export function champGet() { const c = read().champ; return c && typeof c === 'object' ? c : null; }
// start (or restart) the championship with the chosen car
export function champStart(car = 'berlina', color = null) { const p = read(); p.champ = { round: 0, car, color, points: {}, history: [], started: Date.now(), done: false }; write(p); return p.champ; }
export function champReset() { const p = read(); delete p.champ; write(p); }
// id of the next venue to race, or null when finished / not started
export function champNext() { const c = champGet(); if (!c || c.done) return null; return CHAMPIONSHIP.events[c.round] || null; }
// rows: [{ name, isPlayer, pos, kills, fastest }]
export function champRecord(venueId, rows) {
  const p = read(); const c = p.champ; if (!c || c.done) return null;
  if (CHAMPIONSHIP.events[c.round] !== venueId) return c; // not the expected round: ignore
  const got = {};
  for (const r of rows) { const pts = (CHAMPIONSHIP.points[r.pos - 1] || 0) + (r.kills || 0) + (r.fastest ? 1 : 0); c.points[r.name] = (c.points[r.name] || 0) + pts; got[r.name] = pts; }
  c.history.push({ venue: venueId, got, pos: rows.find((r) => r.isPlayer)?.pos || null });
  c.round++; if (c.round >= CHAMPIONSHIP.events.length) c.done = true;
  p.champ = c; write(p); return c;
}
