// Rompicapo — persistent progress. Tiny on purpose: the Baso Hub entry reads it without the games.
const KEY = 'sala_rompicapo_v1';
const DEF = {
  coins: 0, earned: 0, theme: 'notte', owned: ['notte'],
  daily: null,                 // { key, done: { sudoku: {...}, unisci: {...}, ... }, bonus }
  streak: 0, bestStreak: 0, lastDaily: null, dailies: 0,
  sudoku: { played: 0, won: 0, best: {}, solved: {}, hints: 0, mistakes: 0, save: null, opts: { limit: true, auto: true, hl: true } },
  unisci: { played: 0, best: {}, maxTile: {}, goal: {}, save: {}, size: 4, moves: 0 },
  mattoncini: { played: 0, best: {}, lines: 0, quad: 0, level: 1, mode: 'maratona', tspin: 0 },
  mahjong: { played: 0, won: 0, best: {}, solved: {}, layout: 'quadrato', save: null, pairs: 0 },
  seen: {},
};
const clone = (o) => JSON.parse(JSON.stringify(o));
export function rpLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      const p = { ...clone(DEF), ...d };
      for (const g of ['sudoku', 'unisci', 'mattoncini', 'mahjong']) p[g] = { ...clone(DEF[g]), ...(d[g] || {}) };
      p.sudoku.opts = { ...DEF.sudoku.opts, ...(d.sudoku?.opts || {}) };
      if (!Array.isArray(p.owned) || !p.owned.length) p.owned = ['notte'];
      if (!p.owned.includes(p.theme)) p.theme = p.owned[0];
      p.coins = Math.max(0, p.coins | 0);
      p.seen = { ...(d.seen || {}) };
      return p;
    }
  } catch {}
  return clone(DEF);
}
export function rpSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const RP_KEY = KEY;
export function rpUpdate(fn) { const p = rpLoad(); fn(p); return rpSave(p); }
