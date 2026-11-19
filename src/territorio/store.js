// Territorio — persistent progress (records, coins, colours, vehicles, trails, daily arena, last
// choices, local multiplayer setup). Tiny on purpose: the Baso Hub entry reads it without pulling
// in three.js or the game.
const KEY = 'sala_territorio_v1';
const DEF = {
  coins: 0, games: 0, wins: 0, kills: 0, cells: 0, best: {}, daily: {},
  mode: 'classica', map: 'prato', diff: 'normale',
  color: 'corallo', colors: ['corallo', 'mare'], vehicle: 'cubo', vehicles: ['cubo'], trail: 'liscia', trails: ['liscia'],
  mp: { n: 2, view: 'diviso', mode: 'battaglia', bots: 3, map: 'prato', controls: ['wasd', 'frecce', 'ijkl', 'numpad'], colors: ['#ff4d6d', '#2f9bff', '#7ad13a', '#ffd21f'] },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function trLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      p.best = { ...(d.best || {}) }; p.daily = { ...(d.daily || {}) }; p.mp = { ...clone(DEF.mp), ...(d.mp || {}) };
      for (const k of ['colors', 'vehicles', 'trails']) if (!Array.isArray(p[k]) || !p[k].length) p[k] = clone(DEF[k]);
      if (!p.colors.includes(p.color)) p.color = p.colors[0];
      if (!p.vehicles.includes(p.vehicle)) p.vehicle = p.vehicles[0];
      if (!p.trails.includes(p.trail)) p.trail = p.trails[0];
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function trSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const trBest = (p = trLoad()) => Math.max(0, ...Object.values(p.best || {}).map((x) => +x || 0));
export const TR_KEY = KEY;
