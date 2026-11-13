// Global game state container + persistence
export const SAVE_PREFIX = 'apexdynasty_save_';
export const SETTINGS_KEY = 'apexdynasty_settings';
export const SLOTS = [1, 2, 3, 4, 5];

export const G = { state: null };

export function setState(s) { G.state = s; }
export function S() { return G.state; }

function storage() { try { return window.localStorage; } catch { return null; } }

export function saveGame(slot = G.state?.slot) {
  if (!G.state || !slot) return false;
  if (G.state.ironman && G.state.slot && slot !== G.state.slot) slot = G.state.slot; // Ironman: one save per career, no copies
  const st = storage(); if (!st) return false;
  G.state.slot = slot;
  G.state.savedAt = Date.now();
  try {
    st.setItem(SAVE_PREFIX + slot, JSON.stringify(G.state));
    return true;
  } catch (e) { console.error(e); return false; }
}

// a parsed save must at least be a career the shell can draw (team colours, calendar): valid JSON that is
// not a game state (truncated by hand, another file, an incompatible version) would crash every screen
export function isGameState(s) {
  return !!(s && typeof s === 'object' && s.teams && s.drivers && s.teams[s.playerTeam]?.car && Array.isArray(s.calendar) && s.category);
}

export function loadGame(slot) {
  const st = storage(); if (!st) return null;
  try {
    const raw = st.getItem(SAVE_PREFIX + slot);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!isGameState(s)) { console.warn(`slot ${slot}: salvataggio non valido`); return null; }
    G.state = s; return s;
  } catch (e) { console.error(e); return null; }
}

export function deleteSave(slot) { try { storage()?.removeItem(SAVE_PREFIX + slot); } catch {} }

export function listSaves() {
  const st = storage();
  return SLOTS.map((slot) => {
    try {
      const raw = st?.getItem(SAVE_PREFIX + slot);
      if (!raw) return { slot, empty: true };
      const s = JSON.parse(raw);
      if (!isGameState(s)) return { slot, empty: true, corrupt: true };
      const team = s.teams?.[s.playerTeam];
      return { slot, empty: false, ironman: !!s.ironman, difficulty: s.difficulty, player: s.playerName, team: team?.name, colors: team?.colors, category: s.category, season: s.season, round: s.round, total: s.calendar?.length, savedAt: s.savedAt };
    } catch { return { slot, empty: true, corrupt: true }; }
  });
}

export function exportSave() {
  return new Blob([JSON.stringify(G.state)], { type: 'application/json' });
}
export function importSave(text) {
  const s = JSON.parse(text);
  if (!isGameState(s)) throw new Error('File di salvataggio non valido');
  if (s.ironman) { // an Ironman career cannot be rolled back to an older backup
    for (const k of SLOTS) { try { const o = JSON.parse(storage()?.getItem(SAVE_PREFIX + k) || 'null'); if (o?.ironman?.id === s.ironman.id && (o.savedAt || 0) > (s.savedAt || 0)) throw new Error('Carriera Ironman: esiste già un salvataggio più recente di questa carriera.'); } catch (e) { if (/Ironman/.test(e.message)) throw e; } }
  }
  G.state = s; return s;
}

const DEFAULT_SETTINGS = { sound: true, volume: 0.5, engineSound: true, raceSpeed: 8, animations: true };
export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(storage()?.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  try { storage()?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  return s;
}
