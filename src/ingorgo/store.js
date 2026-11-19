// Ingorgo — persistent progress. Tiny on purpose: the Baso Hub entry reads it without the game.
const KEY = 'sala_ingorgo_v1';
const DEF = {
  stars: {},            // campaign level id (c1…c60) / pack level id -> best stars
  best: {},             // level id -> fewest moves
  coins: 0, solved: 0, movesTotal: 0, hintsUsed: 0,
  paint: 'rosso', model: 'utilitaria', horn: 'classico', theme: 'giorno',
  owned: { paint: ['rosso'], model: ['utilitaria'], horn: ['classico'], theme: ['giorno'] },
  daily: null,          // { key, num, done, moves, opt, time, hints, stars }
  streak: 0, lastDaily: null,
  zen: { solved: 0, mech: 'misto', diff: 'rilassato' },
  packs: {},            // pack id -> highest level cleared
  seen: {},             // rules cards already shown (mechanic ids)
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function igLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      p.owned = { ...clone(DEF.owned), ...(d.owned || {}) };
      for (const k of Object.keys(DEF.owned)) { if (!Array.isArray(p.owned[k]) || !p.owned[k].length) p.owned[k] = clone(DEF.owned[k]); if (!p.owned[k].includes(p[k])) p[k] = p.owned[k][0]; }
      p.stars = { ...(d.stars || {}) }; p.best = { ...(d.best || {}) }; p.packs = { ...(d.packs || {}) }; p.seen = { ...(d.seen || {}) };
      p.zen = { ...DEF.zen, ...(d.zen || {}) };
      p.coins = Math.max(0, p.coins | 0);
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function igSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const IG_KEY = KEY;
// next campaign level to play (first one without stars), 1-based; TOTAL + 1 when all are cleared
export function nextLevel(p, total) { for (let n = 1; n <= total; n++) if (!p.stars[`c${n}`]) return n; return total + 1; }
export const totalStars = (p) => Object.entries(p.stars).filter(([k]) => /^c\d+$/.test(k)).reduce((a, [, v]) => a + (+v || 0), 0);
