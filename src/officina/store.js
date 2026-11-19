// Officina — persistence. Tiny on purpose: the Baso Hub entry reads the progress line from here without
// pulling in the rules, three.js or the game. The screen repairs the data with normalize() (core.js).
const KEY = 'sala_officina_v1';
export const OF_KEY = KEY;
export function ofRaw() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch { return null; } }
export function ofWrite(s) { try { localStorage.setItem(KEY, JSON.stringify(s, (k, v) => (k.startsWith('_') ? undefined : v))); return true; } catch { return false; } }
// hub progress line: season, best car, trophies
export function ofPeek() {
  const d = ofRaw(); if (!d) return null;
  return { season: d.season | 0 || 1, best: Math.max(d.best | 0, d.bestEver | 0, 1), trophies: (d.trophiesAll | 0) || 0, region: d.region | 0, tokens: d.tokens | 0, missionsDone: (d.missions?.list || []).filter((m) => m.done && !m.claimed).length };
}
