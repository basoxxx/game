// Voragine — persistent progress (records, coins, skins, trails, track XP, daily challenge). Tiny on
// purpose: the launcher reads it without pulling in three.js or the game itself.
const KEY = 'sala_voragine_v1';
const DEF = { best: {}, coins: 0, games: 0, wins: 0, skin: 'notte', owned: ['notte'], trail: 'nessuna', trails: ['nessuna'], xp: 0, daily: {}, eaten: 0, bestRadius: 0, mode: 'classica', diff: 'normale', city: 'centro' };
export function vgLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') return { ...DEF, ...d, best: { ...(d.best || {}) }, daily: { ...(d.daily || {}) }, owned: Array.isArray(d.owned) && d.owned.length ? d.owned : ['notte'], trails: Array.isArray(d.trails) && d.trails.length ? d.trails : ['nessuna'] };
  } catch {}
  return { ...DEF, best: {}, daily: {}, owned: ['notte'], trails: ['nessuna'] };
}
export function vgSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export function vgBestOverall(p = vgLoad()) { return Math.max(0, ...Object.values(p.best || {}).map((x) => +x || 0)); }
