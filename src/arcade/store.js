// Arcade Baso — persistent progress: coins, high-score tables per game, unlocked sectors/levels,
// cosmetics, the daily challenge and the runner missions. Tiny: the hub entry reads it.
const KEY = 'baso_arcade_v1';
const GAMES = ['astro', 'rimbalzo', 'corri', 'labirinto'];
const DEF = () => ({
  coins: 0, games: 0, skin: 'neon', skin2: 'brace', trail: 'scintille',
  owned: { skin: ['neon', 'brace'], trail: ['scintille'] },
  scores: { astro: [], rimbalzo: [], corri: [], labirinto: [] }, // top 10 [{ s, n, d }]
  plays: { astro: 0, rimbalzo: 0, corri: 0, labirinto: 0 },
  unlock: { astro: 0, rimbalzo: 1, labirinto: 1 }, // astro: best sector reached (0-2), rimbalzo: highest level, labirinto: highest level
  touch: { labirinto: 'swipe' },
  daily: {}, // { key, done, best }
  missions: null, // corri: [{ id, n, goal, have }]
  missionsDone: 0,
});
export function arLoad() {
  const d = DEF();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      const o = s.owned || {};
      const scores = {}, plays = {};
      for (const g of GAMES) { scores[g] = Array.isArray(s.scores?.[g]) ? s.scores[g].slice(0, 10) : []; plays[g] = s.plays?.[g] || 0; }
      return { ...d, ...s, scores, plays, unlock: { ...d.unlock, ...(s.unlock || {}) }, touch: { ...d.touch, ...(s.touch || {}) }, daily: { ...(s.daily || {}) },
        owned: { skin: [...new Set([...d.owned.skin, ...(o.skin || [])])], trail: [...new Set([...d.owned.trail, ...(o.trail || [])])] } };
    }
  } catch {}
  return d;
}
export function arSave(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} return p; }
export const best = (p, g) => p.scores[g]?.[0]?.s || 0;
// inserts a score in the top 10 and returns its rank (1-based) or 0
export function addScore(p, g, s, n = 'G1') {
  const list = p.scores[g] || (p.scores[g] = []);
  const e = { s: Math.round(s), n, d: Date.now() };
  list.push(e); list.sort((a, b) => b.s - a.s); list.length = Math.min(list.length, 10);
  return list.indexOf(e) + 1;
}
