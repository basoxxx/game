// Quiz e Parole — saved progress: coins (earned by playing, no ads), cosmetic themes, the questions already
// seen (no repeats until a category is used up), options and the stats of the four games. Tiny and synchronous;
// works without storage (private windows): everything just starts fresh.
const KEY = 'baso_quiz_v1';
const fresh = () => ({
  v: 1, coins: 0, theme: 'classico', owned: ['classico'],
  seen: {},
  opts: { cats: null, diff: 0, players: 2, names: ['Giocatore 1', 'Giocatore 2', 'Giocatore 3', 'Giocatore 4'], hard: false, hmCat: 'tutte', flat: false },
  quiz: { games: 0, answered: 0, correct: 0, best: 0, survBest: 0, sfide: 0, perCat: {} },
  daily: { key: null, score: 0, res: [], streak: 0, best: 0, played: 0, lastKey: null },
  parola: { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastWinKey: null, day: null, free: null },
  hang: { played: 0, won: 0, streak: 0, best: 0 },
  ana: { played: 0, best: 0, words: 0, pangrams: 0, day: null },
});
let cache = null;
export function qzLoad() {
  if (cache) return cache;
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    const f = fresh();
    if (!d || d.v !== 1) return (cache = f);
    cache = { ...f, ...d, opts: { ...f.opts, ...d.opts }, quiz: { ...f.quiz, ...d.quiz }, daily: { ...f.daily, ...d.daily }, parola: { ...f.parola, ...d.parola }, hang: { ...f.hang, ...d.hang }, ana: { ...f.ana, ...d.ana }, seen: d.seen || {}, owned: d.owned?.length ? d.owned : f.owned };
    return cache;
  } catch { return (cache = fresh()); }
}
export function qzSave(d = cache) { cache = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
export function qzPeek() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function qzReset() { cache = null; }
export function addCoins(n) { const d = qzLoad(); d.coins = Math.max(0, Math.round(d.coins + n)); qzSave(d); return d.coins; }
